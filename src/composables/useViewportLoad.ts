import { onUnmounted, ref, type Ref } from 'vue';
import { onVisibleOnce, onVisibilityChange, unobserveVisibleOnce } from './useSharedIntersectionObserver';

/**
 * 视口门控加载：元素进入视口后才触发 load，未进入视口时保持不加载。
 *
 * 用于懒加载媒体下载——避免消息一加载进 DOM 就立即下载，而是等用户真正
 * 看到这条消息才下载；未看到时用 base64 缩略图占位。
 *
 * 特性：
 * - 基于**模块级共享 IntersectionObserver**（见 useSharedIntersectionObserver），
 *   避免每个调用方各建一个 observer —— 大量自定义 emoji/媒体同时存在时，
 *   每实例一个 observer 会令浏览器每帧 computeIntersections 极慢而丢帧。
 *   共享观察器用 root:null + 较大 rootMargin 近似覆盖内层滚动容器的裁剪。
 * - load 仅在元素首次真正进入视口时调用一次（once=true 默认）。
 * - 暴露 entered（是否已触发加载）供组件据此决定是否展示下载驱动内容。
 *
 * 用法：
 *   const elRef = ref<HTMLElement | null>(null);
 *   const { start, entered } = useViewportLoad(elRef, () => { loadMedia(); });
 *   onMounted(start);
 */
export function useViewportLoad(
    elRef: Ref<HTMLElement | null>,
    load: () => void,
    options: { once?: boolean; threshold?: number; rootMargin?: string } = {}
) {
    const { once = true } = options;
    const entered = ref(false);
    const inView = ref(false);
    let loaded = false;

    function start() {
        const el = elRef.value;
        if (!el) return;

        // 持续更新可视态（供 inView 使用）
        onVisibilityChange(el, () => { inView.value = true; }, () => { inView.value = false; });

        // once 模式：首次进入视口触发后卸载观察
        if (once) {
            onVisibleOnce(el, () => {
                entered.value = true;
                loaded = true;
                load();
            });
        } else {
            // 非 once（罕见）：每次从不可见→可见都触发 load
            onVisibilityChange(el, () => {
                if (!loaded) {
                    entered.value = true;
                    loaded = true;
                    load();
                }
            }, () => {});
        }
    }

    function stop() {
        unobserveVisibleOnce(elRef.value);
    }

    onUnmounted(() => unobserveVisibleOnce(elRef.value));
    return { start, stop, entered, inView };
}
