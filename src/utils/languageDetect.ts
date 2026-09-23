import { invoke } from "@tauri-apps/api/core";

/** 本地语言识别结果（MediaPipe LangID / TFLite）。 */
export interface LanguageDetection {
  /** BCP-47 风格语言码，如 en / zh / fr */
  language: string;
  /** Softmax 置信度，[0, 1] */
  confidence: number;
}

/**
 * 识别文本语言，返回最可能的语言代码与置信度。
 *
 * 由 Tauri 本地模型推理，不发起网络请求。
 */
export function detectLanguage(text: string): Promise<LanguageDetection> {
  return invoke("detect_language", { text });
}

/**
 * 按置信度降序返回前 N 个候选。
 *
 * @param topK 候选个数，默认 3；传 0 表示返回模型全部语言。
 */
export function detectLanguages(
  text: string,
  topK: number = 3
): Promise<LanguageDetection[]> {
  return invoke("detect_languages", { text, topK });
}

/** Rust 侧翻译门控结果：消息排除 + 目标语言本身不译。 */
export interface ShouldTranslateDecision {
  /** 是否应翻译该文本 */
  shouldTranslate: boolean;
  /** 识别到的源语言码（未识别时为空串） */
  detectedLanguage: string;
  /** 识别置信度，[0, 1]；未识别为 0 */
  confidence: number;
  /** ok | empty | same_as_target | excluded | undetected */
  reason: "ok" | "empty" | "same_as_target" | "excluded" | "undetected" | string;
}

/**
 * 用本地语言识别决定是否需要翻译。
 *
 * - 源语言命中 `doNotTranslate` → 排除不译
 * - 源语言已是 `targetLang` → 目标语言本身不译
 * - 空文本 / 低置信度 → 按 `undetected` 处理（`doNotTranslate` 含 und 时跳过）
 */
export function shouldTranslateText(
  text: string,
  targetLang: string,
  doNotTranslate: string[] = [],
  minConfidence?: number
): Promise<ShouldTranslateDecision> {
  return invoke("should_translate_text", {
    text,
    targetLang,
    doNotTranslate,
    minConfidence,
  });
}
