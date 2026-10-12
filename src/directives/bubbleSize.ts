import type { Directive } from "vue";

/**
 * 气泡尺寸变化动画：v-bubble-size
 *
 * 消息内容变化（编辑、图片加载、回应/回复出现等）导致气泡宽高改变时，
 * 用 WAAPI 从旧尺寸过渡到新尺寸，而不是瞬间跳变。
 */
const DURATION = 200;
const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

interface State {
    ro: ResizeObserver;
    w: number;
    h: number;
    anim?: Animation;
}

const states = new WeakMap<HTMLElement, State>();

function onResize(el: HTMLElement, st: State) {
    // 动画期间的回声（我们自己改了尺寸）直接忽略
    if (st.anim) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const from = { w: st.w, h: st.h };
    st.w = w;
    st.h = h;
    // 首次观察或尺寸未变（含动画结束后的回落）不播动画
    if (!from.w || !from.h || (from.w === w && from.h === h)) return;

    // ponytail: 动画用 width/height（触发布局），气泡内容少时可接受；
    // 动画中途的真实变化会等本轮动画结束后再回落同步，不做打断重启。
    el.style.overflow = "hidden";
    st.anim = el.animate(
        [
            { width: `${from.w}px`, height: `${from.h}px` },
            { width: `${w}px`, height: `${h}px` },
        ],
        { duration: DURATION, easing: EASING }
    );
    const done = () => {
        st.anim = undefined;
        el.style.overflow = "";
    };
    st.anim.onfinish = done;
    st.anim.oncancel = done;
}

export const vBubbleSize: Directive<HTMLElement> = {
    mounted(el) {
        if (typeof ResizeObserver === "undefined" || typeof el.animate !== "function") return;
        const st: State = {
            ro: new ResizeObserver(() => onResize(el, st)),
            w: el.offsetWidth,
            h: el.offsetHeight,
        };
        states.set(el, st);
        st.ro.observe(el);
    },
    unmounted(el) {
        const st = states.get(el);
        if (!st) return;
        st.ro.disconnect();
        st.anim?.cancel();
        states.delete(el);
    },
};

export default vBubbleSize;
