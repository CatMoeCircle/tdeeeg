<template>
    <!-- 外层 div 使用媒体宽度，使图片+文字+时间共享统一宽度（仿 Telegram Web） -->
    <div class="message-media relative" :style="mediaContainerStyle">
        <button v-if="forwardInfo" type="button" :disabled="!forwardNavigable"
            class="flex min-w-0 w-full items-center gap-1 overflow-hidden px-2 pt-2 pb-1 text-left text-xs font-semibold disabled:cursor-default"
            :class="[
                isSelf ? 'text-blue-100' : 'text-blue-500 dark:text-blue-400',
                forwardNavigable ? 'cursor-pointer hover:underline active:opacity-70' : ''
            ]" :title="forwardNavigable ? '跳转到来源' : undefined" @click.stop="emit('openForwardSource')">
            <CornerUpRightIcon class="w-3.5 h-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ forwardName }}</span>
        </button>

        <!-- Caption above media -->
        <div v-if="showCaptionAbove && captionText" class="caption-text px-2 pt-2 pb-1"
            :class="isSelf ? 'text-white/90' : 'text-gray-800 dark:text-gray-200'">
            <MessageTextContent :formattedText="captionFormatted" />
        </div>

        <!-- Media element -->
        <div class="media-wrapper relative px-0">

            <!-- ===== PHOTO ===== -->
            <div v-if="content._ === 'messagePhoto'"
                class="relative overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer group"
                :class="[borderRadiusClass, hasSpoiler ? 'blur-md' : '']" :style="photoSizeStyle" @click="openViewer">
                <!-- Minithumbnail preview -->
                <img v-if="thumbSrc && !mediaSrc" :src="thumbSrc"
                    class="absolute inset-0 w-full h-full object-cover blur-sm scale-105" />
                <!-- Full image (object-cover fills area) -->
                <img v-if="mediaSrc" :src="mediaSrc" class="w-full h-full object-cover select-none"
                    :class="{ 'opacity-0': !imageLoaded }" @load="onImageLoad" @error="onImageError" />
                <!-- Placeholder (reserves space via parent's aspectRatio) -->
                <div v-if="!mediaSrc && !thumbSrc" class="flex items-center justify-center w-full h-full">
                    <svg class="w-8 h-8 text-gray-400 animate-pulse" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                    </svg>
                </div>
            </div>

            <!-- ===== VIDEO ===== -->
            <div v-else-if="content._ === 'messageVideo'"
                class="relative overflow-hidden bg-black cursor-pointer group select-none" :class="borderRadiusClass"
                :style="videoSizeStyle" @click="openViewer">
                <!-- Thumbnail (object-cover fill) -->
                <img v-if="thumbSrc && !videoDownloaded" :src="thumbSrc"
                    class="absolute inset-0 w-full h-full object-cover" :class="hasSpoiler ? 'blur-md' : ''" />
                <div v-else-if="!videoDownloaded" class="absolute inset-0 flex items-center justify-center">
                    <VideoIcon class="w-8 h-8 text-gray-400" />
                </div>

                <!-- Video element (循环播放, 由 IntersectionObserver 控制播放/暂停) -->
                <video v-if="videoDownloaded" ref="videoElRef" :src="mediaSrc" class="w-full h-full object-cover"
                    :class="{ 'invisible': viewerVisible }" :muted="videoMuted" loop playsinline
                    @timeupdate="onInlineVideoTime" @loadedmetadata="onInlineVideoLoaded" @ended="onInlineVideoEnded" />

                <!-- Download progress bar -->
                <div v-if="videoDownloading && videoProgress > 0 && videoProgress < 1"
                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
                    <div class="h-full bg-blue-500 transition-all" :style="{ width: videoProgress * 100 + '%' }"></div>
                </div>

                <!-- Download button overlay (arrow down icon) -->
                <div v-if="!videoDownloaded" class="absolute inset-0 flex items-center justify-center cursor-pointer"
                    @click.stop="handleVideoDownload">
                    <div v-if="!videoDownloading"
                        class="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            class="w-6 h-6 text-white ml-0.5">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </div>
                    <svg v-else class="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                            class="opacity-75" />
                    </svg>
                </div>

                <!-- Remaining time (top-right) -->
                <span v-if="videoDownloaded && inlineVideoDuration > 0"
                    class="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded leading-none">
                    -{{ formatDuration(Math.max(0, inlineVideoDuration - inlineVideoCurrent)) }}
                </span>

                <!-- Mute/unmute toggle (top-left) -->
                <button v-if="videoDownloaded"
                    class="absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    @click.stop="toggleMute">
                    <svg v-if="!videoMuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        class="w-4 h-4">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                </button>

                <!-- Duration badge (bottom-left, pre-download) -->
                <span v-if="!videoDownloaded"
                    class="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded leading-none">
                    {{ formatDuration(videoDuration) }}
                </span>

                <!-- Inline progress bar (bottom edge) -->
                <div v-if="videoDownloaded && inlineVideoDuration > 0"
                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
                    <div class="h-full bg-white transition-all duration-300"
                        :style="{ width: (inlineVideoCurrent / inlineVideoDuration) * 100 + '%' }"></div>
                </div>
            </div>

            <!-- ===== ANIMATION (GIF) ===== -->
            <div v-else-if="content._ === 'messageAnimation'"
                class="relative overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer group select-none"
                :class="borderRadiusClass" :style="animSizeStyle" @click="openViewer">
                <video v-if="mediaSrc" :src="mediaSrc" autoplay loop muted playsinline
                    class="w-full h-full object-cover" />
                <div v-else class="flex items-center justify-center w-full h-full">
                    <span class="text-xs text-gray-500">GIF</span>
                </div>
            </div>

            <!-- Time overlay on media -->
            <div v-if="!captionBelow && date"
                class="absolute right-1.5 bottom-1.5 bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none">
                <MessageStatus :date="date" :isOutgoing="isSelf" :sendingState="sendingState" :isRead="isRead"
                    :viewCount="viewCount" :authorSignature="authorSignature" overMedia />
            </div>
        </div>

        <!-- Caption below -->
        <div v-if="!showCaptionAbove && captionText" class="caption-text px-2 pb-2 pt-1"
            :class="isSelf ? 'text-white/90' : 'text-gray-800 dark:text-gray-200'">
            <MessageTextContent :formattedText="captionFormatted" />
        </div>

        <!-- Time & status below -->
        <span v-if="captionBelow && date" class="block text-right px-2 pb-1"
            :class="isSelf ? 'text-blue-100' : 'text-gray-400'">
            <MessageStatus :date="date" :isOutgoing="isSelf" :sendingState="sendingState" :isRead="isRead"
                :viewCount="viewCount" :authorSignature="authorSignature" />
        </span>

        <!-- Media Viewer portal -->
        <MediaViewer :visible="viewerVisible" :items="viewerItems" :initial-index="0" :initial-time="viewerInitialTime"
            :source-rect="viewerSourceRect" @close="onViewerClose" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { MessageContent, messageForwardInfo, MessageSendingState } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles, safeDownloadFile } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { CornerUpRightIcon, VideoIcon } from 'lucide-vue-next';
import MessageTextContent from './MessageTextContent.vue';
import MessageStatus from './MessageStatus.vue';
import MediaViewer from './MediaViewer.vue';
import type { MediaViewerItem } from './MediaViewer.vue';


const props = defineProps<{
    content: MessageContent & { _: 'messagePhoto' | 'messageVideo' | 'messageAnimation' };
    isSelf: boolean;
    date?: number;
    forwardInfo?: messageForwardInfo;
    forwardName?: string;
    forwardNavigable?: boolean;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
    sendingState?: MessageSendingState;
    isRead?: boolean;
    viewCount?: number;
    authorSignature?: string;
    chatId?: number;
    messageId?: number;
}>();

const emit = defineEmits<{
    openForwardSource: [];
}>();

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
const mediaLoaded = ref(false);
const thumbSrc = ref<string | undefined>(undefined);

// Video state
const videoDownloaded = ref(false);
const videoDownloading = ref(false);
const videoProgress = ref(0);
const videoFileId = ref<number>(0);
const videoElRef = ref<HTMLVideoElement | null>(null);
const inlineVideoCurrent = ref(0);
const inlineVideoDuration = ref(0);
const videoMuted = ref(true);

const videoDuration = computed(() => {
    if (props.content._ === 'messageVideo') return props.content.video.duration;
    return 0;
});

// 已下载视频自动循环播放（IntersectionObserver 控制）
let videoObserver: IntersectionObserver | null = null;

onMounted(() => {
    videoObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const vid = entry.target as HTMLVideoElement;
            if (entry.isIntersecting) {
                vid.play().catch(() => { });
            } else {
                vid.pause();
            }
        }
    }, { threshold: 0.6 });
});

onUnmounted(() => {
    if (videoObserver) videoObserver.disconnect();
});

// 当视频下载完成后，将 videoElRef 加入观察
// IntersectionObserver 会在 observe() 时自动触发初始回调，
// 根据视频是否在视口中决定播放或暂停
watch(videoDownloaded, (downloaded) => {
    if (downloaded && videoElRef.value && videoObserver) {
        videoElRef.value.muted = videoMuted.value;
        videoObserver.observe(videoElRef.value);
    }
}, { flush: 'post' });

// Viewer
const viewerVisible = ref(false);
const viewerInitialTime = ref(0);
const viewerSourceRect = ref<{ x: number; y: number; width: number; height: number } | null>(null);
const viewerItems = computed<MediaViewerItem[]>(() => {
    const items: MediaViewerItem[] = [];
    const c = props.content;
    const capt = 'caption' in c && c.caption?.text ? c.caption.text : '';
    if (c._ === 'messagePhoto' && mediaSrc.value) {
        items.push({ type: 'photo', src: mediaSrc.value, thumb: thumbSrc.value, caption: capt });
    } else if (c._ === 'messageVideo' && mediaSrc.value) {
        items.push({ type: 'video', src: mediaSrc.value, caption: capt });
    } else if (c._ === 'messageAnimation' && mediaSrc.value) {
        items.push({ type: 'video', src: mediaSrc.value, caption: capt });
    }
    return items;
});

// ---- Computed ----

const captionText = computed(() => {
    const c = props.content;
    if ('caption' in c && c.caption?.text) return c.caption.text;
    return '';
});

const captionFormatted = computed(() => {
    const c = props.content;
    if ('caption' in c && c.caption) return c.caption;
    return { _: 'formattedText' as const, text: '', entities: [] };
});

const showCaptionAbove = computed(() => {
    const c = props.content;
    if ('show_caption_above_media' in c) return c.show_caption_above_media;
    return false;
});

const hasSpoiler = computed(() => {
    const c = props.content;
    if ('has_spoiler' in c) return c.has_spoiler;
    return false;
});

const captionBelow = computed(() => !!captionText.value && !showCaptionAbove.value);

const borderRadiusClass = computed(() => {
    const first = props.isFirstInGroup;
    const last = props.isLastInGroup;
    const hasForward = !!props.forwardInfo;
    const hasCap = !!captionText.value;
    if (hasForward || hasCap) {
        if (showCaptionAbove.value && captionText.value) return 'rounded-b-lg';
        if (!showCaptionAbove.value && captionText.value) return 'rounded-t-lg';
    }
    if (props.isSelf) {
        if (first && last) return 'rounded-lg';
        if (first) return 'rounded-tr-none rounded-br-sm rounded-l-lg';
        if (last) return 'rounded-tr-sm rounded-br-lg rounded-l-lg';
        return 'rounded-tr-sm rounded-br-sm rounded-l-lg';
    } else {
        if (first && last) return 'rounded-lg';
        if (first) return 'rounded-tl-none rounded-bl-sm rounded-r-lg';
        if (last) return 'rounded-tl-sm rounded-bl-lg rounded-r-lg';
        return 'rounded-tl-sm rounded-bl-sm rounded-r-lg';
    }
});

// ---- Size helpers ----

function getOriginalRatio(): string | undefined {
    const c = props.content;
    if (c._ === 'messagePhoto') {
        const sizes = c.photo.sizes;
        if (sizes.length === 0) return undefined;
        const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
        if (largest.height === 0) return undefined;
        return `${largest.width} / ${largest.height}`;
    }
    if (c._ === 'messageVideo') {
        const { width, height } = c.video;
        if (height === 0) return undefined;
        return `${width} / ${height}`;
    }
    if (c._ === 'messageAnimation') {
        const { width, height } = c.animation;
        if (height === 0) return undefined;
        return `${width} / ${height}`;
    }
    return undefined;
}

type MediaOrientation = 'portrait' | 'landscape' | 'square';
function getOrientation(): MediaOrientation {
    const c = props.content;
    let w = 1, h = 1;
    if (c._ === 'messagePhoto') {
        const sizes = c.photo.sizes;
        if (sizes.length > 0) {
            const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
            w = largest.width; h = largest.height;
        }
    } else if (c._ === 'messageVideo') {
        w = c.video.width; h = c.video.height;
    } else if (c._ === 'messageAnimation') {
        w = c.animation.width; h = c.animation.height;
    }
    if (h === 0) return 'square';
    const ratio = w / h;
    if (ratio > 1.2) return 'landscape';
    if (ratio < 0.8) return 'portrait';
    return 'square';
}

// Telegram Web 风格尺寸：视频 320px，图片 280px
const PHOTO_W = 280;
const VIDEO_W = 320;

const photoSizeStyle = computed(() => {
    const ratio = getOriginalRatio();
    const orient = getOrientation();
    let w = PHOTO_W;
    if (orient === 'landscape') w = Math.round(PHOTO_W * 1.15);
    else if (orient === 'portrait') w = Math.round(PHOTO_W * 0.85);
    return { width: `${w}px`, aspectRatio: ratio || '1' };
});

const videoSizeStyle = computed(() => {
    const ratio = getOriginalRatio();
    const orient = getOrientation();
    let w = VIDEO_W;
    if (orient === 'portrait') w = Math.round(VIDEO_W * 0.7);
    return { width: `${w}px`, aspectRatio: ratio || '16/9' };
});

const animSizeStyle = computed(() => {
    const ratio = getOriginalRatio();
    let w = PHOTO_W;
    return { width: `${w}px`, aspectRatio: ratio || '1' };
});

/** 外层容器宽度 = 媒体宽度，使图片+文字+时间共享统一宽度 */
const mediaContainerStyle = computed(() => {
    const c = props.content;
    if (c._ === 'messageVideo') return videoSizeStyle.value;
    if (c._ === 'messageAnimation') return animSizeStyle.value;
    return photoSizeStyle.value;
});

// Image state
const imageLoaded = ref(false);
const imageError = ref(false);
function onImageLoad() { imageLoaded.value = true; mediaLoaded.value = true; }
function onImageError() { imageError.value = true; }

function openViewer() {
    if (viewerItems.value.length > 0) {
        // 保存源元素位置用于动画
        if (props.content._ === 'messageVideo' && videoElRef.value) {
            viewerInitialTime.value = videoElRef.value.currentTime;
            const rect = videoElRef.value.getBoundingClientRect();
            viewerSourceRect.value = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            videoElRef.value.pause();
            if (videoObserver) videoObserver.unobserve(videoElRef.value);
        } else {
            viewerSourceRect.value = null;
        }
        viewerVisible.value = true;
    }
}

function onViewerClose(returnTime?: number) {
    viewerVisible.value = false;
    // 恢复内联视频，从播放器返回的位置继续
    // IntersectionObserver 会在 observe() 时自动根据视口状态播放或暂停
    if (props.content._ === 'messageVideo' && videoElRef.value && videoDownloaded.value && videoObserver) {
        if (returnTime !== undefined) {
            videoElRef.value.currentTime = returnTime;
        }
        videoObserver.observe(videoElRef.value);
    }
}

// ---- Media Loading ----

onMounted(() => { loadMedia(); });

const loadMedia = async () => {
    const c = props.content;
    if (c._ === 'messageVideo') { await loadVideoThumb(); return; }
    if (c._ === 'messagePhoto') await loadPhotoThumb();
    const f = getFile();
    if (!f) return;
    if (isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
        mediaLoaded.value = true;
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        downloadFile(f.id);
    }
};

const getFile = () => {
    const c = props.content;
    if (c._ === 'messagePhoto') return c.photo.sizes[c.photo.sizes.length - 1]?.photo;
    if (c._ === 'messageVideo') return c.video.video;
    if (c._ === 'messageAnimation') return c.animation.animation;
    return undefined;
};

async function loadPhotoThumb() {
    if (props.content._ !== 'messagePhoto') return;
    const photo = props.content.photo;
    if (photo.minithumbnail?.data) {
        thumbSrc.value = `data:image/jpeg;base64,${photo.minithumbnail.data}`;
        return;
    }
    const smallest = photo.sizes.reduce((a, b) => a.width * a.height < b.width * b.height ? a : b);
    if (!smallest) return;
    const f = smallest.photo;
    if (!f) return;
    if (isFileReady(f)) { thumbSrc.value = convertFileSrc(f.local.path); return; }
    await safeDownloadFile(f.id, true);
    // 下载完成后通过 updateFile 事件更新，此处重新检查
    const updated = await tdlibSend({ _: 'getFile', file_id: f.id });
    if (isFileReady(updated)) thumbSrc.value = convertFileSrc(updated.local.path);
}

async function loadVideoThumb() {
    if (props.content._ !== 'messageVideo') return;
    const c = props.content;
    if (isFileReady(c.video.video)) {
        mediaSrc.value = convertFileSrc(c.video.video.local.path);
        videoDownloaded.value = true;
        return;
    }
    const thumb = c.video.thumbnail?.file;
    if (!thumb) return;
    if (isFileReady(thumb)) { thumbSrc.value = convertFileSrc(thumb.local.path); return; }
    await safeDownloadFile(thumb.id, true);
    const updated = await tdlibSend({ _: 'getFile', file_id: thumb.id });
    if (isFileReady(updated)) thumbSrc.value = convertFileSrc(updated.local.path);
}

const downloadFile = async (fileId: number) => {
    if (isDownloading.value) return;
    if (downloadingFiles.has(fileId)) return;
    isDownloading.value = true;
    downloadingFiles.add(fileId);
    try {
        const res = await tdlibSend({ _: "downloadFile", file_id: fileId, priority: 1, offset: 0, limit: 0, synchronous: true });
        if (isFileReady(res)) { mediaSrc.value = convertFileSrc(res.local.path); mediaLoaded.value = true; }
    } catch (_) { } finally {
        downloadingFiles.delete(fileId);
        isDownloading.value = false;
    }
};

async function handleVideoDownload() {
    if (props.content._ !== 'messageVideo') return;
    const video = props.content.video;
    const videoFile = video.video;
    const fileId = videoFile.id;
    videoFileId.value = fileId;
    if (isFileReady(videoFile)) {
        mediaSrc.value = convertFileSrc(videoFile.local.path);
        videoDownloaded.value = true;
        return;
    }
    if (video.supports_streaming && videoFile.size > 0) {
        const streamUrl = convertFileSrc(String(fileId), 'tdstream');
        mediaSrc.value = `${streamUrl}?mime=${video.mime_type}`;
        videoDownloaded.value = true;
        return;
    }
    if (downloadingFiles.has(fileId)) return;
    videoDownloading.value = true;
    videoProgress.value = 0;
    downloadingFiles.add(fileId);
    try {
        await tdlibSend({ _: 'downloadFile', file_id: fileId, priority: 1, offset: 0, limit: 0, synchronous: false });
        // 轮询下载进度
        pollVideoDownload(fileId);
    } catch (_) {
        downloadingFiles.delete(fileId);
        videoDownloading.value = false;
    }
}

/** 轮询文件下载进度 */
let downloadPollTimer: ReturnType<typeof setInterval> | null = null;
function pollVideoDownload(fileId: number) {
    downloadPollTimer = setInterval(async () => {
        try {
            const info = await tdlibSend({ _: 'getFile', file_id: fileId }) as any;
            const total = info.size || 1;
            const downloaded = info.local?.downloaded_size || 0;
            videoProgress.value = downloaded / total;
            if (info.local?.is_downloading_completed && info.local?.path) {
                if (downloadPollTimer) { clearInterval(downloadPollTimer); downloadPollTimer = null; }
                videoDownloading.value = false;
                videoDownloaded.value = true;
                mediaSrc.value = convertFileSrc(info.local.path);
            }
        } catch (_) {
            if (downloadPollTimer) { clearInterval(downloadPollTimer); downloadPollTimer = null; }
            videoDownloading.value = false;
        }
    }, 500);
    // 轮询结束后从去重集合中移除
    if (!downloadPollTimer) {
        downloadingFiles.delete(videoFileId.value);
    }
}

function toggleMute() {
    videoMuted.value = !videoMuted.value;
    if (videoElRef.value) videoElRef.value.muted = videoMuted.value;
}
function onInlineVideoTime() {
    if (videoElRef.value) inlineVideoCurrent.value = videoElRef.value.currentTime;
}
function onInlineVideoLoaded() {
    if (videoElRef.value) inlineVideoDuration.value = videoElRef.value.duration || 0;
}
function onInlineVideoEnded() {
    if (videoElRef.value) { videoElRef.value.currentTime = 0; videoElRef.value.play(); }
}

function formatDuration(seconds: number): string {
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.floor(Math.abs(seconds) % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>
