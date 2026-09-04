import { reactive } from "vue";
import { listen } from "@tauri-apps/api/event";
import type {
  MessageSender,
  user,
  chat,
  chatPhotoInfo,
  profilePhoto,
  ChatType,
  chatNotificationSettings,
  message,
  draftMessage,
} from "tdlib-types";
import { tdlibSend } from "./tdlib";
import type { Chat } from "../store/chat";

/**
 * TDLib update 事件 payload 的松散类型。
 * 部分更新类型（如 updateNewUser / updateUserAccentColor / updateChatAccentColor 等）未在
 * tdlib-types 中定义，这里按实际使用到的字段按需声明。
 */
interface TdlibUpdate {
  _?: string;
  user?: user;
  chat?: chat;
  user_id?: number;
  chat_id?: number;
  accent_color_id?: number;
  profile_accent_color_id?: number;
  title?: string;
  photo?: chatPhotoInfo;
  last_message?: message | null;
  draft_message?: draftMessage | null;
  unread_count?: number;
  notification_settings?: chatNotificationSettings;
  view_as_topics?: boolean;
}

/** 从 ChatType 中取出私聊/密聊对应的 user_id（其他类型无该字段） */
function getChatUserId(type?: ChatType): number | undefined {
  if (!type) return undefined;
  if (type._ === "chatTypePrivate" || type._ === "chatTypeSecret") {
    return type.user_id;
  }
  return undefined;
}

/** 全局发送者缓存（响应式，加载完成后界面自动更新） */
const users = reactive(new Map<number, user>());
const chats = reactive(new Map<number, chat>());

/** 进行中的请求，避免重复请求同一对象 */
const pendingUsers = new Map<number, Promise<void>>();
const pendingChats = new Map<number, Promise<void>>();

/** 防止重复注册事件监听器 */
let initialized = false;

/**
 * 监听 TDLib 的更新事件，把 update 中已经携带的用户/对话数据写入本地缓存，
 * 这样后续 ensureUser/ensureChat 就能直接复用，无需重复发 getUser/getChat 请求。
 * 缓存是响应式 Map：更新对象是响应式代理，后续事件对字段的在位修改会触发界面刷新。
 */
export async function initSenderInfo(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await listen<TdlibUpdate>("tdlib-update", (event) => {
    const update = event.payload;
    if (!update || typeof update !== "object") return;
    const type_ = update._;

    // 用户数据：updateNewUser（新用户）/ updateUser（用户信息变更）
    if (type_ === "updateNewUser" || type_ === "updateUser") {
      const u = update.user;
      if (u && typeof u.id === "number") {
        users.set(u.id, u);
      }
    }
    // updateUserAccentColor / updateUserProfileAccentColor：名称/头像主题色变更
    else if (
      type_ === "updateUserAccentColor" &&
      typeof update.user_id === "number"
    ) {
      const u = users.get(update.user_id);
      if (u && typeof update.accent_color_id === "number") {
        u.accent_color_id = update.accent_color_id;
      }
    }
    // updateUserProfileAccentColor：头像渐变主题色变更
    else if (
      type_ === "updateUserProfileAccentColor" &&
      typeof update.user_id === "number"
    ) {
      const u = users.get(update.user_id);
      if (u && typeof update.profile_accent_color_id === "number") {
        u.profile_accent_color_id = update.profile_accent_color_id;
      }
    }
    // 对话数据：新增对话 / 对话信息变更
    else if (type_ === "updateNewChat") {
      const c = update.chat;
      if (c && typeof c.id === "number") {
        chats.set(c.id, c);
      }
    } else if (type_ === "updateChatTitle") {
      if (typeof update.chat_id === "number") {
        const c = chats.get(update.chat_id);
        if (c && typeof update.title === "string") {
          c.title = update.title;
        }
      }
    } else if (
      (type_ === "updateChatAccentColor" ||
        type_ === "updateChatAccentColors") &&
      typeof update.chat_id === "number"
    ) {
      const c = chats.get(update.chat_id);
      if (c) {
        if (typeof update.accent_color_id === "number") {
          c.accent_color_id = update.accent_color_id;
        }
        if (typeof update.profile_accent_color_id === "number") {
          c.profile_accent_color_id = update.profile_accent_color_id;
        }
      }
    } else if (type_ === "updateChatPhoto") {
      if (typeof update.chat_id === "number") {
        const c = chats.get(update.chat_id);
        if (c) {
          c.photo = update.photo;
        }
      }
    } else if (
      type_ === "updateChatLastMessage" ||
      type_ === "updateChatDraftMessage" ||
      type_ === "updateChatReadInbox" ||
      type_ === "updateChatReadOutbox" ||
      type_ === "updateChatUnreadMentionCount" ||
      type_ === "updateChatNotificationSettings" ||
      type_ === "updateChatIsMarkedAsUnread" ||
      type_ === "updateChatViewAsTopics" ||
      type_ === "updateChatAddedToList"
    ) {
      // 仅当该对话已在缓存中且此更新携带了对应字段时才合并
      if (typeof update.chat_id !== "number") return;
      const c = chats.get(update.chat_id);
      if (!c) return;
      if (
        type_ === "updateChatLastMessage" &&
        update.last_message !== undefined
      ) {
        c.last_message = update.last_message ?? undefined;
      } else if (type_ === "updateChatDraftMessage") {
        c.draft_message = update.draft_message ?? undefined;
      } else if (
        type_ === "updateChatReadInbox" &&
        typeof update.unread_count === "number"
      ) {
        c.unread_count = update.unread_count;
      } else if (
        type_ === "updateChatNotificationSettings" &&
        update.notification_settings
      ) {
        c.notification_settings = update.notification_settings;
      } else if (
        type_ === "updateChatViewAsTopics" &&
        typeof update.view_as_topics === "boolean"
      ) {
        c.view_as_topics = update.view_as_topics;
      }
    }
  });
}

/** 确保用户数据已加载（有缓存则直接返回） */
export async function ensureUser(userId: number): Promise<void> {
  if (users.has(userId)) return;
  const existing = pendingUsers.get(userId);
  if (existing) return existing;
  const p = tdlibSend({ _: "getUser", user_id: userId })
    .then((u: user) => {
      users.set(userId, u);
    })
    .catch(() => {
      /* 忽略加载失败 */
    })
    .finally(() => pendingUsers.delete(userId));
  pendingUsers.set(userId, p);
  return p;
}

/** 确保聊天数据已加载（有缓存则直接返回） */
export async function ensureChat(chatId: number): Promise<void> {
  if (chats.has(chatId)) return;
  const existing = pendingChats.get(chatId);
  if (existing) return existing;
  const p = tdlibSend({ _: "getChat", chat_id: chatId })
    .then((c: chat) => {
      chats.set(chatId, c);
    })
    .catch(() => {
      /* 忽略加载失败 */
    })
    .finally(() => pendingChats.delete(chatId));
  pendingChats.set(chatId, p);
  return p;
}

/** 确保消息发送者信息已加载 */
export async function ensureSenderLoaded(
  senderId?: MessageSender,
): Promise<void> {
  if (!senderId) return;
  if (senderId._ === "messageSenderUser") {
    await ensureUser(senderId.user_id);
  } else if (senderId._ === "messageSenderChat") {
    await ensureChat(senderId.chat_id);
  }
}

/** 用户的主用户名（active_usernames[0]），无则返回空串 */
export function getUserUsername(userId: number): string {
  const u = users.get(userId);
  return u?.usernames?.active_usernames?.[0] ?? "";
}

/** 响应式获取缓存的用户对象（未加载返回 undefined，加载后自动驱动视图更新） */
export function getReactiveUser(userId: number): user | undefined {
  return users.get(userId);
}

/** 响应式获取缓存的对话对象（未加载返回 undefined，加载后自动驱动视图更新） */
export function getReactiveChat(chatId: number): chat | undefined {
  return chats.get(chatId);
}

/** 确保内联机器人（via_bot_user_id）的用户数据已加载 */
export async function ensureViaBotLoaded(viaBotUserId?: number): Promise<void> {
  if (viaBotUserId && viaBotUserId > 0) {
    await ensureUser(viaBotUserId);
  }
}

/** 已注销账户的显示名称 */
export const DELETED_ACCOUNT_LABEL = "已注销账户";

/** 按用户 id 取显示名（用于非消息发送者的 user_id，如“被移出群组的成员”）；未缓存返回空串 */
export function getUserDisplayName(userId: number): string {
  const u = users.get(userId);
  if (!u) return "";
  if (u.type?._ === "userTypeDeleted") return DELETED_ACCOUNT_LABEL;
  return `${u.first_name} ${u.last_name}`.trim();
}

/** 发送者显示名称 */
export function getSenderName(senderId?: MessageSender): string {
  if (!senderId) return "";
  if (senderId._ === "messageSenderUser") {
    const u = users.get(senderId.user_id);
    if (!u) return "";
    if (u.type?._ === "userTypeDeleted") return DELETED_ACCOUNT_LABEL;
    return `${u.first_name} ${u.last_name}`.trim() || "未知用户";
  } else if (senderId._ === "messageSenderChat") {
    const c = chats.get(senderId.chat_id);
    return c?.title || "";
  }
  return "";
}

/** 对话显示名称：已注销账户的私聊/密聊对话显示「已注销账户」，否则返回对话标题 */
export function getChatTitle(chat?: Chat): string {
  if (!chat) return "";
  if (isDeletedChat(chat)) return DELETED_ACCOUNT_LABEL;
  return chat.title || "";
}

/** 发送者迷你头像 */
export function getSenderPhoto(
  senderId?: MessageSender,
): chatPhotoInfo | profilePhoto | undefined {
  if (!senderId) return undefined;
  if (senderId._ === "messageSenderUser") {
    return users.get(senderId.user_id)?.profile_photo;
  } else if (senderId._ === "messageSenderChat") {
    return chats.get(senderId.chat_id)?.photo;
  }
  return undefined;
}

/** 发送者是否已删除账户（userTypeDeleted） */
export function isDeletedSender(senderId?: MessageSender): boolean {
  if (!senderId) return false;
  if (senderId._ === "messageSenderUser") {
    return users.get(senderId.user_id)?.type?._ === "userTypeDeleted";
  }
  return false;
}

/** 会话（chat）对应的发送者/用户是否已删除账户 */
export function isDeletedChat(chat: Chat | undefined): boolean {
  if (!chat) return false;
  const uid = getChatUserId(chat.type);
  if (uid) return users.get(uid)?.type?._ === "userTypeDeleted";
  return false;
}

/** 发送者的名称主题色 id（user.accent_color_id / chat.accent_color_id） */
export function getSenderAccentColorId(
  senderId?: MessageSender,
): number | undefined {
  if (!senderId) return undefined;
  if (senderId._ === "messageSenderUser") {
    return users.get(senderId.user_id)?.accent_color_id;
  } else if (senderId._ === "messageSenderChat") {
    return chats.get(senderId.chat_id)?.accent_color_id;
  }
  return undefined;
}

/** 发送者的头像渐变主题色 id（user.profile_accent_color_id / chat.profile_accent_color_id；-1 视为无） */
export function getSenderProfileAccentColorId(
  senderId?: MessageSender,
): number | undefined {
  if (!senderId) return undefined;
  let id: number | undefined;
  if (senderId._ === "messageSenderUser") {
    id = users.get(senderId.user_id)?.profile_accent_color_id;
  } else if (senderId._ === "messageSenderChat") {
    id = chats.get(senderId.chat_id)?.profile_accent_color_id;
  }
  return id !== undefined && id !== -1 ? id : undefined;
}

/**
 * 对话列表项的头像渐变主题色 id（用于无头像时的头像背景）。
 * - 私聊/密聊：取对应用户的 profile_accent_color_id
 * - 群组/频道/机器人：取 chat 的 profile_accent_color_id
 */
export function getChatProfileAccentColorId(
  chat: Chat | undefined,
): number | undefined {
  if (!chat) return undefined;
  let id: number | undefined;
  const t = chat.type?._;
  if (t === "chatTypePrivate" || t === "chatTypeSecret") {
    const uid = getChatUserId(chat.type);
    if (uid) id = users.get(uid)?.profile_accent_color_id;
  } else {
    id = chat.profile_accent_color_id;
  }
  return id !== undefined && id !== -1 ? id : undefined;
}

/**
 * 对话列表项的 accent_color_id（用于无头像时的名称头像背景色）。
 * - 私聊/密聊：取对应 user 的 accent_color_id（chat 本身不带用户 accent）
 * - 群组/频道/机器人：取 chat.accent_color_id（超级群/频道自定义色）
 */
export function getChatAccentColorId(
  chat: Chat | undefined,
): number | undefined {
  if (!chat) return undefined;
  const t = chat.type?._;
  if (t === "chatTypePrivate" || t === "chatTypeSecret") {
    const uid = getChatUserId(chat.type);
    if (uid) return users.get(uid)?.accent_color_id;
    return undefined;
  }
  return chat.accent_color_id;
}

/** 异步确保对话的 accent 色可用（私聊需拉取用户） */
export async function ensureChatAccentLoaded(
  chat: Chat | undefined,
): Promise<void> {
  if (!chat) return;
  const uid = getChatUserId(chat.type);
  if (uid) await ensureUser(uid);
}

/** 是否为应显示发送者名称/头像的对话（私聊、频道不显示） */
export function isChatGroup(chat: Chat): boolean {
  const t = chat.type;
  if (!t) return false;
  if (t._ === "chatTypeBasicGroup") return true;
  if (t._ === "chatTypeSupergroup") return !t.is_channel;
  return false;
}

/** 是否已静音（mute_for > 0，永久静音为极大值） */
export function isChatMuted(chat: Chat): boolean {
  return (chat.notification_settings?.mute_for ?? 0) > 0;
}

/** 是否已顶置（positions 中存在 is_pinned） */
export function isChatPinned(chat: Chat): boolean {
  return !!chat.positions?.some((p) => p.is_pinned === true);
}

/** 是否已归档（chat_lists 含 chatListArchive） */
export function isChatArchived(chat: Chat): boolean {
  return !!chat.chat_lists?.some((l) => l._ === "chatListArchive");
}
