<template>
    <div class="h-full relative bg-[#f5f5f5] dark:bg-[#1c1c1c] overflow-hidden">
        <!-- ===== Messages Area (底层，穿透 header/footer) ===== -->
        <!-- Skeleton -->
        <div v-if="showSkeleton"
            class="absolute inset-0 overflow-y-auto px-4 custom-scrollbar flex flex-col messages-scroll pt-16">
            <div class="flex-1"></div>
            <div v-for="n in 8" :key="n" class="flex mb-4" :class="n % 3 === 0 ? 'justify-end' : 'justify-start'">
                <div v-if="n % 3 !== 0" class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 mr-2 shrink-0"></div>
                <div class="p-3 rounded-lg"
                    :class="n % 3 === 0 ? 'bg-blue-200 dark:bg-blue-900' : 'bg-gray-200 dark:bg-gray-700'"
                    :style="{ width: (120 + Math.random() * 180) + 'px', height: '48px' }">
                </div>
            </div>
        </div>

        <!-- Messages -->
        <div v-else ref="messagesContainer"
            class="absolute inset-0 overflow-y-auto px-4 custom-scrollbar flex flex-col messages-scroll pt-16 pb-15"
            @scroll.passive="onScroll">

            <!-- 顶部加载更多指示器 -->
            <div v-if="isLoadingMore" class="text-center text-gray-400 text-sm py-3 shrink-0">
                加载中...
            </div>

            <!-- 消息列表容器：mt-auto 将消息推到底部 -->
            <div class="mt-auto flex flex-col">
                <template v-for="item in messageItems" :key="item.key">
                    <!-- Date separator -->
                    <div v-if="item.type === 'date'" class="flex justify-center my-2">
                        <span
                            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full leading-none select-none">
                            {{ item.text }}
                        </span>
                    </div>

                    <!-- Unread separator -->
                    <div v-else-if="item.type === 'unread'" class="flex items-center gap-3 my-3" aria-label="新消息">
                        <div class="h-px flex-1 bg-blue-400/70 dark:bg-blue-500/70"></div>
                        <span class="text-xs font-medium text-blue-500 dark:text-blue-400 select-none">新消息</span>
                        <div class="h-px flex-1 bg-blue-400/70 dark:bg-blue-500/70"></div>
                    </div>

                    <!-- Album group -->
                    <template v-else-if="item.type === 'album'">
                        <div :data-msg-id="item.messages[0].id"
                            :class="{ 'animate-message-in': isNewMessage(item.messages[0].id) }"
                            @animationend="removeNewMessageId(item.messages[0].id)">
                            <div class="flex mb-2" :class="isSelfAlbum(item) ? 'justify-end' : 'justify-start'">
                                <div v-if="shouldReserveAvatarColumn(item.messages[0])"
                                    class="w-9 shrink-0 mr-2 self-end">
                                    <div class="w-9 h-9">
                                        <Avatar :photo="getDisplaySenderPhoto(item.messages[0])"
                                            :title="getDisplaySenderName(item.messages[0])" />
                                    </div>
                                </div>
                                <div class="w-min max-w-[70%] overflow-hidden rounded-lg shadow-sm"
                                    :class="isSelfAlbum(item) ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'">
                                    <p v-if="!isSelfAlbum(item) && showSenderName"
                                        class="text-xs font-semibold px-2 pt-2 pb-0.5 text-blue-500">
                                        {{ getSenderName(item.messages[0]) }}
                                    </p>
                                    <button v-if="item.messages[0].forward_info" type="button"
                                        :disabled="!canNavigateForward(item.messages[0].forward_info)"
                                        class="flex min-w-0 w-full max-w-full items-center gap-1 overflow-hidden px-2 pt-2 pb-1 text-left text-xs font-semibold disabled:cursor-default"
                                        :class="[
                                            isSelfAlbum(item) ? 'text-blue-100' : 'text-blue-500 dark:text-blue-400',
                                            canNavigateForward(item.messages[0].forward_info)
                                                ? 'cursor-pointer hover:underline active:opacity-70'
                                                : ''
                                        ]"
                                        :title="canNavigateForward(item.messages[0].forward_info) ? '跳转到来源' : undefined"
                                        @click.stop="openForwardSource(item.messages[0].forward_info)">
                                        <CornerUpRightIcon class="w-3.5 h-3.5 shrink-0" />
                                        <span class="min-w-0 flex-1 truncate">{{
                                            getForwardName(item.messages[0].forward_info) }}</span>
                                    </button>
                                    <MessageAlbum :messages="item.messages" :isSelf="isSelfAlbum(item)" :chatId="chatId"
                                        :isRead="isMessageRead(item.messages[item.messages.length - 1])"
                                        :authorSignature="item.messages[0].author_signature || undefined" />
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- Single message -->
                    <template v-else-if="item.type === 'single'">
                        <div :data-msg-id="item.msg.id" :class="{ 'animate-message-in': isNewMessage(item.msg.id) }"
                            @animationend="removeNewMessageId(item.msg.id)">
                            <div v-if="isServiceMessage(item.msg)" class="flex justify-center my-1">
                                <MessageContent :content="item.msg.content" />
                            </div>
                            <div v-else class="flex" :class="[
                                isSelf(item.msg) ? 'justify-end' : 'justify-start',
                                item.isLastInGroup ? 'mb-2' : 'mb-0.5'
                            ]">
                                <div v-if="shouldReserveAvatarColumn(item.msg)" class="w-9 shrink-0 mr-2 self-end"
                                    :class="{ 'invisible': !item.showAvatar }">
                                    <div class="w-9 h-9">
                                        <Avatar :photo="getDisplaySenderPhoto(item.msg)"
                                            :title="getDisplaySenderName(item.msg)" />
                                    </div>
                                </div>
                                <div :class="[
                                    isMediaMessage(item.msg)
                                        ? 'w-min max-w-[70%] overflow-hidden shadow-sm'
                                        : isStandaloneMessage(item.msg)
                                            ? 'relative max-w-[70%]'
                                            : 'px-3 py-2 shadow-sm max-w-[70%] min-w-[120px]',
                                    !isStandaloneMessage(item.msg) && isSelf(item.msg)
                                        ? 'bg-[#6ab2f2] dark:bg-[#6ab2f2] text-white'
                                        : !isStandaloneMessage(item.msg)
                                            ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                                            : '',
                                    isStandaloneMessage(item.msg) ? '' : getMessageBorderRadius(item.msg, item)
                                ]">
                                    <p v-if="!isSelf(item.msg) && showSenderName && item.isFirstInGroup"
                                        class="text-xs font-semibold mb-0.5 -mt-0.5 text-blue-500">
                                        {{ getSenderName(item.msg) }}
                                    </p>
                                    <button v-if="item.msg.forward_info && !isMediaMessage(item.msg)" type="button"
                                        :disabled="!canNavigateForward(item.msg.forward_info)"
                                        class="flex min-w-0 max-w-full items-center gap-1 overflow-hidden mb-0.5 -mt-0.5 text-left text-xs font-semibold disabled:cursor-default"
                                        :class="[
                                            isSelf(item.msg) ? 'text-blue-100' : 'text-blue-500 dark:text-blue-400',
                                            canNavigateForward(item.msg.forward_info)
                                                ? 'cursor-pointer hover:underline active:opacity-70'
                                                : ''
                                        ]" :title="canNavigateForward(item.msg.forward_info) ? '跳转到来源' : undefined"
                                        @click.stop="openForwardSource(item.msg.forward_info)">
                                        <CornerUpRightIcon class="w-3.5 h-3.5 shrink-0" />
                                        <span class="min-w-0 flex-1 truncate">{{ getForwardName(item.msg.forward_info)
                                            }}</span>
                                    </button>
                                    <MessageContent :content="item.msg.content" :isSelf="isSelf(item.msg)"
                                        :date="item.msg.date" :forwardInfo="item.msg.forward_info"
                                        :forwardName="item.msg.forward_info ? getForwardName(item.msg.forward_info) : undefined"
                                        :forwardNavigable="item.msg.forward_info ? canNavigateForward(item.msg.forward_info) : false"
                                        :isFirstInGroup="item.isFirstInGroup" :isLastInGroup="item.isLastInGroup"
                                        :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                        :viewCount="item.msg.interaction_info?.view_count"
                                        :authorSignature="item.msg.author_signature || undefined" :chatId="chatId"
                                        :messageId="item.msg.id"
                                        :replyTo="item.msg.reply_to?._ === 'messageReplyToMessage' ? item.msg.reply_to : undefined"
                                        :messageList="messages" @jumpToMessage="scrollToMessage"
                                        @openForwardSource="item.msg.forward_info && openForwardSource(item.msg.forward_info)" />
                                    <span
                                        v-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && !isSelf(item.msg)"
                                        class="block text-right text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-none">
                                        <MessageStatus :date="item.msg.date" :isOutgoing="false"
                                            :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                            :viewCount="item.msg.interaction_info?.view_count"
                                            :authorSignature="item.msg.author_signature || undefined" />
                                    </span>
                                    <span
                                        v-else-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && isSelf(item.msg)"
                                        class="block text-right text-[11px] text-blue-100 mt-0.5 leading-none">
                                        <MessageStatus :date="item.msg.date" :isOutgoing="true"
                                            :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                            :viewCount="item.msg.interaction_info?.view_count"
                                            :authorSignature="item.msg.author_signature || undefined" />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </template>
                </template>

                <div class="shrink-0 h-4"></div>
            </div>
        </div>
        <!-- ===== 底部渐变淡出遮罩 ===== -->
        <div aria-hidden="true"
            class="absolute bottom-0 left-0 right-0 h-24 z-3 pointer-events-none bg-linear-to-t from-[#f5f5f5] dark:from-[#1c1c1c] via-[#f5f5f5]/60 dark:via-[#1c1c1c]/60 to-transparent">
        </div>
        <!-- ===== Header（顶层，磨砂玻璃） ===== -->
        <div
            class="absolute top-0 left-0 right-0 z-10 bg-white/80 dark:bg-[#1c1c1c]/70 backdrop-blur-lg border-b border-gray-200/60 dark:border-gray-800/60">
            <ChatDetailHeader :chat="chat" :showBack="showOverlay" @back="closeOverlay" @openInfo="openOverlay" />
        </div>

        <!-- ===== 叠层面板 ===== -->
        <Transition name="overlay-slide">
            <div v-if="showOverlay && chat" class="absolute inset-0 z-20 bg-white dark:bg-gray-900 overflow-y-auto">
                <div class="p-4 pt-20">
                    <!-- 对话信息 -->
                    <div class="flex flex-col items-center mb-6">
                        <div class="w-20 h-20 mb-3">
                            <Avatar :photo="chat.photo" :title="chat.title" sizeClass="!w-20 !h-20" />
                        </div>
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ chat.title }}</h2>
                        <p class="text-sm text-gray-500 mt-1">{{ getChatSubtitle() }}</p>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="space-y-2 px-4">
                        <button type="button" @click="openInNewChat"
                            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
                            <MessageCircleIcon class="w-5 h-5 text-blue-500" />
                            <span class="text-sm font-medium">跳转到对话</span>
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- ===== Input Area（顶层，磨砂玻璃） ===== -->
        <div v-if="canSend"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-white/80 dark:from-gray-900/80 via-white/60 dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md [mask-image:linear-gradient(to_top,black,transparent)]">
            </div>
            <MessageInput class="relative z-10" v-model="messageInput" @send="handleSend" @attach="handleAttach" />
        </div>

        <!-- ===== 成员操作 ===== -->
        <div v-else-if="showMembershipAction"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-white/80 dark:from-gray-900/80 via-white/60 dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md [mask-image:linear-gradient(to_top,black,transparent)]">
            </div>
            <div class="relative z-10 flex items-center justify-center p-5">
                <button type="button" :disabled="!canJoinCurrentChat || isJoinPending || joinRequestSent"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/60 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-default transition-colors"
                    @click="joinCurrentChat">
                    {{ membershipActionLabel }}
                </button>
            </div>
        </div>

        <!-- ===== 只读 ===== -->
        <div v-else-if="showChannelActions"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-white/80 dark:from-gray-900/80 via-white/60 dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md [mask-image:linear-gradient(to_top,black,transparent)]">
            </div>
            <div class="relative z-10 flex items-center justify-center gap-3 p-5">
                <button type="button" :disabled="isNotificationTogglePending"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/60 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-wait transition-colors"
                    @click="toggleNotifications">
                    {{ notificationsMuted ? '开启通知' : '关闭通知' }}
                </button>
                <button v-if="linkedChatId" type="button" title="打开讨论组" aria-label="打开讨论组"
                    class="w-12 h-12 rounded-full bg-white/60 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg flex items-center justify-center text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 transition-colors"
                    @click="openLinkedChat">
                    <MessageCircleIcon class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- ===== Floating scroll-to-bottom button ===== -->
        <Transition name="fade">
            <button v-if="showScrollButton"
                class="absolute bottom-28 right-4 z-20 w-10 h-10 bg-white dark:bg-gray-700 rounded-full shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                @click="handleScrollToBottom" title="跳到底部">
                <span v-if="newMessageCount > 0"
                    class="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
                    {{ newMessageCount > 99 ? '99+' : newMessageCount }}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clip-rule="evenodd" />
                </svg>
            </button>
        </Transition>

        <!-- ===== 全局媒体查看器 ===== -->
        <MediaViewer :visible="viewerVisible" :items="viewerItems" :initial-index="viewerIndex"
            :initial-time="viewerInitialTime" @close="onViewerClose" />
    </div>
</template>
<script setup lang="ts">
import MessageInput from './MessageInput.vue';
import Avatar from '../avatar.vue';
import MessageContent from './MessageContent/index.vue';
import MessageStatus from './MessageContent/MessageStatus.vue';
import MessageAlbum from './MessageContent/MessageAlbum.vue';
import ChatDetailHeader from './Header.vue';
import MediaViewer from './MessageContent/MediaViewer.vue';
import type { MediaViewerItem } from './MessageContent/MediaViewer.vue';

import { tdlibSend } from '../../../utils/tdlib';
import { isOutgoingMessageForDisplay, isSavedMessagesChat } from '../../../utils/savedMessages';
import { getForwardNavigationTarget, getForwardOriginKey } from '../../../utils/forwardedMessages';

import { CornerUpRightIcon, MessageCircleIcon } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { computed, watch, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useUserStore } from '../../../store/user';
import { storeToRefs } from 'pinia';
import { listen } from "@tauri-apps/api/event";

import type { chat, message, user, chatPhotoInfo, profilePhoto, Update, supergroup, basicGroup, messageForwardInfo, ChatMemberStatus } from 'tdlib-types';
import { getViewerState, closeMediaViewer, registerMediaItem, unregisterMediaItem, isMediaViewerActive } from '../../../store/mediaViewer';
import { isFileReady } from '../../../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';

// ==================== Route ====================
const route = useRoute();
const router = useRouter();

const chatId = computed(() => {
    const id = route.params.id;
    return id ? parseInt(id as string) : undefined;
});

// ==================== Overlay State ====================
const showOverlay = ref(false);

function openOverlay() {
    showOverlay.value = true;
}

function closeOverlay() {
    showOverlay.value = false;
}

function getChatSubtitle(): string {
    if (!chat.value) return '';
    const c = chat.value;
    if (c.type._ === 'chatTypePrivate' || c.type._ === 'chatTypeSecret') {
        return '私聊';
    }
    if (c.type._ === 'chatTypeBasicGroup') {
        return '群组';
    }
    if (c.type._ === 'chatTypeSupergroup') {
        return c.type.is_channel ? '频道' : '超级群组';
    }
    return '';
}

function openInNewChat() {
    showOverlay.value = false;
    // 用户点击"跳转到对话"时的处理，这里只是关闭叠层
}

// ==================== State ====================
const chat = ref<chat | undefined>(undefined);
const messageInput = ref('');
const messages = ref<message[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);

const isLoadingMore = ref(false);
const isHistoryExhausted = ref(false);
const isReady = ref(false);           // 标记初始加载和定位已完成
const unreadBoundaryMessageId = ref<number | null>(null);

const newMessageIds = ref<Set<number>>(new Set());
const showScrollButton = ref(false);
const newMessageCount = ref(0);
const notificationsMuted = ref(false);
const isNotificationTogglePending = ref(false);
const linkedChatId = ref(0);
const isJoinPending = ref(false);
const joinRequestSent = ref(false);

// 缓存
const users = ref<Record<number, user>>({});
const chats = ref<Record<number, chat>>({});
const supergroups = ref<Record<number, supergroup>>({});
const basicGroups = ref<Record<number, basicGroup>>({});
let unlisten: (() => void) | null = null;

/** 单调递增的加载代数，用于防止异步返回时的竞态条件 */
let loadGeneration = 0;

/** 消息数据版本号，用于 computed 依赖追踪，避免多余重算 */
const messagesVersion = ref(0);

// User Store
const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const myId = computed(() => userProfile.value?.id || 0);

// ==================== 全局媒体查看器状态 ====================
const { viewerVisible, viewerIndex, viewerInitialTime, viewerItems } = getViewerState();

// 当消息列表变化时，将已有媒体消息注册到全局查看器
const previousMsgIds = ref<Set<number>>(new Set());
watch(messages, (msgs) => {
    const newIds = new Set<number>();
    for (const msg of msgs) {
        newIds.add(msg.id);
        if (previousMsgIds.value.has(msg.id)) continue;
        const c = msg.content;
        const capt = 'caption' in c && c.caption?.text ? c.caption.text : '';
        let item: MediaViewerItem | null = null;
        if (c._ === 'messagePhoto') {
            const sizes = c.photo.sizes;
            if (sizes.length > 0) {
                const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
                const f = largest.photo;
                if (f && isFileReady(f)) {
                    item = { type: 'photo', src: convertFileSrc(f.local.path), caption: capt };
                }
            }
        } else if (c._ === 'messageVideo') {
            const file = c.video.video;
            if (isFileReady(file)) {
                item = { type: 'video', src: convertFileSrc(file.local.path), caption: capt };
            } else if (c.video.supports_streaming && file.size > 0) {
                item = { type: 'video', src: `${convertFileSrc(String(file.id), 'tdstream')}?mime=${c.video.mime_type}`, caption: capt };
            }
        } else if (c._ === 'messageAnimation') {
            const file = c.animation.animation;
            if (isFileReady(file)) {
                item = { type: 'animation', src: convertFileSrc(file.local.path), caption: capt };
            }
        }
        if (item) registerMediaItem(msg.id, item);
    }
    // 清理已删除消息的注册
    for (const oldId of previousMsgIds.value) {
        if (!newIds.has(oldId)) unregisterMediaItem(oldId);
    }
    previousMsgIds.value = newIds;
}, { immediate: true, deep: true });

function onViewerClose() {
    closeMediaViewer();
}

// 查看器打开时阻止滚动
watch(isMediaViewerActive, (active) => {
    const container = messagesContainer.value;
    if (container) {
        container.style.overflow = active ? 'hidden' : '';
    }
});

// ==================== Lifecycle ====================
onMounted(async () => {
    if (!userProfile.value) {
        await userStore.fetchUser();
    }
    unlisten = await listen<Update>("tdlib-update", (event) => {
        handleUpdate(event.payload);
    });
});

onUnmounted(() => {
    if (unlisten) unlisten();
    if (readVisibilityTimer !== null) window.clearTimeout(readVisibilityTimer);
    if (chatLoadRetryTimer !== null) window.clearTimeout(chatLoadRetryTimer);
});

const forwardedTargetMessageId = computed(() => {
    const id = Number(route.query.message);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
});

// ==================== TDLib Updates ====================
const handleUpdate = async (update: Update) => {
    switch (update._) {
        case 'updateNewMessage': {
            if (!isReady.value) return;
            const msg = update.message;
            if (msg.chat_id !== chatId.value) return;
            if (messages.value.find(m => m.id === msg.id)) return;

            const senderIsMe =
                msg.sender_id._ === 'messageSenderUser' &&
                msg.sender_id.user_id === myId.value;

            const atBottom = isAtBottom();
            newMessageIds.value.add(msg.id);

            // 追加到末尾（最新消息）
            messages.value.push(msg);
            await fetchSenders([msg]);

            if (senderIsMe || atBottom) {
                showScrollButton.value = false;
                newMessageCount.value = 0;
                scrollToBottom();
            } else {
                showScrollButton.value = true;
                newMessageCount.value++;
            }
            break;
        }

        case 'updateMessageContent': {
            if (!isReady.value) return;
            if (update.chat_id !== chatId.value) return;
            const msg = messages.value.find(m => m.id === update.message_id);
            if (msg) msg.content = update.new_content;
            break;
        }

        case 'updateMessageSendSucceeded':
        case 'updateMessageSendFailed': {
            if (!isReady.value) return;
            if (update.message.chat_id !== chatId.value) return;
            const oldIndex = messages.value.findIndex(m => m.id === update.old_message_id);
            const currentIndex = messages.value.findIndex(m => m.id === update.message.id);

            if (oldIndex >= 0) {
                if (currentIndex >= 0 && currentIndex !== oldIndex) {
                    messages.value.splice(oldIndex, 1);
                } else {
                    messages.value.splice(oldIndex, 1, update.message);
                }
            } else if (currentIndex >= 0) {
                messages.value.splice(currentIndex, 1, update.message);
            } else {
                messages.value.push(update.message);
            }

            if (newMessageIds.value.delete(update.old_message_id)) {
                newMessageIds.value.add(update.message.id);
            }
            // 为新消息获取发送者信息
            await fetchSenders([update.message]);
            break;
        }

        case 'updateChatReadOutbox': {
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.last_read_outbox_message_id = update.last_read_outbox_message_id;
            break;
        }

        case 'updateDeleteMessages': {
            if (!isReady.value) return;
            if (update.chat_id !== chatId.value) return;
            // from_cache=true 的删除是本地缓存的过时标记，不是真实的删除，忽略
            if (update.from_cache) break;
            const beforeCount = messages.value.length;
            messages.value = messages.value.filter(m => !update.message_ids.includes(m.id));
            if (messages.value.length !== beforeCount) {
                messagesVersion.value++;
            }
            break;
        }

        case 'updateChatNotificationSettings': {
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.notification_settings = update.notification_settings;
            void syncNotificationMuteState(chat.value, update.chat_id);
            break;
        }

        case 'updateSupergroupFullInfo': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeSupergroup') return;
            if (update.supergroup_id !== currentChat.type.supergroup_id) return;
            linkedChatId.value = update.supergroup_full_info.linked_chat_id;
            break;
        }

        case 'updateSupergroup': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeSupergroup') return;
            if (update.supergroup.id !== currentChat.type.supergroup_id) return;
            supergroups.value[update.supergroup.id] = update.supergroup;
            break;
        }

        case 'updateBasicGroup': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeBasicGroup') return;
            if (update.basic_group.id !== currentChat.type.basic_group_id) return;
            basicGroups.value[update.basic_group.id] = update.basic_group;
            break;
        }

        case 'updateMessageEdited': {
            if (update.chat_id !== chatId.value) return;
            const msg = messages.value.find(m => m.id === update.message_id);
            if (msg) {
                msg.edit_date = update.edit_date;
                if (update.reply_markup) {
                    (msg as any).reply_markup = update.reply_markup;
                }
            }
            break;
        }

        default:
            break;
    }
};

// ==================== Chat Loading ====================
const chatLoadRetryToken = ref(0);
let chatLoadRetryId: number | null = null;
let chatLoadRetryCount = 0;
let chatLoadRetryTimer: number | null = null;

/** 滚动管理状态 — 必须声明在 watch 之前，因为 resetState 被 immediate watch 调用 */
let readVisibilityTimer: number | null = null;
let lastReportedReadMessageId = 0;

/** 检查加载代数是否已过期（聊天已切换），过期则中止后续操作 */
function isGenerationValid(gen: number): boolean {
    return gen === loadGeneration;
}

// 监听 chatId 变化，加载聊天信息和消息
watch([chatId, chatLoadRetryToken, forwardedTargetMessageId], async ([newChatId, , requestedMessageId]) => {
    if (newChatId === undefined) return;
    if (chatLoadRetryId !== newChatId) {
        chatLoadRetryId = newChatId;
        chatLoadRetryCount = 0;
        if (chatLoadRetryTimer !== null) {
            window.clearTimeout(chatLoadRetryTimer);
            chatLoadRetryTimer = null;
        }
    }
    const currentId = newChatId;
    const gen = ++loadGeneration;

    // 重置全部状态
    resetState();

    try {
        // 1. 获取 chat 基础信息
        const chatData = await tdlibSend({ _: 'getChat', chat_id: currentId }) as chat;
        if (!isGenerationValid(gen)) return;
        chat.value = chatData;

        // 获取 supergroup / basicGroup 补充信息
        await Promise.all([
            fetchGroupInfo(chatData, gen),
            syncNotificationMuteState(chatData, currentId)
        ]);
        if (!isGenerationValid(gen)) return;

        // 2. 有未读消息时，以最后一条已读收件箱消息作为历史定位锚点
        const lastReadId = chatData.unread_count > 0
            ? chatData.last_read_inbox_message_id
            : 0;
        lastReportedReadMessageId = chatData.last_read_inbox_message_id;

        // 3. 转发跳转优先围绕目标消息加载，否则围绕读点加载历史
        const historyAnchorId = requestedMessageId || lastReadId;
        let allMsgs = await fetchMessages(
            currentId,
            historyAnchorId,
            historyAnchorId > 0 ? 60 : 30,
            historyAnchorId > 0 ? -30 : 0,
            gen
        );
        if (!isGenerationValid(gen)) return;
        if (requestedMessageId && allMsgs.length === 0) {
            allMsgs = await fetchMessages(currentId, 0, 30, 0, gen);
            if (!isGenerationValid(gen)) return;
        }
        if (allMsgs.length === 0 && chatData.last_message) {
            throw new Error(`Chat ${currentId} returned empty history despite having a last message`);
        }

        // 如果消息太少，多加载几页填充以确保可滚动
        if (allMsgs.length > 0 && allMsgs.length < 80) {
            for (let i = 0; i < 3; i++) {
                if (!isGenerationValid(gen)) return;
                const oldest = allMsgs[0];
                const more = await fetchMessages(currentId, oldest.id, 50, 0, gen);
                if (more.length === 0) break;
                const existingIds = new Set(allMsgs.map(m => m.id));
                const unique = more.filter(m => !existingIds.has(m.id));
                if (unique.length === 0) break;
                allMsgs = [...unique, ...allMsgs];
            }
        }

        const firstUnreadMessage = chatData.unread_count > 0
            ? allMsgs.find(message => !message.is_outgoing && (lastReadId === 0 || message.id > lastReadId))
            : undefined;
        const unreadAlbumId = firstUnreadMessage?.media_album_id;
        unreadBoundaryMessageId.value = unreadAlbumId && unreadAlbumId !== '0'
            ? allMsgs.find(message => message.media_album_id === unreadAlbumId)?.id || firstUnreadMessage.id
            : firstUnreadMessage?.id || null;

        messages.value = allMsgs;
        messagesVersion.value++;
        await nextTick();

        // 4. 定位到新消息分界线后的第一条未读消息
        const scrollTargetId = requestedMessageId || unreadBoundaryMessageId.value || lastReadId;
        if (scrollTargetId > 0) {
            await scrollToTargetOrBottom(scrollTargetId, currentId, gen);
        } else {
            await scrollToBottomAsync();
        }

        // 5. 标记完成
        isReady.value = true;
        chatLoadRetryCount = 0;

        // 6. 确保加载后消息容器可滚动（至少撑满视口）
        await nextTick();
        const container = messagesContainer.value;
        if (container && container.scrollHeight <= container.clientHeight + 2) {
            if (messages.value.length > 0 && !isHistoryExhausted.value) {
                const oldest = messages.value[0];
                const more = await fetchMessages(currentId, oldest.id, 50, 0, gen);
                if (more.length > 0) {
                    messages.value = mergeMessages(messages.value, more);
                    messagesVersion.value++;
                }
            }
        }
        scheduleVisibleMessagesRead();
    } catch (e) {
        console.error("Error loading chat:", e);
        if (chatId.value === currentId && chatLoadRetryCount < 2) {
            chatLoadRetryCount++;
            isReady.value = false;
            chatLoadRetryTimer = window.setTimeout(() => {
                chatLoadRetryTimer = null;
                if (chatId.value === currentId) chatLoadRetryToken.value++;
            }, chatLoadRetryCount * 300);
        } else {
            isReady.value = true;
        }
    }
}, { immediate: true });

// ==================== Data Fetching ====================
/**
 * 从 TDLib 加载消息，返回 旧→新 顺序。
 * 注意：fromMessageId 会被 TDLib 包含在返回结果中，调用方需自行去重。
 */
async function fetchMessages(chatIdNum: number, fromMessageId: number, limit: number, offset = 0, generation?: number): Promise<message[]> {
    try {
        const result = await tdlibSend({
            _: 'getChatHistory',
            chat_id: chatIdNum,
            from_message_id: fromMessageId,
            offset,
            limit,
            only_local: false
        });
        // 如果生成代数已过期（聊天已切换），丢弃结果
        if (generation !== undefined && !isGenerationValid(generation)) return [];
        const msgs: message[] = (result.messages || []).filter((m: any): m is message => !!m);
        if (msgs.length > 0) {
            await fetchSenders(msgs);
            // TDLib 返回 newest-first，反转成 oldest-first
            msgs.reverse();
            return msgs;
        }
        return [];
    } catch (e) {
        console.error("fetchMessages error:", e);
        return [];
    }
}

/** 合并消息并去重（oldest-first 顺序），返回新数组 */
function mergeMessages(existing: message[], incoming: message[]): message[] {
    if (existing.length === 0) return incoming;
    if (incoming.length === 0) return existing;
    const existingIds = new Set(existing.map(m => m.id));
    const unique = incoming.filter(m => !existingIds.has(m.id));
    if (unique.length === 0) return existing;
    // incoming 已是最旧→最新，incoming 比 existing 更旧，prepend
    return [...unique, ...existing];
}

/** 并发获取消息中涉及的用户/频道信息 */
const fetchSenders = async (msgs: message[]) => {
    const userIds = new Set<number>();
    const chatIds = new Set<number>();

    msgs.forEach(m => {
        if (m.sender_id._ === 'messageSenderUser' && !users.value[m.sender_id.user_id]) {
            userIds.add(m.sender_id.user_id);
        } else if (m.sender_id._ === 'messageSenderChat' && !chats.value[m.sender_id.chat_id]) {
            chatIds.add(m.sender_id.chat_id);
        }

        const forwardInfo = m.forward_info;
        if (!forwardInfo) return;

        const origin = forwardInfo.origin;
        if (origin._ === 'messageOriginUser' && !users.value[origin.sender_user_id]) {
            userIds.add(origin.sender_user_id);
        } else if (origin._ === 'messageOriginChat' && !chats.value[origin.sender_chat_id]) {
            chatIds.add(origin.sender_chat_id);
        } else if (origin._ === 'messageOriginChannel' && !chats.value[origin.chat_id]) {
            chatIds.add(origin.chat_id);
        }

        const sourceSender = forwardInfo.source?.sender_id;
        if (sourceSender?._ === 'messageSenderUser' && !users.value[sourceSender.user_id]) {
            userIds.add(sourceSender.user_id);
        } else if (sourceSender?._ === 'messageSenderChat' && !chats.value[sourceSender.chat_id]) {
            chatIds.add(sourceSender.chat_id);
        }
    });

    await Promise.all([
        ...Array.from(userIds).map(uid =>
            tdlibSend({ _: 'getUser', user_id: uid })
                .then(u => { users.value[uid] = u; })
                .catch(() => { })
        ),
        ...Array.from(chatIds).map(cid =>
            tdlibSend({ _: 'getChat', chat_id: cid })
                .then(c => { chats.value[cid] = c; })
                .catch(() => { })
        )
    ]);
};

/** 获取 supergroup / basicGroup 信息 */
async function fetchGroupInfo(chatData: chat, gen: number) {
    if (chatData.type._ === 'chatTypeSupergroup') {
        const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: chatData.type.supergroup_id });
        if (!isGenerationValid(gen)) return;
        supergroups.value[chatData.type.supergroup_id] = sg;
        if (chatData.type.is_channel || sg.is_broadcast_group) {
            try {
                const fullInfo = await tdlibSend({
                    _: 'getSupergroupFullInfo',
                    supergroup_id: chatData.type.supergroup_id
                });
                if (!isGenerationValid(gen)) return;
                linkedChatId.value = fullInfo.linked_chat_id;
            } catch (e) {
                console.error('Failed to load linked chat:', e);
            }
        }
    } else if (chatData.type._ === 'chatTypeBasicGroup') {
        const bg = await tdlibSend({ _: 'getBasicGroup', basic_group_id: chatData.type.basic_group_id });
        if (!isGenerationValid(gen)) return;
        basicGroups.value[chatData.type.basic_group_id] = bg;
    }
}

// ==================== Scroll Management ====================
/** 滚动稳定后，将当前视口中的未读消息批量标记为已读 */
function scheduleVisibleMessagesRead() {
    if (!isReady.value) return;
    if (readVisibilityTimer !== null) window.clearTimeout(readVisibilityTimer);
    readVisibilityTimer = window.setTimeout(() => {
        readVisibilityTimer = null;
        void markVisibleMessagesAsRead();
    }, 120);
}

async function markVisibleMessagesAsRead() {
    const currentChatId = chatId.value;
    const container = messagesContainer.value;
    if (!currentChatId || !container) return;

    const containerRect = container.getBoundingClientRect();
    const visibleUnreadIds = new Set<number>();
    const renderedMessages = container.querySelectorAll<HTMLElement>('[data-msg-id]');

    for (const element of renderedMessages) {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) continue;

        const messageId = Number(element.dataset.msgId);
        const renderedMessage = messages.value.find(message => message.id === messageId);
        if (!renderedMessage) continue;

        const visibleMessages = renderedMessage.media_album_id && renderedMessage.media_album_id !== '0'
            ? messages.value.filter(message => message.media_album_id === renderedMessage.media_album_id)
            : [renderedMessage];
        for (const message of visibleMessages) {
            if (!message.is_outgoing && message.id > lastReportedReadMessageId) {
                visibleUnreadIds.add(message.id);
            }
        }
    }

    if (visibleUnreadIds.size === 0) return;
    const messageIds = [...visibleUnreadIds].sort((a, b) => a - b);
    const previousReportedId = lastReportedReadMessageId;
    const latestVisibleId = messageIds[messageIds.length - 1];
    lastReportedReadMessageId = latestVisibleId;

    try {
        await tdlibSend({
            _: 'viewMessages',
            chat_id: currentChatId,
            message_ids: messageIds,
            force_read: true
        });
    } catch (e) {
        if (chatId.value === currentChatId && lastReportedReadMessageId === latestVisibleId) {
            lastReportedReadMessageId = previousReportedId;
        }
        console.error('Failed to mark visible messages as read:', e);
    }
}

/** 检测是否在底部附近 */
const isAtBottom = (threshold = 150): boolean => {
    const el = messagesContainer.value;
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
};

/** 滚动到底部（标准 flex-col：scrollTop = scrollHeight） */
const scrollToBottom = () => {
    showScrollButton.value = false;
    newMessageCount.value = 0;
    nextTick(() => {
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
    });
};

/** 异步等待后滚动到底部 */
const scrollToBottomAsync = async () => {
    await nextTick();
    scrollToBottom();
    // 媒体加载后二次校准
    setTimeout(scrollToBottom, 200);
};

/** 滚动到指定消息元素，将其放在视口约 45% 位置 */
const scrollToMessage = (messageId: number) => {
    nextTick(() => {
        const el = messagesContainer.value;
        if (!el) return;
        const target = messages.value.find(message => message.id === messageId);
        const renderedMessageId = target?.media_album_id && target.media_album_id !== '0'
            ? messages.value.find(message => message.media_album_id === target.media_album_id)?.id || messageId
            : messageId;
        const msgEl = el.querySelector(`[data-msg-id="${renderedMessageId}"]`) as HTMLElement | null;
        if (!msgEl) return;

        const containerHeight = el.clientHeight;
        const targetOffset = msgEl.offsetTop;
        const targetHeight = msgEl.clientHeight;
        let desired = Math.round(targetOffset - containerHeight * 0.45 + targetHeight / 2);
        desired = Math.max(0, Math.min(desired, el.scrollHeight - containerHeight));
        el.scrollTop = desired;
    });
};

/** 尝试定位到目标消息，找不到则到底部 */
async function scrollToTargetOrBottom(targetId: number, chatIdNum: number, gen: number) {
    for (let attempt = 0; attempt < 10; attempt++) {
        if (!isGenerationValid(gen)) return;
        const exists = messages.value.some(m => m.id === targetId);
        if (exists) {
            scrollToMessage(targetId);
            setTimeout(() => {
                if (isGenerationValid(gen)) scrollToMessage(targetId);
            }, 200);
            return;
        }
        if (isHistoryExhausted.value || messages.value.length === 0) break;
        const oldest = messages.value[0];
        const more = await fetchMessages(chatIdNum, oldest.id, 30, 0, gen);
        if (more.length === 0) break;
        const previousCount = messages.value.length;
        messages.value = mergeMessages(messages.value, more);
        await nextTick();
        if (messages.value.length === previousCount) {
            break;
        }
    }
    scrollToBottom();
}

// ==================== Scroll Events ====================
const onScroll = async (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    const H = el.scrollHeight;
    const C = el.clientHeight;
    const T = el.scrollTop;

    // 底部检测
    const atBottom = T + C >= H - 100;
    showScrollButton.value = !atBottom;
    if (atBottom && newMessageCount.value > 0) {
        newMessageCount.value = 0;
    }
    scheduleVisibleMessagesRead();

    // 内容未溢出时忽略
    if (H <= C + 2) return;

    // 顶部检测 — 触发加载更旧消息
    const atTop = T <= 30;
    if (
        !atTop ||
        isLoadingMore.value ||
        isHistoryExhausted.value ||
        messages.value.length === 0 ||
        !chatId.value ||
        !isReady.value
    ) return;

    // 用 loadGeneration 避免竞态
    const loadChat = chatId.value;
    if (!loadChat) { isLoadingMore.value = false; return; }
    const scrollGen = loadGeneration;

    isLoadingMore.value = true;
    const oldestId = messages.value[0]?.id;
    if (oldestId) {
        const older = await fetchMessages(loadChat, oldestId, 30, 0, scrollGen);
        // 切换聊天后忽略旧结果
        if (!isGenerationValid(scrollGen) || chatId.value !== loadChat) {
            isLoadingMore.value = false;
            return;
        }
        if (older.length > 0) {
            const existingIds = new Set(messages.value.map(m => m.id));
            const unique = older.filter(m => !existingIds.has(m.id));
            if (unique.length > 0) {
                const prevHeight = el.scrollHeight;
                messages.value = [...unique, ...messages.value];
                messagesVersion.value++;
                await nextTick();
                // 修正 scrollTop 以保持视觉位置不变
                el.scrollTop = el.scrollHeight - prevHeight + T;
            } else {
                isHistoryExhausted.value = true;
            }
        } else {
            isHistoryExhausted.value = true;
        }
    }
    isLoadingMore.value = false;
};

// ==================== Send Message ====================
const handleSend = async (text: string) => {
    if (!chatId.value || !text.trim()) return;
    try {
        await tdlibSend({
            _: 'sendMessage',
            chat_id: chatId.value,
            input_message_content: {
                _: 'inputMessageText',
                text: { _: 'formattedText', text, entities: [] },
                disable_web_page_preview: false,
                clear_draft: true
            }
        });
        messageInput.value = '';
    } catch (e) {
        console.error("Failed to send message:", e);
    }
};

const handleAttach = (files: FileList) => {
    console.log("Attach files:", files);
};

// ==================== State Reset ====================
function resetState() {
    if (readVisibilityTimer !== null) {
        window.clearTimeout(readVisibilityTimer);
        readVisibilityTimer = null;
    }
    lastReportedReadMessageId = 0;
    messages.value = [];
    chat.value = undefined;
    isHistoryExhausted.value = false;
    isReady.value = false;
    unreadBoundaryMessageId.value = null;
    showScrollButton.value = false;
    newMessageCount.value = 0;
    newMessageIds.value = new Set();
    notificationsMuted.value = false;
    isNotificationTogglePending.value = false;
    linkedChatId.value = 0;
    isJoinPending.value = false;
    joinRequestSent.value = false;
}

// ==================== Helpers ====================

/** 判断当前频道是否开启了显示发送者信息（个人资料显示），
 *  此时即使是自己发的消息也应和其他消息一样靠左显示 */
const isChannelWithSenderDisplay = computed(() => {
    if (!chat.value) return false;
    if (chat.value.type._ !== 'chatTypeSupergroup' || !chat.value.type.is_channel) return false;
    const sg = supergroups.value[chat.value.type.supergroup_id];
    if (!sg) return false;
    return sg.sign_messages || sg.show_message_sender;
});

const isSelf = (msg: message) => {
    // 在开启了发送者显示的频道中，所有消息统一靠左，不区分颜色
    if (isChannelWithSenderDisplay.value) return false;
    return isOutgoingMessageForDisplay(msg, chat.value, myId.value);
};

const MEDIA_TYPES = new Set(['messagePhoto', 'messageVideo', 'messageAnimation']);
const ALBUM_MEDIA_TYPES = new Set(['messagePhoto', 'messageVideo']);
const SERVICE_TYPES = new Set([
    'messageBasicGroupChatCreate', 'messageSupergroupChatCreate',
    'messageChatChangeTitle', 'messageChatChangePhoto', 'messageChatDeletePhoto',
    'messageChatAddMembers', 'messageChatJoinByLink', 'messageChatJoinByRequest',
    'messageChatDeleteMember', 'messageChatUpgradeTo', 'messageChatUpgradeFrom',
    'messagePinMessage', 'messageScreenshotTaken', 'messageChatSetBackground',
    'messageChatSetTheme', 'messageChatSetMessageAutoDeleteTime', 'messageChatBoost',
    'messageForumTopicCreated', 'messageForumTopicEdited',
    'messageForumTopicIsClosedToggled', 'messageForumTopicIsHiddenToggled',
    'messageSuggestProfilePhoto', 'messageCustomServiceAction', 'messageGameScore',
    'messagePaymentSuccessful', 'messagePaymentSuccessfulBot', 'messagePaymentRefunded',
    'messageGiftedPremium', 'messagePremiumGiftCode', 'messageGiveawayCreated',
    'messageGiveaway', 'messageGiveawayCompleted', 'messageGiveawayWinners',
    'messageGiftedStars', 'messageGiftedTon', 'messageGiveawayPrizeStars',
    'messageGift', 'messageUpgradedGift', 'messageRefundedUpgradedGift',
    'messageContactRegistered', 'messageUsersShared', 'messageChatShared',
    'messageBotWriteAccessAllowed', 'messageWebAppDataSent', 'messageWebAppDataReceived',
    'messagePassportDataSent', 'messagePassportDataReceived', 'messageProximityAlertTriggered',
    'messagePaidMedia', 'messageChecklist', 'messageChecklistTasksDone',
    'messageChecklistTasksAdded', 'messageSuggestedPostApprovalFailed',
    'messageSuggestedPostApproved', 'messageSuggestedPostDeclined',
    'messageSuggestedPostPaid', 'messageSuggestedPostRefunded', 'messageCall',
]);

const isMediaMessage = (msg: message) => MEDIA_TYPES.has(msg.content._);
const isAlbumMedia = (msg: message) => ALBUM_MEDIA_TYPES.has(msg.content._);
const isStandaloneMessage = (msg: message) =>
    msg.content._ === 'messageSticker' || msg.content._ === 'messageAnimatedEmoji';
const isServiceMessage = (msg: message) => SERVICE_TYPES.has(msg.content._);
const isMessageRead = (msg: message) =>
    msg.is_outgoing
    && !msg.sending_state
    && !!chat.value
    && msg.id <= chat.value.last_read_outbox_message_id;

const getSenderName = (msg: message) => {
    if (msg.sender_id._ === 'messageSenderUser') {
        const u = users.value[msg.sender_id.user_id];
        return u ? `${u.first_name} ${u.last_name}`.trim() : '未知用户';
    } else if (msg.sender_id._ === 'messageSenderChat') {
        const c = chats.value[msg.sender_id.chat_id];
        return c ? c.title : '未知频道';
    }
    return '未知';
};

const getSenderPhoto = (msg: message): chatPhotoInfo | profilePhoto | undefined => {
    if (msg.sender_id._ === 'messageSenderUser') {
        return users.value[msg.sender_id.user_id]?.profile_photo;
    } else if (msg.sender_id._ === 'messageSenderChat') {
        return chats.value[msg.sender_id.chat_id]?.photo;
    }
    return undefined;
};

const getForwardName = (forwardInfo: messageForwardInfo): string => {
    const origin = forwardInfo.origin;
    switch (origin._) {
        case 'messageOriginUser': {
            const sourceUser = users.value[origin.sender_user_id];
            return sourceUser
                ? `${sourceUser.first_name} ${sourceUser.last_name}`.trim()
                : '用户';
        }
        case 'messageOriginHiddenUser':
            return origin.sender_name || '隐藏用户';
        case 'messageOriginChat':
            return chats.value[origin.sender_chat_id]?.title || origin.author_signature || '聊天';
        case 'messageOriginChannel':
            return chats.value[origin.chat_id]?.title || origin.author_signature || '频道';
    }
};

const getForwardPhoto = (forwardInfo: messageForwardInfo): chatPhotoInfo | profilePhoto | undefined => {
    const origin = forwardInfo.origin;
    switch (origin._) {
        case 'messageOriginUser':
            return users.value[origin.sender_user_id]?.profile_photo;
        case 'messageOriginChat':
            return chats.value[origin.sender_chat_id]?.photo;
        case 'messageOriginChannel':
            return chats.value[origin.chat_id]?.photo;
        case 'messageOriginHiddenUser':
            return undefined;
    }
};

const isSavedForwardedMessage = (msg: message) =>
    !!msg.forward_info && !!chat.value && isSavedMessagesChat(chat.value, myId.value);

const getDisplaySenderName = (msg: message) =>
    isSavedForwardedMessage(msg) && msg.forward_info
        ? getForwardName(msg.forward_info)
        : getSenderName(msg);

const getDisplaySenderPhoto = (msg: message): chatPhotoInfo | profilePhoto | undefined =>
    isSavedForwardedMessage(msg) && msg.forward_info
        ? getForwardPhoto(msg.forward_info)
        : getSenderPhoto(msg);

const canNavigateForward = (forwardInfo: messageForwardInfo) =>
    !!getForwardNavigationTarget(forwardInfo);

async function openForwardSource(forwardInfo: messageForwardInfo) {
    const target = getForwardNavigationTarget(forwardInfo);
    if (!target) return;

    try {
        if (target.type === 'user') {
            const privateChat = await tdlibSend({
                _: 'createPrivateChat',
                user_id: target.userId,
                force: false
            }) as chat;
            await router.push(`/home/chats/${privateChat.id}`);
            return;
        }

        await router.push({
            name: 'chat-detail',
            params: { id: String(target.chatId) },
            query: target.messageId ? { message: String(target.messageId) } : {}
        });
    } catch (error) {
        console.error('Failed to open forwarded message source:', error);
    }
}

// ==================== Computed ====================
const showSenderName = computed(() => {
    if (!chat.value) return false;
    return chat.value.type._ !== 'chatTypePrivate';
});

/** 是否显示左侧头像列（群组和开启了显示发送者的频道） */
const showAvatarColumn = computed(() => {
    if (!chat.value) return false;
    if (chat.value.type._ === 'chatTypePrivate') return false;
    if (chat.value.type._ === 'chatTypeSupergroup' && chat.value.type.is_channel) {
        const sg = supergroups.value[chat.value.type.supergroup_id];
        if (sg) return !!(sg.sign_messages || (sg as any).show_message_sender);
        return true; // 保守策略
    }
    return true;
});

/**
 * 群聊头像属于实际发送者；收藏中的转发消息改用原始来源头像。
 * 普通私聊仍不额外占用头像列。
 */
const shouldReserveAvatarColumn = (msg: message) => {
    if (isSelf(msg)) return false;
    return isSavedForwardedMessage(msg) || showAvatarColumn.value;
};

const showSkeleton = computed(() => messages.value.length === 0 && !isReady.value);

// ==================== First/Last In Group (oldest-first) ====================
/** 判断两条消息是否是同一发送者 */
const isSameSender = (a: message | undefined, b: message | undefined) => {
    if (!a || !b) return false;
    if (isSelf(a) !== isSelf(b)) return false;

    const aIsSavedForward = isSavedForwardedMessage(a);
    const bIsSavedForward = isSavedForwardedMessage(b);
    if (aIsSavedForward || bIsSavedForward) {
        return aIsSavedForward
            && bIsSavedForward
            && !!a.forward_info
            && !!b.forward_info
            && getForwardOriginKey(a.forward_info) === getForwardOriginKey(b.forward_info);
    }

    if (a.sender_id._ !== b.sender_id._) return false;
    if (a.sender_id._ === 'messageSenderUser' && b.sender_id._ === 'messageSenderUser') {
        return a.sender_id.user_id === b.sender_id.user_id;
    }
    if (a.sender_id._ === 'messageSenderChat' && b.sender_id._ === 'messageSenderChat') {
        return a.sender_id.chat_id === b.sender_id.chat_id;
    }
    return false;
};

// ==================== Display Items ====================
interface SingleDisplayItem {
    type: 'single';
    key: string;
    msg: message;
    index: number;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    showAvatar: boolean;
}

interface AlbumDisplayItem {
    type: 'album';
    key: string;
    messages: message[];
    firstIndex: number;
}

interface DateDisplayItem {
    type: 'date';
    key: string;
    date: number;
    text: string;
}

interface UnreadDisplayItem {
    type: 'unread';
    key: string;
}

type DisplayItem = SingleDisplayItem | AlbumDisplayItem | DateDisplayItem | UnreadDisplayItem;

function formatDateLabel(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const now = new Date();
    if (d.getFullYear() !== now.getFullYear()) {
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function isSameCalendarDay(a: number, b: number): boolean {
    const da = new Date(a * 1000);
    const db = new Date(b * 1000);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
}

/** 构建显示条目：日期分隔 + 单条消息(含分组信息) + 相册分组 */
const messageItems = computed<DisplayItem[]>(() => {
    const items: DisplayItem[] = [];
    const M = messages.value;
    if (M.length === 0) return items;

    // 日期分隔逻辑：不同日期的相邻消息之间插入
    // 先计算出所有日期分界点
    let lastDate = M[0].date;
    let hasUnreadDivider = false;
    const unreadBoundary = M.find(message => message.id === unreadBoundaryMessageId.value);
    const unreadAlbumId = unreadBoundary?.media_album_id;

    let i = 0;
    while (i < M.length) {
        const msg = M[i];

        // 日期分隔
        if (!isSameCalendarDay(lastDate, msg.date)) {
            items.push({ type: 'date', key: `d-${msg.date}`, date: msg.date, text: formatDateLabel(msg.date) });
            lastDate = msg.date;
        }

        if (!hasUnreadDivider && (
            msg.id === unreadBoundaryMessageId.value
            || (unreadAlbumId && unreadAlbumId !== '0' && msg.media_album_id === unreadAlbumId)
        )) {
            items.push({ type: 'unread', key: `unread-${unreadBoundaryMessageId.value}` });
            hasUnreadDivider = true;
        }

        // 相册分组
        if (msg.media_album_id && msg.media_album_id !== '0' && isAlbumMedia(msg)) {
            const albumMsgs: message[] = [msg];
            let j = i + 1;
            while (j < M.length && M[j].media_album_id === msg.media_album_id && isAlbumMedia(M[j])) {
                albumMsgs.push(M[j]);
                j++;
            }
            items.push({ type: 'album', key: `a-${msg.media_album_id}`, messages: albumMsgs, firstIndex: i });
            i = j;
        } else {
            // 单条消息
            const prev = M[i - 1];
            const next = M[i + 1];
            const isFirst = !isSameSender(prev, msg);
            const isLast = !isSameSender(msg, next);
            items.push({
                type: 'single',
                key: `m-${msg.id}`,
                msg,
                index: i,
                isFirstInGroup: isFirst,
                isLastInGroup: isLast,
                showAvatar: isLast && shouldReserveAvatarColumn(msg)
            });
            i++;
        }
    }

    // 在第一条消息前插入日期分隔（如果第一条消息不是当前日期的第一条）
    // 实际上用 lastDate 逻辑已经处理了，但第一组之前没有日期分隔
    // Telegram Web 在第一组消息前也有日期分隔，但我们的逻辑是从第二条消息开始才有分隔
    // 为了与 Telegram Web 一致，在第一条消息前也插入日期分隔
    // 但 Telegram Web 似乎只在首条消息前有日期分隔（如果是最新消息所在的日期）
    // 这里不插入首条分隔，避免多余的分隔线

    return items;
});

// ==================== Bubble Border Radius ====================
/** 根据消息在组内的位置计算气泡圆角 */
const getMessageBorderRadius = (msg: message, item: { isFirstInGroup: boolean; isLastInGroup: boolean }) => {
    const isMe = isSelf(msg);
    const first = item.isFirstInGroup;
    const last = item.isLastInGroup;

    if (isMe) {
        if (first && last) return 'rounded-[18px] rounded-tr-[6px]';
        if (first) return 'rounded-[18px] rounded-br-[6px]';
        if (last) return 'rounded-[18px] rounded-tr-[6px]';
        return 'rounded-[18px] rounded-tr-[6px] rounded-br-[6px]';
    } else {
        if (first && last) return 'rounded-[18px] rounded-tl-[6px]';
        if (first) return 'rounded-[18px] rounded-bl-[6px]';
        if (last) return 'rounded-[18px] rounded-tl-[6px]';
        return 'rounded-[18px] rounded-tl-[6px] rounded-bl-[6px]';
    }
};

// ==================== Album Helpers ====================
const isSelfAlbum = (item: AlbumDisplayItem) => isSelf(item.messages[0]);

// ==================== 权限 ====================
const currentMemberStatus = computed<ChatMemberStatus | undefined>(() => {
    const currentChat = chat.value;
    if (currentChat?.type._ === 'chatTypeSupergroup') {
        return supergroups.value[currentChat.type.supergroup_id]?.status;
    }
    if (currentChat?.type._ === 'chatTypeBasicGroup') {
        return basicGroups.value[currentChat.type.basic_group_id]?.status;
    }
    return undefined;
});

const isMemberStatus = (status: ChatMemberStatus) => {
    if (status._ === 'chatMemberStatusMember' || status._ === 'chatMemberStatusAdministrator') return true;
    if (status._ === 'chatMemberStatusCreator' || status._ === 'chatMemberStatusRestricted') return status.is_member;
    return false;
};

const canSend = computed(() => {
    if (!chat.value) return false;
    const c = chat.value;
    if (c.type._ === 'chatTypePrivate') return true;

    if (c.type._ === 'chatTypeSupergroup' || c.type._ === 'chatTypeBasicGroup') {
        const status = currentMemberStatus.value;
        if (!status || !isMemberStatus(status)) return false;
        if (status._ === 'chatMemberStatusRestricted') return status.permissions.can_send_basic_messages;
    }

    if (c.permissions?.can_send_basic_messages) return true;
    // 管理员或创建者
    if (c.type._ === 'chatTypeSupergroup') {
        const sg = supergroups.value[c.type.supergroup_id];
        if (sg) return sg.status._ === 'chatMemberStatusCreator' || sg.status._ === 'chatMemberStatusAdministrator';
    } else if (c.type._ === 'chatTypeBasicGroup') {
        const bg = basicGroups.value[c.type.basic_group_id];
        if (bg) return bg.status._ === 'chatMemberStatusCreator' || bg.status._ === 'chatMemberStatusAdministrator';
    }
    return false;
});

const showMembershipAction = computed(() => {
    const currentChat = chat.value;
    const status = currentMemberStatus.value;
    if (!currentChat || !status) return false;
    if (currentChat.type._ !== 'chatTypeSupergroup' && currentChat.type._ !== 'chatTypeBasicGroup') return false;
    return !isMemberStatus(status);
});

const canJoinCurrentChat = computed(() => currentMemberStatus.value?._ !== 'chatMemberStatusBanned');

const membershipActionLabel = computed(() => {
    const currentChat = chat.value;
    const noun = currentChat?.type._ === 'chatTypeSupergroup' && currentChat.type.is_channel ? '频道' : '群组';
    if (isJoinPending.value) return '处理中...';
    if (joinRequestSent.value) return '已发送加入申请';
    if (!canJoinCurrentChat.value) return `无法加入${noun}`;

    const needsRequest = currentChat?.type._ === 'chatTypeSupergroup'
        && !!supergroups.value[currentChat.type.supergroup_id]?.join_by_request;
    return needsRequest ? `申请加入${noun}` : `加入${noun}`;
});

async function joinCurrentChat() {
    const currentChat = chat.value;
    if (!currentChat || !canJoinCurrentChat.value || isJoinPending.value || joinRequestSent.value) return;

    const currentChatId = currentChat.id;
    isJoinPending.value = true;
    try {
        await tdlibSend({ _: 'joinChat', chat_id: currentChatId });
        if (chat.value?.id !== currentChatId) return;

        if (currentChat.type._ === 'chatTypeSupergroup') {
            const group = await tdlibSend({ _: 'getSupergroup', supergroup_id: currentChat.type.supergroup_id });
            if (chat.value?.id === currentChatId) supergroups.value[group.id] = group;
        } else if (currentChat.type._ === 'chatTypeBasicGroup') {
            const group = await tdlibSend({ _: 'getBasicGroup', basic_group_id: currentChat.type.basic_group_id });
            if (chat.value?.id === currentChatId) basicGroups.value[group.id] = group;
        }
    } catch (e) {
        if (typeof e === 'object' && e !== null && 'message' in e && e.message === 'INVITE_REQUEST_SENT') {
            if (chat.value?.id === currentChatId) joinRequestSent.value = true;
        } else {
            console.error('Failed to join chat:', e);
        }
    } finally {
        if (chat.value?.id === currentChatId) isJoinPending.value = false;
    }
}

const showChannelActions = computed(() => {
    const currentChat = chat.value;
    if (!currentChat || canSend.value || currentChat.type._ !== 'chatTypeSupergroup') return false;
    return currentChat.type.is_channel || !!supergroups.value[currentChat.type.supergroup_id]?.is_broadcast_group;
});

async function syncNotificationMuteState(chatData: chat, guardId?: number) {
    const settings = chatData.notification_settings;
    if (!settings.use_default_mute_for) {
        if (guardId !== undefined && chat.value?.id !== guardId) return;
        notificationsMuted.value = settings.mute_for > 0;
        return;
    }

    const scope = chatData.type._ === 'chatTypeSupergroup' && chatData.type.is_channel
        ? { _: 'notificationSettingsScopeChannelChats' as const }
        : { _: 'notificationSettingsScopeGroupChats' as const };
    try {
        const scopeSettings = await tdlibSend({ _: 'getScopeNotificationSettings', scope });
        if (guardId !== undefined && chat.value?.id !== guardId) return;
        notificationsMuted.value = scopeSettings.mute_for > 0;
    } catch (e) {
        if (guardId !== undefined && chat.value?.id !== guardId) return;
        notificationsMuted.value = settings.mute_for > 0;
        console.error('Failed to load notification scope settings:', e);
    }
}

async function toggleNotifications() {
    const currentChat = chat.value;
    if (!currentChat || isNotificationTogglePending.value) return;

    isNotificationTogglePending.value = true;
    const nextMuted = !notificationsMuted.value;
    const currentChatId = currentChat.id;
    try {
        await tdlibSend({
            _: 'setChatNotificationSettings',
            chat_id: currentChat.id,
            notification_settings: {
                ...currentChat.notification_settings,
                _: 'chatNotificationSettings',
                use_default_mute_for: false,
                mute_for: nextMuted ? 2147483647 : 0
            }
        });
        if (chat.value?.id !== currentChatId) return;
        currentChat.notification_settings.use_default_mute_for = false;
        currentChat.notification_settings.mute_for = nextMuted ? 2147483647 : 0;
        notificationsMuted.value = nextMuted;
    } catch (e) {
        console.error('Failed to update chat notification settings:', e);
    } finally {
        if (chat.value?.id === currentChatId) isNotificationTogglePending.value = false;
    }
}

const openLinkedChat = () => {
    if (linkedChatId.value) router.push(`/home/chats/${linkedChatId.value}`);
};

// ==================== New Message Animation ====================
const isNewMessage = (id: number) => newMessageIds.value.has(id);
const removeNewMessageId = (id: number) => newMessageIds.value.delete(id);

const handleScrollToBottom = () => {
    showScrollButton.value = false;
    newMessageCount.value = 0;
    scrollToBottom();
};
</script>
<style scoped>
/* 新消息淡入上弹动画 */
@keyframes message-pop-in {
    from {
        opacity: 0;
        transform: translateY(16px) scale(0.97);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.animate-message-in {
    animation: message-pop-in 0.25s ease-out;
}

/* 叠层面板滑动动画 */
.overlay-slide-enter-active,
.overlay-slide-leave-active {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.overlay-slide-enter-from,
.overlay-slide-leave-to {
    transform: translateX(100%);
}

/* 跳到底部按钮淡入淡出 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
<style>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 2px;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
}

.messages-scroll {
    min-height: 0;
}

/* Telegram-like bubble style: text should wrap nicely */
.messages-scroll>div>div>div>.max-w-\[70\%\] {
    word-break: break-word;
    line-height: 1.4;
}
</style>
