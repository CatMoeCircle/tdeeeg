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
            class="absolute inset-0 overflow-y-auto px-4 custom-scrollbar flex flex-col messages-scroll pt-16 pb-28"
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

                    <!-- Album group -->
                    <template v-else-if="item.type === 'album'">
                        <div :data-msg-id="item.messages[0].id"
                            :class="{ 'animate-message-in': isNewMessage(item.messages[0].id) }"
                            @animationend="removeNewMessageId(item.messages[0].id)">
                            <div class="flex mb-2" :class="isSelfAlbum(item) ? 'justify-end' : 'justify-start'">
                                <div v-if="!isSelfAlbum(item) && showAvatarColumn" class="w-12 shrink-0 mr-2 self-end">
                                    <div class="w-12 h-12">
                                        <Avatar :photo="getSenderPhoto(item.messages[0])"
                                            :title="getSenderName(item.messages[0])" />
                                    </div>
                                </div>
                                <div class="shadow-sm max-w-[70%] overflow-hidden rounded-lg"
                                    :class="isSelfAlbum(item) ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'">
                                    <p v-if="!isSelfAlbum(item) && showSenderName"
                                        class="text-xs font-semibold px-2 pt-2 pb-0.5 text-blue-500">
                                        {{ getSenderName(item.messages[0]) }}
                                    </p>
                                    <MessageAlbum :messages="item.messages" :isSelf="isSelfAlbum(item)" :chatId="chatId"
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
                                <div v-if="!isSelf(item.msg) && showAvatarColumn" class="w-12 shrink-0 mr-2 self-end"
                                    :class="{ 'invisible': !item.showAvatar }">
                                    <div class="w-12 h-12">
                                        <Avatar :photo="getSenderPhoto(item.msg)" :title="getSenderName(item.msg)" />
                                    </div>
                                </div>
                                <div :class="[
                                    isMediaMessage(item.msg)
                                        ? 'shadow-sm max-w-[70%] overflow-hidden'
                                        : 'px-3 py-2 shadow-sm max-w-[70%] min-w-[120px]',
                                    isSelf(item.msg)
                                        ? 'bg-[#6ab2f2] dark:bg-[#6ab2f2] text-white'
                                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200',
                                    getMessageBorderRadius(item.msg, item)
                                ]">
                                    <p v-if="!isSelf(item.msg) && showSenderName && item.isFirstInGroup"
                                        class="text-xs font-semibold mb-0.5 -mt-0.5 text-blue-500">
                                        {{ getSenderName(item.msg) }}
                                    </p>
                                    <p v-if="item.msg.forward_info" class="text-xs font-semibold text-blue-500 mb-0.5">
                                        {{ getForwardLabel(item.msg.forward_info) }}
                                    </p>
                                    <MessageContent :content="item.msg.content" :isSelf="isSelf(item.msg)"
                                        :date="item.msg.date" :forwardInfo="item.msg.forward_info"
                                        :isFirstInGroup="item.isFirstInGroup" :isLastInGroup="item.isLastInGroup"
                                        :sendingState="item.msg.sending_state"
                                        :viewCount="item.msg.interaction_info?.view_count"
                                        :authorSignature="item.msg.author_signature || undefined" :chatId="chatId"
                                        :messageId="item.msg.id"
                                        :replyTo="item.msg.reply_to?._ === 'messageReplyToMessage' ? item.msg.reply_to : undefined"
                                        :messageList="messages" @jumpToMessage="scrollToMessage" />
                                    <span v-if="!isMediaMessage(item.msg) && !isSelf(item.msg)"
                                        class="block text-right text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-none">
                                        <MessageStatus :date="item.msg.date" :isOutgoing="false"
                                            :sendingState="item.msg.sending_state"
                                            :viewCount="item.msg.interaction_info?.view_count"
                                            :authorSignature="item.msg.author_signature || undefined" />
                                    </span>
                                    <span v-else-if="!isMediaMessage(item.msg) && isSelf(item.msg)"
                                        class="block text-right text-[11px] text-blue-100 mt-0.5 leading-none">
                                        <MessageStatus :date="item.msg.date" :isOutgoing="true"
                                            :sendingState="item.msg.sending_state"
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
            class="absolute top-0 left-0 right-0 z-10 bg-white/30 dark:bg-[#1c1c1c]/70 backdrop-blur-lg border-b border-gray-200/60 dark:border-gray-800/60">
            <ChatDetailHeader :chat="chat" />
        </div>

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
    </div>
</template>
<script setup lang="ts">
import MessageInput from './MessageInput.vue';
import Avatar from '../avatar.vue';
import MessageContent from './MessageContent/index.vue';
import MessageStatus from './MessageContent/MessageStatus.vue';
import MessageAlbum from './MessageContent/MessageAlbum.vue';
import ChatDetailHeader from './Header.vue';

import { tdlibSend } from '../../../utils/tdlib';

import { MessageCircleIcon } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { computed, watch, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useUserStore } from '../../../store/user';
import { storeToRefs } from 'pinia';
import { listen } from "@tauri-apps/api/event";

import type { chat, message, user, chatPhotoInfo, profilePhoto, Update, supergroup, basicGroup, messageForwardInfo, ChatMemberStatus } from 'tdlib-types';

// ==================== Route ====================
const route = useRoute();
const router = useRouter();

const chatId = computed(() => {
    const id = route.params.id;
    return id ? parseInt(id as string) : undefined;
});

// ==================== State ====================
const chat = ref<chat | undefined>(undefined);
const messageInput = ref('');
const messages = ref<message[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);

const isLoadingMore = ref(false);
const isHistoryExhausted = ref(false);
const isReady = ref(false);           // 标记初始加载和定位已完成

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

// User Store
const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const myId = computed(() => userProfile.value?.id || 0);

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

        case 'updateDeleteMessages': {
            if (!isReady.value) return;
            if (update.chat_id !== chatId.value) return;
            // from_cache=true 的删除是本地缓存的过时标记，不是真实的删除，忽略
            if (update.from_cache) break;
            messages.value = messages.value.filter(m => !update.message_ids.includes(m.id));
            break;
        }

        case 'updateChatNotificationSettings': {
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.notification_settings = update.notification_settings;
            await syncNotificationMuteState(chat.value, update.chat_id);
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

        default:
            break;
    }
};

// ==================== Chat Loading ====================
/** 当前正在加载的聊天 ID，用于防止异步返回时的竞态条件 */
let activeChatId: number | null = null;
/** 防止 watch(chatId) 意外重复触发 */
let lastLoadedChatId: number | null = null;

// 监听 chatId 变化，加载聊天信息和消息
watch(chatId, async (newChatId) => {
    if (newChatId === undefined) return;
    // 如果已加载过同一个 chat，跳过（防止路由响应式干扰）
    if (newChatId === lastLoadedChatId) return;
    lastLoadedChatId = newChatId;
    const currentId = newChatId;
    activeChatId = currentId;

    // 重置全部状态
    resetState();

    try {
        // 1. 获取 chat 基础信息
        const chatData = await tdlibSend({ _: 'getChat', chat_id: currentId }) as chat;
        if (activeChatId !== currentId) return;
        chat.value = chatData;

        // 获取 supergroup / basicGroup 补充信息（用 activeChatId 守卫）
        await Promise.all([
            fetchGroupInfo(chatData, currentId),
            syncNotificationMuteState(chatData, currentId)
        ]);

        // 2. 计算定位目标（last_read 消息）
        const lastReadId = Math.max(
            (chatData as any).last_read_inbox_message_id || 0,
            (chatData as any).last_read_outbox_message_id || 0
        );
        const scrollTarget = lastReadId > 0 ? lastReadId : null;

        // 3. 加载首批消息（返回 旧→新 顺序）
        let allMsgs = await fetchMessages(currentId, 0, 30);
        if (activeChatId !== currentId) return;

        // 如果消息太少，多加载几页填充以确保可滚动
        if (allMsgs.length > 0 && allMsgs.length < 80) {
            for (let i = 0; i < 3; i++) {
                const oldest = allMsgs[0]; // 最旧的消息在索引 0
                const more = await fetchMessages(currentId, oldest.id, 50);
                if (more.length === 0) break;
                // 去重后再合并
                const existingIds = new Set(allMsgs.map(m => m.id));
                const unique = more.filter(m => !existingIds.has(m.id));
                if (unique.length === 0) break;
                allMsgs = [...unique, ...allMsgs];
            }
        }

        messages.value = allMsgs;
        await nextTick();

        // 4. 执行初始定位
        if (scrollTarget) {
            await scrollToTargetOrBottom(scrollTarget, currentId);
        } else {
            await scrollToBottomAsync();
        }

        // 5. 标记完成
        isReady.value = true;

        // 6. 确保加载后消息容器可滚动（至少撑满视口）
        await nextTick();
        const container = messagesContainer.value;
        if (container && container.scrollHeight <= container.clientHeight + 2) {
            // 内容太少无法滚动，尝试再加载一些旧消息
            if (messages.value.length > 0 && !isHistoryExhausted.value) {
                const oldest = messages.value[0];
                const more = await fetchMessages(currentId, oldest.id, 50);
                if (more.length > 0) {
                    messages.value = mergeMessages(messages.value, more);
                }
            }
        }
    } catch (e) {
        console.error("Error loading chat:", e);
        isReady.value = true;
    } finally {
        if (activeChatId === currentId) {
            activeChatId = null;
        }
    }
}, { immediate: true });

// ==================== Data Fetching ====================
/**
 * 从 TDLib 加载消息，返回 旧→新 顺序。
 * 注意：fromMessageId 会被 TDLib 包含在返回结果中，调用方需自行去重。
 */
async function fetchMessages(chatIdNum: number, fromMessageId: number, limit: number): Promise<message[]> {
    try {
        const result = await tdlibSend({
            _: 'getChatHistory',
            chat_id: chatIdNum,
            from_message_id: fromMessageId,
            offset: 0,
            limit,
            only_local: false
        });
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
async function fetchGroupInfo(chatData: chat, guardId: number) {
    if (chatData.type._ === 'chatTypeSupergroup') {
        const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: chatData.type.supergroup_id });
        if (activeChatId !== guardId) return;
        supergroups.value[chatData.type.supergroup_id] = sg;
        if (chatData.type.is_channel || sg.is_broadcast_group) {
            try {
                const fullInfo = await tdlibSend({
                    _: 'getSupergroupFullInfo',
                    supergroup_id: chatData.type.supergroup_id
                });
                if (activeChatId !== guardId) return;
                linkedChatId.value = fullInfo.linked_chat_id;
            } catch (e) {
                console.error('Failed to load linked chat:', e);
            }
        }
    } else if (chatData.type._ === 'chatTypeBasicGroup') {
        const bg = await tdlibSend({ _: 'getBasicGroup', basic_group_id: chatData.type.basic_group_id });
        if (activeChatId !== guardId) return;
        basicGroups.value[chatData.type.basic_group_id] = bg;
    }
}

// ==================== Scroll Management ====================
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
        const msgEl = el.querySelector(`[data-msg-id="${messageId}"]`) as HTMLElement | null;
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
async function scrollToTargetOrBottom(targetId: number, chatIdNum: number) {
    for (let attempt = 0; attempt < 10; attempt++) {
        const exists = messages.value.some(m => m.id === targetId);
        if (exists) {
            scrollToMessage(targetId);
            return;
        }
        if (isHistoryExhausted.value || messages.value.length === 0) break;
        const oldest = messages.value[0];
        const more = await fetchMessages(chatIdNum, oldest.id, 30);
        if (more.length === 0) break;
        // 去重后合并
        messages.value = mergeMessages(messages.value, more);
        await nextTick();
        // 如果没添加任何新消息，说明历史已耗尽
        if (!messages.value.some(m => m.id === targetId) && olderMessagesEmpty(more, messages.value)) {
            break;
        }
    }
    scrollToBottom();
}

/** 检查新加载的消息是否全重复 */
function olderMessagesEmpty(incoming: message[], current: message[]): boolean {
    if (incoming.length === 0) return true;
    const existingIds = new Set(current.map(m => m.id));
    return incoming.every(m => existingIds.has(m.id));
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

    // 用 activeChatId 避免竞态
    const loadChat = chatId.value;
    if (!loadChat) { isLoadingMore.value = false; return; }

    isLoadingMore.value = true;
    const oldestId = messages.value[0]?.id;
    if (oldestId) {
        const older = await fetchMessages(loadChat, oldestId, 30);
        // 切换聊天后忽略旧结果
        if (activeChatId !== null || chatId.value !== loadChat) {
            isLoadingMore.value = false;
            return;
        }
        if (older.length > 0) {
            // 去重后 prepend
            const existingIds = new Set(messages.value.map(m => m.id));
            const unique = older.filter(m => !existingIds.has(m.id));
            if (unique.length > 0) {
                const prevHeight = el.scrollHeight;
                messages.value = [...unique, ...messages.value];
                await nextTick();
                // 修正 scrollTop 以保持视觉位置不变
                el.scrollTop = el.scrollHeight - prevHeight + T;
            } else {
                // 没有新消息，标记历史已耗尽
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
    messages.value = [];
    chat.value = undefined;
    isHistoryExhausted.value = false;
    isReady.value = false;
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
const isSelf = (msg: message) =>
    msg.sender_id._ === 'messageSenderUser' && msg.sender_id.user_id === myId.value;

const MEDIA_TYPES = new Set(['messagePhoto', 'messageVideo', 'messageAnimation']);
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
const isServiceMessage = (msg: message) => SERVICE_TYPES.has(msg.content._);

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

const getForwardLabel = (fi: messageForwardInfo): string => {
    if (fi._ === 'messageForwardInfo' && fi.origin._ === 'messageOriginUser') {
        return `转发自 ${fi.origin.sender_user_id}`;
    }
    if (fi._ === 'messageForwardInfo' && fi.origin._ === 'messageOriginChat') {
        return `转发自 ${fi.origin.author_signature || '频道'}`;
    }
    if (fi._ === 'messageForwardInfo' && fi.origin._ === 'messageOriginHiddenUser') {
        return `转发自 ${fi.origin.sender_name || '隐藏用户'}`;
    }
    return '转发消息';
};

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

const showSkeleton = computed(() => messages.value.length === 0 && !isReady.value);

// ==================== First/Last In Group (oldest-first) ====================
/** 判断两条消息是否是同一发送者 */
const isSameSender = (a: message | undefined, b: message | undefined) => {
    if (!a || !b) return false;
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

type DisplayItem = SingleDisplayItem | AlbumDisplayItem | DateDisplayItem;

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

    let i = 0;
    while (i < M.length) {
        const msg = M[i];

        // 日期分隔
        if (!isSameCalendarDay(lastDate, msg.date)) {
            items.push({ type: 'date', key: `d-${msg.date}`, date: msg.date, text: formatDateLabel(msg.date) });
            lastDate = msg.date;
        }

        // 相册分组
        if (msg.media_album_id && msg.media_album_id !== '0' && !isServiceMessage(msg)) {
            const albumMsgs: message[] = [msg];
            let j = i + 1;
            while (j < M.length && M[j].media_album_id === msg.media_album_id && !isServiceMessage(M[j])) {
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
                showAvatar: isLast && showAvatarColumn.value
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
        if (first) return 'rounded-[18px] rounded-tr-[6px] rounded-br-[18px]';
        if (last) return 'rounded-[18px] rounded-br-[6px] rounded-tr-[18px]';
        return 'rounded-[18px] rounded-tr-[6px] rounded-br-[6px]';
    } else {
        if (first && last) return 'rounded-[18px] rounded-tl-[6px]';
        if (first) return 'rounded-[18px] rounded-tl-[6px] rounded-bl-[18px]';
        if (last) return 'rounded-[18px] rounded-bl-[6px] rounded-tl-[18px]';
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
