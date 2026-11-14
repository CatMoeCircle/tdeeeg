import { ref } from "vue";

/**
 * 安全模式确认弹窗的全局状态。
 *
 * 与 `externalLink.ts` 同一套形态：调用方 `await confirmLockdown(...)` 拿到 Promise，
 * 由挂载在 App.vue 的 `LockdownConfirm.vue` 渲染，结果通过 resolve/reject 回传。
 * 所有闸门（会话 / 组件 / Mini App / 文件）共用这一个弹窗，避免每个入口各画一套。
 */

/** 弹窗内容 */
export interface LockdownConfirmRequest {
    /** 标题（已翻译） */
    title: string;
    /** 说明（已翻译） */
    description: string;
    /** 确认按钮文案（已翻译） */
    confirmLabel: string;
}

/** 当前请求 */
export const request = ref<LockdownConfirmRequest | null>(null);
/** 弹窗是否可见 */
export const visible = ref(false);

let onResolve: (() => void) | null = null;
let onReject: ((reason?: unknown) => void) | null = null;

/**
 * 弹出安全模式确认框。
 * 确认 → resolve；取消 / 遮罩 / Esc → reject，调用方据此中止后续动作。
 */
export function confirmLockdown(req: LockdownConfirmRequest): Promise<void> {
    // 同一时刻只允许一个弹窗：旧的按取消处理，避免两个闸门互相挂住
    onReject?.(new Error("superseded"));
    return new Promise<void>((resolve, reject) => {
        request.value = req;
        visible.value = true;
        onResolve = resolve;
        onReject = reject;
    });
}

/** 用户确认：关闭并 resolve */
export function acceptLockdownConfirm(): void {
    visible.value = false;
    const resolve = onResolve;
    onResolve = null;
    onReject = null;
    request.value = null;
    resolve?.();
}

/** 取消（按钮 / 遮罩 / Esc）：关闭并 reject */
export function cancelLockdownConfirm(): void {
    visible.value = false;
    const reject = onReject;
    onResolve = null;
    onReject = null;
    request.value = null;
    reject?.(new Error("canceled"));
}
