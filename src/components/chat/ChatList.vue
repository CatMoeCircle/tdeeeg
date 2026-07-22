<template>
    <div class="flex flex-col h-full dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 pt-4"
        @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
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
            class="flex px-2 border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar gap-2 shrink-0">
            <button v-for="tab in tabs" :key="tab.id" @click="switchToTab(tab.id)"
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

        <!-- 音乐播放器入口（聊天打开时由 ChatDetail 接管，此处隐藏） -->
        <MusicPlayerEntry v-if="!isChatOpen" compact />

        <!-- Swipeable Chat List Container -->
        <div class="flex-1 overflow-hidden relative">
            <div ref="swipeContainer" class="swipe-track absolute inset-0 flex"
                :style="{ transform: `translateX(${swipeOffset}px)`, transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }">
                <div v-for="tab in tabsWithContent" :key="tab.id"
                    class="swipe-page h-full shrink-0 overflow-y-auto custom-scrollbar pl-1.5 pr-0.5 py-1"
                    @scroll="(e: Event) => onScroll(e, tab.id)">
                    <div v-for="chat in tab.chats" :key="chat.id" @click="selectChat(chat.id)"
                        class="flex items-center p-3 hover:bg-white/70 rounded-xl hover:shadow-(--box-shadow) dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        :class="{ 'rounded-xl bg-white/70 shadow-(--box-shadow) dark:bg-gray-800': selectedChatId === chat.id }">
                        <div class="w-14 h-14 mr-3">
                            <div v-if="isSavedMessages(chat)"
                                class="w-full h-full rounded-full bg-blue-500 text-white flex items-center justify-center">
                                <BookmarkIcon class="w-7 h-7 fill-current" />
                            </div>
                            <Avatar v-else :photo="chat.photo" :title="chat.title" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-baseline mb-1">
                                <h3 class="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">{{
                                    getChatTitle(chat) }}
                                </h3>
                                <span class="text-xs text-gray-400">{{ formatTime(chat.last_message?.date) }}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <p class="flex-1 min-w-0 text-xs text-gray-500 truncate">{{
                                    getMessagePreview(chat.last_message) }}</p>
                                <span v-if="chat.unread_count > 0"
                                    class="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-blue-500 text-white text-[11px] font-semibold leading-5 text-center">
                                    {{ formatUnreadCount(chat.unread_count) }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { BookmarkIcon, SearchIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { settings } from '../../store/settings';
import { useChatStore } from '../../store/chat';
import type { Chat } from '../../store/chat';
import { useUserStore } from '../../store/user';
import { isSavedMessagesChat, SAVED_MESSAGES_TITLE } from '../../utils/savedMessages';
import Avatar from './avatar.vue';
import type { message } from 'tdlib-types';
import MusicPlayerEntry from './../audio/MusicPlayerEntry.vue';

const props = defineProps<{
    isArchive?: boolean;
}>();

const router = useRouter();
const route = useRoute();

/** 是否有聊天详情打开（route 包含 chat id） */
const isChatOpen = computed(() => {
    return /^\/home\/chats\/\d+/.test(route.path);
});
const chatStore = useChatStore();
const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);

const tabsContainer = ref<HTMLElement | null>(null);
const swipeContainer = ref<HTMLElement | null>(null);
const pageWidth = ref(0);

// ---- Swipe state ----
const swipeOffset = ref(0);
const isSwiping = ref(false);
let touchStartX = 0;
let touchStartY = 0;
let currentTranslateX = 0;
let isHorizontalSwipe: boolean | null = null;

// ---- Resize observer for page width ----
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
    if (!userProfile.value) {
        await userStore.fetchUser();
    }
    await chatStore.initListener();
    await chatStore.loadChatLists();
    updatePageWidth();

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => updatePageWidth());
        const parent = swipeContainer.value?.parentElement;
        if (parent) resizeObserver.observe(parent);
    }
});

onUnmounted(() => {
    resizeObserver?.disconnect();
});

function updatePageWidth() {
    const parent = swipeContainer.value?.parentElement;
    if (parent) {
        pageWidth.value = parent.clientWidth;
        // 更新 translateX 以匹配当前 tab
        const idx = currentIndex.value;
        swipeOffset.value = -idx * pageWidth.value;
    }
}

const handleWheel = (e: WheelEvent) => {
    if (tabsContainer.value) {
        tabsContainer.value.scrollLeft += e.deltaY;
    }
};

// 当 chatLists 就绪后，先从 Rust store 拉取已有缓存（不会覆盖事件来的数据）
watch(() => chatStore.chatLists, async (lists) => {
    for (const list of lists) {
        await chatStore.loadList(list);
    }
    // 然后对当前 activeTab 发起首次 loadChats
    triggerLoadMore(activeTab.value);

    // 兜底补漏：主动拉取可能因事件丢失而仍为占位符的 chat 数据
    // 等待一小段时间让事件有机会到达，再补漏
    setTimeout(() => {
        chatStore.fillPlaceholderChats();
    }, 1500);
}, { deep: true, once: true });

const tabs = computed(() => {
    if (props.isArchive) return [];
    return chatStore.chatLists.filter(list => list._ !== 'chatListArchive').map(list => {
        if (list._ === 'chatListMain') {
            return { id: 'chatListMain', name: '全部' };
        }
        if (list._ === 'chatFolderInfo') {
            return {
                id: `chat_folder_id${list.id}`,
                name: list.name?.text?.text || '文件夹'
            };
        }
        return { id: 'unknown', name: '未知' }
    });
});

const activeTab = ref(props.isArchive ? 'chatListArchive' : 'chatListMain');

const currentIndex = computed(() => {
    if (props.isArchive) return 0;
    const idx = tabs.value.findIndex(t => t.id === activeTab.value);
    return idx >= 0 ? idx : 0;
});

watch(tabs, (newTabs) => {
    if (props.isArchive) {
        activeTab.value = 'chatListArchive';
        return;
    }
    if (newTabs.length > 0 && !newTabs.find(t => t.id === activeTab.value)) {
        activeTab.value = newTabs[0].id;
    }
}, { immediate: true });

// Computed that maps each tab to its chat data
const tabsWithContent = computed(() => {
    if (props.isArchive) {
        const chats = chatStore.getList('chatListArchive').value;
        return [{ id: 'chatListArchive', chats }];
    }
    return tabs.value.map(tab => ({
        id: tab.id,
        chats: chatStore.getList(tab.id).value
    }));
});

const selectedChatId = ref<number | null>(null);

const isSavedMessages = (chat: Chat) => isSavedMessagesChat(chat, userProfile.value?.id);
const getChatTitle = (chat: Chat) => isSavedMessages(chat) ? SAVED_MESSAGES_TITLE : chat.title;

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

const formatUnreadCount = (count: number) => count > 99 ? '99+' : count.toString();

const getMessagePreview = (message: message | undefined) => {
    if (!message) return '';
    const content = message.content;
    if (!content) return '';

    if (content._ === 'messageText') {
        return content.text.text;
    }
    if (content._ === 'messagePhoto') {
        return content.caption.text || '[图片]';
    }
    if (content._ === 'messageVideo') {
        return content.caption.text || '[视频]';
    }
    if (content._ === 'messageAnimation') {
        return content.caption.text || '[GIF]';
    }
    if (content._ === 'messageDocument') {
        return content.caption.text || `[文件] ${content.document.file_name}`.trim();
    }
    if (content._ === 'messageSticker') {
        return `${content.sticker.emoji || ''} [贴纸]`.trim();
    }
    if (content._ === 'messageVoiceNote') {
        return '[语音]';
    }
    if (content._ === 'messageAudio') {
        return content.caption.text || `[音乐] ${content.audio.title || content.audio.file_name}`.trim();
    }
    if (content._ === 'messageVideoNote') {
        return '[视频消息]';
    }
    return '[消息]';
};

// 切换 Tab 时重置该列表的加载状态，若列表为空则触发加载
watch(activeTab, (newTab) => {
    if (!pageWidth.value) return;
    const idx = tabs.value.findIndex(t => t.id === newTab);
    if (idx >= 0) {
        swipeOffset.value = -idx * pageWidth.value;
    }
    chatStore.resetListState(newTab);
    const currentList = chatStore.getList(newTab).value;
    const hasRealChats = currentList.some(c => c.title !== '…');
    if (!hasRealChats) {
        triggerLoadMore(newTab);
    }
});

const onScroll = (e: Event, tabId: string) => {
    const target = e.target as HTMLElement;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
        triggerLoadMore(tabId);
    }
};

function buildChatListObject(tabKey: string): any {
    if (tabKey === 'chatListMain') {
        return { _: 'chatListMain' };
    } else if (tabKey === 'chatListArchive') {
        return { _: 'chatListArchive' };
    } else if (tabKey.startsWith('chat_folder_id')) {
        const id = parseInt(tabKey.replace('chat_folder_id', ''));
        return { _: 'chatListFolder', chat_folder_id: id };
    }
    return null;
}

function triggerLoadMore(tabKey: string) {
    const chatList = buildChatListObject(tabKey);
    if (!chatList) return;
    chatStore.requestLoadMore(tabKey, chatList);
}

// ---- Tab click with animation ----
function switchToTab(tabId: string) {
    if (tabId === activeTab.value) return;
    isSwiping.value = false; // use transition
    activeTab.value = tabId;
}

// ---- Touch / Swipe handlers ----
function onTouchStart(e: TouchEvent) {
    if (tabs.value.length <= 1) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isHorizontalSwipe = null;
    currentTranslateX = swipeOffset.value;
}

function onTouchMove(e: TouchEvent) {
    if (tabs.value.length <= 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    // 判断滑动方向
    if (isHorizontalSwipe === null) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            isHorizontalSwipe = Math.abs(dx) > Math.abs(dy);
        }
    }

    if (!isHorizontalSwipe) return; // 垂直滚动交给浏览器

    e.preventDefault();

    if (!pageWidth.value) return;
    isSwiping.value = true;

    const totalPages = tabs.value.length;
    let newOffset = currentTranslateX + dx;

    // 边界限制 + 弹性阻尼
    if (currentIndex.value === 0 && dx > 0) {
        newOffset = currentTranslateX + dx * 0.3;
    } else if (currentIndex.value === totalPages - 1 && dx < 0) {
        newOffset = currentTranslateX + dx * 0.3;
    } else {
        // 检查是否超出边界
        const maxOffset = 0;
        const minOffset = -(totalPages - 1) * pageWidth.value;
        if (newOffset > maxOffset) {
            newOffset = maxOffset + (newOffset - maxOffset) * 0.3;
        } else if (newOffset < minOffset) {
            newOffset = minOffset + (newOffset - minOffset) * 0.3;
        }
    }

    swipeOffset.value = newOffset;
}

function onTouchEnd(e: TouchEvent) {
    if (tabs.value.length <= 1) return;
    if (!pageWidth.value) return;

    isSwiping.value = false;

    if (!isHorizontalSwipe) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const threshold = pageWidth.value * 0.2;

    const totalPages = tabs.value.length;
    let targetIndex = currentIndex.value;

    if (Math.abs(dx) > threshold) {
        if (dx < 0 && currentIndex.value < totalPages - 1) {
            targetIndex = currentIndex.value + 1;
        } else if (dx > 0 && currentIndex.value > 0) {
            targetIndex = currentIndex.value - 1;
        }
    }

    const targetTab = tabs.value[targetIndex];
    if (targetTab) {
        activeTab.value = targetTab.id;
    } else {
        // 回弹到当前 tab
        swipeOffset.value = -currentIndex.value * pageWidth.value;
    }

    isHorizontalSwipe = null;
}
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

/* Swipe track: horizontal layout for pages */
.swipe-track {
    will-change: transform;
    touch-action: pan-y;
}

/* Each page takes full width of the container */
.swipe-page {
    width: 100%;
}

/* Prevent text selection while swiping */
.swiping * {
    user-select: none;
    -webkit-user-select: none;
}
</style>
