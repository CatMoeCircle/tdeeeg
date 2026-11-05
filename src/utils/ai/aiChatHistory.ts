/**
 * AI 对话历史的**纯逻辑**（不 import Tauri / vue / i18n，可单独跑自检，见 scripts/checkAiTools.ts）。
 *
 * - ChatWireMessage：过边界的消息形状，与 Rust `ai_chat::ChatMessage` 一一对应（camelCase），
 *   既是发给模型的 prompt，也是落盘 history.json 的内容；
 * - trimHistory：超窗策略 = 丢最老的（便宜），摘要压缩等真撞墙再说；
 * - historyToActivity：落盘历史 → 活动条条目，重新进入对话时把上次的来回铺回输入框顶部。
 */

/** 工具调用（与 Rust ChatToolCall 一致）：arguments 为 JSON 对象 */
export interface ChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** 供应商侧执行（如 web_search）：结果已在响应里，不用前端跑工具、也不进历史 */
  providerExecuted?: boolean;
}

/** 与 Rust ChatMessage 对齐（camelCase） */
export interface ChatWireMessage {
  role: "system" | "user" | "assistant" | "tool";
  text?: string;
  reasoning?: string;
  toolCalls?: ChatToolCall[];
  toolCallId?: string;
  toolName?: string;
  /** user 消息附带的图片：本机绝对路径（落盘也只存路径，Rust 每次请求读盘转多模态） */
  attachments?: string[];
  /** assistant 这一轮思考了多久（毫秒）：只给界面留「已思考 X」，不发给模型 */
  thoughtMs?: number;
}

/** 活动条的一条（与 AiActivityStrip 的 AiActivityEntry 结构兼容） */
export interface AiActivityItem {
  id: string;
  /** user=用户自己发的话；thinking=思考；output=模型输出；tool=工具调用 */
  kind: "user" | "thinking" | "output" | "tool";
  text: string;
  input?: string;
  output?: string;
  status?: "running" | "ok" | "error";
  /** 思考条目专用的耗时（毫秒）：列表里显示「已思考 1.2s」 */
  thoughtMs?: number;
}

/** ponytail: 历史按条数截断，不按 token；超窗摘要等真撞墙再加 */
export const MAX_HISTORY = 60;

/**
 * 超窗策略：只留最近 MAX_HISTORY 条，且从第一条 user 开始。
 * 从 user 开始是硬要求：tool 结果脱离它的 tool_calls，接口会直接 400。
 */
export function trimHistory(history: ChatWireMessage[]): void {
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  const first = history.findIndex((m) => m.role === "user");
  if (first > 0) history.splice(0, first);
}

/** tool 消息正文是结果 JSON；带 error 键 = 这次调用失败（含审核被拒） */
function isErrorOutcome(text: string | undefined): boolean {
  if (!text) return false;
  try {
    const v: unknown = JSON.parse(text);
    return !!v && typeof v === "object" && "error" in (v as Record<string, unknown>);
  } catch {
    return false;
  }
}

/**
 * 落盘历史 → 活动条条目：用户提问 / 思考 / 输出 / 工具各归各位，
 * 工具结果按 toolCallId 贴回那次调用。system 不铺（那是每轮现拼的提示词）。
 */
export function historyToActivity(history: ChatWireMessage[]): AiActivityItem[] {
  const out: AiActivityItem[] = [];
  const byCall = new Map<string, AiActivityItem>();
  history.forEach((m, i) => {
    if (m.role === "system") return;
    // 用户自己发的话也要看得见：会话里得知道这句是问什么
    if (m.role === "user") {
      // 纯图片消息（read_image 自动附上的）没有文本：显示附件文件名，别留一条空白
      const text = m.text || (m.attachments ?? []).map((p) => p.split(/[\\/]/).pop() || p).join("、");
      out.push({ id: `h${i}-u`, kind: "user", text, status: "ok" });
      return;
    }
    if (m.reasoning)
      out.push({ id: `h${i}-r`, kind: "thinking", text: m.reasoning, status: "ok", thoughtMs: m.thoughtMs });
    if (m.role === "assistant" && m.text) out.push({ id: `h${i}-t`, kind: "output", text: m.text, status: "ok" });
    for (const c of m.toolCalls ?? []) {
      const item: AiActivityItem = {
        id: `h${i}-${c.id}`,
        kind: "tool",
        text: c.name,
        input: JSON.stringify(c.arguments, null, 2),
        status: "running",
      };
      out.push(item);
      byCall.set(c.id, item);
    }
    if (m.role === "tool" && m.toolCallId) {
      // 结果可能先于 toolCalls 恢复（历史被截断）：找不到就单独补一条，别丢信息
      const item = byCall.get(m.toolCallId) ?? { id: `h${i}-o`, kind: "tool" as const, text: m.toolName ?? "" };
      if (!byCall.has(m.toolCallId)) out.push(item);
      item.output = m.text;
      item.status = isErrorOutcome(m.text) ? "error" : "ok";
    }
  });
  return out;
}
