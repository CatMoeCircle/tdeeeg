import { reactive } from "vue";
import { onTdlibUpdate, type TdlibUpdate } from "../store/tdlibBus";
import type {
  MessageSender,
  user,
  chat,
  chatPhotoInfo,
  profilePhoto,
  ChatType,
  basicGroup,
  supergroup,
} from "tdlib-types";
import { tdlibSend } from "./tdlib";
import type { Chat } from "../store/chat";
import i18n from "../i18n";

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
const basicGroups = reactive(new Map<number, basicGroup>());
const supergroups = reactive(new Map<number, supergroup>());

/** 进行中的请求，避免重复请求同一对象 */
const pendingUsers = new Map<number, Promise<void>>();
const pendingChats = new Map<number, Promise<void>>();
const pendingBasicGroups = new Map<number, Promise<void>>();
const pendingSupergroups = new Map<number, Promise<void>>();

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

  // 用户/群组 → user 通道；对话标题/头像等 → chat 通道
  const handleUserLike = (update: TdlibUpdate) => {
    const type_ = update._;

    // 用户数据：updateNewUser（新用户）/ updateUser（用户信息变更）
    if (type_ === "updateNewUser" || type_ === "updateUser") {
      const u = (update as any).user;
      if (u && typeof u.id === "number") {
        users.set(u.id, u);
      }
    }
    // 上线状态变更：就地更新缓存用户，驱动列表「最后上线」刷新
    else if (type_ === "updateUserStatus" && typeof (update as any).user_id === "number") {
      const u = users.get((update as any).user_id);
      if (u && (update as any).status) {
        u.status = (update as any).status;
      }
    }
    // 基础群 / 超级群（含频道）成员数等信息
    else if (type_ === "updateBasicGroup" && (update as any).basic_group) {
      basicGroups.set((update as any).basic_group.id, (update as any).basic_group);
    } else if (type_ === "updateSupergroup" && (update as any).supergroup) {
      supergroups.set((update as any).supergroup.id, (update as any).supergroup);
    }
    // updateUserAccentColor / updateUserProfileAccentColor：名称/头像主题色变更
    else if (
      type_ === "updateUserAccentColor" &&
      typeof (update as any).user_id === "number"
    ) {
      const u = users.get((update as any).user_id);
      if (u && typeof (update as any).accent_color_id === "number") {
        u.accent_color_id = (update as any).accent_color_id;
      }
    }
    // updateUserProfileAccentColor：头像渐变主题色变更
    else if (
      type_ === "updateUserProfileAccentColor" &&
      typeof (update as any).user_id === "number"
    ) {
      const u = users.get((update as any).user_id);
      if (u && typeof (update as any).profile_accent_color_id === "number") {
        u.profile_accent_color_id = (update as any).profile_accent_color_id;
      }
    }
  };

  const handleChatLike = (update: TdlibUpdate) => {
    const type_ = update._;
    // 对话数据：新增对话 / 对话信息变更
    if (type_ === "updateNewChat") {
      const c = (update as any).chat;
      if (c && typeof c.id === "number") {
        chats.set(c.id, c);
      }
    } else if (type_ === "updateChatTitle") {
      if (typeof (update as any).chat_id === "number") {
        const c = chats.get((update as any).chat_id);
        if (c && typeof (update as any).title === "string") {
          c.title = (update as any).title;
        }
      }
    } else if (
      (type_ === "updateChatAccentColor" ||
        type_ === "updateChatAccentColors") &&
      typeof (update as any).chat_id === "number"
    ) {
      const c = chats.get((update as any).chat_id);
      if (c) {
        if (typeof (update as any).accent_color_id === "number") {
          c.accent_color_id = (update as any).accent_color_id;
        }
        if (typeof (update as any).profile_accent_color_id === "number") {
          c.profile_accent_color_id = (update as any).profile_accent_color_id;
        }
      }
    } else if (type_ === "updateChatPhoto") {
      if (typeof (update as any).chat_id === "number") {
        const c = chats.get((update as any).chat_id);
        if (c) {
          c.photo = (update as any).photo;
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
      if (typeof (update as any).chat_id !== "number") return;
      const c = chats.get((update as any).chat_id);
      if (!c) return;
      if (
        type_ === "updateChatLastMessage" &&
        (update as any).last_message !== undefined
      ) {
        c.last_message = (update as any).last_message ?? undefined;
      } else if (type_ === "updateChatDraftMessage") {
        c.draft_message = (update as any).draft_message ?? undefined;
      } else if (
        type_ === "updateChatReadInbox" &&
        typeof (update as any).unread_count === "number"
      ) {
        c.unread_count = (update as any).unread_count;
      } else if (
        type_ === "updateChatNotificationSettings" &&
        (update as any).notification_settings
      ) {
        c.notification_settings = (update as any).notification_settings;
      } else if (
        type_ === "updateChatViewAsTopics" &&
        typeof (update as any).view_as_topics === "boolean"
      ) {
        c.view_as_topics = (update as any).view_as_topics;
      }
    }
  };

  onTdlibUpdate("user", handleUserLike);
  onTdlibUpdate("chat", handleChatLike);
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

/** 确保基础群数据已加载（有缓存则直接返回） */
export async function ensureBasicGroup(basicGroupId: number): Promise<void> {
  if (basicGroups.has(basicGroupId)) return;
  const existing = pendingBasicGroups.get(basicGroupId);
  if (existing) return existing;
  const p = tdlibSend({ _: "getBasicGroup", basic_group_id: basicGroupId })
    .then((g: basicGroup) => {
      basicGroups.set(basicGroupId, g);
    })
    .catch(() => { /* 忽略 */ })
    .finally(() => pendingBasicGroups.delete(basicGroupId));
  pendingBasicGroups.set(basicGroupId, p);
  return p;
}

/** 确保超级群/频道数据已加载（有缓存则直接返回） */
export async function ensureSupergroup(supergroupId: number): Promise<void> {
  if (supergroups.has(supergroupId)) return;
  const existing = pendingSupergroups.get(supergroupId);
  if (existing) return existing;
  const p = tdlibSend({ _: "getSupergroup", supergroup_id: supergroupId })
    .then((g: supergroup) => {
      supergroups.set(supergroupId, g);
    })
    .catch(() => { /* 忽略 */ })
    .finally(() => pendingSupergroups.delete(supergroupId));
  pendingSupergroups.set(supergroupId, p);
  return p;
}

export function getReactiveBasicGroup(basicGroupId: number): basicGroup | undefined {
  return basicGroups.get(basicGroupId);
}

export function getReactiveSupergroup(supergroupId: number): supergroup | undefined {
  return supergroups.get(supergroupId);
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
    return `${u.first_name} ${u.last_name}`.trim() || i18n.global.t('lng_credits_box_history_entry_anonymous');
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
