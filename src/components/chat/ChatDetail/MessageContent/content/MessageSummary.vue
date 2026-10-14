<template>
    <!-- 包裹层不定位：按钮相对气泡（已加 relative）定位，贴齐气泡顶部、位于气泡外侧（Summary 列位） -->
    <div>
        <!-- 圆形图标按钮：未摘要为缩小图标，已摘要为放大图标；点击请求摘要 / 在摘要与原文间切换 -->
        <button type="button"
            class="msg-noselect absolute top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-black/5 bg-white/95 text-gray-600 shadow-md transition-colors hover:bg-white dark:border-white/10 dark:bg-gray-700/95 dark:text-gray-200 dark:hover:bg-gray-700"
            :class="outgoing ? 'right-full mr-2.5' : 'left-full ml-2.5'"
            :title="t('lng_summarize_header_title')" @click.stop="onButton">
            <span v-if="state?.active" class="tgico tgico-summary-expand text-[14px] leading-none" />
            <span v-else class="tgico tgico-summary-collapse text-[14px] leading-none" />
            <!-- 左下角 / 右上角 ✦ 交替闪烁 -->
            <span aria-hidden="true" class="summary-sparkle bottom-1 left-1 text-blue-500 dark:text-blue-400">✦</span>
            <span aria-hidden="true" class="summary-sparkle summary-sparkle-alt top-1 right-1 text-blue-500 dark:text-blue-400">✦</span>
        </button>

        <!-- 摘要头（MessageSummary）：左侧竖线 + 标题 + 「点击查看原文」；点击切回原文 -->
        <div v-if="state?.active"
            class="mb-1.5 cursor-pointer select-none rounded-[4px] border-l-2 border-blue-500 bg-blue-500/10 py-1 pl-2 pr-1 dark:border-blue-400 dark:bg-blue-400/10"
            :title="t('lng_summarize_header_about')" @click.stop="onToggle">
            <div class="text-xs font-semibold text-blue-500 dark:text-blue-400">
                {{ t('lng_summarize_header_title') }}
            </div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ t('lng_summarize_header_about') }}</div>

            <!-- 请求中 -->
            <div v-if="state.pending" class="mt-1 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <LoaderIndicator size="14" color="#6b7280" />
                {{ t('lng_contacts_loading') }}
            </div>

            <!-- 错误：点击重试 -->
            <div v-else-if="state.error" class="mt-1 text-sm text-red-500 dark:text-red-400 wrap-break-word">
                {{ errorLabel }}
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    getMessageSummary,
    requestMessageSummary,
    toggleMessageSummary,
} from '../../../../../store/summary';
import LoaderIndicator from '../../../../common/LoaderIndicator';

const props = defineProps<{
    chatId: number;
    messageId: number;
    /** 是否为自己发出的消息：按钮放在气泡左侧，否则放在右侧 */
    outgoing?: boolean;
}>();

const { t } = useI18n();

const state = computed(() => getMessageSummary(props.chatId, props.messageId));

const errorLabel = computed(() => {
    const err = state.value?.error;
    if (!err) return '';
    return err.startsWith('lng_') ? t(err) || err : err;
});

function onButton() {
    if (state.value) {
        onToggle();
    } else {
        void requestMessageSummary(props.chatId, props.messageId);
    }
}

function onToggle() {
    toggleMessageSummary(props.chatId, props.messageId);
}
</script>
