import { ref } from 'vue';

/**
 * 消息列表是否处于“用户正在滚动/触摸”状态。
 *
 * 历史揭示会读取它：滚动期间不向 DOM 挂历史行，停稳后再挂，
 * 避免揭示的布局/解码和滚动抢同一帧。
 *
 * 用模块级 ref + 定时器而不是组件内时间戳：揭示历史、懒挂载本身可能产生
 * 100ms 级长任务，用时间差判断会被长任务拖过阈值，导致滚动中继续加载媒体。
 */
export const messageScrollActive = ref(false);

let holdTimer: number | null = null;

/** 标记一次用户滚动/触摸，并在最后一次交互 220ms 后自动解除 */
export function markMessageScrollActive() {
    messageScrollActive.value = true;
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
        holdTimer = null;
        messageScrollActive.value = false;
    }, 400);
}
