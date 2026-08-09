import { onUnmounted, type Ref } from 'vue';

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
    /** 视口交叉比例阈值。默认 0.1 */
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
        threshold = 0.1,
    } = options;

    let anim: LottieControl | null = null;
    let observer: IntersectionObserver | null = null;
    let inView = true;
    let focused = true;
    let scrolling = false;

    /** 根据当前所有来源的状态决定暂停还是继续 */
    function apply() {
        if (!anim) return;
        const shouldPause =
            (visibility && !inView) ||
            (windowFocus && !focused) ||
            (scroll && scrolling);
        if (shouldPause) {
            anim.pause();
        } else {
            anim.play();
        }
    }

    /** 注册（或更新）Lottie 实例，并立即应用一次状态 */
    function register(a: LottieControl | null) {
        anim = a;
        apply();
    }

    /** 获取当前已注册的 Lottie 实例 */
    function get() {
        return anim;
    }

    // ─── 视口观察 ─────────────────────────────────────────────
    /**
     * 寻找最近的「可滚动」祖先容器作为观察 root。
     * IntersectionObserver 默认 root 是窗口视口，不会考虑祖先滚动容器的裁剪，
     * 导致内层滚动容器内被卷出可视区域的元素仍被判为「相交」——若自定义表情/贴纸
     * 只是被卷出聊天列表等滚动容器（而非页面视口），Lottie 会继续满帧播放，拖累性能。
     * 显式把滚动容器设为 root，才能让「被滚动容器卷出屏幕」的动画也正确暂停。
     */
    function findScrollRoot(el: HTMLElement): HTMLElement | null {
        let node = el.parentElement;
        while (node) {
            const style = getComputedStyle(node);
            const oy = style.overflowY;
            if (
                (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
                node.scrollHeight > node.clientHeight + 1
            ) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    function setupObserver(el: HTMLElement) {
        if (!visibility) return;
        const root = findScrollRoot(el);
        observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            inView = entry.isIntersecting;
            apply();
        }, { threshold, root });
        observer.observe(el);
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
        if (observer) {
            observer.disconnect();
            observer = null;
        }
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

    return { register, get, apply, setup };
}
