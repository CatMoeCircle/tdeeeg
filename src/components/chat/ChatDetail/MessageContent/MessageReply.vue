<template>
    <div v-if="replyData"
        class="flex items-stretch gap-2 mb-1.5 px-2 py-1.5 cursor-pointer select-none rounded-lg overflow-hidden"
        :class="isSelf ? 'bg-blue-400/20' : 'bg-gray-100 dark:bg-gray-700/50'" @click="jumpToMessage">
        <!-- Left color bar -->
        <div class="w-0.5 h-8 self-center shrink-0 rounded-full" :style="barStyle"></div>

        <div class="flex-1 min-w-0 py-0.5">
            <!-- Sender name -->
            <div class="text-xs font-semibold truncate" :class="isSelf ? 'text-gray-900 dark:text-white' : ''"
                :style="senderNameStyle">
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
import { isThumbnailImgRenderable } from '../../../../utils/thumbnail';
import { useColors } from '../../../../store/colors';

const props = defineProps<{
    replyTo: messageReplyToMessage;
    isSelf: boolean;
    chatId?: number;
    /** 当前消息列表，用于在本列表查找被回复的消息 */
    messageList?: message[];
    /** 发送者 accent_color_id，用于回复栏配色 */
    accentColorId?: number;
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

// 主题配色工具
const { accentColorStyle } = useColors();

/** 当前主题下的 accent 样式（无则回退系统蓝） */
const accentStyle = computed(() =>
    typeof props.accentColorId === 'number' ? accentColorStyle(props.accentColorId) : undefined,
);

/** 左色条：自己消息用浅色，他人用 accent 主色 */
const barStyle = computed(() =>
    accentStyle.value ? { backgroundColor: accentStyle.value.color } : undefined,
);

/** 发送者名：他人消息用 accent 文字色 */
const senderNameStyle = computed(() => {
    if (props.isSelf) return undefined;
    if (accentStyle.value) return { color: accentStyle.value.text };
    return { color: 'rgba(59,130,246,1)' }; // 回退蓝色
});

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
            senderName = u.type?._ === 'userTypeDeleted'
                ? '已注销账户'
                : `${u.first_name || ''} ${u.last_name || ''}`.trim() || '用户';
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
        const thumb = content.video.thumbnail;
        if (thumb && isThumbnailImgRenderable(thumb.format) && isFileReady(thumb.file)) {
            thumbSrc = convertFileSrc(thumb.file.local.path);
        }
    } else if (content._ === 'messageAnimation') {
        mediaType = 'GIF';
        // 回复框用 <img> 渲染，仅取静态位图缩略图（GIF/JPEG/PNG/WEBP）；
        // MPEG4/WEBM 动态缩略图无法在 <img> 中显示，回退无图。
        const thumb = content.animation.thumbnail;
        if (thumb && isThumbnailImgRenderable(thumb.format) && isFileReady(thumb.file)) {
            thumbSrc = convertFileSrc(thumb.file.local.path);
        }
    } else if (content._ === 'messageDocument') {
        mediaType = '文件';
    } else if (content._ === 'messageAudio') {
        mediaType = '音乐';
    } else if (content._ === 'messageVoiceNote') {
        mediaType = '语音';
    } else if (content._ === 'messageSticker') {
        mediaType = '贴纸';
        const stickerThumb = content.sticker.thumbnail;
        if (stickerThumb && isThumbnailImgRenderable(stickerThumb.format) && isFileReady(stickerThumb.file)) {
            thumbSrc = convertFileSrc(stickerThumb.file.local.path);
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
