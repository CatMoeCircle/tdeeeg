import { reactive } from "vue";
import type { MessageSender, user, chat, chatPhotoInfo, profilePhoto } from "tdlib-types";
import { tdlibSend } from "./tdlib";
import type { Chat } from "../store/chat";

/** 全局发送者缓存（响应式，加载完成后界面自动更新） */
const users = reactive(new Map<number, user>());
const chats = reactive(new Map<number, chat>());

/** 进行中的请求，避免重复请求同一对象 */
const pendingUsers = new Map<number, Promise<void>>();
const pendingChats = new Map<number, Promise<void>>();

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
export async function ensureSenderLoaded(senderId?: MessageSender): Promise<void> {
  if (!senderId) return;
  if (senderId._ === "messageSenderUser") {
    await ensureUser(senderId.user_id);
  } else if (senderId._ === "messageSenderChat") {
    await ensureChat(senderId.chat_id);
  }
}

/** 发送者显示名称 */
export function getSenderName(senderId?: MessageSender): string {
  if (!senderId) return "";
  if (senderId._ === "messageSenderUser") {
    const u = users.get(senderId.user_id);
    return u ? `${u.first_name} ${u.last_name}`.trim() || "未知用户" : "";
  } else if (senderId._ === "messageSenderChat") {
    const c = chats.get(senderId.chat_id);
    return c?.title || "";
  }
  return "";
}

/** 发送者迷你头像 */
export function getSenderPhoto(
  senderId?: MessageSender
): chatPhotoInfo | profilePhoto | undefined {
  if (!senderId) return undefined;
  if (senderId._ === "messageSenderUser") {
    return users.get(senderId.user_id)?.profile_photo;
  } else if (senderId._ === "messageSenderChat") {
    return chats.get(senderId.chat_id)?.photo;
  }
  return undefined;
}

/** 是否为应显示发送者名称/头像的对话（私聊、频道不显示） */
export function isChatGroup(chat: Chat): boolean {
  const t = chat.type?._;
  if (t === "chatTypeBasicGroup") return true;
  if (t === "chatTypeSupergroup") return !(chat.type as any)?.is_channel;
  return false;
}

/** 是否已静音（mute_for > 0，永久静音为极大值） */
export function isChatMuted(chat: Chat): boolean {
  return (chat.notification_settings?.mute_for ?? 0) > 0;
}

/** 是否已顶置（positions 中存在 is_pinned） */
export function isChatPinned(chat: Chat): boolean {
  return !!chat.positions?.some((p) => (p as any)?.is_pinned === true);
}

/** 是否已归档（chat_lists 含 chatListArchive） */
export function isChatArchived(chat: Chat): boolean {
  return !!chat.chat_lists?.some((l) => (l as any)?._ === "chatListArchive");
}
