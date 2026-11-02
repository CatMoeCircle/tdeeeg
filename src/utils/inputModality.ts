/**
 * 输入模态与触控长按判定。
 *
 * 触控长按与鼠标右键都会派发 `contextmenu`，但语义完全不同：前者是
 * 「选中文本」手势，后者才是「打开菜单」。WebView2 / Chromium 各版本对
 * contextmenu 的字段支持不一致（有的带 `pointerType`，有的只带
 * `sourceCapabilities.firesTouchEvents`），因此这里优先读事件自身字段，
 * 再结合最近一次 pointerdown 的输入类型与时间窗兜底。
 */

/** 触控长按到 contextmenu 之间允许的最大间隔（ms）：超过则不再算同一次长按 */
const TOUCH_LONG_PRESS_WINDOW_MS = 2000;

/** 最近一次 pointerdown 的输入类型（mouse / touch / pen） */
let lastPointerDownType = 'mouse';
/** 最近一次 pointerdown 的时间戳（与 contextmenu 共用页面时间轴） */
let lastPointerDownAt = 0;
let tracking = false;

/** 记录指针输入类型：首次使用时安装，捕获阶段先于业务逻辑执行 */
function ensureTracking() {
    if (tracking || typeof window === 'undefined') return;
    tracking = true;
    window.addEventListener(
        'pointerdown',
        (e) => {
            lastPointerDownType = e.pointerType || 'mouse';
            lastPointerDownAt = e.timeStamp;
        },
        { capture: true, passive: true },
    );
}

/**
 * 该事件是否由触控长按产生（鼠标右键恒为 false）。
 */
export function isTouchLongPress(e: Event): boolean {
    ensureTracking();
    const pe = e as PointerEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } | null };
    if (pe.pointerType === 'touch') return true;
    if (pe.sourceCapabilities?.firesTouchEvents) return true;
    if (lastPointerDownType !== 'touch') return false;
    return e.timeStamp - lastPointerDownAt <= TOUCH_LONG_PRESS_WINDOW_MS;
}

/**
 * 该 contextmenu 是否是「触控长按可选中正文」。
 *
 * 命中时调用方不应打开任何菜单：消息右键菜单会浮在选区之上，把「长按选词」
 * 变成「长按弹菜单」，选区与手柄被盖住后无法继续调整。
 */
export function isTouchTextSelection(e: Event): boolean {
    if (!isTouchLongPress(e)) return false;
    const target = e.target as HTMLElement | null;
    return !!target?.closest?.('.msg-selectable-text');
}
