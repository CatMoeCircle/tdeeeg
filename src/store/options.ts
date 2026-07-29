import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type {
    Update,
    optionValueBoolean,
    optionValueEmpty,
    OptionValue,
} from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";
import { useConnectionStore } from "./connectionState";

/** Rust get_cached_option 对 online 返回的可能值类型 */
type OnlineOptionValue = optionValueBoolean | optionValueEmpty;

function isOnlineOptionValue(value: OptionValue | null): value is OnlineOptionValue {
    return value?._ === "optionValueBoolean" || value?._ === "optionValueEmpty";
}

/** 在线汇报间隔（毫秒） */
const ONLINE_KEEPALIVE_INTERVAL = 30_000;
/** 用户无操作后停止汇报的阈值（毫秒） */
const IDLE_TIMEOUT = 300_000; // 5 分钟

export const useOptionsStore = defineStore("options", () => {
    /** 当前用户在线状态（来自 option "online"），null 表示未知 */
    const isUserOnline = ref<boolean | null>(null);

    let unlisten: (() => void) | null = null;
    /** 定时汇报 online 的 interval 句柄 */
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    /** 空闲检测定时器句柄 */
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    /** 根据 optionValue 更新在线状态 */
    function applyOnlineOption(value: OnlineOptionValue): void {
        if (value._ === "optionValueBoolean") {
            isUserOnline.value = value.value;
        } else {
            isUserOnline.value = false;
        }
    }

    // ─── 在线汇报 ──────────────────────────────────────────

    /** 向 TDLib 汇报当前在线 */
    async function reportOnline(): Promise<void> {
        // 如果已经在线则跳过
        if (isUserOnline.value === true) return;
        try {
            await tdlibSend({
                _: "setOption",
                name: "online",
                value: { _: "optionValueBoolean", value: true },
            });
        } catch (e) {
            console.warn("[OptionsStore] reportOnline failed:", e);
        }
    }

    /** 开始定时汇报在线状态 */
    function startKeepAlive(): void {
        if (keepAliveTimer) return;
        // 立即汇报一次
        reportOnline();
        keepAliveTimer = setInterval(reportOnline, ONLINE_KEEPALIVE_INTERVAL);
    }

    /** 停止定时汇报 */
    function stopKeepAlive(): void {
        if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
        }
    }

    // ─── 空闲检测 ──────────────────────────────────────────

    function resetIdleTimer(): void {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            console.log("[OptionsStore] User idle, stopping online keep-alive");
            stopKeepAlive();
        }, IDLE_TIMEOUT);
    }

    function startIdleDetection(): void {
        resetIdleTimer();
        document.addEventListener("mousemove", resetIdleTimer, { passive: true });
        document.addEventListener("keydown", resetIdleTimer, { passive: true });
        document.addEventListener("click", resetIdleTimer, { passive: true });
        document.addEventListener("touchstart", resetIdleTimer, { passive: true });
    }

    // ─── 窗口可见性检测 ─────────────────────────────────────

    function onVisibilityChange(): void {
        if (document.hidden) {
            console.log("[OptionsStore] Window hidden, stopping online keep-alive");
            stopKeepAlive();
        } else {
            // 窗口可见时，检查连接状态并恢复汇报
            const connStore = useConnectionStore();
            if (connStore.connectionState === "connectionStateReady") {
                startKeepAlive();
                resetIdleTimer();
            }
        }
    }

    // ─── 生命周期 ──────────────────────────────────────────

    async function init(): Promise<void> {
        if (unlisten) return;

        // 1. 从 Rust 缓存加载 online option
        try {
            const onlineOpt = await invoke<OnlineOptionValue | null>("get_cached_option", { name: "online" });
            if (onlineOpt && isOnlineOptionValue(onlineOpt)) {
                applyOnlineOption(onlineOpt);
            }
        } catch (e) {
            console.warn("[OptionsStore] Failed to get cached online option:", e);
        }

        // 2. 监听实时 updateOption 事件
        unlisten = await listen<Update>("tdlib-update", (event) => {
            const update = event.payload;
            if (update._ === "updateOption" && update.name === "online") {
                const value = update.value;
                if (isOnlineOptionValue(value)) {
                    applyOnlineOption(value);
                }
            }
        });

        // 3. 监听连接状态变化，自动启动/停止在线汇报
        watch(
            () => useConnectionStore().connectionState,
            (state) => {
                if (state === "connectionStateReady" && !document.hidden) {
                    startKeepAlive();
                    resetIdleTimer();
                } else {
                    stopKeepAlive();
                }
            },
            { immediate: true }
        );

        // 4. 页面可见性变化监听
        document.addEventListener("visibilitychange", onVisibilityChange);

        // 5. 启动空闲检测
        startIdleDetection();
    }

    function destroy(): void {
        if (unlisten) {
            unlisten();
            unlisten = null;
        }
        stopKeepAlive();
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        document.removeEventListener("visibilitychange", onVisibilityChange);
        document.removeEventListener("mousemove", resetIdleTimer);
        document.removeEventListener("keydown", resetIdleTimer);
        document.removeEventListener("click", resetIdleTimer);
        document.removeEventListener("touchstart", resetIdleTimer);
    }

    return {
        isUserOnline,
        init,
        destroy,
    };
});
