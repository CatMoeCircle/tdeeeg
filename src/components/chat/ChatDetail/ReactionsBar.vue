<template>
    <!-- 多根组件无法自动继承 class，手动合并到气泡条根节点 -->
    <div class="reactions-bar flex flex-wrap gap-1 mt-1"
        :class="[isSelf ? 'justify-end' : 'justify-start', $attrs.class]">
        <!-- 已有 reaction 按钮 -->
        <button v-for="reaction in visibleReactions" :key="getReactionKey(reaction)" type="button"
            class="reaction-btn inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors duration-150 select-none"
            :class="reaction.is_chosen
                ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
            @click.stop="toggleReaction(reaction.type)" @mouseenter="onReactionHover(reaction)"
            @contextmenu.prevent.stop="openReactionList(reaction)"
            :title="getReactionTooltip(reaction)">
            <!-- Emoji 反应：getEmojiReaction 动态动画（Unigram 同源） -->
            <ReactionEmojiAnim v-if="isReactionEmoji(reaction.type)" :emoji="reaction.type.emoji" :size="18"
                :fallback-font="16" />
            <!-- 自定义 Emoji 反应 -->
            <CustomEmojiInline v-else-if="isReactionCustomEmoji(reaction.type)" :emojiId="reaction.type.custom_emoji_id"
                :size="18" :fallbackText="reaction.type.custom_emoji_id" />
            <!-- 付费反应 -->
            <PaidReactionIcon v-else-if="isReactionPaid(reaction.type)" :size="18" />
            <!-- ≤3 人：头像叠加（1–3 个最近回应者） -->
            <span v-if="showAvatarStack(reaction)" class="reaction-avatars flex items-center"
                :class="stackOverlapClass(reaction)">
                <span v-for="s in recentSendersOf(reaction)" :key="senderKey(s)"
                    class="reaction-avatar inline-flex overflow-hidden rounded-full ring-2 shrink-0"
                    :class="reaction.is_chosen
                        ? 'ring-blue-100 dark:ring-blue-900/50'
                        : 'ring-gray-100 dark:ring-gray-800'">
                    <Avatar :photo="getSenderPhoto(s)" :title="getSenderName(s)"
                        :accentColorId="getSenderProfileAccentColorId(s)" :deletedAccount="isDeletedSender(s)" />
                </span>
            </span>
            <!-- 计数（>3 人或无头像数据时） -->
            <span v-else class="font-medium tabular-nums leading-none">{{ formatCount(reaction.total_count) }}</span>
        </button>
    </div>

    <!-- 回应列表（右键某个回应打开） -->
    <ReactionListDialog v-model="listVisible" :msg="msg" :initial-type="listReactionType" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, ref, watch } from 'vue';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import PaidReactionIcon from '../../common/PaidReactionIcon.vue';
import ReactionEmojiAnim from '../../common/ReactionEmojiAnim.vue';
import Avatar from '../avatar.vue';
import ReactionListDialog from './ReactionListDialog.vue';
import type { message, messageReaction, MessageSender, ReactionType } from 'tdlib-types';
import {
    isReactionEmoji,
    isReactionCustomEmoji,
    isReactionPaid,
    getMessageReactions,
} from '../../../utils/reactionHelpers';
import {
    ensureSenderLoaded,
    getSenderName,
    getSenderPhoto,
    getSenderProfileAccentColorId,
    isDeletedSender,
} from '../../../utils/senderInfo';

const { t } = useI18n();

// 模板为多根（气泡条 + 弹窗），class 等 attrs 需手动挂到气泡条根节点
defineOptions({ inheritAttrs: false });

const props = defineProps<{
    /** 消息对象 */
    msg: message;
    /** 是否为自己的消息（自己靠右对齐，他人靠左） */
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
    const text = isReactionEmoji(reaction.type) ? reaction.type.emoji : t('lng_sr_message_column_paid_reactions');
    const chosen = reaction.is_chosen ? ' (已选中)' : '';
    return `${text} ${reaction.total_count}${chosen}`;
}

/** reaction hover 回应（预留：可显示详细信息） */
function onReactionHover(_reaction: messageReaction) {
    // 预留：可显示 reaction 详情
}

// ===== ≤3 人头像叠加 =====

function senderKey(s: MessageSender): string {
    return s._ === 'messageSenderUser' ? `u${s.user_id}` : `c${s.chat_id}`;
}

/** 该回应最近的回应者（TDLib 最多给 3 个） */
function recentSendersOf(reaction: messageReaction): MessageSender[] {
    return (reaction.recent_sender_ids ?? []).slice(0, 3);
}

/**
 * 是否改用头像叠加：
 * 群组/私聊中回应人数 ≤3 且有 recent_sender_ids 时，以 1–3 个头像叠加代替数字。
 * 频道等拿不到 recent_sender_ids 的场景仍显示计数。
 */
function showAvatarStack(reaction: messageReaction): boolean {
    if (isReactionPaid(reaction.type)) return false;
    if (reaction.total_count <= 0 || reaction.total_count > 3) return false;
    return recentSendersOf(reaction).length > 0;
}

/** 头像水平重叠间距：1 人不重叠，2–3 人负间距叠放 */
function stackOverlapClass(reaction: messageReaction): string {
    const n = recentSendersOf(reaction).length;
    return n >= 2 ? '-space-x-1' : '';
}

/** 预加载回应者头像/名称 */
const allRecentSenders = computed(() => {
    const list: MessageSender[] = [];
    for (const r of visibleReactions.value) {
        list.push(...recentSendersOf(r));
    }
    return list;
});

watch(
    allRecentSenders,
    (senders) => {
        for (const s of senders) void ensureSenderLoaded(s);
    },
    { immediate: true, deep: true },
);

// ===== 回应列表（右键） =====

const listVisible = ref(false);
const listReactionType = ref<ReactionType | undefined>(undefined);

/** 右键某个回应：打开回应列表并默认筛到该回应 */
function openReactionList(reaction: messageReaction) {
    listReactionType.value = reaction.type;
    listVisible.value = true;
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

.reaction-avatars {
    height: 18px;
}

.reaction-avatar {
    width: 18px;
    height: 18px;
}

.reaction-add-btn {
    width: 28px;
    height: 28px;
}

.reaction-add-btn:active {
    transform: scale(0.9);
}
</style>
