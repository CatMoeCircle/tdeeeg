import type { Directive, DirectiveBinding } from "vue";

/**
 * 全局平滑滚轮滚动（滚动缓冲）。
 *
 * 覆盖范围：文档上所有可滚容器（页面主列表、聊天消息区、抽屉、对话框、下拉面板等），
 * 无需再逐个挂 v-smooth-wheel。指令仅用于显式指定方向（如横向标签栏）。
 *
 * 原理：拦截 wheel（默认的“逐格跳变”），把增量累积到目标位置，再用与帧率无关的
 * 指数缓动（exponential smoothing）逐步逼近——不是固定步长，而是“先快后慢”的
 * 连续减速，手感接近 macOS / Telegram Desktop。
 *
 * 避让：
 * - Ctrl/Meta + 滚轮（缩放）交给浏览器；
 * - 已被组件自行处理且 preventDefault 的 wheel（如媒体预览缩放、贴纸分类横滑）；
 * - 可滚输入框（textarea / input / contenteditable）内优先滚动输入框本身。
 *
 * 边界：当前容器到顶/到底后自动链到外层可滚祖先，避免卡死或穿透抖动。
 *
 * 滚动性能：滚动期间通过全局计数器广播「滚动开始/结束」，供容器内的重型动画
 * （如 Lottie TGS 自定义 emoji canvas）暂停/恢复。
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
    /** 当前缓动位置（px，亚像素） */
    current: number;
    /** 目标位置（px） */
    target: number;
    /** rAF 句柄 */
    raf: number | null;
    /** 是否在动画中 */
    animating: boolean;
    /** 绑定的滚动容器 */
    el: HTMLElement;
    /** 平滑方向 */
    axis: Axis;
    /** 上次 wheel 的时间，用于判断是否新开一段滚动 */
    lastWheelTime: number;
    /** 上一帧时间戳（performance.now） */
    lastFrameTime: number;
    /** 是否已广播过「滚动开始」 */
    began: boolean;
}

/** 每个容器的滚动状态（WeakMap 避免泄漏） */
const states = new WeakMap<HTMLElement, SmoothWheelState>();

/** 滚轮增量放大（略大于 1，让滚幅跟手感；过大反而像“固定大步跳”） */
const WHEEL_ACCEL = 1.15;
/** 一段滚动结束后，超过该毫秒再次滚轮则视为新开一段（重新从当前实际位置出发） */
const RESET_MS = 280;
/**
 * 指数缓动强度：每 16.7ms 逼近目标的比例。
 * 0.18 ≈ 200ms 走完约 70%，约 350–400ms 落位——肉眼是连续减速，不是跳变。
 */
const EASE = 0.18;
/** 剩余距离小于该值（px）即视为到位 */
const STOP_EPSILON = 0.35;
/** 单帧最大推进（px），防止极大 delta 在一帧内“瞬移” */
const MAX_STEP_PER_FRAME = 220;

function isOverflowScrollable(overflow: string): boolean {
    return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
}

/** 该元素当前是否为可滚容器（至少一个方向有可滚内容） */
function isScrollableEl(el: HTMLElement): boolean {
    const style = getComputedStyle(el);
    const canY = isOverflowScrollable(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const canX = isOverflowScrollable(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    return canY || canX;
}

/** 从 from 向上找到最近的可滚容器 */
function findScrollableFrom(from: Element | null): HTMLElement | null {
    let node: Element | null = from;
    while (node) {
        if (node instanceof HTMLElement && isScrollableEl(node)) return node;
        node = node.parentElement;
    }
    return null;
}

/** 解析该容器在本次滚轮下的滚动方向 */
function resolveAxis(el: HTMLElement, e: WheelEvent): Axis {
    const explicit = el.dataset.smoothWheelAxis;
    if (explicit === 'horizontal' || explicit === 'vertical') return explicit;

    const style = getComputedStyle(el);
    const canY = isOverflowScrollable(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const canX = isOverflowScrollable(style.overflowX) && el.scrollWidth > el.clientWidth + 1;

    // 双向可滚：横向手势（|deltaX| 显著大于 |deltaY|）走横向，否则竖向
    if (canY && canX) {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5 && Math.abs(e.deltaX) > 2) return 'horizontal';
        return 'vertical';
    }
    // 仅横向可滚：仍用滚轮 deltaY 驱动（与既有横向标签栏行为一致）
    if (canX && !canY) return 'horizontal';
    return 'vertical';
}

/** 读取当前滚动位置与最大可滚量 */
function getScrollInfo(el: HTMLElement, axis: Axis) {
    if (axis === 'horizontal') {
        return { pos: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
    }
    return { pos: el.scrollTop, max: el.scrollHeight - el.clientHeight };
}

/**
 * 将 wheel 增量换算为像素。
 * deltaMode: 0=pixel, 1=line, 2=page。不换算会导致“每次只滚一点点/僵硬”。
 */
function wheelDeltaPx(e: WheelEvent): number {
    let delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= Math.max(window.innerHeight, 400);
    return delta;
}

/**
 * 从事件目标向上找到真正可滚的输入框（textarea / input / contenteditable）。
 * 用于避免「在可滚输入框内滚轮」被外层平滑滚动抢走、导致整页一起滚。
 */
function findNestedInputScroller(from: EventTarget | null, stopAt: HTMLElement | null): HTMLElement | null {
    let node: Element | null = from instanceof Element ? from : null;
    while (node && node !== stopAt) {
        if (node instanceof HTMLElement) {
            const tag = node.tagName;
            const isInputLike = tag === 'TEXTAREA' || tag === 'INPUT' || node.isContentEditable;
            if (isInputLike) {
                const overflowY = getComputedStyle(node).overflowY;
                const scrollable = isOverflowScrollable(overflowY);
                if (scrollable && node.scrollHeight > node.clientHeight + 1) return node;
                return null;
            }
        }
        node = node.parentElement;
    }
    return null;
}

/** 输入框在该滚轮方向上是否还能继续滚（否 → 交给外层做滚动链接） */
function nestedCanScroll(el: HTMLElement, delta: number): boolean {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return false;
    if (delta < 0) return el.scrollTop > 0;
    return el.scrollTop < max - 1;
}

/** 写入滚动位置（浏览器会取整，内部 current 保持亚像素以免累积误差） */
function setScroll(el: HTMLElement, axis: Axis, pos: number) {
    const v = Math.max(0, pos);
    if (axis === 'horizontal') el.scrollLeft = v;
    else el.scrollTop = v;
}

/** 结束当前容器的滚动动画（清理 rAF 并广播滚动结束） */
function endAnimation(state: SmoothWheelState, snapToTarget = false) {
    const el = state.el;
    if (snapToTarget) {
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
    const now = performance.now();
    // 首帧 / 后台恢复：用 16.7ms 作为缺省步长
    const dt = state.lastFrameTime > 0 ? Math.min(now - state.lastFrameTime, 64) : 16.7;
    state.lastFrameTime = now;

    const diff = state.target - state.current;
    const absDiff = Math.abs(diff);
    if (absDiff < STOP_EPSILON) {
        endAnimation(state, true);
        return;
    }

    // 与帧率无关的指数缓动：k = 1 - (1-EASE)^(dt/16.7)
    const k = 1 - Math.pow(1 - EASE, dt / 16.7);
    let step = diff * k;
    // 单帧限幅：极大目标也保持“滑过去”而不是瞬移
    if (step > MAX_STEP_PER_FRAME) step = MAX_STEP_PER_FRAME;
    else if (step < -MAX_STEP_PER_FRAME) step = -MAX_STEP_PER_FRAME;

    state.current += step;
    setScroll(el, state.axis, state.current);
    state.raf = requestAnimationFrame(() => tick(state));
}

function getState(el: HTMLElement, axis: Axis): SmoothWheelState {
    let state = states.get(el);
    if (!state) {
        state = {
            current: 0,
            target: 0,
            raf: null,
            animating: false,
            el,
            axis,
            lastWheelTime: 0,
            lastFrameTime: 0,
            began: false,
        };
        states.set(el, state);
    }
    state.axis = axis;
    state.el = el;
    return state;
}

/**
 * 对单个容器应用一次平滑滚动；返回是否已消费该 wheel。
 * 连续滚动时目标累加、当前位置保持，动画在整段手势里连续减速。
 */
function trySmoothScroll(el: HTMLElement, e: WheelEvent, deltaPx: number): boolean {
    const axis = resolveAxis(el, e);
    const { pos, max } = getScrollInfo(el, axis);
    if (max <= 0) return false;

    const state = getState(el, axis);
    const now = performance.now();

    // 停顿过久 / 尚未动画：从容器当前实际位置重新起算，避免漂移
    if (!state.animating || now - state.lastWheelTime > RESET_MS) {
        state.current = pos;
        state.target = pos;
    }
    state.lastWheelTime = now;

    const target = Math.max(0, Math.min(max, state.target + deltaPx * WHEEL_ACCEL));

    // 已到边界且继续往同方向滚：交给外层容器（滚动链接）
    const hitBoundary =
        (deltaPx < 0 && pos <= 0.5 && target <= 0) ||
        (deltaPx > 0 && pos >= max - 0.5 && target >= max);

    if (hitBoundary) {
        if (state.animating) endAnimation(state);
        return false;
    }

    e.preventDefault();

    // 只更新目标；current 由 tick 连续逼近——切勿每次 wheel 把 current 拉回 pos，
    // 否则连续滚动会变成一串“固定小步”，失去缓动连贯性。
    state.target = target;

    if (!state.animating) {
        state.animating = true;
        state.lastFrameTime = 0;
        // 首次开启动画：广播「滚动开始」以暂停容器内重型动画（如 Lottie），
        // 滚动结束后统一由 endAnimation 广播「滚动结束」恢复。
        if (!state.began) {
            state.began = true;
            beginScrolling();
        }
        state.raf = requestAnimationFrame(() => tick(state));
    }
    return true;
}

function onGlobalWheel(e: WheelEvent) {
    // 组合键（缩放等）交给默认
    if (e.ctrlKey || e.metaKey) return;
    // 组件已自行处理（媒体缩放、分类横滑等）
    if (e.defaultPrevented) return;

    const deltaPx = wheelDeltaPx(e);
    if (deltaPx === 0) return;

    // 可滚输入框内优先滚动输入框本身，不带动外层页面；
    // 输入框到边界后再放行，由外层继续滚（滚动链接）。
    const nested = findNestedInputScroller(e.target, null);
    if (nested && nestedCanScroll(nested, deltaPx)) return;

    // 从事件目标向上找可滚链，逐个尝试；到边界则链到外层
    let el = findScrollableFrom(e.target instanceof Element ? e.target : null);
    while (el) {
        // 标记了 data-no-smooth-wheel 的容器（如消息列表）不做平滑缓冲：
        // 不 preventDefault，直接交给浏览器原生滚动，便于对比排查滚动手感问题
        if (el.dataset.noSmoothWheel !== undefined) return;
        if (trySmoothScroll(el, e, deltaPx)) return;
        el = findScrollableFrom(el.parentElement);
    }

    // 文档兜底：html/body 常为 overflow:visible 但仍可滚
    const doc = document.scrollingElement instanceof HTMLElement
        ? document.scrollingElement
        : document.documentElement;
    if (doc && doc.scrollHeight > doc.clientHeight + 1) {
        trySmoothScroll(doc, e, deltaPx);
    }
}

let installed = false;

/**
 * 安装全局滚轮平滑滚动（幂等）。
 * 建议在 app.mount 之前调用一次。
 */
export function installGlobalSmoothWheel(): void {
    if (installed) return;
    installed = true;
    // bubble 阶段：让组件内 @wheel.prevent / @wheel.stop 先处理
    window.addEventListener('wheel', onGlobalWheel, { passive: false });
}

/**
 * v-smooth-wheel —— 显式指定滚动方向的可选指令。
 *
 * 全局平滑滚动已覆盖所有可滚容器；本指令仅在需要强制方向时使用：
 *   横向滚动：`<div class="overflow-x-auto" v-smooth-wheel="'horizontal'">...</div>`
 *   竖向滚动：`<div v-smooth-wheel="'vertical'">...</div>`
 *   不传值时不干预方向（自动判断）。
 */
function bind(el: HTMLElement, binding: DirectiveBinding<unknown>) {
    if (binding.value === 'horizontal' || binding.value === 'vertical') {
        el.dataset.smoothWheelAxis = binding.value;
    } else {
        delete el.dataset.smoothWheelAxis;
    }
}

function unbind(el: HTMLElement) {
    delete el.dataset.smoothWheelAxis;
    const state = states.get(el);
    if (state) endAnimation(state);
    states.delete(el);
}

export const vSmoothWheel: Directive<HTMLElement, unknown> = {
    mounted: bind,
    updated: bind,
    unmounted: unbind,
};

// 兼容默认导出（供 `app.directive('smooth-wheel', vSmoothWheel)`）
export default vSmoothWheel;
