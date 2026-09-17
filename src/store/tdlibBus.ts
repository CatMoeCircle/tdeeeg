/**
 * TDLib 更新总线：前端对每类 IPC 通道只 listen 一次，再分发给 Store。
 *
 * 目标链路：
 *   TDLib → Rust UpdateManager（分类/批处理）→ 少量 Tauri events
 *        → 本总线（单 listener）→ Store handler → Vue 响应式
 *
 * 而不是：
 *   TDLib → 一个 tdlib-update → 所有组件各自 listen() + if 过滤
 *
 * 通道（与 Rust update_manager.rs 对齐）：
 * - tdlib-auth / tdlib-connection / tdlib-option / tdlib-language / tdlib-colors
 * - tdlib-user / tdlib-chat / tdlib-message（50ms 批）
 * - tdlib-other（稀有类型立即）
 * - tdlib-update-file（独立高频通道，不进 UpdateManager）
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** TDLib update（`_` 已由 Rust 从 `@type` 改写） */
export type TdlibUpdate = { _: string } & Record<string, unknown>;

/** 分类通道 */
export type TdlibChannel =
    | "auth"
    | "connection"
    | "option"
    | "language"
    | "colors"
    | "user"
    | "chat"
    | "message"
    | "other"
    | "file";

type Handler = (update: TdlibUpdate) => void;

/** 每通道的订阅者集合 */
const handlers: Record<TdlibChannel, Set<Handler>> = {
    auth: new Set(),
    connection: new Set(),
    option: new Set(),
    language: new Set(),
    colors: new Set(),
    user: new Set(),
    chat: new Set(),
    message: new Set(),
    other: new Set(),
    file: new Set(),
};

/** 通道 → Tauri 事件名 */
const CHANNEL_EVENT: Record<TdlibChannel, string> = {
    auth: "tdlib-auth",
    connection: "tdlib-connection",
    option: "tdlib-option",
    language: "tdlib-language",
    colors: "tdlib-colors",
    user: "tdlib-user",
    chat: "tdlib-chat",
    message: "tdlib-message",
    other: "tdlib-other",
    file: "tdlib-update-file",
};

let initialized = false;
const unlisteners: UnlistenFn[] = [];

/** 统一 payload：批处理通道为 `{ updates: TdlibUpdate[] }`，file 通道为单条 */
interface BatchPayload {
    updates?: TdlibUpdate[];
}

function dispatch(channel: TdlibChannel, payload: unknown) {
    const set = handlers[channel];
    if (set.size === 0) return;

    // 批格式：{ updates: [...] }
    const batch = payload as BatchPayload | null | undefined;
    if (batch && Array.isArray(batch.updates)) {
        for (const u of batch.updates) {
            if (!u || typeof u !== "object") continue;
            for (const h of set) {
                try {
                    h(u as TdlibUpdate);
                } catch (e) {
                    console.error(`[tdlibBus] handler error on ${channel}:`, e);
                }
            }
        }
        return;
    }

    // 单条格式（tdlib-update-file 等）
    if (payload && typeof payload === "object") {
        const single = payload as TdlibUpdate;
        for (const h of set) {
            try {
                h(single);
            } catch (e) {
                console.error(`[tdlibBus] handler error on ${channel}:`, e);
            }
        }
    }
}

/**
 * 订阅某类更新。返回取消订阅函数。
 *
 * 应在 Store 初始化时调用一次；组件不要直接订阅，而是读 Store 状态。
 */
export function onTdlibUpdate(channel: TdlibChannel, handler: Handler): () => void {
    handlers[channel].add(handler);
    return () => {
        handlers[channel].delete(handler);
    };
}

/**
 * 便捷：订阅多个通道，同一 handler。
 * ChatDetail 等跨类消费者使用。
 */
export function onTdlibUpdates(
    channels: TdlibChannel[],
    handler: Handler,
): () => void {
    const offs = channels.map((c) => onTdlibUpdate(c, handler));
    return () => {
        for (const off of offs) off();
    };
}

/**
 * 初始化总线：对每条 Tauri 事件通道只注册一个 listen。
 * 幂等，可多次调用。
 */
export async function initTdlibBus(): Promise<void> {
    if (initialized) return;
    initialized = true;

    const channels = Object.keys(CHANNEL_EVENT) as TdlibChannel[];
    for (const ch of channels) {
        const eventName = CHANNEL_EVENT[ch];
        const un = await listen(eventName, (event) => {
            dispatch(ch, event.payload);
        });
        unlisteners.push(un);
    }
}

/** 测试/热重载用：解除全部 listen */
export function destroyTdlibBus(): void {
    for (const un of unlisteners) {
        try {
            un();
        } catch {
            /* ignore */
        }
    }
    unlisteners.length = 0;
    initialized = false;
    for (const set of Object.values(handlers)) set.clear();
}

/** 调试：各通道当前订阅数 */
export function getTdlibBusStats(): Record<TdlibChannel, number> {
    const out = {} as Record<TdlibChannel, number>;
    for (const [k, set] of Object.entries(handlers)) {
        out[k as TdlibChannel] = set.size;
    }
    return out;
}
