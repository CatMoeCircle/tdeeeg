<template>
    <div class="rich-image" :style="wrapperStyle">
        <div v-if="!src" class="animate-pulse bg-gray-200 dark:bg-gray-700" :style="placeholderStyle"></div>
        <img v-else :src="src" :alt="alt" class="block max-w-full h-auto" :style="imgStyle"
            :class="{ 'cursor-pointer': clickable }" @click="clickable ? onOpen() : undefined" loading="lazy" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import type { file } from 'tdlib-types';
import { tdlibSend, isFileReady } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";

const props = withDefaults(defineProps<{
    file: file;
    alt?: string;
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
