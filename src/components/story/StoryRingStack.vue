<template>
    <span v-if="ids.length" class="flex items-center shrink-0">
        <span class="flex items-center -space-x-1.5 shrink-0">
            <StoryRingItem v-for="id in ids" :key="id" :chat-id="id" :size="22" no-drag />
        </span>
        <!-- 超过 3 个时右边出现箭头：展开/收起对话列表搜索栏上方的「更多动态」 -->
        <button v-if="overflowIds.length" type="button" data-tauri-drag-region-exclude
            class="ml-1 w-5 h-5 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-white/70 dark:hover:bg-gray-700/70 transition-colors"
            :title="storiesExpanded ? t('story.collapseMore') : t('story.expandMore')"
            :aria-expanded="storiesExpanded" :aria-label="storiesExpanded ? t('story.collapseMore') : t('story.expandMore')"
            @click.stop="toggleExpanded">
            <ChevronDownIcon class="w-3.5 h-3.5 transition-transform duration-200"
                :class="storiesExpanded ? 'rotate-180' : ''" />
        </button>
    </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown as ChevronDownIcon } from "lucide-vue-next";
import StoryRingItem from "./StoryRingItem.vue";
import {
    MAX_STORY_RINGS,
    getOrderedStoryChatIds,
    getOverflowStoryChatIds,
    storiesExpanded,
} from "../../store/storyRing";

/**
 * 标题栏右侧的动态头像叠加（最多 3 个），像回应/评论那样叠放，
 * 每个头像自带动态渐变描边（看过后变灰）。点击直接播放对应对话的动态。
 * 超过 3 个时出现右侧箭头，把剩下的动态展开到对话列表搜索栏上方。
 */

const { t } = useI18n();

const ids = computed(() => getOrderedStoryChatIds().slice(0, MAX_STORY_RINGS));
const overflowIds = computed(() => getOverflowStoryChatIds());

function toggleExpanded() {
    storiesExpanded.value = !storiesExpanded.value;
}
</script>
