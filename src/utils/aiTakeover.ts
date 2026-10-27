/**
 * 私聊 AI 接管运行时（前端）。
 *
 * **一个聊天 = 一个长期复用的会话**（存在 store 的 `history` 里，按角色存 user / assistant）：
 * - 第一次接管这个聊天时，从最近聊天记录垫一次上下文（只拉这一回）；
 * - 之后对方发来的消息直接从 updateNewMessage 收进会话，不再重新拉聊天记录、不重新拼 transcript；
 * - 本人手动回的、AI 代发的也都折进同一段会话，模型每次只看到「接着上文」的消息列表；
 * - 会话超过 HISTORY_KEEP 条时，把最老的一段压成摘要（摘要进 system prompt）。
 *
 * 链路：updateNewMessage → 在接管列表里吗 → 防抖（真人节奏）→ 新消息进会话 → 压缩 → system + 会话 →
 *       ai_complete → 把回复当作本人发出去（并记回会话）。
 *
 * 边界（**有意只做这些**，见用户需求）：
 * - 只接管**私聊**（chatTypePrivate），且必须是用户逐个加进接管列表的聊天；
 *   群 / 频道 / 机器人 / 已注销用户 / 收藏夹 / 秘密聊天一律不接。
 * - 只回**新消息**：离线期间补播的旧消息（超过 MAX_MESSAGE_AGE_SEC）不补回，避免开机就轰炸对方。
 * - 回复不经过 AI 工具层（不经审核 / 不用 send_message 工具）：接管开关本身就是用户授权，
 *   模型只产出一段正文，由这里直接发。要改行为请改 prompt，不要塞工具进来。
 */
import { invoke } from "@tauri-apps/api/core";
import { watch } from "vue";
import type { formattedText, message, user } from "tdlib-types";
import { aiTakeover, loadTakeover, takeoverFor, updateTakeover } from "../store/aiTakeover";
import { useAccountsStore } from "../store/accounts";
import { aiProviderReady, aiProviders, loadAiProviders } from "../store/aiConfig";
import type { AiModel, AiProvider } from "../store/aiProviderRules";
import { settings } from "../store/settings";
import { usePresenceStore } from "../store/presence";
import { onTdlibUpdate, type TdlibUpdate } from "../store/tdlibBus";
import { useUserStore } from "../store/user";
import {
  COMPRESS_BATCH,
  HISTORY_KEEP,
  RECENT_LIMIT,
  SUMMARY_MAX_TOKENS,
  STYLE_MAX_TOKENS,
  activationAllows,
  compressSystemPrompt,
  compressUserPromptLines,
  contentPlaceholder,
  historyLines,
  isReplyableContent,
  mergeTally,
  parseReply,
  promptHistory,
  shouldCompress,
  styleSystemPrompt,
  styleUserPrompt,
  tidyStyle,
  tidySummary,
  takeoverSystemPrompt,
  type EmojiEntity,
  type HistoryTurn,
  type TranscriptMessage,
  type UsageItem,
  type StickerKind,
} from "./aiTakeoverPrompt";
import { messageOf } from "./aiTools/call";
import { getMessagePlainText } from "./messageText";
import { ensureChat, ensureUser, getReactiveChat, getReactiveUser } from "./senderInfo";
import { tdlibSend } from "./tdlib";

/** 消息超过这个年龄就不回了（秒）：离线补播 / 应用刚启动时的一堆旧消息不该被补答 */
const MAX_MESSAGE_AGE_SEC = 300;
/** 「接管时机」不满足时的重试间隔：条件满足（切后台 / 闲置够久）后最多这么久就回 */
const ACTIVATION_RETRY_MS = 5_000;
/** 为了等接管时机最多攒多久（秒）：等不到就放弃这几条，别把几小时前的消息补回出去 */
const MAX_ACTIVATION_WAIT_SEC = 2 * 60 * 60;
/** 对方一直连发时，最多等这么久就必须回（秒表从第一条开始算） */
const MAX_WAIT_MS = 25_000;
/** 发出去的一段正文的 token 上限（聊天回复不需要更长） */
const SEND_MAX_TOKENS = 800;
/** 10 分钟内最多回几条：两个都是 AI 在接管时不会无限对刷（真人也发不了这么快） */
const RATE_WINDOW_MS = 10 * 60_000;
const MAX_REPLIES_PER_WINDOW = 20;

interface PendingReply {
  timer: number;
  /** 这条聊天第一波消息到达的时间：连发时用来看「最多等多久」 */
  firstAt: number;
}

/** chat_id → 正在等待的防抖定时器 */
const pending = new Map<number, PendingReply>();
/** chat_id → 还没折进会话的对方新消息（来自 update，不回头翻聊天记录） */
const incomingBuffer = new Map<number, message[]>();
/** 正在生成回复的聊天（同一聊天绝不并发两条回复） */
const running = new Set<number>();
/** 正在发送（自己刚发出去的消息不算「本人手动回复」） */
const sending = new Set<number>();
/** 生成期间又有新消息进来：这一轮结束后立刻再来一轮 */
const queued = new Set<number>();
/** chat_id → 最近发送回复的时间戳（限速用） */
const replyTimes = new Map<number, number[]>();
/** 会话里的条目数兜底上限（压缩失败时也不能无限长） */
const MAX_HISTORY = 120;

/** 限速：这个聊天 10 分钟内回得太多就不再回（两个 AI 互相接管时不会无限对刷） */
function overRateLimit(chatId: number): boolean {
  const now = Date.now();
  const recent = (replyTimes.get(chatId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  replyTimes.set(chatId, recent);
  return recent.length >= MAX_REPLIES_PER_WINDOW;
}

function noteReply(chatId: number): void {
  const list = replyTimes.get(chatId) ?? [];
  list.push(Date.now());
  replyTimes.set(chatId, list);
}

let initialized = false;

/** 用户显示名：姓名优先，其次 @用户名，再退回调用方给的兜底 */
function displayName(u: user | null | undefined, fallback: string): string {
  if (!u) return fallback;
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  if (name) return name;
  return u.usernames?.active_usernames?.[0] || fallback;
}

/** 我自己（拿 user id 用来排除自己 / 收藏夹） */
async function myUser(): Promise<user | null> {
  const store = useUserStore();
  if (!store.userProfile) await store.fetchUser();
  return store.userProfile ?? null;
}

/**
 * 这个聊天能不能接管：必须是和真实用户的私聊。
 * 机器人 / 已注销 / 支持账号 / 自己（收藏夹）都不接 —— 聊天页加错了也在这里兜住。
 */
async function privatePartner(chatId: number): Promise<user | null> {
  const me = await myUser();
  await ensureChat(chatId);
  const chat = getReactiveChat(chatId);
  if (!chat || chat.type?._ !== "chatTypePrivate") return null;
  const userId = chat.type.user_id;
  if (!userId || userId === me?.id) return null;
  await ensureUser(userId);
  const partner = getReactiveUser(userId);
  if (!partner || partner.type?._ !== "userTypeRegular" || partner.is_support) return null;
  return partner;
}

/** 读一段聊天记录（newest-first，TDLib 单页最多 100 条） */
async function fetchHistory(chatId: number, limit: number, fromId = 0): Promise<message[]> {
  const res = await tdlibSend({
    _: "getChatHistory",
    chat_id: chatId,
    from_message_id: fromId,
    offset: 0,
    limit: Math.min(100, Math.max(1, limit)),
  });
  return (res.messages ?? []).filter((m): m is message => !!m);
}

/** 连续翻页读到最近 N 条（总结风格画像时 N 可能大于单页上限 100） */
async function fetchRecentMessages(chatId: number, limit: number): Promise<message[]> {
  const out: message[] = [];
  const seen = new Set<number>();
  let from = 0;
  while (out.length < limit) {
    const page = await fetchHistory(chatId, Math.min(100, limit - out.length), from);
    if (!page.length) break;
    for (const m of page) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    const oldest = page[page.length - 1]?.id;
    if (!oldest || oldest === from) break;
    from = oldest;
  }
  return out;
}

/** TDLib 消息 → prompt 用的精简记录（只在「总结风格」时用一次） */
function toTranscript(m: message, partnerName: string, selfName: string): TranscriptMessage {
  const plain = getMessagePlainText(m).trim();
  return {
    id: m.id,
    date: m.date,
    outgoing: !!m.is_outgoing,
    sender: m.is_outgoing ? selfName : partnerName,
    text: plain || contentPlaceholder(m.content?._ ?? ""),
  };
}

/** 消息 → 会话里那一条文本（没有正文时用 [图片] / [贴纸 😂] 这类占位） */
function messageTextOf(m: message): string {
  const plain = getMessagePlainText(m).trim();
  if (plain) return plain;
  const c = m.content;
  if (c?._ === "messageSticker") {
    return c.sticker.emoji ? `[贴纸 ${c.sticker.emoji}]` : "[贴纸]";
  }
  return contentPlaceholder(c?._ ?? "");
}

// --- 复用会话 ---

/** 往会话末尾接一条（超过兜底上限就丢最老的） */
function appendHistory(chatId: number, turn: HistoryTurn): void {
  const cfg = takeoverFor(chatId);
  if (!cfg || !turn.text.trim()) return;
  cfg.history.push({ role: turn.role, text: turn.text });
  if (cfg.history.length > MAX_HISTORY) cfg.history = cfg.history.slice(-MAX_HISTORY);
}

/**
 * 首次接管这个聊天：用最近一段聊天记录给会话垫个底（只拉这一回，之后全靠会话累积）。
 * 只取 `beforeId` 之前的消息：这次要回的新消息随后自己接进来，别记两遍。
 */
async function seedHistory(chatId: number, beforeId: number): Promise<void> {
  const cfg = takeoverFor(chatId);
  if (!cfg) return;
  const raw = await fetchRecentMessages(chatId, RECENT_LIMIT);
  const seed = raw.filter((m) => m.id < beforeId).sort((a, b) => a.id - b.id);
  updateTakeover(chatId, {
    history: seed.map((m) => ({
      role: m.is_outgoing ? "assistant" : "user",
      text: messageTextOf(m),
    })),
    // 窗口是空的也要记个下限，否则每次都会重新拉一遍
    historyUpTo: seed.length ? seed[seed.length - 1].id : Math.max(0, beforeId - 1),
  });
}

/**
 * 会话超出窗口的部分压进摘要（吃的是会话自己的历史，不再回 TDLib 翻）。
 * 返回压了多少条；0 = 没压。`force` = 设置页「立即压缩」。
 */
async function compressHistory(
  chatId: number,
  opts: { force?: boolean; selfName: string; partnerName: string },
): Promise<number> {
  const cfg = takeoverFor(chatId);
  const target = resolveTakeoverTarget();
  if (!cfg || !target) return 0;
  const overflow = cfg.history.length - HISTORY_KEEP;
  if (overflow <= 0) return 0;
  if (!opts.force && !shouldCompress(overflow)) return 0;
  const take = Math.min(COMPRESS_BATCH, overflow);
  const head = cfg.history.slice(0, take);
  const reply = await invoke<{ text: string }>("ai_complete", {
    providerId: target.provider.id,
    model: target.model.id,
    messages: [
      { role: "system", text: compressSystemPrompt() },
      { role: "user", text: compressUserPromptLines(cfg.summary, historyLines(head, opts.selfName, opts.partnerName)) },
    ],
    effort: null,
    maxOutputTokens: SUMMARY_MAX_TOKENS,
  });
  const summary = tidySummary(reply.text ?? "");
  if (!summary) return 0;
  updateTakeover(chatId, { summary, history: cfg.history.slice(take) });
  return take;
}

// --- 本人常用贴纸 / 自定义表情 ---

/** 文本 / 媒体说明里的富文本（只有这两类会带自定义表情实体） */
function captionOf(m: message): formattedText | null {
  const c = m.content;
  if (!c) return null;
  if (c._ === "messageText") return c.text;
  const cap = (c as unknown as { caption?: formattedText }).caption;
  return cap ?? null;
}

/** TDLib 的 stickerFormat* → 展示端要的短格式（认不出的按静态图处理） */
function stickerKindOf(format: string | undefined): StickerKind {
  if (format === "stickerFormatTgs") return "tgs";
  if (format === "stickerFormatWebm") return "webm";
  return "webp";
}

/** 一条消息里本人用到的贴纸 / 自定义表情 */
function usagesOf(m: message): { stickers: UsageItem[]; emojis: UsageItem[] } {
  const out: { stickers: UsageItem[]; emojis: UsageItem[] } = { stickers: [], emojis: [] };
  if (!m.is_outgoing) return out;
  const c = m.content;
  if (c?._ === "messageSticker") {
    const fileId = c.sticker.sticker?.id;
    // 只记了文件 id，展示端没法自己判断格式 → 顺手记下
    if (fileId) out.stickers.push({ id: String(fileId), emoji: c.sticker.emoji || "", format: stickerKindOf(c.sticker.format?._) });
  }
  const ft = captionOf(m);
  if (ft) {
    for (const e of ft.entities) {
      if (e.type?._ !== "textEntityTypeCustomEmoji") continue;
      const id = String(e.type.custom_emoji_id);
      // entities 的 offset/length 是 UTF-16 码元，与 JS 字符串下标一致
      const glyph = ft.text.slice(e.offset, e.offset + e.length);
      out.emojis.push({ id, emoji: glyph });
    }
  }
  return out;
}

/** 一批消息 → 两类使用记录（只算本人发的） */
function collectUsage(messages: message[]): { stickers: UsageItem[]; emojis: UsageItem[] } {
  const stickers: UsageItem[] = [];
  const emojis: UsageItem[] = [];
  for (const m of messages) {
    const u = usagesOf(m);
    stickers.push(...u.stickers);
    emojis.push(...u.emojis);
  }
  return { stickers, emojis };
}

/**
 * 接管实际使用的供应商 / 模型。设置页的下拉与真正发请求都走这一份，别分叉：
 * 1. 接管设置里显式选的，且该供应商有 Key、模型还在它的列表里；
 * 2. 否则跟随 AI 设置（输入框用的那套）；
 * 3. 都没有时退回第一个可用供应商的第一个模型 —— 设置页会把这一项显示出来，用户看得见。
 */
export function resolveTakeoverTarget(): { provider: AiProvider; model: AiModel } | null {
  const usable = aiProviders.list.filter((p) => aiProviderReady(p) && p.models.length > 0);
  if (!usable.length) return null;
  const own = aiTakeover.providerId ? usable.find((p) => p.id === aiTakeover.providerId) : undefined;
  const ownModel = own?.models.find((m) => m.id === aiTakeover.model);
  if (own && ownModel) return { provider: own, model: ownModel };
  const fromAi = usable.find((p) => p.id === settings.ai.providerId);
  const aiModel = fromAi?.models.find((m) => m.id === settings.ai.model);
  if (fromAi && aiModel) return { provider: fromAi, model: aiModel };
  const first = usable[0];
  return { provider: first, model: first.models[0] };
}

/** 发一条文本（自定义表情走 textEntityTypeCustomEmoji 实体，模型只给标记，实体在这里拼）。返回消息 id */
async function sendText(chatId: number, text: string, emojiEntities: EmojiEntity[]): Promise<number> {
  const sent = await tdlibSend({
    _: "sendMessage",
    chat_id: chatId,
    input_message_content: {
      _: "inputMessageText",
      text: {
        _: "formattedText",
        text,
        entities: emojiEntities.map((e) => ({
          _: "textEntity" as const,
          offset: e.offset,
          length: e.length,
          type: { _: "textEntityTypeCustomEmoji" as const, custom_emoji_id: e.customEmojiId },
        })),
      },
    },
  });
  return sent.id;
}

/** 补发一张贴纸（本人常用列表里的文件 id）。返回消息 id */
async function sendSticker(chatId: number, fileId: number, emoji: string): Promise<number> {
  const sent = await tdlibSend({
    _: "sendMessage",
    chat_id: chatId,
    input_message_content: {
      _: "inputMessageSticker",
      sticker: { _: "inputSticker", sticker: { _: "inputFileId", id: fileId } },
      emoji: emoji || "",
    },
  });
  return sent.id;
}

/** 「正在输入」：模仿真人思考的节奏；失败不影响回复 */
function sendTyping(chatId: number): void {
  void tdlibSend({ _: "sendChatAction", chat_id: chatId, action: { _: "chatActionTyping" } }).catch(() => {});
}

/** 收到新消息 → 按配置延迟排一次回复；连发会不断重置等待（但不超过 MAX_WAIT_MS） */
function schedule(chatId: number): void {
  const cfg = takeoverFor(chatId);
  if (!cfg) return;
  const delayMs = Math.max(0, cfg.delaySec) * 1000;
  const prev = pending.get(chatId);
  if (prev) window.clearTimeout(prev.timer);
  const firstAt = prev?.firstAt ?? Date.now();
  const deadline = Math.min(firstAt + MAX_WAIT_MS, Date.now() + delayMs);
  const timer = window.setTimeout(() => {
    pending.delete(chatId);
    void runTurn(chatId);
  }, Math.max(1000, deadline - Date.now()));
  pending.set(chatId, { timer, firstAt });
}

/** 撤销还没跑的自动回复（本人已经手动回了 / 配置被关掉） */
function cancelPending(chatId: number): void {
  const prev = pending.get(chatId);
  if (!prev) return;
  window.clearTimeout(prev.timer);
  pending.delete(chatId);
}

/** 现在允许接管吗（配置里的「接管时机」） */
function activationMet(): boolean {
  return activationAllows({
    mode: aiTakeover.activation,
    idleMinutes: aiTakeover.idleMinutes,
    lastActivityAt: usePresenceStore().lastActivityAt,
    now: Date.now(),
    hidden: document.hidden,
    focused: document.hasFocus(),
  });
}

/** 时机没到：过一会儿再看（消息留在缓冲里，不丢也不回） */
function retryLater(chatId: number): void {
  const prev = pending.get(chatId);
  if (prev) window.clearTimeout(prev.timer);
  const timer = window.setTimeout(() => {
    pending.delete(chatId);
    void runTurn(chatId);
  }, ACTIVATION_RETRY_MS);
  pending.set(chatId, { timer, firstAt: Date.now() });
}

/** 一轮接管：新消息进会话 → 必要时压缩 → system + 会话 → 生成 → 发出去 → 记回会话 */
async function runTurn(chatId: number): Promise<void> {
  // 上一轮还在生成：等它结束再来（新消息已经排队）
  if (running.has(chatId)) {
    queued.add(chatId);
    return;
  }
  running.add(chatId);
  try {
    const cfg = takeoverFor(chatId);
    if (!cfg || !cfg.enabled || !aiTakeover.enabled) return;
    const me = await myUser();
    if (!me) return;
    const partner = await privatePartner(chatId);
    if (!partner) return;
    if (!aiProviders.loaded) await loadAiProviders();
    const target = resolveTakeoverTarget();
    if (!target) {
      updateTakeover(chatId, { lastError: "AI 供应商 / 模型未配置（设置 → AI）" });
      return;
    }

    // 只处理「对方发来的、且没回过」的新消息：消息内容来自 update，不回头翻聊天记录
    const buffered = (incomingBuffer.get(chatId) ?? []).filter((m) => m.id > cfg.lastMessageId);
    if (!buffered.length) return;
    const newestId = buffered.reduce((max, m) => Math.max(max, m.id), 0);

    // 为了等接管时机一直攒着：超过 2 小时就别补了，几小时前的消息突然回过去很怪
    const oldest = buffered[0];
    if (Date.now() / 1000 - oldest.date > MAX_ACTIVATION_WAIT_SEC) {
      incomingBuffer.set(chatId, []);
      const reason = "等待接管时机超时，这几条消息已跳过";
      console.warn(`[aiTakeover] chat ${chatId}: ${reason}`);
      updateTakeover(chatId, { lastMessageId: newestId, lastError: reason });
      return;
    }

    // 时机没到（用户在电脑前 / 还没闲置够）：先不回，过几秒再看
    if (!activationMet()) {
      retryLater(chatId);
      return;
    }

    if (overRateLimit(chatId)) {
      updateTakeover(chatId, { lastError: "10 分钟内回复过多，已停止自动回复（冷却后恢复）" });
      return;
    }

    const selfName = displayName(me, "我");
    const partnerName = displayName(partner, cfg.title || "对方");

    // 第一次接管这个聊天：拉一次最近记录垫上下文；之后这个会话一直复用
    if (!cfg.history.length && cfg.historyUpTo === 0) {
      try {
        await seedHistory(chatId, buffered[0].id);
      } catch (e) {
        console.error("[aiTakeover] 初始化会话失败（按空会话继续）:", e);
      }
    }

    // 对方的新消息接进会话（已经接过的不重复接：重试时靠 historyUpTo 判断）
    const fresh = buffered.filter((m) => m.id > cfg.historyUpTo);
    for (const m of fresh) appendHistory(chatId, { role: "user", text: messageTextOf(m) });
    if (fresh.length) updateTakeover(chatId, { historyUpTo: fresh[fresh.length - 1].id });
    incomingBuffer.set(chatId, []);

    // 压缩失败不该连累回复：摘要旧一点照样能回
    try {
      await compressHistory(chatId, { selfName, partnerName });
    } catch (e) {
      console.error("[aiTakeover] 上下文压缩失败:", e);
    }

    const system = takeoverSystemPrompt({
      mode: cfg.mode,
      selfName,
      partnerName,
      instructions: cfg.instructions,
      summary: cfg.summary,
      style: cfg.style,
      styleSampleCount: cfg.styleLimit,
      stickers: cfg.stickers,
      customEmojis: cfg.customEmojis,
      examples: cfg.history.filter((t) => t.role === "assistant").slice(-12).map((t) => t.text),
    });
    // 复用会话：system + 这段对话本身（不是每次重新拼的聊天记录）
    const messages = [
      { role: "system", text: system },
      ...promptHistory(cfg.history).map((t) => ({ role: t.role, text: t.text })),
    ];
    sendTyping(chatId);
    const reply = await invoke<{ text: string }>("ai_complete", {
      providerId: target.provider.id,
      model: target.model.id,
      messages,
      effort: null,
      maxOutputTokens: SEND_MAX_TOKENS,
    });
    // 模型输出里的 {{emoji:id}} / {{sticker:id}} 在这里变成真表情实体 / 一张贴纸；
    // 只认本人常用列表里的 id，编造的 id 直接丢掉
    const parsed = parseReply(reply.text ?? "", cfg.stickers, cfg.customEmojis);
    if (!parsed.text && !parsed.stickerFileIds.length) {
      updateTakeover(chatId, { lastError: "模型返回了空消息" });
      return;
    }

    // 发出去：自己发的消息在 update 里会被 sending 挡住，不当作「本人手动回复」
    sending.add(chatId);
    let lastSentId = 0;
    try {
      if (parsed.text) lastSentId = Math.max(lastSentId, await sendText(chatId, parsed.text, parsed.emojiEntities));
      for (const fileId of parsed.stickerFileIds) {
        const known = cfg.stickers.find((s) => s.id === String(fileId));
        lastSentId = Math.max(lastSentId, await sendSticker(chatId, fileId, known?.emoji ?? ""));
      }
    } finally {
      sending.delete(chatId);
    }

    // 自己这条也折进会话，下一轮模型才接得上（贴纸单独记一条，合并交给 promptHistory）
    if (parsed.text) appendHistory(chatId, { role: "assistant", text: parsed.text });
    if (parsed.stickerFileIds.length) appendHistory(chatId, { role: "assistant", text: "[贴纸]" });

    noteReply(chatId);
    updateTakeover(chatId, {
      lastMessageId: newestId,
      lastReplyAt: Date.now(),
      lastError: "",
      historyUpTo: Math.max(cfg.historyUpTo, lastSentId),
    });
  } catch (e) {
    // 失败不记 lastMessageId：下一条新消息会再试一次（已经接进会话的消息不会重复接）
    console.error("[aiTakeover] 接管回复失败:", e);
    updateTakeover(chatId, { lastError: messageOf(e) });
  } finally {
    running.delete(chatId);
    if (queued.delete(chatId) && takeoverFor(chatId)?.enabled && aiTakeover.enabled) schedule(chatId);
  }
}

/**
 * 手动压缩一次（设置页按钮）：把会话里超出窗口的最老一段压进摘要。
 * 返回压了多少条；0 = 会话还没长到需要压。
 */
export async function compressTakeoverNow(chatId: number): Promise<number> {
  const cfg = takeoverFor(chatId);
  if (!cfg) return 0;
  if (!aiProviders.loaded) await loadAiProviders();
  if (!resolveTakeoverTarget()) throw new Error("AI 供应商 / 模型未配置（设置 → AI）");
  const me = await myUser();
  const partner = await privatePartner(chatId);
  return await compressHistory(chatId, {
    force: true,
    selfName: displayName(me, "我"),
    partnerName: displayName(partner, cfg.title || "对方"),
  });
}

/**
 * 总结本人在这段对话里的说话风格（模仿模式用，用户点「总结」触发）。
 *
 * 取最近 `limit` 条聊天记录（本人 + 对方；上限 500），一次动作同时产出：
 * - 风格画像（模型提炼「本人怎么说话」）；
 * - 本人常用的贴纸 / 自定义表情（前端从同一批消息里数，不让模型数）。
 * 两者一起存进配置，之后的模仿回复会优先照画像，并可按这份清单发贴纸 / 自定义表情。
 */
export async function summarizeStyleNow(
  chatId: number,
  limit: number,
): Promise<{ messages: number; chars: number; stickers: number; emojis: number }> {
  const cfg = takeoverFor(chatId);
  if (!cfg) throw new Error("该聊天没有接管配置");
  if (!aiProviders.loaded) await loadAiProviders();
  const target = resolveTakeoverTarget();
  if (!target) throw new Error("AI 供应商 / 模型未配置（设置 → AI）");
  const me = await myUser();
  const partner = await privatePartner(chatId);
  const selfName = displayName(me, "我");
  const partnerName = displayName(partner, cfg.title || "对方");
  const count = Math.min(500, Math.max(10, Math.round(limit)));
  const raw = await fetchRecentMessages(chatId, count);
  if (!raw.length) throw new Error("这个聊天还没有可分析的消息");
  const messages = raw.map((m) => toTranscript(m, partnerName, selfName)).sort((a, b) => a.id - b.id);
  if (!messages.some((m) => m.outgoing)) {
    throw new Error("这段对话里本人还没说过话，无法总结风格");
  }
  // 贴纸 / 自定义表情和画像同一批消息、同一次动作：重数一遍（不累加旧的）
  const usage = collectUsage(raw);
  const stickers = mergeTally([], usage.stickers);
  const customEmojis = mergeTally([], usage.emojis);
  const reply = await invoke<{ text: string }>("ai_complete", {
    providerId: target.provider.id,
    model: target.model.id,
    messages: [
      { role: "system", text: styleSystemPrompt(selfName, partnerName) },
      { role: "user", text: styleUserPrompt(messages, selfName) },
    ],
    effort: null,
    maxOutputTokens: STYLE_MAX_TOKENS,
  });
  const style = tidyStyle(reply.text ?? "");
  if (!style) throw new Error("模型没有返回风格总结");
  updateTakeover(chatId, {
    style,
    styleLimit: count,
    styleAt: Date.now(),
    stickers,
    customEmojis,
    lastError: "",
  });
  return {
    messages: messages.length,
    chars: style.length,
    stickers: stickers.length,
    emojis: customEmojis.length,
  };
}

/** updateNewMessage → 新消息收进会话 / 本人手动回复也折进会话（重活留给 runTurn） */
function onUpdate(update: TdlibUpdate): void {
  if (update._ !== "updateNewMessage") return;
  // 账号还没就绪时配置加载在 init 里做；这里只兜一次，免得第一次消息被漏掉
  if (!aiTakeover.loaded) reloadConfig();
  const msg = update.message as message | undefined;
  if (!msg || !msg.id) return;
  const cfg = takeoverFor(msg.chat_id);
  if (!cfg) return;

  if (msg.is_outgoing) {
    // 自己刚发的（AI 代发 / 贴纸）：sending 期间直接忽略，别当成「本人手动回复」
    if (sending.has(msg.chat_id)) return;
    const buf = incomingBuffer.get(msg.chat_id) ?? [];
    // 对方这几条比本人这条早：先折进会话（顺序仍是「对方问 → 本人答」），再折本人的回复
    const older = buf.filter((m) => m.id < msg.id);
    const newer = buf.filter((m) => m.id > msg.id);
    for (const m of older) {
      if (m.id > cfg.historyUpTo) appendHistory(msg.chat_id, { role: "user", text: messageTextOf(m) });
    }
    if (older.length) {
      updateTakeover(msg.chat_id, { historyUpTo: Math.max(cfg.historyUpTo, older[older.length - 1].id) });
    }
    // 本人手动回的：折进会话，上下文才不会断；同一条只记一次
    if (msg.id > cfg.historyUpTo) {
      appendHistory(msg.chat_id, { role: "assistant", text: messageTextOf(msg) });
      updateTakeover(msg.chat_id, { historyUpTo: msg.id });
    }
    if (older.length) {
      // 本人已经手动回了对方那几条 → 撤掉自动回复（还有更新的消息就留着，让它自己再排一轮）
      incomingBuffer.set(msg.chat_id, newer);
      if (!newer.length) cancelPending(msg.chat_id);
      updateTakeover(msg.chat_id, { lastMessageId: older[older.length - 1].id });
    }
    return;
  }

  if (!cfg.enabled || !aiTakeover.enabled) return;
  if (!isReplyableContent(msg.content?._ ?? "")) return;
  if (msg.date < Date.now() / 1000 - MAX_MESSAGE_AGE_SEC) return;
  const buf = incomingBuffer.get(msg.chat_id) ?? [];
  if (buf.some((m) => m.id === msg.id)) return;
  buf.push(msg);
  if (buf.length > 20) buf.splice(0, buf.length - 20);
  incomingBuffer.set(msg.chat_id, buf);
  schedule(msg.chat_id);
}

/** 按当前活动账号读配置；换账号 = 丢掉上一个账号排队的回复 */
function reloadConfig(): void {
  const id = useAccountsStore().activeAccount?.id ?? null;
  loadTakeover(id);
  for (const { timer } of pending.values()) window.clearTimeout(timer);
  pending.clear();
  incomingBuffer.clear();
  queued.clear();
}

/**
 * 注册接管运行时（应用启动时调一次；幂等）。
 * 订阅 message 通道 + 跟随活动账号重读配置。
 */
export function initAiTakeover(): void {
  if (initialized) return;
  initialized = true;
  reloadConfig();
  const accounts = useAccountsStore();
  watch(() => accounts.activeAccount?.id, () => reloadConfig());
  onTdlibUpdate("message", onUpdate);
}
