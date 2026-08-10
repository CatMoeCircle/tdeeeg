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
      { root: null, rootMargin: '300px 0px 300px 0px', threshold: 0.01 },
    );
  }
  return onceObserver;
}

/**
 * 监听元素首次进入（放大的）视口后执行一次回调并解除该回调。
 * 若元素当前已处于可视区，则同步触发一次。
 */
export function onVisibleOnce(el: Element | null | undefined, cb: () => void) {
  if (!el) {
    cb();
    return;
  }
  // 先同步判定当前是否已在可视区（含 rootMargin 缓冲），避免等待异步首次回调
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const scope = 300;
  if (rect.bottom >= -scope && rect.top <= vh + scope && rect.width > 0 && rect.height > 0) {
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
          if (isIntersecting && !e.visible) {
            e.visible = true;
            for (const enter of e.enters) enter();
          } else if (isIntersecting && e.visible) {
            for (const enter of e.enters) enter();
          } else if (!isIntersecting && e.visible) {
            e.visible = false;
            for (const leave of e.leaves) leave();
          }
        }
      },
      { root: null, rootMargin: '300px 0px 300px 0px', threshold: 0.01 },
    );
  }
  return visibilityObserver;
}

/**
 * 持续监听元素可见性变化：进入可视区调 enter，离开调 leave。
 * 若元素当前已处于可视区，立即补发一次 enter（同步当前状态，供播放门控启动）。
 */
export function onVisibilityChange(
  el: Element | null | undefined,
  enter: () => void,
  leave: () => void,
) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const scope = 300;
  const currentlyVisible =
    rect.bottom >= -scope && rect.top <= vh + scope && rect.width > 0 && rect.height > 0;

  let e = visibilityMap.get(el);
  if (!e) {
    e = { enters: new Set(), leaves: new Set(), visible: currentlyVisible };
    visibilityMap.set(el, e);
    getVisibilityObserver().observe(el);
  }
  e.enters.add(enter);
  e.leaves.add(leave);
  // 同步当前可见状态（用保存的 visible 位，而非重复计算）
  if (e.visible) {
    enter();
  } else {
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
