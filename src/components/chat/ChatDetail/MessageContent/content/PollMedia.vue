<template>
    <!-- 顶部：随投票一起显示的媒体（图片 / 动图 / 视频 / 音乐 / 文件 / 贴纸 / 链接 / 位置） -->
    <div v-if="variant === 'top'" class="mb-2">
        <div v-if="imageItem" class="relative overflow-hidden rounded-lg" :style="imageStyle">
            <RichImage :file="imageItem.file" :format="imageItem.format" fill :chat-id="chatId" clickable />
            <span v-if="imageItem.isVideo" class="pointer-events-none absolute inset-0 flex items-center justify-center">
                <PlayIcon class="w-10 h-10 text-white drop-shadow" />
            </span>
        </div>
        <RichAudio v-if="audioMedia" :audio="audioMedia" plain :chat-id="chatId" :message-id="messageId" />
        <MessageFileContent v-if="documentContent" :content="documentContent" :chat-id="chatId"
            :message-id="messageId" />
        <MessageStickerContent v-if="stickerContent" :content="stickerContent" :size="96" />
        <MessageLinkPreview v-if="linkPreview" :preview="linkPreview" :chat-id="chatId" @open="openLink" />
        <a v-if="linkUrl && !linkPreview" :href="linkUrl"
            class="break-all text-sm text-blue-500 hover:underline dark:text-blue-400"
            @click.prevent.stop="openLink(linkUrl)">{{ linkUrl }}</a>
        <div v-if="locationText" class="flex items-center gap-2 text-sm">
            <MapPinIcon class="h-4 w-4 shrink-0 text-red-500" />
            <span class="wrap-break-word">{{ locationText }}</span>
        </div>
    </div>

    <!-- 选项右侧：小图 / 贴纸 / 链接 -->
    <div v-else class="ml-2 shrink-0 self-start">
        <div v-if="imageItem" class="h-12 w-12 overflow-hidden rounded-md">
            <RichImage :file="imageItem.file" :format="imageItem.format" square :chat-id="chatId" />
        </div>
        <MessageStickerContent v-if="stickerContent" :content="stickerContent" :size="48" />
        <button v-if="linkUrl" type="button" :aria-label="linkUrl"
            class="flex h-12 w-12 items-center justify-center rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400"
            @click.stop="openLink(linkUrl)">
            <Link2Icon class="h-5 w-5" />
        </button>
        <!-- 位置 / 地点：与链接同尺寸的定位方块 -->
        <div v-else-if="locationText"
            class="flex h-12 w-12 items-center justify-center rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400">
            <MapPinIcon class="h-5 w-5" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { PollMedia, formattedText, file, ThumbnailFormat, linkPreview, audio, document as TGDocument, messageDocument, messageSticker } from 'tdlib-types';
import { Link2Icon, MapPinIcon, PlayIcon } from 'lucide-vue-next';
import RichImage from '../rich/RichImage.vue';
import RichAudio from '../rich/RichAudio.vue';
import MessageFileContent from './MessageFileContent.vue';
import MessageStickerContent from './MessageStickerContent.vue';
import MessageLinkPreview from './MessageLinkPreview.vue';
import { mediaSizeStyle } from '../../../../../utils/fitMediaSize';
import { resolveInternalLink } from '../../../../../utils/openInternalLink';
import { confirmAndOpenExternalLink } from '../../../../../utils/openExternalLink';

const props = defineProps<{
    media: PollMedia;
    /** top = 投票卡片顶部整宽；thumb = 选项右侧小图 */
    variant?: 'top' | 'thumb';
    chatId?: number;
    messageId?: number;
}>();

const router = useRouter();

const EMPTY_TEXT: formattedText = { _: 'formattedText', text: '', entities: [] };

// ====================媒体归一化（photo / animation / video 走同一缩略图渲染） ====================

type ImageItem = {
    file: file;
    format?: ThumbnailFormat | null;
    width: number;
    height: number;
    /** 视频封面叠播放图标 */
    isVideo: boolean;
};

const imageItem = computed<ImageItem | null>(() => {
    const m = props.media;
    if (m._ === 'pollMediaPhoto' && m.photo.sizes.length) {
        const s = m.photo.sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
        return { file: s.photo, format: undefined, width: s.width, height: s.height, isVideo: false };
    }
    if (m._ === 'pollMediaAnimation' && m.animation.thumbnail?.file) {
        return {
            file: m.animation.thumbnail.file,
            format: m.animation.thumbnail.format,
            width: m.animation.width,
            height: m.animation.height,
            isVideo: false,
        };
    }
    if (m._ === 'pollMediaVideo' && m.video.thumbnail?.file) {
        return {
            file: m.video.thumbnail.file,
            format: m.video.thumbnail.format,
            width: m.video.width,
            height: m.video.height,
            isVideo: true,
        };
    }
    return null;
});

const imageStyle = computed(() =>
    (imageItem.value && mediaSizeStyle(imageItem.value.width, imageItem.value.height)) || undefined);

const audioMedia = computed<audio | undefined>(() =>
    props.media._ === 'pollMediaAudio' ? props.media.audio : undefined);

/** 包装成 messageDocument 复用文件行组件（下载 / 进度 / 打开都现成） */
const documentContent = computed<messageDocument | undefined>(() => {
    if (props.media._ !== 'pollMediaDocument') return undefined;
    return { _: 'messageDocument', document: props.media.document as TGDocument, caption: EMPTY_TEXT };
});

const stickerContent = computed<messageSticker | undefined>(() => {
    if (props.media._ !== 'pollMediaSticker') return undefined;
    return { _: 'messageSticker', sticker: props.media.sticker, is_premium: false };
});

const linkPreview = computed<linkPreview | undefined>(() =>
    props.media._ === 'pollMediaLink' ? props.media.link_preview : undefined);

const linkUrl = computed<string | undefined>(() =>
    props.media._ === 'pollMediaLink' ? props.media.url : undefined);

const locationText = computed(() => {
    const m = props.media;
    if (m._ === 'pollMediaVenue') return m.venue.title;
    if (m._ === 'pollMediaLocation') return `${m.location.latitude}, ${m.location.longitude}`;
    return '';
});

/** 与消息正文一致的通用链接处理：内部链接解析跳转，外部链接先确认 */
async function openLink(href: string) {
    if (href.startsWith('https://t.me/') || href.startsWith('https://proxy.t.me/') || href.startsWith('tg://')) {
        await resolveInternalLink(href, router);
    } else if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        try {
            await confirmAndOpenExternalLink(href);
        } catch {
            /* 用户取消，不跳转 */
        }
    }
}
</script>
