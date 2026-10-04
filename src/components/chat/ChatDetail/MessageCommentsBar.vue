<template>
    <!-- 频道消息底部评论行（参考 Unigram MessageBubble 的 Thread 行）：
         最近评论者头像 / 评论图标 + 评论数或「发表评论」+ 未读点 + 右箭头 -->
    <!-- 注意：button 是表单控件，width:auto 为 fit-content，负 margin 不会把它拉宽；
         文本气泡要出血请在外层 div 用 -mx-2（块级 div 才会被负 margin 拉伸），本体保持 w-full -->
    <button type="button"
        class="msg-comments-bar flex w-full items-center gap-1.5 text-left text-[13px] leading-none select-none cursor-pointer transition-colors hover:bg-black/[0.04] dark:hover:bg-white/5"
        :title="label" :aria-label="label" @click.stop="emit('open')">
        <!-- 最近评论者头像（≤3，叠放） -->
        <span v-if="repliers.length" class="flex shrink-0 items-center" :class="repliers.length > 1 ? '-space-x-1' : ''">
            <span v-for="s in repliers" :key="senderKey(s)"
                class="inline-flex h-5 w-5 overflow-hidden rounded-full ring-1 ring-white dark:ring-gray-800">
                <Avatar :photo="getSenderPhoto(s)" :title="getSenderName(s)" :accentColorId="getSenderProfileAccentColorId(s)"
                    :deletedAccount="isDeletedSender(s)" />
            </span>
        </span>
        <!-- 无评论者数据时显示留言图标：tgico 字体 U+E965（index.css 的 .tgico-comments） -->
        <span v-else aria-hidden="true"
            class="tgico tgico-comments shrink-0 text-[16px] text-gray-400 dark:text-gray-500" />
        <span class="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">{{ label }}</span>
        <!-- 有未读评论：蓝点提示 -->
        <span v-if="hasUnread" class="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
        <ChevronRightIcon class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
    </button>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { message, MessageSender } from 'tdlib-types';
import Avatar from '../avatar.vue';
import { ChevronRightIcon } from 'lucide-vue-next';
import { tdPlural } from '../../../utils/tdLang';
import {
    ensureSenderLoaded,
    getSenderName,
    getSenderPhoto,
    getSenderProfileAccentColorId,
    isDeletedSender,
} from '../../../utils/senderInfo';

const { t } = useI18n();

const props = defineProps<{
    /** 频道消息（需含 interaction_info.reply_info，即已关联讨论组） */
    msg: message;
}>();

const emit = defineEmits<{
    open: [];
}>();

/** 评论信息（频道帖子已关联讨论组时由 TDLib 提供） */
const replyInfo = computed(() => props.msg.interaction_info?.reply_info);

/** 评论数 */
const count = computed(() => replyInfo.value?.reply_count ?? 0);

/** 行内文案：有评论显示数量，无评论显示「发表评论」 */
const label = computed(() =>
    count.value > 0
        ? tdPlural('lng_comments_open_count', count.value)
        : t('lng_comments_open_none')
);

/** 最近评论者（TDLib 最多给 3 个） */
const repliers = computed(() => (replyInfo.value?.recent_replier_ids ?? []).slice(0, 3));

/** 是否有未读评论（线程最后一条消息晚于已读收件箱消息） */
const hasUnread = computed(() => {
    const r = replyInfo.value;
    if (!r) return false;
    return r.last_read_inbox_message_id > 0 && r.last_message_id > r.last_read_inbox_message_id;
});

function senderKey(s: MessageSender): string {
    return s._ === 'messageSenderUser' ? `u${s.user_id}` : `c${s.chat_id}`;
}

/** 预加载最近评论者头像 / 名称 */
watch(
    repliers,
    (list) => {
        for (const s of list) void ensureSenderLoaded(s);
    },
    { immediate: true, deep: true },
);
</script>
