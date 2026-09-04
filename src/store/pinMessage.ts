import { ref } from "vue";
import type { message } from "tdlib-types";

/**
 * 「置顶」确认弹窗的全局状态。
 * 参照 deleteMessage.ts 的 Promise 模式：调用方 confirmPinMessage 传入待置顶消息
 * 与会话类型，由挂载在 ChatDetail 的 PinMessageConfirm.vue 监听 visible 渲染；
 * 用户选择选项后通过 resolve 回传结果，取消则 reject。
 */

/** 置顶确认结果 */
export interface PinMessageResult {
    /** 私聊：是否同时为对方置顶 */
    pinForOther: boolean;
    /** 群组：是否通知群成员 */
    notifyMembers: boolean;
}

/** 当前待置顶消息 */
export interface PinMessageRequest {
    /** 源对话 id */
    chatId: number;
    /** 待置顶的消息 */
    msg: message;
    /** 弹窗展示哪种选项（私聊 / 群组） */
    scope: 'private' | 'group';
}

export const visible = ref(false);
export const request = ref<PinMessageRequest | null>(null);

let onResolve: ((r: PinMessageResult) => void) | null = null;
let onReject: ((reason?: unknown) => void) | null = null;

/**
 * 弹出「置顶」确认框。
 * 用户确认后 resolve；取消则 reject（reason = new Error("canceled")）。
 */
export function confirmPinMessage(req: PinMessageRequest): Promise<PinMessageResult> {
    return new Promise<PinMessageResult>((resolve, reject) => {
        request.value = { ...req };
        visible.value = true;
        onResolve = resolve;
        onReject = reject;
    });
}

/** 用户在弹窗中确认（携带选中的选项） */
export function confirmPin(result: PinMessageResult) {
    visible.value = false;
    onResolve?.(result);
    onResolve = null;
    onReject = null;
    request.value = null;
}

/** 关闭弹窗（取消）：reject */
export function cancelPin() {
    const reject = onReject;
    visible.value = false;
    onResolve = null;
    onReject = null;
    request.value = null;
    reject?.(new Error("canceled"));
}
