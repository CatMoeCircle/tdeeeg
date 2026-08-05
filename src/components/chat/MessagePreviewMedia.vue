<template>
    <div v-if="thumbs.length > 0" class="flex items-center gap-0.5 shrink-0 mr-0.5">
        <div v-for="(t, i) in thumbs" :key="i"
            class="relative w-3 h-3 rounded overflow-hidden shrink-0 bg-gray-200 dark:bg-gray-700">
            <img v-if="t.src" :src="t.src" alt=""
                class="w-full h-full object-cover"
                :class="{ 'blur-[2px] scale-110': t.spoiler }" />
            <!-- 播放按钮仅为装饰：仅展示，无实际播放效果 -->
            <span v-if="t.isVideo" class="absolute inset-0 flex items-center justify-center bg-black/20">
                <PlayIcon class="w-2.5 h-2.5 text-white drop-shadow" fill="currentColor" />
            </span>
            <!-- 剧透：缩略图叠加粒子遮罩（预览中不显示原始内容） -->
            <SpoilerMedia v-if="t.spoiler" :has-spoiler="true" overlay
                :fx="{ count: 60, sizeMin: 1.2, sizeMax: 2, layerBg: 'rgba(0,0,0,0.4)' }" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { Play as PlayIcon } from 'lucide-vue-next';
import type { message } from 'tdlib-types';
import { tdlibSend, isFileReady } from '../../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isThumbnailImgRenderable } from '../../utils/thumbnail';
import SpoilerMedia from './ChatDetail/MessageContent/SpoilerMedia.vue';

const props = defineProps<{
    /** 最后一条消息（图片/视频/相册） */
    message: message | undefined;
    /** 相册所属会话 id（用于抓取相册其余消息）；单图/单视频可省略 */
    chatId?: number;
}>();

interface ThumbData {
    src: string;
    isVideo: boolean;
    /** 是否剧透（剧透时预览缩略图叠加粒子遮罩 + 模糊，不显示原始内容） */
    spoiler: boolean;
}

/** 消息内容是否带有剧透标记（图片/视频） */
function hasSpoiler(msg: message): boolean {
    const c = msg.content;
    if ('has_spoiler' in c) return !!c.has_spoiler;
    return false;
}

/** 构造缩略图数据，附加剧透标记 */
function thumb(src: string, isVideo: boolean, msg: message): ThumbData {
    return { src, isVideo, spoiler: hasSpoiler(msg) };
}

const thumbs = ref<ThumbData[]>([]);

/** 相册缩略图缓存：key = `${chatId}:${mediaAlbumId}`，null 表示该相册已查过且无可用缩略图 */
const albumThumbsCache = new Map<string, ThumbData[] | null>();
/** 正在进行的相册抓取，避免同一相册并发重复请求 */
const albumFetchPending = new Map<string, Promise<ThumbData[] | null>>();

/** 单条消息的可预览缩略图（优先用已下载的真实图片，未下载完成时才用 base64 minithumbnail 预览） */
function messageThumb(msg: message): ThumbData | null {
    const c = msg.content;
    if (c._ === 'messagePhoto') {
        const photo = c.photo;
        // 优先用已下载的最小尺寸大图
        const sizes = (photo.sizes || []).slice().sort((a, b) => a.width * a.height - b.width * b.height);
        const smallest = sizes.find((s) => isFileReady(s.photo));
        if (smallest) {
            return thumb(convertFileSrc(smallest.photo.local.path), false, msg);
        }
        // 大图未下载完成时，用 minithumbnail 预览
        if (photo.minithumbnail?.data) {
            return thumb(`data:image/jpeg;base64,${photo.minithumbnail.data}`, false, msg);
        }
        return null;
    }
    if (c._ === 'messageVideo') {
        const video = c.video;
        // 优先用已下载的视频缩略图 / 封面大图
        const vthumb = video.thumbnail;
        if (vthumb && isThumbnailImgRenderable(vthumb.format) && isFileReady(vthumb.file)) {
            return thumb(convertFileSrc(vthumb.file.local.path), true, msg);
        }
        const cover = c.cover;
        if (cover) {
            const coverSizes = (cover.sizes || []).slice().sort((a, b) => a.width * a.height - b.width * b.height);
            const smallest = coverSizes.find((s) => isFileReady(s.photo));
            if (smallest) {
                return thumb(convertFileSrc(smallest.photo.local.path), true, msg);
            }
        }
        // 大图/缩略图未下载完成时，用 minithumbnail 预览（视频缩略图优先，其次封面）
        if (video.minithumbnail?.data) {
            return thumb(`data:image/jpeg;base64,${video.minithumbnail.data}`, true, msg);
        }
        if (cover?.minithumbnail?.data) {
            return thumb(`data:image/jpeg;base64,${cover.minithumbnail.data}`, true, msg);
        }
        return null;
    }
    return null;
}

/** 该消息是否为可展示缩略图的媒体（图片/视频/相册） */
function isPreviewMedia(msg: message | undefined): boolean {
    if (!msg) return false;
    return msg.content._ === 'messagePhoto' || msg.content._ === 'messageVideo';
}

/** 该消息是否属于相册 */
function isAlbum(msg: message | undefined): boolean {
    return !!msg && !!msg.media_album_id && msg.media_album_id !== '0' && isPreviewMedia(msg);
}

/** 抓取相册中的前 N 条消息缩略图（最多 3 个），带缓存 */
async function fetchAlbumThumbs(msg: message, chatId: number): Promise<ThumbData[]> {
    const albumId = msg.media_album_id;
    const key = `${chatId}:${albumId}`;
    if (albumThumbsCache.has(key)) {
        return albumThumbsCache.get(key) || [];
    }
    if (albumFetchPending.has(key)) {
        const p = albumFetchPending.get(key)!;
        const r = await p;
        return r || [];
    }

    const task = (async (): Promise<ThumbData[] | null> => {
        try {
            // getChatHistory 返回 newest-first；向后翻取相册其余成员
            const result = await tdlibSend({
                _: 'getChatHistory',
                chat_id: chatId,
                from_message_id: msg.id,
                offset: 0,
                limit: 9,
                only_local: false,
            }) as any;
            const msgs: message[] = (result.messages || []).filter((m: any): m is message => !!m);
            // 收集同相册消息，按 id 升序（先发送的在前），取前 3 个
            const albumMsgs = msgs
                .filter((m: any) => m.media_album_id === albumId && isPreviewMedia(m))
                .sort((a, b) => a.id - b.id)
                .slice(0, 3);
            if (albumMsgs.length === 0) return null;
            const list: ThumbData[] = [];
            for (const am of albumMsgs) {
                const t = messageThumb(am);
                if (t) list.push(t);
                if (list.length >= 3) break;
            }
            return list.length > 0 ? list : null;
        } catch (e) {
            return null;
        }
    })();

    albumFetchPending.set(key, task);
    try {
        const result = await task;
        albumThumbsCache.set(key, result);
        return result || [];
    } finally {
        albumFetchPending.delete(key);
    }
}

async function load() {
    const msg = props.message;
    if (!msg || !isPreviewMedia(msg)) {
        thumbs.value = [];
        return;
    }
    if (isAlbum(msg) && props.chatId) {
        thumbs.value = await fetchAlbumThumbs(msg, props.chatId);
        return;
    }
    const t = messageThumb(msg);
    thumbs.value = t ? [t] : [];
}

watch(() => [props.message, props.chatId], () => { void load(); });
onMounted(() => { void load(); });
</script>
