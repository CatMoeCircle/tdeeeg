/**
 * AI 工具层：工具注册表（只放元数据；标准 schema 由 schema.ts 生成，调用与审核在 call.ts）。
 * 这张表就是将来喂给模型的 function-calling schema 来源：不要另起一份手写 schema。
 *
 * 约定（自检强制）：
 * - 返回列表的工具：returnsList: true + 必须带 limit 参数（上限在 limits.ts）
 * - 数组 / 对象入参：必须写 maxItems
 * - kind: "write"：needsApproval: true + risk + 必填 reason 参数 + 人话 summary（审核卡片用）
 */
import type { ToolMeta, ToolParam, ToolParamType } from "./types.ts";
import { MARKDOWN_V2_GUIDE } from "./format.ts";

const p = (
  name: string,
  type: ToolParamType,
  required: boolean,
  desc: string,
  maxItems?: number,
): ToolParam => ({ name, type, required: required || undefined, desc, maxItems });

/** 受 limits.ts 约束的条数上限参数 */
const lim = (): ToolParam => p("limit", "number", false, "返回条数上限（默认值与硬顶见 limits.ts）");

const chat = () => p("chat_id", "number", true, "聊天 id（群 / 频道 / 私聊）");
const reason = () => p("reason", "string", true, "一句话说明为什么需要这个操作（审核卡片上展示给用户）");
/** 回复：额外可选引用原消息里的一段原文 */
const quote = () =>
  p("quote", "string", false, "回复时只引用的原文片段（必须是原消息里连续的一段原文；不传 = 整条回复）");
/** 文本格式：不传 = 原样纯文本。用法说明是**同一段**常量，别在这儿手写第二份 */
const parseMode = () => p("parse_mode", "string", false, `传 "markdown" 则${MARKDOWN_V2_GUIDE}不传 = 原样纯文本（不解析）。`);

/** 摘要里用的短文本，太长就截断 */
function short(v: unknown, max = 40): string {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export const TOOLS: readonly ToolMeta[] = [
  // --- 只读（不需要审核） ---
  {
    name: "get_recent_messages", kind: "read", returnsList: true,
    desc: "拉取某个聊天（或话题）最近的上下文消息",
    params: [chat(), p("thread_id", "number", false, "话题 / 线程 id；不传 = 整个聊天"), p("before_message_id", "number", false, "从这个消息 id 往前翻（分页用）"), lim()],
  },
  {
    name: "get_message", kind: "read",
    desc: "读取单条消息",
    params: [chat(), p("message_id", "number", true, "消息 id")],
  },
  {
    name: "get_reply_chain", kind: "read", returnsList: true,
    desc: "读取某条消息的回复链 / 评论串",
    params: [chat(), p("message_id", "number", true, "消息 id"), lim()],
  },
  {
    name: "search_messages", kind: "read", returnsList: true,
    desc: "在聊天里搜索消息",
    params: [chat(), p("query", "string", true, "搜索词"), p("sender", "string", false, "发送者筛选（数字用户 id）"), lim()],
  },
  {
    name: "get_chat_info", kind: "read",
    desc: "获取对话信息（标题、类型、未读数、我的权限、是否受保护等）",
    params: [chat()],
  },
  {
    name: "get_group_info", kind: "read",
    desc: "获取群聊信息（简介、成员数、管理员、邀请链接、历史可见性）",
    params: [chat()],
  },
  {
    name: "get_user_info", kind: "read",
    desc: "获取用户信息（昵称、用户名、简介性字段、是否联系人、是否机器人、是否 premium）",
    params: [p("user_id", "number", true, "用户 id")],
  },
  {
    name: "get_members", kind: "read", returnsList: true,
    desc: "获取成员列表",
    params: [chat(), p("offset", "number", false, "从第几个成员开始（分页用）"), lim()],
  },
  {
    name: "get_member_rights", kind: "read",
    desc: "获取某个成员在该聊天里的身份与权限（不传 member_id = 我自己）",
    params: [chat(), p("member_id", "number", false, "成员 id；不传 = 当前登录账户")],
  },

  // --- 本地元数据（不碰 Telegram，不需要审核） ---
  {
    name: "set_conversation_title", kind: "local",
    desc: "给当前 AI 会话起一个简短标题（概括这次会话在聊什么）。新会话的第一条消息里先调一次；标题已经合适就别再改",
    params: [chat(), p("title", "string", true, "标题：不超过 12 个字的短语，不要引号、句号、换行")],
  },

  // --- 写（全部需要审核） ---
  {
    name: "send_message", kind: "write", needsApproval: true, risk: "send",
    desc: "发送文本消息（可带 Telegram MarkdownV2 格式、可回复 / 引用某条消息、可发到指定话题）",
    summary: (a) => `在聊天 ${a.chat_id} 发送消息：「${short(a.text)}」${a.reply_to_message_id ? `（回复 ${a.reply_to_message_id}${a.quote ? `，引用「${short(a.quote)}」` : ""}）` : ""}`,
    params: [chat(), p("text", "string", true, "消息正文"), p("reply_to_message_id", "number", false, "回复哪条消息"), quote(), p("thread_id", "number", false, "发到哪个话题"), parseMode(), reason()],
  },
  {
    name: "send_media", kind: "write", needsApproval: true, risk: "send",
    desc: "发送本地媒体文件（图片 / 视频 / GIF / 音乐 / 任意文件，可带描述、可回复 / 引用某条消息）",
    summary: (a) => `在聊天 ${a.chat_id} 发送 ${Array.isArray(a.files) ? a.files.length : 0} 个媒体文件${a.caption ? `（描述：「${short(a.caption)}」）` : ""}${a.reply_to_message_id ? `（回复 ${a.reply_to_message_id}）` : ""}`,
    params: [
      chat(),
      p("files", "string[]", true, "本地文件的绝对路径，最多 10 个（同类型的多个会自动组成相册）", 10),
      p("caption", "string", false, "媒体描述（相册时挂在最后一条上）"),
      p("reply_to_message_id", "number", false, "回复哪条消息"),
      quote(),
      p("thread_id", "number", false, "发到哪个话题"),
      parseMode(),
      reason(),
    ],
  },
  {
    name: "edit_message", kind: "write", needsApproval: true, risk: "modify",
    desc: "编辑消息文本（可带 Telegram MarkdownV2 格式）",
    summary: (a) => `把聊天 ${a.chat_id} 的消息 ${a.message_id} 改成：「${short(a.text)}」`,
    params: [chat(), p("message_id", "number", true, "要编辑的消息 id"), p("text", "string", true, "新的正文"), parseMode(), reason()],
  },
  {
    name: "delete_message", kind: "write", needsApproval: true, risk: "destructive",
    desc: "删除消息",
    summary: (a) => `删除聊天 ${a.chat_id} 的消息 ${a.message_id}${a.revoke === false ? "（只删自己这边）" : "（对所有人撤回）"}`,
    params: [chat(), p("message_id", "number", true, "要删除的消息 id"), p("revoke", "boolean", false, "true = 对所有人撤回（默认）"), reason()],
  },
  {
    name: "ban_member", kind: "write", needsApproval: true, risk: "destructive",
    desc: "封禁成员（可顺带删除其消息）",
    summary: (a) => `在聊天 ${a.chat_id} 封禁用户 ${a.member_id}${a.until_date ? `（至 ${new Date(Number(a.until_date) * 1000).toISOString()}）` : "（永久）"}`,
    params: [chat(), p("member_id", "number", true, "要封禁的用户 id"), p("until_date", "number", false, "解封时间（Unix 秒）；不传 = 永久"), p("revoke_messages", "boolean", false, "是否同时删除该成员的消息（默认 true）"), reason()],
  },
  {
    name: "call_tdlib_method", kind: "write", needsApproval: true, risk: "raw",
    desc: "直接调用任意 TDLib 方法（没封装到的能力走这里；返回原样结果）",
    summary: (a) => `直接调用 TDLib 方法 ${a.method}：${short(a.params, 80)}`,
    params: [
      p("method", "string", true, "TDLib 方法名，如 getChatMembers"),
      p("params", "object", true, "方法参数对象（除 _ 之外的字段）", 24),
      reason(),
    ],
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/** 按名取工具元数据；不存在返回 undefined */
export function getTool(name: string): ToolMeta | undefined {
  return byName.get(name);
}

/** 列表类工具（= 必须有 limit） */
export function listingTools(): ToolMeta[] {
  return TOOLS.filter((t) => t.returnsList);
}
