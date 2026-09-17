import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { onTdlibUpdate, type TdlibUpdate } from "./tdlibBus";

export type ConnectionStateType =
    | "connectionStateReady"
    | "connectionStateConnecting"
    | "connectionStateUpdating"
    | "connectionStateConnectingToProxy"
    | "connectionStateWaitingForNetwork";

export const useConnectionStore = defineStore("connection", () => {
    /** 当前连接状态，null 表示尚未收到任何 updateConnectionState */
    const connectionState = ref<ConnectionStateType | null>(null);

    /** 是否处于非就绪的连接状态（需要显示状态提示） */
    const isConnecting = ref(false);

    /** 连接状态的显示文本（国际化 key） */
    const connectionLabel = ref("");

    let unsubscribe: (() => void) | null = null;

    /** 根据连接状态类型更新响应式状态 */
    function applyState(state: ConnectionStateType) {
        connectionState.value = state;
        switch (state) {
            case "connectionStateReady":
                isConnecting.value = false;
                connectionLabel.value = "";
                break;
            case "connectionStateConnecting":
                isConnecting.value = true;
                connectionLabel.value = "connection.connecting";
                break;
            case "connectionStateUpdating":
                isConnecting.value = true;
                connectionLabel.value = "connection.updating";
                break;
            case "connectionStateConnectingToProxy":
                isConnecting.value = true;
                connectionLabel.value = "connection.connectingToProxy";
                break;
            case "connectionStateWaitingForNetwork":
                isConnecting.value = true;
                connectionLabel.value = "connection.waitingForNetwork";
                break;
        }
    }

    async function init() {
        if (unsubscribe) return;

        // 1. 优先从 Rust 缓存中加载状态（避免事件未到达时的空白期）
        try {
            const cached = await invoke<any | null>("get_cached_connection_state");
            if (cached && cached._) {
                applyState(cached._ as ConnectionStateType);
            }
        } catch (e) {
            console.warn("[ConnectionStore] Failed to get cached connection state:", e);
        }

        // 2. 订阅总线 connection 通道（Rust 已分类，无需 if 过滤其他类型）
        unsubscribe = onTdlibUpdate("connection", (update: TdlibUpdate) => {
            if (update._ === "updateConnectionState") {
                const state = (update as any).state?._ as ConnectionStateType;
                applyState(state);
            }
        });
    }

    function destroy() {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    }

    return {
        connectionState,
        isConnecting,
        connectionLabel,
        init,
        destroy,
    };
});
