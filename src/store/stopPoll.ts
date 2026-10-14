import { ref } from "vue";
import type { message } from "tdlib-types";

/**
 * 「停止投票」确认弹窗的全局状态。
 * 参照 pinMessage.ts 的 Promise 模式：调用方 confirmStopPoll 传入待停止的投票消息，
 * 由挂载在 ChatDetail 的 StopPollConfirm.vue 监听 visible 渲染；
 * 用户确认则 resolve，取消则 reject。
 */

/** 当前待停止的投票消息 */
export interface StopPollRequest {
    /** 源对话 id */
    chatId: number;
    /** 待停止的投票消息 */
    msg: message;
}

export const visible = ref(false);
export const request = ref<StopPollRequest | null>(null);

let onResolve: (() => void) | null = null;
let onReject: ((reason?: unknown) => void) | null = null;

/**
 * 弹出「停止投票」确认框。
 * 用户确认后 resolve；取消则 reject（reason = new Error("canceled")）。
 */
export function confirmStopPoll(req: StopPollRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        request.value = { ...req };
        visible.value = true;
        onResolve = resolve;
        onReject = reject;
    });
}

/** 用户在弹窗中确认 */
export function confirmStop() {
    const resolve = onResolve;
    visible.value = false;
    onResolve = null;
    onReject = null;
    request.value = null;
    resolve?.();
}

/** 关闭弹窗（取消）：reject */
export function cancelStop() {
    const reject = onReject;
    visible.value = false;
    onResolve = null;
    onReject = null;
    request.value = null;
    reject?.(new Error("canceled"));
}
