<template>
    <div ref="rootEl" :class="content._ === 'messageAnimatedEmoji' ? 'w-24 h-24 cursor-pointer' : ''"
        :style="content._ !== 'messageAnimatedEmoji' ? stickerSizeStyle : undefined" @click="onContentClick">
        <!-- WEBP static sticker -->
        <img v-if="format === 'webp' && mediaSrc" :src="mediaSrc" class="w-full h-full object-contain" />
        <!-- TGS animated sticker (tlottie) -->
        <TgsPlayer v-else-if="format === 'tgs' && tgsSrc" ref="playerRef" :src="tgsSrc" :loop="!isAnimatedEmoji"
            :autoplay="true" :size="tgsSize" :fitz-modifier="fitzModifier" @load="onAnimLoad" @error="onAnimError" />
        <!-- WEBM video sticker -->
        <video v-else-if="format === 'webm' && mediaSrc" ref="videoRef" :src="mediaSrc" autoplay loop muted playsinline
            class="w-full h-full object-contain" />
        <!-- Thumbnail placeholder (sticker's own thumbnail) -->
        <img v-else-if="thumbSrc" :src="thumbSrc" class="w-full h-full object-contain" />
        <!-- Fallback: gray background -->
        <div v-else class="w-full h-full sticker-placeholder" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import type { messageAnimatedEmoji, messageSticker } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { useDownloadStore } from '../../../../../store/downloads';
import { settings } from '../../../../../store/settings';
import { useLottiePause } from '../../../../../composables/useLottiePause';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { convertFileSrc } from "@tauri-apps/api/core";
import TgsPlayer, { type TgsPlayerInstance } from '../../../../common/TgsPlayer.vue';
import { telegramFitzToFitzModifier } from '../../../../../utils/tlottieFitz';

const props = defineProps<{
    content: messageSticker | messageAnimatedEmoji;
    size?: number;
}>();

const rootEl = ref<HTMLElement | null>(null);
const playerRef = ref<TgsPlayerInstance | null>(null);
/** WEBM/GIF 视频元素（受同一窗口/视口暂停门控） */
const videoRef = ref<HTMLVideoElement | null>(null);
const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
/** TGS 本地文件 URL（convertFileSrc → tlottie fetch） */
const tgsSrc = ref<string | null>(null);
/** Telegram fitzpatrick → tlottie FitzModifier */
const fitzModifier = computed(() => {
    const fitzType = props.content._ === 'messageAnimatedEmoji'
        ? (props.content.animated_emoji.fitzpatrick_type || 0)
        : 0;
    return telegramFitzToFitzModifier(fitzType);
});

/** 是否为"大号动画表情"（messageAnimatedEmoji：只播一次、点击重播） */
const isAnimatedEmoji = computed(() => props.content._ === 'messageAnimatedEmoji');

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerAnim, registerVideo, get: getAnim, setup: setupPause } = useLottiePause(rootEl);

/** TGS 显示边长（动画表情固定方形；普通贴纸跟随设置） */
const tgsSize = computed(() => isAnimatedEmoji.value ? 96 : (props.size ?? settings.sticker.size));

/** 贴纸尺寸样式（跟随设置，仅对普通贴纸生效；动画表情保持固定） */
const stickerSizeStyle = computed<Record<string, string>>(() => ({
    width: `${props.size ?? settings.sticker.size}px`,
    height: `${props.size ?? settings.sticker.size}px`,
}));

const sticker = computed(() => props.content._ === 'messageSticker'
    ? props.content.sticker
    : props.content.animated_emoji.sticker);

/** 贴纸自带缩略图（已下载时可直接显示，作为加载前的占位） */
const thumbSrc = computed(() => {
    const s = sticker.value;
    if (!s?.thumbnail?.file) return undefined;
    const f = s.thumbnail.file;
    if (f.local.is_downloading_completed && f.local.path) {
        return convertFileSrc(f.local.path);
    }
    return undefined;
});

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
        loadTgs(filePath);
    } else if (format.value === 'webm') {
        mediaSrc.value = convertFileSrc(filePath);
    }
}

/** 加载 TGS：本地路径 → asset URL，tlottie 以 src fetch + Worker 内解压 */
function loadTgs(filePath: string) {
    tgsSrc.value = null;
    requestAnimationFrame(() => {
        tgsSrc.value = convertFileSrc(filePath);
    });
}

function onAnimError(e: unknown) {
    console.error('[MessageStickerContent] TGS error', e, tgsSrc.value);
}

/** TgsPlayer 加载完成回调：把实例注册进暂停/恢复控制器 */
function onAnimLoad() {
    registerAnim(playerRef.value);
}

// WEBM/GIF 视频：等 DOM 渲染出 <video> 后注册进窗口/视口暂停门控
watch([format, mediaSrc, () => props.content], () => {
    registerVideo(format.value === 'webm' && mediaSrc.value ? videoRef.value : null);
}, { flush: 'post' });

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
    tgsSrc.value = null;
    registerAnim(null);
    // 已进入视口（此前无内容/已触发过）时新内容到达需补下载
    if (stickerEntered.value) loadMedia();
}, { immediate: true });
onMounted(() => {
    startViewportLoad();
});
</script>

<style scoped>
.sticker-placeholder {
    background: rgba(128, 128, 128, 0.12);
    border-radius: 8px;
}
</style>
