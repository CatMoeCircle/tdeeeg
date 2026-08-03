import { ref } from 'vue';
import { tdlibSend, isFileReady, downloadingFiles } from '../utils/tdlib';
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
  // 自定义表情缩略图：记录为隐藏资源，不需要来源
  await useDownloadStore().registerDownload(fileId, `emoji_${emojiId}_thumb.webp`, '', 0, 'other', undefined, undefined, undefined, true);
  try {
    const result = await tdlibSend({
      _: 'downloadFile',
      file_id: fileId,
      priority: 2,
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
  // 自定义表情完整贴纸：记录为隐藏资源，不需要来源
  await useDownloadStore().registerDownload(fileId, `emoji_${emojiId}.webp`, '', 0, 'sticker', undefined, undefined, undefined, true);

  try {
    const result = await tdlibSend({
      _: 'downloadFile',
      file_id: fileId,
      priority: 1,
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
 */
export function useCustomEmoji(emojiId: string | number): CustomEmojiState {
  const id = String(emojiId);

  // 初始化缓存条目
  if (!emojiCache.value[id]) {
    emojiCache.value[id] = {
      id,
      loadingThumbnail: true,
      loadingFile: true,
      ready: false,
    };
    queueFetch(id);
  }

  return emojiCache.value[id];
}

/** 将 ID 加入批量队列 */
function queueFetch(id: string) {
  pendingIds.add(id);
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      batchTimer = null;
      const ids = [...pendingIds];
      pendingIds = new Set();
      fetchCustomEmojiStickers(ids);
    }, 50); // 50ms 批处理窗口
  }
}
