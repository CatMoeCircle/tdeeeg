<template>
    <div ref="rootEl" class="sp-media-item w-full aspect-square" @click="onClick"
        @contextmenu.prevent.stop="onContextMenu">
        <!-- TGS 动画贴纸（tlottie） -->
        <TgsPlayer v-if="format === 'tgs' && tgsSrc" ref="playerRef" :src="tgsSrc" :fitz-modifier="fitzModifier" loop
            :autoplay="false" @error="onError" />
        <!-- WEBP / MPEG4 / GIF：<img> 或 <video>（100% 铺满 + object-fit: cover） -->
        <img v-else-if="format === 'webp' && src" :src="src" :alt="alt" draggable="false" :style="imgStyle"
            loading="lazy" />
        <video v-else-if="format !== 'tgs' && src" ref="videoRef" :src="src" autoplay loop muted playsinline
            :style="imgStyle" />
        <!-- Thumbnail placeholder (sticker's own thumbnail) -->
        <img v-else-if="thumbSrc" :src="thumbSrc" :alt="alt" draggable="false" :style="imgStyle" loading="lazy" />
        <!-- 占位：灰色背景 -->
        <div v-else class="sp-media-ph" :style="imgStyle"></div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { sticker, animation } from 'tdlib-types';
import TgsPlayer, { type TgsPlayerInstance } from '../../../common/TgsPlayer.vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useStickerMedia } from './composables/useStickerMedia';
import { onVisibilityChange, unobserve, isProgrammaticScroll, isUserScrolling, deferLoadWhileScrolling, isWindowActive, onWindowActiveChange } from './composables/useStickerVisibility';

const props = withDefaults(defineProps<{
    /** 贴纸或动画对象（可为 null 直到加载完成） */
    item: sticker | animation | undefined;
    /** 类型 */
    kind: 'sticker' | 'animation';
    /** 显示尺寸（CSS 边长，px） */
    size?: number;
    /** 肤色（动态 emoji / 贴纸若支持） */
    skinTone?: number;
    /** 无障碍文本 */
    alt?: string;
}>(), {
    size: 72,
    skinTone: 0,
    alt: '',
});

const emit = defineEmits<{
    (e: 'pick', item: sticker | animation): void;
    (e: 'contextmenu', ev: MouseEvent, item: sticker | animation): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const playerRef = ref<TgsPlayerInstance | null>(null);
/** GIF / webm / mp4 视频元素（用于暂停/恢复） */
const videoRef = ref<HTMLVideoElement | null>(null);

/** 统一媒体源解析（下载 + TGS 字节 + 肤色修饰符） */
const media = useStickerMedia(() => props.item, props.kind, { skinTone: computed(() => props.skinTone) });

/** 顶层解包，便于模板自动解包 */
const format = media.format;
const src = media.src;
const tgsSrc = media.tgsSrc;
const fitzModifier = media.fitzModifier;

/** 图片/视频/占位尺寸样式 —— 100% 铺满正方形容器，内容居中裁剪（object-fit: cover） */
const imgStyle = computed<Record<string, string>>(() => ({
    width: '100%',
    height: '100%',
    objectFit: 'cover',
}));

/** 贴纸自带缩略图（已下载时可直接显示，作为加载前的占位） */
const thumbSrc = computed(() => {
    const o = props.item;
    if (!o) return undefined;
    // sticker 类型有 thumbnail；animation 类型无 thumbnail
    if ('thumbnail' in o && o.thumbnail?.file) {
        const f = o.thumbnail.file;
        if (f.local.is_downloading_completed && f.local.path) {
            return convertFileSrc(f.local.path);
        }
    }
    return undefined;
});

/** 已否触发过首次下载 */
let downloadStarted = false;
/** 当前是否处于（放大的）可视区 —— 用于「窗口范围内才播放」的门控 */
let inView = false;

/**
 * 播放门控（共享观察器 + 窗口激活状态）：
 *  - 首次进入可视区才触发下载；
 *  - TGS / GIF(webm/mp4 video) 仅在「可视区 **且** 窗口激活（聚焦未隐藏）」时播放。
 *    进入即 play，离开视口或窗口失焦/隐藏即 pause，避免离屏或后台仍跑 rAF/video。
 *  - 动画 webp（<img>）浏览器无暂停 API，保持现状（Telegram 的 webp 贴纸/emoji 为静态图）。
 */
function applyPlayback() {
    const windowOk = isWindowActive();
    // TGS：rlottie 播放器
    if (format.value === 'tgs') {
        if (inView && windowOk && !!tgsSrc.value) {
            playerRef.value?.play();
        } else {
            playerRef.value?.pause();
        }
        return;
    }
    // GIF / webm / mp4：视频元素可暂停
    if (format.value !== 'webp') {
        const v = videoRef.value;
        if (!v) return;
        if (inView && windowOk && !!src.value) {
            void v.play().catch(() => { /* 竞态/自动播放拦截 */ });
        } else {
            v.pause();
        }
    }
}

function syncPlayback() {
    applyPlayback();
}

let unsubscribeWindow: (() => void) | null = null;

onMounted(() => {
    onVisibilityChange(
        rootEl.value,
        () => {
            inView = true;
            if (!downloadStarted) {
                if (isProgrammaticScroll() || isUserScrolling()) {
                    // 程序化跳转途中：暂不下载（避免沿途把路过的 emoji 全拉下来），
                    // 等跳转结束若仍在可视区再补下。
                    deferLoadWhileScrolling(() => {
                        if (inView && !downloadStarted) {
                            downloadStarted = true;
                            media.download();
                        }
                    });
                } else {
                    downloadStarted = true;
                    media.download();
                }
            }
            applyPlayback();
        },
        () => {
            inView = false;
            // 离开可视区：暂停 TGS 与 GIF/video，省掉离屏渲染
            playerRef.value?.pause();
            videoRef.value?.pause();
        },
    );
    // 窗口失焦/隐藏 → 整体暂停；聚焦/回到窗口 → 恢复仍在可视区的项
    unsubscribeWindow = onWindowActiveChange(() => applyPlayback());
});

// 源就绪 / 格式确定后（如首次下载完成）若当前在可视区则补一次播放
watch(src, () => syncPlayback());

// 清理：卸载后解除观察与窗口订阅，避免残留回调
onUnmounted(() => {
    unsubscribeWindow?.();
    unsubscribeWindow = null;
    unobserve(rootEl.value);
});

function onError() {
    // 静默回退
}

function onClick() {
    if (props.item) emit('pick', props.item);
}

function onContextMenu(ev: MouseEvent) {
    if (props.item) emit('contextmenu', ev, props.item);
}
</script>

<style scoped>
.sp-media-item {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
}

.sp-media-item:hover {
    background: rgba(128, 128, 128, 0.12);
}

.sp-media-ph {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    /* 骨架屏：占位灰块（无动画） */
    background: rgba(128, 128, 128, 0.12);
}
</style>
