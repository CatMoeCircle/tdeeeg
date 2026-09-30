<template>
    <Teleport to="body">
        <Transition name="fp-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="close" @keydown.esc="onEsc">
                <div
                    class="w-110 max-w-[92vw] max-h-[78vh] flex flex-col rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
                        <div class="flex items-center gap-2 min-w-0">
                            <button v-if="topicPicker.open" type="button"
                                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 shrink-0"
                                @click="closeTopicPicker">
                                <ArrowLeftIcon class="w-4 h-4" />
                            </button>
                            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                                <template v-if="topicPicker.open">
                                    {{ topicPicker.chatTitle }}
                                </template>
                                <template v-else>
                                    {{ selectedTargets.size > 0 ? t('lng_forward_choose') : t('lng_context_forward_msg') }}
                                </template>
                            </h3>
                        </div>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="close">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 搜索（话题选择时不显示） -->
                    <div v-if="!topicPicker.open" class="px-3 pt-3 pb-2 shrink-0">
                        <div class="relative">
                            <input ref="searchInput" type="text" v-model="query" :placeholder="t('lng_dlg_filter')"
                                class="w-full pl-8 pr-3 py-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                @keydown.enter.prevent="onEnter" />
                            <SearchIcon class="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                        </div>
                    </div>

                    <!-- 分组选择（话题选择时不显示，通用 folderStyle 样式） -->
                    <div v-if="!topicPicker.open" class="px-2 pb-2 shrink-0">
                        <SlidingTabBar :tabs="folderTabs" :active-id="activeFolder" :variant="settings.folderStyle"
                            :tab-class="folderTabClassFn" :container-class="folderContainerClass"
                            @select="onFolderSelect">
                            <template #default="{ tab }">
                                <span class="whitespace-nowrap">{{ tab.name }}</span>
                            </template>
                        </SlidingTabBar>
                    </div>

                    <!-- ===== 主列表（可多选） ===== -->
                    <div v-if="!topicPicker.open"
                        class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 min-h-[180px]">
                        <div v-if="filteredChats.length === 0" class="text-center text-sm text-gray-400 py-8">
                            {{ query ? t('forward.noMatch') : t('forward.noChats') }}
                        </div>
                        <button v-for="chat in filteredChats" :key="chat.id" type="button"
                            class="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors text-left"
                            :class="isSelectedChat(chat.id)
                                ? 'bg-blue-50 dark:bg-blue-500/15'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'"
                            @click="onChatClick(chat)">
                            <!-- 头像 + 右下角蓝色确认图标（圆角跟随外观设置；已注销账户显示幽灵头像） -->
                            <div class="relative w-9 h-9 shrink-0">
                                <Avatar v-if="!isSaved(chat)" :photo="chat.photo" :title="chat.title"
                                    :radius="chatAvatarRadius(chat)" :deletedAccount="isDeletedChat(chat)"
                                    :accentColorId="(chat as any).profile_accent_color_id" />
                                <div v-else
                                    class="w-full h-full bg-blue-500 text-white flex items-center justify-center"
                                    :style="{ borderRadius: avatarRadius + '%' }">
                                    <BookmarkIcon class="w-5 h-5 fill-current" />
                                </div>
                                <!-- 选中确认图标（右下角） -->
                                <div v-if="isSelectedChat(chat.id)"
                                    class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-sm">
                                    <CheckIcon class="w-2.5 h-2.5 text-white" stroke-width="3" />
                                </div>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                    <GlobalEmojiText :text="chatTitle(chat)" />
                                </p>
                                <p v-if="selectedTopicLabel(chat.id)" class="text-xs text-blue-500 truncate mt-0.5">
                                    {{ selectedTopicLabel(chat.id) }}
                                </p>
                            </div>
                            <span class="text-xs text-gray-400 shrink-0">{{ chatTypeLabel(chat) }}</span>
                        </button>
                    </div>

                    <!-- ===== 话题 / 用户列表（二级选择） ===== -->
                    <div v-else class="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 min-h-[180px]">
                        <div v-if="topicPicker.loading" class="text-center text-sm text-gray-400 py-8">
                            {{ t('lng_context_seen_loading') }}
                        </div>
                        <div v-else-if="topicPicker.topics.length === 0"
                            class="text-center text-sm text-gray-400 py-8">
                            {{ topicPicker.kind === 'dm' ? t('forward.noSessions') : t('forward.noTopics') }}
                        </div>
                        <template v-else>
                            <button v-for="tp in topicPicker.topics" :key="tp.id" type="button"
                                class="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors text-left"
                                :class="topicPicker.selectedTopicId === tp.id
                                    ? 'bg-blue-50 dark:bg-blue-500/15'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'"
                                @click="topicPicker.selectedTopicId = tp.id">
                                <!-- 话题图标 / 用户头像（圆角跟随外观设置；已注销账户显示幽灵头像） -->
                                <div class="relative w-9 h-9 shrink-0">
                                    <Avatar v-if="tp.photo || tp.deleted" :photo="tp.photo" :title="tp.name"
                                        :radius="avatarRadius" :deletedAccount="tp.deleted" />
                                    <div v-else-if="tp.customEmojiId"
                                        class="w-full h-full flex items-center justify-center">
                                        <CustomEmojiInline :emojiId="tp.customEmojiId" :size="28" />
                                    </div>
                                    <div v-else-if="tp.isGeneral"
                                        class="w-full h-full flex items-center justify-center text-white text-lg font-bold"
                                        :style="{ backgroundColor: tp.color, borderRadius: avatarRadius + '%' }">#</div>
                                    <div v-else
                                        class="w-full h-full flex items-center justify-center text-white text-sm font-bold"
                                        :style="{ backgroundColor: tp.color, borderRadius: avatarRadius + '%' }">
                                        {{ topicNameInitial(tp.name) }}
                                    </div>
                                    <!-- 选中确认图标（右下角） -->
                                    <div v-if="topicPicker.selectedTopicId === tp.id"
                                        class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-sm">
                                        <CheckIcon class="w-2.5 h-2.5 text-white" stroke-width="3" />
                                    </div>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                        <GlobalEmojiText :text="tp.name" />
                                    </p>
                                </div>
                            </button>
                        </template>
                    </div>

                    <!-- 底部：已选摘要 + 小输入框 + 发送按钮 -->
                    <div class="border-t border-gray-100 dark:border-gray-700 shrink-0 px-3 py-2.5">
                        <!-- 话题选择确认栏 -->
                        <div v-if="topicPicker.open" class="flex items-center gap-2 mb-2">
                            <button type="button"
                                class="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                @click="closeTopicPicker">
                                {{ t('lng_menu_back') }}
                            </button>
                            <div class="flex-1"></div>
                            <button type="button" :disabled="topicPicker.selectedTopicId === null"
                                class="px-4 py-1.5 rounded-md bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-default"
                                @click="confirmTopicSelection">
                                {{ t('lng_box_done') }}
                            </button>
                        </div>

                        <!-- 选项指示 -->
                        <div v-if="!topicPicker.open && (hideSenderName || hideMediaCaption)"
                            class="flex items-center gap-2 mb-2 text-[11px]">
                            <span v-if="hideSenderName"
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300">
                                {{ t('lng_forward_action_hide_sender') }}
                            </span>
                            <span v-if="hideMediaCaption"
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                {{ t('lng_forward_action_hide_caption') }}
                            </span>
                            <button type="button" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-auto"
                                @click="clearForwardOptions">{{ t('lng_context_clear_selection') }}</button>
                        </div>

                        <div v-if="!topicPicker.open" class="flex items-center gap-2">
                            <input ref="commentInput" type="text" v-model="commentText" :placeholder="t('forward.addComment')"
                                class="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-full bg-gray-100 dark:bg-gray-700/50 border border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-400"
                                @keydown.enter.prevent="forwardNow" />
                            <!-- 发送按钮：左键发送，右键打开隐藏选项菜单（禁用时仍可右键改选项） -->
                            <button ref="sendBtn" type="button" :title="sendBtnTitle"
                                class="relative w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors"
                                :class="canSend
                                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 opacity-60'"
                                :aria-disabled="!canSend || sending"
                                @click="forwardNow" @contextmenu.prevent.stop="openSendOptionsMenu">
                                <SendIcon class="w-4 h-4" />
                                <span v-if="hideSenderName || hideMediaCaption"
                                    class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-gray-800"></span>
                            </button>
                        </div>

                        <div v-if="!topicPicker.open" class="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                            <span>{{ t('forward.msgCount', { count: msgCount }) }}</span>
                            <span v-if="selectedTargets.size > 0">{{ t('forward.chatCount', { count: selectedTargets.size }) }}</span>
                            <span v-if="captionAvailable">{{ t('forward.hasCaption') }}</span>
                            <div class="flex-1"></div>
                            <button type="button" @click="close"
                                class="px-2.5 py-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">{{ t('lng_cancel') }}</button>
                            <button type="button" @click="forwardNow" :disabled="!canSend || sending"
                                class="px-3 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-default">
                                {{ sending ? t('lng_forward_send') + '…' : t('lng_forward_send') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { ref, reactive, computed, nextTick, watch } from "vue";
import { XIcon, SearchIcon, BookmarkIcon, CheckIcon, SendIcon, ArrowLeftIcon } from "lucide-vue-next";
import Avatar from "../chat/avatar.vue";
import GlobalEmojiText from "../common/GlobalEmojiText.vue";
import CustomEmojiInline from "../common/CustomEmojiInline.vue";
import SlidingTabBar from "../common/SlidingTabBar.vue";
import { tdlibSend } from "../../utils/tdlib";
import { MessagePlugin } from "tdesign-vue-next";
import { useChatStore } from "../../store/chat";
import { useUserStore } from "../../store/user";
import { settings } from "../../store/settings";
import { openContextMenu } from "../../store/contextMenu";
import type { ContextMenuItem } from "./types";
import type { chat, message, forumTopics, chatPhotoInfo, profilePhoto } from "tdlib-types";
import { resolveTopicMode } from "../../utils/topicDisplayMode";
import { loadDmTopics, toDmTopicEntries, buildMessageTopicInput } from "../../utils/directMessagesTopics";
import { isDeletedChat, DELETED_ACCOUNT_LABEL } from "../../utils/senderInfo";
import { folderTabClass, folderTabContainerClass } from "../../utils/folderPillsTabClass";

const props = defineProps<{
    visible: boolean;
    /** 源对话 id */
    fromChatId: number;
    /** 待转发的消息 id 列表 */
    messageIds: number[];
    /** 可选：已加载的消息对象（用于判断是否含媒体说明） */
    messages?: message[];
}>();

const emit = defineEmits(["update:visible", "done"]);

const chatStore = useChatStore();
const userStore = useUserStore();
const query = ref("");
const searchInput = ref<HTMLElement | null>(null);
const commentInput = ref<HTMLElement | null>(null);
const sendBtn = ref<HTMLElement | null>(null);

/** 单个转发目标（对话 + 可选话题） */
interface ForwardTarget {
    chatId: number;
    topicId?: number;
    topicKind?: 'forum' | 'dm';
    topicLabel?: string;
}

/** 多选目标对话：chatId → 转发目标 */
const selectedTargets = ref<Map<number, ForwardTarget>>(new Map());
/** 转发附带评论 */
const commentText = ref("");
/** 隐藏发送者信息（send_copy） */
const hideSenderName = ref(false);
/** 隐藏媒体说明（remove_caption，须配合 send_copy） */
const hideMediaCaption = ref(false);
const sending = ref(false);
/** 当前分组页签 */
const activeFolder = ref("chatListMain");

const msgCount = computed(() => props.messageIds.length);

/** ---------- 话题二级选择 ---------- */

interface TopicRow {
    id: number;
    name: string;
    isGeneral: boolean;
    color: string;
    customEmojiId: string;
    /** 已注销/空账户：头像显示幽灵图标 */
    deleted?: boolean;
    photo?: chatPhotoInfo | profilePhoto;
}

const topicPicker = reactive({
    open: false,
    chatId: 0,
    chatTitle: '',
    kind: 'forum' as 'forum' | 'dm',
    loading: false,
    topics: [] as TopicRow[],
    selectedTopicId: null as number | null,
});

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
    return (name?.substring(0, 1) || '#').toUpperCase();
}

/** 该对话是否需要先选话题（论坛 / 频道私信 / tag 型话题） */
async function resolveTopicKind(c: chat): Promise<'none' | 'forum' | 'dm'> {
    if (c.type?._ !== 'chatTypeSupergroup') return 'none';
    try {
        const info = await resolveTopicMode(c);
        if (info.mode === 'none') return 'none';
        return info.isDirectMessages ? 'dm' : 'forum';
    } catch {
        return 'none';
    }
}

/** 加载论坛话题列表 */
async function loadForumTopics(chatId: number): Promise<TopicRow[]> {
    const result = await tdlibSend({
        _: 'getForumTopics',
        chat_id: chatId,
        offset_date: 0,
        offset_message_id: 0,
        offset_forum_topic_id: 0,
        limit: 50,
    }) as forumTopics;
    return (result.topics || []).map((tp) => {
        const id = tp.info.icon?.custom_emoji_id;
        return {
            id: tp.info.forum_topic_id,
            name: tp.info.name,
            isGeneral: !!tp.info.is_general,
            color: topicIconColor(tp.info.icon?.color ?? 0),
            customEmojiId: !tp.info.is_general && id && id !== '0' ? String(id) : '',
        };
    });
}

/** 加载频道私信话题（用户会话）列表 */
async function loadDmTopicRows(chatId: number): Promise<TopicRow[]> {
    await loadDmTopics(chatId);
    const entries = await toDmTopicEntries(chatId);
    return entries.map((e) => ({
        id: e.id,
        name: e.title,
        isGeneral: false,
        color: '#6FB9F0',
        customEmojiId: '',
        deleted: e.isDeleted,
        photo: e.photo,
    }));
}

/** 打开话题选择面板 */
async function openTopicPicker(c: chat, kind: 'forum' | 'dm') {
    topicPicker.open = true;
    topicPicker.chatId = c.id;
    topicPicker.chatTitle = chatTitle(c);
    topicPicker.kind = kind;
    topicPicker.loading = true;
    topicPicker.topics = [];
    topicPicker.selectedTopicId = null;
    try {
        topicPicker.topics = kind === 'dm'
            ? await loadDmTopicRows(c.id)
            : await loadForumTopics(c.id);
    } catch (e) {
        console.warn('load topics failed:', e);
        MessagePlugin.error(t('context.actionFailed'));
    } finally {
        topicPicker.loading = false;
    }
}

/** 返回主列表（不确认） */
function closeTopicPicker() {
    topicPicker.open = false;
    topicPicker.topics = [];
    topicPicker.selectedTopicId = null;
}

/** 确认话题选择 → 写回主列表并继续选择 */
function confirmTopicSelection() {
    if (topicPicker.selectedTopicId === null) return;
    const tp = topicPicker.topics.find((x) => x.id === topicPicker.selectedTopicId);
    if (!tp) return;
    const next = new Map(selectedTargets.value);
    next.set(topicPicker.chatId, {
        chatId: topicPicker.chatId,
        topicId: tp.id,
        topicKind: topicPicker.kind,
        topicLabel: tp.name,
    });
    selectedTargets.value = next;
    closeTopicPicker();
}

function isSelectedChat(chatId: number): boolean {
    return selectedTargets.value.has(chatId);
}

function selectedTopicLabel(chatId: number): string | undefined {
    return selectedTargets.value.get(chatId)?.topicLabel;
}

/** 点击对话：已选中则取消；有话题则进入二级选择；否则直接选中 */
async function onChatClick(c: chat) {
    if (selectedTargets.value.has(c.id)) {
        const next = new Map(selectedTargets.value);
        next.delete(c.id);
        selectedTargets.value = next;
        return;
    }
    const kind = await resolveTopicKind(c);
    if (kind === 'none') {
        const next = new Map(selectedTargets.value);
        next.set(c.id, { chatId: c.id });
        selectedTargets.value = next;
        return;
    }
    void openTopicPicker(c, kind);
}

function onEsc() {
    if (topicPicker.open) {
        closeTopicPicker();
        return;
    }
    close();
}

/** ---------- 媒体说明检测 ---------- */

/** 消息是否带非空媒体说明（相册/图片/视频/音乐/GIF/文件等 caption） */
function contentHasCaption(msg: message | undefined): boolean {
    if (!msg) return false;
    const c = msg.content as { _?: string; caption?: { text?: string } };
    if (!c) return false;
    // 优先看 caption 字段（相册/图片/视频/音乐/GIF/文件等）
    if (typeof c.caption?.text === "string" && c.caption.text.trim().length > 0) return true;
    return false;
}

/** 本地消息快照（props.messages 优先） */
const localMsgMap = computed(() => {
    const map = new Map<number, message>();
    for (const m of props.messages || []) {
        if (m && typeof m.id === "number") map.set(m.id, m);
    }
    return map;
});

/** 远程补取消息的 caption 结果缓存 */
const fetchedHasCaption = ref<Map<number, boolean>>(new Map());

/** 当前选中消息中是否存在可隐藏的媒体说明 */
const captionAvailable = computed(() => {
    for (const id of props.messageIds) {
        const local = localMsgMap.value.get(id);
        if (contentHasCaption(local)) return true;
        if (fetchedHasCaption.value.get(id)) return true;
    }
    return false;
});

/** 打开时用 getMessage 补取消息，判断是否含说明 */
async function prefetchMessageCaptions() {
    const need = props.messageIds.filter((id) => {
        if (localMsgMap.value.has(id)) return false;
        return !fetchedHasCaption.value.has(id);
    });
    if (need.length === 0) return;
    await Promise.all(need.map(async (id) => {
        try {
            const msg = await tdlibSend({
                _: "getMessage",
                chat_id: props.fromChatId,
                message_id: id,
            } as any) as message | null;
            if (msg && msg._ === "message") {
                fetchedHasCaption.value.set(id, contentHasCaption(msg));
            } else {
                fetchedHasCaption.value.set(id, false);
            }
        } catch {
            fetchedHasCaption.value.set(id, false);
        }
    }));
}

// ---------- 分组 / 列表 ----------

type FolderTab = { id: string; name: string };

const folderTabs = computed<FolderTab[]>(() => {
    const tabs: FolderTab[] = [{ id: "chatListMain", name: t("forward.all") }];
    for (const list of chatStore.chatLists) {
        if (list._ === "chatFolderInfo") {
            const name = (list as any).name?.text?.text || t("forward.folder");
            tabs.push({ id: `chat_folder_id${list.id}`, name });
        }
    }
    // 归档始终可切换
    tabs.push({ id: "chatListArchive", name: t("lng_search_tab_archive") });
    return tabs;
});

/** 分组栏按钮类：跟随外观设置「文件夹样式」 */
function folderTabClassFn(id: string, active: boolean): string {
    return folderTabClass(settings.folderStyle, id, active);
}

/** 分组栏容器类：通用磨砂玻璃浮层 */
const folderContainerClass = computed(() => folderTabContainerClass(settings.folderStyle));

function onFolderSelect(id: string) {
    activeFolder.value = id;
}

/** 头像圆角（外观设置 0~100） */
const avatarRadius = computed(() => settings.chatList.avatarCornerRadius);

/** 话题模式群组头像未跟随全局圆角时的正方形小圆角 */
const FORUM_SQUARE_RADIUS = 50;

/** 对话列表头像圆角：论坛群且未开「跟随圆角」时用方形小圆角，其余跟随外观设置 */
function chatAvatarRadius(c: chat): number {
    const isForumList = !!(c.type?._ === 'chatTypeSupergroup' && (c as any).view_as_topics);
    return isForumList && settings.chatList.forumAvatarFollowsRadius === false
        ? FORUM_SQUARE_RADIUS
        : avatarRadius.value;
}

const allChats = computed(() => {
    // 直接复用 chat store 各分组列表（主列表 / 归档 / 文件夹）
    return chatStore.getList(activeFolder.value).value as any as chat[];
});

const filteredChats = computed(() => {
    const q = query.value.trim().toLowerCase();
    let chats = allChats.value as any as chat[];
    if (q) {
        chats = chats.filter((c) => (c.title || "").toLowerCase().includes(q));
    }
    return chats.slice(0, 100);
});

const canSend = computed(() => selectedTargets.value.size > 0 && props.messageIds.length > 0 && !sending.value);

const sendBtnTitle = computed(() => {
    const parts = [t('lng_forward_send') || t('lng_forward_send')];
    if (hideSenderName.value) parts.push(hideSenderLabel());
    if (hideMediaCaption.value) parts.push(hideCaptionLabel());
    parts.push(t('forward.rightClickHint'));
    return parts.join(' · ');
});

/** 多条消息时用复数官方文案 */
function hideSenderLabel(): string {
    const multi = props.messageIds.length > 1;
    return multi
        ? (t('lng_forward_action_hide_senders') || t('lng_forward_action_hide_sender'))
        : (t('lng_forward_action_hide_sender') || t('lng_forward_action_hide_sender'));
}
function showSenderLabel(): string {
    const multi = props.messageIds.length > 1;
    return multi
        ? (t('lng_forward_action_show_senders') || t('lng_forward_action_show_sender'))
        : (t('lng_forward_action_show_sender') || t('lng_forward_action_show_sender'));
}
function hideCaptionLabel(): string {
    const multi = props.messageIds.length > 1;
    return multi
        ? (t('lng_forward_action_hide_captions') || t('lng_forward_action_hide_caption'))
        : (t('lng_forward_action_hide_caption') || t('lng_forward_action_hide_caption'));
}
function showCaptionLabel(): string {
    const multi = props.messageIds.length > 1;
    return multi
        ? (t('lng_forward_action_show_captions') || t('lng_forward_action_show_caption'))
        : (t('lng_forward_action_show_caption') || t('lng_forward_action_show_caption'));
}

const isSaved = (chat: chat) => {
    const myId = userStore.userProfile?.id;
    return chat.id === myId;
};

const chatTitle = (chat: chat) => {
    if (isSaved(chat)) return t("lng_saved_messages");
    if (isDeletedChat(chat)) return DELETED_ACCOUNT_LABEL;
    return chat.title || t("forward.unknownChat");
};

function chatTypeLabel(chat: chat): string {
    if (isSaved(chat)) return t('lng_media_auto_private_chats');
    const typeKey = (chat as any).type?._;
    if (typeKey === "chatTypePrivate") return t('lng_media_auto_private_chats');
    if (typeKey === "chatTypeBasicGroup") return t('lng_notification_groups');
    if (typeKey === "chatTypeSupergroup") {
        return (chat as any).type?.is_channel ? t('lng_notification_channels') : t('lng_notification_groups');
    }
    return "";
}

function clearForwardOptions() {
    hideSenderName.value = false;
    hideMediaCaption.value = false;
}

/** 发送按钮右键菜单：隐藏发送者信息 / 隐藏媒体说明 */
function openSendOptionsMenu(e: MouseEvent) {
    const items: ContextMenuItem[] = [];

    // 隐藏发送者信息
    items.push({
        key: "hide-sender",
        label: hideSenderName.value ? showSenderLabel() : hideSenderLabel(),
        checked: hideSenderName.value,
        onClick: () => {
            hideSenderName.value = !hideSenderName.value;
        },
    });

    // 隐藏媒体说明：仅当选中消息里存在媒体/文件说明时出现
    if (captionAvailable.value) {
        items.push({
            key: "hide-caption",
            label: hideMediaCaption.value ? showCaptionLabel() : hideCaptionLabel(),
            checked: hideMediaCaption.value,
            onClick: () => {
                hideMediaCaption.value = !hideMediaCaption.value;
                // TDLib：remove_caption 仅在 send_copy 时生效
                if (hideMediaCaption.value) hideSenderName.value = true;
            },
        });
    }

    openContextMenu(e.clientX, e.clientY, items, sendBtn.value);
}

// ---------- 生命周期 ----------

watch(() => props.visible, async (v) => {
    if (v) {
        selectedTargets.value = new Map();
        query.value = "";
        commentText.value = "";
        hideSenderName.value = false;
        hideMediaCaption.value = false;
        sending.value = false;
        activeFolder.value = "chatListMain";
        fetchedHasCaption.value = new Map();
        closeTopicPicker();
        // 加载分组与对话列表
        void chatStore.loadChatLists().then(() => {
            for (const list of chatStore.chatLists) {
                void chatStore.loadList(list);
            }
        });
        void prefetchMessageCaptions();
        await nextTick();
        searchInput.value?.focus();
    }
});

function onEnter() {
    if (topicPicker.open) return;
    const list = filteredChats.value;
    if (list.length === 1) {
        void onChatClick(list[0]);
    } else if (list.length > 1 && selectedTargets.value.size > 0) {
        forwardNow();
    }
}

function close() {
    emit("update:visible", false);
}

// ---------- 发送 ----------

async function forwardNow() {
    if (sending.value) return;
    if (topicPicker.open) return;
    if (selectedTargets.value.size === 0) {
        MessagePlugin.info(t("forward.pickChatFirst"));
        return;
    }
    if (props.messageIds.length === 0) return;

    // TDLib 要求 message_ids 严格递增
    const messageIds = [...new Set(props.messageIds)].sort((a, b) => a - b);
    const targets = [...selectedTargets.value.values()];
    // remove_caption 仅在 send_copy 为 true 时生效
    const sendCopy = hideSenderName.value || hideMediaCaption.value;
    const removeCaption = hideMediaCaption.value;
    const comment = commentText.value.trim();

    sending.value = true;
    let okCount = 0;
    try {
        for (const target of targets) {
            const topicId = (target.topicId && target.topicKind)
                ? buildMessageTopicInput(target.topicKind === 'dm', target.topicId)
                : undefined;
            await tdlibSend({
                _: "forwardMessages",
                chat_id: target.chatId,
                from_chat_id: props.fromChatId,
                message_ids: messageIds,
                ...(topicId ? { topic_id: topicId } : {}),
                send_copy: sendCopy,
                remove_caption: removeCaption,
                options: { _: "messageSendOptions", disable_notification: false } as any,
            } as any);

            // 附带评论：转发完成后单独发送文本
            if (comment) {
                await tdlibSend({
                    _: "sendMessage",
                    chat_id: target.chatId,
                    ...(topicId ? { topic_id: topicId } : {}),
                    input_message_content: {
                        _: "inputMessageText",
                        text: { _: "formattedText", text: comment },
                    },
                } as any);
            }
            okCount++;
        }

        const label = sendCopy
            ? (removeCaption ? t("forward.doneHideBoth") : t("forward.doneHideSender"))
            : t("forward.done");
        MessagePlugin.success(okCount > 1 ? t('forward.doneMulti', { label, count: okCount }) : label);
        close();
        emit("done");
    } catch (e: any) {
        console.error("forward failed:", e);
        MessagePlugin.error(e?.message || t("context.actionFailed"));
    } finally {
        sending.value = false;
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
