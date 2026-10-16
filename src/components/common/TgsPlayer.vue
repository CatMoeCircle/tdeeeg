<template>
    <div class="tgs-player" :class="className" :style="rootStyle">
        <LottiePlayer ref="innerRef" class="tgs-lottie-root" :src="src ?? undefined" :data="data ?? undefined"
            :loop="effectiveLoop" :autoplay="autoplay" :speed="speed" :direction="direction ?? undefined"
            :fitz-modifier="fitzModifier" :report-frames="true" :force-render="forceRender"
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
import { computed, onUnmounted, ref, watch } from 'vue';
import { LottiePlayer } from 'tlottie/vue';
import 'tlottie/vue/style.css';
import type { FitzModifier } from 'tlottie';
import { acquireSticker, type BudgetHandle } from '../../utils/stickerBudget';

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
     * 官方 README：密码猴等需要停在指定帧时必须打开。
     * 注意：worker 侧的帧快照恒开（负载预算 stickerBudget 估算渲染帧率所需，
     * 且仅播放中才有约 10Hz 消息），此开关只控制 @frame 事件是否对外转发。
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

// ─── 负载预算（stickerBudget） ─────────────────────────────────────
/** 外部门控（业务 play/pause 意图）；autoplay 构造时即为播放意图 */
let wanted = !!props.autoplay;
/** 预算 30fps 档的占空比强制停（只压低实际引擎指令，不改外部意图） */
let dutyOff = false;
/** 最近一次下发给引擎的指令，避免同一状态重复 postMessage */
let sent: 'play' | 'pause' | null = null;
/** 渲染帧率估算（供 30 档豁免原生 ≤30fps 的动画） */
let fpsPrev = 0;
let fpsPrevAt = 0;
let fpsEst: number | null = null;
let releaseBudget: (() => void) | null = null;

/** 按「外部意图 × 预算占空比」向引擎下发唯一一条 play/pause 指令 */
function apply() {
    const eng = engine() as { play?: () => void; pause?: () => void } | null;
    if (!eng) return;
    if (wanted && !dutyOff) {
        if (sent !== 'play') { eng.play?.(); sent = 'play'; }
    } else if (sent !== 'pause') {
        eng.pause?.();
        sent = 'pause';
    }
}

function sampleFps(): number | null {
    const f = (engine() as { frames?: { current: number; total: number } } | null)?.frames;
    if (!f?.total) return fpsEst;
    const now = performance.now();
    if (!fpsPrevAt) { fpsPrev = f.current; fpsPrevAt = now; return null; }
    if (now - fpsPrevAt >= 400) {
        let d = f.current - fpsPrev;
        if (d < 0 && f.total > 0) d += f.total; // loop 回绕
        fpsEst = (d * 1000) / (now - fpsPrevAt);
        fpsPrev = f.current;
        fpsPrevAt = now;
    }
    return fpsEst;
}

/** 负重登记 key：同一 src（或同一份 data 字节流）视为同一动画内容 */
function budgetKey(): string {
    if (props.src) return props.src;
    const d = props.data;
    if (!d) return 'empty';
    return typeof d === 'string' ? `json:${d.length}` : `bytes:${d.byteLength}`;
}

const budgetHandle: BudgetHandle = {
    isWanted: () => wanted,
    setDutyOff(off) {
        if (dutyOff === off) return;
        dutyOff = off;
        apply();
    },
    sampleFps,
};

/**
 * 归一化 loop：tlottie Worker 内 `loop ?? false`，undefined/空串都会变成只播一次。
 * Vue 对 `boolean | number` 含 Boolean 时会做布尔形态转换，这里再兜一层。
 */
const effectiveLoop = computed<boolean | number>(() => {
    const l = props.loop as boolean | number | '' | null | undefined;
    if (l === '' || l == null) return true;
    return l;
});

function applyLoop() {
    (engine() as { setLoop?: (l: boolean | number) => void } | null)?.setLoop?.(effectiveLoop.value);
}

const rootStyle = computed(() =>
    props.size != null
        ? { width: `${props.size}px`, height: `${props.size}px` }
        : { width: '100%', height: '100%' },
);

const className = computed(() => props.class || undefined);

watch(effectiveLoop, () => applyLoop());

function onLoad(payload: unknown) {
    // load 后显式 setLoop：构造时配置偶发未落到 Worker 引擎（默认 false → 只播一次）
    applyLoop();
    // 新引擎：重置指令缓存与帧率估算，按当前意图同步播放状态并登记负载
    sent = null;
    fpsPrevAt = 0;
    fpsEst = null;
    releaseBudget?.(); // 幂等：src 重建后再登记不会重复计入负重
    releaseBudget = acquireSticker(budgetKey(), budgetHandle);
    apply();
    emit('load', payload);
    // 页首动画：load 后先落到 initialFrame 再交给业务逻辑
    if (props.initialFrame != null) {
        wanted = false;
        try {
            engine()?.pause?.();
            sent = 'pause';
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
    releaseBudget?.();
    releaseBudget = null;
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
    // loop=true 却仍 complete（引擎 loop 未生效）时兜底续播，避免回应动画停在末帧；
    // 尊重外部门控与预算占空比（不能绕过 play/pause 意图强播）
    if (effectiveLoop.value === true) {
        if (wanted && !dutyOff) {
            engine()?.play();
            sent = 'play';
        } else {
            apply();
        }
    }
}

defineExpose({
    play() {
        wanted = true;
        apply();
    },
    pause() {
        wanted = false;
        apply();
    },
    stop() {
        engine()?.stop();
        wanted = false;
        apply();
    },
    seek(frame: number) {
        engine()?.seek(frame);
    },
    setDirection(direction: 1 | -1) {
        (engine() as { setDirection?: (d: 1 | -1) => void } | null)?.setDirection?.(direction);
    },
    setLoop(loop: boolean | number) {
        const l = (loop as boolean | number | '') === '' ? true : loop;
        (engine() as { setLoop?: (v: boolean | number) => void } | null)?.setLoop?.(l);
    },
    getProperties() {
        return engine();
    },
});

onUnmounted(() => {
    detachFrameListener();
    releaseBudget?.();
    releaseBudget = null;
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
