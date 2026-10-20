import { onBeforeUnmount } from 'vue';

/**
 * 共享的 IntersectionObserver 懒加载 / 可见性门控。
 *
 * 为什么需要共享：`useLottiePause` 与 `useViewportLoad` 会被大量实例化——
 * 每条消息、每个自定义 emoji、每个贴纸/媒体都可能各建一个。若每个实例各自
 * `new IntersectionObserver`，会产生成百上千个 observer；浏览器每帧都要为所有
 * observer 计算交集（IntersectionObserverController::computeIntersections），
 * 观察者越多主线程越慢，导致「大量未加载 emoji/媒体」出现时严重掉帧丢帧
 * （实测该调用占主线程 12s+，是最大卡顿元凶）。
 *
 * 这里在模块级只创建 **一个** 共享的 IntersectionObserver（root:null + 较大
 * rootMargin 近似覆盖内层滚动容器），但用 **两个相互独立的注册表**：
 * - `visibleOnceMap`：一次性加载（供 useViewportLoad 的懒加载）
 * - `visibilityMap`：持续可见性（供 useLottiePause 的播放门控）
 * 两个表的 observe 状态各自独立维护，`unobserveVisibleOnce` 不会影响
 * `visibilityMap`，反之亦然 —— 彻底避免「同一元素被多个 composable 观察，
 * 一个卸载误删另一个注册」的隐患。
 *
 * 用法（在组件 setup 中）：
 *   const elRef = ref<HTMLElement | null>(null);
 *   onMounted(() => {
 *     onVisibleOnce(elRef.value, () => { load(); });   // useViewportLoad
 *     onVisibilityChange(elRef.value, enter, leave);   // useLottiePause
 *   });
 *   onBeforeUnmount(() => unobserve(elRef.value));   // 必须在卸载前：onUnmounted 时 ref 已为 null
 */

// ─── 一次性加载注册表（useViewportLoad） ───────────────────────
type OnceCb = () => void;
const visibleOnceFlags = new Map<Element, Set<OnceCb>>();
// 两张表共用同一个 observer（options 相同，合并后每帧只计算一次交集）
let sharedObserver: IntersectionObserver | null = null;

/** 仅当两张表都不再持有该元素时才真正解除观察；任一表仍持有则保留。 */
function releaseIfUnused(el: Element) {
  if (!visibleOnceFlags.has(el) && !visibilityMap.has(el)) sharedObserver?.unobserve(el);
}

// 回调内按顺序处理：先一次性加载，再持续可见性（visibilityMap 在下方声明）
function getObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          // 一次性：相交后触发全部回调，再从表中删除
          if (entry.isIntersecting) {
            const cbs = visibleOnceFlags.get(el);
            if (cbs) {
              for (const cb of [...cbs]) cb();
              visibleOnceFlags.delete(el);
            }
          }
          // 持续可见性：仅在可见性「边沿」触发；持续相交时不重复 enter，避免无意义重入
          const e = visibilityMap.get(el);
          if (e) {
            if (entry.isIntersecting && !e.visible) {
              e.visible = true;
              for (const enter of e.enters) enter();
            } else if (!entry.isIntersecting && e.visible) {
              e.visible = false;
              for (const leave of e.leaves) leave();
            }
          }
          releaseIfUnused(el);
        }
      },
      // 预取距离：视口上下各扩约一屏，媒体与播放门控在进入可见区前就开始处理
      { root: null, rootMargin: '800px 0px 800px 0px', threshold: 0.01 },
    );
  }
  return sharedObserver;
}

/**
 * 监听元素首次进入（放大的）视口后执行一次回调并解除该回调。
 * 仅依赖 IntersectionObserver 的异步首次回调——注册时不做 getBoundingClientRect，
 * 避免大量元素挂载时同步强制布局（实测该路径是 INP/强制重排的最大来源）。
 */
export function onVisibleOnce(el: Element | null | undefined, cb: () => void) {
  if (!el) {
    cb();
    return;
  }
  let set = visibleOnceFlags.get(el);
  if (!set) {
    set = new Set();
    visibleOnceFlags.set(el, set);
    getObserver().observe(el);
  }
  set.add(cb);
}

/** 解除一次性加载注册（visibilityMap 仍持有时保持观察）。 */
export function unobserveVisibleOnce(el: Element | null | undefined) {
  if (!el) return;
  visibleOnceFlags.delete(el);
  releaseIfUnused(el);
}

// ─── 持续可见性注册表（useLottiePause） ────────────────────────
interface VisibilityEntry {
  enters: Set<() => void>;
  leaves: Set<() => void>;
  visible: boolean;
}
const visibilityMap = new Map<Element, VisibilityEntry>();

/**
 * 持续监听元素可见性变化：进入可视区调 enter，离开调 leave。
 * 注册时不做 getBoundingClientRect——大量元素同时挂载时同步读布局会造成
 * 严重强制重排（性能追踪中该路径单独占 600ms+）。首次状态交给
 * IntersectionObserver 的初始回调（observe 后一帧内即会派发）。
 */
export function onVisibilityChange(
  el: Element | null | undefined,
  enter: () => void,
  leave: () => void,
) {
  if (!el) return;

  let e = visibilityMap.get(el);
  if (!e) {
    // 初始默认不可见：不读布局。IO 首次回调（observe 后一帧内）会纠正状态。
    e = { enters: new Set(), leaves: new Set(), visible: false };
    visibilityMap.set(el, e);
    getObserver().observe(el);
  }
  e.enters.add(enter);
  e.leaves.add(leave);
  if (e.visible) {
    enter();
  } else {
    // 尚未确认可见：先按离屏处理，避免 Lottie/视频在 IO 纠正前误播
    leave();
  }
}

/** 解除持续可见性注册（visibleOnceFlags 仍持有时保持观察）。 */
export function unobserveVisibility(el: Element | null | undefined) {
  if (!el) return;
  visibilityMap.delete(el);
  releaseIfUnused(el);
}

/**
 * 通用解除：同时解除两个注册表（组件整体卸载时调用）。
 */
export function unobserve(el: Element | null | undefined) {
  unobserveVisibleOnce(el);
  unobserveVisibility(el);
}

/**
 * Vue 组合式封装：绑定一个 ref 元素，卸载时自动 unobserve。
 * 适合在组件 <script setup> 中直接使用。
 */
export function useSharedObserver(elRef: { value: Element | null | undefined }) {
  const visibleOnce = (cb: () => void) => onVisibleOnce(elRef.value, cb);
  const visibilityChange = (enter: () => void, leave: () => void) =>
    onVisibilityChange(elRef.value, enter, leave);

  // onBeforeUnmount：onUnmounted 时 ref 已置空，unobserve(null) 是空操作 → 元素被观察器永久持有
  onBeforeUnmount(() => unobserve(elRef.value));

  return { onVisibleOnce: visibleOnce, onVisibilityChange: visibilityChange, unobserve };
}
