import { reactive } from 'vue';
import type { message, SpeechRecognitionResult } from 'tdlib-types';

/**
 * 已展开识别文本的消息（key = chatId:messageId）。
 * 右侧转文字按钮与语音 / 圆形视频气泡内的识别文本共用此状态。
 */
export const openTranscripts = reactive(new Set<string>());

export function transcriptKey(chatId: number, messageId: number): string {
    return `${chatId}:${messageId}`;
}

/** 语音 / 圆形视频的识别结果；其他消息返回 undefined */
export function speechResultOf(msg: message): SpeechRecognitionResult | undefined {
    const c = msg.content;
    if (c._ === 'messageVoiceNote') return c.voice_note.speech_recognition_result;
    if (c._ === 'messageVideoNote') return c.video_note.speech_recognition_result;
    return undefined;
}
