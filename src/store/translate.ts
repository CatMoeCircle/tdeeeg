import { ref } from "vue";
import type { formattedText, message } from "tdlib-types";

/**
 * 「翻译消息」弹窗的全局状态。
 * ChatDetail 的右键菜单调用 showTranslateDialog 打开，由挂载的
 * TranslateMessageModal.vue 监听 visible 渲染，翻译逻辑在弹窗内部完成。
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
