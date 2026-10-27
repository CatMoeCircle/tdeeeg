import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { tdlibSend } from "../utils/tdlib";
import { useConnectionStore } from "./connectionState";
import { onTdlibUpdate } from "./tdlibBus";

/** 用户无操作后报离线的阈值（毫秒） */
const IDLE_TIMEOUT = 300_000; // 5 分钟

/**
 * 在线状态（TDLib option "online"）显式上报。
 *
 * 只做「不活跃 → 离线、恢复活跃 → 在线」这两件事，不周期性催在线：
 * 窗口隐藏或空闲超时即报离线，窗口重新可见 / 有操作即报在线；
 * 其余时间交给 TDLib 原生 presence。
 */
export const usePresenceStore = defineStore("presence", () => {
    /** 最近一次汇报给 TDLib 的状态；null 表示未知（以 TDLib 推送回写为准） */
    const isUserOnline = ref<boolean | null>(null);
    /** 最近一次用户操作（鼠标 / 键盘 / 触摸）的时间戳；接管时机判定也用这个 */
    const lastActivityAt = ref(Date.now());

    let unlisten: (() => void) | null = null;
    /** 空闲检测定时器句柄 */
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let idle = false;

    /** 汇报在线状态；与已记录状态一致时跳过，避免与服务端/推送打架 */
    async function reportOnline(online: boolean): Promise<void> {
        if (isUserOnline.value === online) return;
        try {
            await tdlibSend({
                _: "setOption",
                name: "online",
                value: { _: "optionValueBoolean", value: online },
            });
        } catch (e) {
            console.warn("[Presence] reportOnline failed:", e);
        }
    }

    /** 连接就绪 + 窗口可见 + 非空闲 = 在线 */
    function syncPresence(): void {
        const ready = useConnectionStore().connectionState === "connectionStateReady";
        void reportOnline(ready && !document.hidden && !idle);
    }

    // ─── 空闲检测 ──────────────────────────────────────────

    function resetIdleTimer(): void {
        lastActivityAt.value = Date.now();
        if (idleTimer) clearTimeout(idleTimer);
        if (idle) {
            idle = false;
            syncPresence();
        }
        idleTimer = setTimeout(() => {
            idle = true;
            syncPresence();
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
        syncPresence();
        if (!document.hidden) resetIdleTimer();
    }

    // ─── 生命周期 ──────────────────────────────────────────

    /** 幂等；TDLib 推送回写 isUserOnline，保证与真实值一致 */
    function init(): void {
        if (unlisten) return;

        unlisten = onTdlibUpdate("option", (update) => {
            if (update._ === "updateOption" && (update as { name?: string }).name === "online") {
                const value = (update as { value?: { _?: string; value?: boolean } }).value;
                if (value?._ === "optionValueBoolean") isUserOnline.value = !!value.value;
                else if (value?._ === "optionValueEmpty") isUserOnline.value = null;
            }
        });

        document.addEventListener("visibilitychange", onVisibilityChange);
        // 连接状态变化（Ready / 掉线）也要重新汇报
        watch(() => useConnectionStore().connectionState, syncPresence);
        startIdleDetection();
        syncPresence();
    }

    function destroy(): void {
        if (unlisten) {
            unlisten();
            unlisten = null;
        }
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

    return { isUserOnline, lastActivityAt, init, destroy };
});
