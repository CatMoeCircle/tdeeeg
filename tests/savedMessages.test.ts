import { describe, expect, it } from 'bun:test';
import { isOutgoingMessageForDisplay } from '../src/utils/savedMessages';

const currentUserId = 42;
const savedMessagesChat = {
  type: { _: 'chatTypePrivate' as const, user_id: currentUserId },
};
const regularPrivateChat = {
  type: { _: 'chatTypePrivate' as const, user_id: 7 },
};

describe('Saved Messages display direction', () => {
  it('shows a forwarded Saved Messages item on the incoming side', () => {
    expect(isOutgoingMessageForDisplay({
      sender_id: { _: 'messageSenderUser', user_id: currentUserId },
      forward_info: {},
    }, savedMessagesChat, currentUserId)).toBe(false);
  });

  it('keeps a directly written Saved Messages note on the outgoing side', () => {
    expect(isOutgoingMessageForDisplay({
      sender_id: { _: 'messageSenderUser', user_id: currentUserId },
    }, savedMessagesChat, currentUserId)).toBe(true);
  });

  it('does not change forwarded-message direction in regular private chats', () => {
    expect(isOutgoingMessageForDisplay({
      sender_id: { _: 'messageSenderUser', user_id: currentUserId },
      forward_info: {},
    }, regularPrivateChat, currentUserId)).toBe(true);
  });
});
