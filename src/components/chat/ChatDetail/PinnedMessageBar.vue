<template>
    <!-- bare：并入顶部统一卡片时去掉自身圆角/底色，由外层卡片提供贴合样式 -->
    <div v-if="pinnedMessages.length > 0 || currentPinned || player.showEntry"
        class="overflow-hidden transition-all duration-200"
        :class="[
            bare
                ? ''
                : 'rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50',
            expanded ? 'max-h-96' : hasPlayer ? 'max-h-32' : 'max-h-14'
        ]">
        <!-- 顶置消息部分 -->
        <template v-if="pinnedMessages.length > 0">
            <!-- 单条顶置消息（折叠态） -->
            <div v-if="!expanded && currentPinned" @click="cyclePinned"
                class="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-gray-100/60 dark:hover:bg-gray-700/60 transition-colors select-none group"
                :class="hasPlayer ? 'rounded-none border-b border-gray-100/50 dark:border-gray-700/30' : (bare ? '' : 'rounded-xl')">
                <!-- 图钉图标 -->
                <div class="shrink-0 w-7 h-7 flex items-center justify-center">
                    <PinIcon v-if="currentPinned.is_pinned" class="w-4 h-4 text-blue-500 rotate-45" />
                    <PinIcon v-else class="w-4 h-4 text-gray-400 rotate-45" />
                </div>
                <!-- 消息预览：标题与正文分两行 -->
                <div class="flex-1 min-w-0 flex flex-col gap-0.5 leading-tight">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-xs font-medium text-blue-500 dark:text-blue-400 leading-tight shrink-0">{{
                            t('lng_pinned_message') }}</span>
                        <!-- 多条置顶时显示当前序号，点击可循环到上一条置顶消息 -->
                        <span v-if="pinnedMessages.length > 1 && currentCycleIndex() >= 0"
                            class="shrink-0 text-[10px] leading-none text-gray-400 dark:text-gray-500 tabular-nums">
                            {{ currentCycleIndex() + 1 }}/{{ pinnedMessages.length }}
                        </span>
                    </div>
                    <!-- 预览只占一行：正文已在 collapsedPreview 里按字数截断并补省略号，
                         这里只做兜底的单行裁切（不依赖 CSS ellipsis，内联表情下它不可靠）。 -->
                    <span v-if="showPreviewText" class="min-w-0 block truncate text-xs text-gray-700 dark:text-gray-300 leading-tight">
                        <FormattedTextInline :key="currentPinned.id" :formattedText="collapsedPreview"
                            :size="12" always-fetch />
                    </span>
                    <span v-else class="min-w-0 block truncate text-xs text-gray-400 dark:text-gray-500 leading-tight">{{
                        bracketTypePreview(messageContentTypeLabel(currentPinned.content._)) }}</span>
                </div>
                <!-- 展开按钮 -->
                <button v-if="pinnedMessages.length > 1" @click.stop="expanded = !expanded"
                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="查看所有顶置消息">
                    <ChevronDownIcon class="w-4 h-4 text-gray-500" />
                </button>
                <!-- 关闭按钮 -->
                <button @click.stop="dismiss"
                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                    :title="t('lng_close')">
                    <XIcon class="w-4 h-4 text-gray-400" />
                </button>
            </div>

            <!-- 顶置消息列表（展开态） -->
            <div v-else-if="expanded" class="px-2 py-2">
                <div class="flex items-center justify-between px-2 mb-1">
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400">{{
                        t('lng_pinned_messages_title', { count: pinnedMessages.length }) }}</span>
                    <button @click="expanded = false"
                        class="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {{ t('lng_polls_votes_collapse') }}
                    </button>
                </div>
                <div class="max-h-80 overflow-y-auto custom-scrollbar">
                    <div v-for="msg in pinnedMessages" :key="msg.id" @click="selectPinned(msg)"
                        class="flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors group">
                        <div class="shrink-0 mt-0.5">
                            <PinIcon class="w-3.5 h-3.5 text-blue-500 rotate-45" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-0.5">
                                <span class="text-xs font-medium text-blue-500 dark:text-blue-400">{{
                                    getMessageSenderName(msg) }}</span>
                                <span class="text-[10px] text-gray-400">{{ formatPinTime(msg.date) }}</span>
                            </div>
                            <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-snug">
                                <FormattedTextInline :key="msg.id" :formattedText="getMessagePreview(msg)"
                                    :size="14" always-fetch />
                            </p>
                        </div>
                        <ChevronRightIcon
                            class="shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            </div>
        </template>

        <!-- 音乐播放器入口（合并到同一卡片，与上方置顶贴合） -->
        <div v-if="player.showEntry"
            :class="pinnedMessages.length > 0 || expanded ? 'border-t border-gray-100/50 dark:border-gray-700/30' : ''">
            <MusicPlayerEntry bare />
        </div>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { ref, watch, computed } from 'vue';
import { PinIcon, ChevronDownIcon, ChevronRightIcon, XIcon } from 'lucide-vue-next';
import { tdlibSend } from '../../../utils/tdlib';
import type { message, formattedText } from 'tdlib-types';
import MusicPlayerEntry from '../../audio/MusicPlayerEntry.vue';
import FormattedTextInline from '../FormattedTextInline.vue';
import {
    messageContentTypeLabel,
    bracketTypePreview,
    musicBracketPreview,
    emojiContentPreview,
} from '../../../utils/messagePreview';
import { useAudioPlayerStore } from '../../../store/audioPlayer';

const props = defineProps<{
    chatId: number | undefined;
    /** 并入顶部统一卡片：去掉自身卡片 chrome，仅保留内容分区 */
    bare?: boolean;
    /** 置顶状态变化时由父组件递增，触发重新拉取 */
    refreshToken?: number;
}>();

const emit = defineEmits<{
    jumpToMessage: [messageId: number];
    visibleChange: [visible: boolean];
}>();

const player = useAudioPlayerStore();
const hasPlayer = computed(() => player.showEntry);

/**
 * 折叠态预览的字数上限：顶部栏必须固定一行高（max-h-14），
 * 预先截断比依赖 CSS ellipsis 更稳定（内联表情是块渲染，ellipsis 不可靠）。
 */
const COLLAPSED_PREVIEW_CHARS = 64;

const pinnedMessages = ref<message[]>([]);
const currentPinned = ref<message | null>(null);
const expanded = ref(false);
/** 本栏上一次点击跳转的目标，即“当前位置”；null 表示本次会话尚未点击过 */
const lastJumpedId = ref<number | null>(null);
/** 拉取代次：避免切换会话/连续置顶时旧请求覆盖新结果 */
let loadSeq = 0;

/**
 * 折叠态预览的正文：按码点限量并补省略号。
 * 截断放在这里而不是 FormattedTextInline，避免每次渲染都按字数重切全部实体。
 */
const collapsedPreview = computed<formattedText>(() => {
    const msg = currentPinned.value;
    if (!msg) return plainText('');
    const ft = getMessagePreview(msg);
    if (!ft.text) return ft;

    // 按码点推进，跳过代理对低位，保证不把 emoji 字符切成两半
    let budget = COLLAPSED_PREVIEW_CHARS - 1;
    let utf16Limit = ft.text.length;
    let truncated = false;
    for (let i = 0; i < ft.text.length; i++) {
        if (budget === 0) {
            utf16Limit = i;
            truncated = true;
            break;
        }
        if (ft.text.codePointAt(i)! > 0xffff) i++;
        budget -= 1;
    }
    if (!truncated) return ft;

    const text = `${ft.text.slice(0, utf16Limit)}…`;
    // 只保留被截断片段内的实体；被截掉的自定义表情不保留实体，原字符自然显示为普通 emoji
    const entities = (ft.entities ?? [])
        .filter(e => e.offset < text.length)
        .map(e => ({ ...e, length: Math.min(e.length, text.length - e.offset) }))
        .filter(e => e.length > 0);
    return { _: 'formattedText', text, entities };
});

/** 预览是否有文字：纯媒体（语音、动图、视频消息等）没有可渲染文本时不走内联渲染 */
const showPreviewText = computed(() => (collapsedPreview.value.text ?? '').trim().length > 0);

/** 获取最新的顶置消息 */
async function fetchLatestPinned(chatIdNum: number) {
    try {
        const result = await tdlibSend({
            _: 'getChatPinnedMessage',
            chat_id: chatIdNum,
        }) as message;
        return result;
    } catch {
        return null;
    }
}

/** 获取所有顶置消息列表 */
async function fetchAllPinned(chatIdNum: number) {
    try {
        const result = await tdlibSend({
            _: 'searchChatMessages',
            chat_id: chatIdNum,
            query: '',
            filter: { _: 'searchMessagesFilterPinned' },
            limit: 50,
            from_message_id: 0,
            offset: 0,
        }) as { messages: message[] };
        return result.messages || [];
    } catch {
        return [];
    }
}

async function loadPinnedMessages(chatIdNum: number | undefined) {
    if (!chatIdNum) {
        pinnedMessages.value = [];
        currentPinned.value = null;
        expanded.value = false;
        loadSeq++;
        return;
    }

    const seq = ++loadSeq;

    // 先并行获取最新顶置消息和所有顶置消息
    const [latest, all] = await Promise.all([
        fetchLatestPinned(chatIdNum),
        fetchAllPinned(chatIdNum),
    ]);

    // 组件已卸载、chatId 已变更，或有更新的拉取发起时，忽略旧结果
    if (seq !== loadSeq || props.chatId !== chatIdNum) return;

    // searchChatMessages 返回逆序（最新的在前），反转成正序
    const list = all.slice().reverse();
    // 搜索可能不可用（如部分秘密聊天）或尚未收录最新一条；至少保证最新置顶可见
    if (latest && !list.some(m => m.id === latest.id)) {
        list.push(latest);
    }

    pinnedMessages.value = list;
    currentPinned.value = latest ?? (list.length > 0 ? list[list.length - 1] : null);
    if (pinnedMessages.value.length <= 1) expanded.value = false;
    // 上次点击的置顶消息已被取消置顶时，重置位置
    if (lastJumpedId.value !== null && !list.some(m => m.id === lastJumpedId.value)) lastJumpedId.value = null;
    // 通知父组件可见性变化
    const visible = pinnedMessages.value.length > 0 || !!currentPinned.value || player.showEntry;
    emit('visibleChange', visible);
}

function jumpToMessage(messageId: number) {
    expanded.value = false;
    emit('jumpToMessage', messageId);
}

/**
 * 展开列表里点选某条置顶：被选中的那条要成为折叠态的预览，
 * 同时把它记为「当前位置」，序号与后续循环都从这里继续。
 */
function selectPinned(msg: message) {
    lastJumpedId.value = msg.id;
    currentPinned.value = msg;
    jumpToMessage(msg.id);
}

/**
 * 当前所在位置的下标（列表按消息时间正序：0 为最旧一条，末尾为最新一条）。
 * -1 表示本次会话还没有点过。
 *
 * 必须用普通函数而不是 computed：computed 只在其响应式依赖变化时重算，
 * 而「上次点击哪条」与列表替换并不同步，缓存会锁死在旧值上（曾导致永远停在第一条）。
 */
function currentCycleIndex(): number {
    const id = lastJumpedId.value;
    if (id === null) return -1;
    return pinnedMessages.value.findIndex(m => m.id === id);
}

/**
 * 折叠态点击：按时间顺序向上走一条（消息更旧、聊天中更靠上）。
 * 停在「最顶上一条」（索引 0）时再点，直接回到「最下面一条」（索引末尾），如此循环。
 *
 * -1 表示尚未点击过：必须与「已在最顶上」（0）区分开，
 * 否则首次点击会走到末尾（最下面），方向就反了。
 *
 * 预览内容必须跟着切换：currentPinned 只用来渲染预览，不承担「当前滚动位置」，
 * 所以这里同步更新它，切置顶时顶栏文案会立刻变化。
 */
function cyclePinned() {
    const list = pinnedMessages.value;
    if (list.length === 0) return;
    const index = currentCycleIndex();
    // -1：首次点击 → 最旧一条；0：已在最顶上 → 回到最下面；其余 → 继续往上
    const next = index < 0 ? 0 : (index - 1 + list.length) % list.length;
    lastJumpedId.value = list[next].id;
    currentPinned.value = list[next];
    jumpToMessage(list[next].id);
}

function dismiss() {
    currentPinned.value = null;
    pinnedMessages.value = [];
    expanded.value = false;
    emit('visibleChange', false);
}

/** 构造仅含纯文本的 formattedText（与 ChatList 预览一致） */
function plainText(text: string): formattedText {
    return { _: 'formattedText', text, entities: [] };
}

/** 在 formattedText 前拼接纯文本前缀，并平移实体 offset（UTF-16 码元，与 slice 一致） */
function withPrefix(prefix: string, ft: formattedText): formattedText {
    const offset = prefix.length;
    return {
        _: 'formattedText',
        text: prefix + ft.text,
        entities: (ft.entities ?? []).map(e => ({ ...e, offset: e.offset + offset })),
    };
}

/** 媒体 caption 预览：`[类型] caption` 保留实体（自定义 emoji / 剧透），无 caption 时仅类型标签 */
function captionPreview(label: string, caption?: formattedText | null): formattedText {
    if (caption?.text?.trim()) return withPrefix(`${bracketTypePreview(label)} `, caption);
    return plainText(bracketTypePreview(label));
}

/**
 * 置顶栏消息预览：返回 formattedText，
 * 由 FormattedTextInline 渲染以保留 textEntityTypeCustomEmoji（自定义 emoji）等实体。
 */
function getMessagePreview(msg: message): formattedText {
    const c = msg.content;
    switch (c._) {
        case 'messageText':
            return c.text?.text ? c.text : plainText(bracketTypePreview(messageContentTypeLabel('')));
        case 'messagePhoto':
            return captionPreview(messageContentTypeLabel('messagePhoto'), c.caption);
        case 'messageVideo':
            return captionPreview(messageContentTypeLabel('messageVideo'), c.caption);
        case 'messageAnimation':
            return captionPreview(messageContentTypeLabel('messageAnimation'), c.caption);
        case 'messageDocument':
            // 有 caption 时保留实体（自定义 emoji），否则显示文件名
            return c.caption?.text?.trim()
                ? captionPreview(messageContentTypeLabel('messageDocument'), c.caption)
                : plainText(bracketTypePreview(messageContentTypeLabel('messageDocument'), c.document.file_name));
        case 'messageSticker':
            return plainText(emojiContentPreview(c) ?? bracketTypePreview(messageContentTypeLabel('messageSticker')));
        case 'messageVoiceNote':
            return plainText(bracketTypePreview(messageContentTypeLabel('messageVoiceNote')));
        case 'messageVideoNote':
            return plainText(bracketTypePreview(messageContentTypeLabel('messageVideoNote')));
        case 'messageAudio':
            return plainText(musicBracketPreview(c.audio.title, c.audio.performer)
                || bracketTypePreview(messageContentTypeLabel('messageAudio')));
        case 'messagePoll':
            return plainText(bracketTypePreview(messageContentTypeLabel('messagePoll')));
        case 'messageLocation':
            return plainText(bracketTypePreview(messageContentTypeLabel('messageLocation')));
        case 'messageContact':
            return plainText(bracketTypePreview(messageContentTypeLabel('messageContact')));
        case 'messageDice':
            // 骰子 / 老虎机等：只显示骰子 emoji（🎲），不显示点数
            return plainText(emojiContentPreview(c) ?? bracketTypePreview(messageContentTypeLabel('messageDice')));
        // 单条大号动画表情：正文就是该表情本身，显示 emoji 而不是「[Message]」
        case 'messageAnimatedEmoji':
            return plainText(emojiContentPreview(c) ?? c.emoji);
        case 'messageGame':
            return plainText(bracketTypePreview(messageContentTypeLabel('messageGame')));
        case 'messagePinMessage':
            return plainText(t('lng_action_pinned_message', { from: '', text: '' }));
        default:
            return plainText(bracketTypePreview(messageContentTypeLabel('')));
    }
}

function getMessageSenderName(msg: message): string {
    if (msg.sender_id._ === 'messageSenderUser') return t('preview.user');
    if (msg.sender_id._ === 'messageSenderChat') return t('lng_notification_channels');
    return t('preview.unknown');
}

function formatPinTime(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

watch(() => props.chatId, (newId) => {
    expanded.value = false;
    // 切换会话先清空：否则旧会话的置顶消息会残留显示到新会话，直到 fetch 返回
    pinnedMessages.value = [];
    currentPinned.value = null;
    lastJumpedId.value = null;
    loadPinnedMessages(newId);
}, { immediate: true });

// 同一会话内置顶/取消置顶：由 updateMessageIsPinned 驱动父组件递增 token
watch(() => props.refreshToken, () => {
    if (props.chatId === undefined) return;
    void loadPinnedMessages(props.chatId);
});
</script>

<style scoped>
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* 折叠态预览：自定义 emoji 是 inline-flex 块盒，默认基线对齐会让行盒底边下沉、顶栏变高；
   这里把表情盒底边下压一点，让文字基线与表情底边对齐，顶栏高度保持稳定 */
:deep(.fts-emoji-box) {
    vertical-align: -0.25em;
}
</style>
