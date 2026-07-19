<template>
    <div v-if="replyData"
        class="flex items-stretch gap-2 mb-1.5 px-2 pt-1.5 cursor-pointer select-none rounded-lg overflow-hidden"
        :class="isSelf ? 'bg-blue-400/20' : 'bg-gray-100 dark:bg-gray-700/50'" @click="jumpToMessage">
        <!-- Left color bar -->
        <div class="w-0.5 shrink-0 rounded-full" :class="barColorClass"></div>

        <div class="flex-1 min-w-0 py-0.5">
            <!-- Sender name -->
            <div class="text-xs font-semibold truncate" :class="isSelf ? 'text-blue-100' : 'text-blue-500'">
                {{ replyData.senderName }}
            </div>
            <!-- Content preview -->
            <div class="text-xs truncate opacity-70 mt-0.5">
                <template v-if="replyData.mediaType">[{{ replyData.mediaType }}] </template>
                {{ replyData.text }}
            </div>
        </div>

        <!-- Media thumbnail -->
        <div v-if="replyData.thumbSrc"
            class="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-300 dark:bg-gray-600">
            <img :src="replyData.thumbSrc" class="w-full h-full object-cover" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { message, MessageContent, messageReplyToMessage } from 'tdlib-types';
import { tdlibSend, isFileReady } from '../../../../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';

const props = defineProps<{
    replyTo: messageReplyToMessage;
    isSelf: boolean;
    chatId?: number;
    /** 当前消息列表，用于在本列表查找被回复的消息 */
    messageList?: message[];
}>();

const emit = defineEmits<{
    jump: [messageId: number];
}>();

interface ReplyDisplayData {
    senderName: string;
    text: string;
    mediaType: string;
    thumbSrc: string | null;
    messageId: number;
}

const replyData = ref<ReplyDisplayData | null>(null);

const barColorClass = computed(() =>
    props.isSelf ? 'bg-blue-200' : 'bg-blue-500'
);

onMounted(async () => {
    await loadReplyData();
});

async function loadReplyData() {
    const rt = props.replyTo;
    if (!rt.chat_id || !rt.message_id) return;

    const targetChatId = rt.chat_id;
    const targetMsgId = rt.message_id;

    // 1. 尝试在本地消息列表中查找
    let foundMsg: message | undefined;
    if (props.messageList) {
        foundMsg = props.messageList.find(m => m.id === targetMsgId && m.chat_id === targetChatId);
    }

    // 2. 如果没找到，通过 TDLib 查找
    if (!foundMsg) {
        try {
            foundMsg = await tdlibSend({
                _: 'getMessage',
                chat_id: targetChatId,
                message_id: targetMsgId,
            }) as any;
        } catch (_) { }
    }

    if (!foundMsg) {
        // 回退显示基本数据
        replyData.value = {
            senderName: '消息',
            text: '',
            mediaType: '',
            thumbSrc: null,
            messageId: targetMsgId,
        };
        return;
    }

    // 提取发送者名称
    let senderName = '未知';
    if (foundMsg.sender_id._ === 'messageSenderUser') {
        try {
            const u = await tdlibSend({ _: 'getUser', user_id: foundMsg.sender_id.user_id }) as any;
            senderName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || '用户';
        } catch (_) { }
    } else if (foundMsg.sender_id._ === 'messageSenderChat') {
        try {
            const c = await tdlibSend({ _: 'getChat', chat_id: foundMsg.sender_id.chat_id }) as any;
            senderName = c.title || '群组';
        } catch (_) { }
    }

    // 提取文本内容和媒体类型
    const content = foundMsg.content;
    const text = getMessageText(content);
    const { mediaType, thumbSrc } = getMediaInfo(content, foundMsg);

    replyData.value = {
        senderName,
        text,
        mediaType,
        thumbSrc,
        messageId: targetMsgId,
    };
}

function getMessageText(content: MessageContent): string {
    if (content._ === 'messageText') return content.text.text;
    if ('caption' in content && content.caption?.text) return content.caption.text;
    return '';
}

function getMediaInfo(content: MessageContent, _msg: message): { mediaType: string; thumbSrc: string | null } {
    let mediaType = '';
    let thumbSrc: string | null = null;

    if (content._ === 'messagePhoto') {
        mediaType = '照片';
        // 尝试获取缩略图
        const sizes = content.photo.sizes;
        if (sizes.length > 0) {
            const smallest = sizes.reduce((a, b) => a.width * a.height < b.width * b.height ? a : b);
            if (isFileReady(smallest.photo)) {
                thumbSrc = convertFileSrc(smallest.photo.local.path);
            }
        }
    } else if (content._ === 'messageVideo') {
        mediaType = '视频';
        const thumb = content.video.thumbnail?.file;
        if (isFileReady(thumb)) {
            thumbSrc = convertFileSrc(thumb.local.path);
        }
    } else if (content._ === 'messageAnimation') {
        mediaType = 'GIF';
        const thumb = content.animation.thumbnail?.file;
        if (isFileReady(thumb)) {
            thumbSrc = convertFileSrc(thumb.local.path);
        }
    } else if (content._ === 'messageDocument') {
        mediaType = '文件';
    } else if (content._ === 'messageAudio') {
        mediaType = '音乐';
    } else if (content._ === 'messageVoiceNote') {
        mediaType = '语音';
    } else if (content._ === 'messageSticker') {
        mediaType = '贴纸';
        if (isFileReady(content.sticker.thumbnail?.file)) {
            thumbSrc = convertFileSrc(content.sticker.thumbnail.file.local.path);
        }
    }

    return { mediaType, thumbSrc };
}

function jumpToMessage() {
    if (replyData.value) {
        emit('jump', replyData.value.messageId);
    }
}
</script>
