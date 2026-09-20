import { invoke } from "@tauri-apps/api/core";
import { settings } from "../store/settings";

/** settings.system → Rust TdLibConfig（全局 config）。登录重建 / 冷启动共用。 */
export async function applyTdlibSystemParams(opts?: { persist?: boolean }): Promise<void> {
    const sys = settings.system;
    const apiId = sys.apiId.trim();
    const apiHash = sys.apiHash.trim();
    const useCustom = !!(sys.customApiCreds && apiId && apiHash);

    if (useCustom) {
        const id = Number(apiId);
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("API ID 必须为正整数");
        }
        await invoke("set_tdlib_parameters", {
            useTestDc: sys.useTestDc,
            apiId: id,
            apiHash,
            useCustomApi: true,
            persist: opts?.persist ?? false,
        });
        return;
    }

    // 未启用自定义凭据时必须显式切回内置，避免全局 config 残留上次的自定义 API
    await invoke("set_tdlib_parameters", {
        useTestDc: sys.useTestDc,
        useCustomApi: false,
        persist: opts?.persist ?? false,
    });
}

/**
 * 按当前 settings.system 重建 TDLib 客户端。
 * 用于：登录设置「应用」等需要全量重建的路径。
 */
export async function reinitTdlibWithSystemParams(): Promise<void> {
    await applyTdlibSystemParams({ persist: true });
    await invoke("init_tdlib", { force: true });
}

/**
 * 二维码授权态 → 手机号登录。
 * TDLib 在 WaitOtherDeviceConfirmation 下不能 setAuthenticationPhoneNumber，
 * 必须销毁当前会话客户端并重建，进入 WaitPhoneNumber 后再发手机号。
 */
export async function preparePhoneLoginAfterQr(): Promise<void> {
    await applyTdlibSystemParams({ persist: true });
    // force_reinit_active：强制销毁旧 client（含二维码会话）并重建
    const result = await invoke("force_reinit_active") as { auth?: { _?: string } };
    console.log("[tdlibParams] force_reinit_active =>", result);
}

export async function prepareQrLoginFromOtherState(): Promise<void> {
    await applyTdlibSystemParams({ persist: true });
    const result = await invoke("force_reinit_active") as { auth?: { _?: string } };
    console.log("[tdlibParams] force_reinit_active (qr) =>", result);
}
