<template>
    <div>
        <!-- Document -->
        <div v-if="content._ === 'messageDocument'"
            class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg max-w-xs relative">
            <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded flex items-center justify-center shrink-0">
                <FileIcon class="w-5 h-5 text-blue-500" />
            </div>
            <div class="flex flex-col overflow-hidden flex-1 min-w-0">
                <span class="text-sm truncate font-medium">{{ content.document.file_name }}</span>
                <span class="text-xs text-gray-500">
                    {{ downloadProgress > 0 && downloadProgress < 1 ? formatSize(downloadCurrentSize) + ' / ' +
                        formatSize(downloadTotalSize) : formatSize(content.document.document.size) }} <span
                        v-if="isDownloading" class="text-blue-500 ml-1">下载中...</span>
                </span>
                <!-- Progress bar -->
                <div v-if="downloadProgress > 0 && downloadProgress < 1"
                    class="mt-1 w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full transition-all duration-300"
                        :style="{ width: (downloadProgress * 100) + '%' }">
                    </div>
                </div>
            </div>
            <button v-if="!mediaSrc && !isDownloading" @click="handleDownload(content.document.document.id)"
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded shrink-0">
                <DownloadIcon class="w-4 h-4" />
            </button>
            <button v-if="isDownloading" class="p-1 shrink-0">
                <svg class="w-4 h-4 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                        class="opacity-75" />
                </svg>
            </button>
        </div>

        <!-- Audio -->
        <div v-else-if="content._ === 'messageAudio'" class="flex items-center gap-2 min-w-[200px]">
            <div
                class="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center shrink-0">
                <MusicIcon class="w-5 h-5 text-green-500" />
            </div>
            <div class="flex flex-col overflow-hidden min-w-0 flex-1">
                <span class="text-sm truncate font-medium">{{ content.audio.title || content.audio.file_name }}</span>
                <span class="text-xs text-gray-500">
                    {{ content.audio.performer || '未知歌手' }} ·
                    <template v-if="downloadProgress > 0 && downloadProgress < 1">
                        {{ formatSize(downloadCurrentSize) }} / {{ formatSize(downloadTotalSize) }}
                    </template>
                    <template v-else>
                        {{ formatSize(content.audio.audio.size) }}
                    </template>
                </span>
                <!-- Progress bar -->
                <div v-if="downloadProgress > 0 && downloadProgress < 1"
                    class="mt-1 w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div class="h-full bg-green-500 rounded-full transition-all duration-300"
                        :style="{ width: (downloadProgress * 100) + '%' }">
                    </div>
                </div>
            </div>
            <audio v-if="mediaSrc" :src="mediaSrc" controls class="h-8 w-32 shrink-0"></audio>
            <button v-else-if="!isDownloading" @click="handleDownload(content.audio.audio.id)"
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded shrink-0">
                <DownloadIcon class="w-4 h-4" />
            </button>
            <button v-if="isDownloading" class="p-1 shrink-0">
                <svg class="w-4 h-4 text-green-500 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                        class="opacity-75" />
                </svg>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { messageDocument, messageAudio } from 'tdlib-types';
import { tdlibSend, isFileReady } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { FileIcon, DownloadIcon, MusicIcon } from 'lucide-vue-next';

const props = defineProps<{
    content: messageDocument | messageAudio;
    chatId?: number;
    messageId?: number;
}>();

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
const currentFileId = ref<number>(0);
const downloadProgress = ref(0);
const downloadCurrentSize = ref(0);
const downloadTotalSize = ref(0);

const getFile = () => {
    const c = props.content;
    if (c._ === 'messageDocument') return c.document.document;
    if (c._ === 'messageAudio') return c.audio.audio;
    return undefined;
};

const loadMedia = async () => {
    const f = getFile();
    if (!f) return;
    if (isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        handleDownload(f.id);
    }
};

/** 处理文件下载 */
async function handleDownload(fileId: number) {
    if (isDownloading.value) return;
    isDownloading.value = true;
    currentFileId.value = fileId;

    try {
        await tdlibSend({ _: 'downloadFile', file_id: fileId, priority: 1, offset: 0, limit: 0, synchronous: false });
        pollFileDownload(fileId);
    } catch (e) {
        console.error("Download failed", e);
        isDownloading.value = false;
    }
}

/** 轮询文件下载进度 */
let filePollTimer: ReturnType<typeof setInterval> | null = null;
function pollFileDownload(fileId: number) {
    filePollTimer = setInterval(async () => {
        try {
            const info = await tdlibSend({ _: 'getFile', file_id: fileId }) as any;
            const total = info.size || 1;
            const downloaded = info.local?.downloaded_size || 0;
            downloadProgress.value = downloaded / total;
            downloadCurrentSize.value = downloaded;
            downloadTotalSize.value = total;
            if (info.local?.is_downloading_completed && info.local?.path) {
                if (filePollTimer) { clearInterval(filePollTimer); filePollTimer = null; }
                isDownloading.value = false;
                mediaSrc.value = convertFileSrc(info.local.path);
            }
        } catch (_) {
            if (filePollTimer) { clearInterval(filePollTimer); filePollTimer = null; }
            isDownloading.value = false;
        }
    }, 500);
}

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
