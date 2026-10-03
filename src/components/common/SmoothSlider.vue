<template>
    <div ref="sliderRef" class="relative flex w-full touch-none select-none items-center py-2"
        :class="disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'" @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove" @pointerup="handlePointerUp" @pointercancel="handlePointerUp"
        @mouseenter="animateScale(true)" @mouseleave="animateScale(false)" @touchstart="animateScale(true)"
        @touchend="animateScale(false)">
        <!-- 越界拉伸层：拉过头时在此层做 scaleX 拉伸 / scaleY 压扁，松手回弹 -->
        <div class="flex w-full" :style="{
            transform: `scaleX(${overflowScaleX}) scaleY(${overflowScaleY})`,
            transformOrigin,
        }">
            <div class="relative w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15" :style="{
                height: `${trackHeight}px`,
                marginTop: `${-trackBleed}px`,
                marginBottom: `${-trackBleed}px`,
                opacity: trackOpacity,
            }">
                <div class="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-sky-400 to-blue-600"
                    :style="{ width: `${percentage}%` }" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue';

/** 静止态 / 悬停态的轨道厚度与整体透明度：悬停时变粗变亮，替代原先左右图标的视觉反馈 */
const MIN_TRACK_HEIGHT = 6;
const MAX_TRACK_HEIGHT = 12;
const MIN_OPACITY = 0.7;
const HOVER_SCALE = 1.2;
const SCALE_DURATION = 200;

/** 越界拉伸的最大位移（px）；超过后由 sigmoid 衰减饱和，拉伸不会是线性的 */
const MAX_OVERFLOW = 50;
/** 拉到头时纵向压扁到的比例 */
const OVERFLOW_MIN_SCALE_Y = 0.8;
/** 回弹弹簧的弹性，越大越明显 */
const SPRING_BOUNCE = 0.4;

interface Props {
    /** 当前值，配合 @update:modelValue 使用 */
    modelValue?: number;
    /** 取值范围上界（下界固定为 0） */
    maxValue?: number;
    /** 吸附步长，需同时打开 isStepped */
    stepSize?: number;
    /** 是否按 stepSize 吸附取值 */
    isStepped?: boolean;
    /** 禁用交互（轨道仍展示当前进度） */
    disabled?: boolean;
    /**
     * 越界拉伸的最大位移上限（px）。
     * 默认 50；放在窄容器里时可调小，避免拉伸后越出容器边界。
     */
    maxOverflow?: number;
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: 0,
    maxValue: 100,
    stepSize: 1,
    isStepped: false,
    disabled: false,
    maxOverflow: MAX_OVERFLOW,
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: number): void;
    (e: 'change', value: number): void;
}>();

const sliderRef = useTemplateRef<HTMLDivElement>('sliderRef');

const value = ref(clamp(props.modelValue, 0, props.maxValue));
const scale = ref(1);
/** 越界位移（px），0 表示未越界 */
const overflow = ref(0);
/** 拉伸锚点：向右侧拉出时锚在左侧，向左侧拉出时锚在右侧 */
const origin = ref<'left' | 'right'>('left');
/** 最近一次交互测得的轨道宽度，用于把越界位移换算成拉伸比例 */
const trackWidth = ref(0);

let scaleFrame: number | null = null;
let overflowFrame: number | null = null;

function clamp(input: number, min: number, max: number): number {
    return Math.min(Math.max(input, min), max);
}

// 外部值变化（播放进度推进、切歌归零）时同步内部值
watch(() => props.modelValue, next => {
    value.value = clamp(next, 0, props.maxValue);
});

const percentage = computed(() => {
    if (props.maxValue <= 0) return 0;
    return clamp((value.value / props.maxValue) * 100, 0, 100);
});

/** 加粗动画进度 0~1，用于插值轨道厚度与透明度 */
const hoverProgress = computed(() => (scale.value - 1) / (HOVER_SCALE - 1));

const trackHeight = computed(() => MIN_TRACK_HEIGHT + hoverProgress.value * (MAX_TRACK_HEIGHT - MIN_TRACK_HEIGHT));

/** 负外边距抵消增厚，悬停时容器占位不变，避免上下内容跳动 */
const trackBleed = computed(() => (trackHeight.value - MIN_TRACK_HEIGHT) / 2);

const trackOpacity = computed(() => MIN_OPACITY + hoverProgress.value * (1 - MIN_OPACITY));

const overflowScaleX = computed(() => {
    if (trackWidth.value <= 0) return 1;
    return 1 + overflow.value / trackWidth.value;
});

const overflowScaleY = computed(() => {
    if (props.maxOverflow <= 0) return 1;
    const t = overflow.value / props.maxOverflow;
    return 1 - t * (1 - OVERFLOW_MIN_SCALE_Y);
});

const transformOrigin = computed(() => `${origin.value} center`);

/** 越界位移的非线性衰减：越拉越沉，避免无限拉长 */
function decay(input: number, max: number): number {
    if (max <= 0) return 0;
    const entry = input / max;
    const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
    return sigmoid * max;
}

/** 按指针横坐标换算取值；拖动过程中持续派发 update:modelValue，保证跟手 */
function updateValueFromPointer(clientX: number) {
    const el = sliderRef.value;
    if (!el || props.maxValue <= 0) return;
    const { left, width } = el.getBoundingClientRect();
    if (width <= 0) return;
    trackWidth.value = width;

    // 取值本身始终夹在 [0, maxValue]：拉过头只做视觉拉伸，不改变取值
    const pointerRatio = clamp((clientX - left) / width, 0, 1);
    let next = pointerRatio * props.maxValue;
    if (props.isStepped) next = Math.round(next / props.stepSize) * props.stepSize;
    next = clamp(next, 0, props.maxValue);

    value.value = next;
    emit('update:modelValue', next);

    // 拉过头：指针越出轨道两端时按越界距离产生橡皮筋拉伸，回到轨道内即归零
    if (overflowFrame !== null) {
        cancelAnimationFrame(overflowFrame);
        overflowFrame = null;
    }
    if (clientX < left) {
        origin.value = 'right';
        overflow.value = decay(left - clientX, props.maxOverflow);
    } else if (clientX > left + width) {
        origin.value = 'left';
        overflow.value = decay(clientX - left - width, props.maxOverflow);
    } else {
        overflow.value = 0;
    }
}

function handlePointerDown(e: PointerEvent) {
    if (props.disabled) return;
    updateValueFromPointer(e.clientX);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function handlePointerMove(e: PointerEvent) {
    // 仅拖动中响应，避免悬停时进度跟着鼠标乱跳
    if (props.disabled || e.buttons === 0) return;
    updateValueFromPointer(e.clientX);
}

/** 松手才提交最终值，由调用方在此执行真正的 seek，同时让拉伸弹回 */
function handlePointerUp() {
    if (props.disabled) return;
    emit('change', value.value);
    springOverflow(0);
}

/** 悬停/触摸时轨道缓动加粗变亮 */
function animateScale(active: boolean) {
    const to = active ? HOVER_SCALE : 1;
    if (props.disabled || scale.value === to) return;

    if (scaleFrame !== null) cancelAnimationFrame(scaleFrame);

    const from = scale.value;
    const startTime = performance.now();

    const step = (now: number) => {
        const progress = Math.min((now - startTime) / SCALE_DURATION, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        scale.value = from + (to - from) * eased;
        scaleFrame = progress < 1 ? requestAnimationFrame(step) : null;
    };

    scaleFrame = requestAnimationFrame(step);
}

/** 越界位移的弹簧回弹（带轻微过冲） */
function springOverflow(to: number) {
    if (overflowFrame !== null) cancelAnimationFrame(overflowFrame);

    const from = overflow.value;
    const startTime = performance.now();

    const mass = 1;
    const stiffness = 170;
    const damping = 26 * (1 - SPRING_BOUNCE);
    const dampingRatio = damping / (2 * Math.sqrt(mass * stiffness));
    const angularFreq = Math.sqrt(stiffness / mass);
    const dampedFreq = angularFreq * Math.sqrt(1 - dampingRatio * dampingRatio);

    const step = (now: number) => {
        const t = (now - startTime) / 1000;
        const envelope = Math.exp(-dampingRatio * angularFreq * t);
        const displacement = dampingRatio < 1
            ? envelope * (Math.cos(dampedFreq * t) + ((dampingRatio * angularFreq) / dampedFreq) * Math.sin(dampedFreq * t))
            : Math.exp(-angularFreq * t);

        const current = to + (from - to) * displacement;
        if (Math.abs(current - to) < 0.1) {
            overflow.value = to;
            overflowFrame = null;
            return;
        }
        overflow.value = current;
        overflowFrame = requestAnimationFrame(step);
    };

    overflowFrame = requestAnimationFrame(step);
}
</script>
