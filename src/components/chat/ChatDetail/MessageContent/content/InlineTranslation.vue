<template>
    <div class="mt-1.5 pt-2 border-t border-black/10 dark:border-white/10">
        <!-- 语言选择 + 关闭 -->
        <div class="flex items-center gap-2 mb-1">
            <t-select class="z-999" v-model="targetLang" :options="targetOptions" :borderless="true"
                filterable size="small" style="width: 160px" placeholder="翻译为" />
            <button type="button" class="text-gray-400 hover:text-red-500 transition-colors" title="移除翻译"
                @click.stop="removeTranslation">
                <XIcon class="w-3.5 h-3.5" />
            </button>
        </div>

        <!-- 翻译中 -->
        <div v-if="translation.translating" class="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <LoaderIndicator size="16" color="#6b7280" />
            翻译中…
        </div>

        <!-- 错误 -->
        <div v-else-if="translation.error"
            class="text-sm text-red-500 dark:text-red-400 wrap-break-word">
            {{ translation.error }}
        </div>

        <!-- 译文 -->
        <div v-else-if="translation.translatedText"
            class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap wrap-break-word">
            {{ translation.translatedText }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
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
} from "../../../../../utils/translateLanguages";
import LoaderIndicator from "../../../../common/LoaderIndicator";

const props = defineProps<{
    chatId: number;
    messageId: number;
    /** 待翻译的富文本（重译时使用） */
    text: formattedText | null;
}>();

const translation = computed(() => getInlineTranslation(props.chatId, props.messageId) ?? {
    targetLang: DEFAULT_TRANSLATE_TARGET,
    translatedText: "",
    translating: false,
    error: "",
});

const targetOptions = computed(() =>
    TRANSLATE_TARGET_LANGUAGES.map((l) => ({ label: `${l.label} (${l.code})`, value: l.code })),
);

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
