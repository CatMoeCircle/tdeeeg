import type { ChatType } from 'tdlib-types';

type MessageDisplayDirection = {
  is_outgoing?: boolean;
  sender_id: {
    _: string;
    user_id?: number;
  };
  forward_info?: unknown;
};

export const SAVED_MESSAGES_TITLE = '收藏';

/** TDLib 将收藏表示为与当前账号自己的私聊。 */
export const isSavedMessagesChat = (
  chat: { type?: ChatType },
  currentUserId?: number,
) => chat.type?._ === 'chatTypePrivate' && chat.type.user_id === currentUserId;

/**
 * 是否为「通过马甲身份发送」的消息。
 *
 * 使用马甲/分身账号在群组发消息时，TDLib 会把消息标记为 `is_outgoing === true`
 * （表明是当前账号发出的），但 `sender_id` 是马甲的身份（user_id 不等于当前账号）。
 * 这类消息需要按"自己发送"处理（气泡靠右、颜色/状态等），但顶部仍保留发送者名称。
 *
 * @param message - 消息对象
 * @param currentUserId - 当前登录用户 id
 * @returns 是马甲发出的消息返回 `true`，否则返回 `false`
 */
export const isOutgoingAliasMessage = (
  message: MessageDisplayDirection,
  currentUserId?: number,
): boolean => {
  if (message.is_outgoing !== true) return false;
  const sentByCurrentUser = message.sender_id._ === 'messageSenderUser'
    && message.sender_id.user_id === currentUserId;
  return !sentByCurrentUser;
};

/** 收藏中的转发内容按收到的消息显示，自己直接发送的笔记仍按发出显示。 */
export const isOutgoingMessageForDisplay = (
  message: MessageDisplayDirection,
  chat: { type?: ChatType } | undefined,
  currentUserId?: number,
) => {
  const sentByCurrentUser = message.sender_id._ === 'messageSenderUser'
    && message.sender_id.user_id === currentUserId;
  // 马甲身份发送的消息同样按"自己发送"处理
  const sentByAlias = message.is_outgoing === true && !sentByCurrentUser;

  return (sentByCurrentUser || sentByAlias)
    && !(message.forward_info && chat && isSavedMessagesChat(chat, currentUserId));
};
