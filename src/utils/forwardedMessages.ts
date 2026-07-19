import type { messageForwardInfo } from 'tdlib-types';

export type ForwardNavigationTarget =
  | { type: 'chat'; chatId: number; messageId?: number }
  | { type: 'user'; userId: number };

/**
 * 获取转发来源的稳定标识，用于收藏消息按真正来源分组。
 */
export function getForwardOriginKey(forwardInfo: messageForwardInfo): string {
  const origin = forwardInfo.origin;
  switch (origin._) {
    case 'messageOriginUser':
      return `user:${origin.sender_user_id}`;
    case 'messageOriginHiddenUser':
      return `hidden:${origin.sender_name}`;
    case 'messageOriginChat':
      return `chat:${origin.sender_chat_id}`;
    case 'messageOriginChannel':
      return `channel:${origin.chat_id}`;
  }
}

/**
 * TDLib 的 source 在收藏、回复机器人和讨论组中可能给出更精确的来源消息。
 * 其他场景回退到 origin 中可公开访问的用户或聊天。
 */
export function getForwardNavigationTarget(
  forwardInfo: messageForwardInfo,
): ForwardNavigationTarget | undefined {
  const source = forwardInfo.source;
  if (source?.chat_id) {
    return {
      type: 'chat',
      chatId: source.chat_id,
      ...(source.message_id ? { messageId: source.message_id } : {}),
    };
  }

  const origin = forwardInfo.origin;
  switch (origin._) {
    case 'messageOriginUser':
      return { type: 'user', userId: origin.sender_user_id };
    case 'messageOriginChat':
      return { type: 'chat', chatId: origin.sender_chat_id };
    case 'messageOriginChannel':
      return {
        type: 'chat',
        chatId: origin.chat_id,
        ...(origin.message_id ? { messageId: origin.message_id } : {}),
      };
    case 'messageOriginHiddenUser':
      return undefined;
  }
}
