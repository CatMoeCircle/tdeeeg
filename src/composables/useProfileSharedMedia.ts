import { onUnmounted, ref, type Ref } from 'vue';
import { onVisibleOnce, unobserveVisibleOnce } from './useSharedIntersectionObserver';
import { tdlibSend, isFileReady } from '../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isThumbnailImgRenderable } from '../utils/thumbnail';
import type { message, SearchMessagesFilter$Input, photo, file } from 'tdlib-types';

/** 共享媒体网格项 */
export interface SharedMediaItem {
    messageId: number;
    chatId: number;
    /** 高清缩略图 URL（进入视口后加载） */
    src: string | undefined;
    /** base64 minithumbnail 占位（未加载高清图时显示） */
    miniSrc: string | undefined;
    /** 是否已进入视口触发过加载 */
    loaded: boolean;
    /** 消息内容类型 */
    contentType: string;
    /** 是否为视频 */
    isVideo: boolean;
    /** 视频时长（秒） */
    duration?: number;
    /** 完整 tdlib 消息对象（传递给媒体查看器） */
    message?: message;
    /** 原始 photo 对象（用于打开查看器） */
    photo?: photo;
    /** 文件名（文档类） */
    fileName?: string;
    /** 文件大小（字节） */
    fileSize?: number;
    /** 链接 URL（链接类） */
    url?: string;
    /** MIME 类型 */
    mimeType?: string;
    /** 音频标题（来自 messageAudio.title） */
    audioTitle?: string;
    /** 音频作者（来自 messageAudio.performer） */
    performer?: string;
    /** 音频时长（秒，来自 messageAudio.duration） */
    audioDuration?: number;
}

/** 从 message 中提取 SharedMediaItem */
function messageToItem(msg: message): SharedMediaItem | null {
    const c = msg.content;
    const base: Omit<SharedMediaItem, 'src' | 'miniSrc' | 'loaded'> = {
        messageId: msg.id,
        chatId: msg.chat_id,
        contentType: c._,
        isVideo: false,
        message: msg,
    };

    if (c._ === 'messagePhoto') {
        const p = c.photo;
        let mini: string | undefined;
        if (p.minithumbnail?.data) {
            mini = `data:image/jpeg;base64,${p.minithumbnail.data}`;
        }
        const smallestFile = pickSmallestPhotoFile(p);
        return {
            ...base,
            photo: p,
            miniSrc: mini,
            src: smallestFile && isFileReady(smallestFile) ? convertFileSrc(smallestFile.local.path) : undefined,
            loaded: false,
        };
    }
    if (c._ === 'messageVideo') {
        const v = c.video;
        const thumbFile = v.thumbnail && isThumbnailImgRenderable(v.thumbnail.format) ? v.thumbnail.file : undefined;
        const cover = c.cover;
        // minithumbnail: 优先视频缩略图，其次封面
        let mini: string | undefined;
        if (v.minithumbnail?.data) {
            mini = `data:image/jpeg;base64,${v.minithumbnail.data}`;
        } else if (cover?.minithumbnail?.data) {
            mini = `data:image/jpeg;base64,${cover.minithumbnail.data}`;
        }
        return {
            ...base,
            isVideo: true,
            duration: v.duration,
            photo: cover,
            miniSrc: mini,
            src: thumbFile && isFileReady(thumbFile) ? convertFileSrc(thumbFile.local.path) : undefined,
            loaded: false,
        };
    }
    if (c._ === 'messageDocument') {
        return {
            ...base,
            fileName: c.document.file_name,
            fileSize: c.document.document.size,
            mimeType: c.document.mime_type,
            miniSrc: c.document.minithumbnail?.data ? `data:image/jpeg;base64,${c.document.minithumbnail.data}` : undefined,
            src: undefined,
            loaded: false,
        };
    }
    if (c._ === 'messageText') {
        // 提取 URL
        const text = c.text?.text || '';
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        return {
            ...base,
            url: urlMatch?.[0],
            miniSrc: undefined,
            src: undefined,
            loaded: false,
        };
    }
    if (c._ === 'messageAudio') {
        return {
            ...base,
            fileName: c.audio.file_name || c.audio.title,
            fileSize: c.audio.audio.size,
            mimeType: c.audio.mime_type,
            audioTitle: c.audio.title || c.audio.file_name || '未知音乐',
            performer: c.audio.performer || '未知艺术家',
            audioDuration: c.audio.duration,
            miniSrc: c.audio.album_cover_minithumbnail?.data ? `data:image/jpeg;base64,${c.audio.album_cover_minithumbnail.data}` : undefined,
            src: undefined,
            loaded: false,
        };
    }
    if (c._ === 'messageVoiceNote' || c._ === 'messageVideoNote') {
        return {
            ...base,
            fileSize: c._ === 'messageVoiceNote' ? c.voice_note.voice.size : c.video_note.video.size,
            miniSrc: c._ === 'messageVideoNote' && c.video_note.minithumbnail?.data ? `data:image/jpeg;base64,${c.video_note.minithumbnail.data}` : undefined,
            src: undefined,
            loaded: false,
        };
    }
    if (c._ === 'messageAnimation') {
        const anim = c.animation;
        const thumbFile = anim.thumbnail && isThumbnailImgRenderable(anim.thumbnail.format) ? anim.thumbnail.file : undefined;
        return {
            ...base,
            isVideo: true,
            miniSrc: anim.minithumbnail?.data ? `data:image/jpeg;base64,${anim.minithumbnail.data}` : undefined,
            src: thumbFile && isFileReady(thumbFile) ? convertFileSrc(thumbFile.local.path) : undefined,
            loaded: false,
        };
    }
    return null;
}

/** 获取某张 photo 中最小尺寸的文件（用于懒加载下载） */
function pickSmallestPhotoFile(p: photo): file | undefined {
    const sizes = (p.sizes || []).slice().sort((a, b) => a.width * a.height - b.width * b.height);
    return sizes[0]?.photo;
}

/**
 * 创建共享媒体懒加载：进入视口才下载高清图，未进入时用 minithumbnail 模糊占位。
 *
 * 用法：
 *   const { items, loadMore, loading } = useProfileSharedMedia(chatIdRef, filterRef);
 *   // items 是响应式 SharedMediaItem[]，每个 item 有 miniSrc（已就绪）和 src（懒加载）
 */
export function useProfileSharedMedia(
    chatIdRef: Ref<number | undefined>,
    filterRef: Ref<SearchMessagesFilter$Input | undefined>,
) {
    const items = ref<SharedMediaItem[]>([]);
    const loading = ref(false);
    const loadingMore = ref(false);
    const hasMore = ref(true);
    let fromMessageId = 0;

    /** 加载一批消息 */
    async function loadInitial() {
        if (!chatIdRef.value || !filterRef.value) return;
        loading.value = true;
        items.value = [];
        fromMessageId = 0;
        hasMore.value = true;
        try {
            const res = await tdlibSend({
                _: 'searchChatMessages',
                chat_id: chatIdRef.value,
                query: '',
                filter: filterRef.value as any,
                from_message_id: 0,
                offset: 0,
                limit: 30,
            }) as { messages: message[]; next_from_message_id: number };
            const msgs = res.messages ?? [];
            items.value = msgs.map(messageToItem).filter((i): i is SharedMediaItem => i !== null);
            fromMessageId = res.next_from_message_id || (msgs.length > 0 ? msgs[msgs.length - 1].id : 0);
            hasMore.value = msgs.length >= 10;
        } catch (e) {
            console.error('Failed to load shared media', e);
        } finally {
            loading.value = false;
        }
    }

    /** 加载更多（翻页） */
    async function loadMore() {
        if (!chatIdRef.value || !filterRef.value || loadingMore.value || !hasMore.value) return;
        loadingMore.value = true;
        try {
            const res = await tdlibSend({
                _: 'searchChatMessages',
                chat_id: chatIdRef.value,
                query: '',
                filter: filterRef.value as any,
                from_message_id: fromMessageId,
                offset: 0,
                limit: 30,
            }) as { messages: message[]; next_from_message_id: number };
            const msgs = res.messages ?? [];
            const newItems = msgs.map(messageToItem).filter((i): i is SharedMediaItem => i !== null);
            items.value = [...items.value, ...newItems];
            fromMessageId = res.next_from_message_id || (msgs.length > 0 ? msgs[msgs.length - 1].id : 0);
            hasMore.value = msgs.length >= 10;
        } catch (e) {
            console.error('Failed to load more shared media', e);
        } finally {
            loadingMore.value = false;
        }
    }

    /** 当 chatId 或 filter 变化时重新加载 */
    async function reset() {
        await loadInitial();
    }

    return { items, loading, loadingMore, hasMore, loadMore, reset };
}

/**
 * 单个共享媒体格子的懒加载 Hook。
 * 元素进入视口后才下载高清缩略图，未进入时用 base64 minithumbnail 模糊占位。
 */
export function useSharedMediaCell(
    elRef: Ref<HTMLElement | null>,
    item: Ref<SharedMediaItem>,
) {
    const visibleSrc = ref<string | undefined>(item.value.miniSrc);
    const isLoaded = ref(false);
    const isBlurred = ref(!!item.value.miniSrc && !item.value.src);

    function start() {
        const el = elRef.value;
        if (!el) return;

        onVisibleOnce(el, async () => {
            if (isLoaded.value) return;
            isLoaded.value = true;
            const it = item.value;

            // 照片：取最小尺寸文件下载
            if (it.photo) {
                const smallest = pickSmallestPhotoFile(it.photo);
                if (smallest) {
                    try {
                        const { downloadFileUrl } = await import('../utils/profileMedia');
                        const url = await downloadFileUrl(smallest, `shared_media_${it.messageId}_${smallest.id}.jpg`, 'avatar');
                        if (url) {
                            visibleSrc.value = url;
                            isBlurred.value = false;
                            return;
                        }
                    } catch { /* 忽略下载失败 */ }
                }
                // 下载失败但有 minithumbnail，保持模糊显示
            }

            // 视频缩略图/封面
            if (it.isVideo && it.photo) {
                const smallest = pickSmallestPhotoFile(it.photo);
                if (smallest) {
                    try {
                        const { downloadFileUrl } = await import('../utils/profileMedia');
                        const url = await downloadFileUrl(smallest, `shared_video_${it.messageId}_${smallest.id}.jpg`, 'avatar');
                        if (url) {
                            visibleSrc.value = url;
                            isBlurred.value = false;
                            return;
                        }
                    } catch { /* 忽略 */ }
                }
            }

            // 如果没有 minithumbnail 也没有高清图，保持无图状态
        });
    }

    onUnmounted(() => unobserveVisibleOnce(elRef.value));

    return { visibleSrc, isLoaded, isBlurred, start };
}
