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
