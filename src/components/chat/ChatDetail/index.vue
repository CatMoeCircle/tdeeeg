<template>
    <div class="flex w-full flex-col">
        <!-- Header -->
        <ChatDetailHeader :chat="chat" />

        <!-- Messages Area -->
        <div class="flex-1 overflow-y-auto p-4 custom-scrollbar pb-24 flex flex-col messages-scroll"
            ref="messagesContainer" @scroll.passive="onScroll">

            <div v-for="(msg, index) in messages" :key="msg.id" :data-msg-id="msg.id" class="flex" :class="[
                isSelf(msg) ? 'justify-end' : 'justify-start',
                isLastInGroup(index) ? 'mb-4' : 'mb-1'
            ]">

                <!-- Avatar for others -->
                <div v-if="!isSelf(msg) && shouldReserveAvatarSpace(msg)" class="mr-2 shrink-0 self-end"
                    :class="{ 'invisible': !shouldShowAvatar(index) }">
                    <Avatar :photo="getSenderPhoto(msg)" :title="getSenderName(msg)" sizeClass="w-8 h-8" />
                </div>

                <div :class="[
                    'p-2 pb-3 shadow-sm max-w-[70%] min-w-[120px] relative',
                    isSelf(msg)
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200',
                    getMessageBorderRadius(msg, index)
                ]">
                    <!-- Sender Name (only for groups/channels and not self) -->
                    <p v-if="!isSelf(msg) && shouldShowSenderName && isFirstInGroup(index)"
                        class="text-xs font-bold mb-1" :class="isSelf(msg) ? 'text-blue-100' : 'text-blue-500'">
                        {{ getSenderName(msg) }}
                    </p>

                    <!-- Message Content -->
                    <MessageContent :content="msg.content" />

                    <!-- Time -->
                    <span class="absolute right-2 bottom-1 text-[10px]"
                        :class="isSelf(msg) ? 'text-blue-100' : 'text-gray-400'">
                        {{ formatTime(msg.date) }}
                    </span>
                </div>
            </div>
        </div>

        <!-- Input Area -->
        <div class="absolute bottom-0 left-0 right-0 z-10">
            <MessageInput v-model="messageInput" @send="handleSend" @attach="handleAttach" />
        </div>
    </div>
</template>
<script setup lang="ts">
import MessageInput from './MessageInput.vue';
import Avatar from '../avatar.vue';
import MessageContent from './MessageContent.vue';
import ChatDetailHeader from './Header.vue';

import formatTime from '../../../utils/formatTime';
import { tdlibSend } from '../../../utils/tdlib';

import { useRoute } from 'vue-router';
import { computed, watch, ref } from 'vue';

import type { chat, } from 'tdlib-types';


const route = useRoute();
// 从路由 params 解析当前聊天 ID
const chatId = computed(() => {
    const id = route.params.id;
    return id ? parseInt(id as string) : undefined;
});

const chat = ref<chat | undefined>(undefined);
const messageInput = ref('');

// 获取chat信息
watch(chatId, async (newChatId) => {
    if (newChatId !== undefined) {
        const chatData = await tdlibSend({ _: 'getChat', chat_id: newChatId });
        chat.value = chatData;
        console.log(chatData);
    }
}, { immediate: true });
</script>
<style scoped></style>