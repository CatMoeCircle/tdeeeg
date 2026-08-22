import { reactive, ref } from "vue";
import type { formattedText, message } from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";

/**
 * 「翻译消息」弹窗的全局状态。
 * ChatDetail 的右键菜单调用 showTranslateDialog 打开，由挂载的
 * TranslateMessageModal.vue 监听 visible 渲染。
 * 同时支持「内联翻译」：翻译结果显示在原消息气泡中（settings.translate.displayMode === 'inline'）。
 */

export interface TranslateRequest {
    /** 源对话 id */
    chatId: number;
    /** 待翻译的消息 */
    msg: message;
    /** 待翻译的富文本（原样传给 TDLib translateText.text） */
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

// ==================== 内联翻译状态 ====================

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
): Promise<boolean> {
    const key = inlineKey(chatId, messageId);
    inlineTranslations[key] = {
        targetLang,
        translatedText: inlineTranslations[key]?.translatedText ?? "",
        translating: true,
        error: "",
    };
    try {
        const res = await tdlibSend({
            _: "translateText",
            text,
            to_language_code: targetLang,
        }) as formattedText;
        const cur = inlineTranslations[key];
        if (!cur) return false; // 已被移除（例如消息删除）
        cur.translatedText = res?.text ?? "";
        cur.translating = false;
        if (!cur.translatedText) {
            cur.error = "翻译结果为空";
            return false;
        }
        return true;
    } catch (e: any) {
        const cur = inlineTranslations[key];
        if (!cur) return false;
        cur.translating = false;
        cur.error = e?.message || "翻译失败，请稍后重试";
        return false;
    }
}
