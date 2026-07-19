import type { ChatType } from 'tdlib-types';

type MessageDisplayDirection = {
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

/** 收藏中的转发内容按收到的消息显示，自己直接发送的笔记仍按发出显示。 */
export const isOutgoingMessageForDisplay = (
  message: MessageDisplayDirection,
  chat: { type?: ChatType } | undefined,
  currentUserId?: number,
) => {
  const sentByCurrentUser = message.sender_id._ === 'messageSenderUser'
    && message.sender_id.user_id === currentUserId;

  return sentByCurrentUser
    && !(message.forward_info && chat && isSavedMessagesChat(chat, currentUserId));
};
