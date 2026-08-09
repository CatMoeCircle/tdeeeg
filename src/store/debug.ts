import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

/**
 * 调试模式状态（进入方式：在设置里连点版本号 5 次）。
 * 持久化到 localStorage，重启后保持开启。
 */
const DEBUG_KEY = "tdgram-debug-enabled";

/** 是否已开启调试模式（显示设置页官方群组下方的「开发者选项」区块） */
export const debugMode = ref(false);

try {
    debugMode.value = localStorage.getItem(DEBUG_KEY) === "1";
} catch {
    debugMode.value = false;
}

/** 切换调试模式并持久化 */
export function setDebugMode(enabled: boolean): void {
    debugMode.value = enabled;
    try {
        localStorage.setItem(DEBUG_KEY, enabled ? "1" : "0");
    } catch {
        // ignore
    }
}

/**
 * 向 TDLib 发送任意方法（不做类型约束，供开发者调试）。
 * 直接调用底层 `tdlib_send` invoke，允许发送任意 JSON 方法名/参数。
 */
export async function rawTdlibSend(request: Record<string, unknown>): Promise<unknown> {
    const response: unknown = await invoke("tdlib_send", { request });
    if (response && typeof response === "object" && (response as { _?: string })._ === "error") {
        throw response;
    }
    return response;
}

/**
 * update 控制台打印开关。
 * 开启后监听 `tdlib-update` 事件并把每次 update 打印到控制台。
 */
export const logUpdates = ref(false);

let logUpdatesInitialized = false;

/** 初始化 update 事件监听（惰性建立一次监听，具体是否打印由 logUpdates 控制） */
export async function initDebugUpdateListener(): Promise<void> {
    if (logUpdatesInitialized) return;
    logUpdatesInitialized = true;
    await listen("tdlib-update", (event) => {
        if (!logUpdates.value) return;
        console.log("[tdlib-update]", event.payload);
    });
}

/** 切换是否在控制台打印 update */
export function setLogUpdates(enabled: boolean): void {
    logUpdates.value = enabled;
    if (enabled) {
        void initDebugUpdateListener();
    }
}

/** 打开 WebView 开发者工具（复用 Rust open_devtools 命令） */
export async function openDevTools(): Promise<void> {
    try {
        await invoke("open_devtools");
    } catch (e) {
        console.warn("open_devtools failed:", e);
    }
}
