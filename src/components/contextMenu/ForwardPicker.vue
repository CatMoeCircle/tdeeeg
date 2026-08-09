<template>
    <Teleport to="body">
        <Transition name="fp-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="close">
                <div
                    class="w-105 max-w-[90vw] max-h-[70vh] flex flex-col rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">转发消息</h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="close">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 搜索 -->
                    <div class="p-3 shrink-0">
                        <div class="relative">
                            <input ref="searchInput" type="text" v-model="query" placeholder="搜索对话..."
                                class="w-full pl-8 pr-3 py-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                @keydown.enter.prevent="onEnter" />
                            <SearchIcon class="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                        </div>
                    </div>

                    <!-- 对话列表 -->
                    <div class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
                        <div v-if="filteredChats.length === 0" class="text-center text-sm text-gray-400 py-8">
                            {{ query ? '没有匹配的对话' : '暂无对话' }}
                        </div>
                        <button v-for="chat in filteredChats" :key="chat.id" type="button"
                            class="w-full flex items-center gap-3 px-2.5 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors text-left"
                            @click="selectChat(chat)">
                            <div class="w-9 h-9 shrink-0">
                                <Avatar v-if="!isSaved(chat)" :photo="chat.photo" :title="chat.title" :radius="40"
                                    :accentColorId="(chat as any).profile_accent_color_id" />
                                <div v-else
                                    class="w-full h-full bg-blue-500 text-white flex items-center justify-center rounded-full">
                                    <BookmarkIcon class="w-5 h-5 fill-current" />
                                </div>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate"><GlobalEmojiText :text="chatTitle(chat)" /></p>
                            </div>
                            <span class="text-xs text-gray-400 shrink-0">{{ chatTypeLabel(chat) }}</span>
                        </button>
                    </div>

                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 shrink-0 flex items-center gap-4">
                        <span class="text-xs text-gray-400">{{ msgCount }} 条消息</span>
                        <div class="flex-1"></div>
                        <button type="button" @click="close"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">取消</button>
                        <button type="button" @click="forwardNow(false)"
                            class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                            :disabled="!selectedChat">转发</button>
                        <button type="button" @click="forwardNow(true)"
                            class="px-4 py-1.5 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                            :disabled="!selectedChat">复制转发</button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import { XIcon, SearchIcon, BookmarkIcon } from "lucide-vue-next";
import Avatar from "../chat/avatar.vue";
import GlobalEmojiText from "../common/GlobalEmojiText.vue";
import { tdlibSend } from "../../utils/tdlib";
import { MessagePlugin } from "tdesign-vue-next";
import { useChatStore } from "../../store/chat";
import { useUserStore } from "../../store/user";
import type { chat } from "tdlib-types";

const props = defineProps<{
    visible: boolean;
    /** 源对话 id */
    fromChatId: number;
    /** 待转发的消息 id 列表 */
    messageIds: number[];
}>();

const emit = defineEmits(["update:visible", "done"]);

const chatStore = useChatStore();
const userStore = useUserStore();
const query = ref("");
const searchInput = ref<HTMLElement | null>(null);
const selectedChat = ref<chat | null>(null);

const msgCount = computed(() => props.messageIds.length);

/** 全部主列表对话 + 归档 */
const allChats = computed(() => {
    const main = chatStore.getList('chatListMain').value;
    const archive = chatStore.getList('chatListArchive').value;
    // 去重
    const map = new Map<number, chat>();
    for (const c of [...main, ...archive]) map.set(c.id, c as chat);
    return Array.from(map.values());
});

const filteredChats = computed(() => {
    const q = query.value.trim().toLowerCase();
    let chats = allChats.value;
    if (q) {
        chats = chats.filter((c) => (c.title || "").toLowerCase().includes(q));
    }
    return chats.slice(0, 100);
});

const isSaved = (chat: chat) => {
    const myId = userStore.userProfile?.id;
    return chat.id === myId;
};

const chatTitle = (chat: chat) => {
    return isSaved(chat) ? "收藏的消息" : chat.title || "未知对话";
};

function chatTypeLabel(chat: chat): string {
    if (isSaved(chat)) return "私聊";
    const t = (chat as any).type?._;
    if (t === "chatTypePrivate") return "私聊";
    if (t === "chatTypeBasicGroup") return "群组";
    if (t === "chatTypeSupergroup") {
        return (chat as any).type?.is_channel ? "频道" : "群组";
    }
    return "";
}

function selectChat(chat: chat) {
    selectedChat.value = chat;
}

watch(() => props.visible, async (v) => {
    if (v) {
        selectedChat.value = null;
        query.value = "";
        await nextTick();
        searchInput.value?.focus();
    }
});

function onEnter() {
    if (filteredChats.value.length === 1) {
        selectChat(filteredChats.value[0]);
    } else if (filteredChats.value.length > 1 && selectedChat.value) {
        forwardNow(false);
    }
}

function close() {
    emit("update:visible", false);
}

async function forwardNow(sendCopy: boolean) {
    if (!selectedChat.value) {
        MessagePlugin.info("请先选择一个对话");
        return;
    }
    if (props.messageIds.length === 0) return;
    try {
        await tdlibSend({
            _: "forwardMessages",
            chat_id: selectedChat.value.id,
            from_chat_id: props.fromChatId,
            message_ids: props.messageIds,
            send_copy: sendCopy,
            options: { _: "messageSendOptions", disable_notification: false } as any,
        } as any);
        MessagePlugin.success(sendCopy ? "已复制转发" : "已转发");
        close();
        emit("done");
    } catch (e: any) {
        MessagePlugin.error(e?.message || "转发失败");
    }
}
</script>

<style scoped>
.fp-fade-enter-active,
.fp-fade-leave-active {
    transition: opacity 0.18s ease;
}

.fp-fade-enter-from,
.fp-fade-leave-to {
    opacity: 0;
}
</style>
