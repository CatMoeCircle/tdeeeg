<template>
    <div :class="content._ === 'messageAnimatedEmoji' ? 'w-24 h-24 cursor-pointer' : ''"
        :style="content._ !== 'messageAnimatedEmoji' ? stickerSizeStyle : undefined" @click="onContentClick">
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
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { messageAnimatedEmoji, messageSticker } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { useDownloadStore } from '../../../../store/downloads';
import { settings } from '../../../../store/settings';
import { useLottiePause } from '../../../../composables/useLottiePause';
import lottie, { type AnimationItem } from 'lottie-web';
import * as pako from 'pako';

const props = defineProps<{
    content: messageSticker | messageAnimatedEmoji;
}>();

const lottieRef = ref<HTMLElement | null>(null);
const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
let lottieAnim: AnimationItem | null = null;

/** 是否为"大号动画表情"（messageAnimatedEmoji：只播一次、点击重播） */
const isAnimatedEmoji = computed(() => props.content._ === 'messageAnimatedEmoji');

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerAnim, get: getAnim, setup: setupPause } = useLottiePause(lottieRef);

/** 贴纸尺寸样式（跟随设置，仅对普通贴纸生效；动画表情保持固定） */
const stickerSizeStyle = computed<Record<string, string>>(() => ({
    width: `${settings.sticker.size}px`,
    height: `${settings.sticker.size}px`,
}));

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
    if (downloadingFiles.has(fileId)) return;
    isDownloading.value = true;
    downloadingFiles.add(fileId);
    // 贴纸：记录为隐藏资源，不需要来源
    const ext = format.value === 'tgs' ? 'tgs' : format.value === 'webm' ? 'webm' : 'webp';
    await useDownloadStore().registerDownload(fileId, `sticker_${fileId}.${ext}`, '', 0, 'sticker', undefined, undefined, undefined, true);
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
        downloadingFiles.delete(fileId);
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
            // 普通贴纸循环播放；大号动画表情（messageAnimatedEmoji）只播一次，点击可重播
            loop: !isAnimatedEmoji.value,
            autoplay: true,
            animationData: animData,
        });
        registerAnim(lottieAnim);
    } catch (e) {
        console.error("Failed to load TGS sticker:", e);
    }
}

/** 点击大号动画表情时从头重播（普通贴纸不受影响） */
function onContentClick() {
    if (!isAnimatedEmoji.value) return;
    const anim = getAnim();
    if (!anim) return;
    // 若因窗口失焦/离开视口被暂停，重播不受影响
    anim.stop();
    anim.play();
}

function destroyLottie() {
    if (lottieAnim) {
        lottieAnim.destroy();
        lottieAnim = null;
    }
}

// 挂载后初始化暂停控制器（视口观察 + 窗口聚焦 + 平滑滚动监听）
onMounted(() => {
    setupPause();
});

onUnmounted(() => {
    destroyLottie();
});

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    destroyLottie();
    loadMedia();
}, { immediate: true });
</script>
