/**
 * 只读工具实现：全部经 tdlibSend 读 TDLib，只读不改，**不走审核**。
 *
 * 约定：
 * - 列表类一律走 limits.ts 的 listResult（clamp + 截断），分页走 collectPaged（每页 ≤ TD_PAGE_MAX=100）
 * - 单条/复合结果走 singleResult（limit=1）
 * - 发送者名字只从 TDLib 已缓存的数据里取（getSenderName），不为了拼名字发 N 个 getUser；
 *   要准确人名让模型调 get_user_info / get_member_rights（一次请求）
 * - 本文件只在应用内加载（依赖 vue / i18n），自检脚本不导入它
 */
import type { chatMember, message } from "tdlib-types";
import { tdlibSend } from "../tdlib";
import { getMessagePlainText } from "../messageText";
import { ensureChat, ensureUser, getReactiveChat, getReactiveUser, getSenderName } from "../senderInfo";
import { loadChatAdministrators, loadGroupFullInfo, loadGroupMembers, memberUserId } from "../groupRights";
import { extractTopicNumber } from "../directMessagesTopics";
import { registerImplementation } from "./call.ts";
import { clampLimit, collectPaged, listResult, singleResult } from "./limits.ts";
import type { ToolResult } from "./types.ts";

// --- 小工具 ---

/** 校验过的必填数字参数（call.ts 的 validateArgs 已挡过，这里只做类型收窄） */
function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`参数 ${name} 必须是数字`);
  return v;
}

function optNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function senderKey(senderId?: message["sender_id"]): string {
  if (!senderId) return "";
  return senderId._ === "messageSenderUser" ? `user:${senderId.user_id}` : `chat:${senderId.chat_id}`;
}

function replyToId(msg: message): number | undefined {
  const r = msg.reply_to;
  return r && r._ === "messageReplyToMessage" ? r.message_id : undefined;
}

function attachmentsOf(msg: message): string[] {
  const c = msg.content;
  if (!c) return [];
  switch (c._) {
    case "messagePhoto":
      return ["photo"];
    case "messageVideo":
      return ["video"];
    case "messageAnimation":
      return ["animation"];
    case "messageVoiceNote":
      return ["voice"];
    case "messageVideoNote":
      return ["video_note"];
    case "messageAudio":
      return [`audio:${(c.audio.title || c.audio.file_name || "").trim()}`];
    case "messageDocument":
      return [`document:${c.document.file_name}`];
    case "messageSticker":
      return [`sticker:${c.sticker.emoji ?? ""}`];
    case "messagePoll":
      return [`poll:${c.poll.question}`];
    case "messageLocation":
      return ["location"];
    case "messageContact":
      return ["contact"];
    default:
      return [];
  }
}

/** 给模型的精简消息（整条 TDLib 消息太肥，别整条塞进上下文） */
interface MessageBrief {
  message_id: number;
  date: number;
  sender: string;
  sender_id: string;
  outgoing: boolean;
  text: string;
  reply_to_message_id?: number;
  thread_id?: number;
  attachments?: string[];
}

function toBrief(msg: message): MessageBrief {
  const senderId = msg.sender_id;
  const brief: MessageBrief = {
    message_id: msg.id,
    date: msg.date,
    sender: getSenderName(senderId) || senderKey(senderId) || "unknown",
    sender_id: senderKey(senderId),
    outgoing: !!msg.is_outgoing,
    text: getMessagePlainText(msg),
  };
  const reply = replyToId(msg);
  if (reply) brief.reply_to_message_id = reply;
  const topic = msg.topic_id;
  const thread =
    topic?._ === "messageTopicThread"
      ? topic.message_thread_id
      : extractTopicNumber(topic as { _: string } | undefined);
  if (thread) brief.thread_id = thread;
  const attachments = attachmentsOf(msg);
  if (attachments.length) brief.attachments = attachments;
  return brief;
}

/** 分页取聊天/话题历史（newest-first），返回精简消息与下一页游标（最旧消息 id） */
async function fetchHistory(opts: {
  chatId: number;
  threadId?: number;
  limit: number;
  fromMessageId?: number;
}): Promise<{ briefs: MessageBrief[]; truncated: boolean; nextCursor: number }> {
  let from = opts.fromMessageId ?? 0;
  const { items, truncated } = await collectPaged<message>(opts.limit, async (size) => {
    const res = opts.threadId
      ? await tdlibSend({
          _: "getMessageThreadHistory",
          chat_id: opts.chatId,
          message_id: opts.threadId,
          from_message_id: from,
          offset: 0,
          limit: size,
        })
      : await tdlibSend({
          _: "getChatHistory",
          chat_id: opts.chatId,
          from_message_id: from,
          offset: 0,
          limit: size,
        });
    const page = (res.messages ?? []).filter((m): m is message => m !== null);
    const oldest = page[page.length - 1]?.id;
    if (oldest) from = oldest;
    return page;
  });
  return { briefs: items.map(toBrief), truncated, nextCursor: from };
}

// --- 读历史 ---

registerImplementation("get_recent_messages", async (args): Promise<ToolResult<MessageBrief[]>> => {
  const raw = args.limit as number | undefined;
  const { briefs, truncated, nextCursor } = await fetchHistory({
    chatId: num(args.chat_id, "chat_id"),
    threadId: optNum(args.thread_id),
    limit: clampLimit("get_recent_messages", raw),
    fromMessageId: optNum(args.before_message_id),
  });
  return listResult("get_recent_messages", raw, briefs, { truncated, next_cursor: nextCursor });
});

registerImplementation("get_message", async (args): Promise<ToolResult<MessageBrief>> => {
  const msg = await tdlibSend({
    _: "getMessage",
    chat_id: num(args.chat_id, "chat_id"),
    message_id: num(args.message_id, "message_id"),
  });
  return singleResult("get_message", toBrief(msg));
});

registerImplementation("get_reply_chain", async (args): Promise<ToolResult<MessageBrief[]>> => {
  const chatId = num(args.chat_id, "chat_id");
  const messageId = num(args.message_id, "message_id");
  const raw = args.limit as number | undefined;
  const limit = clampLimit("get_reply_chain", raw);

  // 1) 是线程（超群回复线程 / 频道评论）→ TDLib 的线程历史一次拿全
  try {
    const thread = await fetchHistory({ chatId, threadId: messageId, limit });
    if (thread.briefs.length) {
      return listResult("get_reply_chain", raw, thread.briefs, {
        truncated: thread.truncated,
        next_cursor: thread.nextCursor,
      });
    }
  } catch {
    /* 不是线程，退化为 reply_to 链 */
  }

  // 2) 退化：沿 reply_to 逐级向上（每条一次 getMessage，链长上限 = limit）
  // ponytail: 逐级请求，回复链通常很短；真遇到长链再换 getMessageThreadHistory
  const chain: MessageBrief[] = [];
  let cursor: number | undefined = messageId;
  while (cursor !== undefined && chain.length < limit) {
    const msg: message = await tdlibSend({ _: "getMessage", chat_id: chatId, message_id: cursor });
    chain.push(toBrief(msg));
    cursor = replyToId(msg);
  }
  return listResult("get_reply_chain", raw, chain, { truncated: cursor !== undefined });
});

registerImplementation("search_messages", async (args): Promise<ToolResult<MessageBrief[]>> => {
  const chatId = num(args.chat_id, "chat_id");
  const raw = args.limit as number | undefined;
  const limit = clampLimit("search_messages", raw);
  const warnings: string[] = [];

  // 发送者只支持数字 id（@username 要额外查用户，先不做）
  let senderId: { _: "messageSenderUser"; user_id: number } | null = null;
  const senderRaw = args.sender;
  const senderNum = typeof senderRaw === "number" ? senderRaw : typeof senderRaw === "string" ? Number(senderRaw) : NaN;
  if (Number.isFinite(senderNum) && senderNum > 0) senderId = { _: "messageSenderUser", user_id: senderNum };
  else if (senderRaw !== undefined) warnings.push("sender_ignored:只支持数字用户 id");

  let from = 0;
  const { items, truncated } = await collectPaged<message>(limit, async (size) => {
    const res = await tdlibSend({
      _: "searchChatMessages",
      chat_id: chatId,
      query: String(args.query ?? ""),
      sender_id: senderId ?? undefined,
      from_message_id: from,
      offset: 0,
      limit: size,
    });
    const page = (res.messages ?? []).filter((m): m is message => m !== null);
    const oldest = page[page.length - 1]?.id;
    if (oldest) from = oldest;
    return page;
  });
  return listResult("search_messages", raw, items.map(toBrief), {
    truncated,
    next_cursor: from,
    ...(warnings.length ? { warnings } : {}),
  });
});

// --- 查信息 ---

registerImplementation("get_chat_info", async (args): Promise<ToolResult<unknown>> => {
  const chatId = num(args.chat_id, "chat_id");
  await ensureChat(chatId);
  const chat = getReactiveChat(chatId);
  if (!chat) return singleResult("get_chat_info", {}, { warnings: ["chat_not_loaded"] });
  return singleResult("get_chat_info", {
    chat_id: chat.id,
    title: chat.title,
    /** chatTypePrivate / chatTypeBasicGroup / chatTypeSupergroup / chatTypeSecret */
    type: chat.type._,
    supergroup_id: chat.type._ === "chatTypeSupergroup" ? chat.type.supergroup_id : undefined,
    basic_group_id: chat.type._ === "chatTypeBasicGroup" ? chat.type.basic_group_id : undefined,
    is_channel: chat.type._ === "chatTypeSupergroup" ? chat.type.is_channel : undefined,
    unread_count: chat.unread_count,
    unread_mention_count: chat.unread_mention_count,
    has_protected_content: chat.has_protected_content,
    is_marked_as_unread: chat.is_marked_as_unread,
    view_as_topics: chat.view_as_topics,
    my_permissions: chat.permissions
      ? {
          can_send_basic_messages: chat.permissions.can_send_basic_messages,
          can_send_media: chat.permissions.can_send_photos || chat.permissions.can_send_videos,
          can_send_polls: chat.permissions.can_send_polls,
          can_change_info: chat.permissions.can_change_info,
          can_invite_users: chat.permissions.can_invite_users,
          can_pin_messages: chat.permissions.can_pin_messages,
        }
      : undefined,
  });
});

registerImplementation("get_group_info", async (args): Promise<ToolResult<unknown>> => {
  const chatId = num(args.chat_id, "chat_id");
  await ensureChat(chatId);
  const chat = getReactiveChat(chatId);
  if (!chat) return singleResult("get_group_info", {}, { warnings: ["chat_not_loaded"] });
  if (chat.type._ !== "chatTypeBasicGroup" && chat.type._ !== "chatTypeSupergroup") {
    return singleResult("get_group_info", {}, { warnings: ["not_a_group"] });
  }

  const full = await loadGroupFullInfo(chat);
  let administrators: { user_id: number; name: string; custom_title: string; is_owner: boolean }[] = [];
  try {
    const admins = await loadChatAdministrators(chatId);
    administrators = admins.map((a: chatMember) => {
      const uid = memberUserId(a) ?? 0;
      const u = getReactiveUser(uid);
      return {
        user_id: uid,
        name: u ? `${u.first_name} ${u.last_name}`.trim() : String(uid),
        custom_title: a.tag ?? "",
        is_owner: a.status._ === "chatMemberStatusCreator",
      };
    });
  } catch {
    /* 拿不到管理员列表（权限不足）时不影响其余信息 */
  }

  return singleResult("get_group_info", {
    chat_id: chatId,
    title: chat.title,
    description: full.description,
    member_count: full.memberCount,
    administrator_count: full.administratorCount,
    banned_count: full.bannedCount,
    is_all_history_available: full.isAllHistoryAvailable,
    linked_chat_id: full.linkedChatId || undefined,
    invite_link: full.inviteLink || undefined,
    administrators,
  });
});

registerImplementation("get_user_info", async (args): Promise<ToolResult<unknown>> => {
  const userId = num(args.user_id, "user_id");
  await ensureUser(userId);
  const u = getReactiveUser(userId);
  if (!u) return singleResult("get_user_info", {}, { warnings: ["user_not_loaded"] });
  return singleResult("get_user_info", {
    user_id: u.id,
    name: `${u.first_name} ${u.last_name}`.trim(),
    username: u.usernames?.active_usernames?.[0] ?? "",
    /** userTypeRegular / userTypeBot / userTypeDeleted / userTypeUnknown */
    type: u.type._,
    is_contact: u.is_contact,
    is_mutual_contact: u.is_mutual_contact,
    is_close_friend: u.is_close_friend,
    is_premium: u.is_premium,
    is_support: u.is_support,
    language_code: u.language_code || undefined,
    status: u.status?._,   // userStatusOnline / Offline / Recently / LastWeek / LastMonth / Empty
  });
});

registerImplementation("get_members", async (args): Promise<ToolResult<unknown[]>> => {
  const chatId = num(args.chat_id, "chat_id");
  const raw = args.limit as number | undefined;
  const limit = clampLimit("get_members", raw);
  const offset = Math.max(0, Math.floor(optNum(args.offset) ?? 0));
  await ensureChat(chatId);
  const chat = getReactiveChat(chatId);
  if (!chat) return listResult("get_members", raw, [], { warnings: ["chat_not_loaded"] });

  const toMember = (m: chatMember) => {
    const uid = memberUserId(m);
    const u = uid ? getReactiveUser(uid) : undefined;
    return {
      member_id: uid ?? (m.member_id._ === "messageSenderChat" ? m.member_id.chat_id : 0),
      member_type: uid ? "user" : "chat",
      name: (u ? `${u.first_name} ${u.last_name}`.trim() : "") || (uid ? String(uid) : ""),
      username: u?.usernames?.active_usernames?.[0] ?? "",
      status: m.status._,
      ...(m.tag ? { tag: m.tag } : {}),
    };
  };

  if (chat.type._ === "chatTypePrivate" || chat.type._ === "chatTypeSecret") {
    const member = await tdlibSend({
      _: "getChatMember",
      chat_id: chatId,
      member_id: { _: "messageSenderUser", user_id: chat.type.user_id },
    });
    return listResult("get_members", raw, [toMember(member)]);
  }
  if (chat.type._ === "chatTypeBasicGroup" || chat.type._ === "chatTypeSupergroup") {
    // loadGroupMembers：超群走 getSupergroupMembers（offset 分页），基本群本地切片
    const { items } = await collectPaged<chatMember>(offset + limit, (size, i) =>
      loadGroupMembers(chat, "recent", "", i, size),
    );
    const page = items.slice(offset, offset + limit).map(toMember);
    return listResult("get_members", raw, page, {
      truncated: page.length >= limit,
      next_cursor: offset + page.length,
    });
  }
  return listResult("get_members", raw, []);
});

registerImplementation("get_member_rights", async (args): Promise<ToolResult<unknown>> => {
  const chatId = num(args.chat_id, "chat_id");
  let memberId = optNum(args.member_id);
  if (memberId === undefined) {
    const me = await tdlibSend({ _: "getMe" });
    memberId = me.id;
  }
  const member: chatMember = await tdlibSend({
    _: "getChatMember",
    chat_id: chatId,
    member_id: { _: "messageSenderUser", user_id: memberId },
  });
  const status = member.status;
  // 管理员看 rights，被限制的看 permissions；创建者/普通成员没有额外权限位
  const rights =
    status._ === "chatMemberStatusAdministrator"
      ? status.rights
      : status._ === "chatMemberStatusRestricted"
        ? status.permissions
        : undefined;
  return singleResult("get_member_rights", {
    chat_id: chatId,
    member_id: memberId,
    /** chatMemberStatusCreator / Administrator / Member / Restricted / Banned / Left */
    status: status._,
    is_owner: status._ === "chatMemberStatusCreator",
    ...(status._ === "chatMemberStatusCreator" ? { is_anonymous: status.is_anonymous } : {}),
    ...(status._ === "chatMemberStatusRestricted" ? { restricted_until_date: status.restricted_until_date } : {}),
    ...(status._ === "chatMemberStatusBanned" ? { banned_until_date: status.banned_until_date } : {}),
    ...(member.tag ? { tag: member.tag } : {}),
    rights,
  });
});
