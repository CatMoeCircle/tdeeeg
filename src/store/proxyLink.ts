import { ref } from "vue";
import type { proxy, ProxyType$Input } from "tdlib-types";

/**
 * 「从 proxy.t.me 链接添加代理」弹窗的全局状态。
 * 当用户在消息中点击 proxy.t.me 链接时，解析出 proxy 并调用 showProxyLinkDialog，
 * 由挂载在 App.vue 的 ProxyLinkConfirm.vue 监听 visible 渲染。
 */
import { tdlibSend } from "../utils/tdlib";

/** 当前待添加的代理 */
export const pendingProxy = ref<proxy | null>(null);
/** 添加代理弹窗是否可见 */
export const visible = ref(false);

/** 当前请求的 resolve/reject，仅在弹窗开启期间有效 */
let onResolve: ((value: "add" | "cancel") => void) | null = null;

/**
 * 弹出「添加代理」确认框。
 * 用户点击「添加」后 resolve('add')；取消/关闭则 resolve('cancel')。
 * @param proxyInfo 从 proxy.t.me 链接解析出的代理信息
 */
export function showProxyLinkDialog(proxyInfo: proxy): Promise<"add" | "cancel"> {
    return new Promise<"add" | "cancel">((resolve) => {
        pendingProxy.value = proxyInfo;
        pingResult.value = null;
        visible.value = true;
        onResolve = resolve;
    });
}

/** 用户在弹窗中点击「添加」：关闭并 resolve('add') */
export function confirmAddProxy() {
    visible.value = false;
    onResolve?.("add");
    onResolve = null;
    pendingProxy.value = null;
}

/** 关闭弹窗（取消/遮罩/Esc）：resolve('cancel') */
export function cancelAddProxy() {
    visible.value = false;
    onResolve?.("cancel");
    onResolve = null;
    pendingProxy.value = null;
}

// ==================== Ping 测试与 IP 警告 ====================

/** IP 警告确认框是否可见 */
export const pingWarningVisible = ref(false);
/** 当前 ping 请求的 resolve */
let pingWarningResolve: ((confirmed: boolean) => void) | null = null;

/** ping 测试结果：成功时给出延迟文本，失败时给出错误文本 */
export const pingResult = ref<{ ok: boolean; text: string } | null>(null);
/** 是否正在 ping */
export const pingLoading = ref(false);

/**
 * 弹出 IP 暴露警告框。
 * 用户点击「继续」后 resolve(true)；点击「取消」则 resolve(false)。
 */
export function showPingWarning(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        pingWarningVisible.value = true;
        pingWarningResolve = resolve;
    });
}

/** 用户确认继续 ping */
export function confirmPingWarning() {
    pingWarningVisible.value = false;
    pingWarningResolve?.(true);
    pingWarningResolve = null;
}

/** 用户取消 ping */
export function cancelPingWarning() {
    pingWarningVisible.value = false;
    pingWarningResolve?.(false);
    pingWarningResolve = null;
}

/**
 * 对当前代理执行 ping 测试（带 IP 暴露警告）。
 * 先询问用户 warning 警告，确认后才真正发起 pingProxy。
 */
export async function pingCurrentProxy(): Promise<void> {
    const p = pendingProxy.value;
    if (!p || pingLoading.value) return;
    await pingProxyOf(p.server, p.port, p.type);
}

/**
 * 对指定代理执行 ping 测试（带 IP 暴露警告），返回结果。
 * @param server 代理服务器
 * @param port 端口
 * @param type TDLib ProxyType（如 proxyTypeHttp / proxyTypeSocks5 / proxyTypeMtproto）
 */
export async function pingProxyOf(
    server: string,
    port: number,
    type: ProxyType$Input,
): Promise<{ ok: boolean; text: string } | null> {
    if (pingLoading.value) return null;
    // 先弹出 IP 暴露警告
    const confirmed = await showPingWarning();
    if (!confirmed) return null;

    pingLoading.value = true;
    pingResult.value = null;
    try {
        const res = await tdlibSend({
            _: "pingProxy",
            proxy: { _: "proxy", server, port, type },
        });
        const seconds = (res as any).seconds;
        let result: { ok: boolean; text: string };
        if (typeof seconds === "number") {
            result = {
                ok: true,
                text: seconds < 1
                    ? `延迟 ${Math.round(seconds * 1000)}ms`
                    : `延迟 ${seconds.toFixed(2)}s`,
            };
        } else {
            result = { ok: false, text: "无法测量延迟" };
        }
        pingResult.value = result;
        return result;
    } catch (e: any) {
        const result = { ok: false, text: e?.message || "ping 失败" };
        pingResult.value = result;
        return result;
    } finally {
        pingLoading.value = false;
    }
}
