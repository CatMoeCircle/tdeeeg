import type { Directive, DirectiveBinding } from "vue";

/**
 * v-smooth-wheel —— 为滚动容器添加平滑缓动的鼠标滚轮滚动。
 *
 * 用法：
 *   垂直滚动：`<div class="overflow-y-auto" v-smooth-wheel>...</div>`
 *   水平滚动：`<div class="overflow-x-auto" v-smooth-wheel="'horizontal'">...</div>`
 *
 * 原理：拦截容器的 wheel 事件（阻止默认的"逐行跳变"），累积目标滚动位置，
 * 用 requestAnimationFrame + 缓动逐步逼近，产生平滑的惯性手感。
 *
 * 边界行为：当容器已滚动到起点仍往回滚 / 滚到终点仍继续滚时，终止动画并阻止
 * 默认（避免一次性跳到边缘或穿透到父容器/页面滚动）。
 */

/** 方向模式 */
type Axis = 'vertical' | 'horizontal';

interface SmoothWheelState {
    /** 当前缓动位置（px） */
    current: number;
    /** 目标位置（px） */
    target: number;
    /** rAF 句柄 */
    raf: number | null;
    /** 是否在动画中 */
    animating: boolean;
    /** 绑定的滚动容器 */
    el: HTMLElement | null;
    /** 平滑方向 */
    axis: Axis;
    /** 上次 wheel 的时间，用于判断是否新开一段滚动 */
    lastWheelTime: number;
}

/** 每个容器的滚动状态（WeakMap 避免泄漏） */
const states = new WeakMap<HTMLElement, SmoothWheelState>();

/** 滚轮累计乘数（让滚幅更明显） */
const WHEEL_ACCEL = 1.5;
/** 一段滚动结束后，超过该毫秒再次滚轮则视为新开一段（重新从当前实际位置出发） */
const RESET_MS = 200;

/** 读取当前滚动位置与最大可滚量 */
function getScrollInfo(el: HTMLElement, axis: Axis) {
    if (axis === 'horizontal') {
        return { pos: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
    }
    return { pos: el.scrollTop, max: el.scrollHeight - el.clientHeight };
}

/** 写入滚动位置 */
function setScroll(el: HTMLElement, axis: Axis, pos: number) {
    if (axis === 'horizontal') el.scrollLeft = pos;
    else el.scrollTop = pos;
}

function tick(state: SmoothWheelState) {
    const el = state.el;
    if (!el) return;
    const diff = state.target - state.current;
    if (Math.abs(diff) < 0.5) {
        // 到位：直接落在目标，结束动画
        setScroll(el, state.axis, state.target);
        state.current = state.target;
        state.animating = false;
        state.raf = null;
        return;
    }
    // 每帧推进约 32% 的剩余距离 → 平缓减速但快速响应
    state.current += diff * 0.32;
    setScroll(el, state.axis, state.current);
    state.raf = requestAnimationFrame(() => tick(state));
}

function onWheel(state: SmoothWheelState, e: WheelEvent) {
    const el = state.el;
    if (!el) return;
    // 组合键（缩放等）交给默认
    if (e.ctrlKey || e.metaKey) return;

    const now = Date.now();
    const { pos, max } = getScrollInfo(el, state.axis);
    if (max <= 0) return;

    // 滚轮增量：优先 deltaY（垂直/滚轮），横向容器也可用 deltaY 驱动横向滚动
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;

    // 若已停止一段时间，重新从容器当前实际位置开始（避免累积漂移）
    if (!state.animating || now - state.lastWheelTime > RESET_MS) {
        state.current = pos;
        state.target = pos;
    }
    state.lastWheelTime = now;

    const target = Math.max(0, Math.min(max, state.target + delta * WHEEL_ACCEL));

    // 到达边界且继续往同方向滚：终止（阻止穿透/抖动）
    const hitBoundary =
        (delta < 0 && pos <= 0 && target <= 0) ||
        (delta > 0 && pos >= max && target >= max);

    e.preventDefault();

    if (hitBoundary) {
        if (state.raf !== null) cancelAnimationFrame(state.raf);
        state.animating = false;
        state.raf = null;
        return;
    }

    state.target = target;
    state.current = pos;

    if (!state.animating) {
        state.animating = true;
        state.raf = requestAnimationFrame(() => tick(state));
    }
}

function bind(el: HTMLElement, binding: DirectiveBinding<unknown>) {
    const axis: Axis = binding.value === 'horizontal' ? 'horizontal' : 'vertical';
    const state: SmoothWheelState = {
        current: 0,
        target: 0,
        raf: null,
        animating: false,
        el,
        axis,
        lastWheelTime: 0,
    };
    states.set(el, state);
    const handler = (e: WheelEvent) => onWheel(state, e);
    (el as any).__smoothWheelHandler = handler;
    el.addEventListener('wheel', handler, { passive: false });
}

function unbind(el: HTMLElement) {
    const handler = (el as any).__smoothWheelHandler;
    if (handler) el.removeEventListener('wheel', handler);
    const state = states.get(el);
    if (state && state.raf !== null) cancelAnimationFrame(state.raf);
    states.delete(el);
}

export const vSmoothWheel: Directive<HTMLElement, unknown> = {
    mounted: bind,
    unmounted: unbind,
};

// 兼容默认导出（供 `app.directive('smooth-wheel', vSmoothWheel)`）
export default vSmoothWheel;
