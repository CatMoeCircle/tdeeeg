<template>
    <div class="flex flex-col h-full bg-[#f5f5f5] dark:bg-[#1c1c1c] relative">
        <!-- Header -->
        <div
            class="h-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-4 flex items-center px-4 justify-between shrink-0">
            <div class="flex items-center gap-3" v-if="chat">
                <Avatar :photo="chat.photo" :title="chat.title" sizeClass="w-10 h-10" />
                <div class="flex flex-col">
                    <h2 class="font-semibold text-lg text-gray-800 dark:text-gray-100 leading-tight">{{ chat.title }}
                    </h2>
                    <span class="text-xs text-gray-400">{{ getChatStatus() }}</span>
                </div>
            </div>
            <div v-else class="flex items-center">
                <h2 class="font-semibold text-lg text-gray-800 dark:text-gray-100">Loading...</h2>
            </div>

            <div class="flex gap-4 text-gray-500">
                <PhoneIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
                <VideoIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
                <SearchIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
                <MoreHorizontalIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
            </div>
        </div>

        <!-- Messages Area -->
        <div class="flex-1 overflow-y-auto p-4 custom-scrollbar pb-24" ref="messagesContainer"
            @scroll.passive="onScroll">
            <div v-if="isLoadingMore" class="flex justify-center py-2">
                <span class="text-xs text-gray-400">Loading history...</span>
            </div>
            <div v-for="(msg, index) in messages" :key="msg.id" class="flex" :class="[
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
        <div class="absolute bottom-0 left-0 right-0 z-10" v-if="canSend">
            <MessageInput v-model="messageInput" @send="handleSend" @attach="handleAttach" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { PhoneIcon, VideoIcon, SearchIcon, MoreHorizontalIcon } from 'lucide-vue-next';
import MessageInput from './MessageInput.vue';
import Avatar from './avatar.vue';
import MessageContent from './MessageContent.vue';
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { tdlibSend } from '../../utils/tdlib';
import { listen } from "@tauri-apps/api/event";
import type { chat, message, user, chatPhotoInfo, profilePhoto, Update, supergroup, basicGroup } from 'tdlib-types';

const route = useRoute();
// 聊天输入框的双向绑定内容
const messageInput = ref('');
// 消息列表容器 DOM 引用，用于滚动和计算高度
const messagesContainer = ref<HTMLElement | null>(null);
// onScroll 使用的局部加载标志，控制 Loading 提示和防止重复触发
const isLoadingMore = ref(false);
// 标记历史消息是否已全部加载（无更多历史）
const isHistoryExhausted = ref(false);
// 全局加载消息锁，防止并发调用 loadMessages（watch 和 onScroll 共用）
const isLoadingMessages = ref(false);

// 从路由 params 解析当前聊天 ID（若无则为 null）
const chatId = computed(() => {
    const id = route.params.id;
    return id ? parseInt(id as string) : null;
});

// 当前聊天信息缓存（getChat 返回）
const chat = ref<chat | null>(null);
// 当前显示的消息数组，按时间正序（从上到下）
const messages = ref<message[]>([]);
// 当前用户 ID（自己）
const myId = ref<number>(0);
// 缓存用户信息，key 为 user_id
const users = ref<Record<number, user>>({});
// 缓存聊天/频道信息，key 为 chat_id
const chats = ref<Record<number, chat>>({});
// 缓存超级群组信息
const supergroups = ref<Record<number, supergroup>>({});
// 缓存基础群组信息
const basicGroups = ref<Record<number, basicGroup>>({});
// 监听器取消函数，组件卸载时调用以移除 TDLib 更新监听
let unlisten: (() => void) | null = null;

onMounted(async () => {
    const me = await tdlibSend({ _: 'getMe' });
    myId.value = me.id;
    // 监听 TDLib 更新
    unlisten = await listen<Update>("tdlib-update", (event) => {
        const update = event.payload;
        handleUpdate(update);
    });
});

onUnmounted(() => {
    // 销毁时取消监听 TDLib 更新
    if (unlisten) unlisten();
});


// 处理 TDLib 更新的入口函数，根据 update._ 分发不同处理逻辑
const handleUpdate = async (update: Update) => {
    switch (update._) {
        case 'updateNewMessage': {
            const msg = update.message;
            if (msg.chat_id !== chatId.value) return;
            // 已存在则忽略（例如自己已加入）
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
            // 其他 update 类型可在此添加 case 处理
            break;
    }
};

watch(chatId, async (newId) => {
    if (!newId) return;
    const currentId = newId;

    messages.value = [];
    chat.value = null;
    isHistoryExhausted.value = false;

    try {
        const chatInfo = await tdlibSend({ _: "getChat", chat_id: currentId });
        if (chatId.value !== currentId) return;
        chat.value = chatInfo;

        // Fetch additional info
        if (chatInfo.type._ === 'chatTypeSupergroup') {
            const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: chatInfo.type.supergroup_id });
            supergroups.value[chatInfo.type.supergroup_id] = sg;
        } else if (chatInfo.type._ === 'chatTypeBasicGroup') {
            const bg = await tdlibSend({ _: 'getBasicGroup', basic_group_id: chatInfo.type.basic_group_id });
            basicGroups.value[chatInfo.type.basic_group_id] = bg;
        }

        await loadMessages(currentId);
        if (chatId.value !== currentId) return;

        await nextTick();

        if (
            chatId.value === currentId &&
            messagesContainer.value &&
            messagesContainer.value.scrollHeight <= messagesContainer.value.clientHeight &&
            !isHistoryExhausted.value &&
            messages.value.length > 0
        ) {
            await loadMessages(currentId, messages.value[0].id);
        }
    } catch (e) {
        console.error("Error loading chat:", e);
    }
}, { immediate: true });


// 从 TDLib 拉取聊天历史消息；fromMessageId==0 表示加载最新一页
const loadMessages = async (chatId: number, fromMessageId: number = 0) => {
    // 防止并发调用
    if (isLoadingMessages.value) return;
    isLoadingMessages.value = true;

    console.log(`Loading messages for chat ${chatId} from ${fromMessageId}`);
    try {
        const history = await tdlibSend({
            _: 'getChatHistory',
            chat_id: chatId,
            from_message_id: fromMessageId,
            offset: 0,
            limit: 50,
            only_local: false
        });
        console.log(`Received ${history.messages?.length} messages`);

        if (history.messages && history.messages.length > 0) {
            // Filter out null messages
            const validMessages = history.messages.filter((m): m is message => !!m);

            if (fromMessageId === 0) {
                messages.value = validMessages.reverse();
                scrollToBottom();
            } else {
                // Prepend messages
                // Filter out duplicates
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

// 消息容器的滚动处理函数，用于上拉加载更多历史
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

    // loadMessages 是 async，所以这里要 await
    await loadMessages(chatId.value, messages.value[0].id);

    await nextTick();

    const newHeight = el.scrollHeight;
    el.scrollTop = oldTop + (newHeight - oldHeight);

    isLoadingMore.value = false;

    // 内容还不够填满容器，继续拉
    if (
        el.scrollHeight <= el.clientHeight &&
        !isHistoryExhausted.value &&
        messages.value.length > 0
    ) {
        // 再触发一次即可，不要 while
        onScroll(e);
    }
};


// 并发获取消息中涉及到的用户/聊天信息，填充 users/chats 缓存
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

    // 并发获取 users 和 chats
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

// 将消息容器滚动到底部（新消息/初次加载时使用）
const scrollToBottom = () => {
    nextTick(() => {
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
    });
};

// 发送消息的处理函数，调用 TDLib 的 sendMessage
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

// 处理附件/文件选择（占位，未实现上传逻辑）
const handleAttach = (files: FileList) => {
    console.log("Attach files:", files);
    // TODO: Implement file sending
    // Requires handling file paths or uploading via TDLib
};

// Helpers

// 判断消息是否为自己发送
const isSelf = (msg: message) => {
    if (msg.sender_id._ === 'messageSenderUser') {
        return msg.sender_id.user_id === myId.value;
    }
    return false; // If sender is a chat, it's not "me" (unless I'm the channel, but let's treat as other)
};

// 获取消息发送者的显示名称（从缓存 users 或 chats）
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

// 获取消息发送者的头像信息（user.profile_photo 或 chat.photo）
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

// 将 Unix 时间戳（秒）格式化为本地时分显示
const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// 根据 chat.type 返回简要的聊天类型中文描述
const getChatStatus = () => {
    if (!chat.value) return '';
    // Simple status logic
    if (chat.value.type._ === 'chatTypePrivate') return '私聊';
    if (chat.value.type._ === 'chatTypeBasicGroup') return '群组';
    if (chat.value.type._ === 'chatTypeSupergroup') {
        return chat.value.type.is_channel ? '频道' : '超级群组';
    }
    return '';
};

// 计算属性：是否在消息气泡上显示发送者名称（私聊不显示）
const shouldShowSenderName = computed(() => {
    if (!chat.value) return false;
    return chat.value.type._ !== 'chatTypePrivate';
});

// Grouping Helpers
// 判断两条消息是否来自同一发送者
const isSameSender = (m1: message, m2: message) => {
    if (m1.sender_id._ !== m2.sender_id._) return false;
    if (m1.sender_id._ === "messageSenderUser" && m2.sender_id._ === "messageSenderUser") {
        return m1.sender_id.user_id === m2.sender_id.user_id;
    } else if (m1.sender_id._ === "messageSenderChat" && m2.sender_id._ === "messageSenderChat") {
        return m1.sender_id.chat_id === m2.sender_id.chat_id;
    } return false;
};

// 判断消息是否是连续消息组的第一条
const isFirstInGroup = (index: number) => {
    if (index === 0) return true;
    const prevMsg = messages.value[index - 1];
    const currMsg = messages.value[index];
    return !isSameSender(prevMsg, currMsg);
};

// 判断消息是否是连续消息组的最后一条
const isLastInGroup = (index: number) => {
    if (index === messages.value.length - 1) return true;
    const nextMsg = messages.value[index + 1];
    const currMsg = messages.value[index];
    return !isSameSender(currMsg, nextMsg);
};

// 判断是否应该为消息预留头像空间（针对他人消息，且非不显示签名的频道）
const shouldReserveAvatarSpace = (msg: message) => {
    if (isSelf(msg)) return false;

    // If it's a channel and sign_messages is OFF, we don't show avatar at all, so don't reserve space.
    if (chat.value && chat.value.type._ === 'chatTypeSupergroup' && chat.value.type.is_channel) {
        const sg = supergroups.value[chat.value.type.supergroup_id];
        // If we haven't loaded sg yet, assume false or true? 
        // If sign_messages is false (default for channels usually?), we don't show.
        // But wait, if sign_messages is true, we show.
        if (sg && !sg.sign_messages) {
            return false;
        }
    }
    return true;
};

// 判断是否应该显示头像（仅在连续消息组的最后一条显示）
const shouldShowAvatar = (index: number) => {
    if (!isLastInGroup(index)) return false;
    return true;
};

// 根据消息在组内的位置计算圆角样式，实现气泡连接效果
const getMessageBorderRadius = (msg: message, index: number) => {
    const isMe = isSelf(msg);
    const first = isFirstInGroup(index);
    const last = isLastInGroup(index);

    if (isMe) {
        // Self messages
        if (first && last) return 'rounded-tr-none rounded-lg'; // Single message

        if (first) return 'rounded-tr-none rounded-br-sm rounded-l-lg';
        if (last) return 'rounded-tr-sm rounded-br-lg rounded-l-lg';
        return 'rounded-tr-sm rounded-br-sm rounded-l-lg';
    } else {
        // Other messages
        if (first && last) return 'rounded-tl-none rounded-lg';

        if (first) return 'rounded-tl-none rounded-bl-sm rounded-r-lg';
        if (last) return 'rounded-tl-sm rounded-bl-lg rounded-r-lg';
        return 'rounded-tl-sm rounded-bl-sm rounded-r-lg';
    }
};

// 判断当前用户是否有权限在当前聊天发送消息
const canSend = computed(() => {
    if (!chat.value) return false;

    // Private chat: usually yes
    if (chat.value.type._ === 'chatTypePrivate') return true;

    // Check basic permissions
    if (chat.value.permissions.can_send_basic_messages) return true;

    // Check admin status
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
</style>
