import { onUnmounted, ref, watch, type Ref } from 'vue';
import type { TgsPlayerInstance } from '../components/common/TgsPlayer.vue';

/** AuthorizationStateWaitPassword：空密码停在第 1 帧，有密码最多到第 40 帧 */
export const MONKEY_EMPTY_FRAME = 1;
export const MONKEY_FILLED_FRAME = 40;

type EngineLike = {
    frames?: { current: number; total: number };
    play?: () => void;
    pause?: () => void;
    seek?: (frame: number) => void;
    setDirection?: (d: 1 | -1) => void;
    setLoop?: (l: boolean | number) => void;
};

/**
 * 控制密码页猴子动画：空密码=第1帧；输入时正向播到第40帧；清空时从40倒放回第1帧。
 * 有密码后再增删字符不重播（按「是否为空」二值触发）。
 * 用 rAF 轮询当前帧，比 10Hz frame 事件更贴，避免到点后生硬 seek。
 */
export function usePasswordMonkey(password: Ref<string>) {
    const playerRef = ref<TgsPlayerInstance | null>(null);
    let loaded = false;
    let animating = false;
    let suppressWatch = false;
    let direction: 1 | -1 = 1;
    let targetFrame = MONKEY_FILLED_FRAME;
    let rafId = 0;

    function engine(): EngineLike | null {
        return (playerRef.value?.getProperties?.() as EngineLike | null) ?? null;
    }

    function currentFrame(): number | null {
        const cur = engine()?.frames?.current;
        return typeof cur === 'number' ? cur : null;
    }

    function stopRaf() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    function finishAt(frame: number) {
        animating = false;
        stopRaf();
        const p = playerRef.value;
        if (!p) return;
        p.pause();
        p.seek(frame);
    }

    function tick() {
        if (!animating) return;
        const cur = currentFrame();
        if (cur != null) {
            const done = direction === 1 ? cur >= MONKEY_FILLED_FRAME : cur <= MONKEY_EMPTY_FRAME;
            if (done) {
                finishAt(targetFrame);
                return;
            }
        }
        rafId = requestAnimationFrame(tick);
    }

    function playTo(target: number, dir: 1 | -1) {
        const p = playerRef.value;
        if (!p) return;
        stopRaf();

        const cur = currentFrame();
        // 已在目标附近：直接停住，避免多余起播
        if (cur != null) {
            if (dir === 1 && cur >= target) {
                finishAt(target);
                return;
            }
            if (dir === -1 && cur <= target) {
                finishAt(target);
                return;
            }
        }

        animating = true;
        direction = dir;
        targetFrame = target;
        p.setLoop(false);
        p.setDirection(dir);

        // 方向反了才 seek 到起点；同向则从当前帧接着播，衔接更顺
        if (cur == null) {
            p.seek(dir === 1 ? MONKEY_EMPTY_FRAME : MONKEY_FILLED_FRAME);
        } else if (dir === 1 && cur > MONKEY_FILLED_FRAME) {
            p.seek(MONKEY_FILLED_FRAME);
        } else if (dir === -1 && cur < MONKEY_EMPTY_FRAME) {
            p.seek(MONKEY_EMPTY_FRAME);
        }

        p.play();
        rafId = requestAnimationFrame(tick);
    }

    function onPlayerLoad() {
        loaded = true;
        finishAt(password.value ? MONKEY_FILLED_FRAME : MONKEY_EMPTY_FRAME);
    }

    watch(password, (val, old) => {
        if (!loaded || !playerRef.value || suppressWatch) return;
        if (!val && old) {
            playTo(MONKEY_EMPTY_FRAME, -1);
        } else if (val && !old) {
            playTo(MONKEY_FILLED_FRAME, 1);
        }
    }, { flush: 'sync' });

    onUnmounted(() => {
        animating = false;
        stopRaf();
        loaded = false;
    });

    return {
        playerRef,
        onPlayerLoad,
        /** 兜底：底层 complete 时也停在目标帧 */
        onPlayerComplete() {
            if (animating) finishAt(targetFrame);
        },
        /** 程序化清空：不触发倒放动画 */
        resetToEmpty() {
            suppressWatch = true;
            password.value = '';
            finishAt(MONKEY_EMPTY_FRAME);
            suppressWatch = false;
        },
        resetToFilled() {
            finishAt(MONKEY_FILLED_FRAME);
        },
    };
}
