<template>
    <div class="flex flex-col h-full dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800  pt-4">
        <!-- Search Bar -->
        <div class="py-1 px-3">
            <div class="relative">
                <input type="text" placeholder="搜索"
                    class="w-full pl-8 pr-4 py-2 bg-white/60 shadow-(--box-shadow) dark:bg-gray-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <SearchIcon class="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
            </div>
        </div>
        <!-- Folder Tabs -->
        <div v-if="tabs.length > 1" ref="tabsContainer" @wheel.prevent="handleWheel"
            class="flex px-2 border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar gap-2">
            <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
                class="px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0" :class="[
                    settings.folderStyle === 'tabs'
                        ? (activeTab === tab.id ? 'border-b-2 border-blue-500 text-blue-600' : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700')
                        : '',
                    settings.folderStyle === 'pills'
                        ? (activeTab === tab.id ? 'bg-blue-500 shadow-sm shadow-blue-500/50 text-white rounded-full my-1' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full my-1')
                        : '',
                    settings.folderStyle === 'text'
                        ? (activeTab === tab.id ? 'text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700')
                        : ''
                ]">
                {{ tab.name }}
            </button>
        </div>

        <!-- Chat List -->
        <div class="flex-1 overflow-y-auto custom-scrollbar pl-1.5 pr-0.5 py-1" @scroll="onScroll">
            <div v-for="chat in displayChats" :key="chat.id" @click="selectChat(chat.id)"
                class="flex items-center p-3 hover:bg-white/70 rounded-xl hover:shadow-(--box-shadow) dark:hover:bg-gray-800 cursor-pointer transition-colors"
                :class="{ 'rounded-xl bg-white/70 shadow-(--box-shadow) dark:bg-gray-800': selectedChatId === chat.id }">
                <Avatar :photo="chat.photo" :title="chat.title" sizeClass="mr-3" />
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline mb-1">
                        <h3 class="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">{{ chat.title }}
                        </h3>
                        <span class="text-xs text-gray-400">{{ formatTime(chat.last_message?.date) }}</span>
                    </div>
                    <p class="text-xs text-gray-500 truncate">{{ getMessagePreview(chat.last_message) }}</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { SearchIcon } from 'lucide-vue-next';
import { settings } from '../../store/settings';
import { useChatStore } from '../../store/chat';
import { tdlibSend } from '../../utils/tdlib';
import Avatar from './avatar.vue';
import type { message } from 'tdlib-types';

const props = defineProps<{
    isArchive?: boolean;
}>();

const router = useRouter();
const chatStore = useChatStore();

const tabsContainer = ref<HTMLElement | null>(null);

const handleWheel = (e: WheelEvent) => {
    if (tabsContainer.value) {
        tabsContainer.value.scrollLeft += e.deltaY;
    }
};

onMounted(async () => {
    await chatStore.initListener();
    await chatStore.loadChatLists();
});

watch(() => chatStore.chatLists, async (lists) => {
    for (const list of lists) {
        await chatStore.loadList(list);
    }
}, { deep: true });

const tabs = computed(() => {
    if (props.isArchive) return [];
    return chatStore.chatLists.filter(list => list._ !== 'chatListArchive').map(list => {
        if (list._ === 'chatListMain') {
            return { id: 'chatListMain', name: '全部' };
        }
        if (list._ === 'chatFolderInfo') {
            return {
                id: `chat_folder_id${list.id}`,
                name: list.title || list.name?.text?.text || '文件夹'
            };
        }
        return { id: 'unknown', name: '未知' }
    });
});

const activeTab = ref(props.isArchive ? 'chatListArchive' : 'chatListMain');

watch(tabs, (newTabs) => {
    if (props.isArchive) {
        activeTab.value = 'chatListArchive';
        return;
    }
    if (newTabs.length > 0 && !newTabs.find(t => t.id === activeTab.value)) {
        activeTab.value = newTabs[0].id;
    }
}, { immediate: true });

const displayChats = computed(() => {
    return chatStore.getList(activeTab.value).value;
});

const selectedChatId = ref<number | null>(null);

/**
 * 通过 ID 选择对话
 */
const selectChat = (id: number) => {
    selectedChatId.value = id;
    router.push(`/home/chats/${id}`);
};

const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
    }
    return date.toLocaleDateString();
};

const getMessagePreview = (message: message | undefined) => {
    if (!message) return '';
    const content = message.content;
    if (!content) return '';

    if (content._ === 'messageText') {
        return content.text.text;
    }
    if (content._ === 'messagePhoto') {
        return '[图片]';
    }
    if (content._ === 'messageVideo') {
        return '[视频]';
    }
    if (content._ === 'messageAnimation') {
        return '[GIF]';
    }
    if (content._ === 'messageSticker') {
        return '[贴纸]';
    }
    if (content._ === 'messageVoiceNote') {
        return '[语音]';
    }
    return '[消息]';
};

const isLoading = ref(false);
const isFinished = ref(false);

watch(activeTab, () => {
    isFinished.value = false;
    isLoading.value = false;
    // If list is empty, try to load more
    const currentList = chatStore.getList(activeTab.value).value;
    if (currentList.length === 0) {
        loadMore();
    }
});

const onScroll = async (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
        await loadMore();
    }
};

const loadMore = async () => {
    if (isLoading.value || isFinished.value) return;
    isLoading.value = true;

    let chatList: any;
    if (activeTab.value === 'chatListMain') {
        chatList = { _: 'chatListMain' };
    } else if (activeTab.value === 'chatListArchive') {
        chatList = { _: 'chatListArchive' };
    } else if (activeTab.value.startsWith('chat_folder_id')) {
        const id = parseInt(activeTab.value.replace('chat_folder_id', ''));
        chatList = { _: 'chatListFolder', chat_folder_id: id };
    } else {
        isLoading.value = false;
        return;
    }

    try {
        await tdlibSend({
            _: "loadChats",
            chat_list: chatList,
            limit: 50
        });
    } catch (error: any) {
        if (error.code === 404) {
            isFinished.value = true;
        } else {
            console.error("Failed to load chats:", error);
        }
    } finally {
        isLoading.value = false;
    }
};
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

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
