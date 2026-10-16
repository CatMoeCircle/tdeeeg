import { onUnmounted, ref, type Ref } from 'vue';
import { onVisibilityChange, unobserveVisibility } from './useSharedIntersectionObserver';
import {
    enqueueViewportLoad,
    DEFAULT_DWELL_MS,
    type ViewportLoadScope,
    type ViewportLoadHandle,
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
 * - **未开始可丢弃**：传入 onDrop 后，元素离开（放大后的）视口或组件销毁时，
 *   排队中但尚未开始执行的 load 会被丢弃并回调 onDrop（已在执行的不打断）；
 *   被丢弃后元素再次进入视口会重新排队。
 * - load 仅触发一次（once=true 默认）；传入 onDrop 时保持观察以感知离开。
 * - requeue()：把一次补加载重新排回同一并发池（不绕过队列）。
 * - 暴露 entered（是否已触发加载）、pending（已排队/正在执行）供组件使用。
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
        /**
         * 排队中的任务被丢弃时（离开视口 / 队列被清空）回调。
         * 传入后元素将持续被观察（不再 once 解绑），以便离开视口能丢弃未开始的加载。
         */
        onDrop?: () => void;
    } = {}
) {
    const { once = true, dwellMs = DEFAULT_DWELL_MS, scope = 'chat', enqueue = true, onDrop } = options;
    const entered = ref(false);
    const inView = ref(false);
    /** 已排队或正在执行 load（供组件避免绕过队列重复加载） */
    const pending = ref(false);
    let loaded = false;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let observedEl: Element | null = null;
    /** 当前排队句柄（已开始执行后 cancel 无效） */
    let pendingHandle: ViewportLoadHandle | null = null;

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
            pending.value = true;
            pendingHandle = enqueueViewportLoad(async () => {
                try {
                    await load();
                } finally {
                    pending.value = false;
                }
            }, scope, () => {
                // 被丢弃：复位以便重新进入视口时还能再次排队
                pendingHandle = null;
                pending.value = false;
                loaded = false;
                entered.value = false;
                onDrop?.();
            });
        } else {
            void load();
        }
        // once 模式加载后不再需要持续可见性回调；需要 onDrop 时必须保留观察以感知离开
        if (once && observedEl && !onDrop) {
            unobserveVisibility(observedEl);
            observedEl = null;
        }
    }

    /**
     * 丢弃尚未开始的排队加载（已在执行则无效）。
     * 返回是否真的丢弃；丢弃时 onDrop 已被调用。
     */
    function cancelPending(): boolean {
        const dropped = pendingHandle?.cancel() ?? false;
        if (!dropped) pendingHandle = null;
        return dropped;
    }

    /**
     * 重新排队一次 load（仍走同一并发池），用于「内容替换 / 文件刚就绪」的补加载，
     * 避免组件绕过队列直连导致并发池失效。已在排队/执行中时返回 false。
     */
    function requeue(): boolean {
        if (pending.value) return false;
        loaded = false;
        fireLoad();
        return true;
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
                // 已排队但尚未开始：离开即丢弃（进行中的下载不动）
                if (onDrop) cancelPending();
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
        // 组件销毁：尚未开始的排队加载一并丢弃（进行中的不动）
        if (onDrop) cancelPending();
        if (observedEl) {
            unobserveVisibility(observedEl);
            observedEl = null;
        }
    });

    return { start, stop, entered, inView, pending, cancelPending, requeue };
}
