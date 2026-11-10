<template>
    <div class="h-full flex items-center justify-center">
        <!-- 对话详情/等待选择对话页背后是壁纸，文案加一层磨砂胶囊保证可读性；
             联系人、设置等纯色内容区沿用原来的浅灰文案。 -->
        <span :class="isChatWaitingPage
            ? 'msg-notice-surface text-sm leading-none text-gray-500 dark:text-gray-300 px-3 py-1.5 rounded-full select-none'
            : 'text-gray-400'">
            {{ emptyStateText }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const { t } = useI18n();
/** 等待选择对话页（对话列表 / 归档列表首页）：背景铺默认壁纸 */
const isChatWaitingPage = computed(() => route.name === 'chats' || route.name === 'archived');
const emptyStateText = computed(() => {
    if (route.name === 'contacts') return t('lng_contact_details_title');
    if (route.name === 'settings') return t('home.selectSettings');
    if (route.name === 'archived') return t('home.selectArchivedChat');
    return t('lng_willbe_history');
});
</script>
