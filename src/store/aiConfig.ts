import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";

/**
 * AI 翻译配置（后端保存）。
 * - 非敏感字段与 API Key 均由 Rust 侧持久化：配置在应用配置目录 JSON，
 *   Key 在系统钥匙串（tauri-plugin-keyring-store），前端不落 localStorage。
 * - 前端只持有内存视图，供提供方可用性判断与设置页草稿初始化。
 */

export type AiTranslateFormat = "openai-responses" | "openai-compatible" | "anthropic";

export interface AiTranslateConfig {
    name: string;
    endpoint: string;
    format: AiTranslateFormat | string;
    model: string;
}

export interface AiConfigView extends AiTranslateConfig {
    /** 系统钥匙串里是否已保存 API Key（Key 明文不出后端） */
    hasApiKey: boolean;
}

/** 已提交（保存）的配置视图，翻译链路与提供方可用性据此判断 */
export const aiConfig = reactive<AiConfigView & { loaded: boolean }>({
    name: "",
    endpoint: "",
    format: "openai-compatible",
    model: "",
    hasApiKey: false,
    loaded: false,
});

/** 配置是否完整（可发起翻译调用） */
export function aiConfigComplete(): boolean {
    return (
        aiConfig.loaded &&
        !!aiConfig.endpoint.trim() &&
        !!aiConfig.model.trim() &&
        aiConfig.hasApiKey
    );
}

/** 从后端拉取已保存配置（应用启动 / 进入设置页时） */
export async function loadAiConfig(): Promise<void> {
    try {
        const view = await invoke<AiConfigView>("get_ai_translate_config");
        Object.assign(aiConfig, view, { loaded: true });
    } catch (e) {
        console.error("[aiConfig] 加载失败:", e);
        aiConfig.loaded = true;
    }
}

/**
 * 保存配置（入参为设置页草稿），成功后同步到本模块视图。
 * @param apiKey 非空 → 写入钥匙串；空 → 保持已保存的 Key 不变
 */
export async function saveAiConfig(
    config: AiTranslateConfig,
    apiKey: string,
): Promise<AiConfigView> {
    const view = await invoke<AiConfigView>("save_ai_translate_config", {
        config,
        apiKey,
    });
    Object.assign(aiConfig, view, { loaded: true });
    return view;
}

/** 清除已保存配置（JSON + 钥匙串 Key） */
export async function clearAiConfig(): Promise<void> {
    const view = await invoke<AiConfigView>("clear_ai_translate_config");
    Object.assign(aiConfig, view, { loaded: true });
}

/** 拉取模型 ID 列表（测试接口连通性）；apiKey 为空时后端回退已保存的 Key */
export async function listAiModels(
    config: AiTranslateConfig,
    apiKey: string,
): Promise<string[]> {
    return await invoke<string[]>("ai_list_models", { config, apiKey });
}
