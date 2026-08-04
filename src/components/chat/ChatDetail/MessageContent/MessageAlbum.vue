<template>
    <div class="overflow-hidden" :class="borderRadiusClass">
        <div v-if="layoutItems.length > 0" class="relative" :style="containerStyle">
            <div v-for="item in layoutItems" :key="item.msgId"
                class="absolute overflow-hidden cursor-pointer bg-gray-200 dark:bg-gray-700"
                :class="{ 'bg-black': item.isVideo }" :style="item.style" @click="openViewer(item.index)"
                @contextmenu.prevent.stop="onTileContextMenu($event, item.index)">
                <img v-if="item.thumbSrc" :src="item.thumbSrc"
                    class="absolute inset-0 w-full h-full object-cover blur-sm scale-105" />
                <img v-if="item.mediaSrc && !item.isVideo" :src="item.mediaSrc"
                    class="absolute inset-0 w-full h-full object-cover" />
                <div v-if="!item.thumbSrc && !item.mediaSrc" class="absolute inset-0 flex items-center justify-center">
                    <svg v-if="item.isVideo" class="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <svg v-else class="w-6 h-6 text-gray-400 animate-pulse" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                    </svg>
                </div>
                <div v-if="item.isVideo" class="absolute inset-0 flex items-center justify-center bg-black/10">
                    <div class="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-white ml-0.5">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
                <span v-if="item.isVideo && item.duration > 0"
                    class="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded leading-none">
                    {{ formatDuration(item.duration) }}
                </span>
            </div>
            <!-- 无描述时：时间状态以胶囊叠加在相册右下角，不占底部独立行 -->
            <div v-if="!captionText && lastDate"
                class="absolute right-1.5 bottom-1.5 bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none flex items-center">
                <MessageStatus :date="lastDate" :isOutgoing="isSelf" :sendingState="lastSendingState" :isRead="isRead"
                    :viewCount="lastViewCount" :authorSignature="authorSignature" overMedia />
            </div>
        </div>
        <div v-if="captionText" class="px-2 pt-1.5 pb-2"
            :class="isSelf ? 'text-gray-900' : 'text-gray-800 dark:text-gray-200'">
            <MessageTextContent :formattedText="captionFormatted" />
        </div>
        <span v-if="captionText" class="block text-right px-2 pb-1"
            :class="isSelf ? 'text-black/50' : 'text-gray-400'">
            <MessageStatus :date="lastDate" :isOutgoing="isSelf" :sendingState="lastSendingState" :isRead="isRead"
                :viewCount="lastViewCount" :authorSignature="authorSignature" />
        </span>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onUnmounted } from 'vue';
import type { message } from 'tdlib-types';
import { convertFileSrc } from '@tauri-apps/api/core';
import { tdlibSend, isFileReady, downloadingFiles, safeDownloadFile } from '../../../../utils/tdlib';
import MessageStatus from './MessageStatus.vue';
import MessageTextContent from './MessageTextContent.vue';
import type { MediaViewerItem } from './MediaViewer.vue';
import { layoutMediaGroup, type MediaGroupSize } from '../../../../utils/mediaGroupLayout';
import { registerMediaItem, unregisterMediaItem, openMediaViewer } from '../../../../store/mediaViewer';
import { getSenderName } from '../../../../utils/senderInfo';
import { buildVideoQualities } from '../../../../utils/videoQualities';
import { settings } from '../../../../store/settings';
import { getChatCategory } from '../../../../utils/autoDownload';
import { isThumbnailImgRenderable } from '../../../../utils/thumbnail';
import { useChatStore } from '../../../../store/chat';

const props = defineProps<{
    messages: message[];
    isSelf: boolean;
    chatId?: number;
    authorSignature?: string;
    isRead?: boolean;
}>();

/**
 * 右击相册中的某条具体媒体时向上冒泡该消息与坐标，便于外层针对「被点击的那一条」
 * 而不是相册第一条构造右键菜单。
 */
const emit = defineEmits<{
    (e: 'messageContextMenu', msg: message, x: number, y: number): void;
}>();

/** 相册某一块媒体被右键：取出对应的那一条消息并冒泡 */
function onTileContextMenu(e: MouseEvent, idx: number) {
    const msg = props.messages[idx];
    if (!msg) return;
    emit('messageContextMenu', msg, e.clientX, e.clientY);
}

// ---- Refs ----
const thumbCache = reactive<Record<number, string>>({});
const mediaCache = reactive<Record<number, string>>({});

// 将相册中每条消息的媒体项注册到全局查看器
watch([() => props.messages, mediaCache], () => {
    for (const msg of props.messages) {
        const c = msg.content;
        const capt = 'caption' in c && c.caption?.text ? c.caption.text : '';
        const captFormatted = ('caption' in c && c.caption?.text) ? c.caption : undefined;
        // 发送人显示名称与消息时间（用于查看器底部信息展示）
        const senderName = getSenderName(msg.sender_id);
        const date = typeof msg.date === 'number' ? msg.date : 0;
        const meta = { messageId: msg.id, chatId: props.chatId };
        const basename = (p: string | undefined) => {
            if (!p) return '';
            return p.split(/[\\/]/).pop() || '';
        };
        let item: MediaViewerItem | null = null;
        if (c._ === 'messagePhoto') {
            const sizes = c.photo.sizes;
            if (sizes.length > 0) {
                const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
                const src = mediaCache[msg.id] || (isFileReady(largest.photo) ? convertFileSrc(largest.photo.local.path) : '');
                const thumb = thumbCache[msg.id] || (c.photo.minithumbnail?.data ? `data:image/jpeg;base64,${c.photo.minithumbnail.data}` : '');
                const localPath = isFileReady(largest.photo) ? largest.photo.local.path : undefined;
                const canDl = largest.photo?.local?.can_be_downloaded;
                // src 未就绪但可下载时也注册占位项，查看器内显示缩略图预览与进度
                if (src || canDl) {
                    item = { type: 'photo', src, thumb: thumb || undefined, caption: capt, captionFormatted: captFormatted, senderName, date, localPath, fileName: basename(localPath), ...meta };
                }
            }
        } else if (c._ === 'messageVideo') {
            const file = c.video.video;
            let src = mediaCache[msg.id] || (isFileReady(file) ? convertFileSrc(file.local.path) : '');
            if (!src && c.video.supports_streaming && file.size > 0) {
                src = `${convertFileSrc(String(file.id), 'tdstream')}?mime=${c.video.mime_type}`;
            }
            if (src) {
                const qualities = buildVideoQualities(
                    c.alternative_videos,
                    src,
                    { width: c.video.width, height: c.video.height },
                );
                const localPath = isFileReady(file) ? file.local.path : undefined;
                item = {
                    type: 'video', src, caption: capt, captionFormatted: captFormatted, senderName, date,
                    localPath,
                    fileName: c.video.file_name || basename(localPath),
                    qualities: qualities.length ? qualities : undefined, ...meta,
                };
            }
        } else if (c._ === 'messageAnimation') {
            const file = c.animation.animation;
            const src = mediaCache[msg.id] || (isFileReady(file) ? convertFileSrc(file.local.path) : '');
            if (src) {
                const localPath = isFileReady(file) ? file.local.path : undefined;
                item = { type: 'animation', src, caption: capt, captionFormatted: captFormatted, senderName, date, localPath, fileName: c.animation.file_name || basename(localPath), ...meta };
            }
        }
        if (item) registerMediaItem(msg.id, item);
    }
}, { immediate: true, deep: true });

onUnmounted(() => {
    for (const msg of props.messages) {
        unregisterMediaItem(msg.id);
    }
});

function openViewer(idx: number) {
    const msg = props.messages[idx];
    if (msg) {
        openMediaViewer(msg.id, 0, 0);
    }
}

// ---- Layout types ----
interface LayoutItem {
    msgId: number; index: number; isVideo: boolean; duration: number;
    aspect: number; style: string; thumbSrc: string | null; mediaSrc: string | null;
}

function getMediaSize(msg: message): MediaGroupSize {
    const c = msg.content;
    if (c._ === 'messagePhoto') {
        const sizes = [...c.photo.sizes].sort((a, b) => a.width * a.height - b.width * b.height);
        if (sizes.length > 0) {
            const largest = sizes[sizes.length - 1];
            return { width: largest.width, height: largest.height };
        }
        return { width: 1, height: 1 };
    }
    if (c._ === 'messageVideo') {
        const { width, height } = c.video;
        return { width, height };
    }
    return { width: 1, height: 1 };
}

const ALBUM_W = 340;

// ---- Refs ----
const layoutItems = ref<LayoutItem[]>([]);
const layoutSize = ref({ width: ALBUM_W, height: ALBUM_W });

// ---- Build layout ----
function rebuildLayout() {
    const msgs = props.messages;
    const n = msgs.length;
    if (n === 0) { layoutItems.value = []; return; }

    const sizes = msgs.map(m => getMediaSize(m));
    const aspects = sizes.map(size => size.width / Math.max(1, size.height));
    const isVideos = msgs.map(m => m.content._ === 'messageVideo');
    const durations = msgs.map(m => m.content._ === 'messageVideo' ? m.content.video.duration : 0);
    const layout = layoutMediaGroup(sizes, ALBUM_W);
    layoutSize.value = { width: layout.width, height: layout.height };

    const result: LayoutItem[] = [];
    for (let mi = 0; mi < layout.items.length; mi++) {
        const msg = msgs[mi];
        const item = layout.items[mi];
        result.push({
            msgId: msg.id, index: mi, isVideo: isVideos[mi], duration: durations[mi], aspect: aspects[mi],
            style: `top:${item.y / layout.height * 100}%;left:${item.x / layout.width * 100}%;width:${item.width / layout.width * 100}%;height:${item.height / layout.height * 100}%;`,
            thumbSrc: thumbCache[msg.id] || null, mediaSrc: mediaCache[msg.id] || null,
        });
    }
    layoutItems.value = result;
}

// Container height
const containerStyle = computed(() => {
    if (layoutItems.value.length === 0) return {};
    return {
        width: `${ALBUM_W}px`,
        maxWidth: '100%',
        aspectRatio: `${layoutSize.value.width} / ${layoutSize.value.height}`,
    };
});

// ---- React to messages ----
watch(() => props.messages, () => rebuildLayout(), { immediate: true, deep: true });

/**
 * 以受限并发执行一组异步任务，避免相册内图片被 for...of await 串行下载。
 * 生产环境每个 RPC（downloadFile/getFile）延迟更高，串行瀑布会把整个相册的
 * 加载时间逐张累加；并发加载能显著提速。限制并发数防止一次性灌爆 Rust 的单线程接收循环。
 */
async function limitConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<boolean>): Promise<boolean> {
    let changed = false;
    let next = 0;
    const runWorker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next++;
            try {
                if (await worker(items[index])) changed = true;
            } catch (_) { /* 单条失败不影响其它 */ }
        }
    };
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(runWorker());
    await Promise.all(workers);
    return changed;
}

// ---- Thumbnail loading ----
// 相册内图片/视频改为受限并发加载（原 for...of await 是串行瀑布，放大了生产环境的 RPC 延迟）
watch(() => props.messages, async (msgs) => {
    const changed = await limitConcurrency(msgs, 4, async (msg) => {
        const c = msg.content;
        if (c._ === 'messagePhoto') return await loadPhoto(msg);
        if (c._ === 'messageVideo') return await loadVideo(msg);
        return false;
    });
    if (changed) rebuildLayout();
}, { immediate: true, deep: true });

async function loadPhoto(msg: message): Promise<boolean> {
    if (msg.content._ !== 'messagePhoto') return false;
    let c = false;
    const photo = msg.content.photo;
    if (photo.minithumbnail?.data && !thumbCache[msg.id]) { thumbCache[msg.id] = `data:image/jpeg;base64,${photo.minithumbnail.data}`; c = true; }
    const smallest = photo.sizes.reduce((a, b) => a.width * a.height < b.width * b.height ? a : b);
    if (smallest?.photo) {
        const f = smallest.photo;
        if (isFileReady(f) && !thumbCache[msg.id]) { thumbCache[msg.id] = convertFileSrc(f.local.path); c = true; }
        else if (f.local.can_be_downloaded && !downloadingFiles.has(f.id)) {
            try {
                await safeDownloadFile(f.id, true);
                const r = await tdlibSend({ _: 'getFile', file_id: f.id });
                if (isFileReady(r)) { thumbCache[msg.id] = convertFileSrc(r.local.path); c = true; }
            } catch (_) { }
        }
    }
    const largest = photo.sizes.reduce((a, b) => a.width * a.height > b.width * b.height ? a : b);
    const ff = largest?.photo;
    if (ff && !mediaCache[msg.id]) {
        if (isFileReady(ff)) { mediaCache[msg.id] = convertFileSrc(ff.local.path); c = true; }
        else if (ff.local.can_be_downloaded && !downloadingFiles.has(ff.id)) {
            // 检查自动下载设置
            let shouldAuto = true;
            if (props.chatId && settings.autoDownload.enabled) {
                const cs = useChatStore();
                const chatData = cs.chats[props.chatId] as any;
                if (chatData) {
                    const category = getChatCategory(chatData);
                    const cfg = settings.autoDownload.photos;
                    shouldAuto = cfg.enabled && cfg[category];
                }
            }
            if (shouldAuto) {
                try {
                    await safeDownloadFile(ff.id, true);
                    const r = await tdlibSend({ _: 'getFile', file_id: ff.id });
                    if (isFileReady(r)) { mediaCache[msg.id] = convertFileSrc(r.local.path); c = true; }
                } catch (_) { }
            }
        }
    }
    return c;
}

async function loadVideo(msg: message): Promise<boolean> {
    if (msg.content._ !== 'messageVideo') return false;
    let c = false;
    const v = msg.content.video;
    if (isFileReady(v.video) && !mediaCache[msg.id]) { mediaCache[msg.id] = convertFileSrc(v.video.local.path); return true; }
    // 检查自动下载设置
    if (props.chatId && settings.autoDownload.enabled) {
        const cs = useChatStore();
        const chatData = cs.chats[props.chatId] as any;
        if (chatData) {
            const category = getChatCategory(chatData);
            const cfg = settings.autoDownload.videos;
            const shouldAuto = cfg.enabled && cfg[category];
            if (shouldAuto) {
                const sizeMB = v.video.size / (1024 * 1024);
                if (sizeMB <= cfg.maxSize && v.video.local.can_be_downloaded && !downloadingFiles.has(v.video.id)) {
                    try {
                        downloadingFiles.add(v.video.id);
                        const r = await tdlibSend({ _: 'downloadFile', file_id: v.video.id, priority: 1, offset: 0, limit: 0, synchronous: true });
                        if (isFileReady(r)) { mediaCache[msg.id] = convertFileSrc(r.local.path); return true; }
                    } catch (_) { } finally {
                        downloadingFiles.delete(v.video.id);
                    }
                }
            }
        }
    }
    // 不满足自动下载条件，仅加载缩略图（相册用 <img> 渲染，仅取静态位图格式；
    // MPEG4/WEBM 动态缩略图无法在 <img> 中显示，跳过以免出现破碎图）
    const thumb = v.thumbnail;
    if (!thumb || !isThumbnailImgRenderable(thumb.format)) return false;
    const thumbFile = thumb.file;
    if (isFileReady(thumbFile) && !thumbCache[msg.id]) { thumbCache[msg.id] = convertFileSrc(thumbFile.local.path); c = true; }
    else if (thumbFile.local.can_be_downloaded) {
        try {
            const r = await tdlibSend({ _: 'downloadFile', file_id: thumbFile.id, priority: 1, offset: 0, limit: 0, synchronous: true });
            if (isFileReady(r)) { thumbCache[msg.id] = convertFileSrc(r.local.path); c = true; }
        } catch (_) { }
    }
    return c;
}

// ---- Computed display helpers ----
const borderRadiusClass = computed(() => {
    if (props.isSelf) return 'rounded-lg rounded-tr-none';
    return 'rounded-lg rounded-tl-none';
});

const lastMsg = computed(() => props.messages[props.messages.length - 1]);

// 相册描述显示规则：
// 仅当相册中【恰好一条】媒体带有非空描述时，才在相册下方显示该描述；
// 0 条或 2 条及以上媒体带描述时都不显示（否则会显得描述归属不明）。
const captionedMessages = computed(() =>
    props.messages.filter((m) => {
        const c = m.content;
        return 'caption' in c && !!c.caption?.text;
    }),
);

const captionText = computed(() => {
    if (captionedMessages.value.length !== 1) return '';
    return (captionedMessages.value[0].content as any).caption?.text || '';
});

const captionFormatted = computed(() => {
    if (captionedMessages.value.length !== 1) return { _: 'formattedText' as const, text: '', entities: [] };
    return (captionedMessages.value[0].content as any).caption || { _: 'formattedText' as const, text: '', entities: [] };
});
const lastDate = computed(() => lastMsg.value?.date || 0);
const lastSendingState = computed(() => lastMsg.value?.sending_state);
const lastViewCount = computed(() => lastMsg.value?.interaction_info?.view_count);

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>
