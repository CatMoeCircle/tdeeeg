<template>
    <div ref="rootEl" :class="content._ === 'messageAnimatedEmoji' ? 'w-24 h-24 cursor-pointer' : ''"
        :style="content._ !== 'messageAnimatedEmoji' ? stickerSizeStyle : undefined" @click="onContentClick">
        <!-- WEBP static sticker -->
        <img v-if="format === 'webp' && mediaSrc" :src="mediaSrc" class="w-full h-full object-contain" />
        <!-- TGS animated sticker (Lottie) -->
        <RlottiePlayer v-else-if="format === 'tgs' && tgsData" ref="playerRef" :src="tgsData"
            :loop="!isAnimatedEmoji" :autoplay="true" :width="tgsRenderSize" :height="tgsRenderSize"
            :class="tgsHiResClass" :style="tgsHiResStyle" @load="onAnimLoad" />
        <!-- WEBM video sticker -->
        <video v-else-if="format === 'webm' && mediaSrc" :src="mediaSrc" autoplay loop muted playsinline
            class="w-full h-full object-contain" />
        <!-- Fallback -->
        <div v-else class="w-full h-full flex items-center justify-center text-2xl">
            <GlobalEmojiInline :emoji="emoji" :size="48" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import type { messageAnimatedEmoji, messageSticker } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from '@tauri-apps/plugin-fs';
import { useDownloadStore } from '../../../../../store/downloads';
import { settings } from '../../../../../store/settings';
import { useLottiePause } from '../../../../../composables/useLottiePause';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { useRlottieRenderSize } from '../../../../../composables/useRlottieRenderSize';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import GlobalEmojiInline from '../../../../common/GlobalEmojiInline.vue';
import { applyFitzpatrick } from '../../../../../utils/fitzpatrick';
import { RlottiePlayer, type RlottiePlayerInstance } from 'rlottie-wasm-vue-player';
import * as pako from 'pako';

const props = defineProps<{
    content: messageSticker | messageAnimatedEmoji;
    size?: number;
}>();

const rootEl = ref<HTMLElement | null>(null);
const playerRef = ref<RlottiePlayerInstance | null>(null);
const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
/** 解析、Fitzpatrick 替换后的 TGS Lottie JSON（字符串形式，作为 RlottiePlayer 的 src） */
const tgsData = ref<string | null>(null);

/** 是否为"大号动画表情"（messageAnimatedEmoji：只播一次、点击重播） */
const isAnimatedEmoji = computed(() => props.content._ === 'messageAnimatedEmoji');

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerAnim, get: getAnim, setup: setupPause } = useLottiePause(rootEl);

/** TGS 画布尺寸（动画表情固定方形；普通贴纸跟随设置） */
const tgsSize = computed(() => isAnimatedEmoji.value ? 96 : (props.size ?? settings.sticker.size));

/** 超采样渲染尺寸与显示样式（提高 TGS 清晰度） */
const { renderSize: tgsRenderSize, hiResStyle: tgsHiResStyle, hiResClass: tgsHiResClass } = useRlottieRenderSize(tgsSize);

/** 贴纸尺寸样式（跟随设置，仅对普通贴纸生效；动画表情保持固定） */
const stickerSizeStyle = computed<Record<string, string>>(() => ({
    width: `${props.size ?? settings.sticker.size}px`,
    height: `${props.size ?? settings.sticker.size}px`,
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
    // 贴纸：记录为隐藏资源，不需要来源，分类为 sticker
    const ext = format.value === 'tgs' ? 'tgs' : format.value === 'webm' ? 'webm' : 'webp';
    await useDownloadStore().registerDownload(fileId, `sticker_${fileId}.${ext}`, '', 0, 'sticker', undefined, undefined, undefined, true, false, 'sticker');
    try {
        const res = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: DL_PRIORITY.DEFAULT,
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

/** 加载 TGS（gzipped Lottie JSON）并交给 RlottiePlayer 播放 */
async function loadTgs(filePath: string) {
    try {
        // 清空旧数据使 RlottiePlayer 卸载重建，避免残留上一份动画
        tgsData.value = null;

        // 通过 fs 插件直接读取文件字节。
        // 不再用 fetch(convertFileSrc(url))——生产构建 CSP 默认不放开 connect-src 到 asset
        // 协议，fetch 会被拦截（403），改用 readFile 读取原始字节更可靠。
        const compressed = await readFile(filePath);

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

        // Telegram 动态 emoji 的 Fitzpatrick 肤色替换：
        // TGS 顶层内嵌 "fitz" 映射表，lottie 渲染器不识别，需在播放前
        // 根据 animatedEmoji.fitzpatrick_type 把原色批量替换为目标肤色。
        const fitzType = props.content._ === 'messageAnimatedEmoji'
            ? (props.content.animated_emoji.fitzpatrick_type || 0)
            : 0;
        const fitzAnimData = applyFitzpatrick(animData, fitzType);

        // RlottiePlayer 的 src 接受 stringified JSON（不以 http / 开头会被当作 JSON 串处理）
        tgsData.value = JSON.stringify(fitzAnimData);
    } catch (e) {
        console.error("Failed to load TGS sticker:", e);
    }
}

/** RlottiePlayer 加载完成回调：把实例注册进暂停/恢复控制器 */
function onAnimLoad() {
    registerAnim(playerRef.value);
}

/** 点击大号动画表情时从头重播（普通贴纸不受影响） */
function onContentClick() {
    if (!isAnimatedEmoji.value) return;
    const anim = getAnim();
    if (!anim) return;
    // 若因窗口失焦/离开视口被暂停，重播不受影响
    anim.stop?.();
    anim.play();
}

// 挂载后初始化暂停控制器（视口观察 + 窗口聚焦 + 平滑滚动监听）
onMounted(() => {
    setupPause();
});

// 视口门控：进入视口才下载真实贴纸文件；未进入显示 emoji 占位。
const { start: startViewportLoad, entered: stickerEntered } = useViewportLoad(rootEl, () => {
    loadMedia();
});
watch(() => props.content, () => {
    mediaSrc.value = undefined;
    tgsData.value = null;
    registerAnim(null);
    // 已进入视口（此前无内容/已触发过）时新内容到达需补下载
    if (stickerEntered.value) loadMedia();
}, { immediate: true });
onMounted(() => {
    startViewportLoad();
});
</script>
