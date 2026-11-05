/**
 * 私聊 AI 接管的**纯逻辑**（不 import Tauri / vue / i18n，可用 node 直接跑自检，见
 * scripts/aiTakeover.check.mjs）。运行时在 ./aiTakeover，配置在 ../store/aiTakeover。
 *
 * 这里只有四件事：
 * - 聊天记录 → 喂给模型的纯文本（风格总结 / 会话压缩用）；
 * - 两种接管方式的 system prompt：imitate = 冒充本人，assistant = 以 AI 身份接管；
 * - 会话历史 → prompt 消息（合并同角色、去掉开头「本人」那条，Anthropic 要求 user 开头）；
 * - 模型输出 → 真正发出去的那条消息（去掉引号 / 前缀 / 代码块，换成表情实体 / 贴纸）。
 */

export type TakeoverMode = "imitate" | "assistant";

/** 什么情况下才让接管真的回消息 */
export type TakeoverActivation = "always" | "background" | "idle";

/**
 * 接管时机判定（纯函数，便于自检）：
 * - always：收到就回；
 * - background：窗口不在前台（隐藏 / 失焦）才回 —— 用户在电脑前就自己聊；
 * - idle：连续 idleMinutes 分钟没有鼠标 / 键盘操作才回。
 */
export function activationAllows(o: {
  mode: TakeoverActivation;
  idleMinutes: number;
  /** 最近一次用户操作的毫秒时间戳 */
  lastActivityAt: number;
  /** 判断时刻（毫秒） */
  now: number;
  /** 窗口是否隐藏（document.hidden） */
  hidden: boolean;
  /** 窗口是否有焦点（document.hasFocus()） */
  focused: boolean;
}): boolean {
  if (o.mode === "always") return true;
  if (o.mode === "background") return o.hidden || !o.focused;
  const need = Math.max(1, o.idleMinutes) * 60_000;
  return o.now - o.lastActivityAt >= need;
}

/** 一条聊天记录（从 TDLib message 投影出来，只留 prompt 要用的字段） */
export interface TranscriptMessage {
  id: number;
  /** Unix 秒 */
  date: number;
  /** 本人发的（含马甲身份） */
  outgoing: boolean;
  sender: string;
  text: string;
}

/**
 * 复用会话里的一轮：对方的发言 = user，本人的发言（含 AI 代发、手动回复）= assistant。
 * 直接按角色喂给模型，比每次重新拼带时间戳的聊天记录更省 token，也让模型接着同一段对话说。
 */
export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

/** 会话里保留的最近条数：更早的压进摘要 */
export const HISTORY_KEEP = 24;
/** 首次接管时从聊天记录垫上下文的条数（只拉这一次，之后全靠会话自己累积） */
export const RECENT_LIMIT = 36;
/** 超出 HISTORY_KEEP 的部分攒到这么多条才压一次（每次压缩多花一次模型调用） */
export const COMPRESS_EVERY = 16;
/** 单次压缩最多吃多少条历史 */
export const COMPRESS_BATCH = 60;
/** 摘要长度上限（字符）：超了按原顺序截断 */
export const SUMMARY_MAX = 1600;
/** 风格画像长度上限（字符） */
export const STYLE_MAX = 1200;
/**
 * 两次总结（风格画像 / 上下文压缩）的输出 token 上限。
 * 中文约 1 字 ≈ 1~1.5 token，思考模型还要先花掉一部分 —— 给不够就会说到一半被截断，
 * 存下来的画像 / 摘要自然「格式不对」。上限不花额外钱，模型自己会停。
 */
export const STYLE_MAX_TOKENS = 2000;
export const SUMMARY_MAX_TOKENS = 2400;
/** 用户可以选的「总结最近 N 条」档位（上限 500） */
export const STYLE_LIMITS = [30, 50, 100, 200, 500] as const;
/** 默认总结最近 50 条 */
export const DEFAULT_STYLE_LIMIT = 50;
/** 常用贴纸 / 自定义表情各保留多少种（随风格画像一起总结出来） */
export const CATALOG_KEEP = 12;
/** 单条聊天记录在 prompt 里的字符上限 */
const LINE_MAX = 400;
/** 发出去的消息长度上限（Telegram 单条 4096，留点余量） */
export const REPLY_MAX = 4000;

/** 能接管的聊天内容类型：服务类消息（建群 / 改标题 / 入群…）不接 */
const REPLYABLE = new Set([
  "messageText",
  "messageRichMessage",
  "messagePhoto",
  "messageVideo",
  "messageAnimation",
  "messageAudio",
  "messageDocument",
  "messageVoiceNote",
  "messageVideoNote",
  "messageSticker",
  "messagePoll",
  "messageLocation",
  "messageVenue",
  "messageContact",
  "messageGame",
  "messageDice",
  "messageStory",
  "messagePaidMedia",
  "messageTodoList",
  "messageGift",
  "messageGiveaway",
  "messageGiftedPremium",
]);

/** 这条内容值得回吗（文本 / 媒体 / 贴纸…；建群、改标题这类服务消息返回 false） */
export function isReplyableContent(contentType: string): boolean {
  return REPLYABLE.has(contentType);
}

/** 没有正文时给模型看的占位（不是给用户看的，所以不走 i18n） */
export function contentPlaceholder(contentType: string): string {
  switch (contentType) {
    case "messagePhoto":
      return "[图片]";
    case "messageVideo":
      return "[视频]";
    case "messageAnimation":
      return "[GIF]";
    case "messageAudio":
      return "[音频]";
    case "messageVoiceNote":
      return "[语音]";
    case "messageVideoNote":
      return "[视频留言]";
    case "messageDocument":
      return "[文件]";
    case "messageSticker":
      return "[贴纸]";
    case "messagePoll":
      return "[投票]";
    case "messageLocation":
    case "messageVenue":
      return "[位置]";
    case "messageContact":
      return "[联系人]";
    case "messageGame":
      return "[游戏]";
    case "messageDice":
      return "[骰子]";
    case "messageStory":
      return "[故事]";
    case "messagePaidMedia":
      return "[付费媒体]";
    case "messageTodoList":
      return "[待办清单]";
    case "messageRichMessage":
      return "[富文本]";
    default:
      return "[消息]";
  }
}

/** 毫秒时间戳（TDLib 的 date 是秒） */
function clock(sec: number): string {
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 单行化：模型看到的多行消息用 ⏎ 连起来，一条消息就占 prompt 一行 */
function oneLine(text: string, max = LINE_MAX): string {
  const flat = text.replace(/\r?\n+/g, " ⏎ ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 聊天记录 → prompt 文本（时间升序，一行一条）。
 * `selfName` 用来把本人的消息标成「我」，其余用发送者名字。
 */
export function transcriptLines(messages: TranscriptMessage[], selfName = "我"): string {
  return [...messages]
    .sort((a, b) => a.id - b.id)
    .map((m) => `[${clock(m.date)}] ${m.outgoing ? selfName : m.sender || "对方"}: ${oneLine(m.text)}`)
    .join("\n");
}

/**
 * 会话历史 → 给模型的消息（复用同一段对话，别每次重新拼聊天记录）。
 *
 * 两个硬性约束：
 * - 同角色相邻条目合并成一条：多轮连发时否则会连续出现两条 user / assistant；
 * - 开头若是 assistant 直接丢掉：Anthropic 要求第一条是 user（OpenAI 系也更好读）。
 */
export function promptHistory(history: readonly HistoryTurn[]): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  for (const turn of history) {
    const text = turn.text.trim();
    if (!text) continue;
    if (!out.length && turn.role === "assistant") continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) last.text = `${last.text}\n${text}`;
    else out.push({ role: turn.role, text });
  }
  return out;
}

/**
 * 会话历史 → 压缩用的纯文本（一行一句，谁说的写清楚）。
 * 压缩只吃历史，不再回去翻 TDLib。
 */
export function historyLines(
  history: readonly HistoryTurn[],
  selfName = "我",
  partnerName = "对方",
): string {
  return history
    .map((t) => `${t.role === "assistant" ? selfName : partnerName}: ${oneLine(t.text)}`)
    .join("\n");
}

export interface ReplyPromptInput {
  mode: TakeoverMode;
  /** 本人显示名（getMe） */
  selfName: string;
  /** 对方显示名 */
  partnerName: string;
  partnerUsername?: string;
  /** 用户自己写的补充设定（人设 / 口吻 / 禁忌），可空 */
  instructions?: string;
  /** 较早对话的压缩摘要，可空 */
  summary?: string;
  /** 本人风格画像（用户点「总结」后用模型从最近 N 条对话里总结出来的），可空 */
  style?: string;
  /** 风格画像取材条数（只在有画像时用来写进 prompt） */
  styleSampleCount?: number;
  /** 本人常用贴纸 / 自定义表情（模仿模式可选用） */
  stickers?: readonly TallyItem[];
  customEmojis?: readonly TallyItem[];
  /** 本人最近说过的话（从会话历史里的 assistant 条目取），当风格样本用 */
  examples?: readonly string[];
}

/** 两种接管方式共用的一段输出要求 */
const OUTPUT_RULES = [
  "只输出要发到聊天里的消息正文：不要解释、不要加引号、不要写「回复：」、不要输出思考过程。",
  "不发空消息；需要换行就换行，不要用 Markdown 语法（**粗体**、`代码` 这类会原样发出去）。",
  "不编造对方没说过的事实；对方问到不知道的事，就含糊带过或反问。",
];

/** 给规则编号（两种模式各自的规则连起来编号，模型不会看到重复的 1.） */
function numbered(rules: readonly string[]): string[] {
  return rules.map((r, i) => `${i + 1}. ${r}`);
}

/** 回复用的 system prompt（按接管方式分两套） */
export function takeoverSystemPrompt(o: ReplyPromptInput): string {
  const partner = o.partnerUsername ? `${o.partnerName}（@${o.partnerUsername}）` : o.partnerName;
  const lines: string[] = [];
  if (o.mode === "imitate") {
    lines.push(
      `你在用「${o.selfName}」本人的 Telegram 账号，代替本人回复和「${partner}」的私聊。`,
      "",
      "硬性要求：",
      ...numbered([
        "完全以本人身份说话：用词、称呼、句子长短、标点、表情和 emoji 习惯都照下面的「本人风格画像 / 例句」。",
        "不提 AI / 模型 / 助手，也不要说自己在「替别人回复」。",
        "不替本人编造没说过的经历、承诺、行程、金额或隐私。",
        "长度贴近样本：一般 1~2 句；对方发长文时可以稍长。除非样本里就这样，否则别用书面语和客套话。",
        ...OUTPUT_RULES,
      ]),
      "",
    );
    // 风格画像 / 例句只给模仿模式用：AI 接管是另一种人格，不需要学本人怎么说话
    const style = (o.style ?? "").trim();
    if (style) {
      // 用户点过「总结」：模型总结出来的画像比零散例句更能稳定模仿语气
      const n = o.styleSampleCount ? `最近 ${o.styleSampleCount} 条对话` : "这段对话";
      lines.push(`本人风格画像（从${n}总结出来，**优先照它说话**）：`, style, "");
    }
    const samples = (o.examples ?? []).map((s) => s.trim()).filter(Boolean);
    if (samples.length) {
      lines.push(
        style ? "本人最近的原话（对照画像的例句）：" : "本人风格样本（本人最近说过的话）：",
        samples.map((s) => `- ${oneLine(s, 200)}`).join("\n"),
      );
    } else if (!style) {
      lines.push("本人风格样本（本人最近说过的话）：", "- （这段对话里本人还没说过话：按普通人聊天的简短口语回复）");
    }
    const usage = usageBlock(o.stickers ?? [], o.customEmojis ?? []);
    if (usage) lines.push("", usage);
  } else {
    lines.push(
      `你是 tdeeeg 客户端里的 AI，正在代替「${o.selfName}」接管和「${partner}」的私聊。`,
      "",
      "硬性要求：",
      ...numbered([
        "你是 AI 助手，不冒充本人：对方直接问「你是谁 / 是不是 AI / 本人呢」时如实说明；对方没问就别主动提。",
        "简短、自然、友好，像在 Telegram 里聊天，一般 1~3 句。",
        "不替本人做承诺、转账、约会或透露隐私；不确定的事就说不确定。",
        ...OUTPUT_RULES,
      ]),
    );
  }
  const extra = (o.instructions ?? "").trim();
  if (extra) lines.push("", "本人补充的设定（优先级高于上面的风格要求，但不要违反硬性要求）：", extra);
  return lines.join("\n");
}

/** 上下文压缩的 system prompt */
export function compressSystemPrompt(): string {
  return [
    "你负责压缩 Telegram 私聊记录，产出之后回复要用的长期上下文摘要。",
    "要求：",
    "1. 只保留后面还要用的信息：双方关系、正在聊什么事、已确认的事实和约定、对方的关注点和情绪、称呼与语气习惯、还没解决的问题。",
    "2. 条目式中文，一条一行，紧凑；不写寒暄、不写分析过程、不编造。",
    `3. 输出更新后的**完整**摘要（不是增量），不超过 ${SUMMARY_MAX} 字。`,
  ].join("\n");
}

/** 上下文压缩的 user prompt：旧摘要 + 新增记录（已排好版的历史行） → 新摘要 */
export function compressUserPromptLines(existing: string, lines: string): string {
  const old = existing.trim();
  return [
    `已有摘要：\n${old || "（无）"}`,
    `新增聊天记录（时间升序）：\n${lines}`,
    "输出更新后的完整摘要。",
  ].join("\n\n");
}

/** 未压缩的较早消息够不够压一次（少了不值得多花一次模型调用） */
export function shouldCompress(uncompressed: number, every = COMPRESS_EVERY): boolean {
  return uncompressed >= Math.max(1, every);
}

/**
 * 风格总结的 system prompt：模仿模式用。
 * 只提炼「本人怎么说话」，不总结聊了什么 —— 聊什么由上下文压缩管，两者不要混。
 * 贴纸 / 自定义表情不在这里让模型总结（它数不准，也没必要），由前端从同一批消息里统计。
 */
export function styleSystemPrompt(selfName: string, partnerName: string): string {
  return [
    `你负责分析「${selfName}」在 Telegram 上和「${partnerName}」私聊时的说话风格，给之后代写消息用。`,
    "要求：",
    `1. 只看「${selfName}」自己怎么说话（对方的话只用来理解称呼关系与语境）。`,
    "2. 条目式列出：称呼对方的方式、句子长短、常用词 / 口头禅、语气（直接 / 委婉 / 玩笑 / 冷淡）、标点与大小写、emoji / 表情 / 拟声词习惯、一次发几条、什么时候不接话。",
    "3. 不复述聊天内容、不评价、不编造；样本不足就写「样本不足」。",
    `4. 输出 200~400 字中文条目，直接可当写作风格说明使用，不超过 ${STYLE_MAX} 字。`,
    "5. 直接输出条目正文：不要代码块、不要 JSON、不要前言 / 后记。",
  ].join("\n");
}

/** 风格总结的 user prompt：把最近 N 条对话原文交给模型 */
export function styleUserPrompt(messages: TranscriptMessage[], selfName = "我"): string {
  return [
    `以下是最近 ${messages.length} 条聊天记录（时间升序）：`,
    transcriptLines(messages, selfName),
    `只总结「${selfName}」的说话风格。`,
  ].join("\n\n");
}

/** 模型把结果塞进 JSON 对象时（`{"style": "..."}`），把里面的字符串值拼回正文；认不出返回 null */
function jsonText(raw: string): string | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: string[] = [];
  for (const val of Object.values(v as Record<string, unknown>)) {
    if (typeof val === "string") out.push(val);
    else if (Array.isArray(val)) out.push(...val.filter((x): x is string => typeof x === "string"));
  }
  const text = out.join("\n").trim();
  return text || null;
}

/** 前言标签：`风格画像：` / `**摘要**:` / 单独占一行的 `风格总结`（`总结一下…` 这种正文不能剥） */
const PREAMBLE = /^(?:\*\*|__)?\s*(?:风格画像|风格总结|画像|摘要|总结)\s*(?:\*\*|__)?\s*(?:[:：]|\r?\n|$)\s*/;

/**
 * 模型输出 → 落库的正文（风格画像 / 摘要共用）。
 * 模型爱加一层代码块、写句「好的，以下是风格画像：」、甚至直接返回 JSON —— 这些都是包装。
 * 代码围栏只取第一段里面的内容（前言 / 后记都丢掉），JSON 拆成正文，标签剥掉，超长截断。
 */
function tidyBlock(raw: string, max: number): string {
  let s = raw.trim();
  const fenced = /```[a-zA-Z]*\r?\n([\s\S]*?)(?:\r?\n)?```/.exec(s);
  if (fenced) s = fenced[1].trim();
  if (s.startsWith("{")) s = jsonText(s) ?? s;
  s = s.trim();
  // 剥标签只剥一行：正文第一行本来就叫「总结」时别把内容也剥了
  if (PREAMBLE.test(s)) {
    const rest = s.replace(PREAMBLE, "").trim();
    if (rest) s = rest;
  }
  return s.length > max ? s.slice(0, max) : s;
}

/** 风格画像落库前的收尾（去掉围栏 / 前言 / JSON 包装，超长截断） */
export function tidyStyle(raw: string, max = STYLE_MAX): string {
  return tidyBlock(raw, max);
}

/** 摘要落库前的收尾（同上） */
export function tidySummary(raw: string, max = SUMMARY_MAX): string {
  return tidyBlock(raw, max);
}

/** 贴纸媒体格式（TDLib 的 stickerFormat* 去掉前缀；自定义表情不需要） */
export type StickerKind = "webp" | "tgs" | "webm";

/** 本人频繁使用的贴纸 / 自定义表情（id + 代表字符 + 次数） */
export interface TallyItem {
  /** 贴纸 = 文件 id（十进制字符串）；自定义表情 = custom_emoji_id */
  id: string;
  /** 贴纸自带的 emoji；自定义表情的代表字符 */
  emoji: string;
  count: number;
  /**
   * 贴纸格式（只有贴纸有）。
   * 展示端只拿得到文件 id，没法从文件本身判断是静态 webp / 动图 tgs / 视频 webm，
   * 所以在统计时一并记下；旧数据没有这个字段 → 展示端按扩展名猜。
   */
  format?: StickerKind;
}

/** 一次使用记录（没有次数） */
export interface UsageItem {
  id: string;
  emoji: string;
  format?: StickerKind;
}

/**
 * 把新用到的贴纸 / 自定义表情并进统计：次数累加，只留用得最多的 keep 种。
 * 同次数保持先来后到（稳定排序），这样列表不会每次都跳。
 */
export function mergeTally(
  existing: readonly TallyItem[],
  used: readonly UsageItem[],
  keep = CATALOG_KEEP,
): TallyItem[] {
  const byId = new Map<string, TallyItem>();
  for (const it of existing) byId.set(it.id, { ...it });
  for (const u of used) {
    const id = String(u.id ?? "").trim();
    if (!id || id === "0") continue;
    const cur = byId.get(id);
    if (cur) {
      cur.count += 1;
      if (!cur.emoji && u.emoji) cur.emoji = u.emoji;
      // 旧条目没记格式时补上（同一 id 的格式是固定的）
      if (!cur.format && u.format) cur.format = u.format;
    } else {
      byId.set(id, { id, emoji: u.emoji || "", count: 1, ...(u.format ? { format: u.format } : {}) });
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count).slice(0, Math.max(1, keep));
}

/**
 * 常用贴纸 / 自定义表情 → prompt 段落（模仿模式用；和风格画像一起由「总结」产出）。
 * 模型只看到「本人真发过的东西」，要不要用、用哪个由它自己判断；
 * 这里只写清标记写法与上限（贴纸最多 1 个，别滥用）。
 */
export function usageBlock(stickers: readonly TallyItem[], customEmojis: readonly TallyItem[]): string {
  if (!stickers.length && !customEmojis.length) return "";
  const lines: string[] = [];
  if (stickers.length) {
    lines.push(
      "本人常用贴纸（本人真发过的，直接写标记就能发出去）：",
      ...stickers.map((s) => `- {{sticker:${s.id}}}${s.emoji ? ` ${s.emoji}` : ""} ×${s.count}`),
    );
  }
  if (customEmojis.length) {
    lines.push(
      "本人常用自定义表情（写标记会换成对应的自定义表情）：",
      ...customEmojis.map((e) => `- {{emoji:${e.id}}} ${e.emoji || "🙂"} ×${e.count}`),
    );
  }
  lines.push(
    "用法：贴纸只在它比文字更自然时补一条（写成单独一行 {{sticker:id}}，最多 1 个）；" +
      "自定义表情按平时的习惯插在正文里。都不要滥用，样例里本人常发才发。",
  );
  return lines.join("\n");
}

/** 模型输出里常见的「包装」：代码块 / 引号 / 前缀 */
const LABEL = /^(?:回复|回答|reply|assistant|ai|本人|我)\s*[:：]\s*/i;
const QUOTES: readonly [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["「", "」"],
  ["『", "』"],
  ["《", "》"],
];

/**
 * 模型输出 → 真正发出去的消息正文。
 * 模型爱加一层代码块、包一层引号、写个「回复：」前缀 —— 这些都是包装，不是本人要说的话。
 */
export function normalizeReply(raw: string, max = REPLY_MAX): string {
  let s = raw.trim();
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(s);
  if (fenced) s = fenced[1].trim();
  s = s.replace(LABEL, "").trim();
  for (const [open, close] of QUOTES) {
    if (s.length > 1 && s.startsWith(open) && s.endsWith(close)) {
      // 只剥一层：整条被包起来才算包装，句子中间成对的引号要留着
      const inner = s.slice(open.length, s.length - close.length);
      if (!inner.includes(close)) s = inner.trim();
      break;
    }
  }
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** 贴纸标记：{{sticker:文件id}} */
const STICKER_TOKEN = /\{\{\s*sticker\s*:\s*([^}\s]+)\s*\}\}/g;
/** 自定义表情标记：{{emoji:custom_emoji_id}} */
const EMOJI_TOKEN = /\{\{\s*emoji\s*:\s*([^}\s]+)\s*\}\}/g;

/** 一组要发出去的自定义表情实体（UTF-16 偏移，TDLib 的 formattedText 直接认） */
export interface EmojiEntity {
  offset: number;
  length: number;
  customEmojiId: string;
}

export interface ParsedReply {
  text: string;
  emojiEntities: EmojiEntity[];
  /** 要单独补发的贴纸文件 id（已按常用列表校验过，最多 1 个） */
  stickerFileIds: number[];
}

/**
 * 模型输出 → 要发出去的内容：正文（含自定义表情实体）+ 可选的贴纸。
 *
 * 模型只被允许用**本人常用列表里**的贴纸 / 自定义表情：
 * 不在列表里的标记直接丢掉（拼错、编造的 id 发出去只会报错）。
 * 贴纸还限一条 —— 一次回两三张贴纸不像人。
 */
export function parseReply(
  raw: string,
  stickers: readonly TallyItem[],
  customEmojis: readonly TallyItem[],
  max = REPLY_MAX,
): ParsedReply {
  const stickerIds = new Set(stickers.map((s) => s.id));
  const emojiGlyph = new Map(customEmojis.map((e) => [e.id, e.emoji || "🙂"]));
  const stickerFileIds: number[] = [];

  // 1. 先剥包装（代码块 / 引号 / 前缀 / 超长截断）
  let text = normalizeReply(raw, max);

  // 2. 贴纸标记从正文里摘掉；顺带清掉被撑出来的空行（必须在算实体偏移之前做）
  text = text
    .replace(STICKER_TOKEN, (_all, id: string) => {
      const fileId = Number(id);
      if (stickerFileIds.length < 1 && stickerIds.has(String(id)) && Number.isFinite(fileId) && fileId > 0) {
        stickerFileIds.push(fileId);
      }
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 3. 自定义表情标记 → 表情字符 + 实体（左边已经定稿，偏移就是输出串长度）
  let out = "";
  let cursor = 0;
  const emojiEntities: EmojiEntity[] = [];
  for (const m of text.matchAll(EMOJI_TOKEN)) {
    const at = m.index ?? 0;
    out += text.slice(cursor, at);
    cursor = at + m[0].length;
    const glyph = emojiGlyph.get(m[1]);
    if (!glyph) continue;
    emojiEntities.push({ offset: out.length, length: glyph.length, customEmojiId: m[1] });
    out += glyph;
  }
  out += text.slice(cursor);

  return { text: out.trimEnd(), emojiEntities, stickerFileIds };
}
