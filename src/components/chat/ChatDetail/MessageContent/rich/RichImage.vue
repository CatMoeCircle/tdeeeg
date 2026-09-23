<template>
    <div ref="rootEl" class="rich-image relative" :style="wrapperStyle">
        <div v-if="!src" class="animate-pulse bg-gray-200 dark:bg-gray-700" :style="placeholderStyle"></div>
        <video v-else-if="isVideoThumb" :src="src" :alt="alt" autoplay loop muted playsinline
            class="block max-w-full" :class="imgClass" :style="imgStyle"
            @click="clickable ? onOpen() : undefined" preload="metadata" />
        <img v-else :src="src" :alt="alt" class="block max-w-full" :class="imgClass" :style="imgStyle"
            @click="clickable ? onOpen() : undefined" loading="lazy" />
        <!-- 未下载：手动下载按钮（自动下载关闭时） -->
        <RichMediaDownload v-if="!src && showDownload" :file="file" :file-name="`rich_image_${file.id}`"
            file-type="photo" :chat-id="chatId" overlay />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import type { file, ThumbnailFormat } from 'tdlib-types';
import { tdlibSend, isFileReady } from '../../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { isThumbnailVideoRenderable } from '../../../../../utils/thumbnail';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { shouldAutoDownloadPhotos } from '../../../../../utils/autoDownload';
import { useDownloadStore } from '../../../../../store/downloads';
import RichMediaDownload from './RichMediaDownload.vue';

const props = withDefaults(defineProps<{
    file: file;
    alt?: string;
    /** 缩略图格式（可选）：用于判断动态缩略图（MPEG4/WEBM）改用 <video> 渲染 */
    format?: ThumbnailFormat | null;
    /** 撑满容器宽度（square 模式） */
    square?: boolean;
    /** Fill the parent media tile. */
    fill?: boolean;
    clickable?: boolean;
    /** 来源对话，用于按「图片」自动下载设置决定是否拉取富文本图片 */
    chatId?: number;
}>(), {
    alt: '',
    square: false,
    fill: false,
    clickable: false,
});

const downloadStore = useDownloadStore();
const rootEl = ref<HTMLElement | null>(null);
const src = ref('');
const downloading = ref(false);

/** 未就绪且可下载时显示手动下载按钮 */
const showDownload = computed(() => !!props.file?.id && !!props.file?.local?.can_be_downloaded);

/** 是否为 MPEG4/WEBM 动态缩略图（用 <video> 渲染） */
const isVideoThumb = computed(() => isThumbnailVideoRenderable(props.format) && !!src.value);

/** fill/square 由样式强制撑满容器；默认保留 h-auto 自然比例 */
const imgClass = computed(() => (props.fill || props.square ? '' : 'h-auto'));

const wrapperStyle = computed(() => {
    if (props.fill) return { width: '100%', height: '100%' };
    // square：填满外层 mediaSizeStyle 容器（已限 432/96 并带 aspect-ratio）
    if (props.square) return { width: '100%', height: '100%' };
    return undefined;
});
const imgStyle = computed(() => {
    if (props.fill) return { width: '100%', height: '100%', objectFit: 'cover' as const };
    if (props.square) return { width: '100%', height: '100%', objectFit: 'cover' as const };
    return undefined;
});
const placeholderStyle = computed(() => {
    if (props.fill || props.square) return { width: '100%', height: '100%' };
    return { width: '100%', aspectRatio: '16 / 9', height: 'auto' };
});

async function load() {
    const f = props.file;
    if (!f) return;
    if (isFileReady(f)) {
        src.value = convertFileSrc(f.local.path);
        return;
    }
    // 富文本图片跟随「图片」自动下载设置
    if (!shouldAutoDownloadPhotos(props.chatId)) return;
    if (downloading.value) return;
    downloading.value = true;
    try {
        await tdlibSend({ _: 'downloadFile', file_id: f.id, priority: DL_PRIORITY.THUMBNAIL, offset: 0, limit: 0, synchronous: true });
        const updated = await tdlibSend({ _: 'getFile', file_id: f.id });
        // 仅在完全下载完成（本地路径非空且 is_downloading_completed）时才展示真实图片；
        // 否则保持占位，避免显示残缺/半下载的文件。
        if (isFileReady(updated)) src.value = convertFileSrc(updated.local.path);
    } catch (e) {
        console.warn('RichImage download failed:', e);
    } finally {
        downloading.value = false;
    }
}

function onOpen() {
    const path = src.value;
    if (path) {
        window.open(path, '_blank');
    }
}

// 视口门控：进入视口才下载富文本图片；未进入显示骨架占位。
const { start: startViewportLoad, entered: imgEntered } = useViewportLoad(rootEl, () => {
    return load();
});
watch(() => props.file?.id, () => {
    src.value = '';
    if (imgEntered.value) load();
});
// 手动下载完成后刷新
watch(
    () => props.file ? downloadStore.getDownloadInfoForFile(props.file)?.is_completed : false,
    (done) => {
        if (done) void load();
    },
);

onMounted(() => {
    startViewportLoad();
});
</script>
