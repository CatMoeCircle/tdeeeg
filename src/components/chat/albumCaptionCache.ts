import { reactive } from 'vue';
import type { formattedText } from 'tdlib-types';

/** 相册文字缓存：key = `${chatId}:${mediaAlbumId}`，值为相册内第一条带 caption 的文本，无则为 null */
export const albumCaptionCache = reactive(new Map<string, formattedText | null>());

export const albumCacheKey = (chatId: number, albumId: string) => `${chatId}:${albumId}`;
