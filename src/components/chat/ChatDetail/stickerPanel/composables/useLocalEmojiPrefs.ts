import { computed } from 'vue';
import { settings } from '../../../../../store/settings';
import { EMOJI_PAYLOAD, type EmojiPayloadItem } from '../data/emojiPayload';

/** 最近使用普通 emoji 上限 */
const RECENT_LIMIT = 32;

/** 由分类 payload 构建 emoji 快速查找表（原生字符串 → 项） */
const emojiById = new Map<string, EmojiPayloadItem>();
for (const cat of EMOJI_PAYLOAD) {
  for (const it of cat.items) {
    if (!emojiById.has(it.emoji)) emojiById.set(it.emoji, it);
  }
}

/** 查找某个原生 emoji 是否存在于本地数据集 */
export function findLocalEmoji(emoji: string): EmojiPayloadItem | undefined {
  return emojiById.get(emoji);
}

/**
 * 本地普通 emoji 的最近使用 / 收藏管理（完全本地，持久化到 settings）。
 *
 * settings.stickerPanel.recentEmoji / favoriteEmoji 存储原生 emoji 字符串。
 */
export function useLocalEmojiPrefs() {
  /** 最近使用（前面为最新） */
  const recentEmoji = computed<string[]>(() => settings.stickerPanel.recentEmoji);
  /** 收藏 */
  const favoriteEmoji = computed<string[]>(() => settings.stickerPanel.favoriteEmoji);
  /** 全局肤色 0-6 */
  const skinTone = computed<number>(() => settings.stickerPanel.skinTone);

  /** 记录一次使用：放入最近列表顶部并去重、裁剪 */
  function addRecent(emoji: string) {
    const list = settings.stickerPanel.recentEmoji.filter((e) => e !== emoji);
    list.unshift(emoji);
    if (list.length > RECENT_LIMIT) list.length = RECENT_LIMIT;
    settings.stickerPanel.recentEmoji = list;
  }

  /** 收藏 / 取消收藏 */
  function toggleFavorite(emoji: string) {
    const fav = settings.stickerPanel.favoriteEmoji;
    if (fav.includes(emoji)) {
      settings.stickerPanel.favoriteEmoji = fav.filter((e) => e !== emoji);
    } else {
      settings.stickerPanel.favoriteEmoji = [emoji, ...fav];
    }
  }

  function isFavorite(emoji: string): boolean {
    return settings.stickerPanel.favoriteEmoji.includes(emoji);
  }

  /** 设置肤色 */
  function setSkinTone(tone: number) {
    settings.stickerPanel.skinTone = tone;
  }

  return { recentEmoji, favoriteEmoji, skinTone, addRecent, toggleFavorite, isFavorite, setSkinTone };
}
