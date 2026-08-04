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
                :class="[borderRadiusClass, hasSpoiler ? 'blur-md' : '']" :style="photoSizeStyle"
                @click="mediaSrc ? openViewer() : undefined">
                <!-- Minithumbnail preview -->
                <img v-if="thumbSrc && !mediaSrc" :src="thumbSrc"
                    class="absolute inset-0 w-full h-full object-cover blur-sm scale-105" />
                <!-- Full image (object-cover fills area) -->
                <img v-if="mediaSrc" :src="mediaSrc" class="w-full h-full object-cover select-none"
                    :class="{ 'opacity-0': !imageLoaded }" @load="onImageLoad" @error="onImageError" />
                <!-- Placeholder -->
                <div v-if="!mediaSrc && !thumbSrc" class="flex items-center justify-center w-full h-full">
                    <svg class="w-8 h-8 text-gray-400 animate-pulse" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                    </svg>
                </div>
                <!-- Download button overlay -->
                <div v-if="!mediaSrc && !isDownloading && canDownload"
                    class="absolute inset-0 flex items-center justify-center cursor-pointer"
                    @click.stop="handlePhotoDownload">
                    <div
                        class="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            class="w-6 h-6 text-white">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </div>
                </div>
                <!-- Loading spinner -->
                <div v-if="isDownloading" class="absolute inset-0 flex items-center justify-center bg-black/20">
                    <svg class="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                            class="opacity-75" />
                    </svg>
                </div>
            </div>

            <!-- ===== VIDEO ===== -->
            <div v-else-if="content._ === 'messageVideo'"
                class="relative overflow-hidden bg-black cursor-pointer group select-none" :class="borderRadiusClass"
                :style="videoSizeStyle" @click="openViewer">
                <!-- Thumbnail: 静态位图用 <img>，MPEG4/WEBM 动态图用 <video>，Lottie/无可显示时回退图标 -->
                <img v-if="videoThumbSrc && !videoThumbIsVideo && !videoDownloaded" :src="videoThumbSrc"
                    class="absolute inset-0 w-full h-full object-cover" :class="hasSpoiler ? 'blur-md' : ''" />
                <video v-else-if="videoThumbSrc && videoThumbIsVideo && !videoDownloaded" :src="videoThumbSrc" autoplay
                    loop muted playsinline class="absolute inset-0 w-full h-full object-cover"
                    :class="hasSpoiler ? 'blur-md' : ''" />
                <div v-else-if="!videoDownloaded" class="absolute inset-0 flex items-center justify-center">
                    <VideoIcon class="w-8 h-8 text-gray-400" />
                </div>

                <!-- Video element (循环播放, 由 IntersectionObserver 控制播放/暂停) -->
                <video v-if="videoDownloaded" ref="videoElRef" :src="mediaSrc" class="w-full h-full object-cover"
                    :muted="videoMuted" loop playsinline :data-video-msg-id="messageId" @timeupdate="onInlineVideoTime"
                    @loadedmetadata="onInlineVideoLoaded" @ended="onInlineVideoEnded" @waiting="onVideoWaiting"
                    @playing="onVideoPlaying" @canplay="onVideoPlaying" />

                <!-- 边下边播（流式 tdstream://）缓冲加载指示：video 元素 waiting/playing 驱动 -->
                <div v-if="videoDownloaded && videoBuffering"
                    class="absolute inset-0 flex items-center justify-center bg-black/40">
                    <svg class="w-8 h-8 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                            class="opacity-75" />
                    </svg>
                </div>

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
                :class="borderRadiusClass" :style="animSizeStyle" @click="mediaSrc ? openViewer() : undefined">
                <video v-if="mediaSrc" :src="mediaSrc" autoplay loop muted playsinline
                    class="w-full h-full object-cover" />
                <div v-else class="flex items-center justify-center w-full h-full">
                    <span class="text-xs text-gray-500">GIF</span>
                </div>
                <!-- Download button overlay -->
                <div v-if="!mediaSrc && !animDownloading && animCanDownload"
                    class="absolute inset-0 flex items-center justify-center cursor-pointer"
                    @click.stop="handleAnimDownload">
                    <div
                        class="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            class="w-6 h-6 text-white">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </div>
                </div>
                <div v-if="animDownloading" class="absolute inset-0 flex items-center justify-center bg-black/20">
                    <svg class="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                            class="opacity-75" />
                    </svg>
                </div>
            </div>

            <!-- Time overlay on media -->
            <div v-if="!captionBelow && date"
                class="absolute right-1.5 bottom-1.5 bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none flex items-center">
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
import type { MediaViewerItem } from './MediaViewer.vue';
import { buildVideoQualities } from '../../../../utils/videoQualities';
import { useDownloadStore, type DownloadFileType } from '../../../../store/downloads';
import { useChatStore } from '../../../../store/chat';
import { registerMediaItem, unregisterMediaItem, openMediaViewer, isMediaViewerActive } from '../../../../store/mediaViewer';
import { settings } from '../../../../store/settings';
import { getChatCategory } from '../../../../utils/autoDownload';
import { isThumbnailImgRenderable, isThumbnailVideoRenderable } from '../../../../utils/thumbnail';
import {
    currentlyPlayingId,
    globalVideoMuted,
    registerPlaying,
    unregisterPlaying,
    toggleGlobalMute,
    pauseAudioForVideo,
} from '../../../../store/videoPlayback';


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
    /** 发送人显示名称（用于查看器底部信息展示） */
    senderName?: string;
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
/** 视频缩略图：静态位图路径（<img>）或动态图路径（<video>） */
const videoThumbSrc = ref<string | undefined>(undefined);
/** 视频缩略图是否为 MPEG4/WEBM 动态图（需用 <video> 渲染） */
const videoThumbIsVideo = ref(false);
/** 边下边播（流式 tdstream://）时的缓冲状态，用于显示加载转圈 */
const videoBuffering = ref(false);
const videoFileId = ref<number>(0);
const videoElRef = ref<HTMLVideoElement | null>(null);
const inlineVideoCurrent = ref(0);
const inlineVideoDuration = ref(0);
const isVideo = computed(() => props.content._ === 'messageVideo');

/** 使用全局静音状态，同一时间所有视频共享 mute 开关 */
const videoMuted = computed(() => globalVideoMuted.value);

const videoDuration = computed(() => {
    if (props.content._ === 'messageVideo') return props.content.video.duration;
    return 0;
});

// 已下载视频自动循环播放（IntersectionObserver 控制）
// 同一时间只允许一个视频播放，GIF（animation）不受影响
let videoObserver: IntersectionObserver | null = null;

onMounted(() => {
    videoObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const vid = entry.target as HTMLVideoElement;
            if (!isVideo.value) {
                // GIF / Animation — 不受单视频播放限制
                if (entry.isIntersecting) {
                    vid.play().catch(() => { });
                } else {
                    vid.pause();
                }
                continue;
            }
            if (entry.isIntersecting && props.messageId) {
                // 刚关闭查看器恢复时不自动播放，仅注册
                if (restoringFromViewer) {
                    restoringFromViewer = false;
                    return;
                }
                // 新视频进入视口：暂停之前的视频，注册当前视频
                registerPlaying(props.messageId, (prevId) => {
                    // 通过 DOM 查找之前视频的 video 元素并暂停
                    const prevEl = document.querySelector(
                        `[data-video-msg-id="${prevId}"]`
                    ) as HTMLVideoElement | null;
                    prevEl?.pause();
                });
                vid.play().catch(() => { });
            } else if (!entry.isIntersecting && props.messageId) {
                vid.pause();
                unregisterPlaying(props.messageId);
            }
        }
    }, { threshold: 0.6 });
});

onUnmounted(() => {
    if (videoObserver) videoObserver.disconnect();
    if (props.messageId) unregisterPlaying(props.messageId);
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

/** 刚从全屏查看器恢复，避免立即自动播放 */
let restoringFromViewer = false;

/** 进入全屏前视频是否正在播放，用于关闭查看器后恢复 */
let wasPlayingBeforeViewer = false;

// 媒体查看器关闭后，恢复视频的 IntersectionObserver 观察
watch(isMediaViewerActive, (active, wasActive) => {
    if (wasActive && !active && videoElRef.value && videoObserver && videoDownloaded.value) {
        if (wasPlayingBeforeViewer) {
            wasPlayingBeforeViewer = false;
            // 之前就在播放的：正常观察，IntersectionObserver 会立即触发播放
            videoObserver.observe(videoElRef.value);
        } else {
            // 之前没在播放的：标记恢复状态，避免自动播放
            restoringFromViewer = true;
            videoObserver.observe(videoElRef.value);
        }
    }
});

// 当其他视频开始播放时，暂停当前视频（仅限视频，不影响 GIF）
watch(currentlyPlayingId, (newId) => {
    if (!isVideo.value) return;
    if (newId !== props.messageId && videoElRef.value) {
        videoElRef.value.pause();
    }
});

// 全局静音状态同步到 video 元素
watch(globalVideoMuted, (muted) => {
    if (videoElRef.value) {
        videoElRef.value.muted = muted;
    }
});

// 注册媒体项到全局查看器
watch(mediaSrc, (src) => {
    if (src && props.messageId) {
        const c = props.content;
        const capt = 'caption' in c && c.caption?.text ? c.caption.text : '';
        const captFormatted = ('caption' in c && c.caption?.text) ? c.caption : undefined;
        // 发送人显示名称与消息时间（用于查看器底部信息展示）
        const senderName = props.senderName || '';
        const date = typeof props.date === 'number' ? props.date : 0;
        const meta = { messageId: props.messageId, chatId: props.chatId };
        const basename = (p: string | undefined) => {
            if (!p) return '';
            return p.split(/[\\/]/).pop() || '';
        };
        let item: MediaViewerItem | null = null;
        if (c._ === 'messagePhoto') {
            let localPath: string | undefined;
            const sizes = c.photo.sizes;
            if (sizes.length > 0) {
                const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
                if (isFileReady(largest.photo)) localPath = largest.photo.local.path;
            }
            item = { type: 'photo', src, thumb: thumbSrc.value, caption: capt, captionFormatted: captFormatted, senderName, date, localPath, fileName: basename(localPath), ...meta };
        } else if (c._ === 'messageVideo') {
            const qualities = buildVideoQualities(
                c.alternative_videos,
                src,
                { width: c.video.width, height: c.video.height },
            );
            const localPath = isFileReady(c.video.video) ? c.video.video.local.path : undefined;
            item = {
                type: 'video', src, caption: capt, captionFormatted: captFormatted, senderName, date,
                localPath,
                fileName: c.video.file_name || basename(localPath),
                qualities: qualities.length ? qualities : undefined, ...meta,
            };
        } else if (c._ === 'messageAnimation') {
            const animLocalPath = isFileReady(c.animation.animation) ? c.animation.animation.local.path : undefined;
            item = {
                type: 'animation', src, caption: capt, captionFormatted: captFormatted, senderName, date,
                localPath: animLocalPath,
                fileName: c.animation.file_name || basename(animLocalPath), ...meta,
            };
        }
        if (item) registerMediaItem(props.messageId, item);
    }
});
onUnmounted(() => {
    if (props.messageId) unregisterMediaItem(props.messageId);
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
    if (props.messageId && mediaSrc.value) {
        const initialTime = (props.content._ === 'messageVideo' && videoElRef.value)
            ? videoElRef.value.currentTime : 0;
        if (props.content._ === 'messageVideo' && videoElRef.value) {
            wasPlayingBeforeViewer = !videoElRef.value.paused;
            videoElRef.value.pause();
            if (videoObserver) videoObserver.unobserve(videoElRef.value);
            // 全屏播放视频时暂停音乐
            pauseAudioForVideo();
        }
        openMediaViewer(props.messageId, 0, initialTime);
    }
}

// ---- Media Loading ----

onMounted(() => { loadMedia(); });

// ---- Download store integration ---
const downloadStore = useDownloadStore();

function getChatTitle(id: number): string {
    try {
        const cs = useChatStore();
        return cs.chats[id]?.title || `对话 #${id}`;
    } catch { return `对话 #${id}`; }
}

/** 检查文件是否可下载（有 remote 数据） */
function canDownloadFile(f: any): boolean {
    return f && f.local && f.local.can_be_downloaded;
}

/** 注册到下载管理器 */
async function registerWithStore(fileId: number, fileName: string, fileType: DownloadFileType, thumbUrl?: string) {
    const totalSize = 0; // 由 updateFile 事件更新
    const chatTitle = props.chatId ? getChatTitle(props.chatId) : '';
    await downloadStore.registerDownload(fileId, fileName, chatTitle, totalSize, fileType, thumbUrl, props.chatId, props.messageId);
}

const loadMedia = async () => {
    const c = props.content;
    if (c._ === 'messageVideo') { await loadVideoThumb(); return; }
    if (c._ === 'messagePhoto') { await loadPhotoThumb(); return; }
    if (c._ === 'messageAnimation') { await loadAnimThumb(); return; }
};

// ---- Photo ----
const canDownload = computed(() => {
    if (props.content._ !== 'messagePhoto') return false;
    const f = props.content.photo.sizes[props.content.photo.sizes.length - 1]?.photo;
    return canDownloadFile(f) && !isFileReady(f);
});

async function loadPhotoThumb() {
    if (props.content._ !== 'messagePhoto') return;
    const photo = props.content.photo;
    if (photo.minithumbnail?.data) {
        thumbSrc.value = `data:image/jpeg;base64,${photo.minithumbnail.data}`;
    }
    // 如果已下载完成，直接显示
    const f = photo.sizes[photo.sizes.length - 1]?.photo;
    if (f && isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
        mediaLoaded.value = true;
        return;
    }
    // 根据自动下载设置决定是否自动下载图片
    if (f && props.chatId && settings.autoDownload.enabled) {
        const cs = useChatStore();
        const chatData = cs.chats[props.chatId] as any;
        if (chatData) {
            const category = getChatCategory(chatData);
            const cfg = settings.autoDownload.photos;
            const shouldAutoDl = cfg.enabled && cfg[category];
            if (shouldAutoDl && canDownloadFile(f) && !downloadingFiles.has(f.id)) {
                isDownloading.value = true;
                downloadingFiles.add(f.id);
                try {
                    // downloadFile (synchronous) 直接返回下载完成的 file 对象，
                    // 无需再额外 getFile（避免每次图片多一次 RPC 往返）。
                    const updated = await tdlibSend({ _: 'downloadFile', file_id: f.id, priority: 1, offset: 0, limit: 0, synchronous: true });
                    if (isFileReady(updated)) {
                        mediaSrc.value = convertFileSrc(updated.local.path);
                        mediaLoaded.value = true;
                    }
                } catch (_) { } finally {
                    downloadingFiles.delete(f.id);
                    isDownloading.value = false;
                }
            }
        }
    }
}

async function handlePhotoDownload() {
    if (props.content._ !== 'messagePhoto') return;
    const f = props.content.photo.sizes[props.content.photo.sizes.length - 1]?.photo;
    if (!f) return;
    if (isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
        mediaLoaded.value = true;
        return;
    }
    if (!canDownloadFile(f) || downloadingFiles.has(f.id)) return;
    isDownloading.value = true;
    downloadingFiles.add(f.id);
    // 注册到下载管理器
    const fileName = `photo_${props.messageId || f.id}.jpg`;
    await registerWithStore(f.id, fileName, 'photo', thumbSrc.value);
    try {
        await tdlibSend({ _: 'downloadFile', file_id: f.id, priority: 1, offset: 0, limit: 0, synchronous: false });
    } catch (_) {
        downloadingFiles.delete(f.id);
        isDownloading.value = false;
    }
}

// ---- Animation (GIF) ----
const animDownloading = ref(false);
const animCanDownload = computed(() => {
    if (props.content._ !== 'messageAnimation') return false;
    const f = props.content.animation.animation;
    return canDownloadFile(f) && !isFileReady(f);
});

async function loadAnimThumb() {
    if (props.content._ !== 'messageAnimation') return;
    const f = props.content.animation.animation;
    if (f && isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
    }
}

async function handleAnimDownload() {
    if (props.content._ !== 'messageAnimation') return;
    const f = props.content.animation.animation;
    if (!f) return;
    if (isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
        return;
    }
    if (!canDownloadFile(f) || downloadingFiles.has(f.id)) return;
    animDownloading.value = true;
    downloadingFiles.add(f.id);
    const fileName = `animation_${props.messageId || f.id}.gif`;
    await registerWithStore(f.id, fileName, 'animation');
    try {
        await tdlibSend({ _: 'downloadFile', file_id: f.id, priority: 1, offset: 0, limit: 0, synchronous: false });
    } catch (_) {
        downloadingFiles.delete(f.id);
        animDownloading.value = false;
    }
}

async function loadVideoThumb() {
    if (props.content._ !== 'messageVideo') return;
    const c = props.content;
    if (isFileReady(c.video.video)) {
        mediaSrc.value = convertFileSrc(c.video.video.local.path);
        videoDownloaded.value = true;
        return;
    }
    // 检查自动下载设置：如果视频体积 <= maxSize，自动下载
    if (props.chatId && settings.autoDownload.enabled) {
        const cs = useChatStore();
        const chatData = cs.chats[props.chatId] as any;
        if (chatData) {
            const category = getChatCategory(chatData);
            const cfg = settings.autoDownload.videos;
            const shouldAutoDl = cfg.enabled && cfg[category];
            if (shouldAutoDl) {
                const sizeMB = c.video.video.size / (1024 * 1024);
                if (sizeMB <= cfg.maxSize) {
                    await handleVideoDownload();
                    return;
                }
            }
        }
    }
    // 否则只下载缩略图（按格式分类：静态位图→<img>，MPEG4/WEBM→<video>）
    const thumb = c.video.thumbnail;
    if (!thumb) return;
    const isVideoThumb = isThumbnailVideoRenderable(thumb.format);
    const isImgThumb = isThumbnailImgRenderable(thumb.format);
    if (!isVideoThumb && !isImgThumb) return; // TGS 等无法直接显示的缩略图回退到图标
    const file = thumb.file;
    if (isFileReady(file)) {
        videoThumbSrc.value = convertFileSrc(file.local.path);
        videoThumbIsVideo.value = isVideoThumb;
        return;
    }
    await safeDownloadFile(file.id, true);
    const updated = await tdlibSend({ _: 'getFile', file_id: file.id });
    if (isFileReady(updated)) {
        videoThumbSrc.value = convertFileSrc(updated.local.path);
        videoThumbIsVideo.value = isVideoThumb;
    }
}

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
        // 边下边播：初始置为缓冲中，等 video 触发 canplay/playing 后清除（见 onVideoPlaying）
        videoBuffering.value = true;
        return;
    }
    if (downloadingFiles.has(fileId)) return;
    // 注册到下载管理器
    const fileName = video.file_name || `video_${props.messageId || fileId}.mp4`;
    await registerWithStore(fileId, fileName, 'video', videoThumbIsVideo.value ? undefined : videoThumbSrc.value);
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
    const newMuted = toggleGlobalMute();
    if (videoElRef.value) videoElRef.value.muted = newMuted;
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

/** 视频进入缓冲（边下边播在拉取数据时触发）→ 显示加载转圈 */
function onVideoWaiting() {
    videoBuffering.value = true;
}
/** 视频可继续播放 → 隐藏加载转圈 */
function onVideoPlaying() {
    videoBuffering.value = false;
}

function formatDuration(seconds: number): string {
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.floor(Math.abs(seconds) % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>
