/**
 * 私聊 AI 接管的配置（按账号存 localStorage）。
 *
 * 只有**用户主动加进来的聊天**才会被接管：这里一条配置 = 一个被授权的私聊。
 * 群 / 频道 / 机器人 / 自己（收藏夹）在运行时还会再挡一次（见 utils/aiTakeover），
 * 这里不做过滤，只负责“记下用户的选择”。
 *
 * 字段说明：
 * - mode：imitate = 冒充本人说话；assistant = 以 AI 身份接管（不冒充）。
 * - instructions：用户自己写的补充设定（人设 / 口吻 / 禁忌），直接拼进 system prompt。
 * - style / styleLimit / styleAt：模仿模式的风格画像 —— 用户点「总结」后，模型读最近
 *   styleLimit 条对话（可选 30/50/100/200/500），提炼本人在这段对话里怎么说话。
 * - stickers / customEmojis：本人常用的贴纸与自定义表情。**和风格画像一起**由同一次
 *   「总结」统计出来（同一批消息），没有单独的记录/扫描流程。
 * - delaySec：收到对方消息后隔多久才回（模仿真人，也给对方连发几条留出合并的时间）。
 * - summary / history / historyUpTo：复用的会话 + 它头部压出来的摘要（回复前自动压，
 *   设置页的「立即压缩」是手动补一刀）。
 * - lastMessageId：已经处理到的最新一条对方消息 id（防重复回复、也防重启后翻旧账）。
 * - lastReplyAt / lastError：设置页展示运行状态用。
 */
import { reactive, watch } from "vue";
import {
  DEFAULT_STYLE_LIMIT,
  type HistoryTurn,
  type TallyItem,
  type TakeoverActivation,
  type TakeoverMode,
} from "../utils/aiTakeoverPrompt";

export type { TakeoverActivation, TakeoverMode } from "../utils/aiTakeoverPrompt";

export interface TakeoverChat {
  chatId: number;
  /** 标题快照：聊天缓存没了也认得出这是谁 */
  title: string;
  mode: TakeoverMode;
  enabled: boolean;
  instructions: string;
  delaySec: number;
  /** 模仿模式的风格画像：用户点「总结」后由模型从最近 N 条对话里总结出来 */
  style: string;
  /** 风格画像取材条数（用户选的「最近 N 条」） */
  styleLimit: number;
  /** 风格画像的生成时间（毫秒；0 = 还没总结过） */
  styleAt: number;
  /** 较早对话的压缩摘要（会话头部挤出窗口的部分） */
  summary: string;
  /**
   * 复用的会话：对方的发言 = user，本人（含 AI 代发、手动回复）= assistant。
   * 每次回复只把新消息接在后面，不再重新拉聊天记录、重新拼 transcript。
   */
  history: HistoryTurn[];
  /** 已经折进会话的最新一条 TDLib 消息 id（防止同一消息被记两次） */
  historyUpTo: number;
  /** 本人常用贴纸（和风格画像一起，由「总结」从同一批消息里统计） */
  stickers: TallyItem[];
  /** 本人常用自定义表情（同上） */
  customEmojis: TallyItem[];
  /** 已处理到的最新对方消息 id */
  lastMessageId: number;
  /** 最近一次真正发出回复的时间（毫秒） */
  lastReplyAt: number;
  /** 最近一次失败原因（空 = 正常） */
  lastError: string;
}

export interface TakeoverAccountState {
  enabled: boolean;
  /** 什么情况下才真的自动回复（见 activationAllows） */
  activation: TakeoverActivation;
  /** activation = idle 时的「多久没操作算闲置」 */
  idleMinutes: number;
  /** 接管专用的供应商 / 模型；providerId 为空 = 跟随 AI 设置的模型 */
  providerId: string | null;
  model: string;
  chats: TakeoverChat[];
}

const STORAGE_KEY = "tdgram-ai-takeover";
/** 默认隔 6 秒回：对方连发几句会被合并成一次回复 */
export const DEFAULT_DELAY_SEC = 6;
/** 延迟上限（秒） */
export const MAX_DELAY_SEC = 120;
/** 「闲置多久才接管」的可选分钟数 */
export const IDLE_MINUTES = [1, 5, 15, 30, 60] as const;
/** 默认闲置 15 分钟 */
export const DEFAULT_IDLE_MINUTES = 15;
/** 落盘时会话最多保留的条目数（压缩失败时的兜底，正常由压缩保持在 HISTORY_KEEP 附近） */
const MAX_HISTORY_STORED = 120;

export const aiTakeover = reactive<{
  /** 总开关（关掉 = 所有聊天都暂停，配置保留） */
  enabled: boolean;
  /** 什么情况下才真的自动回复：always / background / idle */
  activation: TakeoverActivation;
  /** activation = idle 时的闲置门槛（分钟） */
  idleMinutes: number;
  /** 接管专用的供应商 / 模型（空 = 跟随 AI 设置） */
  providerId: string | null;
  model: string;
  chats: TakeoverChat[];
  /** 当前加载的账号 key；'' = 还没加载 */
  account: string;
  loaded: boolean;
}>({
  enabled: true,
  activation: "always",
  idleMinutes: DEFAULT_IDLE_MINUTES,
  providerId: null,
  model: "",
  chats: [],
  account: "",
  loaded: false,
});

/** 账号没就绪时的桶名（与 Rust 侧 account_key 的兜底一致） */
function accountKey(accountId: string | number | null | undefined): string {
  const s = String(accountId ?? "").trim();
  return s || "default";
}

function allStates(): Record<string, TakeoverAccountState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, TakeoverAccountState>;
  } catch (e) {
    console.error("[aiTakeover] 读取配置失败，按没有配置处理:", e);
    return {};
  }
}

/** 一条配置补默认值 + 收边界（旧版本 / 手改过的 JSON 都要能读） */
function normalizeChat(raw: Partial<TakeoverChat> & { chatId?: unknown }): TakeoverChat | null {
  const chatId = Number(raw.chatId);
  if (!Number.isFinite(chatId) || chatId === 0) return null;
  const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const styleLimit = Math.min(500, Math.max(10, num(raw.styleLimit, DEFAULT_STYLE_LIMIT)));
  return {
    chatId,
    title: String(raw.title ?? ""),
    mode: raw.mode === "assistant" ? "assistant" : "imitate",
    enabled: raw.enabled !== false,
    instructions: String(raw.instructions ?? ""),
    delaySec: Math.min(MAX_DELAY_SEC, Math.max(0, num(raw.delaySec, DEFAULT_DELAY_SEC))),
    style: String(raw.style ?? ""),
    styleLimit,
    styleAt: Math.max(0, num(raw.styleAt)),
    summary: String(raw.summary ?? ""),
    history: normalizeHistory(raw.history),
    historyUpTo: Math.max(0, num(raw.historyUpTo)),
    stickers: normalizeTally(raw.stickers),
    customEmojis: normalizeTally(raw.customEmojis),
    lastMessageId: Math.max(0, num(raw.lastMessageId)),
    lastReplyAt: Math.max(0, num(raw.lastReplyAt)),
    lastError: String(raw.lastError ?? ""),
  };
}

/** 会话历史：只留合法角色与字符串正文，并裁掉超长尾巴（压缩失败也不会撑爆 localStorage） */
function normalizeHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryTurn[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const turn = v as Partial<HistoryTurn>;
    const text = String(turn.text ?? "");
    if (!text) continue;
    out.push({ role: turn.role === "assistant" ? "assistant" : "user", text });
  }
  return out.slice(-MAX_HISTORY_STORED);
}

/** 常用贴纸 / 自定义表情统计：只留结构合法的条目（旧版本没有这些字段 → 空） */
function normalizeTally(raw: unknown): TallyItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TallyItem[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const item = v as Partial<TallyItem>;
    const id = String(item.id ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      emoji: String(item.emoji ?? ""),
      count: Math.max(1, Number(item.count) || 1),
    });
  }
  return out;
}

/** 读某个账号的配置进内存（账号没就绪 / 读不到 = 空配置） */
export function loadTakeover(accountId: string | number | null | undefined): void {
  const key = accountKey(accountId);
  if (aiTakeover.loaded && aiTakeover.account === key) return;
  const state = allStates()[key];
  aiTakeover.enabled = state?.enabled !== false;
  aiTakeover.activation =
    state?.activation === "background" || state?.activation === "idle" ? state.activation : "always";
  aiTakeover.idleMinutes = Math.min(1440, Math.max(1, Number(state?.idleMinutes) || DEFAULT_IDLE_MINUTES));
  aiTakeover.providerId = state?.providerId ? String(state.providerId) : null;
  aiTakeover.model = String(state?.model ?? "");
  aiTakeover.chats = Array.isArray(state?.chats)
    ? state.chats.map(normalizeChat).filter((c): c is TakeoverChat => c !== null)
    : [];
  aiTakeover.account = key;
  aiTakeover.loaded = true;
}

function persist(): void {
  if (!aiTakeover.loaded || !aiTakeover.account) return;
  try {
    const all = allStates();
    all[aiTakeover.account] = {
      enabled: aiTakeover.enabled,
      activation: aiTakeover.activation,
      idleMinutes: aiTakeover.idleMinutes,
      providerId: aiTakeover.providerId,
      model: aiTakeover.model,
      chats: aiTakeover.chats.map((c) => ({
        ...c,
        stickers: c.stickers.map((s) => ({ ...s })),
        customEmojis: c.customEmojis.map((s) => ({ ...s })),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.error("[aiTakeover] 保存配置失败:", e);
  }
}

// 界面直接改字段（v-model）也要落盘；未加载时绝不写，免得把别人的桶清空
watch(() => aiTakeover, persist, { deep: true });

/** 这个聊天被用户选中接管了吗（总开关不在这里判断） */
export function takeoverFor(chatId: number): TakeoverChat | undefined {
  return aiTakeover.chats.find((c) => c.chatId === chatId);
}

/** 这个聊天现在真的在被接管吗（选中 + 开关都开着），给聊天页的横幅用 */
export function takeoverActiveFor(chatId: number): TakeoverChat | undefined {
  const cfg = takeoverFor(chatId);
  return cfg && cfg.enabled && aiTakeover.enabled ? cfg : undefined;
}

/** 加入接管列表（已在列表里就只更新标题 / 模式） */
export function upsertTakeover(patch: {
  chatId: number;
  title?: string;
  mode?: TakeoverMode;
}): TakeoverChat {
  const existing = takeoverFor(patch.chatId);
  if (existing) {
    if (patch.title) existing.title = patch.title;
    if (patch.mode) existing.mode = patch.mode;
    return existing;
  }
  const cfg = normalizeChat({
    chatId: patch.chatId,
    title: patch.title ?? "",
    mode: patch.mode ?? "imitate",
    enabled: true,
  });
  if (!cfg) throw new Error(`chatId 不合法：${patch.chatId}`);
  // 新加的放最前：列表里一眼能看见（卡片默认折叠，不会撑开一大段）
  aiTakeover.chats = [cfg, ...aiTakeover.chats];
  return cfg;
}

/** 移出接管列表（摘要 / 进度 / 风格画像一起丢掉） */
export function removeTakeover(chatId: number): void {
  aiTakeover.chats = aiTakeover.chats.filter((c) => c.chatId !== chatId);
}

/** 改一条配置（运行时的进度也走这里，保证落盘） */
export function updateTakeover(chatId: number, patch: Partial<Omit<TakeoverChat, "chatId">>): void {
  const cfg = takeoverFor(chatId);
  if (!cfg) return;
  Object.assign(cfg, patch);
}

/** 丢掉这个聊天的压缩摘要（会话本身不动） */
export function clearSummary(chatId: number): void {
  updateTakeover(chatId, { summary: "" });
}

/** 丢掉学到的风格画像（连同同一次总结出来的常用贴纸 / 自定义表情） */
export function clearStyle(chatId: number): void {
  updateTakeover(chatId, { style: "", styleAt: 0, stickers: [], customEmojis: [] });
}

/** 接管专用的模型；`providerId = null` = 跟随 AI 设置里的模型 */
export function setTakeoverModel(providerId: string | null, model: string): void {
  aiTakeover.providerId = providerId || null;
  aiTakeover.model = providerId ? model : "";
}
