<template>
    <div class="mt-1.5 pt-2 border-t border-black/10 dark:border-white/10">
        <!-- 语言选择 + 关闭（非 compact） -->
        <div v-if="!compact" class="flex items-center gap-2 mb-1">
            <t-select class="z-999" v-model="targetLang" :options="targetOptions" :borderless="true"
                filterable size="small" style="width: 160px" :placeholder="t('lng_translate_menu_to')" />
            <button type="button" class="text-gray-400 hover:text-red-500 transition-colors"
                :title="t('lng_translate_show_original')" @click.stop="removeTranslation">
                <XIcon class="w-3.5 h-3.5" />
            </button>
        </div>
        <!-- compact：全部翻译视口结果，仅显示标签 + 关闭 -->
        <div v-else class="flex items-center justify-between mb-1">
            <span class="text-[10px] font-medium text-blue-500 dark:text-blue-400 uppercase tracking-wide">
                {{ languageBadge }}
            </span>
            <button type="button" class="text-gray-400 hover:text-red-500 transition-colors"
                :title="t('lng_translate_show_original')" @click.stop="removeTranslation">
                <XIcon class="w-3 h-3" />
            </button>
        </div>

        <!-- 翻译中 -->
        <div v-if="translation.translating" class="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <LoaderIndicator size="16" color="#6b7280" />
            {{ t('lng_contacts_loading') }}
        </div>

        <!-- 错误 -->
        <div v-else-if="translation.error"
            class="text-sm text-red-500 dark:text-red-400 wrap-break-word">
            {{ errorLabel }}
        </div>

        <!-- 译文 -->
        <div v-else-if="translation.translatedText"
            class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap wrap-break-word">
            {{ translation.translatedText }}
        </div>

        <!-- 兜底：三态皆空时也给出反馈，避免出现空白分区 -->
        <div v-else class="text-sm text-gray-400 dark:text-gray-500">
            {{ t('lng_translate_box_error') || '翻译失败' }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { XIcon } from "lucide-vue-next";
import type { formattedText } from "tdlib-types";
import {
    getInlineTranslation,
    removeInlineTranslation,
    translateInlineMessage,
} from "../../../../../store/translate";
import {
    DEFAULT_TRANSLATE_TARGET,
    TRANSLATE_TARGET_LANGUAGES,
    getTranslateLanguageLabel,
} from "../../../../../utils/translateLanguages";
import LoaderIndicator from "../../../../common/LoaderIndicator";

const props = defineProps<{
    chatId: number;
    messageId: number;
    /** 待翻译的富文本（重译时使用） */
    text: formattedText | null;
    /** 全部翻译视口结果：紧凑展示，不显示语言下拉 */
    compact?: boolean;
}>();

const { t } = useI18n();

const translation = computed(() => {
    const cur = getInlineTranslation(props.chatId, props.messageId);
    if (!cur) {
        return {
            targetLang: DEFAULT_TRANSLATE_TARGET,
            translatedText: "",
            translating: false,
            error: "",
            source: "manual" as const,
        };
    }
    // 显式读取各字段，确保嵌套变更会触发 computed / 视图更新
    return {
        targetLang: cur.targetLang,
        translatedText: cur.translatedText,
        translating: cur.translating,
        error: cur.error,
        source: cur.source,
    };
});

const targetOptions = computed(() =>
    TRANSLATE_TARGET_LANGUAGES.map((l) => ({ label: `${l.label} (${l.code})`, value: l.code })),
);

const languageBadge = computed(() => getTranslateLanguageLabel(translation.value.targetLang) || '译文');

const FALLBACK_ERROR = '翻译失败';

const errorLabel = computed(() => {
    const err = translation.value.error;
    if (!err) return FALLBACK_ERROR;
    if (err.startsWith('lng_')) return t(err) || FALLBACK_ERROR;
    return err || FALLBACK_ERROR;
});

const targetLang = computed({
    get: () => translation.value.targetLang,
    set: (v: string) => {
        // 切换目标语言时重新翻译
        if (props.text) {
            void translateInlineMessage(props.chatId, props.messageId, props.text, v);
        }
    },
});

function removeTranslation() {
    removeInlineTranslation(props.chatId, props.messageId);
}
</script>
