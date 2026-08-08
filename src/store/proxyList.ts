import { ref } from "vue";
import type { addedProxy, ProxyType$Input } from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";

/**
 * 已添加的代理列表（来自 TDLib getProxies）。
 * ProxySettings.vue 展示该列表；添加/删除/启用代理后调用 refreshProxies 同步。
 *
 * 注意：TDLib 不会为代理推送 update 事件，因此列表更新需要主动调用 getProxies 刷新。
 */
export const proxies = ref<addedProxy[]>([]);

/** 是否正在加载代理列表 */
export const proxiesLoading = ref(false);

/** 最近一次加载失败的错误信息（无错误则为 null） */
export const proxiesError = ref<string | null>(null);

/** 从 TDLib 拉取代理列表并更新响应式状态。 */
export async function refreshProxies(): Promise<void> {
    proxiesLoading.value = true;
    proxiesError.value = null;
    try {
        const res = await tdlibSend({ _: "getProxies" });
        proxies.value = res.proxies ?? [];
    } catch (e: any) {
        proxiesError.value = e?.message || "获取代理列表失败";
        console.error("Failed to load proxies:", e);
    } finally {
        proxiesLoading.value = false;
    }
}

/** 启用指定代理，并刷新列表。 */
export async function enableProxyById(id: number): Promise<void> {
    await tdlibSend({ _: "enableProxy", proxy_id: id });
    await refreshProxies();
}

/** 禁用当前启用的代理，并刷新列表。 */
export async function disableActiveProxy(): Promise<void> {
    await tdlibSend({ _: "disableProxy" });
    await refreshProxies();
}

/** 删除指定代理，并刷新列表。 */
export async function removeProxyById(id: number): Promise<void> {
    await tdlibSend({ _: "removeProxy", proxy_id: id });
    await refreshProxies();
}

/** 添加一个代理到列表。返回添加结果（含 id）。 */
export async function addProxyTo(
    input: {
        server: string;
        port: number;
        type: ProxyType$Input;
        enable?: boolean;
        comment?: string;
    }
): Promise<addedProxy> {
    const res = await tdlibSend({
        _: "addProxy",
        proxy: { _: "proxy", server: input.server, port: input.port, type: input.type },
        enable: input.enable ?? false,
        comment: input.comment ?? "",
    });
    await refreshProxies();
    return res;
}

/**
 * 生成代理分享链接（https://proxy.t.me/...）。
 * 格式与 Telegram 官方一致。
 * @param p 已保存的代理
 * @returns 分享链接，生成失败返回 null
 */
export function proxyShareLink(p: addedProxy): string | null {
    const port = p.proxy.port;
    const type = p.proxy.type;

    switch (type._) {
        case "proxyTypeHttp": {
            const params = new URLSearchParams({ server: p.proxy.server, port: String(port) });
            if (type.username) params.set("user", type.username);
            if (type.password) params.set("pass", type.password);
            return `https://proxy.t.me/http?${params.toString()}`;
        }
        case "proxyTypeSocks5": {
            const params = new URLSearchParams({ server: p.proxy.server, port: String(port) });
            if (type.username) params.set("user", type.username);
            if (type.password) params.set("pass", type.password);
            return `https://proxy.t.me/socks5?${params.toString()}`;
        }
        case "proxyTypeMtproto": {
            const params = new URLSearchParams({ server: p.proxy.server, port: String(port) });
            if (type.secret) params.set("secret", type.secret);
            return `https://proxy.t.me/mtproto?${params.toString()}`;
        }
        default:
            return null;
    }
}
