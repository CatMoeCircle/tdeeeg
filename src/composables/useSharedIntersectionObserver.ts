import { onUnmounted } from 'vue';

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
 *   onUnmounted(() => unobserve(elRef.value));
 */

// ─── 一次性加载注册表（useViewportLoad） ───────────────────────
type OnceCb = () => void;
const visibleOnceFlags = new Map<Element, Set<OnceCb>>();
let onceObserver: IntersectionObserver | null = null;

function getOnceObserver(): IntersectionObserver {
  if (!onceObserver) {
    onceObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cbs = visibleOnceFlags.get(entry.target);
          if (!cbs) continue;
          // 触发全部一次性回调后，从观察中移除该元素
          for (const cb of [...cbs]) cb();
          visibleOnceFlags.delete(entry.target);
          onceObserver?.unobserve(entry.target);
        }
      },
      // 预取距离：在视口上下各扩 640px，缩略图/聊天媒体在进入视口前就开始加载
      { root: null, rootMargin: '640px 0px 640px 0px', threshold: 0.01 },
    );
  }
  return onceObserver;
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
    getOnceObserver().observe(el);
  }
  set.add(cb);
}

/** 解除一次性加载观察（不影响 visibilityMap）。 */
export function unobserveVisibleOnce(el: Element | null | undefined) {
  if (!el) return;
  if (onceObserver) onceObserver.unobserve(el);
  visibleOnceFlags.delete(el);
}

// ─── 持续可见性注册表（useLottiePause） ────────────────────────
interface VisibilityEntry {
  enters: Set<() => void>;
  leaves: Set<() => void>;
  visible: boolean;
}
const visibilityMap = new Map<Element, VisibilityEntry>();
let visibilityObserver: IntersectionObserver | null = null;

function getVisibilityObserver(): IntersectionObserver {
  if (!visibilityObserver) {
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const e = visibilityMap.get(entry.target);
          if (!e) continue;
          const isIntersecting = entry.isIntersecting;
          // 仅在可见性「边沿」触发回调；持续相交时不重复 enter，避免无意义重入
          if (isIntersecting && !e.visible) {
            e.visible = true;
            for (const enter of e.enters) enter();
          } else if (!isIntersecting && e.visible) {
            e.visible = false;
            for (const leave of e.leaves) leave();
          }
        }
      },
      // 与一次性加载一致：视口外扩 640px，聊天/缩略图视口门控提前触发
      { root: null, rootMargin: '640px 0px 640px 0px', threshold: 0.01 },
    );
  }
  return visibilityObserver;
}

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
    getVisibilityObserver().observe(el);
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

/** 解除持续可见性观察（不影响 visibleOnceMap）。 */
export function unobserveVisibility(el: Element | null | undefined) {
  if (!el) return;
  if (visibilityObserver) visibilityObserver.unobserve(el);
  visibilityMap.delete(el);
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

  onUnmounted(() => unobserve(elRef.value));

  return { onVisibleOnce: visibleOnce, onVisibilityChange: visibilityChange, unobserve };
}
