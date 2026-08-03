import { ref } from "vue";
import type { message, MessageSender } from "tdlib-types";

/**
 * 「删除消息」确认弹窗的全局状态。
 * 参照 externalLink.ts 的 Promise 模式：调用方 confirmDeleteMessage 传入待删消息，
 * 由挂载在合适处的 DeleteMessageConfirm.vue 监听 visible 渲染；
 * 用户选择操作后通过 resolve 回传结果，取消则 reject。
 */

/** 删除确认结果 */
export interface DeleteMessageResult {
    /** 是否删除当前消息 */
    deleteMessage: boolean;
    /** 是否同时删除该发送者的所有消息 */
    deleteAllFromSender: boolean;
    /** 是否同时封禁该发送者 */
    banSender: boolean;
}

/** 当前待删除消息 */
export interface DeleteMessageRequest {
    /** 源对话 id */
    chatId: number;
    /** 待删除的消息 */
    msg: message;
    /** 发送者 id（可能为空，如频道帖子无发送者） */
    senderId?: MessageSender;
    /** 发送者显示名（用于弹窗文案） */
    senderName?: string;
    /** 是否可删除发送者的所有消息（超级群组 + 管理员权限） */
    canDeleteAllFromSender: boolean;
    /** 是否可封禁发送者（群组 + 管理员权限） */
    canBanSender: boolean;
    /** 是否可删除当前消息 */
    canDeleteMessage: boolean;
}

export const visible = ref(false);
export const request = ref<DeleteMessageRequest | null>(null);

let onResolve: ((r: DeleteMessageResult) => void) | null = null;
let onReject: ((reason?: unknown) => void) | null = null;

/**
 * 弹出「删除消息」确认框。
 * 用户确认/选择选项后 resolve；取消则 reject（reason = new Error("canceled")）。
 */
export function confirmDeleteMessage(req: DeleteMessageRequest): Promise<DeleteMessageResult> {
    return new Promise<DeleteMessageResult>((resolve, reject) => {
        request.value = { ...req };
        visible.value = true;
        onResolve = resolve;
        onReject = reject;
    });
}

/** 用户在弹窗中确认（携带选中的操作） */
export function confirmDelete(result: DeleteMessageResult) {
    visible.value = false;
    onResolve?.(result);
    onResolve = null;
    onReject = null;
    request.value = null;
}

/** 关闭弹窗（取消）：reject */
export function cancelDelete() {
    const reject = onReject;
    visible.value = false;
    onResolve = null;
    onReject = null;
    request.value = null;
    reject?.(new Error("canceled"));
}
