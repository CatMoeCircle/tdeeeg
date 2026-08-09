<template>
    <!-- 根元素 w-full aspect-square：无论父格子多宽都铺满并保持正方形 -->
    <div ref="rootEl" class="sp-media-item w-full aspect-square" @click="onClick"
        @contextmenu.prevent.stop="onContextMenu">
        <!-- TGS 动画贴纸 -->
        <RlottiePlayer v-if="format === 'tgs' && src" ref="playerRef" :src="src" :width="renderSize"
            :height="renderSize" loop :autoplay="false" :class="hiResClass" :style="hiResStyle" @error="onError" />
        <!-- WEBP / MPEG4 / GIF：<img> 或 <video>（100% 铺满 + object-fit: cover） -->
        <img v-else-if="format === 'webp' && src" :src="src" :alt="alt" draggable="false" :style="imgStyle"
            loading="lazy" />
        <video v-else-if="format !== 'tgs' && src" :src="src" autoplay loop muted playsinline :style="imgStyle" />
        <!-- 占位：骨架屏（不显示进度） -->
        <div v-else class="sp-media-ph" :style="imgStyle"></div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { sticker, animation } from 'tdlib-types';
import { RlottiePlayer, type RlottiePlayerInstance } from 'rlottie-wasm-vue-player';
import { useStickerMedia } from './composables/useStickerMedia';
import { onVisibilityChange, unobserve } from './composables/useStickerVisibility';
import { useRlottieRenderSize } from '../../../../composables/useRlottieRenderSize';

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
const playerRef = ref<RlottiePlayerInstance | null>(null);

/** 统一媒体源解析（下载 + TGS 肤色替换） */
const media = useStickerMedia(() => props.item, props.kind, { skinTone: computed(() => props.skinTone) });

/** 顶层解包，便于模板自动解包 */
const format = media.format;
const src = media.src;

/**
 * TGS 渲染尺寸：由「可见时的实际格子宽度」驱动（w-full width 自适应父格子，
 * 因此不再依赖调用方传的 size）。可见时才测量一次 DOM（与可见性回调同机），
 * 不引入 per-item ResizeObserver，避免性能开销。
 * 贴纸网格以「数量/性能」优先：超采样倍数降到 1（即按显示尺寸渲染）。
 */
const cellW = ref(Math.max(4, props.size));
/** 是否已测量过实际格子宽，避免重复读取 DOM */
let cellMeasured = false;
const tgsSize = computed(() => cellW.value);
const { renderSize, hiResStyle, hiResClass } = useRlottieRenderSize(tgsSize, 1);

/** 记录实际格子宽度（正方形，读 width 即可）；失败则回退到 props.size */
function measureCellWidth() {
    const el = rootEl.value;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    if (w > 0) {
        cellW.value = Math.max(4, Math.round(w));
        cellMeasured = true;
    }
}

/** 图片/视频/占位尺寸样式 —— 100% 铺满正方形容器，内容居中裁剪（object-fit: cover） */
const imgStyle = computed<Record<string, string>>(() => ({
    width: '100%',
    height: '100%',
    objectFit: 'cover',
}));

/** 已否触发过首次下载 */
let downloadStarted = false;
/** 当前是否处于（放大的）可视区 —— 用于「窗口范围内才播放」的门控 */
let inView = false;

/**
 * 视口门控（共享观察器）：
 *  - 首次进入可视区才触发下载；
 *  - TGS 仅在「窗口范围内」才播放 —— 进入即 play，离开即 pause，
 *    避免滚出视口后仍持续跑 rAF 渲染循环（rlottie render 是主要性能瓶颈）。
 */
function syncPlayback() {
    const wantPlay = inView && format.value === 'tgs' && !!src.value;
    if (wantPlay) {
        playerRef.value?.play();
    } else {
        playerRef.value?.pause();
    }
}

onMounted(() => {
    onVisibilityChange(
        rootEl.value,
        () => {
            inView = true;
            // 可见时测量一次实际格子宽（TGS 渲染尺寸需要真实的宽度）
            if (!cellMeasured) measureCellWidth();
            if (!downloadStarted) {
                downloadStarted = true;
                media.download();
            }
            syncPlayback();
        },
        () => {
            inView = false;
            // 离开可视区：暂停 TGS，省掉离屏渲染
            playerRef.value?.pause();
        },
    );
});

// 源就绪 / 格式确定后（如首次下载完成）若当前在可视区则补一次播放
watch(src, () => syncPlayback());

// 清理：卸载后解除观察，避免残留回调
onUnmounted(() => {
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
    /* 骨架屏：占位灰块 + 微光扫过 */
    background: rgba(128, 128, 128, 0.12);
    background-image: linear-gradient(100deg,
            transparent 20%,
            rgba(255, 255, 255, 0.35) 40%,
            transparent 60%);
    background-size: 200% 100%;
    animation: sp-shimmer 1.4s infinite;
}

@keyframes sp-shimmer {
    0% {
        background-position: 200% 0;
    }

    100% {
        background-position: -200% 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .sp-media-ph {
        animation: none;
    }
}
</style>
