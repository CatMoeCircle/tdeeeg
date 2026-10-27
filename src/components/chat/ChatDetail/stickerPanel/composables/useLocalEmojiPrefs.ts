import { computed } from 'vue';
import { settings } from '../../../../../store/settings';
import type { EmojiPayloadItem } from '../data/emojiPayload';
import { loadEmojiPayload } from '../data/emojiPayloadLoader';

/** 最近使用普通 emoji 上限 */
const RECENT_LIMIT = 32;

/** 由分类 payload 惰性构建 emoji 快速查找表（原生字符串 → 项），首次查询时才加载数据 */
let emojiIndex: Promise<Map<string, EmojiPayloadItem>> | null = null;
function getEmojiIndex() {
  emojiIndex ??= loadEmojiPayload().then((cats) => {
    const map = new Map<string, EmojiPayloadItem>();
    for (const cat of cats) {
      for (const it of cat.items) {
        if (!map.has(it.emoji)) map.set(it.emoji, it);
      }
    }
    return map;
  });
  return emojiIndex;
}

/** 查找某个原生 emoji 是否存在于本地数据集（改为异步：数据需按需加载） */
export async function findLocalEmoji(emoji: string): Promise<EmojiPayloadItem | undefined> {
  return (await getEmojiIndex()).get(emoji);
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
