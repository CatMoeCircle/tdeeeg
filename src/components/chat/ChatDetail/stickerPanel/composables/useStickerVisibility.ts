import { onUnmounted, type Ref } from 'vue';

/**
 * 共享的 IntersectionObserver 懒加载门控。
 *
 * 为什么需要共享：`StickerMediaItem` 会被实例化成几十上百个（贴纸 / GIF / 表情），
 * 若每个实例各自 `new IntersectionObserver` + 遍历 DOM 找滚动容器（findScrollRoot），
 * 会产生海量的监听器与 DOM 遍历，导致设置/卸载开销巨大（实测 setup 占 38%、addEventListener 占 37%）。
 *
 * 这里在模块级只创建 **一个** 共享的 IntersectionObserver，用 `root: null` + 较大的
 * rootMargin 近似覆盖各抽屉滚动容器内可见项；所有媒体项复用同一个观察器，
 * 显著降低监听器数量与内存开销。
 *
 * 用法：
 *   const rootEl = ref<HTMLElement|null>(null);
 *   onMounted(() => onVisibleOnce(rootEl.value, () => { load(); }));
 */
/** 单个元素的可观察状态 */
interface ObserverEntry {
  /** 一次性回调（首次进入视口触发后清除） */
  once?: () => void;
  /** 进入可视区的回调（每次从不可见→可见时触发） */
  enter?: () => void;
  /** 离开可视区的回调（每次从可见→不可见时触发） */
  leave?: () => void;
  /** 当前是否处于（放大的）可视区 */
  visible: boolean;
}

const observers = new Map<Element, ObserverEntry>();

let sharedObserver: IntersectionObserver | null = null;
/**
 * 轮询获取共享观察器（rootMargin 给较大缓冲，视觉上预加载更早开始）。
 * 所有贴纸项复用同一个观察器，避免每个实例各建一个，显著降低监听器数量。
 */
function getObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const e = observers.get(entry.target);
          if (!e) continue;
          const isIntersecting = entry.isIntersecting;
          if (isIntersecting && !e.visible) {
            // 一次性回调：触发即注销，不再持续观察
            const once = e.once;
            if (once) {
              observers.delete(entry.target);
              sharedObserver?.unobserve(entry.target);
              once();
              continue;
            }
            e.visible = true;
            e.enter?.();
          } else if (isIntersecting && e.visible) {
            e.enter?.();
          } else if (!isIntersecting && e.visible) {
            e.visible = false;
            e.leave?.();
          }
        }
      },
      // root:null = 窗口视口；rootMargin 扩大可视区域，让稍靠近视口的项提前加载
      { root: null, rootMargin: '400px 0px 400px 0px', threshold: 0.01 },
    );
  }
  return sharedObserver;
}

/** 监听元素首次进入（放大的）视口后执行一次回调并解除监听 */
export function onVisibleOnce(el: Element | null | undefined, cb: () => void) {
  if (!el) {
    cb();
    return;
  }
  if (observers.has(el)) return;
  observers.set(el, { once: cb, visible: false });
  getObserver().observe(el);
}

/**
 * 持续监听元素的可见性变化：进入可视区调 enter，离开调 leave。
 * 用于「只在窗口范围内的 TGS 贴纸才播放」的门控。
 */
export function onVisibilityChange(
  el: Element | null | undefined,
  enter: () => void,
  leave: () => void,
) {
  if (!el) return;
  if (observers.has(el)) {
    const e = observers.get(el)!;
    e.enter = enter;
    e.leave = leave;
    if (e.visible) enter();
    return;
  }
  observers.set(el, { enter, leave, visible: false });
  getObserver().observe(el);
}

export function unobserve(el: Element | null | undefined) {
  if (!el) return;
  if (sharedObserver) sharedObserver.unobserve(el);
  observers.delete(el);
}

/**
 * —— 程序化跳转滚动期间，抑制「沿途路过」的项立即发起下载 ——
 *
 * 场景：点击顶部选择器，内容区用 `behavior:'smooth'` 平滑滚动到目标区块。
 * 平滑滚动的动画会让视口（含 400px rootMargin 缓冲）沿途扫过中间区块，
 * 若沿途的 `StickerMediaItem` 在 enter 时立即 `media.download()`，会把一路
 * 路过的 emoji 全部拉取/下载（开销浪费）。这里用一个共享标志：跳转开始置 true，
 * 结束后置 false 并统一 flush 那些「当时在可视区但被抑制」的项。
 */

let programmaticScroll = false;
/** 等待跳转结束后补下载的项（进入可视区但被抑制） */
const pendingLoads = new Set<() => void>();

/** True while the user is actively scrolling fast (wheel / drag). */
let userScrolling = false;

/** Flush items that were suppressed during scrolling, on the next frame. */
function flushPendingLoads() {
  requestAnimationFrame(() => {
    const pending = Array.from(pendingLoads);
    pendingLoads.clear();
    pending.forEach((fn) => fn());
  });
}

/** 是否正处于程序化跳转（平滑滚动）中 */
export function isProgrammaticScroll() {
  return programmaticScroll;
}

/**
 * 设置程序化跳转状态。
 * @param v true = 跳转中（抑制沿途下载）；false = 结束（flush 被抑制的可视项）
 */
export function setProgrammaticScroll(v: boolean) {
  programmaticScroll = v;
  if (!v) {
    // Flush suppressed loads after a programmatic jump completes.
    flushPendingLoads();
  }
}

/**
 * 在程序化跳转中注册一个「待跳转结束后补执行」的回调。
 * 若跳转结束（setProgrammaticScroll(false)）后仍处于可视区，会执行 fn；
 * 用于 StickerMediaItem 的「途中不下载、落地再下载」。
 */
export function deferLoadWhileScrolling(fn: () => void) {
  pendingLoads.add(fn);
}

/** True while the user is actively scrolling fast (wheel / drag). */
export function isUserScrolling() {
  return userScrolling;
}

/**
 * Mark the beginning of a user-driven fast scroll. Items entering the
 * visible area while this is true defer their download until the scroll
 * pauses (see endUserScroll).
 */
export function beginUserScroll() {
  userScrolling = true;
}

/**
 * End a user-driven fast scroll. Suppressed loads are flushed once the
 * scroll has stopped for a short pause.
 */
export function endUserScroll() {
  if (!userScrolling) return;
  userScrolling = false;
  flushPendingLoads();
}

/**
 * —— 窗口激活状态（聚焦且未隐藏）——
 *
 * 用于「离开窗口时暂停动画节省性能」：贴纸/emoji 面板里 TGS(rlottie)、GIF/webm/mp4(video)
 * 只在窗口获得焦点且可见时播放；窗口 blur 或被隐藏（visibilitychange）时全局暂停，
 * 聚焦/回到窗口后统一恢复仍在可视区的项。
 *
 * 这里用**单个全局监听**（模块级只挂一次 focus/blur/visibilitychange），
 * 避免成百上千个 StickerMediaItem 各挂 window 监听导致内存与注册开销。
 */

let windowActive = true;
/** 是否已安装全局监听（只挂一次） */
let windowWatcherInstalled = false;
/** 窗口激活状态变化的订阅者（StickerMediaItem 用来同步暂停/恢复） */
const windowActiveListeners = new Set<() => void>();

function notifyWindowActive() {
  windowActiveListeners.forEach((fn) => fn());
}

function onWinFocus() {
  windowActive = true;
  notifyWindowActive();
}
function onWinBlur() {
  windowActive = false;
  notifyWindowActive();
}
function onWinVisibilityChange() {
  windowActive = !document.hidden;
  notifyWindowActive();
}

function ensureWindowWatcher() {
  if (windowWatcherInstalled) return;
  windowWatcherInstalled = true;
  window.addEventListener('focus', onWinFocus);
  window.addEventListener('blur', onWinBlur);
  document.addEventListener('visibilitychange', onWinVisibilityChange);
}

/** 窗口当前是否激活（聚焦且未隐藏） */
export function isWindowActive() {
  return windowActive;
}

/**
 * 订阅窗口激活状态变化；返回取消函数。首次调用会安装全局监听。
 * 用于 StickerMediaItem 在窗口失去焦点/隐藏时暂停，恢复时继续。
 */
export function onWindowActiveChange(fn: () => void): () => void {
  ensureWindowWatcher();
  windowActiveListeners.add(fn);
  return () => windowActiveListeners.delete(fn);
}

/**
 * 组件级封装：元素 ref 进入视口后触发一次 load；组件卸载时解除观察。
 */
export function useVisibleOnce(elRef: Ref<HTMLElement | null>, load: () => void) {
  let started = false;
  function start() {
    if (started) return;
    started = true;
    const el = elRef.value;
    if (el) onVisibleOnce(el, load);
    else load(); // 元素尚未渲染则直接加载（兜底）
  }
  onUnmounted(() => {
    unobserve(elRef.value);
  });
  return { start };
}

/**
 * 清理：当抽屉整体隐藏/卸载时可调用，避免残留观察项。
 */
export function clearSharedObserver() {
  if (sharedObserver) {
    sharedObserver.disconnect();
    sharedObserver = null;
  }
  observers.clear();
}
