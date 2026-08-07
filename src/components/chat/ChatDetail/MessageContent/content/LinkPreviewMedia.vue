<template>
    <!-- 大图媒体（链接预览主图） -->
    <div v-if="large && plan" :class="largeWrapCls" :style="largeWrapStyle">
        <img v-if="src && !plan.fileIsVideo" :src="src" alt="" :class="largeImgCls" />
        <video v-else-if="src && plan.fileIsVideo" :src="src" autoplay loop muted playsinline :class="largeImgCls" />
        <img v-else-if="placeholder" :src="placeholder" alt="" :class="largePlaceholderCls" />
        <div v-else :class="largeFallbackCls">
            <ImageIcon class="h-6 w-6 text-gray-400" />
        </div>
        <!-- 视频：播放标识（动态缩略图已在播放时不显示） -->
        <span v-if="plan.kind === 'video' && !(src && plan.fileIsVideo)"
            class="absolute inset-0 flex items-center justify-center bg-black/10">
            <span class="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                <PlayIcon class="h-5 w-5 text-white" fill="currentColor" />
            </span>
        </span>
    </div>

    <!-- 小图媒体（右侧缩略图） -->
    <div v-else-if="plan"
        class="relative h-16 w-16 shrink-0 self-center overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
        <img v-if="src && !plan.fileIsVideo" :src="src" alt="" class="h-full w-full object-cover" />
        <video v-else-if="src && plan.fileIsVideo" :src="src" autoplay loop muted playsinline
            class="h-full w-full object-cover" />
        <img v-else-if="placeholder" :src="placeholder" alt="" class="h-full w-full object-cover" />
        <span v-if="plan.kind === 'video' && !(src && plan.fileIsVideo)"
            class="absolute inset-0 flex items-center justify-center bg-black/20">
            <PlayIcon class="h-4 w-4 text-white" fill="currentColor" />
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Image as ImageIcon, Play as PlayIcon } from 'lucide-vue-next';
import type { animation, chatPhoto, file, linkPreview, linkPreviewTypeAlbum, photo, sticker, video, LinkPreviewType } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { isThumbnailImgRenderable, isThumbnailVideoRenderable } from '../../../../../utils/thumbnail';

const props = defineProps<{
    preview: linkPreview;
    /** true = 大图；false/省略 = 右侧小缩略图 */
    large?: boolean;
    /** true = 完整展示图片（object-contain 居中，不裁剪），适合贴纸等需整体可见的预览 */
    contain?: boolean;
}>();

/** 从 linkPreview.type 提取出的可展示媒体（照片 / 视频封面 / 动画缩略图） */
interface MediaPlan {
    kind: 'photo' | 'video' | 'animation';
    /** 需要下载/展示的主文件 */
    file?: file;
    /** true 表示 file 为 MPEG4/WEBM 动态媒体（用 <video> 渲染）；false 用 <img> */
    fileIsVideo?: boolean;
    /** 下载未完成时的占位图（minithumbnail base64） */
    placeholder?: string;
    width: number;
    height: number;
}

/** 照片类媒体：photo / chatPhoto（文章/App/WebApp 封面、嵌入播放器缩略图、聊天头像等） */
function photoPlan(p: photo | chatPhoto | undefined): MediaPlan | undefined {
    if (!p || !p.sizes || p.sizes.length === 0) return undefined;
    const sizes = [...p.sizes].sort((a, b) => a.width * a.height - b.width * b.height);
    const target = sizes.find((s) => isFileReady(s.photo)) ?? sizes[sizes.length - 1];
    const last = sizes[sizes.length - 1];
    return {
        kind: 'photo',
        file: target.photo,
        placeholder: p.minithumbnail?.data ? `data:image/jpeg;base64,${p.minithumbnail.data}` : undefined,
        width: last.width,
        height: last.height,
    };
}

/** 视频媒体：优先静态缩略图，其次 MPEG4/WEBM 动态缩略图，其次封面照片 */
function videoPlan(v: video | undefined, cover?: photo | undefined): MediaPlan | undefined {
    if (!v) return undefined;
    const thumb = v.thumbnail;
    if (thumb) {
        if (isThumbnailImgRenderable(thumb.format)) {
            return {
                kind: 'video',
                file: thumb.file,
                placeholder: v.minithumbnail?.data ? `data:image/jpeg;base64,${v.minithumbnail.data}` : undefined,
                width: thumb.width || v.width,
                height: thumb.height || v.height,
            };
        }
        if (isThumbnailVideoRenderable(thumb.format)) {
            return {
                kind: 'video',
                file: thumb.file,
                fileIsVideo: true,
                placeholder: v.minithumbnail?.data ? `data:image/jpeg;base64,${v.minithumbnail.data}` : undefined,
                width: thumb.width || v.width,
                height: thumb.height || v.height,
            };
        }
    }
    return photoPlan(cover);
}

/** 动画（GIF）媒体：优先静态缩略图，其次动态缩略图/已下载的动画本体 */
function animationPlan(a: animation | undefined): MediaPlan | undefined {
    if (!a) return undefined;
    const thumb = a.thumbnail;
    if (thumb) {
        const base = {
            placeholder: a.minithumbnail?.data ? `data:image/jpeg;base64,${a.minithumbnail.data}` : undefined,
            width: thumb.width || a.width,
            height: thumb.height || a.height,
        };
        if (isThumbnailImgRenderable(thumb.format)) {
            return { kind: 'animation', file: thumb.file, fileIsVideo: false, ...base };
        }
        if (isThumbnailVideoRenderable(thumb.format)) {
            return { kind: 'animation', file: thumb.file, fileIsVideo: true, ...base };
        }
    }
    if (isFileReady(a.animation)) {
        return { kind: 'animation', file: a.animation, fileIsVideo: true, width: a.width, height: a.height };
    }
    return undefined;
}

/** 相册：展示其中第一张可用的照片/视频 */
function albumPlan(media: linkPreviewTypeAlbum['media']): MediaPlan | undefined {
    for (const m of media) {
        if (m._ === 'linkPreviewAlbumMediaPhoto') {
            const p = photoPlan(m.photo);
            if (p) return p;
        } else {
            const p = videoPlan(m.video);
            if (p) return p;
        }
    }
    return undefined;
}

/**
 * Sticker 链接预览：WEBP 静态图直接用主文件；WEBM 动态贴纸用 <video> 播放；
 * TGS（Lottie JSON）无法直接渲染，退回其静态缩略图。
 */
function stickerPlan(s: sticker | undefined): MediaPlan | undefined {
    if (!s) return undefined;
    const width = s.width || s.thumbnail?.width || 0;
    const height = s.height || s.thumbnail?.height || 0;
    // 缩略图已就绪时作为占位图，避免主文件下载完成前一片空白
    let placeholder: string | undefined;
    if (s.thumbnail?.file && isFileReady(s.thumbnail.file)) {
        placeholder = convertFileSrc(s.thumbnail.file.local.path);
    }
    switch (s.format?._) {
        case 'stickerFormatWebm':
            return { kind: 'animation', file: s.sticker, fileIsVideo: true, placeholder, width, height };
        case 'stickerFormatTgs':
            return s.thumbnail ? { kind: 'photo', file: s.thumbnail.file, placeholder, width, height } : undefined;
        case 'stickerFormatWebp':
        default:
            return { kind: 'photo', file: s.sticker, placeholder, width, height };
    }
}

/** 按 TDLib 返回的 linkPreview.type 提取媒体；无媒体时返回 undefined（不渲染） */
function extractPlan(t: LinkPreviewType): MediaPlan | undefined {
    switch (t._) {
        case 'linkPreviewTypePhoto':
            return photoPlan(t.photo);
        case 'linkPreviewTypeArticle':
        case 'linkPreviewTypeApp':
        case 'linkPreviewTypeWebApp':
            return photoPlan(t.photo);
        case 'linkPreviewTypeVideo':
            return videoPlan(t.video, t.cover);
        case 'linkPreviewTypeAnimation':
            return animationPlan(t.animation);
        case 'linkPreviewTypeEmbeddedVideoPlayer':
            return t.video ? videoPlan(t.video, t.thumbnail) : photoPlan(t.thumbnail);
        case 'linkPreviewTypeEmbeddedAnimationPlayer':
            return t.animation ? animationPlan(t.animation) : photoPlan(t.thumbnail);
        case 'linkPreviewTypeEmbeddedAudioPlayer':
            return photoPlan(t.thumbnail);
        case 'linkPreviewTypeAlbum':
            return albumPlan(t.media);
        case 'linkPreviewTypeSticker':
            return stickerPlan(t.sticker);
        case 'linkPreviewTypeChat':
        case 'linkPreviewTypeDirectMessagesChat':
        case 'linkPreviewTypeUser':
        case 'linkPreviewTypeChannelBoost':
        case 'linkPreviewTypeSupergroupBoost':
        case 'linkPreviewTypeVideoChat':
            return photoPlan(t.photo);
        default:
            return undefined;
    }
}

const plan = computed<MediaPlan | undefined>(() => extractPlan(props.preview.type));
const placeholder = computed(() => plan.value?.placeholder);

/** 当前展示的图片/视频 URL（下载完成前为占位图） */
const src = ref<string | undefined>(undefined);

/** 加载代次：plan 变化时自增，丢弃过期下载结果，避免旧文件覆盖新预览 */
let loadSeq = 0;

let pollTimer: ReturnType<typeof setInterval> | null = null;
function stopPoll() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/** 后台下载中：轮询 getFile 直到本地就绪后展示 */
function pollUntilReady(fileId: number, seq: number) {
    stopPoll();
    pollTimer = setInterval(async () => {
        if (seq !== loadSeq) return;
        try {
            const info = await tdlibSend({ _: 'getFile', file_id: fileId });
            if (isFileReady(info)) {
                stopPoll();
                if (seq === loadSeq) src.value = convertFileSrc(info.local.path);
            }
        } catch {
            stopPoll();
        }
    }, 400);
}

async function load() {
    const seq = ++loadSeq;
    stopPoll();
    src.value = undefined;
    const p = plan.value;
    const f = p?.file;
    if (!p || !f) return;
    if (isFileReady(f)) {
        if (seq === loadSeq) src.value = convertFileSrc(f.local.path);
        return;
    }
    if (!f.local.can_be_downloaded) return;
    // 已在下载中（其它组件发起）则直接轮询，避免重复发起
    if (!downloadingFiles.has(f.id)) {
        downloadingFiles.add(f.id);
        try {
            await tdlibSend({ _: 'downloadFile', file_id: f.id, priority: 1, offset: 0, limit: 0, synchronous: false });
        } catch {
            return;
        } finally {
            downloadingFiles.delete(f.id);
        }
    }
    if (seq !== loadSeq) return;
    pollUntilReady(f.id, seq);
}

watch(plan, () => { void load(); }, { immediate: true });
onUnmounted(stopPoll);

/** 大图布局：按媒体宽高比展示，最高 300px */
const largeStyle = computed(() => {
    const p = plan.value;
    if (!p || !p.width || !p.height) return undefined;
    return { width: '100%', aspectRatio: `${p.width} / ${p.height}`, maxHeight: '300px' };
});

/** contain 模式：完整展示图片（不裁剪），居中；默认 cover 裁剪填充 */
const largeWrapCls = computed(() => props.contain
    ? 'relative flex min-h-40 items-center justify-center overflow-hidden bg-gray-200 dark:bg-gray-700'
    : 'relative overflow-hidden bg-gray-200 dark:bg-gray-700');
const largeWrapStyle = computed(() => (props.contain ? undefined : largeStyle.value));
const largeImgCls = computed(() => props.contain
    ? 'max-h-[280px] max-w-full object-contain'
    : 'h-full w-full object-cover');
const largePlaceholderCls = computed(() => props.contain
    ? 'max-h-[280px] max-w-full object-contain opacity-60'
    : 'h-full w-full scale-105 object-cover blur-sm');
const largeFallbackCls = computed(() => props.contain
    ? 'flex h-40 w-full items-center justify-center'
    : 'flex h-full w-full items-center justify-center');
</script>
