<template>
    <div class="flex w-full flex-col h-full relative">
        <!-- Header -->
        <ChatDetailHeader :chat="chat" />

        <!-- Skeleton Loading -->
        <div v-if="showSkeleton"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar pb-24 flex flex-col messages-scroll">
            <div class="flex-1"></div>
            <div v-for="n in 8" :key="n" class="flex mb-4" :class="n % 3 === 0 ? 'justify-end' : 'justify-start'">
                <div v-if="n % 3 !== 0" class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 mr-2 shrink-0"></div>
                <div class="p-3 rounded-lg"
                    :class="n % 3 === 0 ? 'bg-blue-200 dark:bg-blue-900' : 'bg-gray-200 dark:bg-gray-700'"
                    :style="{ width: (120 + Math.random() * 180) + 'px', height: '48px' }">
                </div>
            </div>
        </div>

        <!-- Messages Area -->
        <div v-else class="flex-1 overflow-y-auto p-4 custom-scrollbar pb-24 flex flex-col messages-scroll"
            ref="messagesContainer" @scroll.passive="onScroll">

            <!-- Loading indicator at top (历史加载中) -->
            <div v-if="isLoadingMore" class="text-center text-gray-400 text-sm py-2">
                加载中...
            </div>

            <!-- Spacer pushes messages to bottom when not enough -->
            <div class="flex-1"></div>

            <div v-for="(msg, index) in messages" :key="msg.id" :data-msg-id="msg.id" class="flex" :class="[
                isSelf(msg) ? 'justify-end' : 'justify-start',
                isLastInGroup(index) ? 'mb-4' : 'mb-1'
            ]">

                <!-- Avatar for others -->
                <div v-if="!isSelf(msg) && shouldReserveAvatarSpace(msg)" class="mr-2 shrink-0 self-end"
                    :class="{ 'invisible': !shouldShowAvatar(index) }">
                    <div class="w-12 h-12">
                        <Avatar :photo="getSenderPhoto(msg)" :title="getSenderName(msg)" />
                    </div>

                </div>

                <div :class="[
                    isMediaMessage(msg) ? 'shadow-sm max-w-[70%] overflow-hidden' : 'p-2 pb-3 shadow-sm max-w-[70%] min-w-[120px] relative',
                    isSelf(msg)
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200',
                    getMessageBorderRadius(msg, index)
                ]">
                    <!-- Sender Name (only for groups/channels and not self) -->
                    <p v-if="!isSelf(msg) && shouldShowSenderName && isFirstInGroup(index)"
                        class="text-xs font-bold mb-1 px-2 pt-1"
                        :class="isSelf(msg) ? 'text-blue-100' : 'text-blue-500'">
                        {{ getSenderName(msg) }}
                    </p>

                    <!-- Service messages get full-width treatment -->
                    <template v-if="isServiceMessage(msg)">
                        <MessageContent :content="msg.content" />
                    </template>

                    <!-- Regular messages -->
                    <template v-else>
                        <MessageContent :content="msg.content" :isSelf="isSelf(msg)" :date="msg.date"
                            :forwardInfo="msg.forward_info" :isFirstInGroup="isFirstInGroup(index)"
                            :isLastInGroup="isLastInGroup(index)" />

                        <!-- Time for non-media messages (media handles time internally) -->
                        <span v-if="!isMediaMessage(msg)"
                            class="block text-right text-[10px] leading-none px-1 pb-0.5 -mt-0.5"
                            :class="isSelf(msg) ? 'text-blue-100' : 'text-gray-400'">
                            {{ formatTime(msg.date) }}
                        </span>
                    </template>
                </div>
            </div>
        </div>

        <!-- Input Area -->
        <div class="absolute bottom-0 left-0 right-0 z-10" v-if="canSend">
            <MessageInput v-model="messageInput" @send="handleSend" @attach="handleAttach" />
        </div>
    </div>
</template>
<script setup lang="ts">
import MessageInput from './MessageInput.vue';
import Avatar from '../avatar.vue';
import MessageContent from './MessageContent/index.vue';
import ChatDetailHeader from './Header.vue';

import formatTime from '../../../utils/formatTime';
import { tdlibSend } from '../../../utils/tdlib';

import { useRoute } from 'vue-router';
import { computed, watch, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useUserStore } from '../../../store/user';
import { storeToRefs } from 'pinia';
import { listen } from "@tauri-apps/api/event";

import type { chat, message, user, chatPhotoInfo, profilePhoto, Update, supergroup, basicGroup } from 'tdlib-types';

const route = useRoute();

// 从路由 params 解析当前聊天 ID
const chatId = computed(() => {
    const id = route.params.id;
    return id ? parseInt(id as string) : undefined;
});

const chat = ref<chat | undefined>(undefined);
const messageInput = ref('');

// 消息相关状态
const messages = ref<message[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);
const isLoadingMore = ref(false);
const isHistoryExhausted = ref(false);
const isLoadingMessages = ref(false);

/** 标记初始加载是否已完成（包括可能的多页填充） */
const initialLoadComplete = ref(false);
/** 定位目标消息 ID（last_read） */
const initialScrollTarget = ref<number | null>(null);
const initialPositionApplied = ref(false);

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

// 监听 TDLib 更新
onMounted(async () => {
    if (!userProfile.value) {
        await userStore.fetchUser();
    }
    unlisten = await listen<Update>("tdlib-update", (event) => {
        const update = event.payload;
        handleUpdate(update);
    });
});

onUnmounted(() => {
    if (unlisten) unlisten();
});

/**
 * TDLib 事件处理
 * 在 initialLoadComplete 之前，忽略 updateNewMessage 以避免干扰初始定位；
 * 但 updateMessageContent / updateDeleteMessages 仍然处理（不影响布局）。
 */
const handleUpdate = async (update: Update) => {
    switch (update._) {
        case 'updateNewMessage': {
            // 初始加载完成前忽略新消息事件，避免干扰定位
            if (!initialLoadComplete.value) return;

            const msg = update.message;
            if (msg.chat_id !== chatId.value) return;
            if (messages.value.find(m => m.id === msg.id)) return;

            const senderIsMe =
                msg.sender_id._ === 'messageSenderUser' &&
                msg.sender_id.user_id === myId.value;

            const isAtBottom = (() => {
                const el = messagesContainer.value;
                if (!el) return true;
                const threshold = 150;
                return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
            })();

            messages.value.push(msg);
            await fetchSenders([msg]);

            if (senderIsMe || isAtBottom) {
                scrollToBottom();
            }
            break;
        }

        case 'updateMessageContent': {
            if (update.chat_id !== chatId.value) return;
            const msg = messages.value.find(m => m.id === update.message_id);
            if (msg) {
                msg.content = update.new_content;
            }
            break;
        }

        case 'updateDeleteMessages': {
            if (update.chat_id !== chatId.value) return;
            messages.value = messages.value.filter(m => !update.message_ids.includes(m.id));
            break;
        }

        default:
            break;
    }
};

/**
 * 尝试从消息列表中定位到 initialScrollTarget 并滚动
 */
const applyInitialScroll = async () => {
    if (!initialScrollTarget.value || initialPositionApplied.value) return;

    const targetId = initialScrollTarget.value;
    // 最多尝试 10 次上拉加载来找到目标消息
    for (let attempt = 0; attempt < 10; attempt++) {
        const idx = messages.value.findIndex(m => m.id === targetId);
        if (idx !== -1) {
            await nextTick();
            scrollToMessage(targetId);
            initialPositionApplied.value = true;
            return;
        }
        if (isHistoryExhausted.value || messages.value.length === 0) break;
        const firstId = messages.value[0].id;
        await loadMessages(chatId.value!, firstId);
        await nextTick();
    }
    // 未找到则退到底部
    scrollToBottom();
    initialPositionApplied.value = true;
};

/**
 * 滚动到指定消息元素
 */
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
        if (desired === 0 && el.scrollHeight > containerHeight) {
            desired = Math.max(0, el.scrollHeight - containerHeight);
        }
        el.scrollTop = desired;
    });
};

// 获取chat信息并加载消息
watch(chatId, async (newChatId) => {
    if (newChatId === undefined) return;
    const currentId = newChatId;

    // 重置状态
    messages.value = [];
    chat.value = undefined;
    isHistoryExhausted.value = false;
    isLoadingMessages.value = false;
    initialLoadComplete.value = false;
    initialScrollTarget.value = null;
    initialPositionApplied.value = false;

    try {
        const chatData = await tdlibSend({ _: 'getChat', chat_id: currentId });
        if (chatId.value !== currentId) return;
        chat.value = chatData;
        console.log(chatData);

        // 获取超级群组/基本群组信息
        if (chatData.type._ === 'chatTypeSupergroup') {
            const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: chatData.type.supergroup_id });
            supergroups.value[chatData.type.supergroup_id] = sg;
        } else if (chatData.type._ === 'chatTypeBasicGroup') {
            const bg = await tdlibSend({ _: 'getBasicGroup', basic_group_id: chatData.type.basic_group_id });
            basicGroups.value[chatData.type.basic_group_id] = bg;
        }

        // 计算定位目标：取 last_read_inbox / outbox 的最大值
        const inboxId = (chatData as any).last_read_inbox_message_id || 0;
        const outboxId = (chatData as any).last_read_outbox_message_id || 0;
        const lastReadId = Math.max(inboxId, outboxId);
        initialScrollTarget.value = lastReadId > 0 ? lastReadId : null;

        // 加载第一页消息（最新消息）
        await loadMessages(currentId);
        if (chatId.value !== currentId) return;

        // 如果不足以填满容器，继续加载更多历史
        await nextTick();
        let fillAttempts = 0;
        while (
            chatId.value === currentId &&
            messagesContainer.value &&
            messagesContainer.value.scrollHeight <= messagesContainer.value.clientHeight &&
            !isHistoryExhausted.value &&
            messages.value.length > 0 &&
            fillAttempts < 5
        ) {
            await loadMessages(currentId, messages.value[0].id);
            await nextTick();
            fillAttempts++;
        }

        // 标记初始加载完成（此后 TDLib 事件开始处理新消息）
        initialLoadComplete.value = true;

        // 执行定位
        if (initialScrollTarget.value && !initialPositionApplied.value) {
            await applyInitialScroll();
        } else if (!initialPositionApplied.value) {
            scrollToBottom();
            initialPositionApplied.value = true;
        }
    } catch (e) {
        console.error("Error loading chat:", e);
        initialLoadComplete.value = true;
    }
}, { immediate: true });

// 加载聊天历史消息
const loadMessages = async (chatIdNum: number, fromMessageId: number = 0) => {
    if (isLoadingMessages.value) return;
    isLoadingMessages.value = true;

    console.log(`Loading messages for chat ${chatIdNum} from ${fromMessageId}`);
    try {
        const history = await tdlibSend({
            _: 'getChatHistory',
            chat_id: chatIdNum,
            from_message_id: fromMessageId,
            offset: 0,
            limit: 50,
            only_local: false
        });
        console.log(`Received ${history.messages?.length} messages`);

        if (history.messages && history.messages.length > 0) {
            const validMessages = history.messages.filter((m): m is message => !!m);

            if (fromMessageId === 0) {
                // 首次加载：设置为正序（旧→新），但不滚动——由 watch 统一处理定位
                messages.value = validMessages.reverse();
            } else {
                // 上拉加载更多历史：去重后插入到最前面
                const existingIds = new Set(messages.value.map(m => m.id));
                const newMessages = validMessages.filter(m => !existingIds.has(m.id)).reverse();
                console.log(`New unique messages: ${newMessages.length}`);

                if (newMessages.length > 0) {
                    messages.value = [...newMessages, ...messages.value];
                } else {
                    isHistoryExhausted.value = true;
                }
            }
            await fetchSenders(validMessages);
        } else {
            console.log("No messages received.");
            if (fromMessageId !== 0) {
                isHistoryExhausted.value = true;
            }
        }
    } catch (e) {
        console.error("Error in loadMessages:", e);
    } finally {
        isLoadingMessages.value = false;
    }
};

// 上拉加载更多历史消息
const onScroll = async (e: Event) => {
    const el = e.currentTarget as HTMLElement;

    if (
        el.scrollTop >= 50 ||
        isLoadingMore.value ||
        isHistoryExhausted.value ||
        messages.value.length === 0 ||
        !chatId.value
    ) {
        return;
    }

    isLoadingMore.value = true;

    const oldHeight = el.scrollHeight;
    const oldTop = el.scrollTop;

    await loadMessages(chatId.value, messages.value[0].id);

    await nextTick();

    const newHeight = el.scrollHeight;
    el.scrollTop = oldTop + (newHeight - oldHeight);

    isLoadingMore.value = false;

    if (
        el.scrollHeight <= el.clientHeight &&
        !isHistoryExhausted.value &&
        messages.value.length > 0
    ) {
        onScroll(e);
    }
};

// 并发获取消息中涉及到的用户/聊天信息
const fetchSenders = async (msgs: message[]) => {
    const userIdSet = new Set<number>();
    const chatIdSet = new Set<number>();

    msgs.forEach(m => {
        if (m.sender_id._ === 'messageSenderUser') {
            if (!users.value[m.sender_id.user_id]) userIdSet.add(m.sender_id.user_id);
        } else if (m.sender_id._ === 'messageSenderChat') {
            if (!chats.value[m.sender_id.chat_id]) chatIdSet.add(m.sender_id.chat_id);
        }
    });

    const userIds = Array.from(userIdSet);
    const chatIds = Array.from(chatIdSet);

    const userPromises = userIds.map(uid =>
        tdlibSend({ _: 'getUser', user_id: uid })
            .then(u => ({ uid, u }))
            .catch(e => {
                console.error(`Failed to fetch user ${uid}`, e);
                return null;
            })
    );

    const chatPromises = chatIds.map(cid =>
        tdlibSend({ _: 'getChat', chat_id: cid })
            .then(c => ({ cid, c }))
            .catch(e => {
                console.error(`Failed to fetch chat ${cid}`, e);
                return null;
            })
    );

    const [userResults, chatResults] = await Promise.all([Promise.all(userPromises), Promise.all(chatPromises)]);

    userResults.forEach(r => {
        if (r) users.value[r.uid] = r.u;
    });

    chatResults.forEach(r => {
        if (r) chats.value[r.cid] = r.c;
    });
};

// 滚动到底部
const scrollToBottom = () => {
    nextTick(() => {
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
    });
};

// 发送消息
const handleSend = async (text: string) => {
    if (!chatId.value || !text.trim()) return;

    try {
        await tdlibSend({
            _: 'sendMessage',
            chat_id: chatId.value,
            input_message_content: {
                _: 'inputMessageText',
                text: {
                    _: 'formattedText',
                    text: text,
                    entities: []
                },
                disable_web_page_preview: false,
                clear_draft: true
            }
        });
        messageInput.value = '';
    } catch (e) {
        console.error("Failed to send message:", e);
    }
};

// 处理附件
const handleAttach = (files: FileList) => {
    console.log("Attach files:", files);
};

// ---------- Helper Functions ----------

const isSelf = (msg: message) => {
    if (msg.sender_id._ === 'messageSenderUser') {
        return msg.sender_id.user_id === myId.value;
    }
    return false;
};

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
        return u ? `${u.first_name} ${u.last_name}`.trim() : 'Unknown User';
    } else if (msg.sender_id._ === 'messageSenderChat') {
        const c = chats.value[msg.sender_id.chat_id];
        return c ? c.title : 'Unknown Chat';
    }
    return 'Unknown';
};

const getSenderPhoto = (msg: message): chatPhotoInfo | profilePhoto | undefined => {
    if (msg.sender_id._ === 'messageSenderUser') {
        const u = users.value[msg.sender_id.user_id];
        return u?.profile_photo;
    } else if (msg.sender_id._ === 'messageSenderChat') {
        const c = chats.value[msg.sender_id.chat_id];
        return c?.photo;
    }
    return undefined;
};



const shouldShowSenderName = computed(() => {
    if (!chat.value) return false;
    return chat.value.type._ !== 'chatTypePrivate';
});

const showSkeleton = computed(() => {
    return messages.value.length === 0 && isLoadingMessages.value;
});

// Grouping Helpers
const isSameSender = (m1: message, m2: message) => {
    if (m1.sender_id._ !== m2.sender_id._) return false;
    if (m1.sender_id._ === "messageSenderUser" && m2.sender_id._ === "messageSenderUser") {
        return m1.sender_id.user_id === m2.sender_id.user_id;
    } else if (m1.sender_id._ === "messageSenderChat" && m2.sender_id._ === "messageSenderChat") {
        return m1.sender_id.chat_id === m2.sender_id.chat_id;
    }
    return false;
};

const isFirstInGroup = (index: number) => {
    if (index === 0) return true;
    const prevMsg = messages.value[index - 1];
    const currMsg = messages.value[index];
    return !isSameSender(prevMsg, currMsg);
};

const isLastInGroup = (index: number) => {
    if (index === messages.value.length - 1) return true;
    const nextMsg = messages.value[index + 1];
    const currMsg = messages.value[index];
    return !isSameSender(currMsg, nextMsg);
};

const shouldReserveAvatarSpace = (msg: message) => {
    if (isSelf(msg)) return false;
    if (!chat.value) return false;
    // 1对1私聊不显示头像
    if (chat.value.type._ === 'chatTypePrivate') return false;
    // 频道（未开启签名）不显示头像
    if (chat.value.type._ === 'chatTypeSupergroup' && chat.value.type.is_channel) {
        const sg = supergroups.value[chat.value.type.supergroup_id];
        if (sg && !sg.sign_messages) {
            return false;
        }
    }
    return true;
};

const shouldShowAvatar = (index: number) => {
    return isLastInGroup(index);
};

const getMessageBorderRadius = (msg: message, index: number) => {
    const isMe = isSelf(msg);
    const first = isFirstInGroup(index);
    const last = isLastInGroup(index);

    if (isMe) {
        if (first && last) return 'rounded-tr-none rounded-lg';
        if (first) return 'rounded-tr-none rounded-br-sm rounded-l-lg';
        if (last) return 'rounded-tr-sm rounded-br-lg rounded-l-lg';
        return 'rounded-tr-sm rounded-br-sm rounded-l-lg';
    } else {
        if (first && last) return 'rounded-tl-none rounded-lg';
        if (first) return 'rounded-tl-none rounded-bl-sm rounded-r-lg';
        if (last) return 'rounded-tl-sm rounded-bl-lg rounded-r-lg';
        return 'rounded-tl-sm rounded-bl-sm rounded-r-lg';
    }
};

const canSend = computed(() => {
    if (!chat.value) return false;
    if (chat.value.type._ === 'chatTypePrivate') return true;
    if (chat.value.permissions.can_send_basic_messages) return true;
    if (chat.value.type._ === 'chatTypeSupergroup') {
        const sg = supergroups.value[chat.value.type.supergroup_id];
        if (sg) {
            return sg.status._ === 'chatMemberStatusCreator' || sg.status._ === 'chatMemberStatusAdministrator';
        }
    } else if (chat.value.type._ === 'chatTypeBasicGroup') {
        const bg = basicGroups.value[chat.value.type.basic_group_id];
        if (bg) {
            return bg.status._ === 'chatMemberStatusCreator' || bg.status._ === 'chatMemberStatusAdministrator';
        }
    }
    return false;
});
</script>
<style scoped>
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
</style>