<template>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div v-if="showHeader"
            class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                <slot name="title">{{ title ?? t('appearance.preview') }}</slot>
            </span>
            <span v-if="subtitle || $slots.subtitle" class="text-xs text-gray-400 dark:text-gray-500">
                <slot name="subtitle">{{ subtitle }}</slot>
            </span>
        </div>
        <div :class="bodyClass">
            <slot />
        </div>
        <slot name="footer" />
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

withDefaults(defineProps<{
    /** 左侧标题，默认 i18n appearance.preview（「预览」） */
    title?: string;
    /** 右侧副标题（当前预览样式 / 模式名等） */
    subtitle?: string;
    /** 是否显示顶部标题栏 */
    showHeader?: boolean;
    /** 内容区 class */
    bodyClass?: string;
}>(), {
    title: undefined,
    subtitle: undefined,
    showHeader: true,
    bodyClass: '',
});
</script>
