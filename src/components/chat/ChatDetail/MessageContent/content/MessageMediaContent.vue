<template>
    <!-- 外层 div 使用媒体宽度，使图片+文字+时间共享统一宽度（仿 Telegram Web） -->
    <div ref="rootEl" class="message-media relative" :style="mediaContainerStyle">
        <!-- 回复预览（引用）放在确定宽度的媒体容器内：超长引用文本不会再把外层 w-fit 气泡撑宽 -->
        <MessageReply v-if="replyTo" :replyTo="replyTo" :isSelf="isSelf" :chatId="chatId" :messageList="messageList"
            :accentColorId="accentColorId" @jump="onReplyJump" />

        <ForwardBanner v-if="forwardInfo" :name="forwardName ?? ''" :original-name="forwardOriginalName"
            :photo="forwardPhoto" :accent-id="forwardAccentId" :navigable="forwardNavigable" :self="isSelf"
            :text-color="forwardTextColor" media-inline @open-source="emit('openForwardSource')" />

        <!-- Caption above media -->
        <div v-if="showCaptionAbove && captionText" class="caption-text px-2 pt-2 pb-1"
            :class="isSelf ? 'text-white/90' : 'text-gray-800 dark:text-gray-200'">
            <MessageTextContent :formattedText="captionFormatted" :chatId="chatId" />
        </div>

        <!-- Media element -->
        <div class="media-wrapper relative px-0">

            <!-- ===== PHOTO ===== -->
            <div v-if="content._ === 'messagePhoto'"
                class="relative overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer group"
                :class="[borderRadiusClass, { 'msg-spoiler-media': hasSpoiler }]" :style="photoSizeStyle"
                @click="mediaSrc ? openViewer() : undefined">
                <!-- 渐进占位：minithumbnail 高斯模糊 → Small 清晰图；Big 就绪后被 mediaSrc 取代 -->
                <img v-if="thumbSrc && !mediaSrc" :src="thumbSrc"
                    class="absolute inset-0 w-full h-full object-cover"
                    :class="thumbIsBlur ? 'blur-sm scale-105' : ''" />
                <!-- Full image (object-cover fills area) -->
                <img v-if="mediaSrc" ref="photoImgEl" :src="mediaSrc" class="w-full h-full object-cover select-none"
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
                <!-- Download button：未就绪且不在下载中 -->
                <div v-if="photoShowDownload"
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
                <!-- Loading spinner：下载中 -->
                <div v-if="photoShowLoader" class="absolute inset-0 flex items-center justify-center bg-black/30">
                    <LoaderIndicator :progress="photoProgress > 0 && photoProgress < 1 ? photoProgress : undefined" size="40"
                        color="#ffffff" />
                </div>
                <!-- 剧透覆盖层（粒子特效：点击 ripple 波纹揭示媒体） -->
                <SpoilerMedia v-if="hasSpoiler" :has-spoiler="true" overlay />
            </div>

            <!-- ===== VIDEO ===== -->
            <div v-else-if="content._ === 'messageVideo'"
                class="relative overflow-hidden bg-black cursor-pointer group select-none"
                :class="[borderRadiusClass, { 'msg-spoiler-media': hasSpoiler }]" :style="videoSizeStyle"
                @click="openViewer">
                <!--
                  视频本体就绪（videoShowMedia）→ 直接渲染 <video>，不用 mini/封面盖住。
                  仅当视频不可用时才用封面/mini 占位；高清封面优先，mini 兜底。
                -->
                <img v-if="!videoShowMedia && videoThumbSrc && !videoThumbIsVideo" :src="videoThumbSrc"
                    class="absolute inset-0 w-full h-full object-cover"
                    :class="isMiniThumbSrc(videoThumbSrc) ? 'blur-sm scale-105' : ''" />
                <video v-else-if="!videoShowMedia && videoThumbSrc && videoThumbIsVideo" :src="videoThumbSrc" autoplay
                    loop muted playsinline class="absolute inset-0 w-full h-full object-cover" />
                <div v-else-if="!videoShowMedia" class="absolute inset-0 flex items-center justify-center">
                    <VideoIcon class="w-8 h-8 text-gray-400" />
                </div>

                <!-- 剧透覆盖层（粒子特效：点击 ripple 波纹揭示媒体） -->
                <SpoilerMedia v-if="hasSpoiler" :has-spoiler="true" overlay />

                <!--
                  就绪视频：加载时直接使用本地/流式源。preload 拉元数据与首帧，
                  poster 只用高清封面（绝不用 mini）。播放仍由 IO 控制（同屏只播一个）。
                -->
                <video v-if="videoShowMedia" ref="videoElRef" :src="mediaSrc"
                    class="absolute inset-0 w-full h-full object-cover"
                    :muted="videoMuted" loop playsinline preload="metadata"
                    :poster="videoPosterSrc"
                    :data-video-msg-id="messageId"
                    @timeupdate="onInlineVideoTime" @loadedmetadata="onInlineVideoLoaded"
                    @loadeddata="onVideoFirstFrame" @ended="onInlineVideoEnded"
                    @waiting="onVideoWaiting" @playing="onVideoPlaying" @canplay="onVideoFirstFrame"
                    @error="onVideoError" />

                <!-- 缓冲指示：仅就绪视频在缓冲时显示 -->
                <div v-if="videoShowMedia && videoBuffering"
                    class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-black/20">
                    <LoaderIndicator size="36" color="#ffffff" />
                </div>

                <!-- Download progress bar -->
                <div v-if="videoDownloading && videoProgress > 0 && videoProgress < 1"
                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
                    <div class="h-full bg-blue-500 transition-all" :style="{ width: videoProgress * 100 + '%' }"></div>
                </div>

                <!-- Download button：未就绪且不在下载中 -->
                <div v-if="videoShowDownload"
                    class="absolute inset-0 flex items-center justify-center cursor-pointer"
                    @click.stop="handleVideoDownload(true)">
                    <div
                        class="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            class="w-6 h-6 text-white ml-0.5">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </div>
                </div>
                <!-- Loading：下载中（未进入可播状态） -->
                <div v-if="videoShowLoader"
                    class="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                    <LoaderIndicator :progress="videoProgress > 0 && videoProgress < 1 ? videoProgress : undefined"
                        size="40" color="#ffffff" />
                </div>

                <!-- Remaining time (top-right) -->
                <span v-if="videoShowMedia && inlineVideoDuration > 0"
                    class="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded leading-none select-none">
                    -{{ formatDuration(Math.max(0, inlineVideoDuration - inlineVideoCurrent)) }}
                </span>

                <!-- Mute/unmute toggle (top-left) -->
                <button v-if="videoShowMedia"
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
                <span v-if="!videoShowMedia"
                    class="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded leading-none select-none">
                    {{ formatDuration(videoDuration) }}
                </span>

                <!-- Inline progress bar (bottom edge) -->
                <div v-if="videoShowMedia && inlineVideoDuration > 0"
                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
                    <div class="h-full bg-white transition-all duration-300"
                        :style="{ width: (inlineVideoCurrent / inlineVideoDuration) * 100 + '%' }"></div>
                </div>
            </div>

            <!-- ===== ANIMATION (GIF) ===== -->
            <div v-else-if="content._ === 'messageAnimation'"
                class="relative overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer group select-none"
                :class="borderRadiusClass" :style="animSizeStyle" @click="mediaSrc ? openViewer() : undefined">
                <!-- Thumbnail: 静态位图用 <img>，MPEG4/WEBM 动态图用 <video> -->
                <img v-if="animThumbSrc && !animThumbIsVideo && !mediaSrc" :src="animThumbSrc"
                    class="absolute inset-0 w-full h-full object-cover" />
                <video v-else-if="animThumbSrc && animThumbIsVideo && !mediaSrc" :src="animThumbSrc" autoplay loop muted
                    playsinline class="absolute inset-0 w-full h-full object-cover" />
                <!-- Full GIF (animation) -->
                <video v-if="mediaSrc" :src="mediaSrc" autoplay loop muted playsinline
                    class="w-full h-full object-cover" />

                <!-- GIF 胶囊（左上角，始终显示） -->
                <span
                    class="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded leading-none select-none pointer-events-none uppercase tracking-wide">
                    GIF
                </span>

                <!-- Download button：未就绪且不在下载中 -->
                <div v-if="animShowDownload"
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
                <div v-if="animShowLoader" class="absolute inset-0 flex items-center justify-center bg-black/30">
                    <LoaderIndicator :progress="animProgress > 0 && animProgress < 1 ? animProgress : undefined" size="40"
                        color="#ffffff" />
                </div>
            </div>

            <!-- Time overlay on media -->
            <div v-if="!captionBelow && date"
                class="absolute right-1.5 bottom-1.5 bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none flex items-center">
                <MessageStatus :date="date" :isOutgoing="isSelf" :sendingState="sendingState" :isRead="isRead"
                    :viewCount="viewCount" :authorSignature="authorSignature" overMedia />
            </div>

            <!-- 上传进度覆盖层（发送中的图片/视频/动画） -->
            <div v-if="uploading && !contentUploadInfo?.is_completed"
                class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
                <LoaderIndicator
                    :progress="mediaUploadProgress > 0 && mediaUploadProgress < 1 ? mediaUploadProgress : undefined"
                    size="40" color="#ffffff" />
                <span class="mt-2 text-xs text-white leading-none">
                    上传中 {{ Math.min(100, Math.round(mediaUploadProgress * 100)) }}%
                </span>
                <span class="mt-1 text-[10px] text-white/80 leading-none">
                    {{ formatSize(uploadCurrentSize) }} / {{ formatSize(uploadTotalSize) }}
                </span>
            </div>
            <!-- 底部细上传进度条 -->
            <div v-if="uploading && !contentUploadInfo?.is_completed"
                class="absolute bottom-0 left-0 right-0 z-10 h-0.5 bg-white/30 overflow-hidden pointer-events-none">
                <div class="h-full bg-emerald-400 transition-all duration-300"
                    :style="{ width: Math.min(100, mediaUploadProgress * 100) + '%' }"></div>
            </div>
        </div>

        <!-- Caption below -->
        <div v-if="!showCaptionAbove && captionText" class="caption-text px-2 pb-2 pt-1"
            :class="isSelf ? 'text-gray-900' : 'text-gray-800 dark:text-gray-200'">
            <MessageTextContent :formattedText="captionFormatted" :chatId="chatId" />
        </div>

        <!-- Reactions slot（caption 与时间之间） -->
        <slot name="reactions" />

        <!-- Time & status below -->
        <span v-if="captionBelow && date" class="block text-right px-2 pb-1"
            :class="isSelf ? 'text-gray-700/70' : 'text-gray-400'">
            <MessageStatus :date="date" :isOutgoing="isSelf" :sendingState="sendingState" :isRead="isRead"
                :viewCount="viewCount" :authorSignature="authorSignature" />
        </span>

    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { MessageContent, messageForwardInfo, MessageSendingState, chatPhotoInfo, profilePhoto, messageReplyToMessage, message } from 'tdlib-types';
import MessageReply from './MessageReply.vue';
import { tdlibSend, isFileReady, downloadingFiles, isFileBusy, isFileDownloading, enqueuePendingDownload, takePendingDownload, releasePendingDownloadOwner, safeDownloadFile } from '../../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { VideoIcon } from 'lucide-vue-next';
import ForwardBanner from './ForwardBanner.vue';
import MessageTextContent from './MessageTextContent.vue';
import SpoilerMedia from '../spoiler/SpoilerMedia.vue';
import MessageStatus from './MessageStatus.vue';
import LoaderIndicator from '../../../../common/LoaderIndicator';
import { useDownloadStore, type DownloadFileType, remoteIdOf } from '../../../../../store/downloads';
import { DL_TAG } from '../../../../../utils/downloadTags';
import { useUploadStore } from '../../../../../store/upload';
import { useChatStore } from '../../../../../store/chat';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { enqueueViewportLoad } from '../../../../../utils/viewportLoadGate';
import { openMediaViewer, isMediaViewerActive } from '../../../../../store/mediaViewer';
import { settings } from '../../../../../store/settings';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { getChatCategory, shouldAutoDownloadPhotos } from '../../../../../utils/autoDownload';
import { pickSmallPhotoSize, pickBigPhotoSize } from '../../../../../utils/photoSizes';
import { isThumbnailImgRenderable, isThumbnailVideoRenderable } from '../../../../../utils/thumbnail';
import { fitMediaSize, mediaSizeStyle } from '../../../../../utils/fitMediaSize';
import {
    currentlyPlayingId,
    globalVideoMuted,
    computeVisibleRatio,
    reportVideoVisibility,
    toggleGlobalMute,
    pauseAudioForVideo,
} from '../../../../../store/videoPlayback';


const props = defineProps<{
    content: MessageContent & { _: 'messagePhoto' | 'messageVideo' | 'messageAnimation' };
    isSelf: boolean;
    date?: number;
    forwardInfo?: messageForwardInfo;
    forwardName?: string;
    forwardNavigable?: boolean;
    /** 转发来源头像 */
    forwardPhoto?: chatPhotoInfo | profilePhoto;
    /** 转发来源头像底色 accent id */
    forwardAccentId?: number;
    /** 转发原始作者签名（括号内） */
    forwardOriginalName?: string;
    /** 转发横幅文字色 */
    forwardTextColor?: string;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
    sendingState?: MessageSendingState;
    isRead?: boolean;
    viewCount?: number;
    authorSignature?: string;
    chatId?: number;
    messageId?: number;
    /** 完整 tdlib 消息对象（传递给媒体查看器） */
    message?: message;
    /** 话题 ID（论坛话题，传递给媒体查看器用于跳转） */
    topicId?: number;
    /** 发送人显示名称（用于查看器底部信息展示） */
    senderName?: string;
    /** 回复目标（引用） */
    replyTo?: messageReplyToMessage;
    /** 当前消息列表（用于在本列表查找被回复的消息） */
    messageList?: message[];
    /** 发送者 accent_color_id（用于回复栏配色） */
    accentColorId?: number;
}>();

const emit = defineEmits<{
    openForwardSource: [];
    jumpToMessage: [messageId: number];
}>();

/** 点击回复预览：向上冒泡跳转到被回复消息 */
function onReplyJump(messageId: number) {
    emit('jumpToMessage', messageId);
}

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
const mediaLoaded = ref(false);
const thumbSrc = ref<string | undefined>(undefined);
/** thumbSrc 是否为 minithumber（需高斯模糊）；Small 就绪后为 false（清晰占位） */
const thumbIsBlur = ref(true);

/** 组件根元素（用于视口门控：进入视口才懒加载下载） */
const rootEl = ref<HTMLElement | null>(null);

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
/** 视频已渲染首帧（canplay/playing）——此前一直显示封面，不黑屏 */
const videoHasFrame = ref(false);
const videoFileId = ref<number>(0);
const videoElRef = ref<HTMLVideoElement | null>(null);
const inlineVideoCurrent = ref(0);
const inlineVideoDuration = ref(0);
const isVideo = computed(() => props.content._ === 'messageVideo');

// Animation (GIF) state
/** GIF 缩略图：静态位图路径（<img>）或动态图路径（<video>） */
const animThumbSrc = ref<string | undefined>(undefined);
/** GIF 缩略图是否为 MPEG4/WEBM 动态图（需用 <video> 渲染） */
const animThumbIsVideo = ref(false);

// ---- 就绪态（只信消息内嵌 content，不 getFile）----
/** 本组件下载意图 owner：卸载时释放 pending，不暂停已发起的 TDLib 下载 */
const downloadOwner = Symbol('msg-media');

const photoBigFile = computed(() =>
    props.content._ === 'messagePhoto' ? pickBigPhotoSize(props.content.photo) : undefined);
const photoSmallFile = computed(() =>
    props.content._ === 'messagePhoto' ? pickSmallPhotoSize(props.content.photo) : undefined);
/** Big 就绪时的本地路径（空串表示未就绪） */
const photoBigPath = computed(() => {
    const f = photoBigFile.value;
    return f && isFileReady(f) ? f.local.path : '';
});
const photoSmallPath = computed(() => {
    const f = photoSmallFile.value;
    return f && isFileReady(f) ? f.local.path : '';
});

const videoFile = computed(() =>
    props.content._ === 'messageVideo' ? props.content.video.video : undefined);
const videoCoverFile = computed(() =>
    props.content._ === 'messageVideo' ? props.content.video.thumbnail?.file : undefined);
/**
 * 新版 TDLib messageVideo 顶层 cover（photo）：
 * 含 minithumbnail + 多档 sizes；旧 video.thumbnail 为空时用它作封面。
 */
const videoCoverPhoto = computed(() =>
    props.content._ === 'messageVideo' ? props.content.cover : undefined);
/** cover photo 最低质量档（渐进清晰占位） */
const videoCoverSmallFile = computed(() => pickSmallPhotoSize(videoCoverPhoto.value));
/** cover photo 最高一档（无传统 thumbnail 时的高清封面） */
const videoCoverBigFile = computed(() => pickBigPhotoSize(videoCoverPhoto.value));
const videoFilePath = computed(() => {
    const f = videoFile.value;
    return f && isFileReady(f) ? f.local.path : '';
});
const videoCoverPath = computed(() => {
    if (props.content._ !== 'messageVideo') return '';
    const th = props.content.video.thumbnail;
    const f = th?.file;
    if (f && isFileReady(f) && f.local.path) {
        // 高清封面必须可渲染；TGS 等不可直接显示时走 cover photo / mini 兜底
        if (isThumbnailVideoRenderable(th?.format) || isThumbnailImgRenderable(th?.format)) {
            return f.local.path;
        }
    }
    const coverSmall = videoCoverSmallFile.value;
    if (coverSmall && isFileReady(coverSmall) && coverSmall.local.path) return coverSmall.local.path;
    const coverBig = videoCoverBigFile.value;
    if (coverBig && isFileReady(coverBig) && coverBig.local.path) return coverBig.local.path;
    return '';
});
const videoCoverIsAnim = computed(() => {
    if (props.content._ !== 'messageVideo') return false;
    return isThumbnailVideoRenderable(props.content.video.thumbnail?.format);
});
/** 就绪视频的 poster：只用高清封面，绝不用 mini */
const videoPosterSrc = computed(() => {
    if (!videoCoverPath.value) return undefined;
    return convertFileSrc(videoCoverPath.value);
});

const animFile = computed(() =>
    props.content._ === 'messageAnimation' ? props.content.animation.animation : undefined);
const animCoverFile = computed(() =>
    props.content._ === 'messageAnimation' ? props.content.animation.thumbnail?.file : undefined);
const animFilePath = computed(() => {
    const f = animFile.value;
    return f && isFileReady(f) ? f.local.path : '';
});
const animCoverPath = computed(() => {
    if (props.content._ !== 'messageAnimation') return '';
    const th = props.content.animation.thumbnail;
    const f = th?.file;
    if (!f || !isFileReady(f)) return '';
    if (!isThumbnailVideoRenderable(th?.format) && !isThumbnailImgRenderable(th?.format)) return '';
    return f.local.path;
});
const animCoverIsAnim = computed(() => {
    if (props.content._ !== 'messageAnimation') return false;
    return isThumbnailVideoRenderable(props.content.animation.thumbnail?.format);
});

/** 主文件是否忙碌（排队中或已向 TDLib 发起） */
const photoBusy = computed(() => {
    const id = photoBigFile.value?.id;
    if (!id) return false;
    return isDownloading.value || isFileBusy(id) || isFileDownloading(id);
});
const videoBusy = computed(() => {
    const id = videoFile.value?.id;
    if (!id) return false;
    return videoDownloading.value || isFileBusy(id) || isFileDownloading(id);
});
const animBusy = computed(() => {
    const id = animFile.value?.id;
    if (!id) return false;
    return animDownloading.value || isFileBusy(id) || isFileDownloading(id);
});

/** 可展示主媒体 */
const photoShowMedia = computed(() => !!mediaSrc.value || !!photoBigPath.value);
const videoShowMedia = computed(() => !!videoFilePath.value || videoDownloaded.value || !!mediaSrc.value);
const animShowMedia = computed(() => !!animFilePath.value || !!mediaSrc.value);

/** 下载中 → 加载指示器 */
const photoShowLoader = computed(() =>
    props.content._ === 'messagePhoto' && !photoShowMedia.value && photoBusy.value);
const videoShowLoader = computed(() =>
    props.content._ === 'messageVideo' && !videoShowMedia.value && videoBusy.value);
const animShowLoader = computed(() =>
    props.content._ === 'messageAnimation' && !animShowMedia.value && animBusy.value);

/** 未就绪且未在下载 → 下载按钮 */
const photoShowDownload = computed(() => {
    if (props.content._ !== 'messagePhoto') return false;
    if (photoShowMedia.value || photoBigPath.value) return false;
    if (photoShowLoader.value) return false;
    return !!photoBigFile.value && photoBigFile.value.local?.can_be_downloaded === true;
});
const videoShowDownload = computed(() => {
    if (props.content._ !== 'messageVideo') return false;
    if (videoShowMedia.value) return false;
    if (videoShowLoader.value) return false;
    return !!videoFile.value && videoFile.value.local?.can_be_downloaded === true;
});
const animShowDownload = computed(() => {
    if (props.content._ !== 'messageAnimation') return false;
    if (animShowMedia.value) return false;
    if (animShowLoader.value) return false;
    return !!animFile.value && animFile.value.local?.can_be_downloaded === true;
});

/** content 内 file.id 是否已就绪（用于排队出发前二次确认） */
function isFileReadyInContent(fileId: number): boolean {
    const c = props.content;
    if (c._ === 'messagePhoto') {
        const big = pickBigPhotoSize(c.photo);
        const small = pickSmallPhotoSize(c.photo);
        return !!((big && big.id === fileId && isFileReady(big)) || (small && small.id === fileId && isFileReady(small)));
    }
    if (c._ === 'messageVideo') {
        const v = c.video.video;
        const cover = c.video.thumbnail?.file;
        return !!((v && v.id === fileId && isFileReady(v)) || (cover && cover.id === fileId && isFileReady(cover)));
    }
    if (c._ === 'messageAnimation') {
        const a = c.animation.animation;
        const cover = c.animation.thumbnail?.file;
        return !!((a && a.id === fileId && isFileReady(a)) || (cover && cover.id === fileId && isFileReady(cover)));
    }
    return false;
}

/** 将 download 任务入队。并发闸门只作用于「发起下载」，不作用于资源展示。
 * 仅用于视频本体 / 图片 Big 等主媒体；缩略图与 Small 不走此路径。 */
function startQueuedDownload(fileId: number, starter: () => Promise<void>): 'active' | 'queued' {
    if (downloadingFiles.has(fileId) || isFileDownloading(fileId)) return 'active';
    enqueuePendingDownload(fileId, downloadOwner);
    enqueueViewportLoad(async () => {
        if (!takePendingDownload(fileId, downloadOwner)) return;
        if (isFileReadyInContent(fileId)) return;
        if (downloadingFiles.has(fileId)) return;
        downloadingFiles.add(fileId);
        try {
            await starter();
        } catch {
            downloadingFiles.delete(fileId);
        }
    }, 'chat');
    return 'queued';
}

/**
 * 缩略图 / 图片最低质量档（Small）同步下载。
 * - `downloadFile` + `synchronous: true`
 * - 不进入视口并发闸门，不注册下载管理器
 * - 不受 autoDownload 开关限制（Telegram 客户端对封面/缩略图的一致策略）
 */
async function downloadAuxFileSync(
    file: { id?: number; remote?: { id?: string }; local?: { path?: string; is_downloading_completed?: boolean; can_be_downloaded?: boolean } } | undefined | null,
): Promise<string> {
    if (!file?.id) return '';
    if (isFileReady(file as never) && file.local?.path) return file.local.path;
    if (file.local?.can_be_downloaded === false) return '';
    if (!downloadingFiles.has(file.id) && !isFileDownloading(file.id)) {
        try {
            await safeDownloadFile(file.id, true, DL_PRIORITY.THUMBNAIL);
        } catch { /* 失败时继续读 getFile / content 快照 */ }
    }
    const expectedRemote = file.remote?.id;
    try {
        const r = await tdlibSend({ _: 'getFile', file_id: file.id });
        // session file.id 可能被其他文件复用：remote.id 不一致时丢弃，避免串图
        if (expectedRemote && r?.remote?.id && r.remote.id !== expectedRemote) return '';
        if (isFileReady(r) && r.local.path) return r.local.path;
    } catch { /* ignore */ }
    if (isFileReady(file as never) && file.local?.path) return file.local.path;
    return '';
}

// ---- 上传进度（发送中的图片/视频）----
/** 是否正在上传（发送中） */
const uploading = computed(() => {
    const info = contentUploadInfo.value;
    return !!info && !info.is_completed;
});
/** 上传总大小 / 已上传大小（字节） */
const uploadTotalSize = computed(() => contentUploadInfo.value?.total_size ?? 0);
const uploadCurrentSize = computed(() => contentUploadInfo.value?.downloaded_size ?? 0);

/**
 * 提取当前媒体内容最可能被上传的文件 id。
 * - 视频/动画：video.animation 文件本身
 * - 图片：取最大的 photo size 文件（本地发送时该文件即上传目标）
 */
const contentUploadFileId = computed(() => {
    const c = props.content;
    if (c._ === 'messageVideo') return c.video.video.id;
    if (c._ === 'messageAnimation') return c.animation.animation.id;
    if (c._ === 'messagePhoto') {
        const sizes = c.photo.sizes;
        if (sizes.length === 0) return 0;
        const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
        return largest.photo.id;
    }
    return 0;
});

/** 关联的上传信息（若该文件正在上传/已上传） */
const contentUploadInfo = computed(() => {
    const fid = contentUploadFileId.value;
    if (!fid) return undefined;
    return uploadStore.getUploadInfo(fid);
});

/** 计算上传进度 */
const mediaUploadProgress = computed(() => {
    const info = contentUploadInfo.value;
    if (!info) return 0;
    return info.progress;
});

/** 使用全局静音状态，同一时间所有视频共享 mute 开关 */
const videoMuted = computed(() => globalVideoMuted.value);

const videoDuration = computed(() => {
    if (props.content._ === 'messageVideo') return props.content.video.duration;
    return 0;
});

// 已下载视频自动循环播放（IntersectionObserver 控制）
// 同一时间只允许一个视频播放，GIF（animation）不受影响
// 多档 threshold：高视频可能永远到不了 0.6，用细粒度上报 ratio 供「最居中」调度
const VIDEO_IO_THRESHOLDS = [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1];
let videoObserver: IntersectionObserver | null = null;

/** 刚从全屏查看器恢复，避免立即自动播放 */
let restoringFromViewer = false;

/** 进入全屏前视频是否正在播放，用于关闭查看器后恢复 */
let wasPlayingBeforeViewer = false;

/** 从 IO entry 计算可见比例（相对可显示高度）与中心距视口中心距离 */
function readVideoMetrics(entry: IntersectionObserverEntry) {
    const rect = entry.boundingClientRect;
    const root = entry.rootBounds;
    if (!root || rect.height <= 0 || rect.width <= 0) {
        return { ratio: 0, centerDist: Number.POSITIVE_INFINITY };
    }
    const visibleH = Math.max(0, Math.min(rect.bottom, root.bottom) - Math.max(rect.top, root.top));
    const ratio = computeVisibleRatio(rect.height, visibleH);
    const elCenter = rect.top + rect.height / 2;
    const rootCenter = root.top + root.height / 2;
    return { ratio, centerDist: Math.abs(elCenter - rootCenter) };
}

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
            if (!props.messageId) continue;

            const metrics = readVideoMetrics(entry);
            if (metrics.ratio > 0) {
                // 刚关闭查看器恢复时只登记可见，不抢播放权
                const silent = restoringFromViewer;
                if (silent) restoringFromViewer = false;
                reportVideoVisibility(props.messageId, metrics, silent ? { silent: true } : undefined);
            } else {
                reportVideoVisibility(props.messageId, null);
            }
        }
    }, { threshold: VIDEO_IO_THRESHOLDS });
    // 挂载后立刻绑定已就绪视频：content 快照就绪时 videoDownloaded 在 setup 阶段
    // 已为 true，此时 videoElRef/observer 尚未就绪，仅靠 watch 会漏绑导致永不播放
    void nextTick(() => observeVideoEl());
});

onUnmounted(() => {
    if (videoObserver) videoObserver.disconnect();
    // 停掉本组件的轮询
    stopAnimDownloadPolling();
    stopPhotoDownloadPolling();
    stopVideoCoverPolling();
    stopAnimThumbPolling();
    stopVideoDownloadPolling();
    // 待下载且尚未发起：从等待列表移除（取消排队）
    // 已向 TDLib 发起的下载：不在此暂停/取消，由 TDLib 继续
    releasePendingDownloadOwner(downloadOwner);
    if (props.messageId) reportVideoVisibility(props.messageId, null);
});

/**
 * 将 <video> 交给 IntersectionObserver。
 * 就绪视频可能在 DOM 挂载前已把 videoDownloaded 置 true，必须在
 * onMounted / videoElRef 出现后补绑，否则自动播放永远不会触发。
 * 同时强制 muted：浏览器自动播放策略要求静音，否则 play() 被拒绝。
 */
function observeVideoEl() {
    const el = videoElRef.value;
    if (!el || !videoObserver) return;
    if (!videoShowMedia.value && !videoDownloaded.value) return;
    // 自动播放策略要求静音；全局默认 muted=true，用户取消静音后再由 watch 同步
    el.muted = globalVideoMuted.value !== false;
    try {
        videoObserver.observe(el);
    } catch { /* 重复 observe 无害 */ }
}

// 就绪 / DOM 就位后补绑观察器（覆盖「挂载时已就绪」与「下载完成后出现 video」）
watch([videoShowMedia, videoDownloaded, videoElRef], () => {
    void nextTick(() => observeVideoEl());
}, { immediate: true, flush: 'post' });

// 当视频下载完成后，将 videoElRef 加入观察
// IntersectionObserver 会在 observe() 时自动触发初始回调，
// 根据视频是否在视口中决定播放或暂停
watch(videoDownloaded, (downloaded) => {
    if (downloaded) {
        void nextTick(() => observeVideoEl());
    }
}, { flush: 'post' });

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
    const hasCap = !!captionText.value;
    // 无 caption 的媒体在气泡外独立显示：始终四角圆角，不参与组内连体切角
    if (!hasCap) return 'rounded-lg';
    const hasForward = !!props.forwardInfo;
    if (hasForward || hasCap) {
        if (showCaptionAbove.value && captionText.value) return 'rounded-b-lg';
        if (!showCaptionAbove.value && captionText.value) return 'rounded-t-lg';
    }
    const first = props.isFirstInGroup;
    const last = props.isLastInGroup;
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

function formatSize(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const k = 1024;
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
    const value = bytes / Math.pow(k, i);
    return value.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

/** 媒体原始宽高（图片取最大 PhotoSize） */
function getOriginalDims(): { width: number; height: number } {
    const c = props.content;
    if (c._ === 'messagePhoto') {
        const sizes = c.photo.sizes;
        if (sizes.length === 0) return { width: 1, height: 1 };
        const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
        return { width: largest.width, height: largest.height };
    }
    if (c._ === 'messageVideo') {
        return { width: c.video.width, height: c.video.height };
    }
    if (c._ === 'messageAnimation') {
        return { width: c.animation.width, height: c.animation.height };
    }
    return { width: 1, height: 1 };
}

/** Unigram 风格：按原始比例等比缩放，限制在 432×432 / 96×96；窄窗口下随气泡收缩 */
const mediaDisplaySize = computed(() => {
    const { width, height } = getOriginalDims();
    return fitMediaSize(width, height);
});

const photoSizeStyle = computed(() => {
    const { width, height } = getOriginalDims();
    // maxWidth:100% + aspect-ratio：窗口变窄时等比收缩，不被固定像素裁切
    return mediaSizeStyle(width, height);
});

const videoSizeStyle = computed(() => photoSizeStyle.value);
const animSizeStyle = computed(() => photoSizeStyle.value);

/** 外层容器宽度 = 媒体宽度，使图片+文字+时间共享统一宽度；同样允许收缩 */
const mediaContainerStyle = computed(() => {
    return {
        width: `${mediaDisplaySize.value.width}px`,
        maxWidth: '100%',
    };
});

// Image state
const imageLoaded = ref(false);
const imageError = ref(false);
const photoImgEl = ref<HTMLImageElement | null>(null);
function onImageLoad() { imageLoaded.value = true; mediaLoaded.value = true; }
function onImageError() { imageError.value = true; }

/** 图片已就绪后，若其 URL 命中浏览器缓存导致 @load 早于监听器绑定而漏触发，
 *  则在此兜底：DOM 已 complete 且有实际尺寸即可视为加载成功。 */
function checkPhotoLoaded() {
    nextTick(() => {
        const el = photoImgEl.value;
        if (el && el.complete && el.naturalWidth > 0) {
            imageLoaded.value = true;
            mediaLoaded.value = true;
        }
    });
}

function openViewer() {
    if (props.messageId && mediaSrc.value) {
        const initialTime = (props.content._ === 'messageVideo' && videoElRef.value)
            ? videoElRef.value.currentTime : 0;
        if (props.content._ === 'messageVideo' && videoElRef.value) {
            wasPlayingBeforeViewer = !videoElRef.value.paused;
            videoElRef.value.pause();
            if (videoObserver) videoObserver.unobserve(videoElRef.value);
            pauseAudioForVideo();
        }
        openMediaViewer({
            messageId: props.messageId,
            chatId: props.chatId,
            topicId: props.topicId,
            senderName: props.senderName,
            message: props.message,
        }, initialTime);
    }
}

// ---- Media Loading ----
// 展示与下载解耦：
// - 就绪资源：直接从消息 content 上屏，不经过视口/下载并发闸门
// - 下载：视口触发 + 排队；并发只闸「是否发起下载」
// - 自动下载设置只决定「要不要下」，不阻止「已就绪则展示」

/**
 * 视口门控仅用于触发下载排队，不负责资源展示判断。
 * 主媒体（视频本体 / 图片 Big）：视口 + 停留 + 并发闸门。
 */
const { start: startViewportLoad, entered: mediaViewportEntered } = useViewportLoad(rootEl, () => {
    return requestAutoDownloads();
});

/**
 * 缩略图 / Small：同样要求视口 + 停留（默认 500ms），
 * 但 enqueue=false，不占 chat 并发槽。
 */
const { start: startAuxViewportLoad, entered: auxViewportEntered } = useViewportLoad(
    rootEl,
    () => prefetchAuxThumbs(),
    { enqueue: false },
);

onMounted(() => {
    // 先迷你占位，再立刻套用 content 内已就绪资源（不进下载队列）
    setMediaPreview();
    applyMediaFromContent();
    // 封面 / Small：进入视口并停留后再同步拉取
    startAuxViewportLoad();
    startViewportLoad();
});

/**
 * 加载代次：内容原地替换时自增。异步回调写回 UI 前比对代次。
 */
let mediaLoadSeq = 0;

/**
 * 内容被原地替换时重置状态，并重新套用就绪资源 / 排队下载。
 */
function resetMediaForContent() {
    mediaLoadSeq++;
    stopAnimDownloadPolling();
    stopPhotoDownloadPolling();
    stopVideoCoverPolling();
    stopAnimThumbPolling();
    stopVideoDownloadPolling();
    // 释放旧内容可能仍挂着的 pending（避免串到新内容）
    releasePendingDownloadOwner(downloadOwner);
    thumbSrc.value = undefined;
    mediaSrc.value = undefined;
    videoThumbSrc.value = undefined;
    videoThumbIsVideo.value = false;
    videoHasFrame.value = false;
    animThumbSrc.value = undefined;
    animThumbIsVideo.value = false;
    videoDownloaded.value = false;
    videoDownloading.value = false;
    videoProgress.value = 0;
    videoBuffering.value = false;
    isDownloading.value = false;
    animDownloading.value = false;
    mediaLoaded.value = false;
    imageLoaded.value = false;
    imageError.value = false;
    inlineVideoCurrent.value = 0;
    inlineVideoDuration.value = 0;
    if (videoElRef.value) {
        videoObserver?.unobserve(videoElRef.value);
        videoElRef.value.pause();
    }
    setMediaPreview();
    applyMediaFromContent();
    // 已触发过视口加载的实例：内容原地替换后立刻补拉缩略图
    if (auxViewportEntered.value) void prefetchAuxThumbs();
    if (mediaViewportEntered.value) void requestAutoDownloads();
}

watch(() => props.content, () => {
    resetMediaForContent();
});

// content 内嵌 File 就绪路径变化时立刻上屏（覆盖 updateFile 快照回写）
// 缩略图优先级：高清 Small / 封面 > minithumbnail；高清可用时绝不保留 mini
watch(photoBigPath, (path) => {
    if (!path) return;
    mediaSrc.value = convertFileSrc(path);
    mediaLoaded.value = true;
    checkPhotoLoaded();
}, { immediate: true });

watch(photoSmallPath, (path) => {
    // 高清 Small 可用 → 覆盖 mini（含 blur 状态）
    if (!path) return;
    if (mediaSrc.value || photoBigPath.value) return;
    thumbSrc.value = convertFileSrc(path);
    thumbIsBlur.value = false;
}, { immediate: true });

watch([videoFilePath, videoCoverPath, videoCoverIsAnim], ([vPath, cPath, cIsAnim]) => {
    if (vPath) {
        mediaSrc.value = convertFileSrc(vPath);
        videoDownloaded.value = true;
        videoDownloading.value = false;
        videoBuffering.value = false;
        // 就绪视频直接用本体；preload 拉首帧，不依赖 mini/封面
        tryMarkVideoFrameReady();
    }
    // 高清封面：视频不可用时作占位；可用时仅作 poster（模板已按 videoShowMedia 分支）
    if (cPath) {
        videoThumbSrc.value = convertFileSrc(cPath);
        videoThumbIsVideo.value = !!cIsAnim;
    }
}, { immediate: true });

watch([animFilePath, animCoverPath, animCoverIsAnim], ([aPath, cPath, cIsAnim]) => {
    if (aPath) {
        mediaSrc.value = convertFileSrc(aPath);
        animDownloading.value = false;
    }
    if (cPath) {
        animThumbSrc.value = convertFileSrc(cPath);
        animThumbIsVideo.value = !!cIsAnim;
    }
}, { immediate: true });

/** 当前缩略图 src 是否为 minithumbnail（base64） */
function isMiniThumbSrc(src: string | undefined): boolean {
    return !!src && src.startsWith('data:');
}

/**
 * 缩略图上屏：高清可用则用高清，mini 仅作无高清时的兜底。
 * 高清一旦可用，必须覆盖已显示的 mini。
 */
function applyThumbnailFromContent() {
    const c = props.content;

    if (c._ === 'messagePhoto') {
        // Big 就绪走 mediaSrc；此处只处理缩略图层
        if (photoSmallPath.value && !photoBigPath.value) {
            thumbSrc.value = convertFileSrc(photoSmallPath.value);
            thumbIsBlur.value = false;
            return;
        }
        // 无高清 Small：才允许 mini
        if (!photoSmallPath.value) {
            const min = c.photo.minithumbnail;
            if (min?.data && (!thumbSrc.value || isMiniThumbSrc(thumbSrc.value))) {
                thumbSrc.value = `data:image/jpeg;base64,${min.data}`;
                thumbIsBlur.value = true;
            }
        }
        return;
    }

    if (c._ === 'messageVideo') {
        // 优先级：video.thumbnail 高清封面 → cover.photo Small → cover/photo minithumbnail
        if (videoCoverPath.value) {
            videoThumbSrc.value = convertFileSrc(videoCoverPath.value);
            videoThumbIsVideo.value = videoCoverIsAnim.value && !!videoCoverFile.value && isFileReady(videoCoverFile.value);
            return;
        }
        const videoReady = !!videoFilePath.value || !!mediaSrc.value || videoDownloaded.value;
        if (!videoReady) {
            const coverMini = c.cover?.minithumbnail?.data;
            const mini = coverMini || c.video.minithumbnail?.data;
            if (mini && (!videoThumbSrc.value || isMiniThumbSrc(videoThumbSrc.value))) {
                videoThumbSrc.value = `data:image/jpeg;base64,${mini}`;
                videoThumbIsVideo.value = false;
            }
        }
        return;
    }

    if (c._ === 'messageAnimation') {
        if (animCoverPath.value) {
            animThumbSrc.value = convertFileSrc(animCoverPath.value);
            animThumbIsVideo.value = animCoverIsAnim.value;
            return;
        }
        if (!animCoverPath.value) {
            const min = c.animation.minithumbnail;
            if (min?.data && (!animThumbSrc.value || isMiniThumbSrc(animThumbSrc.value))) {
                animThumbSrc.value = `data:image/jpeg;base64,${min.data}`;
                animThumbIsVideo.value = false;
            }
        }
    }
}

/** 将 content 中已就绪的资源立刻应用到 UI（不触发下载） */
function applyMediaFromContent() {
    const bigPath = photoBigPath.value;
    if (bigPath) {
        mediaSrc.value = convertFileSrc(bigPath);
        mediaLoaded.value = true;
        checkPhotoLoaded();
    }
    if (videoFilePath.value) {
        mediaSrc.value = convertFileSrc(videoFilePath.value);
        videoDownloaded.value = true;
        tryMarkVideoFrameReady();
    }
    if (animFilePath.value) {
        mediaSrc.value = convertFileSrc(animFilePath.value);
    }
    // 缩略图：高清优先，mini 兜底
    applyThumbnailFromContent();
}

// ---- Download store integration ---
const downloadStore = useDownloadStore();
const uploadStore = useUploadStore();

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

/** 注册到下载管理器（主键用 file.remote.id，标签按上下文推断/附加） */
async function registerWithStore(
    fileId: number,
    fileName: string,
    fileType: DownloadFileType,
    thumbUrl?: string,
    opts?: {
        isAutoPhoto?: boolean;
        isStreaming?: boolean;
        isAutoDownload?: boolean;
        quality?: string;
        tags?: string[];
        sourceLabel?: string;
        remoteId?: string;
        isGeneric?: boolean;
        hiddenCategory?: string;
    },
) {
    const totalSize = 0; // 由 updateFile 事件更新
    const chatTitle = props.chatId ? getChatTitle(props.chatId) : '';
    const extra = [...(opts?.tags ?? [])];
    if (opts?.isAutoDownload && !extra.includes(DL_TAG.AUTO)) extra.push(DL_TAG.AUTO);
    await downloadStore.registerDownload(
        fileId, fileName, chatTitle, totalSize, fileType, thumbUrl,
        props.chatId, props.messageId,
        opts?.isGeneric, opts?.isAutoPhoto, opts?.hiddenCategory, opts?.isStreaming,
        extra.length ? extra : undefined,
        opts?.sourceLabel,
        opts?.remoteId,
    );
}

/** 从下载 store 获取指定 file 的下载进度 0~1（无记录或未下载返回 0） */
function getFileProgress(file: { id?: number; remote?: { id?: string } } | undefined): number {
    const item = downloadStore.getDownloadInfoForFile(file);
    if (!item) return 0;
    return typeof item.progress === 'number' ? Math.min(1, Math.max(0, item.progress)) : 0;
}

/** 当前内容主媒体 File（photo Big / video / animation） */
function contentMainFile() {
    const c = props.content;
    if (c._ === 'messagePhoto') return photoBigFile.value;
    if (c._ === 'messageVideo') return videoFile.value;
    if (c._ === 'messageAnimation') return animFile.value;
    return undefined;
}

/** 当前内容封面/缩略图 File */
function contentCoverFile() {
    const c = props.content;
    if (c._ === 'messageVideo') return videoCoverFile.value;
    if (c._ === 'messageAnimation') return animCoverFile.value;
    return undefined;
}

/**
 * 读取下载 store 中「属于本 content 文件」的完成路径。
 * remote_id 不匹配（session file.id 被其他文件复用）时返回空串，避免媒体乱串。
 */
function storeDonePath(file: { id?: number; remote?: { id?: string } } | undefined): string {
    return downloadStore.getCompletedPathForFile(file);
}

/** 当前图片主文件（Big）的下载进度（用于加载时按进度显示） */
const photoProgress = computed(() => {
    if (props.content._ !== 'messagePhoto') return 0;
    return getFileProgress(photoBigFile.value);
});

/** 当前 GIF 主文件的下载进度 */
const animProgress = computed(() => {
    if (props.content._ !== 'messageAnimation') return 0;
    return getFileProgress(animFile.value);
});

/**
 * 占位缩略图：高清可用则直接用高清；mini 仅在无高清时兜底。
 * 绝不在高清已可用时写入/保留 mini。
 */
function setMediaPreview() {
    applyThumbnailFromContent();
}

/**
 * 视口触发：只负责「按设置决定要不要下载并入队」。
 * 已就绪资源不走这里，展示由 applyMediaFromContent / path watch 完成。
 */
async function requestAutoDownloads() {
    const c = props.content;
    const seq = mediaLoadSeq;

    if (c._ === 'messagePhoto') {
        const big = photoBigFile.value;
        const autoPhoto = shouldAutoDownloadPhotos(props.chatId);
        // Small 已由 prefetchAuxThumbs 同步拉取；此处只处理 Big
        // Big：已就绪直接展示（watch），未就绪才按自动下载设置入队
        if (big && !isFileReady(big) && autoPhoto && canDownloadFile(big)) {
            if (seq !== mediaLoadSeq) return;
            isDownloading.value = true;
            const fileName = `photo_${props.messageId || big.id}.jpg`;
            await registerWithStore(big.id, fileName, 'photo', thumbSrc.value, {
                isAutoPhoto: true,
                isAutoDownload: true,
                remoteId: remoteIdOf(big),
            });
            startQueuedDownload(big.id, async () => {
                try {
                    await tdlibSend({
                        _: 'downloadFile',
                        file_id: big.id,
                        priority: DL_PRIORITY.DEFAULT,
                        offset: 0,
                        limit: 0,
                        synchronous: false,
                    });
                } catch {
                    downloadingFiles.delete(big.id);
                    if (seq === mediaLoadSeq) isDownloading.value = false;
                }
            });
        }
        return;
    }

    if (c._ === 'messageVideo') {
        const f = videoFile.value;
        // 封面已由 prefetchAuxThumbs 处理；此处只负责视频本体
        if (f && isFileReady(f) && f.local.path) {
            mediaSrc.value = convertFileSrc(f.local.path);
            videoDownloaded.value = true;
            videoDownloading.value = false;
            return;
        }
        if (f && !isFileReady(f) && props.chatId && settings.autoDownload.enabled) {
            const cs = useChatStore();
            const chatData = cs.chats[props.chatId] as any;
            if (chatData) {
                const category = getChatCategory(chatData);
                const cfg = settings.autoDownload.videos;
                const shouldAutoDl = cfg.enabled && cfg[category];
                const sizeMB = (f.size || 0) / (1024 * 1024);
                if (shouldAutoDl && sizeMB <= cfg.maxSize) {
                    if (seq !== mediaLoadSeq) return;
                    await handleVideoDownload(false);
                }
            }
        }
        return;
    }

    if (c._ === 'messageAnimation') {
        const f = animFile.value;
        // GIF 封面已由 prefetchAuxThumbs 处理
        if (f && !isFileReady(f) && props.chatId && settings.autoDownload.enabled) {
            const cs = useChatStore();
            const chatData = cs.chats[props.chatId] as any;
            if (chatData) {
                const category = getChatCategory(chatData);
                const cfg = settings.autoDownload.videos;
                const sizeMB = (f.size || 0) / (1024 * 1024);
                if (cfg.enabled && cfg[category] && sizeMB <= cfg.maxSize) {
                    if (seq !== mediaLoadSeq) return;
                    await handleAnimAutoDownload();
                }
            }
        }
    }
}

/**
 * 缩略图 / 图片 Small 预取：挂载与 content 变化时立刻执行。
 * 不进视口并发闸门；主媒体（视频本体 / 图片 Big）仍走 requestAutoDownloads。
 */
async function prefetchAuxThumbs() {
    const seq = mediaLoadSeq;
    const c = props.content;
    if (c._ === 'messageVideo') {
        await downloadVideoCoverAux(seq);
        return;
    }
    if (c._ === 'messageAnimation') {
        await downloadAnimCoverAux(seq);
        return;
    }
    if (c._ === 'messagePhoto') {
        const small = photoSmallFile.value;
        if (small && !isFileReady(small) && canDownloadFile(small)) {
            const path = await downloadAuxFileSync(small);
            if (seq !== mediaLoadSeq) return;
            if (path && !photoBigPath.value) {
                thumbSrc.value = convertFileSrc(path);
                thumbIsBlur.value = false;
            }
        } else if (small && isFileReady(small) && small.local.path && !photoBigPath.value) {
            thumbSrc.value = convertFileSrc(small.local.path);
            thumbIsBlur.value = false;
        }
    }
}

/**
 * 视频封面：传统 video.thumbnail + 新版 cover.photo（mini → Small 同步下载）。
 * 全程 downloadFile synchronous，不走视口并发，不受 autoDownload 限制。
 */
async function downloadVideoCoverAux(seq: number) {
    const c = props.content;
    if (c._ !== 'messageVideo') return;
    const thFormat = c.video.thumbnail?.format;
    const thImgOk = isThumbnailImgRenderable(thFormat);
    const thVideoOk = isThumbnailVideoRenderable(thFormat);
    const thFile = videoCoverFile.value;

    // A. 传统 video.thumbnail
    if (thFile && (thImgOk || thVideoOk || videoCoverIsAnim.value)) {
        if (!isFileReady(thFile) && canDownloadFile(thFile)) {
            const path = await downloadAuxFileSync(thFile);
            if (seq !== mediaLoadSeq) return;
            if (path) {
                videoThumbSrc.value = convertFileSrc(path);
                videoThumbIsVideo.value = thVideoOk || videoCoverIsAnim.value;
                return;
            }
        } else if (isFileReady(thFile) && thFile.local.path) {
            videoThumbSrc.value = convertFileSrc(thFile.local.path);
            videoThumbIsVideo.value = thVideoOk || videoCoverIsAnim.value;
            return;
        }
    }

    // B. 新版 cover.photo：mini 占位 → 同步下最低质量 Small
    const coverMini = c.cover?.minithumbnail?.data;
    if (coverMini && (!videoThumbSrc.value || isMiniThumbSrc(videoThumbSrc.value))) {
        videoThumbSrc.value = `data:image/jpeg;base64,${coverMini}`;
        videoThumbIsVideo.value = false;
    }

    const coverSmall = videoCoverSmallFile.value;
    if (!coverSmall) {
        const vMini = c.video.minithumbnail?.data;
        if (vMini && (!videoThumbSrc.value || isMiniThumbSrc(videoThumbSrc.value))) {
            videoThumbSrc.value = `data:image/jpeg;base64,${vMini}`;
            videoThumbIsVideo.value = false;
        }
        return;
    }

    if (!isFileReady(coverSmall) && canDownloadFile(coverSmall)) {
        const path = await downloadAuxFileSync(coverSmall);
        if (seq !== mediaLoadSeq) return;
        if (path) {
            videoThumbSrc.value = convertFileSrc(path);
            videoThumbIsVideo.value = false;
        }
    } else if (isFileReady(coverSmall) && coverSmall.local.path
        && (!videoThumbSrc.value || isMiniThumbSrc(videoThumbSrc.value))) {
        videoThumbSrc.value = convertFileSrc(coverSmall.local.path);
        videoThumbIsVideo.value = false;
    }
}

/** GIF 封面：同步 downloadFile，不占并发 */
async function downloadAnimCoverAux(seq: number) {
    const c = props.content;
    if (c._ !== 'messageAnimation') return;
    const cover = animCoverFile.value;
    if (cover && !isFileReady(cover) && canDownloadFile(cover)) {
        const path = await downloadAuxFileSync(cover);
        if (seq !== mediaLoadSeq) return;
        if (path) {
            animThumbSrc.value = convertFileSrc(path);
            animThumbIsVideo.value = animCoverIsAnim.value;
            return;
        }
    } else if (cover && isFileReady(cover) && cover.local.path) {
        animThumbSrc.value = convertFileSrc(cover.local.path);
        animThumbIsVideo.value = animCoverIsAnim.value;
        return;
    }
    const min = c.animation.minithumbnail;
    if (min?.data && (!animThumbSrc.value || isMiniThumbSrc(animThumbSrc.value))) {
        animThumbSrc.value = `data:image/jpeg;base64,${min.data}`;
        animThumbIsVideo.value = false;
    }
}

// ---- Photo ----

async function handlePhotoDownload() {
    if (props.content._ !== 'messagePhoto') return;
    const f = photoBigFile.value;
    if (!f) return;
    // 已就绪：直接展示，不进下载队列
    if (photoBigPath.value || isFileReady(f)) {
        const path = photoBigPath.value || f.local.path;
        if (path) {
            mediaSrc.value = convertFileSrc(path);
            mediaLoaded.value = true;
            checkPhotoLoaded();
        }
        return;
    }
    if (!canDownloadFile(f)) return;
    if (downloadingFiles.has(f.id) || isFileDownloading(f.id)) {
        isDownloading.value = true;
        return;
    }
    isDownloading.value = true;
    const fileName = `photo_${props.messageId || f.id}.jpg`;
    await registerWithStore(f.id, fileName, 'photo', thumbSrc.value, { remoteId: remoteIdOf(f) });
    startQueuedDownload(f.id, async () => {
        try {
            await tdlibSend({
                _: 'addFileToDownloads',
                file_id: f.id,
                chat_id: props.chatId,
                message_id: props.messageId,
                priority: DL_PRIORITY.USER_ACTIVE,
            });
        } catch {
            downloadingFiles.delete(f.id);
            isDownloading.value = false;
        }
    });
}

// 下载完成态：优先信 content 路径 watch + download store，不再用 getFile 主动刷新展示。
function finishPhotoDownload(fileId: number, path: string) {
    downloadingFiles.delete(fileId);
    isDownloading.value = false;
    mediaSrc.value = convertFileSrc(path);
    mediaLoaded.value = true;
    checkPhotoLoaded();
    void downloadStore.markCompleted(fileId, path, remoteIdOf(photoBigFile.value));
}

function finishAnimDownload(fileId: number, path: string) {
    downloadingFiles.delete(fileId);
    animDownloading.value = false;
    mediaSrc.value = convertFileSrc(path);
    void downloadStore.markCompleted(fileId, path, remoteIdOf(animFile.value));
}

function finishVideoDownload(fileId: number, path: string) {
    downloadingFiles.delete(fileId);
    videoDownloading.value = false;
    videoDownloaded.value = true;
    videoHasFrame.value = false;
    videoBuffering.value = false;
    mediaSrc.value = convertFileSrc(path);
    void downloadStore.markCompleted(fileId, path, remoteIdOf(videoFile.value));
}

// ---- Animation (GIF) ----
const animDownloading = ref(false);

/**
 * 自动下载 GIF：只决定是否入队，不阻断已就绪展示。
 */
async function handleAnimAutoDownload() {
    if (props.content._ !== 'messageAnimation') return;
    const f = animFile.value;
    if (!f) return;
    if (animFilePath.value || isFileReady(f)) {
        const path = animFilePath.value || f.local.path;
        if (path) mediaSrc.value = convertFileSrc(path);
        return;
    }
    if (!canDownloadFile(f)) return;
    if (downloadingFiles.has(f.id) || isFileDownloading(f.id)) {
        animDownloading.value = true;
        return;
    }
    animDownloading.value = true;
    await registerWithStore(f.id, `animation_${props.messageId || f.id}.gif`, 'animation', undefined, {
        isAutoPhoto: true,
        isAutoDownload: true,
        remoteId: remoteIdOf(f),
    });
    startQueuedDownload(f.id, async () => {
        try {
            await tdlibSend({
                _: 'downloadFile',
                file_id: f.id,
                priority: DL_PRIORITY.DEFAULT,
                offset: 0,
                limit: 0,
                synchronous: false,
            });
        } catch {
            downloadingFiles.delete(f.id);
            animDownloading.value = false;
        }
    });
}

async function handleAnimDownload() {
    if (props.content._ !== 'messageAnimation') return;
    const f = animFile.value;
    if (!f) return;
    if (animFilePath.value || isFileReady(f)) {
        const path = animFilePath.value || f.local.path;
        if (path) mediaSrc.value = convertFileSrc(path);
        return;
    }
    if (!canDownloadFile(f)) return;
    if (downloadingFiles.has(f.id) || isFileDownloading(f.id)) {
        animDownloading.value = true;
        return;
    }
    animDownloading.value = true;
    const fileName = `animation_${props.messageId || f.id}.gif`;
    await registerWithStore(f.id, fileName, 'animation', undefined, { remoteId: remoteIdOf(f) });
    startQueuedDownload(f.id, async () => {
        try {
            await tdlibSend({
                _: 'addFileToDownloads',
                file_id: f.id,
                chat_id: props.chatId,
                message_id: props.messageId,
                priority: DL_PRIORITY.USER_ACTIVE,
            });
        } catch {
            downloadingFiles.delete(f.id);
            animDownloading.value = false;
        }
    });
}

// ---- Video ----

/**
 * @param isUserAction 用户点击下载；false = 自动下载入队
 */
async function handleVideoDownload(isUserAction = false) {
    if (props.content._ !== 'messageVideo') return;
    const video = props.content.video;
    const videoFileObj = videoFile.value;
    if (!videoFileObj) return;
    const fileId = videoFileObj.id;
    videoFileId.value = fileId;

    // 已就绪：直接展示，不进队列
    if (videoFilePath.value || isFileReady(videoFileObj)) {
        const path = videoFilePath.value || videoFileObj.local.path;
        if (path) {
            mediaSrc.value = convertFileSrc(path);
            videoDownloaded.value = true;
            videoHasFrame.value = false;
            videoDownloading.value = false;
        }
        return;
    }

    // 流式：边下边播（仍属「已发起下载」，展示不经过并发闸门之外的等待）
    if (video.supports_streaming && videoFileObj.size > 0) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return;
        }
        if (!downloadingFiles.has(fileId)) {
            downloadingFiles.add(fileId);
            const sFileName = video.file_name || `video_${props.messageId || fileId}.mp4`;
            await registerWithStore(fileId, sFileName, 'video', videoThumbIsVideo.value ? undefined : videoThumbSrc.value, {
                isStreaming: true,
                isAutoDownload: !isUserAction,
                remoteId: remoteIdOf(videoFileObj),
            });
        }
        const streamUrl = convertFileSrc(String(fileId), 'tdstream');
        mediaSrc.value = `${streamUrl}?mime=${video.mime_type}`;
        videoDownloaded.value = true;
        videoBuffering.value = true;
        videoHasFrame.value = false;
        videoDownloading.value = false;
        return;
    }

    if (!canDownloadFile(videoFileObj)) return;
    if (downloadingFiles.has(fileId) || isFileDownloading(fileId)) {
        videoDownloading.value = true;
        return;
    }

    const fileName = video.file_name || `video_${props.messageId || fileId}.mp4`;
    await registerWithStore(fileId, fileName, 'video', videoThumbIsVideo.value ? undefined : videoThumbSrc.value, {
        isAutoDownload: !isUserAction,
        remoteId: remoteIdOf(videoFileObj),
    });
    videoDownloading.value = true;
    videoProgress.value = 0;

    startQueuedDownload(fileId, async () => {
        try {
            if (isUserAction) {
                await tdlibSend({
                    _: 'addFileToDownloads',
                    file_id: fileId,
                    chat_id: props.chatId,
                    message_id: props.messageId,
                    priority: DL_PRIORITY.USER_ACTIVE,
                });
            } else {
                await tdlibSend({
                    _: 'downloadFile',
                    file_id: fileId,
                    priority: DL_PRIORITY.DEFAULT,
                    offset: 0,
                    limit: 0,
                    synchronous: false,
                });
            }
        } catch {
            downloadingFiles.delete(fileId);
            if (mediaLoadSeq >= 0) videoDownloading.value = false;
        }
    });
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
    if (videoElRef.value) {
        videoElRef.value.currentTime = 0;
        void videoElRef.value.play().catch(() => { });
    }
}

/** 视频进入缓冲 → 显示加载转圈 */
function onVideoWaiting() {
    videoBuffering.value = true;
}

/** 视频首帧就绪（loadeddata/canplay）→ 可见；就绪视频不依赖封面层 */
function onVideoFirstFrame() {
    videoHasFrame.value = true;
    videoBuffering.value = false;
}

/** 视频可继续播放 */
function onVideoPlaying() {
    videoBuffering.value = false;
    videoHasFrame.value = true;
}

/** 就绪视频 src 落位后：preload 已在拉首帧；若浏览器已解出数据则立刻标记可见 */
function tryMarkVideoFrameReady() {
    void nextTick(() => {
        const el = videoElRef.value;
        if (!el) return;
        // HAVE_CURRENT_DATA(2) 及以上：已有帧可画
        if (el.readyState >= 2) {
            videoHasFrame.value = true;
            videoBuffering.value = false;
        }
    });
}

/**
 * 视频加载失败：若 content 显示本地已就绪则回退本地路径；
 * 否则丢掉失败的流式源，回到封面 + 下载按钮。
 */
function onVideoError() {
    videoBuffering.value = false;
    videoHasFrame.value = false;
    const c = props.content;
    if (c._ !== 'messageVideo') return;
    const f = c.video.video;
    const localPath = f && isFileReady(f) ? f.local.path : '';
    if (localPath) {
        mediaSrc.value = convertFileSrc(localPath);
        videoDownloaded.value = true;
        return;
    }
    const src = mediaSrc.value || '';
    if (src.includes('tdstream') || !localPath) {
        mediaSrc.value = undefined;
        videoDownloaded.value = false;
        videoDownloading.value = false;
        if (f?.id) downloadingFiles.delete(f.id);
    }
}

function formatDuration(seconds: number): string {
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.floor(Math.abs(seconds) % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 跟随下载 store 完成态（content watch 之外的补充路径） ─────────────────
// 展示主路径是消息内嵌 File 的就绪 watch；store 完成事件用于：
// 下载已注册但 updateFile 快照尚未回写时，尽快落位 mediaSrc。

const trackingFileId = computed<number>(() => {
    const c = props.content;
    if (c._ === 'messagePhoto') return photoBigFile.value?.id ?? 0;
    if (c._ === 'messageAnimation') return animFile.value?.id ?? 0;
    if (c._ === 'messageVideo') return videoFile.value?.id ?? 0;
    return 0;
});

const trackingCoverId = computed<number>(() => {
    const c = props.content;
    if (c._ === 'messageVideo') return videoCoverFile.value?.id ?? 0;
    if (c._ === 'messageAnimation') return animCoverFile.value?.id ?? 0;
    return 0;
});

let stopTrackDownload: (() => void) | null = null;
function stopTrackingDownload() {
    if (stopTrackDownload) { stopTrackDownload(); stopTrackDownload = null; }
}

watch(trackingFileId, () => {
    stopTrackingDownload();
    if (!trackingFileId.value) return;
    // 按 content 内 File（含 remote.id）读取完成路径：
    // session file.id 可能被贴纸等其他文件复用，仅凭 id 查 store 会串媒体。
    const readDonePath = () => storeDonePath(contentMainFile());
    stopTrackDownload = watch(
        readDonePath,
        (path) => {
            if (!path) return;
            const c = props.content;
            if (c._ === 'messagePhoto') {
                if (!mediaSrc.value) finishPhotoDownload(photoBigFile.value?.id ?? 0, path);
                else clearPhotoBusy();
            } else if (c._ === 'messageAnimation') {
                if (!mediaSrc.value) finishAnimDownload(animFile.value?.id ?? 0, path);
                else clearAnimBusy();
            } else if (c._ === 'messageVideo') {
                if (!videoFilePath.value) finishVideoDownload(videoFile.value?.id ?? 0, path);
                else clearVideoBusy();
            }
        },
        { immediate: true }
    );
}, { immediate: true });

// 封面/缩略图 store 完成 → 用高清覆盖 mini（content 已就绪时以 content 路径为准）
watch([trackingCoverId, () => props.content._], () => {
    if (!trackingCoverId.value) return;
    const readCoverPath = () => storeDonePath(contentCoverFile());
    const applyPath = (path: string) => {
        if (!path) return;
        const c = props.content;
        if (c._ === 'messageVideo') {
            const th = c.video.thumbnail;
            if (!th) return;
            const renderable = isThumbnailVideoRenderable(th.format) || isThumbnailImgRenderable(th.format);
            if (!renderable) return;
            if (videoCoverPath.value) {
                videoThumbSrc.value = convertFileSrc(videoCoverPath.value);
                videoThumbIsVideo.value = videoCoverIsAnim.value;
            } else {
                videoThumbSrc.value = convertFileSrc(path);
                videoThumbIsVideo.value = isThumbnailVideoRenderable(th.format);
            }
        } else if (c._ === 'messageAnimation') {
            const th = c.animation.thumbnail;
            if (!th) return;
            const renderable = isThumbnailVideoRenderable(th.format) || isThumbnailImgRenderable(th.format);
            if (!renderable) return;
            if (animCoverPath.value) {
                animThumbSrc.value = convertFileSrc(animCoverPath.value);
                animThumbIsVideo.value = animCoverIsAnim.value;
            } else {
                animThumbSrc.value = convertFileSrc(path);
                animThumbIsVideo.value = isThumbnailVideoRenderable(th.format);
            }
        }
    };
    applyPath(readCoverPath());
    const stop = watch(readCoverPath, (path) => {
        if (path) {
            applyPath(path);
            stop();
        }
    });
}, { immediate: true });

/** 路径就绪 / store 完成后清理忙碌态，避免下载已结束气泡仍显示等待 */
function clearPhotoBusy() {
    isDownloading.value = false;
    if (photoBigFile.value) downloadingFiles.delete(photoBigFile.value.id);
}
function clearAnimBusy() {
    animDownloading.value = false;
    if (animFile.value) downloadingFiles.delete(animFile.value.id);
}
function clearVideoBusy() {
    videoDownloading.value = false;
    if (videoFile.value) downloadingFiles.delete(videoFile.value.id);
}

watch(photoBigPath, (path) => {
    if (path) clearPhotoBusy();
});
watch(animFilePath, (path) => {
    if (path) clearAnimBusy();
});
watch(videoFilePath, (path) => {
    if (path) clearVideoBusy();
});

/** 视频进度跟随 download store（按 content File + remote_id 校验，防 session id 复用串路径） */
watch(() => {
    const f = videoFile.value;
    if (!f?.id && !f?.remote?.id) return null;
    const info = downloadStore.getDownloadInfoForFile(f);
    if (!info) return null;
    return {
        progress: info.progress,
        is_completed: info.is_completed,
        local_path: info.local_path,
        remote_id: info.remote_id,
        expected_remote: remoteIdOf(f),
    };
}, (info) => {
    if (!info) return;
    // remote_id 必须匹配本消息 content 中的 File，否则视为其他文件的进度
    if (info.expected_remote && info.remote_id && info.remote_id !== info.expected_remote) return;
    if (typeof info.progress === 'number' && info.progress > 0 && info.progress < 1) {
        videoProgress.value = info.progress;
    }
    if (info.is_completed && info.local_path && !videoFilePath.value) {
        finishVideoDownload(videoFile.value?.id || 0, info.local_path);
    }
});

/**
 * 当前对话是否应自动下载图片（封面等辅助资源遵循图片设置）。
 * 只决定「要不要下载」，不阻止已就绪资源展示。
 */
function shouldAutoDownloadPhoto(): boolean {
    if (!settings.autoDownload.enabled) return false;
    if (!props.chatId) return true;
    const cs = useChatStore();
    const chatData = cs.chats[props.chatId] as any;
    if (!chatData) return true;
    const category = getChatCategory(chatData);
    const cfg = settings.autoDownload.photos;
    return cfg.enabled && cfg[category];
}

/** 轮询已移除：完成态由 content watch + download store 驱动；保留 stop 空实现以兼容重置逻辑 */
function stopPhotoDownloadPolling() { /* no-op */ }
function stopAnimDownloadPolling() { /* no-op */ }
function stopAnimThumbPolling() { /* no-op */ }
function stopVideoCoverPolling() { /* no-op */ }
function stopVideoDownloadPolling() { /* no-op */ }

onUnmounted(() => {
    stopTrackingDownload();
});
</script>

<style>
/* ===== 媒体剧透：遮罩后方模糊 =====
   当媒体带剧透（.msg-spoiler-media）且未揭示（容器内不存在 .media-sp.is-revealed）时，
   将媒体本体模糊 + 压暗，配合粒子遮罩增强“被遮住”的观感；
   揭示（.is-revealed 出现）后恢复清晰。 */
.msg-spoiler-media>img,
.msg-spoiler-media>video {
    filter: blur(14px) brightness(0.8);
    transition: filter 0.3s ease;
}

.msg-spoiler-media:has(.media-sp.is-revealed)>img,
.msg-spoiler-media:has(.media-sp.is-revealed)>video {
    filter: none;
}
</style>
