<script setup lang="ts">
/**
 * 3D 金色星星图标。
 *
 * 渲染的是 Telegram 官方桌面端那颗真的立体金星（WebGL2 + 官方模型与着色器，
 * 见 `src/utils/star3d/`），不是平面 SVG / 图片。默认 120 px，可拖动倾斜：
 * 按住拖动改朝向、松手沿过冲曲线回位；不碰它的时候自己隔一会儿转一圈、翻个面。
 *
 * 渲染在共享的离屏 WebGL 上下文里完成，这里只是一块 2D 画布 + 指针交互，
 * 所以页面上同时出现很多颗星星也不会各开一个 GL 上下文。
 *
 * 开启系统「减少动效」时只画一帧静止的星星。
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { mountStar3D, type StarHandle } from '../../utils/star3d';
import { isDark as themeIsDark } from '../../store/settings/theme';
import { onVisibilityChange } from '../../composables/useSharedIntersectionObserver';

const props = withDefaults(defineProps<{
    /** 显示边长（CSS 像素） */
    size?: number;
    /** 是否可拖动倾斜 */
    draggable?: boolean;
    /** 无障碍标签；不传则只声明这是一张图 */
    ariaLabel?: string;
    /** 夜间主题；不传则跟随全局主题 */
    night?: boolean;
}>(), {
    size: 120,
    draggable: true,
    ariaLabel: '',
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const dragging = ref(false);

let handle: StarHandle | null = null;
let releaseVisibility: (() => void) | null = null;
let pointerId: number | null = null;
let lastX = 0;
let lastY = 0;

/** 夜间开关：显式传入优先，否则跟随应用主题 */
function isNight(): boolean {
    return props.night ?? themeIsDark.value;
}

function mount(): void {
    const el = canvasRef.value;
    if (!el || handle) return;
    handle = mountStar3D(el, { size: props.size, night: isNight() });
    // 视口门控：滚出屏幕就停掉这颗星星的渲染
    releaseVisibility = onVisibilityChange(
        el,
        () => handle?.setVisible(true),
        () => handle?.setVisible(false),
    );
}

function unmount(): void {
    const el = canvasRef.value;
    // 拖到一半被卸载（切页 / 弹窗关闭）时不会再有 pointerup，这里把指针状态一起清掉
    if (pointerId !== null && el?.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    pointerId = null;
    dragging.value = false;
    releaseVisibility?.();
    releaseVisibility = null;
    handle?.dispose();
    handle = null;
}

onMounted(mount);
onBeforeUnmount(unmount);

watch(() => props.size, (size) => handle?.setSize(size));
watch(() => props.night, () => handle?.setNight(isNight()));
watch(themeIsDark, () => handle?.setNight(isNight()));

function onPointerDown(event: PointerEvent): void {
    const el = canvasRef.value;
    if (!props.draggable || !handle || !el || pointerId !== null) return;
    // 只接主键（鼠标左键 / 触摸 / 笔尖），右键与中键留给上下文菜单
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    el.setPointerCapture(pointerId);
    lastX = event.clientX;
    lastY = event.clientY;
    dragging.value = true;
    handle.setActive(true);
    event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId || !handle) return;
    // 官方手势是「上一次坐标减当前坐标」：向右 / 向下拖动给的是负值。
    // 俯仰限幅在姿态模型里（±60°），偏航不限，可以一直转下去。
    handle.setTilt(lastX - event.clientX, lastY - event.clientY);
    lastX = event.clientX;
    lastY = event.clientY;
    event.preventDefault();
}

function onPointerUp(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const el = canvasRef.value;
    if (el?.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    pointerId = null;
    dragging.value = false;
    handle?.setActive(false);
}
</script>

<template>
    <canvas
        ref="canvasRef"
        class="star3d-canvas"
        :class="{ 'is-draggable': draggable, 'is-dragging': dragging }"
        :style="{ width: `${size}px`, height: `${size}px` }"
        role="img"
        :aria-label="ariaLabel || undefined"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
    />
</template>

<style scoped>
.star3d-canvas {
    display: block;
    /* 触摸拖动时不要触发页面滚动，否则星星只跟手一瞬 */
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
}

.star3d-canvas.is-draggable {
    cursor: grab;
}

.star3d-canvas.is-draggable.is-dragging {
    cursor: grabbing;
}
</style>
