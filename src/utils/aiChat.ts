/**
 * AI 对话的 agent 循环（前端）：组装 prompt → 流式调用模型（ai_chat_stream）→ 工具调用经
 * dispatchToolCall（审核在它里面）→ 结果回填 → 再调，直到模型不再要工具或到上限。
 *
 * 流式：Rust 一边把 llmsdk 的 StreamPart 推过来（这里只用来画界面：逐字更新文本 / 思考、
 * 工具参数增量），一边把拼好的整段回复当返回值给回来 —— **业务数据一律用返回值**，
 * 不靠 IPC 消息顺序（漏一个工具调用就是灾难）。流式完全起不来就退回一次性 ai_chat。
 *
 * 历史按**对话**（conversation id）对账并落盘（history.json，见 store/aiConversations），
 * 所以切对话 / 切聊天 / 重启进程都不会丢上下文。纯逻辑（截断、历史→活动条）在 aiChatHistory.ts。
 */
import { Channel, invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import type { AiModel, AiProvider } from "../store/aiProviderRules";
import { aiConversations, currentAiAccount, loadHistory, recordAiUsage, saveHistory } from "../store/aiConversations";
import { settings } from "../store/settings";
import { dispatchToolCall, isErrorReply, messageOf, replyText, setApprovalSkip, setTurnThread, type TurnThread } from "./aiTools/call.ts";
import { MARKDOWN_V2_GUIDE } from "./aiTools/format.ts";
import { TOOLSETS, toolsSchema } from "./aiTools/schema.ts";
import { setSearchContext } from "./aiTools/search.ts";
import type { ToolReply } from "./aiTools/types.ts";
import { trimHistory, type AiActivityItem, type ChatToolCall, type ChatWireMessage } from "./aiChatHistory.ts";
// 工具实现在被导入时登记自己；AI 入口必须导入它们，否则工具全是 not_implemented
import "./aiTools/local.ts";
import "./aiTools/read.ts";
import "./aiTools/viewport.ts";
import "./aiTools/write.ts";

/**
 * 开发版热更新的坑：注册表（utils/aiTools/call.ts 的 IMPLEMENTATIONS）是模块级 Map，
 * 改这几个文件时 Vite 会把 call.ts 换成新实例（空表），而实现模块不重新执行 ——
 * 于是模型拿着 schema 去调，全返回「工具未实现」。生产包只加载一次，不会遇到。
 * 这里一改就整页重载，别让「半注册」状态留在正在聊的会话里。
 */
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
  import.meta.hot.accept(
    ["./aiTools/call.ts", "./aiTools/read.ts", "./aiTools/write.ts", "./aiTools/local.ts", "./aiTools/viewport.ts"],
    () => window.location.reload(),
  );
}

export type { AiActivityItem, ChatToolCall, ChatWireMessage } from "./aiChatHistory.ts";

/** ponytail: 单轮最多调用模型 8 次（防跑飞）；可按需调大 */
const MAX_STEPS = 8;

/**
 * 托管 web_search 只对**确定支持**的供应商开（与 Rust `hosted_web_search_supported` 同一套判断）：
 * - OpenAI 自家 Responses、Anthropic ✓
 * - MiMo 的 /responses 遇到 web_search 直接 400（整轮对话失败）、DeepSeek 收下但不执行、
 *   Gemini 兼容层没有 /responses、GLM / Kimi / MiniMax 没验证过 → 都不挂，
 *   要搜索就让用户在「AI 工具」里配搜索接口（客户端调用失败只影响那一次搜索）。
 */
function providerHostedSearch(provider: AiProvider): boolean {
  if (provider.format === "anthropic") return true;
  if (provider.format !== "openai-responses") return false;
  try {
    return new URL(provider.endpoint).host === "api.openai.com";
  } catch {
    return false;
  }
}

/**
 * DeepSeek 的搜索在独立 Tools API（`{endpoint}/tools/search`）里：Responses 的托管 web_search
 * 它接受但**不执行**（实测没有 web_search_call，模型直接说查不到），所以必须走客户端工具。
 */
const usesToolsApiSearch = (provider: AiProvider) => provider.endpoint.includes("deepseek.com");

/**
 * 搜索走客户端工具吗：配了独立搜索接口，或当前供应商只认自己的 Tools API（DeepSeek）。
 * 是 → 前端发 web_search(query) 的函数工具、Rust 去执行；否 → 交给供应商的托管工具。
 */
const clientSearch = (provider: AiProvider) =>
  !!settings.ai.search.endpoint.trim() || usesToolsApiSearch(provider);

/**
 * 当前聊天里 AI 的写权限（只有群 / 频道才传；私聊不传 = 不限制）。
 * 没权限的写工具**根本不下发**：模型不会瞎试，用户也不用为一次注定失败的调用批审核卡片。
 */
export interface AiTurnPermissions {
  /** 可删除他人的消息（群 / 频道管理员权限） */
  deleteMessages: boolean;
  /** 可封禁 / 限制成员 */
  restrictMembers: boolean;
  /** 可在此发言（false = 只读会话：AI 只读 / 总结，要发就发到别的聊天） */
  canPost: boolean;
}

/** 发给模型的工具名：设置里关掉的不发（缺省 = 启用）；web_search 只在客户端搜索模式下发 */
function enabledTools(provider: AiProvider, perms?: AiTurnPermissions): string[] {
  return TOOLSETS.all.filter(
    (n) =>
      settings.ai.tools[n] !== false &&
      (n !== "web_search" || clientSearch(provider)) &&
      (n !== "delete_message" || perms?.deleteMessages !== false) &&
      (n !== "ban_member" || perms?.restrictMembers !== false),
  );
}

/** 供应商侧托管搜索是否挂上：工具没关、不走客户端搜索、且这家确定支持托管搜索 */
function providerSearch(provider: AiProvider): boolean {
  return settings.ai.tools.web_search !== false && !clientSearch(provider) && providerHostedSearch(provider);
}

/** 这一轮到底有没有搜索能力（写进 system prompt 用）；没有就别让模型以为自己能搜 */
function webSearchAvailable(provider: AiProvider): boolean {
  if (settings.ai.tools.web_search === false) return false;
  return clientSearch(provider) || providerHostedSearch(provider);
}

export interface AiActivitySink {
  add(entry: AiActivityItem): void;
  update(id: string, patch: Partial<AiActivityItem>): void;
  /** 丢掉条目：流式中途失败重试时，把这次尝试画了一半的内容撤掉（可选，预览场景可以没有） */
  remove?(ids: readonly string[]): void;
}

/** 轮数用尽仍未结束：调用方据此提示用户（不是错误，历史已保留） */
export class AiTurnLimitError extends Error {}

/** 与 Rust ChatUsage / ChatReply 对齐；null = 接口没返回该项 */
interface ChatUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
}

interface ChatReply {
  text: string;
  reasoning: string;
  toolCalls: ChatToolCall[];
  usage: ChatUsage;
}

/** 流式增量块：只声明画界面用得到的字段（其余由 Rust 侧累积，走返回值） */
interface StreamPart {
  type: string;
  /** 增量文本；工具参数分段的 id 与工具调用 id 相同 */
  delta?: string;
  id?: string;
  toolName?: string;
}

/** 一次模型调用的结果；每个工具调用带上它在活动条里的条目 id（结果回填时更新同一条） */
interface ModelCall {
  text: string;
  reasoning: string;
  toolCalls: { call: ChatToolCall; entryId: string }[];
  usage: ChatUsage;
}

/** 活动条条目 id：时间戳 + 自增，避免同毫秒内重名 */
let seq = 0;
const nextId = () => `${Date.now()}-${seq++}`;

/** 已加载的历史：键是对话 id（同一聊天的多个对话各自一条上下文） */
const histories = new Map<string, ChatWireMessage[]>();

/** 该对话的历史：内存里已有就直接用，否则从 history.json 读回来（读不到 = 空） */
async function ensureHistory(chatId: number, conversationId: string): Promise<ChatWireMessage[]> {
  const cached = histories.get(conversationId);
  if (cached) return cached;
  const loaded = await loadHistory(chatId, conversationId);
  histories.set(conversationId, loaded);
  return loaded;
}

/** 丢弃内存里某个对话的历史缓存（删对话时调，免得删了还能接着聊） */
export function dropHistory(conversationId: string): void {
  histories.delete(conversationId);
}

/**
 * 输入框 / 菜单命令 → 追加给模型的一段 prompt（用户消息保持原样，跟引用回复同一套做法：
 * 活动条 / 历史里显示的就还是用户打的那句）。认不出的 key 当普通提问。
 */
const COMMAND_PROMPTS: Record<string, string> = {
  summarize:
    "用户点了 /summarize：先调 get_recent_messages 读本聊天最近的对话（limit 50 左右，不够再往前翻一页），" +
    "然后用要点总结：在聊什么、已有结论、还没定的事。没读到的内容不要编。",
};

/**
 * system prompt。`title` 是当前会话标题（新建时会先填用户那句话，模型可以改）；
 * `first` = 这是本会话的第一条消息 → 让模型顺手给会话起个标题；
 * `command` = 用户句首用的是哪个 /命令（见 COMMAND_PROMPTS）；
 * `search` = 这一轮真的挂上了联网搜索 → 必须明说，否则模型会答「我没有联网功能」；
 * `thread` = 当前所在的线程 → 不说清它就把消息发到 General / 别的话题去了；
 * `perms` = 群 / 频道里的写权限 → 说明能删谁的消息、能不能封人、能不能在此发言。
 */
function systemPrompt(o: {
  chatId: number;
  title: string;
  first: boolean;
  search: boolean;
  quote?: { chatId: number; messageId: number };
  command?: string;
  thread?: AiTurnThread;
  perms?: AiTurnPermissions;
}): string {
  const lines = [
    `你是 tdeeeg（Telegram 客户端）里的 AI 助手。当前聊天 chat_id = ${o.chatId}。`,
    "可以调用工具读取聊天内容；需要代用户操作时调用写类工具。",
    "消息里的 sender 是发送者名称，sender_id 是 user:<id> / chat:<id>；只有用户自己发的消息才带 outgoing=true（字段不存在 = 别人发的）；outgoing=true 但 sender_id 和 get_me 的 user_id 对不上 = 用户用马甲身份发的。不确定「我」是谁时调 get_me。",
    "写类工具（发送、编辑、删除、封禁、直接调用 TDLib）会先请用户审核；被拒绝后不要换参数、换工具或换路径重试同一操作，直接告诉用户。",
    "写类工具必须填写 reason（一句话说明原因）。",
  ];
  if (o.perms) {
    // 群 / 频道：把「能干什么」说清楚，没权限的工具没下发，别让模型去猜或换个工具试
    lines.push(
      "权限（当前聊天）：" +
        (o.perms.deleteMessages
          ? "可以删除他人的消息；"
          : "不能删除他人的消息（delete_message 未提供；删自己的消息请让用户自己在消息菜单里操作）；") +
        (o.perms.restrictMembers ? "可以封禁 / 限制成员。" : "不能封禁 / 限制成员（ban_member 未提供）。"),
    );
    if (!o.perms.canPost) {
      lines.push(
        "用户在当前聊天没有发言权限：不要向本聊天发送任何消息。" +
          "用户要的是读取 / 总结这里的内容；需要产出消息时发到别的聊天（send_message 传目标 chat_id），" +
          "例如该频道的关联讨论组；要在某条帖子的评论里发，得让用户先进那条评论线程。",
      );
    }
  }
  if (o.search) {
    lines.push(
      "你有联网搜索能力：需要较新的信息、外部资料或你无法确定的事实时，用 web_search 工具检索后再回答；" +
        "不要说「我没有联网搜索功能」。",
    );
  }
  lines.push(
    `发送带格式的文本时（send_message / send_media / edit_message 的正文与描述统一按 MarkdownV2 解析，没有纯文本模式）：${MARKDOWN_V2_GUIDE}`,
    `当前会话标题：「${o.title}」。`,
  );
  if (o.thread) {
    // 线程 id 与「消息真正的落脚点」都要给：评论线程在讨论组，话题就在当前聊天
    const what =
      o.thread.kind === "dm"
        ? "频道直通消息（与某人的私信话题）"
        : o.thread.kind === "comment"
          ? "频道帖子的评论线程"
          : "群组论坛话题";
    lines.push(
      `用户现在在${what}里：thread_id = ${o.thread.id}。` +
        (o.thread.chatId === o.chatId ? "" : `这条线程的消息实际在 chat_id = ${o.thread.chatId}（讨论组），读写都用这个 chat_id。`) +
        "只在这个会话里用它：读历史带 thread_id（get_recent_messages），发送带同一个 thread_id（send_message / send_media）—— 不带会落到别的话题或 General；" +
        "操作其他会话时不要传 thread_id。",
    );
  } else {
    lines.push(
      "当前不在线程里（不是论坛话题、频道私信，也不是评论线程）：" +
        "读历史、发送都不要传 thread_id，直接针对整个会话。",
    );
  }
  if (o.quote) {
    lines.push(
      `The user quoted a message: chat_id=${o.quote.chatId}, message_id=${o.quote.messageId}. ` +
        "Call get_message to read it before answering; don't page through get_recent_messages to find it.",
    );
  }
  const hint = o.command ? COMMAND_PROMPTS[o.command] : '';
  if (hint) lines.push(hint);
  if (o.first) {
    lines.push(
      "这是本会话的第一条消息：先调用 set_conversation_title 起一个简短标题" +
        "（不超过 12 个字，概括这次要做什么；现在的标题是直接把用户的话截断来的，太长就换掉），再回答用户。",
    );
  }
  return lines.join("\n");
}

/** 当前线程（沿用工具层 TurnThread，含 kind：forum / dm / comment，决定 prompt 措辞） */
export type AiTurnThread = TurnThread;

export interface AiTurnOptions {
  chatId: number;
  /** 当前所在的线程（论坛话题 / 频道直通消息 / 评论线程）：进 prompt，也给工具当默认 thread_id */
  thread?: AiTurnThread;
  /**
   * 当前聊天里 AI 的写权限（群 / 频道才有限制）：影响下发的工具与 prompt 里的权限说明。
   * 不传 = 私聊 / 无所谓（全部工具照给）。
   */
  perms?: AiTurnPermissions;
  /** 当前会话 id：历史按它对账、落盘（切会话不会串上下文） */
  conversationId: string;
  /** 该会话的标题（进 prompt 用；模型改了会从 store 现读） */
  title: string;
  text: string;
  /**
   * 本轮用户引用的消息（AI 输入框的「回复」）：只给 id，正文让模型自己 get_message 取。
   * 走 system prompt —— 用户消息保持原样，活动条 / 历史里显示的就是输入框里那句话。
   */
  quote?: { chatId: number; messageId: number };
  /** 用户句首的 /命令 key（/ 菜单里列的那项）：作为额外一段 prompt 追加进 system prompt */
  command?: string;
  /** 随这条提问一起发给模型的图片（本机路径，Rust 侧读盘转多模态；可空） */
  images?: string[];
  provider: AiProvider;
  model: AiModel;
  /** 思考等级键：low | medium | high | xhigh；空 = provider 默认 */
  effort: string | null;
  sink: AiActivitySink;
  signal: AbortSignal;
}

/** 历史不过 IPC：Rust 按 账号 + 会话 id 读落盘的 history，拼在 messages（只含 system）后面 */
const historyScope = (o: AiTurnOptions) => ({
  accountId: currentAiAccount(),
  chatId: o.chatId,
  conversationId: o.conversationId,
});

/** 一次性请求（老接口 / 流式不可用时的兜底）：活动条在这里一次性补齐条目 */
async function callOnce(o: AiTurnOptions, messages: ChatWireMessage[], tools: unknown[]): Promise<ModelCall> {
  const reply = await invoke<ChatReply>("ai_chat", {
    providerId: o.provider.id,
    model: o.model.id,
    messages,
    ...historyScope(o),
    tools,
    effort: o.effort,
    maxOutputTokens: o.model.maxOutput,
    webSearch: providerSearch(o.provider),
  });
  if (reply.reasoning) o.sink.add({ id: nextId(), kind: "thinking", text: reply.reasoning, status: "ok" });
  if (reply.text) o.sink.add({ id: nextId(), kind: "output", text: reply.text, status: "ok" });
  const toolCalls = reply.toolCalls.map((call) => {
    const entryId = nextId();
    o.sink.add({
      id: entryId,
      kind: "tool",
      text: call.name,
      input: JSON.stringify(call.arguments, null, 2),
      status: "running",
    });
    return { call, entryId };
  });
  return { text: reply.text, reasoning: reply.reasoning, toolCalls, usage: reply.usage };
}

/** 异常 → 给用户看的一句话（活动条里展示失败原因；TDLib 的报错对象也要能读出来） */
const errText = messageOf;

/**
 * 流式断流的重试上限：**已经收到内容**之后才失败（网络抖动）就重试这么多次，每次从头重来。
 * 首次就失败（一个字都没收到）= 配置 / 参数错，重试没用：仍退回 callOnce，不让功能退化。
 */
const MAX_STREAM_RETRIES = 5;

/** 流式请求 id 自增：停止时用它在 Rust 侧定位那次请求（见 ai_chat_cancel） */
let streamSeq = 0;
/** 正在跑的流式请求 id（一轮只跑一个） */
let activeStreamId: string | null = null;

/**
 * 停止：通知 Rust 真正中断当前流式请求。前端 signal.abort 只停界面，请求本身会在后端跑完 ——
 * 所以点停止后除了 abort，还必须调这个。找不到 id = 已经结束，忽略。
 */
export function cancelAiStream(): void {
  if (!activeStreamId) return;
  const id = activeStreamId;
  activeStreamId = null;
  void invoke("ai_chat_cancel", { requestId: id }).catch(() => {});
}

/**
 * 一次模型调用：流式为主。增量块只用来画界面，最终结果用命令的返回值。
 * 中途断流会重试（最多 MAX_STREAM_RETRIES 次），半截内容先撤掉再重画，不跟重试输出叠一起。
 */
async function callModel(o: AiTurnOptions, messages: ChatWireMessage[], tools: unknown[]): Promise<ModelCall> {
  let reply: ChatReply | null = null;
  /** 界面上的实时文本 / 思考（每次尝试各自累加，重试从头来） */
  let liveText = "";
  let liveReason = "";
  /** 文本 / 思考条目的 id（第一次收到增量时才建条目） */
  let textId = "";
  let thinkId = "";
  /** 流式工具参数：分段 id（= 工具调用 id）→ 活动条条目 id + 已收参数片段 */
  const toolEntry = new Map<string, { entryId: string; args: string }>();
  /** 这次尝试加进活动条的条目 id：中途失败要整批撤掉 */
  let added: string[] = [];

  for (let attempt = 0; reply === null; attempt++) {
    liveText = "";
    liveReason = "";
    textId = "";
    thinkId = "";
    toolEntry.clear();
    added = [];
    let received = false;

    const channel = new Channel<StreamPart>();
    channel.onmessage = (p) => {
      received = true;
      switch (p.type) {
        case "text-delta":
          liveText += p.delta ?? "";
          if (!textId) {
            textId = nextId();
            added.push(textId);
            o.sink.add({ id: textId, kind: "output", text: liveText, status: "running" });
          } else {
            o.sink.update(textId, { text: liveText });
          }
          break;
        case "reasoning-delta":
          liveReason += p.delta ?? "";
          if (!thinkId) {
            thinkId = nextId();
            added.push(thinkId);
            o.sink.add({ id: thinkId, kind: "thinking", text: liveReason, status: "running" });
          } else {
            o.sink.update(thinkId, { text: liveReason });
          }
          break;
        case "tool-input-start": {
          const entryId = nextId();
          toolEntry.set(p.id ?? "", { entryId, args: "" });
          added.push(entryId);
          o.sink.add({ id: entryId, kind: "tool", text: p.toolName ?? "", input: "", status: "running" });
          break;
        }
        case "tool-input-delta": {
          const cur = toolEntry.get(p.id ?? "");
          if (cur) {
            cur.args += p.delta ?? "";
            o.sink.update(cur.entryId, { input: cur.args });
          }
          break;
        }
        // finish / 工具调用全量块不在这里拼：那些用返回值
        default:
          break;
      }
    };

    const requestId = `ai-${++streamSeq}`;
    activeStreamId = requestId;
    try {
      reply = await invoke<ChatReply>("ai_chat_stream", {
        providerId: o.provider.id,
        model: o.model.id,
        messages,
        ...historyScope(o),
        tools,
        effort: o.effort,
        maxOutputTokens: o.model.maxOutput,
        webSearch: providerSearch(o.provider),
        requestId,
        onEvent: channel,
      });
    } catch (e) {
      // 用户按了停止：不重试
      if (o.signal.aborted) throw e;
      // 首次尝试一个字都没收到：不重试，退回一次性请求
      if (!received && attempt === 0) {
        console.warn("[aiChat] 流式不可用，退回一次性请求:", e);
        return callOnce(o, messages, tools);
      }
      if (attempt >= MAX_STREAM_RETRIES) throw e;
      // 半截内容已经画在活动条上了：撤掉再重试，否则重试的整段会跟它叠在一起
      o.sink.remove?.(added);
      // 重试的原因写进对话里，别只丢控制台
      o.sink.add({
        id: nextId(),
        kind: "output",
        status: "error",
        text: i18n.global.t("aiActivity.retry", { n: attempt + 1, max: MAX_STREAM_RETRIES, reason: errText(e) }),
      });
      console.warn(`[aiChat] 流式中途失败，重试第 ${attempt + 1}/${MAX_STREAM_RETRIES} 次:`, e);
    } finally {
      // 这一轮请求结束（正常 / 停止 / 失败）：别再让停止点到下一次尝试的 id 上
      if (activeStreamId === requestId) activeStreamId = null;
    }
  }
  if (!reply) throw new Error("[aiChat] 流式请求没有返回结果");

  // 供应商没给增量（只回了整段）时补上条目，别让回复在活动条里凭空消失
  if (textId) {
    o.sink.update(textId, { text: reply.text, status: "ok" });
  } else if (reply.text) {
    o.sink.add({ id: nextId(), kind: "output", text: reply.text, status: "ok" });
  }
  if (thinkId) {
    o.sink.update(thinkId, { text: reply.reasoning, status: "ok" });
  } else if (reply.reasoning) {
    o.sink.add({ id: nextId(), kind: "thinking", text: reply.reasoning, status: "ok" });
  }

  const toolCalls = reply.toolCalls.map((call) => {
    const streamed = toolEntry.get(call.id);
    const entryId = streamed?.entryId ?? nextId();
    if (!streamed) o.sink.add({ id: entryId, kind: "tool", text: call.name, input: "", status: "running" });
    // 流式期间看到的是参数片段，这里补成解析后的完整参数（审核前必须是真参数）
    o.sink.update(entryId, { text: call.name, input: JSON.stringify(call.arguments, null, 2) });
    return { call, entryId };
  });
  return { text: reply.text, reasoning: reply.reasoning, toolCalls, usage: reply.usage };
}

/**
 * 跑一轮对话直到模型给出不带工具调用的回复（或被停止）。返回最后一段正文。
 * 停止（signal.abort）不抛错：未完成的工具调用会回填「用户已停止」，历史保持可续聊。
 */
export async function runAiTurn(o: AiTurnOptions): Promise<string> {
  const history = await ensureHistory(o.chatId, o.conversationId);
  if (o.signal.aborted) return "";
  // 本会话的第一条消息（新建会话时标题先用用户那句话兜底，模型可以改）
  const first = history.length === 0;
  history.push({ role: "user", text: o.text, attachments: o.images?.length ? o.images : undefined });
  // 提问也进活动条：会话里得看得见这句是问什么（与历史回铺时的样子一致）
  o.sink.add({ id: nextId(), kind: "user", text: o.text, status: "ok" });

  const tools = toolsSchema(enabledTools(o.provider, o.perms));
  let finalText = "";

  // 设置里按工具关掉的审核、以及客户端搜索要用的「这轮是哪个供应商」——每轮现刷一遍
  setApprovalSkip(settings.ai.skipApproval);
  setSearchContext({ providerId: o.provider.id, model: o.model.id });
  // 当前线程：模型忘了带 thread_id 时由工具兜底（写错线程的消息用户是能看见的）
  setTurnThread(o.thread ?? null);

  // 每轮之后落盘一次：中途被停止 / 崩了，下次进来还能接着聊。
  // 发请求前也要落盘：Rust 直接从库里读历史，本轮的用户消息得先写进去。
  const persist = async () => {
    trimHistory(history);
    await saveHistory(o.chatId, o.conversationId, history);
  };
  await persist();

  for (let step = 0; step < MAX_STEPS; step++) {
    if (o.signal.aborted) break;
    // 标题每轮现读：模型上一轮可能刚改过（改了就别再催它改）
    const title = aiConversations.list.find((c) => c.id === o.conversationId)?.title ?? o.title;
    // 只发 system：历史由 Rust 从落盘记录里取（见 historyScope）
    const system: ChatWireMessage[] = [{ role: "system", text: systemPrompt({
      chatId: o.chatId,
      title,
      first: first && step === 0,
      search: webSearchAvailable(o.provider),
      quote: o.quote,
      command: o.command,
      thread: o.thread,
      perms: o.perms,
    }) }];
    const called = await callModel(o, system, tools);
    // 已停止：这次调用被取消（Rust 返回空回复），不算一次记账、也不写进历史
    if (o.signal.aborted) break;
    // 每次模型调用记一次账（含工具轮），不是每次发送记一次；
    // 接口没返回 usage 就用 prompt / 回复原文本地估算，次数同样 +1（见 store recordAiUsage）
    await recordAiUsage(o.chatId, o.conversationId, {
      ...called.usage,
      contextLength: o.model.contextLength,
      promptText: JSON.stringify([...system, ...history]),
      completionText: called.text + called.reasoning,
    });

    // 供应商侧执行的调用（web_search）：结果已在同一次响应里 —— 不 dispatch，也不进历史
    // （回传时 Anthropic 要求 server_tool_use 紧跟结果块，缺了下一轮直接 400）
    const clientCalls: ModelCall["toolCalls"] = [];
    for (const t of called.toolCalls) {
      if (t.call.providerExecuted) o.sink.update(t.entryId, { status: "ok" });
      else clientCalls.push(t);
    }
    history.push({
      role: "assistant",
      text: called.text,
      reasoning: called.reasoning,
      toolCalls: clientCalls.map((t) => t.call),
    });
    finalText = called.text;
    if (!clientCalls.length) {
      await persist();
      return finalText;
    }

    // 每个调用都必须回填结果（哪怕已停止），否则下一轮接口会报缺 tool 结果
    for (const { call, entryId } of clientCalls) {
      const outcome: ToolReply = o.signal.aborted
        ? { tool: call.name, error: { code: "internal", message: "用户已停止，未执行" } }
        : (await dispatchToolCall(call)).outcome;
      const content = replyText(outcome);
      o.sink.update(entryId, { status: isErrorReply(outcome) ? "error" : "ok", output: content });
      history.push({ role: "tool", toolCallId: call.id, toolName: call.name, text: content });
    }
    await persist();
    if (o.signal.aborted) break;
  }

  await persist();
  // 循环里只有「已停止」会 break，走到这里又没停 = 轮数用尽
  if (!o.signal.aborted) throw new AiTurnLimitError(`tool loop exceeded ${MAX_STEPS} steps`);
  return finalText;
}
