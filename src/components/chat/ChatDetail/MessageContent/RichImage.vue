<template>
    <div class="rich-image" :style="wrapperStyle">
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
import { tdlibSend, isFileReady } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { isThumbnailVideoRenderable } from '../../../../utils/thumbnail';

const props = withDefaults(defineProps<{
    file: file;
    alt?: string;
    /** 缩略图格式（可选）：用于判断动态缩略图（MPEG4/WEBM）改用 <video> 渲染 */
    format?: ThumbnailFormat | null;
    /** 撑满容器宽度（square 模式） */
    square?: boolean;
    clickable?: boolean;
}>(), {
    alt: '',
    square: false,
    clickable: false,
});

const src = ref('');
const downloading = ref(false);

/** 是否为 MPEG4/WEBM 动态缩略图（用 <video> 渲染） */
const isVideoThumb = computed(() => isThumbnailVideoRenderable(props.format) && !!src.value);

const wrapperStyle = computed(() => (props.square ? { width: '100%' } : undefined));
const imgStyle = computed(() => (props.square ? { width: '100%', objectFit: 'cover' as const } : undefined));
const placeholderStyle = { width: '100%', aspectRatio: '16 / 9', height: 'auto' };

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
        await tdlibSend({ _: 'downloadFile', file_id: f.id, priority: 1, offset: 0, limit: 0, synchronous: true });
        const updated = await tdlibSend({ _: 'getFile', file_id: f.id });
        const path = updated?.local?.path;
        if (path) src.value = convertFileSrc(path);
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

watch(() => props.file?.id, () => {
    src.value = '';
    load();
});

onMounted(load);
</script>
