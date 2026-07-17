<template>
    <div class="message-content">
        <!-- Reply preview: 点击可跳转到被回复的消息 -->
        <div v-if="replyTo"
            class="reply-preview p-1 mb-2 bg-gray-100 dark:bg-gray-800 rounded cursor-pointer text-xs text-gray-600 dark:text-gray-300"
            @click="jumpToReply">
            回复消息 · 点击跳转
        </div>
        <!-- Text -->
        <p v-if="content._ === 'messageText'" class="text-sm whitespace-pre-wrap break-all">
            {{ content.text.text }}
        </p>

        <!-- Photo -->
        <div v-else-if="content._ === 'messagePhoto'" class="max-w-xs">
            <img v-if="mediaSrc" :src="mediaSrc" class="rounded-lg w-full h-auto cursor-pointer"
                @click="previewMedia" />
            <div v-else
                class="w-48 h-48 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center animate-pulse">
                <span class="text-xs text-gray-500">Loading Photo...</span>
            </div>
            <p v-if="content.caption?.text" class="text-sm mt-1">{{ content.caption.text }}</p>
        </div>

        <!-- Sticker -->
        <div v-else-if="content._ === 'messageSticker'" class="w-32 h-32">
            <img v-if="mediaSrc" :src="mediaSrc" class="w-full h-full object-contain" />
            <div v-else class="w-full h-full flex items-center justify-center text-2xl">
                {{ content.sticker.emoji || '🧩' }}
            </div>
        </div>

        <!-- Video -->
        <div v-else-if="content._ === 'messageVideo'" class="max-w-xs">
            <video v-if="mediaSrc" :src="mediaSrc" controls class="rounded-lg w-full h-auto"></video>
            <div v-else class="w-48 h-32 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <span class="text-xs text-gray-500">Video</span>
            </div>
            <p v-if="content.caption?.text" class="text-sm mt-1">{{ content.caption.text }}</p>
        </div>

        <!-- Voice Note -->
        <div v-else-if="content._ === 'messageVoiceNote'" class="flex items-center gap-2 min-w-[150px]">
            <div class="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                <MicIcon class="w-4 h-4 text-blue-500" />
            </div>
            <div class="flex flex-col">
                <span class="text-xs">Voice Note ({{ content.voice_note.duration }}s)</span>
                <audio v-if="mediaSrc" :src="mediaSrc" controls class="h-8 w-40 mt-1"></audio>
            </div>
        </div>

        <!-- Animation (GIF) -->
        <div v-else-if="content._ === 'messageAnimation'" class="max-w-xs">
            <video v-if="mediaSrc" :src="mediaSrc" autoplay loop muted playsinline
                class="rounded-lg w-full h-auto"></video>
            <div v-else class="w-48 h-32 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <span class="text-xs text-gray-500">GIF</span>
            </div>
        </div>

        <!-- Document -->
        <div v-else-if="content._ === 'messageDocument'"
            class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg max-w-xs">
            <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded flex items-center justify-center shrink-0">
                <FileIcon class="w-5 h-5 text-blue-500" />
            </div>
            <div class="flex flex-col overflow-hidden">
                <span class="text-sm truncate font-medium">{{ content.document.file_name }}</span>
                <span class="text-xs text-gray-500">
                    {{ formatSize(content.document.document.size) }}
                    <span v-if="isDownloading" class="text-blue-500 ml-1">⬇️</span>
                </span>
            </div>
            <button v-if="!mediaSrc" @click="downloadFile(content.document.document.id)"
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                <DownloadIcon class="w-4 h-4" />
            </button>
        </div>

        <!-- Fallback -->
        <p v-else class="text-sm italic text-red-500">
            [Unsupported message type: {{ content._ }}]
        </p>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MessageContent, file } from 'tdlib-types';
import { tdlibSend } from '../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { MicIcon, FileIcon, DownloadIcon } from 'lucide-vue-next';

const props = defineProps<{
    content: MessageContent;
    replyTo?: number;
    msgId?: number;
}>();

const emit = defineEmits<{
    (e: 'jump-to-message', id: number): void;
}>();

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);

const getFile = (): file | undefined => {
    const c = props.content;
    if (c._ === 'messagePhoto') return c.photo.sizes[c.photo.sizes.length - 1]?.photo; // Largest photo
    if (c._ === 'messageSticker') return c.sticker.sticker;
    if (c._ === 'messageVideo') return c.video.video;
    if (c._ === 'messageVoiceNote') return c.voice_note.voice;
    if (c._ === 'messageAnimation') return c.animation.animation;
    if (c._ === 'messageDocument') return c.document.document;
    return undefined;
};

const loadMedia = async () => {
    const f = getFile();
    if (!f) return;

    if (f.local.is_downloading_completed) {
        mediaSrc.value = convertFileSrc(f.local.path);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        // Auto download small files (photos, stickers, voice notes)
        // For videos/documents, maybe wait for user action? 
        // For now, let's auto download photos and stickers.
        const shouldAutoDownload = ['messagePhoto', 'messageSticker', 'messageVoiceNote', 'messageAnimation'].includes(props.content._);

        if (shouldAutoDownload) {
            downloadFile(f.id);
        }
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

const formatSize = (size: number) => {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
};

const previewMedia = () => {
    // TODO: Implement full screen preview
};

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    loadMedia();
}, { immediate: true });

const jumpToReply = () => {
    if (props.replyTo) {
        emit('jump-to-message', props.replyTo);
    }
};

</script>
