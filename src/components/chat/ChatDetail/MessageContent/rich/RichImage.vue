<template>
    <div ref="rootEl" class="rich-image" :style="wrapperStyle">
        <div v-if="!src" class="animate-pulse bg-gray-200 dark:bg-gray-700" :style="placeholderStyle"></div>
        <video v-else-if="isVideoThumb" :src="src" :alt="alt" autoplay loop muted playsinline
            class="block max-w-full h-auto" :style="imgStyle" :class="{ 'cursor-pointer': clickable }"
            @click="clickable ? onOpen() : undefined" preload="metadata" />
        <img v-else :src="src" :alt="alt" class="block max-w-full h-auto" :style="imgStyle"
            :class="{ 'cursor-pointer': clickable }" @click="clickable ? onOpen() : undefined" loading="lazy" />
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
}>(), {
    alt: '',
    square: false,
    fill: false,
    clickable: false,
});

const rootEl = ref<HTMLElement | null>(null);
const src = ref('');
const downloading = ref(false);

/** 是否为 MPEG4/WEBM 动态缩略图（用 <video> 渲染） */
const isVideoThumb = computed(() => isThumbnailVideoRenderable(props.format) && !!src.value);

const wrapperStyle = computed(() => {
    if (props.fill) return { width: '100%', height: '100%' };
    if (props.square) return { width: '100%' };
    return undefined;
});
const imgStyle = computed(() => {
    if (props.fill) return { width: '100%', height: '100%', objectFit: 'cover' as const };
    if (props.square) return { width: '100%', objectFit: 'cover' as const };
    return undefined;
});
const placeholderStyle = computed(() => props.fill
    ? { width: '100%', height: '100%' }
    : { width: '100%', aspectRatio: '16 / 9', height: 'auto' });

async function load() {
    const f = props.file;
    if (!f) return;
    if (isFileReady(f)) {
        src.value = convertFileSrc(f.local.path);
        return;
    }
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
    load();
});
watch(() => props.file?.id, () => {
    src.value = '';
    if (imgEntered.value) load();
});

onMounted(() => {
    startViewportLoad();
});
</script>
