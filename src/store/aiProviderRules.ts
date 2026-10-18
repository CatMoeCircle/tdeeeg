/**
 * AI 供应商纯规则层：类型、内置预设、名称唯一与预设恢复判定。
 * 不依赖任何资源 / Tauri（图标是 key，不是地址），因此可直接用 node 跑自检（见 aiProviderRules.check.ts）。
 * 对外的 store 门面在 ./aiConfig（注意：node 类型剥离要求这里显式写 .ts 后缀才 import 得进来）。
 */

export type AiTranslateFormat = "openai-responses" | "openai-compatible" | "anthropic";

/** 模型条目：id 必然有，其余字段视接口而定（OpenRouter / Anthropic 才有名称、上下文、模态），可在设置里手改 */
export interface AiModel {
  id: string;
  /** 展示名，空 = 直接显示 id */
  name: string | null;
  contextLength: number | null;
  maxOutput: number | null;
  modality: string | null;
}

export interface AiProvider {
  id: string;
  /** 供应商名称 */
  name: string;
  /** 接口地址（含版本路径，如 https://api.openai.com/v1） */
  endpoint: string;
  /** 接口协议，默认 openai-compatible（OpenAI Completions） */
  format: AiTranslateFormat | string;
  /** 图标：AI_ICONS 的 key、自定义图片的 data URL，或空（用名称首字母） */
  icon: string;
  /** 用户添加到列表的模型（默认为空，需手动添加） */
  models: AiModel[];
  hasApiKey: boolean;
}

/**
 * 内置供应商预设：只带名称 / 地址 / 协议，API Key 由用户自填；
 * 保存后即为普通供应商（同 id），因此可删除、可改地址，删掉后预设会重新出现；
 * 反过来，自定义供应商填成预设名再保存就等于恢复该预设（见 presetForName）。
 */
export interface AiPreset {
  id: string;
  name: string;
  endpoint: string;
  format: AiTranslateFormat;
  /** AI_ICONS 的 key */
  icon: string;
  /** 国内站：仅中文语言包显示 */
  cnOnly?: boolean;
}

/**
 * 供应商支持 `POST {endpoint}/responses` 的用 openai-responses，其余用 openai-compatible。
 * Gemini 的 OpenAI 兼容层只有 /chat/completions（没有 /responses），因此留在 completions；
 * Claude 走自家 messages 协议。
 */
export const AI_PRESETS: readonly AiPreset[] = [
  { id: 'preset-deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', format: 'openai-responses', icon: 'deepseek' },
  { id: 'preset-openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', format: 'openai-responses', icon: 'openai' },
  { id: 'preset-xiaomi-mimo', name: 'Xiaomi MiMo', endpoint: 'https://api.xiaomimimo.com/v1', format: 'openai-responses', icon: 'mimo' },
  { id: 'preset-claude', name: 'Claude', endpoint: 'https://api.anthropic.com/v1', format: 'anthropic', icon: 'claude' },
  { id: 'preset-kimi', name: 'Kimi', endpoint: 'https://api.moonshot.ai/v1', format: 'openai-responses', icon: 'kimi' },
  { id: 'preset-kimi-cn', name: 'Kimi-CN', endpoint: 'https://api.moonshot.cn/v1', format: 'openai-responses', icon: 'kimi', cnOnly: true },
  { id: 'preset-glm', name: '智谱 GLM', endpoint: 'https://api.z.ai/api/paas/v4', format: 'openai-responses', icon: 'glm' },
  { id: 'preset-glm-cn', name: '智谱 GLM-CN', endpoint: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai-responses', icon: 'glm', cnOnly: true },
  { id: 'preset-minimax', name: 'MiniMax', endpoint: 'https://api.minimax.io/v1', format: 'openai-responses', icon: 'minimax' },
  { id: 'preset-minimax-cn', name: 'MiniMax-CN', endpoint: 'https://api.minimaxi.com/v1', format: 'openai-responses', icon: 'minimax', cnOnly: true },
  { id: 'preset-gemini', name: 'Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', format: 'openai-compatible', icon: 'gemini' },
];

/** 预设 → 供应商草稿（未配置 Key，模型需测试连接后添加） */
export function presetProvider(p: AiPreset): AiProvider {
  return { id: p.id, name: p.name, endpoint: p.endpoint, format: p.format, icon: p.icon, models: [], hasApiKey: false };
}

/** 供应商名称比较用归一化：去空白、忽略大小写与全/半角 */
export const normProviderName = (s: string) => s.trim().normalize("NFKC").toLowerCase();

/** 名称是否已被 list 中其它供应商占用（exceptId = 正在改的那条） */
export function providerNameTaken(list: AiProvider[], name: string, exceptId?: string): boolean {
  return list.some((p) => p.id !== exceptId && normProviderName(p.name) === normProviderName(name));
}

/** list 中第一个可用的占位名称：OpenAI → OpenAI (2)、OpenAI (3)… */
export function uniqueProviderName(list: AiProvider[], name: string): string {
  for (let i = 2; ; i++) {
    const candidate = `${name.trim()} (${i})`;
    if (!providerNameTaken(list, candidate)) return candidate;
  }
}

/** 名称匹配的预设：自定义供应商填成预设名保存时即算恢复该预设（先按 id 认已有的预设项） */
export function presetForName(name: string, id = ""): AiPreset | undefined {
  return AI_PRESETS.find((p) => p.id === id)
    ?? AI_PRESETS.find((p) => normProviderName(p.name) === normProviderName(name));
}

/** 是否仍是预设原样（名称 / 地址 / 协议 / 图标都没改过），改过才需要「恢复默认」 */
export function isPresetDefault(p: AiProvider, preset: AiPreset): boolean {
  return p.name === preset.name && p.endpoint === preset.endpoint
    && p.format === preset.format && p.icon === preset.icon;
}

// ─── 可用性判定（翻译目标与 AI 输入框共用） ───

/** 基础配置是否完整：名称 + URL + Key（模型可之后再添加） */
export function providerConfigured(p: AiProvider): boolean {
  return !!p.name.trim() && !!p.endpoint.trim() && p.hasApiKey;
}

/**
 * AI 输入框的模型选择器里是否该出现这个供应商：已配置，且至少添加过一个模型。
 * 「有 Key 却没加模型」和「没配 Key」的都不进列表。
 */
export function providerUsable(p: AiProvider): boolean {
  return providerConfigured(p) && p.models.length > 0;
}

// ─── 思考（推理）能力判定 ───

/**
 * 模型会不会思考：接口不给能力元数据（OpenAI 兼容的 /models 只有 id），只能按 id 判。
 * 规则与 DSH 同源：能力来自模型清单，清单里查不到就不拦 —— 只把明确「非思考」的家族
 * （向量 / 语音 / 图像 / 非推理对话模型）挡掉，所以不认识的模型保持老行为（给滑杆）。
 */
const NON_THINKING_MODEL = /embed|rerank|whisper|tts|audio|image|dall-e|moderation|vision|transcribe|ocr|sd-|stable-diffusion|gpt-3|gpt-4o|gpt-4-turbo|chatgpt-4o/i;

/** 该模型能否思考（= 输入框要不要给思考等级滑杆；不确定的按「能」处理，保住现有行为） */
export function aiModelThinks(modelId: string): boolean {
  const id = modelId.trim();
  if (!id) return false;
  if (NON_THINKING_MODEL.test(id)) return false;
  return true;
}

// ─── 被删预设名单（删预设 = 清设置 + 记一笔；填同名保存即恢复） ───

/** 名单里是否有该名称（同一套归一化规则） */
export function hasPresetName(names: readonly string[], name: string): boolean {
  return names.some((n) => normProviderName(n) === normProviderName(name));
}

/** 记一笔被删的预设名（已记过就不重复） */
export function addPresetName(names: readonly string[], name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed || hasPresetName(names, trimmed)) return [...names];
  return [...names, trimmed];
}

/** 把名称从名单里移出（= 该预设恢复显示） */
export function removePresetName(names: readonly string[], name: string): string[] {
  return names.filter((n) => normProviderName(n) !== normProviderName(name));
}
