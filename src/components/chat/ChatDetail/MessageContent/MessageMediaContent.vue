<template>
    <div class="message-media relative">
        <!-- Forward header -->
        <div v-if="forwardInfo" class="forward-header px-2 pt-2 pb-1 flex items-center gap-1">
            <CornerUpRightIcon class="w-3.5 h-3.5 shrink-0" :class="isSelf ? 'text-blue-200' : 'text-blue-400'" />
            <span class="text-xs font-medium truncate" :class="isSelf ? 'text-blue-200' : 'text-blue-500'">
                {{ forwardFromText }}
            </span>
        </div>

        <!-- Caption above media -->
        <div v-if="showCaptionAbove && captionText" class="caption-text px-2 pt-2 pb-1">
            <p class="text-sm whitespace-pre-wrap break-all"
                :class="isSelf ? 'text-white' : 'text-gray-800 dark:text-gray-200'">
                {{ captionText }}
            </p>
        </div>

        <!-- Media element -->
        <div class="media-wrapper relative" :class="{ 'px-2 pb-2': !captionBelow }">
            <!-- Photo -->
            <img v-if="content._ === 'messagePhoto' && mediaSrc" :src="mediaSrc"
                class="w-full h-auto cursor-pointer select-none"
                :class="[borderRadiusClass, hasSpoiler ? 'blur-md' : '']" @click="previewMedia" @load="onMediaLoaded" />
            <div v-else-if="content._ === 'messagePhoto' && !mediaSrc"
                class="w-full aspect-square bg-gray-200 dark:bg-gray-700 flex items-center justify-center animate-pulse"
                :class="borderRadiusClass">
                <span class="text-xs text-gray-500">Loading Photo...</span>
            </div>

            <!-- Video -->
            <video v-else-if="content._ === 'messageVideo' && mediaSrc" :src="mediaSrc" controls class="w-full h-auto"
                :class="[borderRadiusClass, hasSpoiler ? 'blur-md' : '']" @click="previewMedia"></video>
            <div v-else-if="content._ === 'messageVideo' && !mediaSrc"
                class="w-full aspect-video bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
                :class="borderRadiusClass">
                <span class="text-xs text-gray-500">Video</span>
            </div>

            <!-- Animation (GIF) -->
            <video v-else-if="content._ === 'messageAnimation' && mediaSrc" :src="mediaSrc" autoplay loop muted
                playsinline class="w-full h-auto" :class="borderRadiusClass"></video>
            <div v-else-if="content._ === 'messageAnimation' && !mediaSrc"
                class="w-full aspect-video bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
                :class="borderRadiusClass">
                <span class="text-xs text-gray-500">GIF</span>
            </div>

            <!-- Time overlay on media (when caption is above or no caption) -->
            <div v-if="!captionBelow && date"
                class="time-capsule absolute right-1.5 bottom-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none">
                {{ formatTime(date) }}
            </div>
        </div>

        <!-- Caption below media -->
        <div v-if="!showCaptionAbove && captionText" class="caption-text px-2 pb-2 pt-1">
            <p class="text-sm whitespace-pre-wrap break-all"
                :class="isSelf ? 'text-white' : 'text-gray-800 dark:text-gray-200'">
                {{ captionText }}
            </p>
        </div>

        <!-- Normal time (when caption is below) -->
        <span v-if="captionBelow && date" class="block text-right px-2 pb-1 text-[10px] leading-none"
            :class="isSelf ? 'text-blue-100' : 'text-gray-400'">
            {{ formatTime(date) }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { MessageContent, messageForwardInfo } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { CornerUpRightIcon } from 'lucide-vue-next';

const props = defineProps<{
    content: MessageContent & { _: 'messagePhoto' | 'messageVideo' | 'messageAnimation' };
    isSelf: boolean;
    date?: number;
    forwardInfo?: messageForwardInfo;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
}>();

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
const mediaLoaded = ref(false);

// ---- Computed properties ----

const captionText = computed(() => {
    const c = props.content;
    if ('caption' in c && c.caption?.text) {
        return c.caption.text;
    }
    return '';
});

const showCaptionAbove = computed(() => {
    const c = props.content;
    if ('show_caption_above_media' in c) {
        return c.show_caption_above_media;
    }
    return false;
});

const hasSpoiler = computed(() => {
    const c = props.content;
    if ('has_spoiler' in c) return c.has_spoiler;
    return false;
});

/** Whether caption is below the media (determines time placement) */
const captionBelow = computed(() => {
    return !!captionText.value && !showCaptionAbove.value;
});

const forwardFromText = computed(() => {
    if (!props.forwardInfo) return '';
    const origin = props.forwardInfo.origin;
    switch (origin._) {
        case 'messageOriginUser':
            return `转发自用户 #${origin.sender_user_id}`;
        case 'messageOriginHiddenUser':
            return `转发自 ${origin.sender_name}`;
        case 'messageOriginChat':
            return `转发自聊天 #${origin.sender_chat_id}`;
        case 'messageOriginChannel':
            return `转发自频道 #${origin.chat_id}`;
        default:
            return '转发消息';
    }
});

const borderRadiusClass = computed(() => {
    const first = props.isFirstInGroup;
    const last = props.isLastInGroup;
    const hasForward = !!props.forwardInfo;
    const hasCap = !!captionText.value;

    // If there's content outside the media (forward, caption), the border radius
    // is handled by the outer element; media itself should have flat bottom/top
    if (hasForward || hasCap) {
        if (showCaptionAbove.value && captionText.value) {
            // Caption is above, media is at the bottom
            return 'rounded-b-lg';
        }
        if (!showCaptionAbove.value && captionText.value) {
            // Media is above, caption below
            return 'rounded-t-lg';
        }
    }
    // Bare media - standard bubble radius
    if (props.isSelf) {
        if (first && last) return 'rounded-lg';
        if (first) return 'rounded-tr-none rounded-br-sm rounded-l-lg';
        if (last) return 'rounded-tr-sm rounded-br-lg rounded-l-lg';
        return 'rounded-tr-sm rounded-br-sm rounded-l-lg';
    } else {
        if (first && last) return 'rounded-lg';
        if (first) return 'rounded-tl-none rounded-bl-sm rounded-r-lg';
        if (last) return 'rounded-tl-sm rounded-bl-lg rounded-r-lg';
        return 'rounded-tl-sm rounded-bl-sm rounded-r-lg';
    }
});

// ---- Media loading ----

const getFile = () => {
    const c = props.content;
    if (c._ === 'messagePhoto') return c.photo.sizes[c.photo.sizes.length - 1]?.photo;
    if (c._ === 'messageVideo') return c.video.video;
    if (c._ === 'messageAnimation') return c.animation.animation;
    return undefined;
};

const loadMedia = async () => {
    const f = getFile();
    if (!f) return;

    if (f.local.is_downloading_completed) {
        mediaSrc.value = convertFileSrc(f.local.path);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        downloadFile(f.id);
    }
};

const downloadFile = async (fileId: number) => {
    if (isDownloading.value) return;
    isDownloading.value = true;
    try {
        const res = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true
        });
        if (res.local.is_downloading_completed) {
            mediaSrc.value = convertFileSrc(res.local.path);
        }
    } catch (e) {
        console.error("Download failed", e);
    } finally {
        isDownloading.value = false;
    }
};

const previewMedia = () => {
    // TODO: Implement full screen preview
};

const onMediaLoaded = () => {
    mediaLoaded.value = true;
};

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    mediaLoaded.value = false;
    loadMedia();
}, { immediate: true });
</script>
