/**
 * 视口锁：列表内容变化时保持视口稳定，但绝不干扰用户滚动。
 *
 * 契约（用户可见行为）：
 *   补偿只抵消「锚点上方的高度变化」，用户自己的滚动一律保留。
 *
 * 两层保障，缺一不可：
 *
 * 1. **同帧锁**（withViewportLock）
 *    DOM 变更与补偿必须落在同一次绘制之前。
 *    若中间夹了 rAF，浏览器会先画出「内容位移」的中间态再补偿——这就是闪跳。
 *
 * 2. **持续补偿**（holdViewport）
 *    插入之后高度仍可能变（content-visibility 估算→真实高度、图片撑开等）。
 *    用 ResizeObserver 在布局后、绘制前补偿；高度怎么变，视口都不动。
 *
 * 补偿方式是**增量式**的：锚点消息的内容坐标（docTop = 视口内相对位置 + scrollTop）
 * 变化多少，scrollTop 就加多少。内容坐标对纯滚动不变，因此用户的滚动永远不会
 * 被回写撤销。早先的「屏幕绝对钉扎」按「原始 scrollTop + 插入高度」回写，
 * 会把用户滚动每帧抵消——表现为到顶加载时滚不动、hold 释放后又猛拽（回弹）。
 *
 * 滚动锚定（scroll anchoring）分工：
 *   - 平时交给浏览器原生 scroll anchoring（content-visibility 高度抖动、
 *     图片撑开等由它补偿）；
 *   - 手动补偿进行中（beginManualAnchor → endManualAnchor）临时关闭原生锚定，
 *     避免双方叠加造成二次位移。
 *   不再要求容器常驻 `overflow-anchor: none`。
 */

export interface ViewportAnchor {
    /** 视口顶附近消息 id（0 表示退回 scrollTop） */
    msgId: number;
    /** 消息 top 相对容器 top 的偏移 */
    offsetTop: number;
    /** 兜底：无消息锚点时的 scrollTop */
    scrollTop: number;
}

/** 在容器内找最接近视口顶的消息，作为布局锚点 */
export function captureViewportAnchor(el: HTMLElement): ViewportAnchor {
    const refTop = el.getBoundingClientRect().top;
    let bestId = 0;
    let bestOffset = 0;
    let bestDist = Infinity;
    for (const node of el.querySelectorAll<HTMLElement>('[data-msg-id]')) {
        const msgId = Number(node.dataset.msgId || '0');
        if (msgId <= 0) continue;
        const top = node.getBoundingClientRect().top;
        const dist = Math.abs(top - refTop);
        if (dist < bestDist) {
            bestDist = dist;
            bestId = msgId;
            bestOffset = top - refTop;
        }
    }
    return { msgId: bestId, offsetTop: bestOffset, scrollTop: el.scrollTop };
}

/** 把锚点消息重新对齐到捕获时相对容器顶的偏移；无锚点则恢复 scrollTop */
export function restoreViewportAnchor(el: HTMLElement, anchor: ViewportAnchor): void {
    if (anchor.msgId > 0) {
        const msgEl = el.querySelector<HTMLElement>(`[data-msg-id="${anchor.msgId}"]`);
        if (msgEl) {
            const refTop = el.getBoundingClientRect().top;
            const msgTop = msgEl.getBoundingClientRect().top;
            const delta = msgTop - refTop;
            const desired = el.scrollTop + delta - anchor.offsetTop;
            const max = Math.max(0, el.scrollHeight - el.clientHeight);
            el.scrollTop = Math.max(0, Math.min(Math.round(desired), max));
            return;
        }
    }
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.max(0, Math.min(anchor.scrollTop, max));
}

// ==================== 增量布局补偿 ====================

interface LayoutCompState {
    /** 视口顶附近的消息 id */
    msgId: number;
    /** 上次补偿后该消息的内容坐标 top（视口内相对位置 + scrollTop） */
    docTop: number;
}

const compStates = new WeakMap<HTMLElement, LayoutCompState>();

/** 测量锚点消息的内容坐标 top；节点不在 DOM 时返回 null */
function measureDocTop(el: HTMLElement, msgId: number): number | null {
    const node = el.querySelector<HTMLElement>(`[data-msg-id="${msgId}"]`);
    if (!node) return null;
    return node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
}

/**
 * 准备补偿状态（必须在 DOM 变更前调用）。已有有效状态则复用
 * （hold 与 withViewportLock 共享同一份，避免重复补偿）。
 * 返回是否就绪（容器内没有消息时为 false，此时应交给原生锚定）。
 */
export function beginLayoutCompensation(el: HTMLElement | null | undefined): boolean {
    if (!el) return false;
    const s = compStates.get(el);
    if (s) {
        if (measureDocTop(el, s.msgId) != null) return true;
        compStates.delete(el);
    }
    const anchor = captureViewportAnchor(el);
    if (anchor.msgId <= 0) return false;
    const docTop = measureDocTop(el, anchor.msgId);
    if (docTop == null) return false;
    compStates.set(el, { msgId: anchor.msgId, docTop });
    return true;
}

/**
 * 补偿锚点上方的布局位移（插入为正、裁剪为负），保留用户滚动。
 * 在 DOM 变更 + 渲染完成（nextTick）后调用。
 */
export function compensateLayoutShift(el: HTMLElement | null | undefined): void {
    if (!el || !el.isConnected) return;
    const s = compStates.get(el);
    if (!s) return;
    const cur = measureDocTop(el, s.msgId);
    if (cur == null) {
        // 锚点消息被移除（如窗口裁剪）：重建状态，本次位移放弃补偿
        compStates.delete(el);
        beginLayoutCompensation(el);
        return;
    }
    const delta = cur - s.docTop;
    if (Math.abs(delta) > 0.5) {
        el.scrollTop = Math.max(0, el.scrollTop + delta);
        // 写入后重新测量校准（scrollTop 可能被 clamp 截断）
        s.docTop = measureDocTop(el, s.msgId) ?? cur;
    }
    // 未达阈值时不更新 docTop，让微小位移累积到阈值再补
}

// ==================== 原生锚定开关 ====================

const manualAnchorDepth = new WeakMap<HTMLElement, number>();

/** 手动补偿开始：临时关闭原生 scroll anchoring（可嵌套） */
export function beginManualAnchor(el: HTMLElement): void {
    const d = (manualAnchorDepth.get(el) || 0) + 1;
    manualAnchorDepth.set(el, d);
    if (d === 1) el.style.overflowAnchor = 'none';
}

/** 手动补偿结束：嵌套归零时恢复原生 scroll anchoring */
export function endManualAnchor(el: HTMLElement): void {
    const d = (manualAnchorDepth.get(el) || 1) - 1;
    if (d <= 0) {
        manualAnchorDepth.delete(el);
        el.style.overflowAnchor = '';
    } else {
        manualAnchorDepth.set(el, d);
    }
}

// ==================== 同帧锁 ====================

/**
 * 在视口锁内执行会改动列表 DOM 的操作。
 * fn 改完状态即可；本函数 nextTick 后同步补偿，保证「变更 + 补偿」同帧。
 */
export async function withViewportLock<T>(
    el: HTMLElement | null | undefined,
    fn: () => T | Promise<T>,
    nextTick: () => Promise<void> | void,
): Promise<T> {
    if (!el) return await fn();
    beginManualAnchor(el);
    try {
        const anchor = captureViewportAnchor(el);
        const ready = beginLayoutCompensation(el);
        try {
            return await fn();
        } finally {
            await nextTick();
            if (el.isConnected) {
                // 优先增量补偿（保留用户滚动）；无消息锚点时退回屏幕钉扎兜底
                if (ready) compensateLayoutShift(el);
                else restoreViewportAnchor(el, anchor);
            }
        }
    } finally {
        endManualAnchor(el);
    }
}

// ==================== 持续补偿（hold） ====================

export interface ViewportHold {
    /**
     * 释放：连续 stableFrames 帧高度不再变化后自动解除；
     * 或调用 release() 立即解除。
     */
    releaseAfterStable(stableFrames?: number): void;
    /** 立即解除补偿 */
    release(): void;
}

/**
 * 持续补偿视口：从调用起，列表高度/子项尺寸一变就立刻把锚点位移补掉
 * （RO 在绘制前触发）。加载历史、分批揭示期间持有；结束后 releaseAfterStable。
 *
 * 不再因用户滚动而解除——增量补偿与用户滚动互不干扰，
 * 加载窗口内用户继续滚动时补偿仍然有效。
 */
export function holdViewport(el: HTMLElement | null | undefined): ViewportHold {
    if (!el) {
        return { releaseAfterStable() { }, release() { } };
    }

    beginManualAnchor(el);
    beginLayoutCompensation(el);

    let released = false;
    let rafId = 0;
    let lastScrollHeight = el.scrollHeight;
    let stableCount = 0;
    let stableTarget = 0;
    const listEl: Element | null = el.firstElementChild;

    const doRestore = () => {
        if (released || !el.isConnected) return;
        compensateLayoutShift(el);
    };

    // 监听滚动内容根（消息列表容器）的尺寸：子项增高/估算回流都会改变它
    const ro = new ResizeObserver(() => {
        if (released) return;
        doRestore();
        lastScrollHeight = el.scrollHeight;
        stableCount = 0;
    });
    if (listEl) ro.observe(listEl);
    ro.observe(el);

    const tick = () => {
        if (released) return;
        const h = el.scrollHeight;
        if (Math.abs(h - lastScrollHeight) > 0.5) {
            lastScrollHeight = h;
            stableCount = 0;
            doRestore();
        } else if (stableTarget > 0) {
            stableCount++;
            if (stableCount >= stableTarget) {
                hold.release();
                return;
            }
        }
        rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const hold: ViewportHold = {
        releaseAfterStable(stableFrames = 3) {
            stableTarget = stableFrames;
            stableCount = 0;
        },
        release() {
            if (released) return;
            released = true;
            cancelAnimationFrame(rafId);
            ro.disconnect();
            compStates.delete(el);
            endManualAnchor(el);
        },
    };
    return hold;
}
