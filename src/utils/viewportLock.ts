/**
 * 视口锁：加载/插入时保持「当前屏」绝对不动。
 *
 * 契约（用户可见行为）：
 *   保持原位置和滚动 → 插入内容 → 高度变化不得挪动当前屏。
 *
 * 两层保障，缺一不可：
 *
 * 1. **同帧锁**（withViewportLock）
 *    DOM 变更与锚点恢复必须落在同一次绘制之前。
 *    若中间夹了 rAF，浏览器会先画出「内容位移」的中间态再拉回 —— 这就是闪跳。
 *
 * 2. **持续钉扎**（holdViewport）
 *    插入之后高度仍可能变（content-visibility 估算→真实高度、图片撑开等）。
 *    用 ResizeObserver 在布局后、绘制前把锚点拉回去；高度怎么变，视口都不动。
 *
 * 不用 scrollHeight 增量（delta 法）：content-visibility 下 scrollHeight 含估算值会漂。
 * 锚点法只依赖视口内真实布局。
 *
 * 滚动容器必须 `overflow-anchor: none`：浏览器 scroll-anchoring 与手动恢复会二次位移。
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

/**
 * 在视口锁内执行会改动列表 DOM 的操作。
 * fn 改完状态即可；本函数 nextTick 后同步恢复，保证「变更 + 恢复」同帧。
 */
export async function withViewportLock<T>(
    el: HTMLElement | null | undefined,
    fn: () => T | Promise<T>,
    nextTick: () => Promise<void> | void,
): Promise<T> {
    if (!el) return await fn();
    const anchor = captureViewportAnchor(el);
    try {
        return await fn();
    } finally {
        await nextTick();
        if (el.isConnected) restoreViewportAnchor(el, anchor);
    }
}

export interface ViewportHold {
    /** 手动再对齐一次（可选，通常 RO 已足够） */
    restore(): void;
    /**
     * 释放：连续 stableFrames 帧高度不再变化后自动解除；
     * 或调用 release() 立即解除。
     */
    releaseAfterStable(stableFrames?: number): void;
    /** 立即解除钉扎 */
    release(): void;
}

/**
 * 持续钉住视口：从调用起，列表高度/子项尺寸一变就立刻把锚点拉回（RO 在绘制前触发）。
 * 加载历史、分批揭示期间持有；结束后 releaseAfterStable。
 *
 * 用户主动滚动（滚轮/触控/拖拽滚动条）会立刻解除钉扎，避免和用户抢滚动条。
 */
export function holdViewport(el: HTMLElement | null | undefined): ViewportHold {
    if (!el) {
        return { restore() { }, releaseAfterStable() { }, release() { } };
    }

    let anchor = captureViewportAnchor(el);
    let released = false;
    let rafId = 0;
    let lastScrollHeight = el.scrollHeight;
    let stableCount = 0;
    let stableTarget = 0;
    let listEl: Element | null = el.firstElementChild;
    let lastScrollTop = el.scrollTop;

    const doRestore = () => {
        if (released || !el.isConnected) return;
        restoreViewportAnchor(el, anchor);
        lastScrollTop = el.scrollTop;
    };

    // 用户主动滚动 → 解除，不与用户抢位置
    const onUserIntent = () => {
        hold.release();
    };
    const onScroll = () => {
        if (released) return;
        // scrollTop 变化且不是我们 restore 写的（restore 会同步 lastScrollTop）
        if (Math.abs(el.scrollTop - lastScrollTop) > 1) {
            hold.release();
        }
    };
    el.addEventListener('wheel', onUserIntent, { passive: true });
    el.addEventListener('touchstart', onUserIntent, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });

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
        restore() {
            if (released) return;
            anchor = captureViewportAnchor(el);
            doRestore();
        },
        releaseAfterStable(stableFrames = 3) {
            stableTarget = stableFrames;
            stableCount = 0;
        },
        release() {
            if (released) return;
            released = true;
            cancelAnimationFrame(rafId);
            ro.disconnect();
            el.removeEventListener('wheel', onUserIntent);
            el.removeEventListener('touchstart', onUserIntent);
            el.removeEventListener('scroll', onScroll);
        },
    };
    return hold;
}
