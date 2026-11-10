<template>
    <!-- 话题项：左侧统一方形话题头像 + 标题/时间 + 发送人/预览 + 未读数。
         右侧话题侧边栏复用这套排版（与对话列表的话题展开保持一致）。 -->
    <button type="button"
        class="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors select-none"
        :class="active ? 'bg-white/85 shadow-sm dark:bg-gray-800/85' : 'hover:bg-white/60 dark:hover:bg-gray-800/60'"
        :title="topic.info.name" @click="emit('select', topic.info.forum_topic_id)">
        <ForumTopicAvatar :topic="topic" :size="44" class="shrink-0" />
        <div class="min-w-0 flex-1">
            <div class="flex justify-between items-baseline gap-2 mb-0.5">
                <h3 class="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    <GlobalEmojiText :text="topic.info.name" />
                    <span v-if="topic.info.is_closed" class="text-xs text-gray-400 ml-1">[已关闭]</span>
                </h3>
                <span class="shrink-0 text-xs text-gray-400">{{ timeText }}</span>
            </div>
            <div class="flex items-center gap-2">
                <div class="flex min-w-0 flex-1 items-center gap-1.5">
                    <Avatar v-if="senderPhoto" :photo="senderPhoto" :title="senderName"
                        :first-name="senderParts.first" :last-name="senderParts.last" sizeClass="!w-4 !h-4"
                        class="shrink-0" />
                    <span v-if="senderName" class="shrink-0 text-xs text-gray-400">
                        <GlobalEmojiText :text="senderName" />：
                    </span>
                    <p class="min-w-0 truncate text-xs text-gray-500">{{ previewText }}</p>
                </div>
                <span v-if="topic.unread_count > 0"
                    class="shrink-0 min-w-4.5 h-4.5 px-1 rounded-full bg-blue-500 text-center text-[10px] font-bold leading-4.5 text-white">
                    {{ topic.unread_count > 99 ? '99+' : topic.unread_count }}
                </span>
            </div>
        </div>
    </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { forumTopic } from 'tdlib-types';
import Avatar from './avatar.vue';
import ForumTopicAvatar from './ForumTopicAvatar.vue';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';
import formatTime from '../../utils/ui/formatTime';
import { getSenderName, getSenderNameParts, getSenderPhoto } from '../../utils/profile/senderInfo';
import { messageContentTypeLabel } from '../../utils/message/messagePreview';

const props = defineProps<{
    topic: forumTopic;
    /** 论坛 chat id（预览/跳转用） */
    chatId?: number;
    active?: boolean;
}>();

const emit = defineEmits<{
    select: [topicId: number];
}>();

const senderId = computed(() => props.topic.last_message?.sender_id);
const senderName = computed(() => getSenderName(senderId.value));
const senderPhoto = computed(() => getSenderPhoto(senderId.value));
const senderParts = computed(() => getSenderNameParts(senderId.value));
const timeText = computed(() => {
    const ts = props.topic.last_message?.date;
    return ts ? formatTime(ts) : '';
});

/** 最后一条消息预览：正文 → caption → [类型] */
const previewText = computed(() => {
    const msg = props.topic.last_message;
    if (!msg) return '';
    const content = msg.content;
    if (content._ === 'messageText') return content.text.text;
    if ('caption' in content && content.caption?.text) return content.caption.text;
    return `[${messageContentTypeLabel(content._)}]`;
});
</script>
