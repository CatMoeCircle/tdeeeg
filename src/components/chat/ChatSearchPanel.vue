<template>
    <div class="flex flex-col flex-1 min-h-0">
        <!-- ===== 搜索分类页签（原分组栏位置） ===== -->
        <!-- relative z-10：浮层阴影画在结果区之上，避免被下方内容压住 -->
        <div class="relative z-10 shrink-0 pt-0.5 pb-1">
            <SlidingTabBar :tabs="categoryTabs" :active-id="activeCategory" :variant="settings.folderStyle"
                :tab-class="categoryTabClass" :container-class="categoryContainerClass"
                :show-indicator="settings.folderStyle === 'tabs' || settings.folderStyle === 'soft'"
                @select="switchCategory">
                <template #default="{ tab }">
                    <component :is="tab.icon" class="w-3 h-3 shrink-0" />
                    <span>{{ tab.name }}</span>
                </template>
            </SlidingTabBar>
        </div>

        <!-- ===== 搜索结果区 ===== -->
        <div ref="resultsEl" class="flex-1 overflow-y-auto custom-scrollbar pl-1.5 pr-0.5 pt-1 pb-1" v-smooth-wheel
            @scroll.passive="onResultsScroll">
            <!-- ===== 帖子分类：Premium / Star 限制状态页（优先于通用空态） ===== -->
            <template v-if="activeCategory === 'posts' && postsState !== 'results'">
                <!-- 加载中 -->
                <div v-if="postsState === 'loading'" class="flex flex-col gap-2 p-3">
                    <div v-for="n in 5" :key="n" class="flex items-center gap-2.5 p-2.5">
                        <div class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                        <div class="flex-1">
                            <div class="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1.5 animate-pulse"></div>
                            <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
                        </div>
                    </div>
                </div>

                <!-- 非 Premium：订阅引导 -->
                <div v-else-if="postsState === 'premium-required'"
                    class="flex flex-col items-center justify-center h-full px-6 text-center select-none">
                    <div class="w-14 h-14 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                        <CrownIcon class="w-7 h-7" />
                    </div>
                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">{{ t('lng_posts_title') }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">{{ t('lng_posts_start') }}</p>
                    <button type="button"
                        class="px-5 py-2 rounded-full bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                        @click="goPremium">
                        {{ t('lng_posts_subscribe') }}
                    </button>
                    <p class="text-xs text-gray-400 mt-3">{{ t('lng_posts_need_subscribe') }}</p>
                </div>

                <!-- 空状态 / 有免费次数：标题 + 提示 + 搜索按钮 -->
                <div v-else-if="postsState === 'idle' || postsState === 'limit-info'"
                    class="flex flex-col items-center justify-center h-full px-6 text-center select-none">
                    <div class="w-14 h-14 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                        <FileTextIcon class="w-7 h-7" />
                    </div>
                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                        {{ postsLimits && postsLimits.remaining_free_query_count <= 0 && !postsLimits.is_current_query_free
                            ? t('lng_posts_limit_reached') : t('lng_posts_title') }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ postsLimits && postsLimits.remaining_free_query_count <= 0 && !postsLimits.is_current_query_free
                            ? t('lng_posts_limit_about', { count: postsLimits.daily_free_query_count })
                            : t('lng_posts_start') }}
                    </p>
                    <!-- 免费次数提示 -->
                    <p v-if="postsLimits && (postsLimits.remaining_free_query_count > 0 || postsLimits.is_current_query_free)"
                        class="text-xs text-gray-400 mt-2">
                        {{ t('lng_posts_remaining', { count: postsLimits.remaining_free_query_count }) }}
                    </p>
                    <!-- 免费搜索冷却 -->
                    <p v-else-if="postsLimits && postsLimits.next_free_query_in > 0"
                        class="text-xs text-gray-400 mt-2">
                        {{ t('lng_posts_limit_unlocks', { duration: formatDuration(postsLimits.next_free_query_in) }) }}
                    </p>

                    <!-- 操作按钮 -->
                    <button v-if="!postsQuery.trim()" type="button" disabled
                        class="mt-4 px-5 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 text-sm font-medium cursor-not-allowed">
                        {{ t('lng_dlg_filter') }}
                    </button>
                    <button v-else-if="postsCanSearchFree" type="button"
                        class="mt-4 px-5 py-2 rounded-full bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                        @click="runPostsSearchNow">
                        {{ t('lng_posts_search_button', { query: postsQuery.trim() }) }}
                    </button>
                    <button v-else type="button"
                        class="mt-4 px-5 py-2 rounded-full bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors inline-flex items-center gap-1.5"
                        @click="runPostsSearchNow">
                        <StarIcon class="w-4 h-4" />
                        {{ t('lng_posts_limit_search_paid', { cost: postsLimits?.star_count ?? 0 }) }}
                    </button>
                </div>

                <!-- 未找到 -->
                <div v-else-if="postsState === 'empty'"
                    class="flex flex-col items-center justify-center h-full px-6 text-center select-none">
                    <SearchIcon class="w-10 h-10 mb-2 text-gray-300 dark:text-gray-600" />
                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">{{ t('lng_search_tab_no_results') }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ t('lng_search_tab_no_results_text', { query: postsQuery.trim() }) }}
                    </p>
                </div>
            </template>

            <!-- 空查询提示：仅关键词类分类（链接等）；聊天空查询显示最近，媒体类可空浏览 -->
            <div v-else-if="!query.trim() && !allowEmptyQuery && !isChatCategory && activeCategory !== 'posts' && !hasResults && !loading"
                class="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                <SearchIcon class="w-10 h-10 mb-2 opacity-40" />
                <p class="text-sm">{{ t('search.enterKeyword') }}</p>
                <p class="text-xs mt-1 opacity-70">{{ t('search.keywordHint') }}</p>
            </div>

            <!-- 加载中 -->
            <div v-else-if="loading && !hasResults" class="flex flex-col gap-2 p-3">
                <div v-for="n in 5" :key="n" class="flex items-center gap-2.5 p-2.5">
                    <div class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                    <div class="flex-1">
                        <div class="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1.5 animate-pulse"></div>
                        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
                    </div>
                </div>
            </div>

            <!-- 无结果 -->
            <div v-else-if="!loading && !hasResults"
                class="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                <SearchIcon class="w-10 h-10 mb-2 opacity-40" />
                <p class="text-sm">{{ t('lng_search_messages_none') }}</p>
            </div>

            <!-- 聊天类结果（聊天 / 频道 / 应用）：按来源分组 -->
            <template v-else-if="isChatCategory">
                <template v-for="section in chatSections" :key="section.key">
                    <div class="px-2.5 pt-2 pb-1 text-xs font-semibold text-gray-400 dark:text-gray-500 select-none">
                        {{ section.title }}
                    </div>
                    <div v-for="chat in section.items" :key="chat.id" @click="selectChat(chat)"
                        class="chat-list-item flex items-center p-2.5 mb-0.5 hover:bg-white/70 dark:hover:bg-gray-800/70 rounded-xl cursor-pointer transition-colors"
                        style="content-visibility: auto; contain-intrinsic-size: 72px">
                        <div class="w-12 h-12 mr-2.5">
                            <div v-if="isSavedMessages(chat)"
                                class="w-full h-full bg-blue-500 text-white flex items-center justify-center rounded-full">
                                <BookmarkIcon class="w-7 h-7 fill-current" />
                            </div>
                            <Avatar v-else :photo="chat.photo" :title="chat.title" :radius="avatarRadius"
                                :accentColorId="chat.profile_accent_color_id ?? chat.accent_color_id"
                                :deletedAccount="isDeletedChat(chat)" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">
                                <GlobalEmojiText :text="displayChatTitle(chat)" />
                            </h3>
                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {{ chatSubtitle(chat) }}
                            </p>
                        </div>
                    </div>
                </template>
            </template>

            <!-- 消息类结果（媒体 / 文件 / 链接 / 音频 / 语音 / 帖子结果） -->
            <template v-else>
                <div v-for="msg in messageResults" :key="msg.id" @click="selectMessage(msg)"
                    class="flex items-start gap-2.5 p-2.5 mb-0.5 hover:bg-white/70 dark:hover:bg-gray-800/70 rounded-xl cursor-pointer transition-colors"
                    style="content-visibility: auto; contain-intrinsic-size: 72px">
                    <Avatar :photo="resultChat(msg.chat_id)?.photo" :title="resultChat(msg.chat_id)?.title"
                        :accentColorId="resultChat(msg.chat_id)?.profile_accent_color_id ?? resultChat(msg.chat_id)?.accent_color_id"
                        sizeClass="!w-10 !h-10" :radius="avatarRadius" class="mt-0.5 shrink-0" />
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2 mb-0.5">
                            <h3 class="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">
                                <GlobalEmojiText :text="resultChat(msg.chat_id)?.title || String(msg.chat_id)" />
                            </h3>
                            <span class="text-xs text-gray-400 shrink-0">{{ formatTime(msg.date) }}</span>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {{ messagePreview(msg) }}
                        </p>
                    </div>
                </div>
            </template>

            <!-- 加载更多 -->
            <div v-if="loadingMore" class="px-4 py-2 text-xs text-center text-gray-400">{{ t('lng_context_seen_loading') }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { ref, computed, watch, onMounted, onUnmounted, type Component } from 'vue';
import { useRouter } from 'vue-router';
import {
    SearchIcon, BookmarkIcon,
    MessageCircleIcon, MegaphoneIcon, BotIcon,
    FileTextIcon, ImageIcon, FileIcon, LinkIcon, MusicIcon, MicIcon,
    CrownIcon, StarIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { settings } from '../../store/settings';
import type { Chat } from '../../store/chat';
import { useUserStore } from '../../store/user';
import {
    getReactiveChat, ensureChat, ensureUser, getReactiveUser, isDeletedChat, getChatTitle,
} from '../../utils/senderInfo';
import { isSavedMessagesChat, SAVED_MESSAGES_TITLE } from '../../utils/savedMessages';
import { tdlibSend } from '../../utils/tdlib';
import { MessagePlugin } from 'tdesign-vue-next';
import { getMessagePlainText } from '../../utils/messageText';
import { folderTabClass as sharedFolderTabClass, folderTabContainerClass } from '../../utils/folderPillsTabClass';
import Avatar from './avatar.vue';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';
import SlidingTabBar from '../common/SlidingTabBar.vue';
import type { message, chat, publicPostSearchLimits, SearchMessagesFilter$Input, SearchChatTypeFilter$Input } from 'tdlib-types';

const props = defineProps<{
    /** 搜索关键词（由 ChatList 顶部搜索框绑定） */
    query: string;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
}>();

const router = useRouter();
const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);

// ==================== 分类定义 ====================
type SearchCategory = 'chats' | 'channels' | 'apps' | 'posts' | 'media' | 'files' | 'links' | 'audio' | 'voice';

interface CategoryTab {
    id: SearchCategory;
    name: string;
    icon: Component;
}

const categoryTabs = computed<CategoryTab[]>(() => [
    { id: 'chats', name: t('lng_recent_chats'), icon: MessageCircleIcon },
    { id: 'channels', name: t('lng_recent_channels'), icon: MegaphoneIcon },
    { id: 'apps', name: t('lng_recent_apps'), icon: BotIcon },
    { id: 'posts', name: t('lng_search_tab_public_posts'), icon: FileTextIcon },
    { id: 'media', name: t('lng_media_type_media'), icon: ImageIcon },
    { id: 'files', name: t('lng_media_type_files'), icon: FileIcon },
    { id: 'links', name: t('lng_all_links'), icon: LinkIcon },
    { id: 'audio', name: t('lng_media_music_title'), icon: MusicIcon },
    { id: 'voice', name: t('lng_all_voice'), icon: MicIcon },
]);

const activeCategory = ref<SearchCategory>('chats');

/** 聊天类分类（结果为对话） */
const isChatCategory = computed(() =>
    activeCategory.value === 'chats' || activeCategory.value === 'channels' || activeCategory.value === 'apps');

/** 消息内容筛选（消息类分类） */
const messageFilter = computed<SearchMessagesFilter$Input | undefined>(() => {
    switch (activeCategory.value) {
        case 'media': return { _: 'searchMessagesFilterPhotoAndVideo' };
        case 'files': return { _: 'searchMessagesFilterDocument' };
        case 'links': return { _: 'searchMessagesFilterUrl' };
        case 'audio': return { _: 'searchMessagesFilterAudio' };
        case 'voice': return { _: 'searchMessagesFilterVoiceAndVideoNote' };
        default: return undefined; // 帖子：不加内容筛选
    }
});

/** 对话类型筛选（聊天类分类） */
const chatTypeFilter = computed<SearchChatTypeFilter$Input | undefined>(() => {
    switch (activeCategory.value) {
        case 'channels': return { _: 'searchChatTypeFilterChannel' };
        case 'apps': return { _: 'searchChatTypeFilterBot' };
        default: return undefined;
    }
});

// ==================== 搜索状态 ====================
const resultsEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
/** 聊天类结果（按来源分组） */
const chatSections = ref<{ key: string; title: string; items: Chat[] }[]>([]);
const messageResults = ref<message[]>([]);
const chatCache = ref<Map<number, chat>>(new Map());

// ---- 帖子搜索 Premium / Star 限制（对齐 Unigram SearchPostsViewModel） ----
type PostsState = 'idle' | 'premium-required' | 'limit-info' | 'loading' | 'results' | 'empty';
const postsState = ref<PostsState>('idle');
const postsLimits = ref<publicPostSearchLimits | null>(null);
/** 用户主动触发搜索（免费或付费）后才真正请求 */
const postsQuery = computed(() => props.query);
const isPremium = computed(() => !!userProfile.value?.is_premium);
const postsCanSearchFree = computed(() => {
    if (!postsLimits.value) return false;
    return postsLimits.value.remaining_free_query_count > 0 || postsLimits.value.is_current_query_free;
});

function formatDuration(seconds: number): string {
    if (seconds <= 0) return t('search.durationSeconds', { s: 0 });
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return t('search.durationHoursMinutes', { h, m });
    if (m > 0) return t('search.durationMinutesSeconds', { m, s });
    return t('search.durationSeconds', { s });
}

function goPremium() {
    MessagePlugin.info(t('search.subscribeInSettings'));
}

/** 进入帖子页 / 查询变化时刷新限额并展示状态页（对齐 Unigram：空查询也拉限额，不自动消耗免费次数） */
async function refreshPostsLimits() {
    const q = postsQuery.value.trim();
    postsLimits.value = null;
    if (!isPremium.value) {
        postsState.value = 'premium-required';
        return;
    }
    try {
        const limits = await tdlibSend({
            _: 'getPublicPostSearchLimits', query: q,
        } as any) as publicPostSearchLimits;
        postsLimits.value = limits;
        // 无论是否有关键词都展示状态页（有额度信息 + 搜索按钮）
        postsState.value = 'limit-info';
    } catch (e) {
        console.warn('getPublicPostSearchLimits failed:', e);
        postsState.value = 'idle';
    }
}

/** 用户点击搜索按钮：免费则 star_count=0，否则按限额 star_count 走付费搜索 */
async function runPostsSearchNow() {
    const q = postsQuery.value.trim();
    if (!q || !isPremium.value) return;

    if (!postsLimits.value) await refreshPostsLimits();
    const limits = postsLimits.value;
    const free = !limits || limits.remaining_free_query_count > 0 || limits.is_current_query_free;
    const starCount = free ? 0 : (limits?.star_count ?? 0);

    postsState.value = 'loading';
    try {
        const res = await tdlibSend({
            _: 'searchPublicPosts',
            query: q,
            offset: '',
            limit: 30,
            star_count: starCount,
        } as any) as {
            messages: message[]; next_offset: string;
            search_limits?: publicPostSearchLimits; are_limits_exceeded?: boolean;
        };

        if (res.search_limits) postsLimits.value = res.search_limits;
        if (res.are_limits_exceeded) {
            postsState.value = 'limit-info';
            messageResults.value = [];
            return;
        }

        const list = res.messages || [];
        messageOffset = res.next_offset || '';
        messageHasMore = list.length > 0 && !!res.next_offset;
        messageResults.value = list;
        postsState.value = list.length > 0 ? 'results' : 'empty';

        if (!free && starCount > 0) {
            MessagePlugin.success(t('lng_posts_paid_spent', { count: starCount }).replace(/\*\*/g, ''));
        }

        const chatIds = new Set(list.map(m => m.chat_id));
        for (const cid of chatIds) {
            if (!chatCache.value.has(cid)) {
                void ensureChat(cid).then(() => {
                    const c = getReactiveChat(cid);
                    if (c) chatCache.value.set(cid, c);
                });
            }
        }
    } catch (e: any) {
        console.error('searchPublicPosts failed:', e);
        // Stars 不足等错误：回到限额状态提示
        postsState.value = 'limit-info';
        messageResults.value = [];
        MessagePlugin.warning(e?.message || t('search.searchFailed'));
    }
}

const chatResults = computed(() => chatSections.value.flatMap(s => s.items));

const hasResults = computed(() => {
    if (activeCategory.value === 'posts') {
        return postsState.value === 'results' && messageResults.value.length > 0;
    }
    return isChatCategory.value ? chatResults.value.length > 0 : messageResults.value.length > 0;
});

/** 媒体类分类允许空查询浏览最近内容 */
const allowEmptyQuery = computed(() =>
    activeCategory.value === 'media' || activeCategory.value === 'files'
    || activeCategory.value === 'audio' || activeCategory.value === 'voice');

/** 是否为频道（supergroup + is_channel） */
function isChannelChat(c: chat | Chat): boolean {
    return c.type?._ === 'chatTypeSupergroup' && !!(c.type as any).is_channel;
}

/** 是否为机器人私聊 */
function isBotChat(c: chat | Chat): boolean {
    if (c.type?._ !== 'chatTypePrivate') return false;
    const u = getReactiveUser(c.type.user_id);
    return u?.type?._ === 'userTypeBot';
}

/** 按分类过滤 chat（频道 / 应用） */
function matchCategory(c: chat | Chat): boolean {
    switch (activeCategory.value) {
        case 'channels': return isChannelChat(c);
        case 'apps': return isBotChat(c);
        default: return true;
    }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;
/** 消息搜索 offset（空串首页） */
let messageOffset = '';
let messageHasMore = true;

onMounted(() => {
    void runSearch(false);
});

onUnmounted(() => {
    if (searchTimer) clearTimeout(searchTimer);
});

function switchCategory(id: string) {
    if (activeCategory.value === id) return;
    activeCategory.value = id as SearchCategory;
    void runSearch(false);
}

watch(() => props.query, () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearch(false), 300);
});

watch(activeCategory, () => {
    messageOffset = '';
    messageHasMore = true;
});

// ==================== 搜索执行（对齐 Unigram 分层） ====================
async function runSearch(loadMore: boolean) {
    const q = props.query.trim();
    if (!q && !isChatCategory.value && !allowEmptyQuery.value && activeCategory.value !== 'posts') {
        chatSections.value = [];
        messageResults.value = [];
        return;
    }
    if (loadMore && (loadingMore.value || !messageHasMore)) return;

    const seq = ++searchSeq;
    if (loadMore) {
        loadingMore.value = true;
    } else {
        loading.value = true;
        messageOffset = '';
        messageHasMore = true;
    }

    try {
        if (isChatCategory.value) {
            await runChatSearch(q, seq);
        } else if (activeCategory.value === 'posts') {
            // 帖子：仅刷新限额与状态；真正搜索由用户点击按钮触发（避免误耗免费次数）
            await refreshPostsLimits();
        } else {
            await runMessageSearch(q, loadMore, seq);
        }
    } catch (e) {
        console.error('Search failed:', e);
        if (seq === searchSeq && !loadMore) {
            chatSections.value = [];
            messageResults.value = [];
        }
    } finally {
        if (seq === searchSeq) {
            loading.value = false;
            loadingMore.value = false;
        }
    }
}

/** 把 chat_id 列表解析为 Chat[]（去重、过滤、补全） */
async function resolveChatIds(ids: number[], seen: Set<number>): Promise<Chat[]> {
    const out: Chat[] = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        await ensureChat(id);
        const c = getReactiveChat(id);
        if (!c) continue;
        await ensureChatTypeReady(c);
        if (!matchCategory(c)) continue;
        chatCache.value.set(id, c);
        out.push(c as unknown as Chat);
    }
    return out;
}

/** 私聊判断是否 bot 需要 user 数据；确保已加载 */
async function ensureChatTypeReady(c: chat): Promise<void> {
    if (c.type?._ === 'chatTypePrivate' && activeCategory.value === 'apps') {
        await ensureUser(c.type.user_id);
    }
}

/**
 * 聊天 / 频道 / 应用搜索（对齐 Unigram SearchChats/Channels/WebAppsViewModel）：
 * - 空查询：最近找到 + 常用/推荐
 * - 有关键词：最近 → 本地 searchChats/searchContacts → 服务器 searchChatsOnServer
 *   → 公开 searchPublicChats → 消息 searchMessages
 */
async function runChatSearch(q: string, seq: number) {
    const typeFilter = chatTypeFilter.value;
    const seen = new Set<number>();
    const sections: { key: string; title: string; items: Chat[] }[] = [];
    const push = (key: string, title: string, items: Chat[]) => {
        if (items.length > 0) sections.push({ key, title, items });
    };

    // ---- 空查询：最近 + 常用/推荐 ----
    if (!q) {
        const recentIds = await tdlibSend({
            _: 'searchRecentlyFoundChats', query: '', limit: 50,
        } as any).then((r: any) => r.chat_ids ?? []).catch(() => [] as number[]);
        if (seq !== searchSeq) return;
        push('recent', t('lng_recent_title'), await resolveChatIds(recentIds, seen));

        // 聊天 tab：常用对话；频道 tab：推荐频道；应用 tab：常用 bot
        if (activeCategory.value === 'chats' || activeCategory.value === 'apps') {
            const topCategory = activeCategory.value === 'apps'
                ? { _: 'topChatCategoryBots' } : { _: 'topChatCategoryUsers' };
            const topIds = await tdlibSend({
                _: 'getTopChats', category: topCategory, limit: 30,
            } as any).then((r: any) => r.chat_ids ?? []).catch(() => [] as number[]);
            if (seq !== searchSeq) return;
            push('top', t('lng_recent_frequent'), await resolveChatIds(topIds, seen));
        } else if (activeCategory.value === 'channels') {
            const recIds = await tdlibSend({
                _: 'getRecommendedChats',
            } as any).then((r: any) => r.chat_ids ?? []).catch(() => [] as number[]);
            if (seq !== searchSeq) return;
            push('similar', t('lng_similar_channels_title'), await resolveChatIds(recIds, seen));
        }

        chatSections.value = sections;
        return;
    }

    // ---- 有关键词：多路并发 ----
    const localP = tdlibSend({
        _: 'searchChats', query: q, type_filter: typeFilter, limit: 50,
    } as any).then((r: any) => r.chat_ids ?? []).catch(() => [] as number[]);

    // 联系人：聊天 tab 补充（Unigram ChatsAndContacts 段）
    const contactsP = activeCategory.value === 'chats'
        ? tdlibSend({ _: 'searchContacts', query: q, limit: 50 } as any)
            .then(async (r: any) => {
                const ids: number[] = [];
                for (const uid of (r.user_ids ?? [])) {
                    await ensureUser(uid);
                    // 私聊 chat_id == user_id（TDLib 约定）
                    ids.push(uid);
                }
                return ids;
            }).catch(() => [] as number[])
        : Promise.resolve([] as number[]);

    const serverP = tdlibSend({
        _: 'searchChatsOnServer', query: q, type_filter: typeFilter, limit: 50,
    } as any).then((r: any) => r.chat_ids ?? []).catch(() => [] as number[]);

    const publicP = tdlibSend({
        _: 'searchPublicChats', query: q,
    } as any).then((r: any) => r.chat_ids ?? []).catch(() => [] as number[]);

    // 收藏消息（用户名/标题前缀命中时插入，Unigram LoadSavedMessages）
    const savedP = ((): number[] => {
        if (activeCategory.value !== 'chats') return [];
        const savedTitle = SAVED_MESSAGES_TITLE || 'Saved Messages';
        if (savedTitle.toLowerCase().startsWith(q.toLowerCase()) && userProfile.value?.id) {
            return [userProfile.value.id];
        }
        return [];
    })();

    const [localIds, contactIds, serverIds, publicIds] = await Promise.all([
        localP, contactsP, serverP, publicP,
    ]);
    if (seq !== searchSeq) return;

    // 各段独立去重，段间也去重（保持 Unigram 的段落顺序）
    push('saved', t('lng_saved_messages'), await resolveChatIds(savedP, seen));
    push('local', t('search.chatsAndContacts'), await resolveChatIds([...localIds, ...contactIds], seen));
    push('server', t('search.serverResults'), await resolveChatIds(serverIds, seen));
    push('public', t('lng_search_global_results'), await resolveChatIds(publicIds, seen));

    chatSections.value = sections;
}

/** 媒体 / 文件 / 链接 / 音频 / 语音：searchMessages + 筛选 */
async function runMessageSearch(q: string, loadMore: boolean, seq: number) {
    const filter = messageFilter.value;
    if (!q && !allowEmptyQuery.value) {
        messageResults.value = [];
        return;
    }

    const res = await tdlibSend({
        _: 'searchMessages',
        query: q,
        offset: loadMore ? messageOffset : '',
        limit: 30,
        filter,
    } as any) as { messages: message[]; next_offset: string };

    if (seq !== searchSeq) return;

    const list = res.messages || [];
    messageOffset = res.next_offset || '';
    messageHasMore = list.length > 0 && !!res.next_offset;
    messageResults.value = loadMore ? [...messageResults.value, ...list] : list;

    const chatIds = new Set(list.map(m => m.chat_id));
    for (const cid of chatIds) {
        if (!chatCache.value.has(cid)) {
            void ensureChat(cid).then(() => {
                const c = getReactiveChat(cid);
                if (c) chatCache.value.set(cid, c);
            });
        }
    }
}

/** 滚动到底自动加载更多（消息/帖子） */
function onResultsScroll() {
    if (isChatCategory.value || !messageHasMore || loading.value || loadingMore.value) return;
    const el = resultsEl.value;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
        void runSearch(true);
    }
}

// ==================== 结果展示辅助 ====================
const avatarRadius = computed(() => settings.chatList.avatarCornerRadius);

function isSavedMessages(chat: Chat): boolean {
    return isSavedMessagesChat(chat, userProfile.value?.id);
}

function displayChatTitle(chat: Chat): string {
    if (isSavedMessages(chat)) return SAVED_MESSAGES_TITLE;
    return getChatTitle(chat);
}

function chatSubtitle(chat: Chat): string {
    const type = chat.type;
    if (!type) return '';
    switch (type._) {
        case 'chatTypePrivate': return t('lng_media_auto_private_chats');
        case 'chatTypeSecret': return t('search.secretChat');
        case 'chatTypeBasicGroup': return t('lng_notification_groups');
        case 'chatTypeSupergroup': return (type as any).is_channel ? t('lng_notification_channels') : t('lng_notification_groups');
        default: return '';
    }
}

function resultChat(chatId: number): chat | undefined {
    return chatCache.value.get(chatId) ?? getReactiveChat(chatId);
}

function messagePreview(msg: message): string {
    const text = getMessagePlainText(msg).trim();
    if (text) return text;
    const c = msg.content;
    if (!c) return t('lng_message_empty');
    switch (c._) {
        case 'messagePhoto': return t('lng_in_dlg_photo');
        case 'messageVideo': return t('lng_in_dlg_video');
        case 'messageDocument': return `${t('lng_in_dlg_file')} ${c.document.file_name}`;
        case 'messageAudio': return `${t('lng_in_dlg_audio_file')} ${c.audio.title || c.audio.file_name}`;
        case 'messageVoiceNote': return t('lng_in_dlg_audio');
        case 'messageVideoNote': return t('lng_in_dlg_video_message');
        case 'messageAnimation': return t('lng_media_type_gifs');
        case 'messageSticker': return t('lng_in_dlg_sticker_emoji', { emoji: c.sticker.emoji || '' }).trim();
        case 'messageLocation': return t('lng_location_title');
        case 'messageContact': return t('lng_in_dlg_contact');
        case 'messagePoll': return `${t('lng_in_dlg_poll')} ${c.poll.question.text}`;
        default: return t('lng_message_empty');
    }
}

function formatTime(timestamp: number | undefined): string {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
    }
    return date.toLocaleDateString();
}

// ==================== 选择结果 ====================
function selectChat(chat: Chat) {
    emit('close');
    router.push({
        name: 'chat-detail',
        params: { id: String(chat.id) },
    });
}

function selectMessage(msg: message) {
    emit('close');
    router.push({
        name: 'chat-detail',
        params: { id: String(msg.chat_id) },
        query: { msg: String(msg.id) },
    });
}

// ==================== 样式 ====================
function categoryTabClass(id: string, active: boolean): string {
    return sharedFolderTabClass(settings.folderStyle, id, active);
}

const categoryContainerClass = computed(() => folderTabContainerClass(settings.folderStyle));
</script>

<style scoped>
/* 结果项淡入 */
.chat-list-item {
    animation: search-result-fade-in 0.25s ease both;
}

@keyframes search-result-fade-in {
    from {
        opacity: 0;
        transform: translateY(-6px);
    }

    to {
        opacity: 1;
        transform: none;
    }
}
</style>
