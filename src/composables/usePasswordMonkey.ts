import { onUnmounted, ref, watch, type Ref } from 'vue';
import type { TgsPlayerInstance } from '../components/common/TgsPlayer.vue';

/**
 * Unigram 帧标记（文件内无 markers，为其手工约定）：
 *   Close=40 捂眼；CloseToPeek=56 从指缝偷看
 * 登录页实际语义（与直觉一致）：
 *   隐藏密码 / 有密码未揭示 → 40 捂眼
 *   显示密码 → 56 偷看
 */
export const MONKEY_EMPTY_FRAME = 1;
export const MONKEY_FILLED_FRAME = 40;
/** 捂眼（隐藏密码、默认有密码时） */
export const MONKEY_CLOSE_FRAME = 40;
/** 偷看（显示密码时） */
export const MONKEY_PEEK_FRAME = 56;

/** 该 TGS 的帧率（lottie json `fr`） */
const NATIVE_FPS = 60;

type EngineLike = {
    frames?: { current: number; total: number };
    play?: () => void;
    pause?: () => void;
    stop?: () => void;
    seek?: (frame: number) => void;
    setDirection?: (d: 1 | -1) => void;
    setLoop?: (l: boolean | number) => void;
    setSpeed?: (s: number) => void;
    on?: (e: string, cb: (p: any) => void) => void;
    off?: (e: string, cb: (p: any) => void) => void;
};

/**
 * 按 tlottie 官方方式控制密码猴：
 * 1. seek(起点) → setDirection → setLoop(false) → play()
 * 2. 用「原生帧率预算时长」+ frame 事件，在目标帧 pause + seek
 * 3. 绝不快速连发 seek 当动画（worker 异步渲染，会闪/跳）
 *
 * 前置：TgsPlayer 需 `report-frames` + `force-render`（见 Password.vue）
 */
export function usePasswordMonkey(password: Ref<string>) {
    const playerRef = ref<TgsPlayerInstance | null>(null);
    let loaded = false;
    let animating = false;
    let suppressWatch = false;
    let targetFrame = MONKEY_EMPTY_FRAME;
    let direction: 1 | -1 = 1;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let frameHandler: ((p: any) => void) | null = null;
    let boundEngine: EngineLike | null = null;

    function engine(): EngineLike | null {
        return (playerRef.value?.getProperties?.() as EngineLike | null) ?? null;
    }

    function readFrame(): number | null {
        const cur = engine()?.frames?.current;
        return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
    }

    function clearStopTimer() {
        if (stopTimer) {
            clearTimeout(stopTimer);
            stopTimer = null;
        }
    }

    function unbindFrame() {
        if (boundEngine && frameHandler) {
            try { boundEngine.off?.('frame', frameHandler); } catch { /* ignore */ }
        }
        frameHandler = null;
        boundEngine = null;
    }

    /** 精确停在某一帧（官方：pause 后再 seek） */
    function hardStopAt(frame: number) {
        animating = false;
        clearStopTimer();
        unbindFrame();
        const p = playerRef.value;
        if (!p) return;
        try { p.pause(); } catch { /* ignore */ }
        try { p.seek(Math.round(frame)); } catch { /* ignore */ }
    }

    function bindFrameWatch() {
        const eng = engine();
        if (!eng?.on) return;
        unbindFrame();
        boundEngine = eng;
        frameHandler = (payload: any) => {
            if (!animating) return;
            const cur = payload?.frames?.current ?? eng.frames?.current;
            if (typeof cur !== 'number') return;
            // 已越过目标（正放 >= target / 倒放 <= target）→ 精确落点
            if (direction === 1 && cur >= targetFrame - 0.5) {
                hardStopAt(targetFrame);
            } else if (direction === -1 && cur <= targetFrame + 0.5) {
                hardStopAt(targetFrame);
            }
        };
        eng.on('frame', frameHandler);
    }

    /**
     * 用底层 play 播到 target（输入 1→40、偷看 40↔56）。
     * 超时按原生 60fps 计算，防止 reportFrames 丢失时播完整段（op=73）。
     */
    function playTo(target: number) {
        const p = playerRef.value;
        if (!p) return;
        clearStopTimer();
        unbindFrame();

        const cur = readFrame();
        const from = cur ?? (target >= MONKEY_FILLED_FRAME ? MONKEY_EMPTY_FRAME : MONKEY_FILLED_FRAME);
        if (Math.abs(from - target) < 0.5) {
            hardStopAt(target);
            return;
        }

        direction = target >= from ? 1 : -1;
        targetFrame = target;
        animating = true;

        try {
            p.setLoop(false);
            p.setDirection(direction);
            // 官方用法：先 seek 到起点再 play，避免从错误帧播到片尾再纠正
            p.seek(from);
            p.play();
        } catch (e) {
            console.warn('[usePasswordMonkey] play failed, hard seek', e);
            hardStopAt(target);
            return;
        }

        bindFrameWatch();

        // 原生帧率预算：|Δframe|/fps 秒后强制落点（+80ms 裕量）
        const durationMs = Math.max(80, (Math.abs(target - from) / NATIVE_FPS) * 1000 + 80);
        stopTimer = setTimeout(() => {
            if (animating) hardStopAt(targetFrame);
        }, durationMs);
    }

    function onPlayerLoad() {
        loaded = true;
        // 页首：不整段 intro，直接停在空态（0/1 帧视觉几乎相同）
        hardStopAt(password.value ? MONKEY_FILLED_FRAME : MONKEY_EMPTY_FRAME);
    }

    watch(password, (val, old) => {
        if (!loaded || !playerRef.value || suppressWatch) return;
        if (!val && old) {
            playTo(MONKEY_EMPTY_FRAME);
        } else if (val && !old) {
            playTo(MONKEY_FILLED_FRAME);
        }
    }, { flush: 'sync' });

    onUnmounted(() => {
        animating = false;
        clearStopTimer();
        unbindFrame();
        loaded = false;
    });

    return {
        playerRef,
        onPlayerLoad,
        onPlayerComplete() {
            // 整段播完（例如超时前已到 op）→ 落到目标帧
            if (animating) hardStopAt(targetFrame);
        },
        resetToEmpty() {
            suppressWatch = true;
            password.value = '';
            hardStopAt(MONKEY_EMPTY_FRAME);
            suppressWatch = false;
        },
        resetToFilled() {
            hardStopAt(MONKEY_FILLED_FRAME);
        },
        /** Unigram Close/CloseToPeek：用 play 过渡，而不是瞬时 seek */
        seekMarker(frame: number) {
            playTo(frame);
        },
        animateTo: playTo,
    };
}
