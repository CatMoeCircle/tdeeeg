import { onUnmounted, type Ref } from 'vue';
import { onVisibilityChange as sharedOnVisibilityChange, unobserveVisibility } from './useSharedIntersectionObserver';

/**
 * Lottie 播放器的最小可编程控制接口。
 *
 * 兼容 lottie-web 的 AnimationItem 与 rlottie-wasm-vue-player 的组件实例，
 * 二者都提供 play() / pause()（可能还有 stop()）。
 */
export interface LottieControl {
    play(): void;
    pause(): void;
    stop?(): void;
}

interface UseLottiePauseOptions {
    /** 是否在离开视口时暂停，进入视口时恢复。默认 true */
    visibility?: boolean;
    /** 是否在窗口未聚焦（blur / 隐藏）时暂停，聚焦时恢复。默认 true */
    windowFocus?: boolean;
    /** 是否在全局平滑滚动时暂停。默认 true */
    scroll?: boolean;
    /** @deprecated 已改用共享观察器（useSharedIntersectionObserver），阈值不再生效。 */
    threshold?: number;
}

/**
 * 统一的 Lottie 动画暂停/恢复控制器。
 *
 * 管理多个"暂停来源"，任一来源处于暂停态时动画暂停，全部恢复后才继续播放：
 * - 视口离开（IntersectionObserver）
 * - 窗口未聚焦（blur / visibilitychange）
 * - 全局平滑滚动（tdgram:scroll-active）
 *
 * 用法：
 * ```ts
 * const pause = useLottiePause(lottieRef);
 * onMounted(() => pause.setup());
 * // 加载动画后把实例注册进去，立即按当前状态应用暂停/播放
 * pause.register(lottieAnim);
 * ```
 */
export function useLottiePause(
    containerRef: Ref<HTMLElement | null>,
    options: UseLottiePauseOptions = {}
) {
    const {
        visibility = true,
        windowFocus = true,
        scroll = true,
    } = options;

    let anim: LottieControl | null = null;
    /** 可选的 `<video>` 元素（GIF/webm/mp4），与 Lottie 一起受同一门控暂停/恢复 */
    let video: HTMLVideoElement | null = null;
    let inView = true;
    let focused = true;
    let scrolling = false;

    /** 根据当前所有来源的状态决定暂停还是继续 */
    function apply() {
        const shouldPause =
            (visibility && !inView) ||
            (windowFocus && !focused) ||
            (scroll && scrolling);
        if (!shouldPause) {
            anim?.play();
            // 恢复视频（当前处于可视区且窗口聚焦才播）
            if (video && inView && focused) {
                try { video.play(); } catch { /* 静默 */ }
            }
        } else {
            anim?.pause();
            video?.pause();
        }
    }

    /** 注册（或更新）Lottie 实例，并立即应用一次状态 */
    function register(a: LottieControl | null) {
        anim = a;
        apply();
    }

    /**
     * 注册（或更新）可暂停的视频元素（GIF/webm/mp4），与 Lottie 使用同一门控。
     * 窗口失焦/隐藏或滚出视口时暂停；聚焦且可见时恢复播放。
     */
    function registerVideo(v: HTMLVideoElement | null) {
        video = v;
        apply();
    }

    /** 获取当前已注册的 Lottie 实例 */
    function get() {
        return anim;
    }

    // ─── 视口观察 ─────────────────────────────────────────────
    /**
     * 基于**模块级共享 IntersectionObserver**（useSharedIntersectionObserver）判断可视性。
     * 原先每个实例各建一个 observer + 遍历 DOM 找滚动容器，海量自定义表情/贴纸时
     * 会生成成百上千个 observer，令浏览器每帧 computeIntersections 极慢而丢帧。
     * 共享观察器用 root:null + 较大 rootMargin 近似覆盖内层滚动容器的裁剪。
     */
    function setupObserver(el: HTMLElement) {
        if (!visibility) return;
        sharedOnVisibilityChange(
            el,
            () => { inView = true; apply(); },   // 进入可视区 → 若满足条件恢复播放
            () => { inView = false; apply(); },  // 离开可视区 → 暂停
        );
    }

    // ─── 窗口聚焦 ─────────────────────────────────────────────
    function onFocus() {
        focused = true;
        apply();
    }
    function onBlur() {
        focused = false;
        apply();
    }
    function onVisibilityChange() {
        focused = !document.hidden;
        apply();
    }

    // ─── 平滑滚动 ─────────────────────────────────────────────
    function onScrollActive(e: Event) {
        const active = (e as CustomEvent<boolean>).detail;
        if (active === scrolling) return;
        scrolling = active;
        apply();
    }

    /** 初始化事件监听（需在挂载后调用，自动使用传入的容器 ref） */
    function setup() {
        const el = containerRef.value;
        if (el) setupObserver(el);
        if (windowFocus) {
            window.addEventListener('focus', onFocus);
            window.addEventListener('blur', onBlur);
            document.addEventListener('visibilitychange', onVisibilityChange);
        }
        if (scroll) {
            document.addEventListener('tdgram:scroll-active', onScrollActive);
        }
    }

    function cleanup() {
        // 仅解除本 composable 使用的可见性观察（不影响 useViewportLoad 的一次性加载表）
        unobserveVisibility(containerRef.value);
        if (windowFocus) {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        }
        if (scroll) {
            document.removeEventListener('tdgram:scroll-active', onScrollActive);
        }
    }

    onUnmounted(cleanup);

    return { register, registerVideo, get, apply, setup };
}
