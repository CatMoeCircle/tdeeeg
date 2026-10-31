import { invoke } from "@tauri-apps/api/core";
import { watch } from "vue";
import { settings } from "./settings";

/** 后台资源策略（EcoQoS + WebView2 低内存 / 挂起）的前端开关同步。
 *
 *  实际的窗口状态判断与进程 / WebView2 操作都在 Rust
 *  （src-tauri/src/system/efficiency.rs）：
 *  - 最小化满 10s：本进程与 WebView2 子进程进入 EcoQoS，WebView2 内存目标降为 Low；
 *  - 隐藏到托盘满 60s：挂起 WebView2 渲染进程（TrySuspend），重新显示时恢复。
 *  前端只负责把用户偏好推下去，并在设置页展示平台是否支持。
 */

export interface BackgroundEfficiencyStatus {
    /** 平台是否支持（Windows 10 1709+ 才有 ProcessPowerThrottling） */
    supported: boolean;
    /** 此刻是否已进入效率模式（最小化满 10s + 开关打开） */
    active: boolean;
}

/** 把当前偏好推给 Rust；失败只记日志，不打断启动 */
export async function pushBackgroundEfficiency(): Promise<void> {
    try {
        await invoke("set_background_efficiency", { enabled: settings.system.backgroundEfficiency });
    } catch (e) {
        console.error("[Efficiency] set_background_efficiency failed:", e);
    }
}

/** 查询生效状态（设置页进入时刷新一次即可） */
export async function getBackgroundEfficiencyStatus(): Promise<BackgroundEfficiencyStatus | null> {
    try {
        return await invoke<BackgroundEfficiencyStatus>("get_background_efficiency_status");
    } catch (e) {
        console.error("[Efficiency] get_background_efficiency_status failed:", e);
        return null;
    }
}

let initialized = false;

/** 初始化：推送当前设置，并监听后续变化。幂等。 */
export function initBackgroundEfficiency(): void {
    if (initialized) return;
    initialized = true;
    void pushBackgroundEfficiency();
    watch(
        () => settings.system.backgroundEfficiency,
        () => void pushBackgroundEfficiency(),
    );
}
