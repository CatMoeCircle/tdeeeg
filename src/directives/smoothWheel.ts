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
 *
 * 滚动性能：滚动期间通过全局计数器广播「滚动开始/结束」，供容器内的重型动画
 * （如 Lottie TGS 自定义 emoji canvas）暂停/恢复，避免滚动时它们每帧重绘造成卡顿。
 */

/** 方向模式 */
type Axis = 'vertical' | 'horizontal';

/** 全局滚动计数（>0 表示当前至少有一个容器在平滑滚动中） */
let globalScrollingCount = 0;

/** 广播一次滚动状态变化给所有订阅者（如 Lottie 动画暂停/恢复） */
function broadcastScrolling(scrolling: boolean) {
    document.dispatchEvent(new CustomEvent('tdgram:scroll-active', { detail: scrolling }));
}

/** 某个容器进入平滑滚动：全局计数 +1，从 0→1 时广播「开始」 */
function beginScrolling() {
    if (globalScrollingCount === 0) broadcastScrolling(true);
    globalScrollingCount++;
}

/** 某个容器结束平滑滚动：全局计数 -1，归 0 时广播「结束」 */
function endScrolling() {
    if (globalScrollingCount > 0) globalScrollingCount--;
    if (globalScrollingCount === 0) broadcastScrolling(false);
}

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
    /** 是否已广播过「滚动开始」 */
    began: boolean;
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

/** 每帧缓动逼近比例（值越大越快收敛、动画帧越少） */
const EASING = 0.45;
/** 当剩余距离小于该值（px）即视为到位并结束动画，减少无谓的动画帧 */
const STOP_EPSILON = 0.6;
/** 当剩余距离很小且推进量也极小（趋近静止、视觉不再变化）时提前收尾 */
const MIN_STEP = 0.1;

/** 结束当前容器的滚动动画（清理 rAF 并广播滚动结束） */
function endAnimation(state: SmoothWheelState, snapToTarget = false) {
    const el = state.el;
    if (snapToTarget && el) {
        setScroll(el, state.axis, state.target);
        state.current = state.target;
    }
    state.animating = false;
    if (state.raf !== null) {
        cancelAnimationFrame(state.raf);
        state.raf = null;
    }
    if (state.began) {
        state.began = false;
        endScrolling();
    }
}

function tick(state: SmoothWheelState) {
    const el = state.el;
    if (!el) return;
    const diff = state.target - state.current;
    const absDiff = Math.abs(diff);
    if (absDiff < STOP_EPSILON || (absDiff < 4 && Math.abs(diff * EASING) < MIN_STEP)) {
        // 到位 / 尾段不可感知：直接落在目标并结束动画
        endAnimation(state, true);
        return;
    }
    state.current += diff * EASING;
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

    if (hitBoundary) {
        // 未产生实际滚动：不消耗该事件，交给浏览器默认处理（例如滚到父级/页面），
        // 也不需取消动画帧后继续空转。若此前有动画在跑则一并收尾（含广播恢复动画）。
        if (state.animating) endAnimation(state);
        return;
    }

    e.preventDefault();

    state.target = target;
    state.current = pos;

    if (!state.animating) {
        state.animating = true;
        // 首次开启动画：广播「滚动开始」以暂停容器内重型动画（如 Lottie），
        // 滚动结束后统一由 endAnimation 广播「滚动结束」恢复。
        if (!state.began) {
            state.began = true;
            beginScrolling();
        }
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
        began: false,
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
    if (state) endAnimation(state);
    states.delete(el);
}

export const vSmoothWheel: Directive<HTMLElement, unknown> = {
    mounted: bind,
    unmounted: unbind,
};

// 兼容默认导出（供 `app.directive('smooth-wheel', vSmoothWheel)`）
export default vSmoothWheel;
