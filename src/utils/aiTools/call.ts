/**
 * AI 工具层：标准工具调用格式的解析 → 参数校验 → **审核** → 分发 → 回填 tool 消息。
 *
 * 审核（对齐 DSH 的 approval 流程）：
 * - 只读工具不问审核；写类工具一律先要一次审核
 * - 设置里对某个工具关掉了审核（「AI 工具」页，开启时弹过风险提示）→ 该工具直接放行
 * - 审核是**一次性**的，且绑定这次调用的确切参数：参数变了要重新审核（同 DSH 的 "this exact command once"）
 * - 审核策略 `never` → 需要审核的调用自动拒绝（同 DSH：approval prompts disabled → rejected automatically）
 * - 没有审核通道（UI 没挂 gate）→ fail closed，直接拒绝（同 DSH：without an available answerer, the request fails closed）
 * - 用户拒绝 → 回 `denied`，并明确告诉模型「不要换个参数或换个工具再试同一个操作」
 *
 * 支持模型侧三种常见形状，解析后统一成 ToolCall：
 * - OpenAI / DeepSeek function calling：{ id, type:"function", function:{ name, arguments: "<json 字符串>" } }
 * - Anthropic tool_use：              { type:"tool_use", id, name, input: { ... } }
 * - MCP / 简易调用：                   { id?, name, arguments: { ... } }
 *
 * 返回一律不抛异常：失败也回一条结构化 error 结果。
 */
import type {
  ApprovalDecision,
  ApprovalGate,
  ApprovalPolicy,
  ApprovalRequest,
  ToolErrorCode,
  ToolErrorResult,
  ToolMeta,
  ToolOutcome,
  ToolParam,
} from "./types.ts";
import { getTool } from "./registry.ts";
import { ensureChat } from "../senderInfo";

export interface ToolCall {
  /** 模型侧调用 id，回填 tool 消息时必须带回去 */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** 工具实现体（read.ts / write.ts 里注册） */
export type ToolImpl = (args: Record<string, unknown>) => ToolOutcome | Promise<ToolOutcome>;

/**
 * 已实现的工具表。没注册的工具调用一律回 not_implemented。
 * 实现文件（read.ts / write.ts）在被 import 时注册自己 —— AI 入口必须 import 它们，
 * 否则工具看着"登记了"实际全是 not_implemented。
 */
const IMPLEMENTATIONS = new Map<string, ToolImpl>();

/** 注册实现体（模块被导入时调用；重复注册以最后一次为准） */
export function registerImplementation(name: string, impl: ToolImpl): void {
  IMPLEMENTATIONS.set(name, impl);
}

/** 已实现的工具名（供自检 / 诊断查看还差哪些） */
export function implementedTools(): string[] {
  return [...IMPLEMENTATIONS.keys()];
}

/**
 * 审核前的附加校验（按工具注册，注册方式与实现体一样）。
 * 用于「参数形状合法、但语义不合法」的检查 —— 目前只有一件：文本的 MarkdownV2 解析。
 * 这类问题必须挡在审核**之前**，否则用户会白批一次卡片，模型改完再来一张
 * （同 call.ts 的顺序约定：参数不合法时不打扰用户）。
 * 返回逐条可读的问题（空数组 = 通过）。
 */
export type ToolPrecheck = (args: Record<string, unknown>) => string[] | Promise<string[]>;

const PRECHECKS = new Map<string, ToolPrecheck>();

/** 注册预校验（模块被导入时调用；重复注册以最后一次为准） */
export function registerPrecheck(name: string, check: ToolPrecheck): void {
  PRECHECKS.set(name, check);
}

// --- 审核策略与通道 ---

let approvalPolicy: ApprovalPolicy = "ask";
let approvalGate: ApprovalGate | null = null;
/** 跳过审核的工具名（设置页「AI 工具」里开的）：命中的写类调用不再弹卡片 */
let skippedTools: readonly string[] = [];

/** 设置跳过审核的工具名（每次跑 AI 轮次前按设置刷一遍） */
export function setApprovalSkip(names: readonly string[]): void {
  skippedTools = names;
}

/** 设置审核策略：ask（默认，弹卡片）/ never（需要审核的调用自动拒绝） */
export function setApprovalPolicy(policy: ApprovalPolicy): void {
  approvalPolicy = policy;
}

export function getApprovalPolicy(): ApprovalPolicy {
  return approvalPolicy;
}

/** 挂/摘审核通道；传 null = 当前没有 answerer（需要审核的调用会被 fail closed 拒绝） */
export function setApprovalGate(gate: ApprovalGate | null): void {
  approvalGate = gate;
}

/**
 * 异常 → 一句话。TDLib 的报错不是 Error，而是裸对象 `{_: "error", code, message}`（见 utils/tdlib 的 throw），
 * 直接 String() 只会得到 "[object Object]"，把真正的原因全藏了 —— 工具报错里必须带上 code 与原话。
 */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown };
    const text = typeof o.message === "string" ? o.message : JSON.stringify(e);
    return o.code === undefined ? text : `${text}（code ${String(o.code)}）`;
  }
  return String(e);
}

// --- 当前线程（论坛话题 / 频道直通消息 / 评论线程） ---

/** 这一轮用户所在线程；工具没显式传 thread_id 时用它兜底 */
export interface TurnThread {
  /** 话题 / 线程 id */
  id: number;
  /** 这些消息真正所在的会话：评论线程 = 讨论组，话题 = 当前聊天 */
  chatId: number;
}

let turnThread: TurnThread | null = null;

/** 每轮开始按当前界面刷新（null = 不在任何线程里） */
export function setTurnThread(thread: TurnThread | null): void {
  turnThread = thread;
}

/** thread_id 的默认值：只有 chat_id 正好是线程所在会话时才补，避免读别的聊天时张冠李戴 */
export function threadOf(chatId: number): number | undefined {
  return turnThread && turnThread.chatId === chatId ? turnThread.id : undefined;
}

/** 按策略与通道裁决一次写类调用 */
async function resolveApproval(meta: ToolMeta, args: Record<string, unknown>): Promise<ApprovalDecision> {
  if (!meta.needsApproval) return { granted: true };
  // 用户在设置里对这个工具关掉了审核：直接放行（开启时已弹过风险提示）
  if (skippedTools.includes(meta.name)) return { granted: true };
  if (approvalPolicy === "never") {
    return { granted: false, reason: "当前审核策略为 never：需要审核的调用一律拒绝" };
  }
  if (!approvalGate) {
    return { granted: false, reason: "当前没有可用的审核通道，操作已按 fail closed 拒绝" };
  }
  // 审核卡片要说人话：摘要里的对话 id 由 registry 换成标题，缓存没命中就先拉一次
  if (typeof args.chat_id === "number") await ensureChat(args.chat_id);
  const req: ApprovalRequest = {
    tool: meta.name,
    args,
    reason: typeof args.reason === "string" ? args.reason : "",
    risk: meta.risk ?? "raw",
    summary: meta.summary?.(args) ?? meta.name,
  };
  try {
    return await approvalGate(req);
  } catch (e) {
    return { granted: false, reason: `审核通道出错：${messageOf(e)}` };
  }
}

// --- 调用解析与校验 ---

function asObject(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** arguments 可能是 JSON 字符串（OpenAI）、对象（Anthropic / MCP）或空（无参工具） */
export function parseArgs(rawArgs: unknown): Record<string, unknown> {
  if (rawArgs === undefined || rawArgs === null || rawArgs === "") return {};
  if (typeof rawArgs === "string") {
    const parsed: unknown = JSON.parse(rawArgs);
    const obj = asObject(parsed);
    if (!obj) throw new Error("arguments 解析后不是 JSON 对象");
    return obj;
  }
  const obj = asObject(rawArgs);
  if (!obj) throw new Error("arguments 不是对象");
  return obj;
}

/** 解析模型发来的工具调用；形状不合法直接抛（由 dispatchToolCall 兜成 bad_call） */
export function parseToolCall(raw: unknown): ToolCall {
  const outer = asObject(raw);
  if (!outer) throw new Error("工具调用不是对象");
  const fn = asObject(outer.function);
  const name = typeof outer.name === "string" ? outer.name : typeof fn?.name === "string" ? fn.name : "";
  if (!name) throw new Error("工具调用缺少 name");
  // OpenAI 用 function.arguments（字符串）/ MCP 用 arguments（对象）/ Anthropic 用 input（对象）
  const rawArgs = fn && "arguments" in fn ? fn.arguments : outer.input ?? outer.arguments;
  return { id: typeof outer.id === "string" ? outer.id : "", name, args: parseArgs(rawArgs) };
}

const TYPE_OK: Record<ToolParam["type"], (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  boolean: (v) => typeof v === "boolean",
  "string[]": (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
  "number[]": (v) => Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x)),
  object: (v) => asObject(v) !== null,
};

/** 参数校验：返回逐条可读的问题（空数组 = 合法）；未声明的参数一律拒绝，防模型瞎编 */
export function validateArgs(meta: ToolMeta, args: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const key of Object.keys(args)) {
    if (!meta.params.some((p) => p.name === key)) issues.push(`未声明的参数 ${key}`);
  }
  for (const p of meta.params) {
    const value = args[p.name];
    if (value === undefined || value === null) {
      if (p.required) issues.push(`缺少必填参数 ${p.name}`);
      continue;
    }
    if (!TYPE_OK[p.type](value)) {
      issues.push(`参数 ${p.name} 期望 ${p.type}，实际 ${Array.isArray(value) ? "array" : typeof value}`);
      continue;
    }
    if (p.maxItems !== undefined && Array.isArray(value) && value.length > p.maxItems) {
      issues.push(`参数 ${p.name} 最多 ${p.maxItems} 项，实际 ${value.length} 项`);
    }
  }
  return issues;
}

function errorResult(tool: string, code: ToolErrorCode, message: string, issues?: string[]): ToolErrorResult {
  return { tool, error: { code, message, ...(issues?.length ? { issues } : {}) } };
}

/**
 * 统一入口：解析 → 校验 → 审核 → 分发。永不抛异常。
 * 返回 call（解析失败时为 null）与 outcome（结果信封或结构化错误）。
 */
export async function dispatchToolCall(raw: unknown): Promise<{ call: ToolCall | null; outcome: ToolOutcome }> {
  let call: ToolCall;
  try {
    call = parseToolCall(raw);
  } catch (e) {
    return { call: null, outcome: errorResult("", "bad_call", messageOf(e)) };
  }
  const meta = getTool(call.name);
  if (!meta) return { call, outcome: errorResult(call.name, "unknown_tool", `未知工具：${call.name}`) };

  const issues = validateArgs(meta, call.args);
  if (issues.length) {
    return { call, outcome: errorResult(call.name, "invalid_args", `参数不合法：${issues.join("；")}`, issues) };
  }

  // 预校验（语义层，可能要走 TDLib）也在审核之前：不让用户为一次注定失败的调用白批卡片
  const precheck = PRECHECKS.get(call.name);
  if (precheck) {
    let semantic: string[];
    try {
      semantic = await precheck(call.args);
    } catch (e) {
      return { call, outcome: errorResult(call.name, "internal", `预校验失败：${messageOf(e)}`) };
    }
    if (semantic.length) {
      return { call, outcome: errorResult(call.name, "invalid_args", `参数不合法：${semantic.join("；")}`, semantic) };
    }
  }

  // 审核在实现体之前：没通过就什么都不碰（也顺带省掉未实现工具的骚扰）
  const decision = await resolveApproval(meta, call.args);
  if (!decision.granted) {
    const why = decision.reason ?? "用户未同意";
    return {
      call,
      outcome: errorResult(
        call.name,
        "denied",
        `审核未通过：${why}。不要换参数、换工具或用别的路径再试同一个操作；等用户明确同意后再来。`,
      ),
    };
  }

  const impl = IMPLEMENTATIONS.get(call.name);
  if (!impl) return { call, outcome: errorResult(call.name, "not_implemented", `[aiTools] 工具未实现：${call.name}`) };

  try {
    return { call, outcome: await impl(call.args) };
  } catch (e) {
    return { call, outcome: errorResult(call.name, "internal", messageOf(e)) };
  }
}

/** 回填给模型的 tool 消息：OpenAI / DeepSeek 与 Anthropic 两种形状 */
export type ToolMessage =
  | { role: "tool"; tool_call_id: string; content: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type ToolDialect = "openai" | "anthropic";

/** 结果 → tool 消息；content 恒为字符串（结构化结果 JSON） */
export function toolMessage(call: ToolCall, outcome: ToolOutcome, dialect: ToolDialect = "openai"): ToolMessage {
  const content = JSON.stringify(outcome);
  const isError = "error" in outcome;
  return dialect === "anthropic"
    ? { type: "tool_result", tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) }
    : { role: "tool", tool_call_id: call.id, content };
}
