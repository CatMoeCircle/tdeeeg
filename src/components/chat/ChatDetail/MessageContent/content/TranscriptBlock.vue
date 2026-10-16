<template>
    <!-- 语音 / 圆形视频的识别文本。
         翻译入口在右键菜单（识别完成后「翻译」替代「转文字」）；这里只负责显示：
         - replace 模式：译文到达后原位顶替识别文本
         - inline 模式：识别文本下方追加译文块
         - popup 模式：不写状态，译文在翻译弹窗里 -->
    <div class="mt-1 min-w-0">
        <p class="whitespace-pre-wrap text-sm" :class="error ? 'text-gray-500 dark:text-gray-400' : ''">
            {{ displayText }}
        </p>
        <p v-if="inlineText"
            class="mt-1 whitespace-pre-wrap border-t border-black/10 pt-1 text-sm text-gray-700 dark:border-white/10 dark:text-gray-300">
            {{ inlineText }}
        </p>
        <p v-if="errorLabel" class="mt-1 text-sm text-red-500 dark:text-red-400">{{ errorLabel }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getTranscriptTranslation } from '../../../../../composables/speechTranscript';
import { isTranslateReplaceDisplay } from '../../../../../store/translate';

const props = defineProps<{
    chatId?: number;
    messageId?: number;
    /** 展示文本（识别结果 / 识别中 / 无法识别） */
    text: string;
    /** 识别失败态：用次要颜色显示 */
    error?: boolean;
}>();

const { t } = useI18n();

const translation = computed(() => (props.chatId != null && props.messageId != null
    ? getTranscriptTranslation(props.chatId, props.messageId)
    : null));

const replaceDisplay = computed(() => isTranslateReplaceDisplay());
const translatedText = computed(() => translation.value?.text ?? '');
const displayText = computed(() => (replaceDisplay.value && translatedText.value ? translatedText.value : props.text));
const inlineText = computed(() => (!replaceDisplay.value ? translatedText.value : ''));

const errorLabel = computed(() => {
    const err = translation.value?.error;
    if (!err) return '';
    return err.startsWith('lng_') ? t(err) : err;
});
</script>
