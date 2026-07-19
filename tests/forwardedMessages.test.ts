import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { messageForwardInfo } from 'tdlib-types';
import {
  getForwardNavigationTarget,
  getForwardOriginKey,
} from '../src/utils/forwardedMessages';

const forwardInfo = (
  origin: messageForwardInfo['origin'],
  source?: messageForwardInfo['source'],
): messageForwardInfo => ({
  _: 'messageForwardInfo',
  origin,
  date: 0,
  source,
  public_service_announcement_type: '',
});

describe('forwarded message source metadata', () => {
  it('prefers an exact forward source when TDLib provides one', () => {
    const info = forwardInfo(
      { _: 'messageOriginUser', sender_user_id: 42 },
      {
        _: 'forwardSource',
        chat_id: -100123,
        message_id: 77,
        sender_name: '',
        date: 0,
        is_outgoing: false,
      },
    );

    expect(getForwardNavigationTarget(info)).toEqual({
      type: 'chat',
      chatId: -100123,
      messageId: 77,
    });
  });

  it('keeps long forward names inside the media width', () => {
    const chatDetailSource = readFileSync(
      new URL('../src/components/chat/ChatDetail/index.vue', import.meta.url),
      'utf8',
    );
    const mediaSource = readFileSync(
      new URL('../src/components/chat/ChatDetail/MessageContent/MessageMediaContent.vue', import.meta.url),
      'utf8',
    );

    expect(chatDetailSource).toContain("? 'w-min max-w-[70%] overflow-hidden shadow-sm'");
    expect(chatDetailSource).toContain('item.msg.forward_info && !isMediaMessage(item.msg)');
    expect(mediaSource).toContain('<button v-if="forwardInfo"');
    expect(mediaSource).toContain('min-w-0 flex-1 truncate');
  });

  it('links channel origins to their original post', () => {
    const info = forwardInfo({
      _: 'messageOriginChannel',
      chat_id: -100456,
      message_id: 91,
      author_signature: '',
    });

    expect(getForwardNavigationTarget(info)).toEqual({
      type: 'chat',
      chatId: -100456,
      messageId: 91,
    });
    expect(getForwardOriginKey(info)).toBe('channel:-100456');
  });

  it('does not invent a destination for privacy-hidden users', () => {
    const info = forwardInfo({
      _: 'messageOriginHiddenUser',
      sender_name: 'Hidden sender',
    });

    expect(getForwardNavigationTarget(info)).toBeUndefined();
    expect(getForwardOriginKey(info)).toBe('hidden:Hidden sender');
  });
});
