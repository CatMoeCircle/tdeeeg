<template>
    <div class="overflow-hidden" :class="borderRadiusClass">
        <div v-if="layoutItems.length > 0" class="relative" :style="containerStyle">
            <div v-for="item in layoutItems" :key="item.msgId"
                class="absolute overflow-hidden cursor-pointer bg-gray-200 dark:bg-gray-700"
                :class="{ 'bg-black': item.isVideo }" :style="item.style" @click="openViewer(item.index)">
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
        </div>
        <div v-if="captionText" class="px-2 pt-1.5 pb-2"
            :class="isSelf ? 'text-white/90' : 'text-gray-800 dark:text-gray-200'">
            <MessageTextContent :formattedText="captionFormatted" />
        </div>
        <span class="block text-right px-2 pb-1" :class="isSelf ? 'text-blue-100' : 'text-gray-400'">
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
import { settings } from '../../../../store/settings';
import { getChatCategory } from '../../../../utils/autoDownload';
import { useChatStore } from '../../../../store/chat';

const props = defineProps<{
    messages: message[];
    isSelf: boolean;
    chatId?: number;
    authorSignature?: string;
    isRead?: boolean;
}>();

// ---- Refs ----
const thumbCache = reactive<Record<number, string>>({});
const mediaCache = reactive<Record<number, string>>({});

// 将相册中每条消息的媒体项注册到全局查看器
watch([() => props.messages, mediaCache], () => {
    for (const msg of props.messages) {
        const c = msg.content;
        const capt = 'caption' in c && c.caption?.text ? c.caption.text : '';
        let item: MediaViewerItem | null = null;
        if (c._ === 'messagePhoto') {
            const sizes = c.photo.sizes;
            if (sizes.length > 0) {
                const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
                const src = mediaCache[msg.id] || (isFileReady(largest.photo) ? convertFileSrc(largest.photo.local.path) : '');
                const thumb = thumbCache[msg.id] || (c.photo.minithumbnail?.data ? `data:image/jpeg;base64,${c.photo.minithumbnail.data}` : '');
                if (src) {
                    item = { type: 'photo', src, thumb: thumb || undefined, caption: capt };
                }
            }
        } else if (c._ === 'messageVideo') {
            const file = c.video.video;
            let src = mediaCache[msg.id] || (isFileReady(file) ? convertFileSrc(file.local.path) : '');
            if (!src && c.video.supports_streaming && file.size > 0) {
                src = `${convertFileSrc(String(file.id), 'tdstream')}?mime=${c.video.mime_type}`;
            }
            if (src) {
                item = { type: 'video', src, caption: capt };
            }
        } else if (c._ === 'messageAnimation') {
            const file = c.animation.animation;
            const src = mediaCache[msg.id] || (isFileReady(file) ? convertFileSrc(file.local.path) : '');
            if (src) {
                item = { type: 'animation', src, caption: capt };
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

// ---- Thumbnail loading ----
watch(() => props.messages, async (msgs) => {
    let changed = false;
    for (const msg of msgs) {
        const c = msg.content;
        if (c._ === 'messagePhoto') { if (await loadPhoto(msg)) changed = true; }
        else if (c._ === 'messageVideo') { if (await loadVideo(msg)) changed = true; }
    }
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
    // 不满足自动下载条件，仅加载缩略图
    const thumb = v.thumbnail?.file;
    if (!thumb) return false;
    if (isFileReady(thumb) && !thumbCache[msg.id]) { thumbCache[msg.id] = convertFileSrc(thumb.local.path); c = true; }
    else if (thumb.local.can_be_downloaded) {
        try {
            const r = await tdlibSend({ _: 'downloadFile', file_id: thumb.id, priority: 1, offset: 0, limit: 0, synchronous: true });
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
const captionText = computed(() => {
    for (let i = props.messages.length - 1; i >= 0; i--) {
        const c = props.messages[i].content;
        if ('caption' in c && c.caption?.text) return c.caption.text;
    }
    return '';
});

const captionFormatted = computed(() => {
    for (let i = props.messages.length - 1; i >= 0; i--) {
        const c = props.messages[i].content;
        if ('caption' in c && c.caption) return c.caption;
    }
    return { _: 'formattedText' as const, text: '', entities: [] };
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
