<template>
    <div :class="content._ === 'messageAnimatedEmoji' ? 'w-24 h-24' : 'w-40 h-40'">
        <!-- WEBP static sticker -->
        <img v-if="format === 'webp' && mediaSrc" :src="mediaSrc" class="w-full h-full object-contain" />
        <!-- TGS animated sticker (Lottie) -->
        <div v-else-if="format === 'tgs'" ref="lottieRef" class="w-full h-full"></div>
        <!-- WEBM video sticker -->
        <video v-else-if="format === 'webm' && mediaSrc" :src="mediaSrc" autoplay loop muted playsinline
            class="w-full h-full object-contain" />
        <!-- Fallback -->
        <div v-else class="w-full h-full flex items-center justify-center text-2xl">
            {{ emoji }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue';
import type { messageAnimatedEmoji, messageSticker } from 'tdlib-types';
import { tdlibSend, isFileReady } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import lottie, { type AnimationItem } from 'lottie-web';
import * as pako from 'pako';

const props = defineProps<{
    content: messageSticker | messageAnimatedEmoji;
}>();

const lottieRef = ref<HTMLElement | null>(null);
const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
let lottieAnim: AnimationItem | null = null;

const sticker = computed(() => props.content._ === 'messageSticker'
    ? props.content.sticker
    : props.content.animated_emoji.sticker);
const emoji = computed(() => props.content._ === 'messageSticker'
    ? props.content.sticker.emoji || '🧩'
    : props.content.emoji);

/** 检测贴纸格式 */
const format = computed(() => sticker.value?.format._ === 'stickerFormatTgs' ? 'tgs'
    : sticker.value?.format._ === 'stickerFormatWebm' ? 'webm'
        : 'webp');

const getFile = () => sticker.value?.sticker;

const loadMedia = async () => {
    const f = getFile();
    if (!f) return;

    if (isFileReady(f)) {
        await loadSticker(f.local.path);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        downloadFile(f.id);
    }
};

const downloadFile = async (fileId: number) => {
    if (isDownloading.value) return;
    isDownloading.value = true;
    try {
        const res = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true,
        });
        if (isFileReady(res)) {
            await loadSticker(res.local.path);
        }
    } catch (e) {
        console.error("Sticker download failed", e);
    } finally {
        isDownloading.value = false;
    }
};

/** 加载贴纸（根据格式选择渲染方式） */
async function loadSticker(filePath: string) {
    if (format.value === 'webp') {
        mediaSrc.value = convertFileSrc(filePath);
    } else if (format.value === 'tgs') {
        await loadTgs(filePath);
    } else if (format.value === 'webm') {
        mediaSrc.value = convertFileSrc(filePath);
    }
}

/** 加载 TGS（gzipped Lottie JSON）并播放 */
async function loadTgs(filePath: string) {
    try {
        destroyLottie();

        // 通过 asset protocol 读取文件
        const url = convertFileSrc(filePath);
        const resp = await fetch(url);
        const compressed = new Uint8Array(await resp.arrayBuffer());

        // 解压 gzip
        let jsonStr: string;
        try {
            const decompressed = pako.inflate(compressed);
            jsonStr = new TextDecoder('utf-8').decode(decompressed);
        } catch {
            // 可能不是 gzip 压缩的，尝试直接解析 JSON
            const decoder = new TextDecoder('utf-8');
            jsonStr = decoder.decode(compressed);
        }

        const animData = JSON.parse(jsonStr);

        await nextTick();
        if (!lottieRef.value) return;

        lottieAnim = lottie.loadAnimation({
            container: lottieRef.value,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: animData,
        });
    } catch (e) {
        console.error("Failed to load TGS sticker:", e);
    }
}

function destroyLottie() {
    if (lottieAnim) {
        lottieAnim.destroy();
        lottieAnim = null;
    }
}

onUnmounted(() => {
    destroyLottie();
});

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    destroyLottie();
    loadMedia();
}, { immediate: true });
</script>
