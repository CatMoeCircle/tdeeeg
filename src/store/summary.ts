import { reactive } from "vue";
import type { formattedText, message, textEntity } from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";
import { detectInlineEntities } from "../utils/textEntityDetect";
import { settings } from "./settings";

/**
 * AI 摘要（TDLib summarizeMessage）状态，对齐 Unigram 的 SummarizedText 语义：
 * - 仅 summary_language_code 非空且非自己发出的文本消息可摘要（CanSummarizeText 发布版判定）
 * - 结果按 `${chatId}:${messageId}` 缓存在内存中
 * - active=true 时摘要原位替换正文，并显示摘要头；点击摘要头切回原文（缓存保留）
 *
 * 文案使用官方键：lng_summarize_header_title / lng_summarize_header_about
 */

export interface MessageSummaryState {
    /** 摘要文本 */
    text: string;
    /** 摘要实体（偏移对应 text） */
    entities: textEntity[];
    /** 正在请求 */
    pending: boolean;
    /** 错误信息（lng_ 键或原始报错） */
    error: string;
    /** 是否以摘要替换正文 */
    active: boolean;
}

export const messageSummaries = reactive<Record<string, MessageSummaryState>>({});

function summaryKey(chatId: number, messageId: number): string {
    return `${chatId}:${messageId}`;
}

/** 获取某条消息的摘要状态（无则返回 null） */
export function getMessageSummary(chatId: number, messageId: number): MessageSummaryState | null {
    return messageSummaries[summaryKey(chatId, messageId)] ?? null;
}

/**
 * 消息是否可做 AI 摘要：有 summary_language_code 且不是自己发出的消息。
 * isSelf 对应 MessageContent 的 isSelf（即 isOutgoingMsg）。
 */
export function canSummarizeMessage(msg: message | null | undefined, isSelf?: boolean): boolean {
    return !!msg && !isSelf && !!msg.summary_language_code;
}

/** 请求摘要并写入状态；已有结果则仅切换为摘要显示 */
export async function requestMessageSummary(chatId: number, messageId: number): Promise<void> {
    const key = summaryKey(chatId, messageId);
    const cur = messageSummaries[key];
    if (cur?.pending) return;
    if (cur?.text) {
        messageSummaries[key] = { ...cur, active: true };
        return;
    }

    messageSummaries[key] = { text: "", entities: [], pending: true, error: "", active: true };
    try {
        const res = await tdlibSend({
            _: "summarizeMessage",
            chat_id: chatId,
            message_id: messageId,
            translate_to_language_code: settings.translate.to || "",
            tone: "",
        });
        const text = res?.text?.trim() ? res.text : "";
        const latest = messageSummaries[key];
        if (!latest) return; // 已被移除
        messageSummaries[key] = {
            ...latest,
            text,
            entities: text ? detectInlineEntities(text, res?.entities ?? []) : [],
            pending: false,
            error: text ? "" : "lng_translate_box_error",
        };
    } catch (e: any) {
        const latest = messageSummaries[key];
        if (!latest) return;
        messageSummaries[key] = {
            ...latest,
            pending: false,
            error: (e?.message as string) || "lng_translate_box_error",
        };
    }
}

/**
 * 点击摘要头：有结果时在摘要与原文之间切换；
 * 出错时重新请求。
 */
export function toggleMessageSummary(chatId: number, messageId: number): void {
    const key = summaryKey(chatId, messageId);
    const cur = messageSummaries[key];
    if (!cur || cur.pending) return;
    if (cur.error) {
        delete messageSummaries[key];
        void requestMessageSummary(chatId, messageId);
        return;
    }
    messageSummaries[key] = { ...cur, active: !cur.active };
}

/** 供正文显示的摘要结果（仅 active 且有文本时返回，否则 null） */
export function getActiveSummaryFormattedText(chatId: number, messageId: number): formattedText | null {
    const cur = getMessageSummary(chatId, messageId);
    if (!cur || !cur.active || !cur.text) return null;
    return { _: "formattedText", text: cur.text, entities: cur.entities };
}
