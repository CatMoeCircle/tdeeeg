import { reactive, ref } from "vue";
import type { chat, formattedText, message } from "tdlib-types";
import { settings } from "./settings";
import {
    translateViaProvider,
    isOfficialProvider,
    type TranslateScenario,
} from "../utils/translateProvider";
import {
    DEFAULT_TRANSLATE_TARGET,
    uiLanguageToTranslateCode,
} from "../utils/translateLanguages";
import {
    shouldTranslateText,
    type ShouldTranslateDecision,
} from "../utils/languageDetect";

/**
 * 「翻译消息」弹窗 + 内联翻译 + 聊天「全部翻译」的全局状态。
 *
 * - 单条消息：右键「翻译」→ 弹窗或内联（settings.translate.displayMode）
 * - 全部翻译：ChatTranslateBar 开启后，**仅翻译视口内**的消息
 * - 执行统一走 translateViaProvider，便于接入第三方 API / AI
 */

export interface TranslateRequest {
    /** 源对话 id */
    chatId: number;
    /** 待翻译的消息 */
    msg: message;
    /** 待翻译的富文本（原样传给翻译提供方） */
    text: formattedText;
    /** 纯文本（用于语言检测与原文展示） */
    plainText: string;
}

export const translateVisible = ref(false);
export const translateRequest = ref<TranslateRequest | null>(null);

/** 打开翻译弹窗 */
export function showTranslateDialog(req: TranslateRequest) {
    translateRequest.value = req;
    translateVisible.value = true;
}

/** 关闭翻译弹窗 */
export function hideTranslateDialog() {
    translateVisible.value = false;
    translateRequest.value = null;
}

// ==================== 内联 / 视口翻译状态 ====================

export type TranslateSource =
    /** 用户在右键菜单/弹窗中主动翻译 */
    | "manual"
    /** 「全部翻译」开启后，视口内自动翻译 */
    | "viewport";

/** 每条消息的内联翻译结果，以 `${chatId}:${messageId}` 为 key */
export interface InlineTranslation {
    /** 翻译目标语言码 */
    targetLang: string;
    /** 译文文本 */
    translatedText: string;
    /** 正在翻译 */
    translating: boolean;
    /** 错误信息 */
    error: string;
    /** 来源：关掉「全部翻译」时仅清除 viewport 来源 */
    source: TranslateSource;
}

export const inlineTranslations = reactive<Record<string, InlineTranslation>>({});

function inlineKey(chatId: number, messageId: number): string {
    return `${chatId}:${messageId}`;
}

/** 获取某条消息的内联翻译（无则返回 null） */
export function getInlineTranslation(chatId: number, messageId: number): InlineTranslation | null {
    return inlineTranslations[inlineKey(chatId, messageId)] ?? null;
}

/** 移除某条消息的内联翻译 */
export function removeInlineTranslation(chatId: number, messageId: number) {
    delete inlineTranslations[inlineKey(chatId, messageId)];
}

/** 对某条消息执行内联翻译并写入状态。返回最终是否成功。 */
export async function translateInlineMessage(
    chatId: number,
    messageId: number,
    text: formattedText,
    targetLang: string,
    source: TranslateSource = "manual",
    plainText = "",
): Promise<boolean> {
    const key = inlineKey(chatId, messageId);
    inlineTranslations[key] = {
        targetLang,
        translatedText: inlineTranslations[key]?.translatedText ?? "",
        translating: true,
        error: "",
        source,
    };
    // 右键手动翻译走 message 场景提供方；全部翻译视口走 chat 场景
    const scenario: TranslateScenario = source === "viewport" ? "chat" : "message";
    try {
        const res = await translateViaProvider({
            text,
            plainText: plainText || text.text || "",
            toLanguageCode: targetLang,
            chatId,
            messageId,
        }, scenario);
        const cur = inlineTranslations[key];
        if (!cur) return false; // 已被移除（例如消息删除 / 关闭全部翻译）
        const translated = (res?.text ?? "").trim() ? (res!.text as string) : "";
        // 整对象替换：避免仅改嵌套字段时列表项 computed 不刷新
        inlineTranslations[key] = {
            ...cur,
            translatedText: translated,
            translating: false,
            error: translated ? "" : "lng_translate_box_error",
        };
        return !!translated;
    } catch (e: any) {
        const cur = inlineTranslations[key];
        if (!cur) return false;
        inlineTranslations[key] = {
            ...cur,
            translating: false,
            error: (e?.message as string) || "lng_translate_box_error",
        };
        return false;
    }
}

// ==================== 聊天「全部翻译」状态 ====================

/** 每个对话是否开启全部翻译（持久化到 localStorage） */
const CHAT_TRANSLATE_KEY = "tdgram-chat-translating";

function loadChatTranslating(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(CHAT_TRANSLATE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
        return {};
    }
}

const chatTranslatingState = reactive<Record<string, boolean>>(loadChatTranslating());

function persistChatTranslating() {
    try {
        localStorage.setItem(CHAT_TRANSLATE_KEY, JSON.stringify(chatTranslatingState));
    } catch {
        // ignore
    }
}

/** 当前对话是否开启全部翻译 */
export function isChatTranslating(chatId: number | undefined | null): boolean {
    if (chatId == null) return false;
    return !!chatTranslatingState[String(chatId)];
}

/** 开启/关闭某个对话的全部翻译 */
export function setChatTranslating(chatId: number, on: boolean) {
    chatTranslatingState[String(chatId)] = on;
    persistChatTranslating();
}

/** 切换某个对话的全部翻译，返回切换后的值 */
export function toggleChatTranslating(chatId: number): boolean {
    const next = !isChatTranslating(chatId);
    setChatTranslating(chatId, next);
    return next;
}

/** 清除某对话全部 viewport 来源的译文（保留用户手动翻译） */
export function clearViewportTranslations(chatId: number) {
    const prefix = `${chatId}:`;
    for (const key of Object.keys(inlineTranslations)) {
        if (!key.startsWith(prefix)) continue;
        if (inlineTranslations[key]?.source === "viewport") {
            delete inlineTranslations[key];
        }
    }
}

/** 消息是否含可翻译文本（文本 / 媒体 caption） */
export function hasTranslatableText(msg: message): boolean {
    const c = msg.content;
    if (!c) return false;
    return (
        (c._ === "messageText" && !!c.text?.text?.trim()) ||
        ((c._ === "messagePhoto" || c._ === "messageVideo" || c._ === "messageAnimation"
            || c._ === "messageVoiceNote" || c._ === "messageAudio" || c._ === "messageDocument"
            || c._ === "messagePaidMedia") && !!c.caption?.text?.trim())
    );
}

/** 语言门控结果缓存：`${targetLang}:${doNotKey}:${text}` → 决策，避免滚动时重复推理 */
const shouldTranslateCache = new Map<string, ShouldTranslateDecision>();
const SHOULD_TRANSLATE_CACHE_MAX = 512;

function shouldTranslateCacheKey(text: string, targetLang: string, doNot: string[]): string {
    return `${targetLang}|${doNot.join(",")}|${text}`;
}

function rememberShouldTranslate(key: string, decision: ShouldTranslateDecision) {
    if (shouldTranslateCache.size >= SHOULD_TRANSLATE_CACHE_MAX) {
        const oldest = shouldTranslateCache.keys().next().value;
        if (oldest !== undefined) shouldTranslateCache.delete(oldest);
    }
    shouldTranslateCache.set(key, decision);
}

/** 清空语言门控缓存（切换目标语言 / 排除列表后） */
export function clearShouldTranslateCache() {
    shouldTranslateCache.clear();
}

/**
 * 某条消息是否应被「全部翻译」处理。
 * - 自己发出的消息不译
 * - 无文本不译
 * - 目标语言在 doNotTranslate 中不译
 * - 经 Rust 本地语言识别：源语言命中 doNotTranslate → 排除
 * - 经 Rust 本地语言识别：原文已是目标语言 → 不译
 */
export async function shouldTranslateMessage(
    msg: message,
    targetLang: string,
    plainText = "",
): Promise<boolean> {
    if (msg.is_outgoing) return false;
    if (!hasTranslatableText(msg)) return false;

    const doNot = settings.translate.doNotTranslate || [];
    if (doNot.includes(targetLang)) return false;

    const text = (plainText || "").trim();
    if (!text) return false;

    const key = shouldTranslateCacheKey(text, targetLang, doNot);
    let decision = shouldTranslateCache.get(key);
    if (!decision) {
        try {
            decision = await shouldTranslateText(text, targetLang, doNot);
        } catch {
            // 语言识别不可用时退回「照常翻译」
            return true;
        }
        rememberShouldTranslate(key, decision);
    }
    return decision.shouldTranslate;
}

/**
 * 请求翻译一条视口内消息（全部翻译模式）。
 * - 已有同语言译文且非错误态 → 跳过
 * - 正在翻译 → 跳过，避免滚动时重复请求
 * - 语言识别排除 / 已是目标语言 → 跳过
 */
export async function requestViewportTranslation(
    chatId: number,
    msg: message,
    text: formattedText,
    plainText: string,
    targetLang?: string,
): Promise<void> {
    const lang = targetLang || getTranslateTargetLang();
    if (!hasTranslatableText(msg)) return;

    const key = inlineKey(chatId, msg.id);
    const existing = inlineTranslations[key];
    if (existing) {
        // 正在翻译中 → 跳过
        if (existing.translating) return;
        // 同语言已有译文或错误态 → 不重复请求
        if (existing.targetLang === lang && (existing.translatedText || existing.error)) return;
    }

    const ok = await shouldTranslateMessage(msg, lang, plainText);
    if (!ok) return;

    void translateInlineMessage(chatId, msg.id, text, lang, "viewport", plainText);
}

/**
 * 当前目标语言。
 * - 用户在设置里单独指定 → 用该语言
 * - 未指定（to 为空）→ 跟随当前语言包 / 界面语言
 */
export function getTranslateTargetLang(): string {
    const custom = (settings.translate.to || "").trim();
    if (custom) return custom;
    const ui = settings.language?.code || "";
    return ui ? uiLanguageToTranslateCode(ui) : DEFAULT_TRANSLATE_TARGET;
}

// ==================== 全部翻译：官方接口的显示门槛 ====================

export interface ChatTranslateGateInput {
    chat: chat | undefined;
    isPremium: boolean;
    /** 超级群/频道是否开启自动翻译（supergroup.has_automatic_translation） */
    hasAutomaticTranslation: boolean;
}

/**
 * 官方接口是否允许对该会话做「全部翻译」。
 * 任一满足即可：
 * - 用户有 Premium 且 chat.is_translatable === true
 * - 会话已开 has_automatic_translation（无需 Premium）
 */
function canOfficialBulkTranslate(input: ChatTranslateGateInput): boolean {
    const c = input.chat;
    if (!c) return false;
    if (input.isPremium && c.is_translatable === true) return true;
    if (input.hasAutomaticTranslation === true) return true;
    return false;
}

/**
 * 聊天「全部翻译」栏是否允许显示。
 *
 * 决策链（命中任一即显示）：
 * 1. 用户有 Premium 且 chat.is_translatable === true
 * 2. 会话已开 has_automatic_translation（无需 Premium）
 * 3. 真正配置好的非官方提供方（第三方/AI）：上述不满足也显示
 *
 * 仍不显示：无会话、secret 私密聊天。
 * 本会话已开启过全部翻译时继续显示栏，仅便于关掉/改语言。
 */
export function canShowChatTranslateBar(input: ChatTranslateGateInput): boolean {
    const c = input.chat;
    if (!c) return false;
    if (c.type?._ === "chatTypeSecret") return false;

    // 已在本会话开启过全部翻译：继续显示栏（便于关掉/改语言）
    if (isChatTranslating(c.id)) return true;

    // 非官方提供方：不看会话能力门槛，直接显示
    if (!isOfficialProvider("chat")) {
        return true;
    }

    // 官方接口：Premium+is_translatable 或 会话已开自动翻译
    return canOfficialBulkTranslate(input);
}

/**
 * 进入会话时是否应弹出 Premium 提示。
 * Premium + is_translatable 已可直接解锁显示，故不再弹。
 */
export function shouldPromptChatTranslatePremium(_input: ChatTranslateGateInput): boolean {
    return false;
}
