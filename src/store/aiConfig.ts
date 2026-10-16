import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import { settings } from "./settings";
import deepseekIcon from "../assets/ai/deepseek.svg";
import openaiIcon from "../assets/ai/openai.svg";
import claudeIcon from "../assets/ai/claude.svg";
import geminiIcon from "../assets/ai/gemini.svg";
import glmIcon from "../assets/ai/glm.svg";
import kimiIcon from "../assets/ai/kimi.svg";
import minimaxIcon from "../assets/ai/minimax.svg";
import mimoIcon from "../assets/ai/mimo.svg";
import hunyuanIcon from "../assets/ai/hunyuan.svg";
import qwenIcon from "../assets/ai/qwen.svg";
import {
  addPresetName,
  hasPresetName,
  providerConfigured,
  providerUsable,
  removePresetName,
  type AiModel,
  type AiPreset,
  type AiProvider,
} from "./aiProviderRules";

/**
 * AI 供应商列表（后端保存）。
 * - 非敏感字段与模型列表写入应用配置目录 JSON；API Key 存系统钥匙串（每个供应商一个账号）。
 * - 前端只持有内存视图；hasApiKey 表示钥匙串中是否已保存，Key 明文不出后端。
 * - 翻译使用的「供应商 + 模型」由设置里的 settings.translate.ai 指定（见 resolveAiTarget）。
 * - 类型 / 预设 / 名称与恢复规则在 ./aiProviderRules（纯逻辑，不依赖资源，可单独跑自检）；这里只做 IO 与状态。
 */

export type { AiModel, AiPreset, AiProvider, AiTranslateFormat } from "./aiProviderRules";
export {
  addPresetName,
  AI_PRESETS,
  aiModelThinks,
  hasPresetName,
  isPresetDefault,
  normProviderName,
  presetForName,
  presetProvider,
  providerNameTaken,
  removePresetName,
  uniqueProviderName,
} from "./aiProviderRules";

/** 预置图标库（src/assets/ai）：用户可在设置里任选一个 */
export const AI_ICONS: readonly { key: string; src: string }[] = [
  { key: "deepseek", src: deepseekIcon },
  { key: "openai", src: openaiIcon },
  { key: "claude", src: claudeIcon },
  { key: "gemini", src: geminiIcon },
  { key: "glm", src: glmIcon },
  { key: "kimi", src: kimiIcon },
  { key: "minimax", src: minimaxIcon },
  { key: "mimo", src: mimoIcon },
  { key: "hunyuan", src: hunyuanIcon },
  { key: "qwen", src: qwenIcon },
];

/** 图标值 → 可渲染地址：空 = 无图标（退回首字母），data URL = 自定义图片，其余按图标库 key 查 */
export function iconSrc(icon: string): string | undefined {
  if (!icon) return undefined;
  if (icon.startsWith("data:")) return icon;
  return AI_ICONS.find((i) => i.key === icon)?.src;
}

export const aiProviders = reactive<{ list: AiProvider[]; deletedPresets: string[]; loaded: boolean }>({
  list: [],
  /** 用户删掉的预设名称：删预设 = 清掉它的设置并在这里记一笔，UI 不再显示该预设 */
  deletedPresets: [],
  loaded: false,
});

/** 该预设是否已被用户删除（按名称归一化比较，与保存时的恢复判定同一套规则） */
export function isPresetDeleted(name: string): boolean {
  return hasPresetName(aiProviders.deletedPresets, name);
}

/** 记住某个预设名被删过（保存同名供应商时由后端移出） */
export function addDeletedPreset(name: string): void {
  aiProviders.deletedPresets = addPresetName(aiProviders.deletedPresets, name);
}

/** 基础配置是否完整：名称 + URL + API Key（模型可之后再添加） */
export const aiProviderReady = providerConfigured;

/** AI 输入框模型选择器的一档：供应商（头像 + 名称）+ 它下面的模型 */
export interface AiModelGroup {
  id: string;
  name: string;
  /** 头像地址；空 = 没有图标，界面回退成名称首字母 */
  icon?: string;
  models: { id: string; name: string }[];
}

/**
 * AI 输入框的候选分组：只包含「已配置（名称 + URL + Key）」且至少添加过一个模型的供应商。
 * 没配 Key 的预设、以及有 Key 但没加模型的供应商都不进列表。
 */
export function aiModelGroups(): AiModelGroup[] {
  return aiProviders.list
    .filter(providerUsable)
    .map((p) => ({
      id: p.id,
      name: p.name.trim(),
      icon: iconSrc(p.icon),
      models: p.models.map((m) => ({ id: m.id, name: m.name || m.id })),
    }));
}

export function newAiProvider(): AiProvider {
  return {
    id: crypto.randomUUID(),
    name: "",
    endpoint: "",
    format: "openai-compatible",
    icon: "",
    models: [],
    hasApiKey: false,
  };
}

/** 当前翻译使用的 AI 供应商 + 模型；未完整配置时返回 null */
export function resolveAiTarget(): { provider: AiProvider; model: string } | null {
  // 旧版本持久化的设置可能没有 ai 字段，需兜底
  const { providerId, model } = settings.translate.ai ?? { providerId: null, model: "" };
  const provider = aiProviders.list.find((p) => p.id === providerId);
  if (!provider || !aiProviderReady(provider) || !model || !provider.models.some((m) => m.id === model)) {
    return null;
  }
  return { provider, model };
}

/** 从后端拉取供应商列表与被删预设（应用启动 / 进入设置页时） */
export async function loadAiProviders(): Promise<void> {
  try {
    const config = await invoke<{ providers: AiProvider[]; deletedPresets: string[] }>("list_ai_providers");
    aiProviders.list = config.providers;
    aiProviders.deletedPresets = config.deletedPresets ?? [];
  } catch (e) {
    console.error("[aiConfig] 加载失败:", e);
  }
  aiProviders.loaded = true;
}

/** 新增或更新供应商；apiKey 为空 → 保持已保存的 Key 不变。名称若命中已删预设，后端会一并把它从删除列表移出（= 恢复该预设） */
export async function saveAiProvider(provider: AiProvider, apiKey: string): Promise<AiProvider> {
  const saved = await invoke<AiProvider>("save_ai_provider", { provider, apiKey });
  const i = aiProviders.list.findIndex((p) => p.id === saved.id);
  if (i >= 0) aiProviders.list[i] = saved;
  else aiProviders.list.push(saved);
  aiProviders.deletedPresets = removePresetName(aiProviders.deletedPresets, saved.name);
  return saved;
}

/** 删除供应商（配置与钥匙串 Key 一并删除） */
export async function deleteAiProvider(id: string): Promise<void> {
  await invoke("delete_ai_provider", { id });
  aiProviders.list = aiProviders.list.filter((p) => p.id !== id);
}

/** 删除预设：清掉该预设已保存的设置与 Key，并记住它被删过（UI 不再显示）；填同名保存即恢复 */
export async function deleteAiPreset(preset: AiPreset): Promise<void> {
  await invoke("delete_ai_preset", { id: preset.id, name: preset.name });
  aiProviders.list = aiProviders.list.filter((p) => p.id !== preset.id);
  addDeletedPreset(preset.name);
}


/** 清空「被删除的预设」名单：被删的预设全部恢复显示（开发者选项）；返回恢复的数量 */
export async function resetDeletedPresets(): Promise<number> {
  const count = await invoke<number>("reset_ai_presets");
  aiProviders.deletedPresets = [];
  return count;
}

/** 拉取模型列表（测试连接 / 获取模型列表）；apiKey 为空时回退已保存的 Key */
export async function listAiModels(provider: AiProvider, apiKey: string): Promise<AiModel[]> {
  return await invoke<AiModel[]>("ai_list_models", { provider, apiKey });
}
