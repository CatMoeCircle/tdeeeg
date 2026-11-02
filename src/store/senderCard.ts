import { ref, shallowRef } from "vue";
import type { MessageSender } from "tdlib-types";

/**
 * 对话内「消息头像资料小卡片」的全局单例状态。
 *
 * 由对话详情（ChatDetail）消息列表里的头像右键触发，ChatSenderCard.vue 监听状态渲染。
 * 卡片内容按消息发送者（messageSenderUser / messageSenderChat）而不是对话：群里每条消息
 * 的头像对应各自的发送者，私聊则对应对方。
 *
 * 约定与 store/contextMenu 一致：x 为卡片左缘、y 为卡片顶部（视口坐标），
 * 卡片自身负责视口内夹紧。
 */
export const visible = ref(false);
export const x = ref(0);
export const y = ref(0);
/** 当前卡片对应的发送者（null 表示无） */
export const sender = shallowRef<MessageSender | null>(null);
/** 触发元素（头像按钮），用于点外部判断与焦点回落 */
export const target = shallowRef<HTMLElement | null>(null);

/** 防抖关闭定时器：让点击卡片的 mousedown 先冒泡完，避免卡片刚弹出就被关掉 */
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/** 打开小卡片 */
export function openSenderCard(
    posX: number,
    posY: number,
    senderId: MessageSender,
    el: HTMLElement | null = null,
) {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
    x.value = posX;
    y.value = posY;
    sender.value = senderId;
    target.value = el;
    visible.value = true;
}

/** 关闭小卡片 */
export function closeSenderCard() {
    visible.value = false;
    target.value = null;
    sender.value = null;
}

/** 延迟关闭（点击外部时先让点击事件走完） */
export function closeSenderCardDelayed(delay = 90) {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
        closeSenderCard();
        closeTimer = null;
    }, delay);
}
