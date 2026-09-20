import { onUnmounted, ref, type Ref } from 'vue';
import { onVisibilityChange, unobserveVisibility } from './useSharedIntersectionObserver';
import {
    enqueueViewportLoad,
    DEFAULT_DWELL_MS,
    type ViewportLoadScope,
} from '../utils/viewportLoadGate';

/**
 * 视口门控加载：元素进入视口并**停留**后才触发 load，未进入视口时保持不加载。
 *
 * 用于懒加载媒体下载——避免消息一加载进 DOM 就立即下载，而是等用户真正
 * 看到这条消息才下载；未看到时用 base64 缩略图占位。
 *
 * 特性：
 * - 基于**模块级共享 IntersectionObserver**（见 useSharedIntersectionObserver），
 *   rootMargin 在视口外扩约 640px，元素尚未进入视口时即可预取。
 * - **停留防抖**：进入（放大后的）视口后需连续可见 dwellMs（默认 500ms）才触发；
 *   期间离开视口则取消。防止快速滚动/惯性划过时对整屏消息同时发起下载。
 * - **按界面分池并发闸门**：enqueue=true（默认）时 load 通过 enqueueViewportLoad(scope)
 *   排队执行；enqueue=false 时停留结束后直接调用 load，不占并发槽（用于缩略图等
 *   极轻量同步下载）。
 * - load 仅触发一次（once=true 默认）。
 * - 暴露 entered（是否已触发加载）供组件据此决定是否展示下载驱动内容。
 *
 * 用法：
 *   const elRef = ref<HTMLElement | null>(null);
 *   const { start, entered } = useViewportLoad(elRef, () => loadMedia());
 *   onMounted(start);
 */
export function useViewportLoad(
    elRef: Ref<HTMLElement | null>,
    load: () => void | Promise<void>,
    options: {
        once?: boolean;
        threshold?: number;
        rootMargin?: string;
        dwellMs?: number;
        /** 界面分池，默认 chat */
        scope?: ViewportLoadScope;
        /** false：停留结束后直接执行 load，不进并发队列（缩略图/Small） */
        enqueue?: boolean;
    } = {}
) {
    const { once = true, dwellMs = DEFAULT_DWELL_MS, scope = 'chat', enqueue = true } = options;
    const entered = ref(false);
    const inView = ref(false);
    let loaded = false;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let observedEl: Element | null = null;

    function clearDwell() {
        if (dwellTimer !== null) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
        }
    }

    function fireLoad() {
        if (loaded) return;
        loaded = true;
        entered.value = true;
        if (enqueue) {
            enqueueViewportLoad(load, scope);
        } else {
            void load();
        }
        // once 模式加载后不再需要持续可见性回调
        if (once && observedEl) {
            unobserveVisibility(observedEl);
            observedEl = null;
        }
    }

    function start() {
        const el = elRef.value;
        if (!el) return;
        observedEl = el;

        onVisibilityChange(
            el,
            () => {
                inView.value = true;
                if (loaded) return;
                clearDwell();
                if (dwellMs <= 0) {
                    fireLoad();
                    return;
                }
                dwellTimer = setTimeout(() => {
                    dwellTimer = null;
                    // 停留结束时必须仍在视口内才真正加载
                    if (inView.value) fireLoad();
                }, dwellMs);
            },
            () => {
                inView.value = false;
                // 停留期间离开：取消本次加载
                clearDwell();
            }
        );
    }

    function stop() {
        clearDwell();
        if (observedEl) {
            unobserveVisibility(observedEl);
            observedEl = null;
        }
    }

    onUnmounted(() => {
        clearDwell();
        if (observedEl) {
            unobserveVisibility(observedEl);
            observedEl = null;
        }
    });

    return { start, stop, entered, inView };
}
