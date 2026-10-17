<template>
    <div class="min-w-0 w-full max-w-full overflow-hidden" :class="borderRadiusClass">
        <!-- 文件行：每个文件一条，多选模式下按单个文件独立选中 -->
        <div class="flex flex-col">
            <div v-for="(msg, idx) in messages" :key="msg.id"
                class="relative min-w-0 w-full max-w-full"
                :class="{ 'cursor-pointer': selectionMode }"
                @click.stop="onFileClick(msg)"
                @contextmenu.prevent.stop="onFileContextMenu($event, idx)">
                <div v-if="selectionMode"
                    class="absolute right-1 top-1.5 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center pointer-events-none select-none"
                    :class="isSelected(msg.id) ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'">
                    <CheckIcon v-if="isSelected(msg.id)" class="w-3.5 h-3.5 text-white" />
                </div>
                <MessageFileContent :content="fileContentOf(msg)" :chat-id="chatId" :message-id="msg.id"
                    :show-caption="false" />
            </div>
        </div>
        <!-- 相册描述（仅当恰好一条媒体带非空描述时显示） -->
        <div v-if="captionText" class="px-2 pt-1.5 msg-body-text">
            <MessageTextContent :formattedText="captionFormatted" :chatId="chatId" />
        </div>
        <!-- Reactions slot（caption 与时间之间） -->
        <slot name="reactions" />
        <!-- 时间状态：文件相册始终带气泡，时间固定在底部 -->
        <span class="block text-right px-2 pb-1" :class="isSelf ? 'text-black/50' : 'text-gray-400'">
            <MessageStatus :date="lastDate" :isOutgoing="isSelf" :sendingState="lastSendingState" :isRead="isRead"
                :viewCount="lastViewCount" :authorSignature="authorSignature" />
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CheckIcon } from 'lucide-vue-next';
import type { formattedText, message, messageAudio, messageDocument } from 'tdlib-types';
import MessageFileContent from './MessageFileContent.vue';
import MessageStatus from './MessageStatus.vue';
import MessageTextContent from './MessageTextContent.vue';

const props = defineProps<{
    messages: message[];
    isSelf: boolean;
    chatId?: number;
    /** 话题 ID（与 MessageAlbum 保持相同的 props 形状，便于动态组件复用） */
    topicId?: number;
    authorSignature?: string;
    isRead?: boolean;
    /** 气泡底部是否显示频道评论条：需要压平下缘圆角承接评论白条 */
    commentsBar?: boolean;
    /** 多选模式：每个文件各自独立选中 */
    selectionMode?: boolean;
    /** 已选中的消息 id（多选模式下用于标记每个文件） */
    selectedIds?: number[];
}>();

const emit = defineEmits<{
    (e: 'toggleSelect', msgId: number): void;
    (e: 'messageContextMenu', msg: message, x: number, y: number): void;
}>();

/** 文件相册中的消息一定为文档或音频（分组时已保证），这里做类型收窄 */
function fileContentOf(msg: message): messageDocument | messageAudio {
    return msg.content as messageDocument | messageAudio;
}

function isSelected(msgId: number): boolean {
    return props.selectionMode === true && (props.selectedIds ?? []).includes(msgId);
}

function onFileClick(msg: message) {
    if (props.selectionMode) {
        emit('toggleSelect', msg.id);
    }
}

function onFileContextMenu(e: MouseEvent, idx: number) {
    const msg = props.messages[idx];
    if (!msg) return;
    emit('messageContextMenu', msg, e.clientX, e.clientY);
}

// 相册描述显示规则与 MessageAlbum 一致：仅当恰好一条媒体带非空描述时才显示。
const captionedMessages = computed(() =>
    props.messages.filter((m) => {
        const c = m.content;
        return 'caption' in c && !!c.caption?.text;
    }),
);

const captionFormatted = computed<formattedText>(() => {
    if (captionedMessages.value.length !== 1) {
        return { _: 'formattedText', text: '', entities: [] };
    }
    const content = captionedMessages.value[0].content;
    const cap = (content as messageDocument | messageAudio).caption;
    return cap || { _: 'formattedText', text: '', entities: [] };
});

const captionText = computed(() => captionFormatted.value.text);

const borderRadiusClass = computed(() => {
    if (props.isSelf) {
        return props.commentsBar ? 'rounded-lg rounded-tr-none rounded-b-none' : 'rounded-lg rounded-tr-none';
    }
    return props.commentsBar ? 'rounded-lg rounded-tl-none rounded-b-none' : 'rounded-lg rounded-tl-none';
});

const lastMsg = computed(() => props.messages[props.messages.length - 1]);
const lastDate = computed(() => lastMsg.value?.date || 0);
const lastSendingState = computed(() => lastMsg.value?.sending_state);
const lastViewCount = computed(() => lastMsg.value?.interaction_info?.view_count);
</script>
