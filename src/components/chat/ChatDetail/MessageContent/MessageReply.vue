<template>
    <div class="flex items-stretch gap-2 mb-1.5 px-2 py-1.5 rounded-lg overflow-hidden select-none"
        :class="status === 'found' ? 'cursor-pointer' : ''" :style="replyBgStyle"
        @click="status === 'found' && jumpToMessage()">
        <!-- Left color bar -->
        <div class="w-0.5 h-8 self-center shrink-0 rounded-full" :style="barStyle"></div>

        <div class="flex-1 min-w-0 py-0.5">
            <!-- 被回复方名称 / 占位文案 -->
            <div class="text-xs font-semibold truncate" :class="isSelf ? 'text-gray-900 dark:text-white' : ''"
                :style="senderNameStyle">
                {{ titleText }}
            </div>
            <!-- 内容预览 -->
            <div class="text-xs truncate opacity-70 mt-0.5">
                <template v-if="status === 'found' && replyData && replyData.mediaType">[{{ replyData.mediaType }}]
                </template>
                {{ status === 'found' && replyData ? replyData.text : subText }}
            </div>
        </div>

        <!-- Media thumbnail -->
        <div v-if="status === 'found' && replyData && replyData.thumbSrc"
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
import { useColors, rgbToCss } from '../../../../store/colors';
import { getSenderAccentColorId } from '../../../../utils/senderInfo';

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

/** 回复目标的加载状态：
 *  - loading：尚未查到消息（正在获取中）
 *  - found：已找到被回复消息
 *  - deleted：被回复消息已被删除 / 无法获取（如 MESSAGE_NOT_FOUND）
 */
type ReplyStatus = 'loading' | 'found' | 'deleted';
const status = ref<ReplyStatus>('loading');

/** 顶部名称/占位文案：已删除显示「消息已被删除」，获取中显示「消息正在获取中」 */
const titleText = computed(() => {
    if (status.value === 'found' && replyData.value) return replyData.value.senderName;
    if (status.value === 'deleted') return '消息已被删除';
    return '消息正在获取中';
});

/** 次级说明文字：删除/获取中时给出补充说明 */
const subText = computed(() => {
    if (status.value === 'deleted') return '该消息已被删除';
    if (status.value === 'loading') return '正在获取消息内容…';
    return '';
});

// 主题配色工具
const { accentColorStyle } = useColors();

/** 被回复（被引用）消息发送者的主题色 id；
 * 回复/引用的左边条与发送者名颜色应使用「被回复方」的颜色，而非回复方。 */
const replyAccentColorId = ref<number | undefined>(undefined);

/** 当前主题下的 accent 样式（优先用被回复方颜色，其次回退到回复方/系统蓝） */
const accentStyle = computed(() => {
    const id = replyAccentColorId.value ?? props.accentColorId;
    return typeof id === 'number' ? accentColorStyle(id) : undefined;
});

/** 左色条：网页风格 diagonal stripes 
 * 单色=纯色，多色=对角斜条纹 repeating-linear-gradient（TDLib 最多 3 色） */
const barStyle = computed(() => {
    if (!accentStyle.value) return undefined;
    const colors = accentStyle.value.allColors;
    if (colors.length <= 1) return { backgroundColor: accentStyle.value.color };
    var SEG = 5;
    var cycle = (colors.length + 1) * SEG;
    var stops = '';
    var pos = 0;
    for (var ci = colors.length - 1; ci >= 0; ci--) {
        var c = colors[ci];
        stops += ', ' + rgbToCss(c) + ' ' + pos + 'px, ' + rgbToCss(c) + ' ' + (pos + SEG) + 'px';
        pos += SEG;
    }
    stops += ', transparent ' + pos + 'px, transparent ' + cycle + 'px';
    return { background: 'repeating-linear-gradient(-45deg' + stops + ')' };
});

/** 回复块背景：被回复方主题色的 10% 透明度底色调（网页版风格）。
 * 仅他人回复有底色+左边条，自己回复仅左边条无底色。 */
const replyBgStyle = computed(() => {
    if (props.isSelf) return undefined;
    if (accentStyle.value) {
        return { backgroundColor: rgbToCss(accentStyle.value.main, 0.1) };
    }
    return undefined;
});

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
    if (!rt.chat_id || !rt.message_id) {
        status.value = 'deleted';
        return;
    }

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
        } catch (e) {
            // 获取失败（如 MESSAGE_NOT_FOUND）通常意味着被回复消息已不存在/被删除
            console.warn('获取被回复消息失败', targetChatId, targetMsgId, e);
            status.value = 'deleted';
            return;
        }
    }

    if (!foundMsg) {
        // 查不到（本地列表与 TDLib 均无）→ 视为已被删除
        status.value = 'deleted';
        return;
    }

    status.value = 'found';

    // 记录被回复发送者的主题色（回复/引用配色用被回复方颜色）
    replyAccentColorId.value = getSenderAccentColorId(foundMsg.sender_id);

    // 提取发送者名称
    let senderName = '未知';
    if (foundMsg.sender_id._ === 'messageSenderUser') {
        try {
            const u = await tdlibSend({ _: 'getUser', user_id: foundMsg.sender_id.user_id }) as any;
            // 若本地缓存未命中，用接口返回的 accent_color_id 补充被回复方主题色
            if (replyAccentColorId.value === undefined && typeof u?.accent_color_id === 'number') {
                replyAccentColorId.value = u.accent_color_id;
            }
            senderName = u.type?._ === 'userTypeDeleted'
                ? '已注销账户'
                : `${u.first_name || ''} ${u.last_name || ''}`.trim() || '用户';
        } catch (_) { }
    } else if (foundMsg.sender_id._ === 'messageSenderChat') {
        try {
            const c = await tdlibSend({ _: 'getChat', chat_id: foundMsg.sender_id.chat_id }) as any;
            if (replyAccentColorId.value === undefined && typeof c?.accent_color_id === 'number') {
                replyAccentColorId.value = c.accent_color_id;
            }
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
