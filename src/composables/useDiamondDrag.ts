/**
 * 钻石的按压放大 + 拖拽交互。
 *
 * 聊天里的转账卡片和交易详情弹窗用的是同一颗石头，也应该是同一套手感：
 * - 按住放大（放大倍数由组件的 CSS 决定，见 `.is-diamond-pressed`），松手弹回；
 * - 拖动改变朝向，位移直接喂给姿态模型，松手后沿过冲曲线回位；
 * - 画布只是 2D 贴图，真正的渲染在共享的离屏 WebGL 上下文里完成。
 *
 * 放大**不走逐帧回调**而是一枚 CSS class：渲染循环只负责画石头本身，
 * 缩放交给合成器，指针按下的那一刻就必然生效，不会因为掉帧或回调缺失而「只有拖拽」。
 *
 * 挂载时机由调用方决定（聊天里随组件挂载、弹窗里等 v-if 的 DOM 落地），
 * 所以 mount/unmount 是显式方法，而不是绑在生命周期里。
 */

import { onBeforeUnmount, type Ref } from 'vue';
import { mountDiamond, type DiamondHandle } from '../utils/diamond/stage';
import { onVisibilityChange } from './useSharedIntersectionObserver';

/** 按下时挂到画布上的 class，组件在自己样式里定义具体缩放倍数 */
export const DIAMOND_PRESSED_CLASS = 'is-diamond-pressed';

export interface DiamondDragOptions {
    /** 承载石头的 2D 画布 */
    canvas: Ref<HTMLCanvasElement | null>;
    /** 配色索引；缺省与转账卡片一致（冷蓝） */
    palette?: number;
    /** 是否用共享 IntersectionObserver 做视口门控（消息列表需要，弹窗不需要） */
    viewportGate?: boolean;
    /** 按住是否放大（默认开；交易详情弹窗只要拖拽，不要放大） */
    pressZoom?: boolean;
    /**
     * 按下时的放大倍数，必须与组件样式里 `.is-diamond-pressed` 的 `scale()` 一致：
     * 画布会按这个倍数补像素，否则放大后就是位图拉伸、发糊。
     */
    pressScale?: number;
}

export interface DiamondDragHandle {
    /** 挂载渲染器（画布就绪、需要显示时调用；幂等） */
    mount(): void;
    /** 释放渲染资源（幂等） */
    unmount(): void;
    /** 姿态变了补一帧 */
    invalidate(): void;
    onPointerDown(event: PointerEvent): void;
    onPointerMove(event: PointerEvent): void;
    onPointerUp(event: PointerEvent): void;
}

export function useDiamondDrag(options: DiamondDragOptions): DiamondDragHandle {
    const { canvas, palette, viewportGate = false, pressZoom = true, pressScale = 2.2 } = options;

    let diamond: DiamondHandle | null = null;
    let releaseVisibility: (() => void) | null = null;
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    /** 按下的视觉放大：class 交给 CSS transition 补间，画布同步补像素 */
    function setPressed(pressed: boolean) {
        if (!pressZoom) return;
        canvas.value?.classList.toggle(DIAMOND_PRESSED_CLASS, pressed);
        diamond?.setZoom(pressed ? pressScale : 1);
    }

    function mount() {
        const el = canvas.value;
        if (!el || diamond) return;
        // 复用的画布可能残留上一次的按下态
        el.classList.remove(DIAMOND_PRESSED_CLASS);
        diamond = mountDiamond({ target: el, palette });
        if (viewportGate) {
            releaseVisibility = onVisibilityChange(
                el,
                () => diamond?.setVisible(true),
                () => diamond?.setVisible(false),
            );
        } else {
            diamond.setVisible(true);
        }
    }

    function unmount() {
        // 拖到一半被卸载（弹窗被 ESC 关掉、消息滚出列表）时手不会再有 pointerup：
        // 这里把指针状态一起清掉，否则同实例重新挂载后按下去没反应
        const el = canvas.value;
        if (pointerId !== null && el?.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
        pointerId = null;
        setPressed(false);
        releaseVisibility?.();
        releaseVisibility = null;
        diamond?.dispose();
        diamond = null;
    }

    function onPointerDown(event: PointerEvent) {
        const el = canvas.value;
        if (!el || pointerId !== null || !diamond) return;
        pointerId = event.pointerId;
        el.setPointerCapture(pointerId);
        lastX = event.clientX;
        lastY = event.clientY;
        setPressed(true);
        diamond.motion.beginDrag();
        if (pressZoom) diamond.motion.setPressed(true);
        diamond.setUrgent(true);
        event.preventDefault();
    }

    function onPointerMove(event: PointerEvent) {
        if (pointerId === null || event.pointerId !== pointerId || !diamond) return;
        // DOM 报的就是 CSS 像素，与 Unigram 传入的逻辑像素同一量纲
        diamond.motion.drag(event.clientX - lastX, event.clientY - lastY);
        lastX = event.clientX;
        lastY = event.clientY;
    }

    function onPointerUp(event: PointerEvent) {
        const el = canvas.value;
        if (pointerId === null || event.pointerId !== pointerId) return;
        if (el?.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
        pointerId = null;
        setPressed(false);
        diamond?.motion.endDrag();
        if (pressZoom) diamond?.motion.setPressed(false);
        diamond?.setUrgent(false);
    }

    function invalidate() {
        diamond?.invalidate();
    }

    onBeforeUnmount(unmount);

    return { mount, unmount, invalidate, onPointerDown, onPointerMove, onPointerUp };
}
