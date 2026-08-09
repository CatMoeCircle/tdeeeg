import { ref } from 'vue';
import { tdlibSend, isFileReady, downloadingFiles } from '../utils/tdlib';
import { DL_PRIORITY } from '../utils/downloadPriority';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { sticker, file } from 'tdlib-types';
import { useDownloadStore } from './downloads';
import { isThumbnailImgRenderable } from '../utils/thumbnail';

/** 单个自定义 emoji 的加载状态 */
export interface CustomEmojiState {
  /** 原始 custom_emoji_id */
  id: string;
  /** 贴纸数据（从 getCustomEmojiStickers 返回） */
  sticker?: sticker;
  /** 缩略图 data URL（minithumbnail 或缩略图文件路径转换） */
  thumbnailUrl?: string;
  /** 完整贴纸的本地路径（已下载完成） */
  filePath?: string;
  /** 是否正在加载缩略图 */
  loadingThumbnail: boolean;
  /** 是否正在下载完整文件 */
  loadingFile: boolean;
  /** 是否已下载完成 */
  ready: boolean;
  /** 是否已发起过拉取（getCustomEmojiStickers）。
   *  与 loadingFile/loadingThumbnail 区分：placeholder 刚创建时 loading 为 true
   *  但不代表已在拉取，用此标志判断“已真正请求过”以避免重复请求与漏请求。 */
  fetched: boolean;
}

/** 全局自定义 emoji 缓存 */
const emojiCache = ref<Record<string, CustomEmojiState>>({});

/** 等待中的批量请求 */
let pendingIds: Set<string> = new Set();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 批量获取自定义 emoji 贴纸
 * 合并短时间内的多次请求，减少 TDLib 调用次数
 */
async function fetchCustomEmojiStickers(ids: string[]) {
  if (ids.length === 0) return;
  try {
    const result = await tdlibSend({
      _: 'getCustomEmojiStickers',
      custom_emoji_ids: ids,
    }) as { stickers: sticker[] };

    if (!result.stickers) return;

    for (const s of result.stickers) {
      const state = emojiCache.value[s.id];
      if (!state) continue;

      state.sticker = s;

      // 尝试加载缩略图（仅静态位图格式可用于 <img>；TGS/WEBM/MPEG4 动态缩略图跳过）
      const thumb = s.thumbnail && isThumbnailImgRenderable(s.thumbnail.format) ? s.thumbnail : undefined;
      if (thumb && isFileReady(thumb.file)) {
        state.thumbnailUrl = convertFileSrc(thumb.file.local.path);
        state.loadingThumbnail = false;
      } else if (thumb && thumb.file.local.can_be_downloaded && !thumb.file.local.is_downloading_active) {
        // 下载缩略图
        downloadThumbnail(s.id, thumb.file.id);
      } else {
        state.loadingThumbnail = false;
      }

      // 检查主文件是否已就绪
      if (isFileReady(s.sticker)) {
        state.filePath = convertFileSrc(s.sticker.local.path);
        state.ready = true;
        state.loadingFile = false;
      } else if (s.sticker.local.can_be_downloaded && !s.sticker.local.is_downloading_active) {
        // 下载主文件
        downloadStickerFile(s.id, s.sticker.id);
      } else {
        state.loadingFile = false;
      }
    }
  } catch (e) {
    console.error('Failed to fetch custom emoji stickers:', e);
    // 标记所有请求中的为加载完成（显示 fallback）
    for (const id of ids) {
      const state = emojiCache.value[id];
      if (state) {
        state.loadingThumbnail = false;
        state.loadingFile = false;
      }
    }
  }
}

async function downloadThumbnail(emojiId: string, fileId: number) {
  if (downloadingFiles.has(fileId)) return;
  const state = emojiCache.value[emojiId];
  if (!state) return;

  downloadingFiles.add(fileId);
  // 自定义表情缩略图：记录为隐藏资源，不需要来源，分类为 emoji
  await useDownloadStore().registerDownload(fileId, `emoji_${emojiId}_thumb.webp`, '', 0, 'other', undefined, undefined, undefined, true, false, 'emoji');
  try {
    const result = await tdlibSend({
      _: 'downloadFile',
      file_id: fileId,
      priority: DL_PRIORITY.THUMBNAIL,
      offset: 0,
      limit: 0,
      synchronous: true,
    }) as file;
    if (isFileReady(result)) {
      state.thumbnailUrl = convertFileSrc(result.local.path);
    }
  } catch (e) {
    console.error('Failed to download emoji thumbnail:', e);
  } finally {
    downloadingFiles.delete(fileId);
    state.loadingThumbnail = false;
  }
}

async function downloadStickerFile(emojiId: string, fileId: number) {
  if (downloadingFiles.has(fileId)) return;
  const state = emojiCache.value[emojiId];
  if (!state) return;
  state.loadingFile = true;
  downloadingFiles.add(fileId);
  // 自定义表情完整贴纸：记录为隐藏资源，不需要来源，分类为 emoji
  await useDownloadStore().registerDownload(fileId, `emoji_${emojiId}.webp`, '', 0, 'sticker', undefined, undefined, undefined, true, false, 'emoji');

  try {
    const result = await tdlibSend({
      _: 'downloadFile',
      file_id: fileId,
      priority: DL_PRIORITY.LAZY_VISIBLE,
      offset: 0,
      limit: 0,
      synchronous: true,
    }) as file;
    if (isFileReady(result)) {
      state.filePath = convertFileSrc(result.local.path);
      state.ready = true;
    }
  } catch (e) {
    console.error('Failed to download custom emoji:', e);
  } finally {
    downloadingFiles.delete(fileId);
    state.loadingFile = false;
  }
}

/**
 * 获取或请求加载自定义 emoji
 * 返回响应式的状态对象（通过 emojiCache ref 驱动），组件中直接读取属性即可。
 *
 * @param emojiId 自定义 emoji id
 * @param fetch 是否立即触发拉取/下载。设为 false 时仅创建状态对象，
 *              需视口进入后调用 requestCustomEmoji(id) 再触发（懒加载）。
 */
export function useCustomEmoji(emojiId: string | number, fetch = true): CustomEmojiState {
  const id = String(emojiId);

  // 初始化缓存条目
  if (!emojiCache.value[id]) {
    emojiCache.value[id] = {
      id,
      loadingThumbnail: true,
      loadingFile: true,
      ready: false,
      fetched: false,
    };
    if (fetch) queueFetch(id);
  } else if (fetch && !emojiCache.value[id].sticker && !emojiCache.value[id].filePath) {
    // 之前仅创建了占位（未拉取），现在真正进入视口 → 补触发
    queueFetch(id);
  }

  return emojiCache.value[id];
}

/**
 * 显式触发某个自定义 emoji 的拉取/下载（视口懒加载用）。
 * 幂等：已在加载中/已就绪的 emoji 不会重复请求。
 */
export function requestCustomEmoji(emojiId: string | number): void {
  const id = String(emojiId);
  const state = emojiCache.value[id];
  if (!state) {
    useCustomEmoji(id, false);
    queueFetch(id);
    return;
  }
  // 完整贴纸已就绪 → 无需再次拉取/下载（直接用已下载文件，不重复触发 downloadFile）
  if (state.ready && state.filePath) return;
  // 已发起过拉取（无论是否仍在下载）→ 幂等，不重复请求，避免漏掉首次拉取
  if (state.fetched) return;
  queueFetch(id);
}

/** 将 ID 加入批量队列 */
function queueFetch(id: string) {
  pendingIds.add(id);
  const st = emojiCache.value[id];
  if (st) st.fetched = true;
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      batchTimer = null;
      const ids = [...pendingIds];
      pendingIds = new Set();
      fetchCustomEmojiStickers(ids);
    }, 50); // 50ms 批处理窗口
  }
}
