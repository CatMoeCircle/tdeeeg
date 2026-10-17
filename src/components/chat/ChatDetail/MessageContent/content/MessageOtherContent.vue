<template>
    <div>
        <!-- Location -->
        <!-- 位置地图：与富文本地图块共用同一条渲染链（地图缩略图 + 定位针 + 点击打开地图） -->
        <div v-if="content._ === 'messageLocation'" class="w-80 max-w-full">
            <RichMap :location="content.location" :zoom="14" :chat-id="chatId" />
        </div>

        <!-- Venue -->
        <div v-else-if="content._ === 'messageVenue'" class="flex flex-col gap-1 text-sm">
            <div class="flex items-center gap-2">
                <MapPinIcon class="w-4 h-4 text-red-500 shrink-0" />
                <span class="font-medium">{{ content.venue.title }}</span>
            </div>
            <span class="text-gray-500 text-xs ml-6">{{ content.venue.address }}</span>
        </div>

        <!-- Poll -->
        <MessagePollContent v-else-if="content._ === 'messagePoll'" :content="content" :chat-id="chatId"
            :message-id="messageId" />

        <!-- Game -->
        <div v-else-if="content._ === 'messageGame'" class="text-sm">
            <p class="font-medium">{{ content.game.title }}</p>
            <p class="text-xs text-gray-500">{{ content.game.description }}</p>
        </div>

        <!-- Invoice -->
        <MessageInvoiceContent v-else-if="content._ === 'messageInvoice'" :content="content" :chat-id="chatId"
            :message-id="messageId" :message="message" :topic-id="topicId" :sender-name="senderName" />

        <!-- Call -->
        <div v-else-if="content._ === 'messageCall'" class="flex items-center gap-2 text-sm">
            <component :is="content.is_video ? VideoIcon : PhoneIcon" class="w-4 h-4 shrink-0"
                :class="content.is_video ? 'text-green-500' : 'text-blue-500'" />
            <span>{{ content.is_video ? t('service.videoCall') : t('lng_settings_notifications_calls_title') }}</span>
        </div>

        <!-- 未适配的消息类型：统一走卡片，不再用斜体红字兜底 -->
        <MessageUnsupportedContent v-else :content="content" />
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import type { MessageContent, message } from 'tdlib-types';
import { MapPinIcon, PhoneIcon, VideoIcon } from 'lucide-vue-next';
import MessagePollContent from './MessagePollContent.vue';
import MessageInvoiceContent from './MessageInvoiceContent.vue';
import MessageUnsupportedContent from './MessageUnsupportedContent.vue';
import RichMap from '../rich/RichMap.vue';
// GlobalEmojiInline removed - using global Apple Color Emoji font

defineProps<{
    content: MessageContent;
    chatId?: number;
    messageId?: number;
    message?: message;
    topicId?: number;
    senderName?: string;
}>();
</script>
