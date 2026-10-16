import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { ChatWireMessage } from "../utils/aiChatHistory";

/**
 * AI 会话（对话）管理：按账号 → 按 chat_id 分组，一个 chat 一组对话。
 *
 * 数据落在 Rust 后端（见 src-tauri/src/ai_conversations.rs），目录结构对齐 DSH：
 * `ai_conversations/<账号>/<chat_id>/conversation-<uuid>/metadata.json`。
 * 这里只做内存视图 + 调用后端，不自己拼路径。
 *
 * 会话管理只做新建 / 打开 / 重命名 / 删除（不提供消息查看），但**上下文历史要跨进程保留**：
 * 同一个对话目录下另有 history.json，由 agent 每轮之后覆盖写（入口见 loadHistory / saveHistory）。
 *
 * 用量：`requests` 是请求次数（每次模型调用算一次，含工具轮），`input/outputTokens` 是累计，
 * `cachedTokens` 是命中缓存的输入，`lastInputTokens` = 当前上下文占用（最近一次请求的输入），
 * `contextLength` = 模型上下文窗口。
 */

/** 单次请求累计出来的用量（字段与 Rust 的 ConversationUsage 一一对应） */
export interface ConversationUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  /** 最近一次请求的输入 token = 当前上下文占用 */
  lastInputTokens: number;
  lastOutputTokens: number;
  /** 模型上下文窗口；0 = 未知（算不出百分比） */
  contextLength: number;
  lastAt: number;
}

/** 一个对话的元数据；`chatId` 是归属维度 */
export interface AiConversation {
  id: string;
  chatId: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** 该 chat 当前选中的对话 */
  active: boolean;
  usage: ConversationUsage;
}

export function emptyUsage(): ConversationUsage {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    lastInputTokens: 0,
    lastOutputTokens: 0,
    contextLength: 0,
    lastAt: 0,
  };
}

/** 账号 id：Rust 端按它分目录；没有登录信息时退化成 default */
export const aiConversations = reactive<{
  /** 当前聊天（groupChatId）的对话列表 */
  list: AiConversation[];
  /** 列表归属的 chat_id；0 = 未加载 */
  chatId: number;
  loaded: boolean;
  loading: boolean;
}>({
  list: [],
  chatId: 0,
  loaded: false,
  loading: false,
});

/** 账号 id：由调用方（聊天页 / 设置页）注入，空 = 后端走 default 目录 */
let accountId = "";
export function setAiConversationsAccount(id: string | number | null | undefined) {
  const next = id === null || id === undefined ? "" : String(id);
  if (next === accountId) return;
  accountId = next;
  // 换账号：已加载的列表是上一个账号的，作废（下一次 ensure 会重新拉）
  aiConversations.list = [];
  aiConversations.chatId = 0;
  aiConversations.loaded = false;
}

/** 当前账号 id（给调用方判断「账号还没就绪」用；空字符串 = 还没拿到） */
export function currentAiAccount(): string {
  return accountId;
}

/**
 * 该 chat 当前选中的会话（没有就是 null）。
 * 归属不匹配一律当没有：列表是异步拉的，切聊天后旧列表可能还没被换掉。
 *
 * 没有任何会话被标成当前时（旧后端不发这个标记 / 旧数据），**退回最近更新的那一个**：
 * 后端返回的列表本来就按 updated_at 倒序，最近用过的那条就是该接着聊的。
 * 不这样兜底的话，发消息时「当前会话」算不出来 → 每次都新建一个会话（踩过这个坑）。
 */
export function activeConversation(chatId?: number): AiConversation | null {
  if (chatId !== undefined && aiConversations.chatId !== chatId) return null;
  return aiConversations.list.find((c) => c.active) ?? aiConversations.list[0] ?? null;
}

/**
 * 拉取请求的序号：同一时刻可能有两次拉取（进聊天时 chatId / 账号两个 watcher 各拉一次），
 * 只有最后一次的结果能落地 —— 否则先发后到的旧结果会把列表清掉，看起来像「没有对话」。
 */
let loadSeq = 0;

/**
 * 本地刚改过列表（新建 / 打开 / 改名 / 删除 / 清空）时调一次：之前发出的拉取结果就算过期了。
 * 不调的话，先发后到的旧列表会把这次改动盖掉 —— 表现是「刚建的对话不见了」「删了又回来」。
 */
function invalidateLoads(): void {
  loadSeq++;
}

/** 拉取某个聊天的对话列表；已加载过同一个 chat 且不强制时直接返回缓存 */
export async function loadConversations(chatId: number, force = false): Promise<AiConversation[]> {
  if (!chatId) return [];
  if (!force && aiConversations.loaded && aiConversations.chatId === chatId) return aiConversations.list;
  // 先把归属切过去 + 清空列表：读 store 的人（底部状态行 / 弹窗 / activeConversation）
  // 一律只信「当前聊天」的那一份，不等异步返回，避免短暂显示上一个聊天的对话。
  const seq = ++loadSeq;
  aiConversations.chatId = chatId;
  aiConversations.list = [];
  aiConversations.loading = true;
  try {
    const list = await invoke<AiConversation[]>("ai_conversation_list", { accountId, chatId });
    // 期间又发了新的拉取（切聊天 / 换账号）：这是过期结果，丢掉
    if (seq !== loadSeq) return list;
    aiConversations.list = list;
    aiConversations.loaded = true;
    return list;
  } catch (e) {
    console.error("[aiConversations] 加载失败:", e);
    return [];
  } finally {
    if (seq === loadSeq) aiConversations.loading = false;
  }
}

/** 账号下全部对话（AI 配置页的总管理入口用），按更新时间倒序 */
export async function loadAllConversations(): Promise<AiConversation[]> {
  try {
    return await invoke<AiConversation[]>("ai_conversation_list_all", { accountId });
  } catch (e) {
    console.error("[aiConversations] 加载全部失败:", e);
    return [];
  }
}

/**
 * 新建对话并设为当前；`title` 由调用方按界面语言本地化。
 * 旧列表里的 active 必须一起清掉：后端只认一个当前对话，
 * 不清理就会在弹窗里看到两行都标着「当前」。
 */
export async function createConversation(chatId: number, title: string): Promise<AiConversation | null> {
  try {
    const c = await invoke<AiConversation>("ai_conversation_create", { accountId, chatId, title });
    invalidateLoads();
    for (const x of aiConversations.list) x.active = false;
    aiConversations.list = [c, ...aiConversations.list.filter((x) => x.id !== c.id)];
    aiConversations.chatId = chatId;
    aiConversations.loaded = true;
    return c;
  } catch (e) {
    console.error("[aiConversations] 新建失败:", e);
    return null;
  }
}

/** 打开（选中）某个对话 */
export async function openConversation(chatId: number, id: string): Promise<void> {
  await invoke("ai_conversation_set_active", { accountId, chatId, id });
  invalidateLoads();
  for (const c of aiConversations.list) c.active = c.id === id;
}

/**
 * 合并后端返回的会话到列表里。**`active` 以前端现有的为准**：后端返回的那份是从磁盘读的
 * 派生值（写盘时被清成 false），直接盖上去会把「当前会话」标记抹掉，
 * 底部用量、历史回铺就全断了。
 */
function mergeConversation(saved: AiConversation): void {
  const i = aiConversations.list.findIndex((c) => c.id === saved.id);
  if (i < 0) return;
  aiConversations.list[i] = { ...aiConversations.list[i], ...saved, active: aiConversations.list[i].active };
}

/** 重命名 */
export async function renameConversation(chatId: number, id: string, title: string): Promise<void> {
  const saved = await invoke<AiConversation>("ai_conversation_rename", { accountId, chatId, id, title });
  invalidateLoads();
  mergeConversation(saved);
}

/** 删除；后端会把当前选中项自动改成剩下的第一个，这里按返回值重拉一次保持一致 */
export async function deleteConversation(chatId: number, id: string): Promise<void> {
  await invoke("ai_conversation_delete", { accountId, chatId, id });
  invalidateLoads();
  const wasActive = aiConversations.list.find((c) => c.id === id)?.active;
  aiConversations.list = aiConversations.list.filter((c) => c.id !== id);
  if (wasActive) await loadConversations(chatId, true);
}

/** 清空某个聊天的全部对话；返回删掉的数量 */
export async function clearConversations(chatId: number): Promise<number> {
  const n = await invoke<number>("ai_conversation_clear_chat", { accountId, chatId });
  invalidateLoads();
  aiConversations.list = [];
  aiConversations.chatId = chatId;
  aiConversations.loaded = true;
  return n;
}

/**
 * 读某个对话的落盘历史（没有 = 空数组）。失败不抛：读不到历史只等于「没有上下文」，
 * 不该让发送直接失败。
 */
export async function loadHistory(chatId: number, id: string): Promise<ChatWireMessage[]> {
  if (!chatId || !id) return [];
  try {
    return await invoke<ChatWireMessage[]>("ai_conversation_history", { accountId, chatId, id });
  } catch (e) {
    console.error("[aiConversations] 读历史失败:", e);
    return [];
  }
}

/** 覆盖写某个对话的历史（agent 每轮之后调）。写失败只记日志：下一次落盘会再试一次。 */
export async function saveHistory(chatId: number, id: string, messages: ChatWireMessage[]): Promise<void> {
  if (!chatId || !id) return;
  try {
    await invoke("ai_conversation_save_history", { accountId, chatId, id, messages });
  } catch (e) {
    console.error("[aiConversations] 写历史失败:", e);
  }
}

/**
 * 记一次请求的用量。`null` = 该接口没返回这一项，后端保留原值。
 * 接口返回 usage 时传真实值；没返回时用 estimateTokens 本地估算后也传进来，UI 不区分来源。
 */
export async function recordUsage(  chatId: number,
  id: string,
  usage: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedTokens?: number | null;
    cacheWriteTokens?: number | null;
    contextLength?: number | null;
  },
): Promise<AiConversation | null> {
  try {
    const saved = await invoke<AiConversation>("ai_conversation_usage", {
      accountId,
      chatId,
      id,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      cachedTokens: usage.cachedTokens ?? null,
      cacheWriteTokens: usage.cacheWriteTokens ?? null,
      contextLength: usage.contextLength ?? null,
    });
    mergeConversation(saved);
    return saved;
  } catch (e) {
    console.error("[aiConversations] 记用量失败:", e);
    return null;
  }
}

/**
 * 接口没返回 usage 时的本地估算：CJK 按 1 字符 1 token、其余按 4 字符 1 token。
 * 规则与后端 `estimate_tokens` 一致（后端只存数，不做启发式判断）。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (isCjk(c)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

/** CJK 及全角标点（估算里按 1 字符 1 token 算的那一批） */
function isCjk(c: number): boolean {
  return (
    (c >= 0x2e80 && c <= 0x9fff) || // 部首扩展 ~ CJK 统一表意
    (c >= 0xac00 && c <= 0xd7af) || // 谚文
    (c >= 0xf900 && c <= 0xfaff) || // 兼容表意
    (c >= 0xff00 && c <= 0xffef) || // 全角
    (c >= 0x3000 && c <= 0x303f) || // CJK 标点
    (c >= 0x20000 && c <= 0x2ffff) // 扩展 B+
  );
}

/** 输入框底部那行状态：上下文的占用百分比 + 输入 / 输出 / 缓存的 token */
export interface ContextStatus {
  /** 已用上下文比例（0~1）；null = 窗口未知，算不出 */
  percent: number | null;
  used: number;
  limit: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requests: number;
}

/** 单个对话的上下文状态；没有对话 / 没有窗口时相应字段为 null */
export function contextStatus(c: AiConversation | null): ContextStatus | null {
  if (!c) return null;
  const u = c.usage;
  const limit = u.contextLength || 0;
  const used = u.lastInputTokens || 0;
  return {
    percent: limit > 0 ? Math.min(1, used / limit) : null,
    used,
    limit,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cachedTokens: u.cachedTokens,
    requests: u.requests,
  };
}

/**
 * 把一次请求的用量记到**指定会话**上（发送管线接进来时调这一个就够）。
 * 接口返回 usage 用真实值；没返回就把 `prompt` / `completion` 原文传进来本地估算。
 * 记录后底部状态行（上下文百分比 / 输入输出 / 缓存）自动跟着更新。
 *
 * `id` 必须由调用方给出（agent 循环手里就有当前会话 id）：**这里绝不自己建会话**。
 * 以前按「当前选中的会话」找目标，列表没加载 / 正被重拉时会找不到 → 每次都新建一个,
 * 于是「一个请求一个会话」。会话只有两个来源：聊天里发第一条消息，或会话管理里点新建。
 */
export async function recordAiUsage(
  chatId: number,
  id: string,
  usage: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedTokens?: number | null;
    cacheWriteTokens?: number | null;
    contextLength?: number | null;
    /** 接口没返回 usage 时用来估算的原文 */
    promptText?: string;
    completionText?: string;
  },
): Promise<AiConversation | null> {
  if (!chatId || !id) return null;
  const estimated =
    usage.inputTokens == null && usage.promptText != null
      ? estimateTokens(usage.promptText)
      : null;
  const estimatedOut =
    usage.outputTokens == null && usage.completionText != null
      ? estimateTokens(usage.completionText)
      : null;
  return recordUsage(chatId, id, {
    ...usage,
    inputTokens: usage.inputTokens ?? estimated,
    outputTokens: usage.outputTokens ?? estimatedOut,
  });
}

/** 把 token 数折成界面上的短写法：128000 → 128K，1500000 → 1.5M */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
