import { ref } from "vue";

/**
 * 「打开外部链接」确认弹窗的全局状态。
 * openExternalLink.ts 调用 confirmExternalLink 设置 url 并返回 Promise，
 * 由挂载在 App.vue 的 ExternalLinkConfirm.vue 监听 visible 渲染，结果通过 resolve/reject 回传。
 */

/** 当前待确认的外部链接 */
export const pendingUrl = ref<string>("");
/** 弹窗是否可见 */
export const visible = ref(false);

/** 当前请求的 resolve/reject，仅在弹窗开启期间有效 */
let onResolve: (() => void) | null = null;
let onReject: ((reason?: unknown) => void) | null = null;

/**
 * 弹出「打开外部链接」确认框。
 * 用户确认后 resolve；取消/关闭则 reject（调用方据此停止后续逻辑）。
 * @param url 要打开的外部链接
 */
export function confirmExternalLink(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        pendingUrl.value = url;
        visible.value = true;
        onResolve = resolve;
        onReject = reject;
    });
}

/** 用户在弹窗中点击「打开」：关闭并 resolve */
export function confirmOpenLink() {
    visible.value = false;
    onResolve?.();
    onResolve = null;
    onReject = null;
    pendingUrl.value = "";
}

/** 关闭弹窗（取消/遮罩/Esc）：reject */
export function cancelExternalLink() {
    visible.value = false;
    onReject?.(new Error("canceled"));
    onReject = null;
    onResolve = null;
    pendingUrl.value = "";
}
