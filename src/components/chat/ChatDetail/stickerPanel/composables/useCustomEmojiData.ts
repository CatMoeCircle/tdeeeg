import { ref } from 'vue';
import type { sticker, stickerSetInfo } from 'tdlib-types';
import { tdlibSend } from '../../../../../utils/tdlib';

/**
 * 自定义 emoji（动画表情）相关 TDLib 数据加载。
 *
 * 提供：
 *  - ensureInstalledCustomEmoji：拉取已安装的 custom emoji sticker sets（GetInstalledStickerSets）
 *  - ensureTrendingCustomEmoji：拉取热门 custom emoji sets（GetTrendingStickerSets）
 *  - loadSet：按 set id 拉取完整 sticker set（GetStickerSet），带游标（避免重复）
 *  - resolveRecentCustomEmoji：把最近使用的 custom emoji id 解析成 sticker（GetCustomEmojiStickers）
 */
export function useCustomEmojiData() {
  /** set id → 已加载的完整 stickers（按需懒加载） */
  const loadedSets = ref<Record<string, sticker[]>>({});
  /** 已安装 custom emoji sets（仅信息） */
  const installedSets = ref<stickerSetInfo[]>([]);
  /** 热门 custom emoji sets（仅信息） */
  const trendingSets = ref<stickerSetInfo[]>([]);

  /** 避免重复拉取的进行中标记 */
  const loading = ref(false);

  async function ensureInstalledCustomEmoji(force = false) {
    if (installedSets.value.length > 0 && !force) return installedSets.value;
    try {
      const res = await tdlibSend({
        _: 'getInstalledStickerSets',
        sticker_type: { _: 'stickerTypeCustomEmoji' },
      });
      installedSets.value = res.sets ?? [];
    } catch { /* 静默 */ }
    return installedSets.value;
  }

  async function ensureTrendingCustomEmoji(force = false) {
    if (trendingSets.value.length > 0 && !force) return trendingSets.value;
    try {
      // 注意：getTrendingStickerSets 的返回是 trendingStickerSets，无 sticker_type 参数；
      // custom emoji 用空闲位置 offset 语义说明见文档。这里为兼容传 offset=0。
      const res: any = await tdlibSend({ _: 'getTrendingStickerSets', offset: 0, limit: 100 });
      trendingSets.value = (res.sets ?? []) as stickerSetInfo[];
    } catch { /* 静默 */ }
    return trendingSets.value;
  }

  /** 懒加载某个 set 的完整 stickers（幂等，带进行中标记避免重复请求） */
  async function loadSet(setId: string, force = false): Promise<sticker[]> {
    if (loadedSets.value[setId] && !force) return loadedSets.value[setId];
    // 简单去重：同一次会话内对同一 set 只拉一次
    if ((loadedSets.value as any)[`__loading_${setId}`] && !force) {
      return loadedSets.value[setId] ?? [];
    }
    (loadedSets.value as any)[`__loading_${setId}`] = true;
    try {
      const res = await tdlibSend({
        _: 'getStickerSet',
        set_id: setId,
        // 新 API 用 set_id 数字；此处 set id 为字符串，按类型传递
      } as any);
      loadedSets.value[setId] = (res as any).stickers ?? [];
    } catch { /* 静默 */ }
    delete (loadedSets.value as any)[`__loading_${setId}`];
    return loadedSets.value[setId] ?? [];
  }

  /** 根据 custom emoji id 列表解析 sticker（用于最近使用区） */
  async function resolveCustomEmojis(ids: string[]): Promise<sticker[]> {
    if (ids.length === 0) return [];
    try {
      const res = await tdlibSend({ _: 'getCustomEmojiStickers', custom_emoji_ids: ids });
      return (res as any).stickers ?? [];
    } catch { return []; }
  }

  return {
    installedSets,
    trendingSets,
    loadedSets,
    loading,
    ensureInstalledCustomEmoji,
    ensureTrendingCustomEmoji,
    loadSet,
    resolveCustomEmojis,
  };
}
