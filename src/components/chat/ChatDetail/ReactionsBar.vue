<template>
    <div class="reactions-bar flex flex-wrap gap-1 mt-1" :class="{ 'justify-end': isSelf }">
        <!-- 已有 reaction 按钮 -->
        <button v-for="reaction in visibleReactions" :key="getReactionKey(reaction)" type="button"
            class="reaction-btn inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-all duration-150 select-none"
            :class="reaction.is_chosen
                ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
            @click.stop="toggleReaction(reaction.type)" @mouseenter="onReactionHover(reaction)"
            :title="getReactionTooltip(reaction)">
            <!-- Emoji 反应 -->
            <span v-if="isReactionEmoji(reaction.type)" class="leading-none">{{ reaction.type.emoji }}</span>
            <!-- 自定义 Emoji 反应 -->
            <CustomEmojiInline v-else-if="isReactionCustomEmoji(reaction.type)" :emojiId="reaction.type.custom_emoji_id"
                :size="16" :fallbackText="reaction.type.custom_emoji_id" />
            <!-- 付费反应 -->
            <PaidReactionIcon v-else-if="isReactionPaid(reaction.type)" :size="16" />
            <!-- 计数 -->
            <span class="font-medium tabular-nums leading-none">{{ formatCount(reaction.total_count) }}</span>
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import PaidReactionIcon from '../../common/PaidReactionIcon.vue';
import type { message, messageReaction, ReactionType } from 'tdlib-types';
import {
    isReactionEmoji,
    isReactionCustomEmoji,
    isReactionPaid,
    getMessageReactions,
} from '../../../utils/reactionHelpers';

const props = defineProps<{
    /** 消息对象 */
    msg: message;
    /** 是否为自己的消息（影响对齐方向） */
    isSelf?: boolean;
}>();

const emit = defineEmits<{
    /** 切换 reaction（添加或移除） */
    (e: 'toggle-reaction', type: ReactionType): void;
}>();

/** 可见的 reaction 列表（最多显示前 6 个） */
const visibleReactions = computed(() => {
    const reactions = getMessageReactions(props.msg);
    if (!reactions?.reactions) return [];
    return reactions.reactions.slice(0, 6);
});

/** 生成 reaction 按钮的唯一 key */
function getReactionKey(reaction: messageReaction): string {
    if (isReactionEmoji(reaction.type)) return `emoji-${reaction.type.emoji}`;
    if (isReactionCustomEmoji(reaction.type)) return `custom-${reaction.type.custom_emoji_id}`;
    if (isReactionPaid(reaction.type)) return 'paid';
    return 'unknown';
}

/** 格式化计数（超过 999 显示为 1k 等） */
function formatCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
}

/** 切换 reaction */
function toggleReaction(type: ReactionType) {
    emit('toggle-reaction', type);
}

/** 获取 reaction tooltip */
function getReactionTooltip(reaction: messageReaction): string {
    const text = isReactionEmoji(reaction.type) ? reaction.type.emoji : '付费回应';
    const chosen = reaction.is_chosen ? ' (已选中)' : '';
    return `${text} ${reaction.total_count}${chosen}`;
}

/** reaction hover 回应（预留：可显示详细信息） */
function onReactionHover(_reaction: messageReaction) {
    // 预留：可显示 reaction 详情
}
</script>

<style scoped>
.reaction-btn {
    height: 28px;
    min-width: 0;
    line-height: 1;
}

.reaction-btn:active {
    transform: scale(0.95);
}

.reaction-add-btn {
    width: 28px;
    height: 28px;
}

.reaction-add-btn:active {
    transform: scale(0.9);
}
</style>
