<template>
    <div>
        <!-- Location -->
        <div v-if="content._ === 'messageLocation'" class="flex items-center gap-2 text-sm">
            <MapPinIcon class="w-4 h-4 text-red-500 shrink-0" />
            <span>{{ locationText }}</span>
        </div>

        <!-- Venue -->
        <div v-else-if="content._ === 'messageVenue'" class="flex flex-col gap-1 text-sm">
            <div class="flex items-center gap-2">
                <MapPinIcon class="w-4 h-4 text-red-500 shrink-0" />
                <span class="font-medium">{{ content.venue.title }}</span>
            </div>
            <span class="text-gray-500 text-xs ml-6">{{ content.venue.address }}</span>
        </div>

        <!-- Contact -->
        <div v-else-if="content._ === 'messageContact'" class="flex items-center gap-2 text-sm">
            <PhoneIcon class="w-4 h-4 text-green-500 shrink-0" />
            <div class="flex flex-col">
                <span class="font-medium">{{ content.contact.first_name }} {{ content.contact.last_name }}</span>
                <span class="text-xs text-gray-500">{{ content.contact.phone_number }}</span>
            </div>
        </div>

        <!-- Poll -->
        <MessagePollContent v-else-if="content._ === 'messagePoll'" :content="content" :chat-id="chatId"
            :message-id="messageId" />

        <!-- Dice -->
        <div v-else-if="content._ === 'messageDice'" class="text-4xl text-center py-2">
            {{ content.emoji }} {{ content.value }}
        </div>

        <!-- Game -->
        <div v-else-if="content._ === 'messageGame'" class="text-sm">
            <p class="font-medium">{{ content.game.title }}</p>
            <p class="text-xs text-gray-500">{{ content.game.description }}</p>
        </div>

        <!-- Invoice -->
        <div v-else-if="content._ === 'messageInvoice'" class="text-sm">
            <p class="font-medium">{{ content.product_info.title }}</p>
            <p class="text-xs text-gray-500">{{ content.product_info.description.text }}</p>
        </div>

        <!-- Call -->
        <div v-else-if="content._ === 'messageCall'" class="flex items-center gap-2 text-sm">
            <component :is="content.is_video ? VideoIcon : PhoneIcon" class="w-4 h-4 shrink-0"
                :class="content.is_video ? 'text-green-500' : 'text-blue-500'" />
            <span>{{ content.is_video ? '视频通话' : '语音通话' }}</span>
        </div>

        <!-- Unsupported -->
        <p v-else class="text-sm italic text-red-500">
            [不支持的消息类型: {{ content._ }}]
        </p>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageContent } from 'tdlib-types';
import { MapPinIcon, PhoneIcon, VideoIcon } from 'lucide-vue-next';
import MessagePollContent from './MessagePollContent.vue';

const props = defineProps<{
    content: MessageContent;
    chatId?: number;
    messageId?: number;
}>();

const locationText = computed(() => {
    const c = props.content;
    if (c._ !== 'messageLocation') return '';
    return `${c.location.latitude}, ${c.location.longitude}`;
});
</script>
