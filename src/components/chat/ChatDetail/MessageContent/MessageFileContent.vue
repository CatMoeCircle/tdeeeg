<template>
    <div>
        <!-- Document -->
        <div v-if="content._ === 'messageDocument'"
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

        <!-- Audio -->
        <div v-else-if="content._ === 'messageAudio'" class="flex items-center gap-2 min-w-[200px]">
            <div
                class="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center shrink-0">
                <MusicIcon class="w-5 h-5 text-green-500" />
            </div>
            <div class="flex flex-col overflow-hidden min-w-0">
                <span class="text-sm truncate font-medium">{{ content.audio.title || content.audio.file_name }}</span>
                <span class="text-xs text-gray-500">{{ content.audio.performer || '未知歌手' }} · {{
                    formatSize(content.audio.audio.size) }}</span>
            </div>
            <audio v-if="mediaSrc" :src="mediaSrc" controls class="h-8 w-32"></audio>
            <button v-else @click="downloadFile(content.audio.audio.id)"
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                <DownloadIcon class="w-4 h-4" />
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { messageDocument, messageAudio } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { FileIcon, DownloadIcon, MusicIcon } from 'lucide-vue-next';

const props = defineProps<{
    content: messageDocument | messageAudio;
}>();

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);

const getFile = () => {
    const c = props.content;
    if (c._ === 'messageDocument') return c.document.document;
    if (c._ === 'messageAudio') return c.audio.audio;
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

const formatSize = (size: number) => {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
};

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    loadMedia();
}, { immediate: true });
</script>
