import { onUnmounted, ref, type Ref } from 'vue';

/**
 * 视口门控加载：元素进入视口后才触发 load，未进入视口时保持不加载。
 *
 * 用于懒加载媒体下载——避免消息一加载进 DOM 就立即下载，而是等用户真正
 * 看到这条消息（进入滚动容器视口）才下载；未看到时用 base64 缩略图占位。
 *
 * 特性：
 * - 自动检测元素的最近可滚动祖先作为 IntersectionObserver root（聊天列表、
 *   侧边栏等内层滚动容器也能正确判可见），否则回退到窗口视口。
 * - load 仅在元素首次真正进入视口时调用一次（once=true 默认），
 *   避免用户滚过时反复触发下载。
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
    const { once = true, threshold = 0.01, rootMargin = '200px 0px 200px 0px' } = options;
    const entered = ref(false);
    const inView = ref(false);
    let observer: IntersectionObserver | null = null;
    let loaded = false;

    /**
     * 寻找最近的「可滚动」祖先容器作为观察 root。
     * IntersectionObserver 默认 root 是窗口视口，不会考虑祖先滚动容器的裁剪，
     * 导致聊天列表滚动容器内被卷出可视区域的元素仍被判为「相交」。这里显式
     * 把滚动容器设为 root，才能正确判断消息是否真的出现在用户视口内。
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

    function start() {
        const el = elRef.value;
        if (!el || observer) return;
        const root = findScrollRoot(el);
        observer = new IntersectionObserver(
            (entries) => {
                for (const en of entries) {
                    inView.value = en.isIntersecting;
                    if (en.isIntersecting && !loaded) {
                        entered.value = true;
                        loaded = true;
                        load();
                        if (once) stop();
                    }
                }
            },
            { threshold, root, rootMargin }
        );
        observer.observe(el);
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    onUnmounted(stop);
    return { start, stop, entered, inView };
}
