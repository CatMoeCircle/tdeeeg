<template>
    <div class="tgs-player" :class="className" :style="rootStyle">
        <LottiePlayer ref="innerRef" class="tgs-lottie-root" :src="src ?? undefined" :data="data ?? undefined"
            :loop="loop" :autoplay="autoplay" :speed="speed" :direction="direction ?? undefined"
            :fitz-modifier="fitzModifier" :report-frames="reportFrames" :force-render="forceRender"
            :initial-frame="initialFrame ?? undefined" @load="onLoad" @error="onError" @complete="onComplete" />
    </div>
</template>

<script lang="ts">
export type TgsPlayerInstance = {
    play(): void;
    pause(): void;
    stop(): void;
    seek(frame: number): void;
    setDirection(direction: 1 | -1): void;
    setLoop(loop: boolean | number): void;
    getProperties(): unknown;
};
</script>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { LottiePlayer } from 'tlottie/vue';
import 'tlottie/vue/style.css';
import type { FitzModifier } from 'tlottie';

const props = withDefaults(defineProps<{
    /**
     * 可 fetch 的动画 URL（http/asset/blob）。与 data 二选一，src 优先。
     */
    src?: string | null;
    /**
     * 动画数据：
     * - Uint8Array：TGS 原始字节（可 gzip，由 tlottie 在 Worker 内解压）
     * - string：已解析的 Lottie JSON 文本
     */
    data?: string | Uint8Array | null;
    /** CSS 显示边长（px）。省略则填满父容器 */
    size?: number;
    loop?: boolean | number;
    autoplay?: boolean;
    speed?: number;
    /** 播放方向（tlottie direction）：1 正放 / -1 倒放 */
    direction?: 1 | -1 | null;
    /** Telegram Fitzpatrick 肤色（parse-time，改值会重建实例） */
    fitzModifier?: FitzModifier;
    /** 额外 class（叠加在 .tgs-player 上） */
    class?: string;
    /**
     * 开启后转发底层 frame 事件（约 10Hz），用于按帧暂停/倒放。
     * 官方 README：默认关闭；密码猴等需要停在指定帧时必须打开。
     */
    reportFrames?: boolean;
    /**
     * 官方 README：离屏仍继续渲染，避免 IntersectionObserver 自动暂停导致 seek/play 无画面。
     */
    forceRender?: boolean;
    /**
     * 加载后 seek 到该帧并暂停（页首动画用）。
     */
    initialFrame?: number | null;
}>(), {
    src: null,
    data: null,
    size: undefined,
    loop: true,
    autoplay: true,
    speed: 1,
    direction: null,
    reportFrames: false,
    forceRender: false,
    initialFrame: null,
});

const emit = defineEmits<{
    (e: 'load', payload: unknown): void;
    (e: 'error', payload: unknown): void;
    (e: 'complete', payload: unknown): void;
    (e: 'frame', payload: { current: number; total: number }): void;
}>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const innerRef = ref<any>(null);
let frameListener: ((payload: any) => void) | null = null;

function engine() {
    return innerRef.value?.tlottie?.() ?? null;
}

const rootStyle = computed(() =>
    props.size != null
        ? { width: `${props.size}px`, height: `${props.size}px` }
        : { width: '100%', height: '100%' },
);

const className = computed(() => props.class || undefined);

function onLoad(payload: unknown) {
    emit('load', payload);
    // 页首动画：load 后先落到 initialFrame 再交给业务逻辑
    if (props.initialFrame != null) {
        try {
            engine()?.pause?.();
            engine()?.seek?.(props.initialFrame);
        } catch { /* ignore */ }
    }
    if (!props.reportFrames) return;
    const eng = engine() as { on?: (e: string, cb: (p: any) => void) => void; off?: (e: string, cb: (p: any) => void) => void } | null;
    if (!eng?.on) return;
    frameListener = (p: any) => {
        const frames = p?.frames ?? p;
        if (frames && typeof frames.current === 'number') {
            emit('frame', { current: frames.current, total: frames.total ?? 0 });
        }
    };
    eng.on('frame', frameListener);
}
function onError(payload: unknown) {
    detachFrameListener();
    console.error('[TgsPlayer] error:', payload, { src: props.src, hasData: !!props.data });
    emit('error', payload);
}

function detachFrameListener() {
    const eng = engine() as { off?: (e: string, cb: (p: any) => void) => void } | null;
    if (eng?.off && frameListener) eng.off('frame', frameListener);
    frameListener = null;
}
function onComplete(payload: unknown) {
    emit('complete', payload);
}

defineExpose({
    play() {
        engine()?.play();
    },
    pause() {
        engine()?.pause();
    },
    stop() {
        engine()?.stop();
    },
    seek(frame: number) {
        engine()?.seek(frame);
    },
    setDirection(direction: 1 | -1) {
        (engine() as { setDirection?: (d: 1 | -1) => void } | null)?.setDirection?.(direction);
    },
    setLoop(loop: boolean | number) {
        (engine() as { setLoop?: (l: boolean | number) => void } | null)?.setLoop?.(loop);
    },
    getProperties() {
        return engine();
    },
});

onUnmounted(() => {
    detachFrameListener();
});
</script>

<style scoped>
.tgs-player {
    position: relative;
    overflow: hidden;
    line-height: 0;
    /* 显式占满：父级若未设尺寸，至少不要塌成 0 */
    min-width: 1px;
    min-height: 1px;
}

/*
 * tlottie 自带 .tlottie-player 只有 position:relative，
 * 唯一子节点 canvas 是 absolute，容器高度会塌成 0，
 * measure() 得到 0 → 按 1px 渲染，画面上几乎看不见且无报错。
 */
.tgs-player :deep(.tlottie-player) {
    width: 100% !important;
    height: 100% !important;
}

.tgs-player :deep(canvas) {
    display: block;
}
</style>
