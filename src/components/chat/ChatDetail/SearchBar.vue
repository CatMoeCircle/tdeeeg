<template>
    <div class="absolute top-0 left-0 right-0 z-20">
        <!-- ===== 搜索栏 ===== -->
        <div
            class="h-16 flex items-center gap-2 px-4 bg-white/95 dark:bg-[#1c1c1c]/90 backdrop-blur-lg border-b border-gray-200/60 dark:border-gray-800/60">
            <!-- 上下跳转器（左右结构） -->
            <div class="flex items-center gap-0.5 shrink-0">
                <button type="button" aria-label="上一个结果"
                    class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
                    :disabled="!canPrev" @click="goPrev">
                    <ChevronLeftIcon class="w-5 h-5" />
                </button>
                <button type="button" aria-label="下一个结果"
                    class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
                    :disabled="!canNext" @click="goNext">
                    <ChevronRightIcon class="w-5 h-5" />
                </button>
            </div>

            <!-- 搜索框 -->
            <div class="relative flex-1">
                <SearchIcon
                    class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input ref="inputEl" v-model="query" type="text" placeholder="搜索"
                    class="w-full h-9 pl-9 pr-10 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    @keydown.enter="onEnter" @keydown.esc="emit('close')" />
                <!-- 收起/展开结果面板箭头 -->
                <button v-if="hasQuery" type="button" aria-label="收起搜索结果"
                    class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    @click="resultsOpen = !resultsOpen">
                    <ChevronUpIcon v-if="resultsOpen" class="w-4 h-4" />
                    <ChevronDownIcon v-else class="w-4 h-4" />
                </button>
            </div>

            <!-- 用户筛选 -->
            <button type="button" aria-label="按发送者筛选"
                class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-colors"
                :class="senderFilter
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
                @click="toggleSenderPanel">
                <UserIcon class="w-5 h-5" />
            </button>

            <!-- 关闭 -->
            <button type="button" aria-label="关闭搜索"
                class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="emit('close')">
                <XIcon class="w-6 h-6" />
            </button>
        </div>

        <!-- ===== 发送者筛选面板 ===== -->
        <Transition name="search-drop">
            <div v-if="showSenderPanel"
                class="absolute top-full right-3 min-w-56 max-w-[80%] mt-1 rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
                <button type="button"
                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    @click="setSenderFilter(null)">
                    <div
                        class="w-8 h-8 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <CheckIcon v-if="!senderFilter" class="w-4 h-4 text-blue-500" />
                    </div>
                    <span class="truncate flex-1">全部消息</span>
                </button>
                <button v-for="m in senderOptions" :key="senderKey(m)" type="button"
                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    @click="setSenderFilter(senderInput(m))">
                    <Avatar :photo="senderPhoto(m)" :title="senderName(m)" :accentColorId="senderAccent(m)"
                        :deletedAccount="senderDeleted(m)" sizeClass="!w-8 !h-8" class="shrink-0" />
                    <span class="truncate flex-1">{{ senderName(m) }}</span>
                    <CheckIcon v-if="isSenderSelected(m)" class="w-4 h-4 text-blue-500 shrink-0" />
                </button>
            </div>
        </Transition>

        <!-- ===== 搜索结果面板 ===== -->
        <div v-if="showResults" ref="resultsEl"
            class="absolute top-full inset-x-0 mt-1 bg-white dark:bg-gray-800 shadow-xl border-t border-gray-200 dark:border-gray-700 max-h-[60vh] overflow-y-auto custom-scrollbar"
            @scroll.passive="onResultsScroll">
            <div v-if="results.length === 0" class="px-4 py-3 text-sm text-center text-gray-400">
                {{ loading ? '搜索中...' : '无结果' }}
            </div>
            <template v-else>
                <button v-for="(msg, i) in results" :key="msg.id" type="button"
                    class="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors"
                    :class="i === activeIndex ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'"
                    @click="selectResult(i)">
                    <Avatar :photo="resultSenderPhoto(msg)" :title="resultSenderName(msg)"
                        :accentColorId="resultSenderAccent(msg)" :deletedAccount="resultSenderDeleted(msg)"
                        sizeClass="!w-8 !h-8" class="mt-0.5 shrink-0" />
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-blue-500 dark:text-blue-400 truncate">{{
                                resultSenderName(msg) }}</span>
                            <span class="text-xs text-gray-400 shrink-0">{{ formatDateLabel(msg.date) }}</span>
                        </div>
                        <p class="text-sm text-gray-700 dark:text-gray-200 truncate">{{ previewText(msg) }}</p>
                    </div>
                </button>
                <div v-if="loadingMore" class="px-4 py-2 text-xs text-center text-gray-400">加载更多...</div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { SearchIcon, XIcon, ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, UserIcon, CheckIcon } from 'lucide-vue-next';
import type { message, chat, MessageSender, MessageSender$Input, chatMember } from 'tdlib-types';
import { tdlibSend } from '../../../utils/tdlib';
import { getMessagePlainText } from '../../../utils/messageText';
import {
    getSenderName, getSenderPhoto, getSenderProfileAccentColorId, isDeletedSender, ensureSenderLoaded,
} from '../../../utils/senderInfo';
import { formatDateLabel } from './composables/dateLabel';
import Avatar from '../avatar.vue';

const props = defineProps<{
    chatId?: number | null;
    topicId?: number | null;
    chat?: chat;
}>();

const emit = defineEmits<{
    close: [];
    jump: [messageId: number];
}>();

const query = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const resultsEl = ref<HTMLElement | null>(null);

const results = ref<message[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(false);
let fromMessageId = 0;

const activeIndex = ref(-1);
const showSenderPanel = ref(false);
const resultsOpen = ref(false);
const senderOptions = ref<MessageSender[]>([]);
const senderFilter = ref<MessageSender$Input | null>(null);

const hasQuery = computed(() => query.value.trim() !== '' || !!senderFilter.value);
const showResults = computed(() => resultsOpen.value && hasQuery.value);
const canPrev = computed(() => activeIndex.value > 0);
const canNext = computed(() => activeIndex.value < results.value.length - 1);

let searchSeq = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
    loadSenderOptions();
    nextTick(() => inputEl.value?.focus());
});

watch([query, senderFilter], () => {
    resultsOpen.value = true;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        void doSearch();
    }, 250);
});

/** 执行搜索（more=true 为翻页加载更多） */
async function doSearch(more = false) {
    if (!props.chatId) return;
    const q = query.value.trim();
    if (!q && !senderFilter.value) return;

    const seq = ++searchSeq;
    if (more) {
        if (loadingMore.value || !hasMore.value) return;
        loadingMore.value = true;
    } else {
        loading.value = true;
        results.value = [];
        fromMessageId = 0;
        activeIndex.value = -1;
    }

    try {
        const res = await tdlibSend({
            _: 'searchChatMessages',
            chat_id: props.chatId,
            topic_id: props.topicId ? { _: 'messageTopicForum', forum_topic_id: props.topicId } : undefined,
            query: q,
            sender_id: senderFilter.value ?? undefined,
            from_message_id: fromMessageId,
            offset: 0,
            limit: 40,
        }) as { messages: message[]; next_from_message_id: number };

        if (seq !== searchSeq) return;

        const msgs = res.messages ?? [];
        await Promise.all(msgs.map(m => ensureSenderLoaded(m.sender_id)));
        if (seq !== searchSeq) return;

        if (more) {
            results.value = [...results.value, ...msgs];
        } else {
            results.value = msgs;
        }
        fromMessageId = res.next_from_message_id || (msgs.length > 0 ? msgs[msgs.length - 1].id : 0);
        hasMore.value = msgs.length >= 40 && !!res.next_from_message_id;
    } catch (e) {
        console.error('Failed to search messages', e);
    } finally {
        if (seq === searchSeq) {
            loading.value = false;
            loadingMore.value = false;
        }
    }
}

/** 结果滚动到底部时加载更多 */
function onResultsScroll() {
    const el = resultsEl.value;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        void doSearch(true);
    }
}

/** 加载发送者筛选候选：私聊取对方，群组/频道用 searchChatMembers */
async function loadSenderOptions() {
    if (!props.chatId) return;
    const c = props.chat;
    if (c && (c.type._ === 'chatTypePrivate' || c.type._ === 'chatTypeSecret')) {
        const uid = c.type.user_id;
        senderOptions.value = [{ _: 'messageSenderUser', user_id: uid }];
        await ensureSenderLoaded(senderOptions.value[0]);
        return;
    }
    try {
        const res = await tdlibSend({
            _: 'searchChatMembers',
            chat_id: props.chatId,
            query: '',
            limit: 100,
            filter: { _: 'chatMembersFilterMembers' },
        }) as { members: chatMember[] };
        const senders = res.members?.map(m => m.member_id) ?? [];
        senderOptions.value = senders;
        await Promise.all(senders.map(s => ensureSenderLoaded(s)));
    } catch (e) {
        console.error('Failed to load chat members', e);
        senderOptions.value = [];
    }
}

function toggleSenderPanel() {
    showSenderPanel.value = !showSenderPanel.value;
}

function setSenderFilter(sender: MessageSender$Input | null) {
    senderFilter.value = sender;
    showSenderPanel.value = false;
}

function senderKey(s: MessageSender): string {
    return s._ === 'messageSenderUser' ? `u${s.user_id}` : `c${s.chat_id}`;
}

function senderInput(s: MessageSender): MessageSender$Input {
    return s._ === 'messageSenderUser'
        ? { _: 'messageSenderUser', user_id: s.user_id }
        : { _: 'messageSenderChat', chat_id: s.chat_id };
}

function isSenderSelected(s: MessageSender): boolean {
    const f = senderFilter.value;
    if (!f) return false;
    if (s._ === 'messageSenderUser') {
        return f._ === 'messageSenderUser' && f.user_id === s.user_id;
    }
    return f._ === 'messageSenderChat' && f.chat_id === s.chat_id;
}

function senderName(s: MessageSender): string {
    return getSenderName(s);
}

function senderPhoto(s: MessageSender) {
    return getSenderPhoto(s);
}

function senderAccent(s: MessageSender): number | undefined {
    return getSenderProfileAccentColorId(s);
}

function senderDeleted(s: MessageSender): boolean {
    return isDeletedSender(s);
}

function resultSenderName(msg: message): string {
    return getSenderName(msg.sender_id);
}

function resultSenderPhoto(msg: message) {
    return getSenderPhoto(msg.sender_id);
}

function resultSenderAccent(msg: message): number | undefined {
    return getSenderProfileAccentColorId(msg.sender_id);
}

function resultSenderDeleted(msg: message): boolean {
    return isDeletedSender(msg.sender_id);
}

/** 结果预览文本：无文本时用内容类型占位 */
function previewText(msg: message): string {
    const text = getMessagePlainText(msg).trim();
    if (text) return text;
    switch (msg.content._) {
        case 'messagePhoto': return '图片';
        case 'messageVideo': return '视频';
        case 'messageAnimation': return '动画';
        case 'messageAudio': return '音频';
        case 'messageVoiceNote': return '语音';
        case 'messageVideoNote': return '视频消息';
        case 'messageDocument': return '文件';
        case 'messageSticker': return '贴纸';
        case 'messageLocation': return '位置';
        case 'messageContact': return '联系人';
        case 'messagePoll': return '投票';
        case 'messageCall': return msg.content.is_video ? '视频通话' : '语音通话';
        default: return '消息';
    }
}

function selectResult(i: number) {
    activeIndex.value = i;
    const msg = results.value[i];
    if (msg) emit('jump', msg.id);
}

function goNext() {
    if (!canNext.value) {
        if (hasMore.value) void doSearch(true);
        return;
    }
    activeIndex.value++;
    emitJumpAndScroll();
}

function goPrev() {
    if (!canPrev.value) return;
    activeIndex.value--;
    emitJumpAndScroll();
}

function emitJumpAndScroll() {
    const msg = results.value[activeIndex.value];
    if (msg) emit('jump', msg.id);
    const el = resultsEl.value;
    const item = el?.children[activeIndex.value] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
}

function onEnter() {
    if (!results.value.length) return;
    if (activeIndex.value < 0) activeIndex.value = 0;
    emitJumpAndScroll();
}
</script>

<style scoped>
.search-drop-enter-active,
.search-drop-leave-active {
    transition: opacity 0.12s ease, transform 0.12s ease;
}

.search-drop-enter-from,
.search-drop-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
</style>