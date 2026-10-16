import { reactive } from 'vue';
import type { message, SpeechRecognitionResult } from 'tdlib-types';
import { translateViaProvider } from '../utils/translateProvider';
import { getTranslateTargetLang } from '../store/translate';

/**
 * 已展开识别文本的消息（key = chatId:messageId）。
 * 右侧转文字按钮与语音 / 圆形视频气泡内的识别文本共用此状态。
 */
export const openTranscripts = reactive(new Set<string>());

export function transcriptKey(chatId: number, messageId: number): string {
    return `${chatId}:${messageId}`;
}

/** 识别文本的译文（key 同 transcriptKey） */
export interface TranscriptTranslation {
    text: string;
    translating: boolean;
    error: string;
}

export const transcriptTranslations = reactive<Record<string, TranscriptTranslation>>({});

export function getTranscriptTranslation(chatId: number, messageId: number): TranscriptTranslation | null {
    return transcriptTranslations[transcriptKey(chatId, messageId)] ?? null;
}

export function clearTranscriptTranslation(chatId: number, messageId: number) {
    delete transcriptTranslations[transcriptKey(chatId, messageId)];
}

/**
 * 翻译识别文本。
 * 不传 chatId/messageId：TDLib translateMessageText 只取消息正文 / caption，
 * 识别结果不在其中，必须走 translateText（见 utils/translateProvider）。
 */
export async function translateTranscript(chatId: number, messageId: number, text: string): Promise<void> {
    const key = transcriptKey(chatId, messageId);
    const targetLang = getTranslateTargetLang();
    transcriptTranslations[key] = {
        text: transcriptTranslations[key]?.text ?? '',
        translating: true,
        error: '',
    };
    try {
        const res = await translateViaProvider({
            text: { _: 'formattedText', text, entities: [] },
            plainText: text,
            toLanguageCode: targetLang,
        }, 'message');
        const cur = transcriptTranslations[key];
        if (!cur) return;
        const translated = (res?.text ?? '').trim();
        transcriptTranslations[key] = {
            ...cur,
            text: translated,
            translating: false,
            error: translated ? '' : 'lng_translate_box_error',
        };
    } catch (e: any) {
        const cur = transcriptTranslations[key];
        if (!cur) return;
        transcriptTranslations[key] = {
            ...cur,
            translating: false,
            error: (e?.message as string) || 'lng_translate_box_error',
        };
    }
}

/** 语音 / 圆形视频的识别结果；其他消息返回 undefined */
export function speechResultOf(msg: message): SpeechRecognitionResult | undefined {
    const c = msg.content;
    if (c._ === 'messageVoiceNote') return c.voice_note.speech_recognition_result;
    if (c._ === 'messageVideoNote') return c.video_note.speech_recognition_result;
    return undefined;
}

/** 已完成的识别文本（可翻译）；识别中 / 失败 / 无语音消息返回 null */
export function transcriptTextOf(msg: message): string | null {
    const r = speechResultOf(msg);
    return r?._ === 'speechRecognitionResultText' && r.text.trim() ? r.text : null;
}
