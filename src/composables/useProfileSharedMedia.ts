import { onUnmounted, ref, type Ref } from 'vue';
import { onVisibilityChange, unobserveVisibility } from './useSharedIntersectionObserver';
import { enqueueViewportLoad, DEFAULT_DWELL_MS } from '../utils/viewportLoadGate';
import { tdlibSend, isFileReady } from '../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isThumbnailImgRenderable } from '../utils/thumbnail';
import { listAlbumCoverFiles } from '../utils/profileMedia';
import { fetchItunesCoverForAudio } from '../utils/itunesCover';
import type { message, SearchMessagesFilter$Input, photo, file, LinkPreviewType, formattedText } from 'tdlib-types';

/** 仅从 textEntityTypeUrl / textEntityTypeTextUrl 实体提取第一个 URL */
function extractUrlFromFormattedText(ft?: formattedText): string | undefined {
    if (!ft?.entities?.length) return undefined;
    for (const e of ft.entities) {
        if (e.type._ === 'textEntityTypeTextUrl' && e.type.url) {
            return e.type.url;
        }
        if (e.type._ === 'textEntityTypeUrl') {
            const u = ft.text.slice(e.offset, e.offset + e.length);
            if (u) return u;
        }
    }
    return undefined;
}

/** 从 formattedText 中去掉 URL 实体后的纯文本（作描述用） */
function stripUrlEntities(ft?: formattedText): string {
    if (!ft?.text) return '';
    if (!ft.entities?.length) return ft.text.trim();
    let out = ft.text;
    // 从后往前删，避免 offset 偏移
    const urlEntities = ft.entities
        .filter((e) => e.type._ === 'textEntityTypeUrl' || e.type._ === 'textEntityTypeTextUrl')
        .sort((a, b) => b.offset - a.offset);
    for (const e of urlEntities) {
        out = out.slice(0, e.offset) + out.slice(e.offset + e.length);
    }
    return out.replace(/\s+/g, ' ').trim();
}

/** 从 linkPreview.type 中提取 minithumbnail 与可下载的封面文件 */
function extractLinkPreviewCover(type: LinkPreviewType): { mini?: string; file?: file } {
    let mini: { data?: string } | undefined;
    let coverFile: file | undefined;

    /** chatPhoto / photo → 取最大尺寸 file（高清封面） */
    const fileFromSizes = (p?: { sizes?: Array<{ photo?: file; width?: number; height?: number }> }) => {
        const sizes = (p?.sizes || []).filter((s) => s.photo);
        if (!sizes.length) return undefined;
        const sorted = sizes.slice().sort((a, b) => (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0));
        return sorted[sorted.length - 1]?.photo;
    };

    switch (type._) {
        case 'linkPreviewTypePhoto':
        case 'linkPreviewTypeArticle':
        case 'linkPreviewTypeApp':
        case 'linkPreviewTypeWebApp':
        case 'linkPreviewTypeChat':
        case 'linkPreviewTypeDirectMessagesChat':
        case 'linkPreviewTypeUser':
        case 'linkPreviewTypeChannelBoost':
        case 'linkPreviewTypeSupergroupBoost':
        case 'linkPreviewTypeVideoChat':
            mini = type.photo?.minithumbnail;
            coverFile = fileFromSizes(type.photo);
            break;
        case 'linkPreviewTypeVideo':
            mini = type.video?.minithumbnail || type.cover?.minithumbnail;
            coverFile = type.cover ? fileFromSizes(type.cover) : undefined;
            break;
        case 'linkPreviewTypeAnimation':
            mini = type.animation?.minithumbnail;
            coverFile = type.animation?.thumbnail
                && isThumbnailImgRenderable(type.animation.thumbnail.format)
                ? type.animation.thumbnail.file
                : undefined;
            break;
        case 'linkPreviewTypeEmbeddedVideoPlayer':
            mini = type.video?.minithumbnail || type.thumbnail?.minithumbnail;
            coverFile = type.thumbnail ? fileFromSizes(type.thumbnail) : undefined;
            break;
        case 'linkPreviewTypeEmbeddedAnimationPlayer':
            mini = type.animation?.minithumbnail || type.thumbnail?.minithumbnail;
            coverFile = type.thumbnail ? fileFromSizes(type.thumbnail) : undefined;
            break;
        case 'linkPreviewTypeEmbeddedAudioPlayer':
            mini = type.thumbnail?.minithumbnail;
            coverFile = type.thumbnail ? fileFromSizes(type.thumbnail) : undefined;
            break;
        default:
            break;
    }
    return {
        mini: mini?.data ? `data:image/jpeg;base64,${mini.data}` : undefined,
        file: coverFile,
    };
}

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
    /** 待下载的缩略图文件（视频封面 / GIF thumbnail） */
    thumbFile?: file;
    /** thumbnail 格式（mpeg4/webm 需用 video 展示） */
    thumbFormat?: string;
    /** 文件名（文档类） */
    fileName?: string;
    /** 文件大小（字节） */
    fileSize?: number;
    /** 链接 URL（链接类） */
    url?: string;
    /** 链接标题（linkPreview.title） */
    linkTitle?: string;
    /** 链接描述（linkPreview.description / 消息正文） */
    linkDescription?: string;
    /** 站点名（linkPreview.site_name） */
    linkSiteName?: string;
    /** 链接预览缩略图（minithumbnail base64） */
    linkMiniSrc?: string;
    /** 链接预览可下载的高清封面文件 */
    linkCoverFile?: file;
    /** 消息时间戳（秒） */
    date?: number;
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
        date: msg.date,
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
            thumbFile,
            thumbFormat: v.thumbnail?.format?._,
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
        // 仅从 textEntityTypeUrl / textEntityTypeTextUrl 提取第一个 URL
        const entityUrl = extractUrlFromFormattedText(c.text);
        const preview = c.link_preview;
        const previewDesc = preview?.description?.text?.trim() || '';
        const captionDesc = stripUrlEntities(c.text);
        const cover = preview ? extractLinkPreviewCover(preview.type) : {};
        return {
            ...base,
            url: entityUrl,
            linkTitle: preview?.title || '',
            linkDescription: previewDesc || captionDesc,
            linkSiteName: preview?.site_name || '',
            linkMiniSrc: cover.mini,
            linkCoverFile: cover.file,
            miniSrc: undefined,
            src: undefined,
            loaded: false,
        };
    }
    if (c._ === 'messageAudio') {
        // 已就绪的高清封面可直接用；未就绪时仍先展示 minithumbnail
        const readyCover = listAlbumCoverFiles(c.audio).find((f) => isFileReady(f));
        // 说明文字中的链接（仅 URL 实体）
        const entityUrl = extractUrlFromFormattedText(c.caption);
        const captionDesc = stripUrlEntities(c.caption);
        return {
            ...base,
            fileName: c.audio.file_name || c.audio.title,
            fileSize: c.audio.audio.size,
            mimeType: c.audio.mime_type,
            audioTitle: c.audio.title || c.audio.file_name || '未知音乐',
            performer: c.audio.performer || '未知艺术家',
            audioDuration: c.audio.duration,
            url: entityUrl,
            linkTitle: c.audio.title || c.audio.file_name || '',
            linkDescription: captionDesc || c.audio.performer || '',
            linkMiniSrc: c.audio.album_cover_minithumbnail?.data
                ? `data:image/jpeg;base64,${c.audio.album_cover_minithumbnail.data}`
                : undefined,
            miniSrc: c.audio.album_cover_minithumbnail?.data ? `data:image/jpeg;base64,${c.audio.album_cover_minithumbnail.data}` : undefined,
            src: readyCover?.local?.path ? convertFileSrc(readyCover.local.path) : undefined,
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
        // GIF thumbnail：静态图可直接 <img>；MPEG4/WEBM 需用 <video>，一并下载
        const thumb = anim.thumbnail;
        const thumbFile = thumb?.file;
        const thumbFormat = thumb?.format?._;
        const imgOk = thumb && isThumbnailImgRenderable(thumb.format);
        return {
            ...base,
            isVideo: true,
            thumbFile,
            thumbFormat,
            miniSrc: anim.minithumbnail?.data ? `data:image/jpeg;base64,${anim.minithumbnail.data}` : undefined,
            src: thumbFile && isFileReady(thumbFile) && imgOk ? convertFileSrc(thumbFile.local.path) : undefined,
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
 * 元素进入视口并停留后才下载高清缩略图，未进入时用 base64 minithumbnail 模糊占位。
 * 照片 Small 尺寸始终下载作清晰网格图；音乐封面不受图片自动下载限制。
 */
export function useSharedMediaCell(
    elRef: Ref<HTMLElement | null>,
    item: Ref<SharedMediaItem>,
) {
    const visibleSrc = ref<string | undefined>(item.value.miniSrc);
    const isLoaded = ref(false);
    const isBlurred = ref(!!item.value.miniSrc && !item.value.src);

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let inView = false;
    let loadScheduled = false;

    function clearDwell() {
        if (dwellTimer !== null) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
        }
    }

    async function doLoad() {
        if (isLoaded.value) return;
        isLoaded.value = true;
        const it = item.value;

        // 照片：Small（最小尺寸）始终下载，作清晰网格占位（不受 autoDownload 管控）
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

        // 视频缩略图/封面：Small 级缩略始终下载
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

        // 音乐专辑封面（例外：不受图片自动下载限制；仅内嵌封面；空则 iTunes Search）
        if (it.contentType === 'messageAudio' && it.message?.content._ === 'messageAudio') {
            const audio = it.message.content.audio;
            const { downloadFileUrl } = await import('../utils/profileMedia');
            for (const coverFile of listAlbumCoverFiles(audio)) {
                try {
                    const url = await downloadFileUrl(coverFile, `shared_music_cover_${it.messageId}_${coverFile.id}.jpg`, 'music_cover');
                    if (url) {
                        visibleSrc.value = url;
                        isBlurred.value = false;
                        return;
                    }
                } catch { /* 尝试下一个候选 */ }
            }
            const itunes = await fetchItunesCoverForAudio(audio);
            if (itunes) {
                visibleSrc.value = itunes;
                isBlurred.value = false;
                return;
            }
        }

        // 如果没有 minithumbnail 也没有高清图，保持无图状态
    }

    function start() {
        const el = elRef.value;
        if (!el) return;

        onVisibilityChange(
            el,
            () => {
                inView = true;
                if (loadScheduled || isLoaded.value) return;
                clearDwell();
                dwellTimer = setTimeout(() => {
                    dwellTimer = null;
                    if (!inView || loadScheduled || isLoaded.value) return;
                    loadScheduled = true;
                    enqueueViewportLoad(doLoad, 'profile');
                }, DEFAULT_DWELL_MS);
            },
            () => {
                inView = false;
                clearDwell();
            }
        );
    }

    onUnmounted(() => {
        clearDwell();
        unobserveVisibility(elRef.value);
    });

    return { visibleSrc, isLoaded, isBlurred, start };
}
