import type { EmojiPayloadCategory } from './emojiPayload';

let cached: Promise<EmojiPayloadCategory[]> | null = null;

/**
 * 按需加载 emoji 数据（~204KB，不再进主 chunk）。
 * 只加载一次；失败时清空缓存，下次调用可重试。
 */
export function loadEmojiPayload(): Promise<EmojiPayloadCategory[]> {
  cached ??= import('./emojiPayload')
    .then((m) => m.EMOJI_PAYLOAD)
    .catch((e) => {
      cached = null;
      throw e;
    });
  return cached;
}
