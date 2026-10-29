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
import type { chat, chatMember, file, message, photo, user } from "tdlib-types";
import { tdlibSend } from "../tdlib";
import { getMessagePlainText } from "../messageText";
import { ensureChat, ensureUser, getReactiveChat, getReactiveUser, getSenderName } from "../senderInfo";
import { loadChatAdministrators, loadGroupFullInfo, loadGroupMembers, memberUserId } from "../groupRights";
import { extractTopicNumber } from "../directMessagesTopics";
import { registerImplementation, resolveToolThread, turnAllowsThreadId, type ResolvedThread } from "./call.ts";
import { clampLimit, collectPaged, listResult, singleResult } from "./limits.ts";
import { linkPreviewInfo, type LinkPreviewInfo } from "./linkPreview.ts";
import type { ToolOutcome, ToolResult } from "./types.ts";

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
  /** 只有用户自己发的（含马甲身份）才带 true；不是自己发的就没这个字段（省 token） */
  outgoing?: true;
  text: string;
  reply_to_message_id?: number;
  /** 仅线程页（评论线程 / 频道私信 / 话题）且消息属于该会话时才输出；普通页面一律不带 */
  thread_id?: number;
  attachments?: string[];
  /** 本地已下载、可直接交给 read_image 看的图像路径（仅 get_message 输出；没下载完就不给） */
  image_paths?: string[];
}

/** 已下载到本地的文件路径（没下载完 / 路径为空 = 拿不到） */
function downloadedPath(f?: file): string {
  const local = f?.local;
  return local && local.is_downloading_completed && local.path ? local.path : "";
}

/** 最大的已下载图片尺寸（原图优先；原图没下载就退回已下载的较小尺寸） */
function photoPath(p: photo): string {
  const sizes = [...p.sizes].sort((a, b) => b.width * b.height - a.width * a.height);
  for (const s of sizes) {
    const path = downloadedPath(s.photo);
    if (path) return path;
  }
  return "";
}

/**
 * 消息里能直接交给 read_image 的本地图像路径（只收已下载完成的）：
 * 照片 / 贴纸（tgs 除外，工具读不了）/ 动图 / 图片型文档；
 * 原文件没下载时退回已下载的缩略图（质量差些但能看内容）。
 */
function imagePathsOf(msg: message): string[] {
  const c = msg.content;
  if (!c) return [];
  const out: string[] = [];
  const add = (path: string) => {
    if (path && !out.includes(path)) out.push(path);
  };
  switch (c._) {
    case "messagePhoto":
      add(photoPath(c.photo));
      break;
    case "messageSticker":
      if (c.sticker.format._ !== "stickerFormatTgs") add(downloadedPath(c.sticker.sticker));
      if (!out.length) add(downloadedPath(c.sticker.thumbnail?.file));
      break;
    case "messageAnimation":
      add(downloadedPath(c.animation.animation));
      if (!out.length) add(downloadedPath(c.animation.thumbnail?.file));
      break;
    case "messageDocument":
      if (c.document.mime_type.startsWith("image/")) {
        add(downloadedPath(c.document.document));
        if (!out.length) add(downloadedPath(c.document.thumbnail?.file));
      }
      break;
    default:
      break;
  }
  return out;
}

/** `withImages` = 输出 image_paths（只有 get_message 开：整页历史里每条都带路径太吃上下文） */
function toBrief(msg: message, withImages = false): MessageBrief {
  const senderId = msg.sender_id;
  const brief: MessageBrief = {
    message_id: msg.id,
    date: msg.date,
    sender: getSenderName(senderId) || senderKey(senderId) || "unknown",
    sender_id: senderKey(senderId),
    text: getMessagePlainText(msg),
  };
  // TDLib 的 is_outgoing 含马甲身份：sender_id 对不上我也是自己发的，所以只看它
  if (msg.is_outgoing) brief.outgoing = true;
  const reply = replyToId(msg);
  if (reply) brief.reply_to_message_id = reply;
  const topic = msg.topic_id;
  const thread =
    topic?._ === "messageTopicThread"
      ? topic.message_thread_id
      : extractTopicNumber(topic as { _: string } | undefined);
  // 非线程页不输出 thread_id（普通超群消息也常带 messageTopicThread，输出了模型会当参数回传）
  if (thread && turnAllowsThreadId(msg.chat_id)) brief.thread_id = thread;
  const attachments = attachmentsOf(msg);
  if (attachments.length) brief.attachments = attachments;
  if (withImages) {
    const images = imagePathsOf(msg);
    if (images.length) brief.image_paths = images;
  }
  return brief;
}

/**
 * 分页取聊天/线程历史（newest-first），返回精简消息与下一页游标（最旧消息 id）。
 * 线程类型 → 接口的映射与对话页 fetchMessages 一致：
 * 评论线程 getMessageThreadHistory、论坛话题 getForumTopicHistory、
 * 频道私信 getDirectMessagesChatTopicHistory；无线程走整个会话 getChatHistory。
 */
async function fetchHistory(opts: {
  chatId: number;
  thread?: ResolvedThread;
  limit: number;
  fromMessageId?: number;
}): Promise<{ briefs: MessageBrief[]; truncated: boolean; nextCursor: number }> {
  let from = opts.fromMessageId ?? 0;
  const { items, truncated } = await collectPaged<message>(opts.limit, async (size) => {
    const res = opts.thread
      ? opts.thread.kind === "dm"
        ? await tdlibSend({
            _: "getDirectMessagesChatTopicHistory",
            chat_id: opts.chatId,
            topic_id: opts.thread.id,
            from_message_id: from,
            offset: 0,
            limit: size,
          })
        : opts.thread.kind === "forum"
          ? await tdlibSend({
              _: "getForumTopicHistory",
              chat_id: opts.chatId,
              forum_topic_id: opts.thread.id,
              from_message_id: from,
              offset: 0,
              limit: size,
            })
          : await tdlibSend({
              _: "getMessageThreadHistory",
              chat_id: opts.chatId,
              message_id: opts.thread.id,
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
  return { briefs: items.map((msg) => toBrief(msg)), truncated, nextCursor: from };
}

// --- 读历史 ---

registerImplementation("get_recent_messages", async (args): Promise<ToolResult<MessageBrief[]>> => {
  const raw = args.limit as number | undefined;
  const chatId = num(args.chat_id, "chat_id");
  // thread_id 只在三种线程上下文生效（没带时跟着当前界面走）；
  // 非线程页不是"传空"，而是直接不携带 thread 字段（键不出现）
  const thread = await resolveToolThread(chatId, optNum(args.thread_id));
  const { briefs, truncated, nextCursor } = await fetchHistory({
    chatId,
    ...(thread ? { thread } : {}),
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
  return singleResult("get_message", toBrief(msg, true));
});

registerImplementation("get_reply_chain", async (args): Promise<ToolResult<MessageBrief[]>> => {
  const chatId = num(args.chat_id, "chat_id");
  const messageId = num(args.message_id, "message_id");
  const raw = args.limit as number | undefined;
  const limit = clampLimit("get_reply_chain", raw);

  // 1) 是线程（超群回复线程 / 频道评论）→ getMessageThreadHistory 一次拿全；
  //    不是线程会抛错，退化为 reply_to 链（kind: comment = 探测，仅决定走线程接口）
  try {
    const thread = await fetchHistory({ chatId, thread: { id: messageId, kind: "comment" }, limit });
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
  return listResult("search_messages", raw, items.map((msg) => toBrief(msg)), {
    truncated,
    next_cursor: from,
    ...(warnings.length ? { warnings } : {}),
  });
});

// --- 查信息 ---

/** 用户精简字段（get_user_info / get_me 共用同一份投影） */
function userSummary(u: user): Record<string, unknown> {
  return {
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
  };
}

/** full=true：TDLib 原始 user + getUserFullInfo（字段很全很长；拿不到 FullInfo 不影响 user） */
async function userFull(u: user): Promise<unknown> {
  const full = await tdlibSend({ _: "getUserFullInfo", user_id: u.id }).catch(() => undefined);
  return { user: u, full_info: full };
}

registerImplementation("get_chat_info", async (args): Promise<ToolResult<unknown>> => {
  const chatId = num(args.chat_id, "chat_id");
  await ensureChat(chatId);
  const chat = getReactiveChat(chatId);
  if (!chat) return singleResult("get_chat_info", {}, { warnings: ["chat_not_loaded"] });
  // full：整份 TDLib chat（位置、最后一条消息、通知设置、权限位…全在里面）
  if (args.full === true) return singleResult("get_chat_info", chat);
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

  // full：TDLib 原始群对象 + FullInfo（FullInfo 里还有成员、邀请链接详情、话题、统计等全量字段）
  if (args.full === true) {
    const t = chat.type;
    const [group, fullInfo] =
      t._ === "chatTypeSupergroup"
        ? await Promise.all([
            tdlibSend({ _: "getSupergroup", supergroup_id: t.supergroup_id }).catch(() => undefined),
            tdlibSend({ _: "getSupergroupFullInfo", supergroup_id: t.supergroup_id }).catch(() => undefined),
          ])
        : await Promise.all([
            tdlibSend({ _: "getBasicGroup", basic_group_id: t.basic_group_id }).catch(() => undefined),
            tdlibSend({ _: "getBasicGroupFullInfo", basic_group_id: t.basic_group_id }).catch(() => undefined),
          ]);
    return singleResult("get_group_info", { group, full_info: fullInfo });
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
  if (args.full === true) return singleResult("get_user_info", await userFull(u));
  return singleResult("get_user_info", userSummary(u));
});

registerImplementation("get_me", async (args): Promise<ToolResult<unknown>> => {
  const me: user = await tdlibSend({ _: "getMe" });
  if (args.full === true) return singleResult("get_me", await userFull(me));
  // my_sender_id 与消息精简结果里的 sender_id 同一套写法，模型可直接比对「这条是不是我发的」
  return singleResult("get_me", { ...userSummary(me), my_sender_id: `user:${me.id}` });
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

// --- 链接预览 ---

registerImplementation("get_link_previews", async (args): Promise<ToolResult<unknown>> => {
  const chatId = num(args.chat_id, "chat_id");
  const ids = (Array.isArray(args.message_ids) ? args.message_ids : []).map((v) => num(v, "message_ids"));
  const previews: LinkPreviewInfo[] = [];
  const noPreview: number[] = [];

  for (const id of ids) {
    const msg: message = await tdlibSend({ _: "getMessage", chat_id: chatId, message_id: id });
    const content = msg.content;
    // 链接预览只挂在文本消息上（TDLib 的 messageText.link_preview）；媒体 caption 里的链接 TDLib 不挂预览
    if (content?._ === "messageText" && content.link_preview) {
      previews.push(linkPreviewInfo(msg.id, content.link_preview));
    } else {
      noPreview.push(msg.id);
    }
  }

  return singleResult("get_link_previews", {
    chat_id: chatId,
    previews,
    ...(noPreview.length ? { no_preview: noPreview } : {}),
  });
});

// --- 用户名 → 对话 ---

/** @username → 对话：用户 / 群 / 频道都可能，按类型补各自的全量信息（群类复用 groupRights 的 loadGroupFullInfo） */
registerImplementation("get_chat_by_username", async (args): Promise<ToolOutcome> => {
  const username = String(args.username ?? "").trim().replace(/^@+/, "");
  if (!username) throw new Error("参数 username 不能为空");

  let found: chat;
  try {
    found = await tdlibSend({ _: "searchPublicChat", username });
  } catch (e) {
    const why = (e as { message?: string })?.message ?? String(e);
    return {
      tool: "get_chat_by_username",
      error: { code: "invalid_args", message: `@${username} 没有对应的公开对话：${why}` },
    };
  }

  const base = {
    username,
    chat_id: found.id,
    title: found.title,
    /** chatTypePrivate / chatTypeBasicGroup / chatTypeSupergroup / chatTypeSecret */
    type: found.type._,
    supergroup_id: found.type._ === "chatTypeSupergroup" ? found.type.supergroup_id : undefined,
    is_channel: found.type._ === "chatTypeSupergroup" ? found.type.is_channel : undefined,
    /** 头像有动画变体（动态头像） */
    animated_photo: !!found.photo?.has_animation,
    has_protected_content: found.has_protected_content,
  };

  if (found.type._ === "chatTypeSupergroup" || found.type._ === "chatTypeBasicGroup") {
    const full = await loadGroupFullInfo(found);
    return singleResult("get_chat_by_username", {
      ...base,
      description: full.description,
      member_count: full.memberCount,
      administrator_count: full.administratorCount,
      banned_count: full.bannedCount,
      is_all_history_available: full.isAllHistoryAvailable,
      linked_chat_id: full.linkedChatId || undefined,
      invite_link: full.inviteLink || undefined,
    });
  }

  if (found.type._ === "chatTypePrivate" || found.type._ === "chatTypeSecret") {
    const userId = found.type.user_id;
    await ensureUser(userId);
    const u = getReactiveUser(userId);
    // 简介要 getUserFullInfo 才有；拿不到（privacy / 报错）就不给，不影响其余字段
    const full = await tdlibSend({ _: "getUserFullInfo", user_id: userId }).catch(() => undefined);
    return singleResult("get_chat_by_username", {
      ...base,
      user: u
        ? {
            user_id: u.id,
            name: `${u.first_name} ${u.last_name}`.trim(),
            username: u.usernames?.active_usernames?.[0] ?? "",
            /** userTypeRegular / userTypeBot / userTypeDeleted / userTypeUnknown */
            type: u.type._,
            is_contact: u.is_contact,
            is_premium: u.is_premium,
            /** 动态头像 */
            animated_avatar: !!u.profile_photo?.has_animation,
            bio: full?.bio?.text ?? "",
          }
        : undefined,
    });
  }

  return singleResult("get_chat_by_username", base);
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
