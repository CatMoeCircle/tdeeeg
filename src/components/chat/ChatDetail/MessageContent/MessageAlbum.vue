<template>
    <div class="overflow-hidden" :class="borderRadiusClass">
        <div v-if="layoutItems.length > 0" class="relative" :style="containerStyle">
            <div v-for="item in layoutItems" :key="item.msgId"
                class="absolute overflow-hidden cursor-pointer bg-gray-200 dark:bg-gray-700"
                :class="{ 'bg-black': item.isVideo }" :style="item.style" @click="openViewer(item.index)">
                <img v-if="item.thumbSrc" :src="item.thumbSrc"
                    class="absolute inset-0 w-full h-full object-cover blur-sm scale-105" />
                <img v-if="item.mediaSrc" :src="item.mediaSrc" class="absolute inset-0 w-full h-full object-cover" />
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
        <p v-if="captionText" class="text-sm whitespace-pre-wrap break-all px-2 pt-1.5 pb-2"
            :class="isSelf ? 'text-white' : 'text-gray-800 dark:text-gray-200'">
            {{ captionText }}
        </p>
        <span class="block text-right px-2 pb-1" :class="isSelf ? 'text-blue-100' : 'text-gray-400'">
            <MessageStatus :date="lastDate" :isOutgoing="isSelf" :sendingState="lastSendingState"
                :isRead="isRead" :viewCount="lastViewCount" :authorSignature="authorSignature" />
        </span>
        <MediaViewer :visible="viewerVisible" :items="viewerItems" :initial-index="viewerIndex"
            @close="viewerVisible = false" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { message } from 'tdlib-types';
import { convertFileSrc } from '@tauri-apps/api/core';
import { tdlibSend, isFileReady } from '../../../../utils/tdlib';
import MessageStatus from './MessageStatus.vue';
import MediaViewer from './MediaViewer.vue';
import type { MediaViewerItem } from './MediaViewer.vue';

const props = defineProps<{
    messages: message[];
    isSelf: boolean;
    chatId?: number;
    authorSignature?: string;
    isRead?: boolean;
}>();

const viewerVisible = ref(false);
const viewerIndex = ref(0);
const viewerItems = computed<MediaViewerItem[]>(() => {
    const items: MediaViewerItem[] = [];
    for (const msg of props.messages) {
        const c = msg.content;
        const capt = 'caption' in c && c.caption?.text ? c.caption.text : '';
        if (c._ === 'messagePhoto') {
            const sizes = c.photo.sizes;
            if (sizes.length > 0) {
                const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
                if (isFileReady(largest.photo)) {
                    items.push({ type: 'photo', src: convertFileSrc(largest.photo.local.path), caption: capt });
                }
            }
        } else if (c._ === 'messageVideo') {
            if (isFileReady(c.video.video)) {
                items.push({ type: 'video', src: convertFileSrc(c.video.video.local.path), caption: capt });
            }
        }
    }
    return items;
});

function openViewer(idx: number) {
    viewerIndex.value = idx;
    viewerVisible.value = true;
}

// ---- Layout types ----
interface LayoutItem {
    msgId: number; index: number; isVideo: boolean; duration: number;
    aspect: number; style: string; thumbSrc: string | null; mediaSrc: string | null;
}

function getAspect(msg: message): number {
    const c = msg.content;
    if (c._ === 'messagePhoto') {
        const sizes = c.photo.sizes;
        if (sizes.length > 0) {
            const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
            if (largest.height > 0) return largest.width / largest.height;
        }
        return 1;
    }
    if (c._ === 'messageVideo') {
        const { width, height } = c.video;
        if (height > 0) return width / height;
        return 16 / 9;
    }
    return 1;
}

const ALBUM_W = 340;

// ---- Refs ----
const layoutItems = ref<LayoutItem[]>([]);
const thumbCache: Record<number, string> = {};
const mediaCache: Record<number, string> = {};

// ---- Build layout ----
function rebuildLayout() {
    const msgs = props.messages;
    const n = msgs.length;
    if (n === 0) { layoutItems.value = []; return; }

    const aspects = msgs.map(m => getAspect(m));
    const isVideos = msgs.map(m => m.content._ === 'messageVideo');
    const durations = msgs.map(m => m.content._ === 'messageVideo' ? m.content.video.duration : 0);

    interface Row { items: number[]; rowH: number; itemW: number[] }
    let rows: Row[] = [];

    if (n === 1) {
        rows = [{ items: [0], rowH: 100, itemW: [100] }];
    } else if (n === 2) {
        const a0 = Math.max(aspects[0], 0.5), a1 = Math.max(aspects[1], 0.5), t = a0 + a1;
        rows = [{ items: [0, 1], rowH: 100, itemW: [a0 / t * 100, a1 / t * 100] }];
    } else if (n === 3) {
        const row0H = Math.min(aspects[0], 2) > 1.2 ? 50 : 60;
        rows = [{ items: [0], rowH: row0H, itemW: [100] }, { items: [1, 2], rowH: 100 - row0H, itemW: [50, 50] }];
    } else if (n === 4) {
        rows = [{ items: [0, 1], rowH: 50, itemW: [50, 50] }, { items: [2, 3], rowH: 50, itemW: [50, 50] }];
    } else if (n === 5) {
        rows = [{ items: [0, 1, 2], rowH: 55, itemW: [34, 33, 33] }, { items: [3, 4], rowH: 45, itemW: [50, 50] }];
    } else if (n === 6) {
        rows = [{ items: [0, 1, 2], rowH: 55, itemW: [34, 33, 33] }, { items: [3, 4, 5], rowH: 45, itemW: [34, 33, 33] }];
    } else {
        const parts = n <= 7 ? [3, n - 3] : n <= 9 ? [3, 3, n - 6] : [3, 3, n - 6];
        let idx = 0;
        for (const count of parts) {
            const indices: number[] = []; const widths: number[] = [];
            for (let ci = 0; ci < count; ci++) { indices.push(idx); widths.push(100 / count); idx++; }
            rows.push({ items: indices, rowH: count / n * 100, itemW: widths });
        }
    }

    const result: LayoutItem[] = [];
    let topPct = 0;
    for (const row of rows) {
        let leftPct = 0;
        for (let ci = 0; ci < row.items.length; ci++) {
            const mi = row.items[ci];
            const msg = msgs[mi];
            result.push({
                msgId: msg.id, index: mi, isVideo: isVideos[mi], duration: durations[mi], aspect: aspects[mi],
                style: `top:${topPct}%;left:${leftPct}%;width:${row.itemW[ci]}%;height:${row.rowH}%;`,
                thumbSrc: thumbCache[msg.id] || null, mediaSrc: mediaCache[msg.id] || null,
            });
            leftPct += row.itemW[ci];
        }
        topPct += row.rowH;
    }
    layoutItems.value = result;
}

// Container height
const containerStyle = computed(() => {
    if (layoutItems.value.length === 0) return {};
    const n = props.messages.length;
    let h: number;
    if (n === 1) {
        const a = getAspect(props.messages[0]);
        h = Math.round(ALBUM_W / Math.max(a, 0.5));
        h = Math.min(h, Math.round(ALBUM_W * 1.5));
    } else {
        h = Math.round(ALBUM_W * 0.85);
    }
    return { width: `${ALBUM_W}px`, height: `${h}px` };
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
        else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
            try {
                const r = await tdlibSend({ _: 'downloadFile', file_id: f.id, priority: 1, offset: 0, limit: 0, synchronous: true });
                if (isFileReady(r)) { thumbCache[msg.id] = convertFileSrc(r.local.path); c = true; }
            } catch (_) { }
        }
    }
    const largest = photo.sizes.reduce((a, b) => a.width * a.height > b.width * b.height ? a : b);
    const ff = largest?.photo;
    if (ff && !mediaCache[msg.id]) {
        if (isFileReady(ff)) { mediaCache[msg.id] = convertFileSrc(ff.local.path); c = true; }
        else if (ff.local.can_be_downloaded) {
            try {
                const r = await tdlibSend({ _: 'downloadFile', file_id: ff.id, priority: 1, offset: 0, limit: 0, synchronous: true });
                if (isFileReady(r)) { mediaCache[msg.id] = convertFileSrc(r.local.path); c = true; }
            } catch (_) { }
        }
    }
    return c;
}

async function loadVideo(msg: message): Promise<boolean> {
    if (msg.content._ !== 'messageVideo') return false;
    let c = false;
    const v = msg.content.video;
    if (isFileReady(v.video) && !mediaCache[msg.id]) { mediaCache[msg.id] = convertFileSrc(v.video.local.path); return true; }
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
const lastDate = computed(() => lastMsg.value?.date || 0);
const lastSendingState = computed(() => lastMsg.value?.sending_state);
const lastViewCount = computed(() => lastMsg.value?.interaction_info?.view_count);

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>
