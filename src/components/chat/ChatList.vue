<template>
    <div class="flex flex-col h-full border-r border-gray-200 pt-4" @touchstart="onTouchStart" @touchmove="onTouchMove"
        @touchend="onTouchEnd">
        <!-- Search Bar (forum mode 时向上滑动隐藏) -->
        <Transition name="slide-up">
            <div v-if="!forumMode" class="py-1 px-3 overflow-hidden max-h-14">
                <div class="relative">
                    <input type="text" placeholder="搜索"
                        class="w-full pl-7 pr-3.5 py-1.5 bg-white/60 shadow-(--box-shadow) rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <SearchIcon class="w-3.5 h-3.5 absolute left-2.5 top-2 text-gray-400" />
                </div>
            </div>
        </Transition>
        <!-- Folder Tabs (forum mode 时向上滑动隐藏) -->
        <Transition name="slide-up">
            <div v-if="!forumMode && tabs.length > 1" ref="tabsContainer" v-smooth-wheel="'horizontal'"
                class="flex px-2 border-b border-gray-200 overflow-x-auto no-scrollbar gap-1.5 shrink-0 max-h-12">
                <button v-for="tab in tabs" :key="tab.id" :data-tab-id="tab.id" @click="switchToTab(tab.id)"
                    class="px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors shrink-0 inline-flex items-center gap-1"
                    :class="[
                        settings.folderStyle === 'tabs'
                            ? (activeTab === tab.id ? 'border-b-2 border-blue-500 text-blue-600' : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700')
                            : '',
                        settings.folderStyle === 'pills'
                            ? (activeTab === tab.id ? 'bg-blue-500 shadow-sm shadow-blue-500/50 text-white rounded-full my-1' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full my-1')
                            : '',
                        settings.folderStyle === 'text'
                            ? (activeTab === tab.id ? 'text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700')
                            : ''
                    ]">
                    <!-- 分组图标（全部对话默认对话图标） -->
                    <component :is="folderIcon(tab)" v-if="settings.showFolderIcons" class="w-3 h-3 shrink-0" />
                    <FormattedTextInline v-if="tab.formattedName" :formattedText="tab.formattedName" :size="12" />
                    <span v-else>{{ tab.name }}</span>
                    <!-- 未读消息计数：未选中的分组显示为灰色 -->
                    <span v-if="settings.showFolderUnread && tabUnread(tab.id) > 0"
                        class="min-w-3.5 h-3.5 px-1 rounded-full text-white text-[9px] font-bold leading-3.5 text-center shrink-0"
                        :class="activeTab === tab.id ? 'bg-blue-500' : 'bg-gray-400'">
                        {{ formatUnreadCount(tabUnread(tab.id)) }}
                    </span>
                </button>
            </div>
        </Transition>

        <!-- 音乐播放器入口（聊天打开时由 ChatDetail 接管，此处隐藏） -->
        <Transition name="slide-up">
            <div v-if="!isChatOpen && !forumMode" class="overflow-hidden max-h-12">
                <MusicPlayerEntry compact />
            </div>
        </Transition>

        <!-- Main Container: Swipeable Chat List OR Forum Mode -->
        <div class="flex-1 overflow-hidden relative">
            <!-- 左侧列表宽度瞬时切换（不做宽度过渡，避免内容被横向拉伸成“整页横移”观感），
                 左列内容切换由 forum-avatar-column 淡入柔化 -->
            <div class="absolute inset-0 flex">
                <!-- Swipe Track (shrinks in forum mode) -->
                <div ref="swipeContainer" class="h-full overflow-hidden"
                    :class="forumMode ? 'w-17 shrink-0' : 'flex-1'">
                    <div class="swipe-track h-full flex"
                        :style="{ transform: forumMode ? 'translateX(0px)' : `translateX(${swipeOffset}px)`, transition: isSwiping || forumMode ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }">
                        <!-- forum 模式只需渲染当前激活分组的单一页面（68px 头像列），
                             避免把全部分组页面并排渲染而露出相邻分组头像 -->
                        <div v-for="tab in tabsWithContent" :key="tab.id" v-show="!forumMode || tab.id === activeTab"
                            v-smooth-wheel class="swipe-page h-full shrink-0 overflow-y-auto custom-scrollbar"
                            :class="forumMode ? 'w-17 px-0.5 py-1 forum-avatar-column gap-0.5' : 'w-full pl-1.5 pr-0.5 py-1 chat-list-fade-in'"
                            @scroll="(e: Event) => onScroll(e, tab.id)">
                            <!-- Forum Mode: compact avatar only -->
                            <template v-if="forumMode">
                                <div v-for="chat in tab.chats" :key="chat.id" @click="selectForumChat(chat)"
                                    v-context-menu="buildChatContextMenu(chat)"
                                    class="relative flex items-center justify-center py-2.5 cursor-pointer transition-colors hover:bg-gray-100"
                                    :class="forumChatId === chat.id ? 'bg-gray-100 rounded-lg' : ''"
                                    style="content-visibility: auto; contain-intrinsic-size: 68px">
                                    <!-- 选中标记：左侧色条 -->
                                    <div v-if="forumChatId === chat.id"
                                        class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-full">
                                    </div>
                                    <!-- 头像尺寸与普通模式列表一致（w-12 h-12 = 48px）；
                                         圆角用 chatAvatarRadius 与普通列表一致，话题群组保持方形（未开启“跟随圆角”时） -->
                                    <div class="relative w-12 h-12">
                                        <div v-if="isSavedMessages(chat)"
                                            class="w-full h-full bg-blue-500 text-white flex items-center justify-center"
                                            :style="{ borderRadius: avatarRadius + '%' }">
                                            <BookmarkIcon class="w-7 h-7 fill-current" />
                                        </div>
                                        <Avatar v-else :photo="chat.photo" :title="chat.title" sizeClass="!w-12 !h-12"
                                            :radius="chatAvatarRadius(chat)"
                                            :accentColorId="getChatProfileAccentColorId(chat)"
                                            :deletedAccount="isDeletedChat(chat)" />
                                        <!-- 未读角标：显示在头像右下角（静音对话灰显） -->
                                        <span v-if="chat.unread_count > 0"
                                            class="absolute -bottom-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full text-white text-[10px] font-bold leading-4.5 text-center border-2 border-white"
                                            :class="isChatMuted(chat) ? 'bg-gray-400' : 'bg-blue-500'">
                                            {{ formatUnreadCount(chat.unread_count) }}
                                        </span>
                                    </div>
                                </div>
                            </template>
                            <!-- Normal Mode: full chat item -->
                            <template v-else>
                                <!-- 归档入口：归档位置为“全部对话顶部”时显示 -->
                                <div v-if="settings.chatList.archivePosition === 'top' && tab.id === 'chatListMain' && !props.isArchive"
                                    @click="goToArchive"
                                    class="flex items-center p-2.5 mb-1 cursor-pointer rounded-xl hover:bg-white/70 hover:shadow-(--box-shadow) transition-colors"
                                    style="content-visibility: auto; contain-intrinsic-size: 72px">
                                    <div class="w-12 h-12 mr-2.5">
                                        <div class="w-full h-full bg-gray-200 text-gray-500 flex items-center justify-center"
                                            :style="{ borderRadius: avatarRadius + '%' }">
                                            <ArchiveIcon class="w-6 h-6" />
                                        </div>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex justify-between items-baseline mb-1">
                                            <h3 class="text-sm font-semibold truncate text-gray-900">
                                                归档
                                            </h3>
                                            <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                                        </div>
                                        <p class="text-xs text-gray-500 truncate">已归档的对话</p>
                                    </div>
                                </div>

                                <div v-for="chat in tab.chats" :key="chat.id" @click="selectChat(chat)"
                                    v-context-menu="buildChatContextMenu(chat)"
                                    class="flex items-center p-2.5 mb-0.5 hover:bg-white/70 rounded-xl hover:shadow-(--box-shadow) cursor-pointer transition-colors"
                                    :class="{ 'rounded-xl bg-gray-100 border border-gray-300': selectedChatId === chat.id, 'ring-2 ring-blue-500': chatSelectionMode && selectedChatIds.has(chat.id) }"
                                    style="content-visibility: auto; contain-intrinsic-size: 72px">
                                    <div class="w-12 h-12 mr-2.5">
                                        <div v-if="isSavedMessages(chat)"
                                            class="w-full h-full bg-blue-500 text-white flex items-center justify-center"
                                            :style="{ borderRadius: avatarRadius + '%' }">
                                            <BookmarkIcon class="w-7 h-7 fill-current" />
                                        </div>
                                        <Avatar v-else :photo="chat.photo" :title="chat.title"
                                            :radius="chatAvatarRadius(chat)"
                                            :accentColorId="getChatProfileAccentColorId(chat)"
                                            :deletedAccount="isDeletedChat(chat)" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex justify-between items-baseline mb-1">
                                            <h3
                                                class="text-sm font-semibold text-gray-900 flex items-center gap-1 min-w-0">
                                                <span class="truncate">{{ getChatTitle(chat) }}</span>
                                                <!-- 静音图标 -->
                                                <BellOffIcon v-if="isChatMuted(chat)"
                                                    class="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            </h3>
                                            <span class="text-xs text-gray-400 shrink-0 ml-1">{{
                                                formatTime(chat.last_message?.date)
                                            }}</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <div class="flex-1 min-w-0 flex items-center gap-1.5">
                                                <!-- 左侧未读角标：[12] user: hel -->
                                                <span v-if="showLeftBadge(chat) && chat.unread_count > 0"
                                                    class="shrink-0 text-xs font-semibold leading-4.5 text-blue-500">
                                                    [{{ formatUnreadCount(chat.unread_count) }}]
                                                </span>
                                                <!-- 发送者迷你头像 + 名称（群组，私聊/频道不显示） -->
                                                <template v-if="isChatGroup(chat) && senderName(chat)">
                                                    <Avatar
                                                        v-if="settings.chatList.showSenderMiniAvatar && senderMiniAvatar(chat)"
                                                        :photo="senderMiniAvatar(chat)" :title="senderName(chat)"
                                                        sizeClass="!w-4 !h-4" :radius="avatarRadius" class="shrink-0" />
                                                    <span class="shrink-0 text-xs text-gray-400">{{
                                                        senderName(chat) }}：</span>
                                                </template>
                                                <p class="min-w-0 truncate text-xs text-gray-500">
                                                    <FormattedTextInline
                                                        :formattedText="getMessagePreview(chat.last_message)"
                                                        :size="14" />
                                                </p>
                                            </div>
                                            <!-- 顶置图标：显示在未读消息位置，无未读时显示 -->
                                            <PinIcon v-if="isChatPinned(chat) && chat.unread_count === 0"
                                                class="shrink-0 w-4 h-4 text-gray-400" />
                                            <!-- 未读计数：静音对话灰显（启用左侧角标时不显示） -->
                                            <span v-if="chat.unread_count > 0 && !showLeftBadge(chat)"
                                                class="shrink-0 min-w-4.5 h-4.5 px-1.5 rounded-full text-white text-[10px] font-semibold leading-4.5 text-center"
                                                :class="isChatMuted(chat) ? 'bg-gray-400' : 'bg-blue-500'">
                                                {{ formatUnreadCount(chat.unread_count) }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- Forum Topic Panel (slides in from right)
                     绝对定位使其脱离外层 flex 流式：退出时 translateX(100%) 只相对自身宽度滑动，
                     从头像列(68px)分界线右侧滑出，不会带动/挤压左侧聊天列表 -->
                <Transition name="topic-slide">
                    <div v-if="forumMode && forumChatId"
                        class="absolute top-0 bottom-0 left-17 right-0 border-l border-gray-200 bg-white overflow-hidden flex flex-col">
                        <!-- Topics Header -->
                        <div class="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 shrink-0">
                            <button type="button" @click="exitForumMode"
                                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors shrink-0"
                                aria-label="返回">
                                <ArrowLeftIcon class="w-4 h-4 text-gray-600" />
                            </button>
                            <span class="text-sm font-medium text-gray-500 truncate">{{
                                forumChatTitle
                            }}</span>
                        </div>
                        <!-- Topic List -->
                        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
                            <div v-if="topicsLoading" class="flex flex-col gap-2 p-3">
                                <div v-for="n in 5" :key="n" class="flex items-center gap-2.5 p-2.5">
                                    <div class="w-9 h-9 rounded-xl bg-gray-200 animate-pulse shrink-0">
                                    </div>
                                    <div class="flex-1">
                                        <div class="h-3.5 bg-gray-200 rounded w-3/4 mb-1.5 animate-pulse">
                                        </div>
                                        <div class="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                                    </div>
                                </div>
                            </div>
                            <div v-else-if="forumTopics.length === 0"
                                class="flex flex-col items-center justify-center h-full text-gray-400">
                                <MessageCircleIcon class="w-10 h-10 mb-2 opacity-50" />
                                <p class="text-sm">暂无话题</p>
                            </div>
                            <div v-else class="py-1">
                                <button v-for="topic in forumTopics" :key="topic.info.forum_topic_id" type="button"
                                    @click="selectTopic(topic.info.forum_topic_id)"
                                    class="w-full px-3 py-2.5 hover:bg-gray-100 transition-colors text-left"
                                    style="content-visibility: auto; contain-intrinsic-size: 68px">
                                    <!-- 第一排：图标(头像)与标题同一排内联 + 时间；
                                         图标：General 用带主题色的 #，有自定义 emoji 用透明 emoji(无背景)，否则首字母小方块 -->
                                    <div class="flex justify-between items-baseline mb-0.5">
                                        <h3 class="flex items-center gap-1.5 min-w-0 text-sm font-medium text-gray-900">
                                            <template v-if="topic.info.is_general">
                                                <span class="text-base font-bold leading-none shrink-0"
                                                    :style="{ color: topicIconColor(topic.info.icon.color) }">#</span>
                                            </template>
                                            <CustomEmojiInline v-else-if="topicIconCustomEmojiId(topic)"
                                                :emojiId="topicIconCustomEmojiId(topic)" :size="16" class="shrink-0" />
                                            <span v-else
                                                class="w-5 h-5 rounded shrink-0 inline-flex items-center justify-center text-white text-[11px] font-bold"
                                                :style="{ backgroundColor: topicIconColor(topic.info.icon.color) }">{{
                                                    topicNameInitial(topic.info.name) }}</span>
                                            <span class="min-w-0 truncate">{{ topic.info.name }}</span>
                                            <span v-if="topic.info.is_closed"
                                                class="text-xs text-gray-400 ml-0.5 shrink-0">[已关闭]</span>
                                        </h3>
                                        <span class="text-xs text-gray-400 ml-1 shrink-0">{{
                                            formatTime(topic.last_message?.date)
                                        }}</span>
                                    </div>
                                    <!-- 第二排：发送人（迷你头像）+ 消息，复用对话列表的发送人标记 -->
                                    <div class="flex items-center gap-2">
                                        <div class="flex-1 min-w-0 flex items-center gap-1.5">
                                            <template v-if="topicSender(topic)">
                                                <Avatar
                                                    v-if="settings.chatList.showSenderMiniAvatar && topicMiniAvatar(topic)"
                                                    :photo="topicMiniAvatar(topic)" :title="topicSender(topic)"
                                                    sizeClass="!w-4 !h-4" :radius="avatarRadius" class="shrink-0" />
                                                <span class="shrink-0 text-xs text-gray-400">{{
                                                    topicSender(topic) }}：</span>
                                            </template>
                                            <p class="min-w-0 truncate text-xs text-gray-500">
                                                <FormattedTextInline :formattedText="getTopicPreview(topic)"
                                                    :size="14" />
                                            </p>
                                        </div>
                                        <span v-if="topic.unread_count > 0"
                                            class="shrink-0 min-w-4.5 h-4.5 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-4.5 text-center">
                                            {{ formatUnreadCount(topic.unread_count) }}
                                        </span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </div>

        <!-- ===== 对话选择模式操作栏 ===== -->
        <Transition name="slide-up">
            <div v-if="chatSelectionMode" ref="toolbarRef"
                class="border-t border-gray-200 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md shrink-0 px-3 py-2.5">
                <div class="flex items-stretch gap-2">
                    <div class="flex items-center gap-2">
                        <button type="button" aria-label="取消"
                            class="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                            @click="exitChatSelectionMode">
                            <XIcon class="w-4 h-4" />
                        </button>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                            {{ selectedChatIds.size }}
                        </span>
                    </div>
                    <div class="flex-1"></div>
                    <button type="button" :title="toolbarNarrow ? '归档' : ''"
                        class="flex flex-col items-center justify-center px-2 py-1 rounded-lg text-xs text-blue-500 hover:bg-blue-500/10 disabled:opacity-40"
                        :class="toolbarNarrow ? 'w-9 h-9' : 'gap-0.5'" :disabled="selectedChatIds.size === 0"
                        @click="archiveSelectedChats">
                        <ArchiveIcon class="w-5 h-5" />
                        <span v-if="!toolbarNarrow">归档</span>
                    </button>
                    <button type="button" :title="toolbarNarrow ? '静音' : ''"
                        class="flex flex-col items-center justify-center px-2 py-1 rounded-lg text-xs text-blue-500 hover:bg-blue-500/10 disabled:opacity-40"
                        :class="toolbarNarrow ? 'w-9 h-9' : 'gap-0.5'" :disabled="selectedChatIds.size === 0"
                        @click="muteSelectedChats">
                        <BellOffIcon class="w-5 h-5" />
                        <span v-if="!toolbarNarrow">静音</span>
                    </button>
                    <button type="button" :title="toolbarNarrow ? '删除' : ''"
                        class="flex flex-col items-center justify-center px-2 py-1 rounded-lg text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                        :class="toolbarNarrow ? 'w-9 h-9' : 'gap-0.5'" :disabled="selectedChatIds.size === 0"
                        @click="deleteSelectedChats">
                        <Trash2Icon class="w-5 h-5" />
                        <span v-if="!toolbarNarrow">删除</span>
                    </button>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, type Component } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { BookmarkIcon, SearchIcon, ArrowLeftIcon, MessageCircleIcon, UserIcon, UsersIcon, MegaphoneIcon, BotIcon, FolderIcon, BellOffIcon, PinIcon, ArchiveIcon, ChevronRightIcon, ArchiveRestore as ArchiveRestoreIcon, PinOff as PinOffIcon, FolderPlus as FolderPlusIcon, FolderMinus as FolderMinusIcon, BellRing as BellRingIcon, LogOut as LogOutIcon, CheckCheck as CheckCheckIcon, Trash2 as Trash2Icon, X as XIcon, Copy as CopyIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { settings } from '../../store/settings';
import {
    getSenderName, getSenderPhoto, ensureSenderLoaded,
    getChatProfileAccentColorId, ensureChatAccentLoaded, isDeletedChat,
    isChatGroup, isChatMuted, isChatPinned, DELETED_ACCOUNT_LABEL,
} from '../../utils/senderInfo';
import { useChatStore } from '../../store/chat';
import type { Chat } from '../../store/chat';
import { useUserStore } from '../../store/user';
import { isSavedMessagesChat, SAVED_MESSAGES_TITLE } from '../../utils/savedMessages';
import Avatar from './avatar.vue';
import type { message, forumTopic, forumTopics, formattedText } from 'tdlib-types';
import { tdlibSend } from '../../utils/tdlib';
import type { ContextMenuItem } from '../contextMenu/types';
import { MessagePlugin } from 'tdesign-vue-next';
import {
    isChatArchived, isChatPinned as chatIsPinned, isChatMuted as chatIsMuted,
    canLeaveChat, archiveChat, unarchiveChat, toggleChatPinned, muteChat, unmuteChat,
    leaveChat, isChatInFolder, toggleChatInFolder,
} from '../contextMenu/chatActions';
import MusicPlayerEntry from './../audio/MusicPlayerEntry.vue';
import FormattedTextInline from './FormattedTextInline.vue';
import CustomEmojiInline from './ChatDetail/MessageContent/CustomEmojiInline.vue';

const props = defineProps<{
    isArchive?: boolean;
}>();

const router = useRouter();
const route = useRoute();

/** 是否有聊天详情或话题列表打开（route 包含 chat id） */
const isChatOpen = computed(() => {
    return route.name === 'chat-detail' || route.name === 'chat-topic-detail';
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
    toolbarObserver?.disconnect();
    toolbarObserver = null;
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

/** 分组栏选项卡 */
type ChatListTab = {
    id: string;
    name: string;
    iconName?: string;
    /** 分组名称富文本（含自定义 emoji 实体） */
    formattedName?: formattedText | null;
};

const tabs = computed<ChatListTab[]>(() => {
    if (props.isArchive) return [];
    return chatStore.chatLists.filter(list => list._ !== 'chatListArchive').map(list => {
        if (list._ === 'chatListMain') {
            return { id: 'chatListMain', name: '全部', iconName: 'All' };
        }
        if (list._ === 'chatFolderInfo') {
            const nameText = list.name?.text?.text;
            return {
                id: `chat_folder_id${list.id}`,
                name: nameText || '文件夹',
                formattedName: nameText ? (list.name?.text ?? null) : null,
                iconName: list.icon?.name
            };
        }
        return { id: 'unknown', name: '未知' }
    });
});

// 分组图标映射（对应 TDLib chatFolderIcon.name，如 "All"、"Private"、"Groups"、"Channels"）
const FOLDER_ICON_MAP: Record<string, Component> = {
    All: MessageCircleIcon,
    Unread: MessageCircleIcon,
    Unmuted: MessageCircleIcon,
    Bots: BotIcon,
    Channels: MegaphoneIcon,
    Groups: UsersIcon,
    Private: UserIcon,
};

/** 分组选项卡图标：全部对话始终显示对话图标 */
const folderIcon = (tab: { id: string; iconName?: string }): Component => {
    if (tab.id === 'chatListMain') return MessageCircleIcon;
    return FOLDER_ICON_MAP[tab.iconName || ''] || FolderIcon;
};

/**
 * 分组未读计数：
 * - chats（默认）：未读对话数量（有未读消息的对话个数）
 * - messages：未读消息总数（所有对话 unread_count 之和）
 */
const tabUnread = (tabId: string): number => {
    const chats = chatStore.getList(tabId).value;
    if (settings.chatList.unreadCountMode === 'messages') {
        return chats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    }
    return chats.filter(c => (c.unread_count || 0) > 0).length;
};

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
watch(() => route.params.id, (id) => {
    selectedChatId.value = id ? Number(id) : null;
}, { immediate: true });

// ==================== 对话选择模式（多选） ====================
const chatSelectionMode = ref(false);
const selectedChatIds = ref<Set<number>>(new Set());

/** 对话选择模式操作栏容器 */
const toolbarRef = ref<HTMLElement | null>(null);
/** 操作栏是否过窄（文本被压缩到只有一行，此时仅显示图标） */
const toolbarNarrow = ref(false);
let toolbarObserver: ResizeObserver | null = null;

watch(chatSelectionMode, (on) => {
    if (on) {
        // 操作栏出现后再观察宽度，立即计算一次
        requestAnimationFrame(() => measureToolbar());
        const el = toolbarRef.value;
        if (el && typeof ResizeObserver !== 'undefined') {
            toolbarObserver = new ResizeObserver(measureToolbar);
            toolbarObserver.observe(el);
        }
    } else {
        toolbarObserver?.disconnect();
        toolbarObserver = null;
        toolbarNarrow.value = false;
    }
});

function measureToolbar() {
    const el = toolbarRef.value;
    if (!el) return;
    toolbarNarrow.value = el.clientWidth < 360;
}

/** 通过右键菜单“选择”进入/切换多选状态 */
function onChatSelect(chat: Chat) {
    chatSelectionMode.value = true;
    if (selectedChatIds.value.has(chat.id)) {
        selectedChatIds.value.delete(chat.id);
    } else {
        selectedChatIds.value.add(chat.id);
    }
}

/** 退出对话选择模式 */
const exitChatSelectionMode = () => {
    chatSelectionMode.value = false;
    selectedChatIds.value.clear();
};

/** 删除选中的对话 */
const deleteSelectedChats = async () => {
    const ids = Array.from(selectedChatIds.value);
    if (ids.length === 0) return;
    const revoke = window.confirm(`确定要删除选中的 ${ids.length} 个对话吗？\n\n将清空对话历史并从聊天列表移除。`)
        ? true
        : false;
    try {
        // 通过 deleteChatHistory 清空历史（仅本端），并标记为已删除
        for (const id of ids) {
            await tdlibSend({
                _: 'deleteChatHistory',
                chat_id: id,
                remove_from_chat_list: true,
                revoke,
            } as any);
        }
        MessagePlugin.success('已删除');
        exitChatSelectionMode();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
};

/** 归档选中的对话 */
const archiveSelectedChats = async () => {
    const ids = Array.from(selectedChatIds.value);
    for (const id of ids) {
        await archiveChat(id);
    }
    exitChatSelectionMode();
};

/** 退出：批量静音选中对话 */
const muteSelectedChats = async () => {
    const ids = Array.from(selectedChatIds.value);
    for (const id of ids) {
        await muteChat(id);
    }
    exitChatSelectionMode();
};

// ---- Forum Mode State ----
const forumMode = ref(false);
const forumChatId = ref<number | null>(null);
const forumChatTitle = ref('');
const forumTopics = ref<forumTopic[]>([]);
const topicsLoading = ref(false);
let forumNextOffsetDate = 0;
let forumNextOffsetMessageId = 0;
let forumNextOffsetForumTopicId = 0;
let forumHasMore = true;

const isSavedMessages = (chat: Chat) => isSavedMessagesChat(chat, userProfile.value?.id);
const getChatTitle = (chat: Chat) => {
    if (isSavedMessages(chat)) return SAVED_MESSAGES_TITLE;
    if (isDeletedChat(chat)) return DELETED_ACCOUNT_LABEL;
    return chat.title;
};

/**
 * 检测是否为话题模式论坛群组
 * 条件：chat.type 为 chatTypeSupergroup 且 view_as_topics 为 true
 */
const isForumChat = (chat: Chat): boolean => {
    return !!(chat.type?._ === 'chatTypeSupergroup' && (chat as any).view_as_topics);
};

/** 进入论坛模式：选中论坛群组，加载话题列表 */
const selectForumChat = async (chat: Chat) => {
    if (forumChatId.value === chat.id) return; // 已经选中
    forumChatId.value = chat.id;
    forumChatTitle.value = chat.title;
    forumTopics.value = [];
    topicsLoading.value = true;

    // 加载话题
    await loadForumTopics(chat.id, false);
};

/** 加载论坛话题 */
async function loadForumTopics(chatIdNum: number, loadMore: boolean) {
    if (loadMore && !forumHasMore) return;
    if (!loadMore) {
        forumNextOffsetDate = 0;
        forumNextOffsetMessageId = 0;
        forumNextOffsetForumTopicId = 0;
        forumHasMore = true;
    }

    topicsLoading.value = !loadMore;
    try {
        const result = await tdlibSend({
            _: 'getForumTopics',
            chat_id: chatIdNum,
            offset_date: loadMore ? forumNextOffsetDate : 0,
            offset_message_id: loadMore ? forumNextOffsetMessageId : 0,
            offset_forum_topic_id: loadMore ? forumNextOffsetForumTopicId : 0,
            limit: 50,
        }) as forumTopics;

        if (loadMore) {
            forumTopics.value = [...forumTopics.value, ...result.topics];
        } else {
            forumTopics.value = result.topics;
        }

        forumNextOffsetDate = result.next_offset_date;
        forumNextOffsetMessageId = result.next_offset_message_id;
        forumNextOffsetForumTopicId = result.next_offset_forum_topic_id;
        forumHasMore = result.topics.length > 0 && forumTopics.value.length < result.total_count;
    } catch (e) {
        console.error('Failed to load forum topics:', e);
    } finally {
        topicsLoading.value = false;
    }
}

// 话题列表变化时异步加载各话题最后消息发送者信息（用户/频道，缓存去重）
watch(forumTopics, (topics) => {
    topics.forEach(t => ensureSenderLoaded(t.last_message?.sender_id));
}, { deep: true });

/** 退出论坛模式 */
const exitForumMode = () => {
    forumMode.value = false;
    forumChatId.value = null;
    forumChatTitle.value = '';
    forumTopics.value = [];
};

/** 选择话题：导航到话题详情 */
const selectTopic = (topicId: number) => {
    if (!forumChatId.value) return;
    router.push({
        name: 'chat-topic-detail',
        params: {
            id: String(forumChatId.value),
            topicId: String(topicId),
        },
    });
};

/** 选择对话：论坛群组展开内联话题列表，普通对话进入聊天详情 */
/** 进入论坛模式：选中论坛群组，展开内联话题列表 */
const enterForumMode = (chat: Chat) => {
    selectedChatId.value = chat.id;
    forumMode.value = true;
    forumChatId.value = chat.id;
    forumChatTitle.value = chat.title;
    forumTopics.value = [];
    topicsLoading.value = true;
    loadForumTopics(chat.id, false);
};

/** 选择对话：论坛群组展开内联话题列表，普通对话进入聊天详情 */
const selectChat = async (chat: Chat) => {
    // 选择模式下点击对话切换选中态，不导航
    if (chatSelectionMode.value) {
        onChatSelect(chat);
        return;
    }
    if (isForumChat(chat)) {
        enterForumMode(chat);
        return;
    }
    // 兜底：view_as_topics 字段缺失（未随数据下发）时，主动 getChat 确认是否为论坛群组
    if (chat.type?._ === 'chatTypeSupergroup' && chat.view_as_topics === undefined) {
        let timeoutId: number | undefined;
        try {
            // 不让论坛类型确认阻塞普通聊天的打开；TDLib 异常或未响应时按普通聊天处理。
            const timeout = new Promise<undefined>((resolve) => {
                timeoutId = window.setTimeout(() => resolve(undefined), 1000);
            });
            const fresh = await Promise.race([
                tdlibSend({ _: 'getChat', chat_id: chat.id }),
                timeout,
            ]) as any;
            if (fresh && fresh._ !== 'error' && fresh.type?._ === 'chatTypeSupergroup' && fresh.view_as_topics) {
                enterForumMode(chat);
                return;
            }
        } catch (e) {
            console.warn('Failed to confirm forum chat via getChat:', e);
        } finally {
            if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        }
    }
    // 标记当前选中的对话（进入详情后列表中也保持高亮）
    selectedChatId.value = chat.id;
    await router.push({
        name: 'chat-detail',
        params: { id: String(chat.id) },
    });
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

/** 构造仅含纯文本的 formattedText */
const plainText = (text: string): formattedText => ({ _: 'formattedText', text, entities: [] });

const EMPTY_TEXT = plainText('');

const getMessagePreview = (message: message | undefined): formattedText => {
    if (!message) return EMPTY_TEXT;
    const content = message.content;
    if (!content) return EMPTY_TEXT;

    if (content._ === 'messageText') {
        return content.text;
    }
    if (content._ === 'messagePhoto') {
        return content.caption?.text ? content.caption : plainText('[图片]');
    }
    if (content._ === 'messageVideo') {
        return content.caption?.text ? content.caption : plainText('[视频]');
    }
    if (content._ === 'messageAnimation') {
        return content.caption?.text ? content.caption : plainText('[GIF]');
    }
    if (content._ === 'messageDocument') {
        return content.caption?.text ? content.caption : plainText(`[文件] ${content.document.file_name}`.trim());
    }
    if (content._ === 'messageSticker') {
        return plainText(`${content.sticker.emoji || ''} [贴纸]`.trim());
    }
    if (content._ === 'messageVoiceNote') {
        return plainText('[语音]');
    }
    if (content._ === 'messageAudio') {
        return content.caption?.text ? content.caption : plainText(`[音乐] ${content.audio.title || content.audio.file_name}`.trim());
    }
    if (content._ === 'messageVideoNote') {
        return plainText('[视频消息]');
    }
    return plainText('[消息]');
};

// ---- 聊天列表增强：发送者名称/迷你头像、静音、顶置、归档 ----
/** 头像圆角角度（来自外观设置） */
const avatarRadius = computed(() => settings.chatList.avatarCornerRadius);
/** 话题模式群组头像未跟随全局圆角时的正方形小圆角角度（25% border-radius） */
const FORUM_SQUARE_RADIUS = 50;
/**
 * 聊天列表中对话头像的圆角：
 * 话题模式群组且未开启"跟随圆角"时，按正方形+较小圆角显示；其余情况使用全局圆角
 */
const chatAvatarRadius = (chat: Chat) =>
    isForumChat(chat) && settings.chatList.forumAvatarFollowsRadius === false
        ? FORUM_SQUARE_RADIUS
        : avatarRadius.value;

/** 是否在消息预览左侧显示未读角标（badgeOnLeft，且可选仅对静音对话生效） */
const showLeftBadge = (chat: Chat) => {
    if (!settings.chatList.badgeOnLeft) return false;
    if (settings.chatList.badgeOnLeftMutedOnly && !isChatMuted(chat)) return false;
    return true;
};

/** 进入归档页 */
const goToArchive = () => router.push('/home/archived');

/** 最后消息发送者名称 */
const senderName = (chat: Chat) => getSenderName(chat.last_message?.sender_id);

/** 最后消息发送者迷你头像 */
const senderMiniAvatar = (chat: Chat) => getSenderPhoto(chat.last_message?.sender_id);

// ==================== 对话右键菜单 ====================
const buildChatContextMenu = (chat: Chat): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const chatId = chat.id;
    const pinned = chatIsPinned(chat);
    const muted = chatIsMuted(chat);
    const archived = isChatArchived(chat);
    const saved = isSavedMessagesChat(chat, userProfile.value?.id);

    // 收藏的消息：仅保留"选择"
    if (saved) {
        items.push({
            key: 'select',
            label: '选择',
            icon: CheckCheckIcon,
            onClick: () => onChatSelect(chat),
        });
        return items;
    }

    // 归档对话：归档/取消归档（根据当前状态切换）
    items.push({
        key: 'archive',
        label: archived ? '取消归档' : '归档对话',
        icon: archived ? ArchiveRestoreIcon : ArchiveIcon,
        onClick: () => (archived ? unarchiveChat(chatId) : archiveChat(chatId)),
    });

    // 取消置顶 / 置顶
    items.push({
        key: 'pin',
        label: pinned ? '取消置顶' : '置顶',
        icon: pinned ? PinOffIcon : PinIcon,
        onClick: () => {
            const list = archived ? { _: 'chatListArchive' } : undefined;
            toggleChatPinned(chatId, !pinned, list);
        },
    });

    // 加到分组 / 移出分组
    const folderChildren = buildFolderMenu(chat);
    if (folderChildren.length === 0) {
        items.push({
            key: 'folder',
            label: '加到分组',
            icon: FolderPlusIcon,
            disabled: true,
        });
    } else {
        items.push({
            key: 'folder',
            label: '加到分组',
            icon: FolderPlusIcon,
            children: folderChildren,
        });
    }

    // 关闭通知 / 开启通知
    if (!archived) {
        items.push({
            key: 'notify',
            label: muted ? '开启通知' : '关闭通知',
            icon: muted ? BellRingIcon : BellOffIcon,
            onClick: () => (muted ? unmuteChat(chatId) : muteChat(chatId)),
        });
    }

    // 退出群组（仅群组/超级群组）
    if (canLeaveChat(chat)) {
        items.push({
            key: 'leave',
            label: '退出群组',
            icon: LogOutIcon,
            danger: true,
            divider: true,
            onClick: () => {
                if (window.confirm(`确定要退出群组「${chat.title}」吗？`)) {
                    leaveChat(chatId);
                }
            },
        });
    }

    // 选择
    items.push({
        key: 'select',
        label: '选择',
        icon: CheckCheckIcon,
        onClick: () => onChatSelect(chat),
    });

    // 开发环境：复制对话原始 JSON 数据
    if (import.meta.env.DEV) {
        items.push({
            key: 'copy-json',
            label: '复制对话原始 JSON',
            icon: CopyIcon,
            divider: true,
            onClick: () => copyChatJson(chat),
        });
    }

    return items;
};

/** 复制对话原始 JSON 到剪贴板（开发调试用） */
function copyChatJson(chat: Chat) {
    const json = JSON.stringify(chat, null, 2);
    navigator.clipboard.writeText(json)
        .then(() => MessagePlugin.success('对话 JSON 已复制'))
        .catch(() => MessagePlugin.error('复制失败'));
}

/** “加到分组/移出分组”子菜单构建（基于 chat store 已加载的分组文件夹） */
function buildFolderMenu(chat: Chat): ContextMenuItem[] {
    const chatId = chat.id;
    // chatStore.chatLists: ChatListEntry[]，其中 chatFolderInfo 含 id
    const folders = chatStore.chatLists.filter((l): l is any => l._ === 'chatFolderInfo');
    const children: ContextMenuItem[] = [];
    let addedOne = false;
    for (const folder of folders) {
        const folderId = folder.id;
        const inFolder = isChatInFolder(chat, folderId);
        // 加到分组：列出不在其中的分组
        if (!inFolder) {
            children.push({
                key: `add-${folderId}`,
                label: folder.title?.text?.text ?? `分组 ${folderId}`,
                icon: FolderPlusIcon,
                onClick: () => toggleChatInFolder(chatId, folderId, true),
            });
        } else {
            // 移出分组：列出已在该分组的分组
            addedOne = true;
            children.push({
                key: `remove-${folderId}`,
                label: `从「${folder.title?.text?.text ?? `分组 ${folderId}`}」移出`,
                icon: FolderMinusIcon,
                danger: true,
                onClick: () => toggleChatInFolder(chatId, folderId, false),
            });
        }
    }

    // 若没有"移出"项，则把所有分组都列为"加到分组"供加入
    if (!addedOne && children.length === 0) {
        // 没有任何可操作的文件夹时返回空数组（上方会显示禁用项）
        return [];
    }
    return children;
}

// 列表内容变化时异步加载发送者信息（用户/频道数据，缓存去重）
watch(tabsWithContent, (list) => {
    list.forEach(({ chats }) => {
        chats.forEach(c => {
            ensureSenderLoaded(c.last_message?.sender_id);
            // 私聊需加载用户以取得 accent 色；群组/频道走 chat.accent_color_id
            ensureChatAccentLoaded(c);
        });
    });
}, { deep: true });

// 切换 Tab 时重置该列表的加载状态，并始终发起 loadChats
// （即使分组已有对话也要加载，否则只有一个/少量对话的分组永远不会继续拉取直到 404）
watch(activeTab, (newTab) => {
    if (!pageWidth.value) return;
    const idx = tabs.value.findIndex(t => t.id === newTab);
    if (idx >= 0) {
        swipeOffset.value = -idx * pageWidth.value;
    }
    chatStore.resetListState(newTab);
    triggerLoadMore(newTab);
    // 将选中的分组选项卡聚焦到标签栏可视范围内（横向滚动）
    scrollTabIntoView(newTab);
});

/** 将指定分组选项卡滚动到标签栏可视范围内 */
function scrollTabIntoView(tabId: string) {
    const container = tabsContainer.value;
    const el = container?.querySelector(`[data-tab-id="${tabId}"]`);
    if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
}

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
    if (forumMode.value) return; // 论坛模式禁用滑动切换
    if (tabs.value.length <= 1) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isHorizontalSwipe = null;
    currentTranslateX = swipeOffset.value;
}

function onTouchMove(e: TouchEvent) {
    if (forumMode.value) return; // 论坛模式禁用滑动切换
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
    if (forumMode.value) return; // 论坛模式禁用滑动切换
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

// ---- Forum Topic Helpers ----
const topicIconColors: Record<number, string> = {
    0x6FB9F0: '#6FB9F0',
    0xFFD67E: '#FFD67E',
    0xCB86DB: '#CB86DB',
    0x8EEE98: '#8EEE98',
    0xFF93B2: '#FF93B2',
    0xFB6F5F: '#FB6F5F',
};

function topicIconColor(color: number): string {
    return topicIconColors[color] || '#6FB9F0';
}

function topicNameInitial(name: string): string {
    return name.substring(0, 1).toUpperCase() || '#';
}

/** 话题图标自定义 emoji ID（无则返回空字符串；General 话题忽略） */
function topicIconCustomEmojiId(topic: forumTopic): string {
    if (topic.info.is_general) return '';
    const id = topic.info.icon.custom_emoji_id;
    return id && id !== '0' ? String(id) : '';
}

/** 话题最后消息发送者名称 */
const topicSender = (topic: forumTopic) => getSenderName(topic.last_message?.sender_id);

/** 话题最后消息发送者迷你头像 */
const topicMiniAvatar = (topic: forumTopic) => getSenderPhoto(topic.last_message?.sender_id);

function getTopicPreview(topic: forumTopic): formattedText {
    const msg = topic.last_message;
    if (!msg) return EMPTY_TEXT;

    const content = msg.content;
    if (!content) return EMPTY_TEXT;

    if (content._ === 'messageText') {
        return content.text;
    }
    if (content._ === 'messagePhoto') {
        return content.caption?.text ? content.caption : plainText('[图片]');
    }
    if (content._ === 'messageVideo') {
        return content.caption?.text ? content.caption : plainText('[视频]');
    }
    if (content._ === 'messageAnimation') {
        return content.caption?.text ? content.caption : plainText('[GIF]');
    }
    if (content._ === 'messageDocument') {
        return content.caption?.text ? content.caption : plainText(`[文件] ${content.document.file_name}`.trim());
    }
    if (content._ === 'messageSticker') {
        return plainText(`${content.sticker.emoji || ''} [贴纸]`.trim());
    }
    if (content._ === 'messageVoiceNote') {
        return plainText('[语音]');
    }
    if (content._ === 'messageAudio') {
        return content.caption?.text ? content.caption : plainText(`[音乐] ${content.audio.title || content.audio.file_name}`.trim());
    }
    if (content._ === 'messageVideoNote') {
        return plainText('[视频消息]');
    }
    return plainText('[消息]');
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

/* 全局 scrollbar 样式已移至 index.css (overlay + 悬停增宽) */
/* 此处仅保留 ChatList 特有的滚动条覆盖 */

/* Swipe track: horizontal layout for pages */
.swipe-track {
    will-change: transform;
    touch-action: pan-y;
}

/* Each page takes full width of the container */

/* Forum topic panel slide animation */
.topic-slide-enter-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.topic-slide-leave-active {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.topic-slide-enter-from {
    transform: translateX(100%);
    opacity: 0.5;
}

.topic-slide-leave-to {
    transform: translateX(100%);
    opacity: 0.5;
}

/* w-17 custom width (68px) for avatar column */
.w-17 {
    width: 68px;
}

/* Forum mode avatar column scrollbar */
.w-17::-webkit-scrollbar {
    width: 2px;
}

.w-17::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 1px;
}

.w-17:hover::-webkit-scrollbar-thumb {
    background: rgba(156, 163, 175, 0.3);
}

/* Slide-up transition for search bar, tabs, music player */
/* 统一为与宽度收缩 / 话题滑入一致的时序 (0.3s, cubic-bezier(0.4,0,0.2,1)) */
.slide-up-enter-active,
.slide-up-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}

/*
 * 折叠动画说明：
 * 每个目标元素自身设定了固定 max-h-12 / max-h-14，使 max-height 可被插值，
 * 从而真正平滑地从具体高度折叠到 0（auto → 0 是无动画的硬跳变）。
 */
.slide-up-enter-from {
    opacity: 0;
    max-height: 0;
    transform: translateY(-100%);
}

.slide-up-leave-to {
    opacity: 0;
    max-height: 0;
    transform: translateY(-20%);
    margin: 0;
    padding-top: 0;
    padding-bottom: 0;
    border: none;
}

/* Forum 头像列切换时淡入，避免硬切换生硬 */
@keyframes chat-list-fade-in {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.forum-avatar-column,
.chat-list-fade-in {
    animation: chat-list-fade-in 0.3s ease both;
}

.swipe-page {
    width: 100%;
}

/* forum 模式头像列：优先级高于上面的 width:100%，确保收缩到 68px */
.swipe-page.w-17 {
    width: 68px;
}

/* Prevent text selection while swiping */
.swiping * {
    user-select: none;
    -webkit-user-select: none;
}
</style>
