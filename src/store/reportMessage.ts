import { ref } from "vue";
import type { message } from "tdlib-types";

/**
 * 「举报消息」弹窗的全局状态。
 * 参照 pinMessage.ts 的 Promise 模式：调用方 confirmReportMessage 传入待举报消息，
 * 由挂载在 ChatDetail 的 ReportMessageConfirm.vue 监听 visible 渲染；
 * 用户选择原因后通过 resolve 回传结果，取消则 reject。
 */

/** 举报确认结果 */
export interface ReportMessageResult {
    /** 用户选择的举报原因 option_id */
    optionId: string;
    /** 用户补充的举报说明（可选） */
    comment: string;
}

/** 当前待举报消息 */
export interface ReportMessageRequest {
    /** 源对话 id */
    chatId: number;
    /** 待举报的消息 */
    msg: message;
}

export const visible = ref(false);
export const request = ref<ReportMessageRequest | null>(null);

let onResolve: ((r: ReportMessageResult) => void) | null = null;
let onReject: ((reason?: unknown) => void) | null = null;

/**
 * 弹出「举报消息」确认框。
 * 用户确认后 resolve；取消则 reject（reason = new Error("canceled")）。
 */
export function confirmReportMessage(req: ReportMessageRequest): Promise<ReportMessageResult> {
    return new Promise<ReportMessageResult>((resolve, reject) => {
        request.value = { ...req };
        visible.value = true;
        onResolve = resolve;
        onReject = reject;
    });
}

/** 用户在弹窗中确认（携带选中的原因） */
export function confirmReport(result: ReportMessageResult) {
    visible.value = false;
    onResolve?.(result);
    onResolve = null;
    onReject = null;
    request.value = null;
}

/** 关闭弹窗（取消）：reject */
export function cancelReport() {
    const reject = onReject;
    visible.value = false;
    onResolve = null;
    onReject = null;
    request.value = null;
    reject?.(new Error("canceled"));
}
