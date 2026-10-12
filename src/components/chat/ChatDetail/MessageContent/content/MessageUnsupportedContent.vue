<template>
    <!-- 未适配消息卡片（对齐官方客户端 Unsupported message 的版式：图标 + 标题/说明 + 按钮） -->
    <div class="flex max-w-[320px] min-w-0 items-center gap-2.5 rounded-2xl bg-white/40 px-3 py-2.5 backdrop-blur-md dark:bg-black/20">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" :style="accentStyle">
            <SendIcon class="h-5 w-5" />
        </div>
        <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ title }}</p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400" :class="detailClass">{{ detail }}</p>
        </div>
        <button type="button"
            class="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
            :style="accentStyle" @click="onAction">
            {{ actionLabel }}
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Send as SendIcon } from 'lucide-vue-next';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { MessageContent } from 'tdlib-types';
import { accentColorStyle } from '../../../../../store/colors';
import { openOfficialGroup, PROJECT_REPO_URL } from '../../../../../utils/appLinks';

const props = defineProps<{
    content: MessageContent;
}>();

const { t } = useI18n();
const router = useRouter();

/** TDLib 自己就不认识的内容（messageUnsupported）：本地无处可查，引导到仓库 */
const unknownToTdlib = computed(() => props.content._ === 'messageUnsupported');

/** 卡片配色跟随 accent（与抽奖卡片同一套，明暗主题自适应） */
const accentStyle = computed(() => {
    const s = accentColorStyle(5);
    return { backgroundColor: s.soft, color: s.color };
});

const title = computed(() =>
    unknownToTdlib.value ? t('content.unsupportedTitle') : t('content.unsupportedNotAdapted'),
);

/** 未适配时把类型名显示出来，用户反馈时能直接带上 */
const detail = computed(() =>
    unknownToTdlib.value ? t('content.unsupportedUpdateHint') : props.content._,
);

const detailClass = computed(() => (unknownToTdlib.value ? '' : 'font-mono break-all'));

const actionLabel = computed(() =>
    unknownToTdlib.value ? t('content.unsupportedOpenRepo') : t('content.unsupportedReport'),
);

function onAction() {
    if (unknownToTdlib.value) {
        void openUrl(PROJECT_REPO_URL);
        return;
    }
    void openOfficialGroup(router);
}
</script>
