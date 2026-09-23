import type { formattedText } from "tdlib-types";
import { tdlibSend } from "./tdlib";
import { settings } from "../store/settings";

/**
 * 翻译提供方抽象层。
 *
 * 设计目标：
 * - 默认走 TDLib `translateText` / `translateMessageText`（官方，已实现）。
 * - 为第三方翻译 API、AI 翻译预留 **稳定接口**；配置对整套翻译生效，
 *   并可分别覆盖「右键单条翻译」与「聊天全部翻译」。
 * - 业务侧只依赖本模块，后续接入时无需改动调用方。
 */

export type TranslateProviderId = "tdlib" | "third-party" | "ai";

/** 翻译场景：右键单条 / 聊天全部翻译 */
export type TranslateScenario = "message" | "chat";

export interface TranslateProviderRequest {
  /** 富文本（TDLib 可保留实体；第三方/AI 可只用 plainText） */
  text: formattedText;
  /** 纯文本备用 */
  plainText: string;
  /** 目标语言码 */
  toLanguageCode: string;
  /** 可选：语境（整聊翻译时带上 chat/message id） */
  chatId?: number;
  messageId?: number;
  /** 语气（TDLib 支持 "" | formal | neutral | casual） */
  tone?: string;
}

export interface TranslateProviderResult {
  /** 译文纯文本 */
  text: string;
  /** 译文富文本（可选；TDLib Premium 可能保留格式） */
  formattedText?: formattedText | null;
}

export interface TranslateProvider {
  readonly id: TranslateProviderId;
  readonly name: string;
  /** 当前提供方在本机是否「可调用」（接口是否存在） */
  isAvailable(): boolean;
  /** 当前配置下是否已可用（预留接口未实现时恒为 false） */
  isConfigured(): boolean;
  /** 执行翻译；未配置/未实现时抛错 */
  translate(req: TranslateProviderRequest): Promise<TranslateProviderResult>;
}

// ─── TDLib 提供方（官方，已实现） ─────────────────────────────

/** 从 TDLib formattedText 结果中安全取出译文纯文本 */
function pickTranslatedText(res: unknown): string {
  if (!res || typeof res !== "object") return "";
  const r = res as { text?: unknown; formattedText?: { text?: unknown } };
  for (const c of [r.text, r.formattedText?.text]) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "";
}

export const tdlibTranslateProvider: TranslateProvider = {
  id: "tdlib",
  name: "Telegram",
  isAvailable: () => true,
  isConfigured: () => true,
  async translate(req) {
    // 整聊 / 带 messageId 时优先走 translateMessageText（服务端缓存更好）
    if (req.chatId && req.messageId && req.messageId > 0) {
      try {
        const res = await tdlibSend({
          _: "translateMessageText",
          chat_id: req.chatId,
          message_id: req.messageId,
          to_language_code: req.toLanguageCode,
          ...(req.tone ? { tone: req.tone } : {}),
        });
        const text = pickTranslatedText(res);
        // TDLib 在「无需翻译 / 译文未知」时也可能返回空 formattedText，此时回退 translateText
        if (text) {
          return { text, formattedText: (res as formattedText) ?? null };
        }
      } catch {
        // 回退到 translateText
      }
    }
    const res = await tdlibSend({
      _: "translateText",
      text: req.text,
      to_language_code: req.toLanguageCode,
      ...(req.tone ? { tone: req.tone } : {}),
    });
    return { text: pickTranslatedText(res), formattedText: (res as formattedText) ?? null };
  },
};

// ─── 第三方翻译 API（接口预留，功能未实现） ───────────────────

export const thirdPartyTranslateProvider: TranslateProvider = {
  id: "third-party",
  name: "第三方翻译 API",
  isAvailable: () => true,
  isConfigured: () => {
    // 配置结构已保留（settings.translate.thirdParty），功能未实现
    return false;
  },
  async translate() {
    throw new Error("第三方翻译接口尚未实现，请在设置中改用 Telegram 翻译");
  },
};

// ─── AI 翻译（接口预留，功能未实现） ──────────────────────────

export const aiTranslateProvider: TranslateProvider = {
  id: "ai",
  name: "AI 翻译",
  isAvailable: () => true,
  isConfigured: () => {
    // 配置结构已保留（settings.translate.ai），功能未实现
    return false;
  },
  async translate() {
    throw new Error("AI 翻译接口尚未实现，请在设置中改用 Telegram 翻译");
  },
};

// ─── 提供方注册表 ─────────────────────────────────────────────

const providers = new Map<TranslateProviderId, TranslateProvider>([
  ["tdlib", tdlibTranslateProvider],
  ["third-party", thirdPartyTranslateProvider],
  ["ai", aiTranslateProvider],
]);

/**
 * 注册/覆盖翻译提供方。
 * 供后续接入第三方 / AI 时在应用启动处调用：
 *   registerTranslateProvider(myCustomProvider);
 */
export function registerTranslateProvider(provider: TranslateProvider) {
  providers.set(provider.id, provider);
}

export function getTranslateProvider(id?: TranslateProviderId): TranslateProvider {
  const key = id ?? "tdlib";
  return providers.get(key) ?? tdlibTranslateProvider;
}

export function listTranslateProviders(): TranslateProvider[] {
  return [...providers.values()];
}

/** 读取提供方设置（兼容旧版字符串结构） */
function readProviderSettings(): {
  default: TranslateProviderId;
  message: TranslateProviderId | null;
  chat: TranslateProviderId | null;
} {
  const raw: any = settings.translate.provider;
  if (typeof raw === "string") {
    const id = (raw === "third-party" || raw === "ai" ? raw : "tdlib") as TranslateProviderId;
    return { default: id, message: null, chat: null };
  }
  return {
    default: (raw?.default as TranslateProviderId) || "tdlib",
    message: (raw?.message as TranslateProviderId | null) ?? null,
    chat: (raw?.chat as TranslateProviderId | null) ?? null,
  };
}

/**
 * 解析某场景实际使用的提供方 id。
 * - 场景未单独配置 → 跟随全局 default
 * - 全局 default 亦未配置 → tdlib
 */
export function resolveProviderId(scenario?: TranslateScenario): TranslateProviderId {
  const cfg = readProviderSettings();
  if (!scenario) return cfg.default || "tdlib";
  return cfg[scenario] ?? cfg.default ?? "tdlib";
}

/** 场景配置的提供方是否为官方 TDLib（未配置时视为官方） */
export function isOfficialProvider(scenario?: TranslateScenario): boolean {
  return resolveProviderId(scenario) === "tdlib";
}

/**
 * 当前场景的有效提供方。
 * 预留接口（third-party / ai）未实现时回退 TDLib，保证默认链路可用。
 */
export function getActiveTranslateProvider(scenario?: TranslateScenario): TranslateProvider {
  const preferred = getTranslateProvider(resolveProviderId(scenario));
  if (preferred.isConfigured()) return preferred;
  return tdlibTranslateProvider;
}

/**
 * 统一翻译入口。
 * @param scenario message=右键单条；chat=聊天全部翻译。决定使用哪套提供方配置。
 */
export async function translateViaProvider(
  req: TranslateProviderRequest,
  scenario: TranslateScenario = "message",
): Promise<TranslateProviderResult> {
  return getActiveTranslateProvider(scenario).translate(req);
}
