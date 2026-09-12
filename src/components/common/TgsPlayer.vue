<template>
    <div class="tgs-player" :class="className" :style="rootStyle">
        <LottiePlayer ref="innerRef" class="tgs-lottie-root" :src="src ?? undefined" :data="data ?? undefined"
            :loop="loop" :autoplay="autoplay" :speed="speed" :fitz-modifier="fitzModifier" @load="onLoad"
            @error="onError" @complete="onComplete" />
    </div>
</template>

<script lang="ts">
export type TgsPlayerInstance = {
    play(): void;
    pause(): void;
    stop(): void;
    seek(frame: number): void;
    getProperties(): unknown;
};
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
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
    /** Telegram Fitzpatrick 肤色（parse-time，改值会重建实例） */
    fitzModifier?: FitzModifier;
    /** 额外 class（叠加在 .tgs-player 上） */
    class?: string;
}>(), {
    src: null,
    data: null,
    loop: true,
    autoplay: true,
    speed: 1,
});

const emit = defineEmits<{
    (e: 'load', payload: unknown): void;
    (e: 'error', payload: unknown): void;
    (e: 'complete', payload: unknown): void;
}>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const innerRef = ref<any>(null);

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
}
function onError(payload: unknown) {
    console.error('[TgsPlayer] error:', payload, { src: props.src, hasData: !!props.data });
    emit('error', payload);
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
    getProperties() {
        return engine();
    },
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
