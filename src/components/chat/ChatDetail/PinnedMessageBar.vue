<template>
    <div v-if="pinnedMessages.length > 0 || player.showEntry"
        class="rounded-xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden transition-all duration-200"
        :class="expanded ? 'max-h-96' : hasPlayer ? 'max-h-32' : 'max-h-14'">
        <!-- 顶置消息部分 -->
        <template v-if="pinnedMessages.length > 0">
            <!-- 单条顶置消息（折叠态） -->
            <div v-if="!expanded && currentPinned" @click="jumpToMessage(currentPinned.id)"
                class="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-gray-100/60 dark:hover:bg-gray-700/60 transition-colors select-none group"
                :class="hasPlayer ? 'rounded-none border-b border-gray-100/50 dark:border-gray-700/30' : 'rounded-xl'">
                <!-- 图钉图标 -->
                <div class="shrink-0 w-7 h-7 flex items-center justify-center">
                    <PinIcon v-if="currentPinned.is_pinned" class="w-4 h-4 text-blue-500 rotate-45" />
                    <PinIcon v-else class="w-4 h-4 text-gray-400 rotate-45" />
                </div>
                <!-- 消息预览 -->
                <div class="flex-1 min-w-0 flex items-center gap-2">
                    <span class="text-xs font-medium text-blue-500 dark:text-blue-400 shrink-0">顶置消息</span>
                    <span class="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                        <GlobalEmojiText :text="getMessagePreview(currentPinned)" :size="14" />
                    </span>
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
                    title="关闭">
                    <XIcon class="w-4 h-4 text-gray-400" />
                </button>
            </div>

            <!-- 顶置消息列表（展开态） -->
            <div v-else-if="expanded" class="px-2 py-2">
                <div class="flex items-center justify-between px-2 mb-1">
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400">顶置消息 ({{ pinnedMessages.length
                    }})</span>
                    <button @click="expanded = false"
                        class="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        收起
                    </button>
                </div>
                <div class="max-h-80 overflow-y-auto custom-scrollbar">
                    <div v-for="msg in pinnedMessages" :key="msg.id" @click="jumpToMessage(msg.id)"
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
                                <GlobalEmojiText :text="getMessagePreview(msg)" :size="14" />
                            </p>
                        </div>
                        <ChevronRightIcon
                            class="shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            </div>
        </template>

        <!-- 音乐播放器入口（合并到同一卡片） -->
        <div v-if="player.showEntry" class="border-t border-gray-100/50 dark:border-gray-700/30"
            :class="{ 'rounded-b-xl': pinnedMessages.length > 0 }">
            <MusicPlayerEntry bare />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { PinIcon, ChevronDownIcon, ChevronRightIcon, XIcon } from 'lucide-vue-next';
import { tdlibSend } from '../../../utils/tdlib';
import type { message } from 'tdlib-types';
import MusicPlayerEntry from '../../audio/MusicPlayerEntry.vue';
import GlobalEmojiText from '../../common/GlobalEmojiText.vue';
import { useAudioPlayerStore } from '../../../store/audioPlayer';

const props = defineProps<{
    chatId: number | undefined;
}>();

const emit = defineEmits<{
    jumpToMessage: [messageId: number];
    visibleChange: [visible: boolean];
}>();

const player = useAudioPlayerStore();
const hasPlayer = computed(() => player.showEntry);

const pinnedMessages = ref<message[]>([]);
const currentPinned = ref<message | null>(null);
const expanded = ref(false);
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
        return;
    }

    // 先并行获取最新顶置消息和所有顶置消息
    const [latest, all] = await Promise.all([
        fetchLatestPinned(chatIdNum),
        fetchAllPinned(chatIdNum),
    ]);

    // 如果组件已卸载或 chatId 已变更，忽略结果
    if (props.chatId !== chatIdNum) return;

    currentPinned.value = latest;
    // searchChatMessages 返回逆序（最新的在前），反转成正序
    pinnedMessages.value = all.reverse();

    // 通知父组件可见性变化
    const visible = pinnedMessages.value.length > 0 || player.showEntry;
    emit('visibleChange', visible);
}

function jumpToMessage(messageId: number) {
    expanded.value = false;
    emit('jumpToMessage', messageId);
}

function dismiss() {
    currentPinned.value = null;
    pinnedMessages.value = [];
    expanded.value = false;
    emit('visibleChange', false);
}

function getMessagePreview(msg: message): string {
    const c = msg.content;
    switch (c._) {
        case 'messageText':
            return c.text?.text || '[消息]';
        case 'messagePhoto':
            return (c.caption?.text || '') ? `[图片] ${c.caption.text}` : '[图片]';
        case 'messageVideo':
            return (c.caption?.text || '') ? `[视频] ${c.caption.text}` : '[视频]';
        case 'messageAnimation':
            return (c.caption?.text || '') ? `[动画] ${c.caption.text}` : '[动画]';
        case 'messageSticker':
            return '[贴纸]';
        case 'messageVoiceNote':
            return '[语音]';
        case 'messageVideoNote':
            return '[视频留言]';
        case 'messageAudio':
            return `[音乐] ${c.audio.title || ''} ${c.audio.performer || ''}`.trim() || '[音乐]';
        case 'messageDocument':
            return `[文件] ${c.document.file_name || ''}`.trim() || '[文件]';
        case 'messagePoll':
            return '[投票]';
        case 'messageLocation':
            return '[位置]';
        case 'messageContact':
            return '[联系人]';
        case 'messageDice':
            return '[骰子]';
        case 'messageGame':
            return '[游戏]';
        case 'messagePinMessage':
            return '顶置了一条消息';
        default:
            return '[消息]';
    }
}

function getMessageSenderName(msg: message): string {
    if (msg.sender_id._ === 'messageSenderUser') return '用户';
    if (msg.sender_id._ === 'messageSenderChat') return '频道';
    return '未知';
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
    loadPinnedMessages(newId);
}, { immediate: true });
</script>

<style scoped>
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
