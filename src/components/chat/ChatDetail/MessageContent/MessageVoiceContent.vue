<template>
    <!-- Voice Note -->
    <div v-if="content._ === 'messageVoiceNote'" class="flex items-center gap-2 min-w-37.5">
        <div class="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
            <MicIcon class="w-4 h-4 text-blue-500" />
        </div>
        <div class="flex flex-col">
            <span class="text-xs">语音 ({{ duration }}s)</span>
            <audio v-if="mediaSrc" :src="mediaSrc" controls class="h-8 w-40 mt-1"></audio>
        </div>
    </div>

    <!-- Video Note -->
    <div v-else-if="content._ === 'messageVideoNote'" class="w-32 h-32">
        <video v-if="mediaSrc" :src="mediaSrc" controls class="w-full h-full rounded-lg object-cover"></video>
        <div v-else class="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
            <VideoIcon class="w-6 h-6 text-gray-500" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { messageVoiceNote, messageVideoNote } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { MicIcon, VideoIcon } from 'lucide-vue-next';

const props = defineProps<{
    content: messageVoiceNote | messageVideoNote;
}>();

const mediaSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);

const duration = computed(() => {
    if (props.content._ === 'messageVoiceNote') return props.content.voice_note.duration;
    if (props.content._ === 'messageVideoNote') return props.content.video_note.duration;
    return 0;
});

const getFile = () => {
    const c = props.content;
    if (c._ === 'messageVoiceNote') return c.voice_note.voice;
    if (c._ === 'messageVideoNote') return c.video_note.video;
    return undefined;
};

const loadMedia = async () => {
    const f = getFile();
    if (!f) return;

    if (isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        downloadFile(f.id);
    }
};

const downloadFile = async (fileId: number) => {
    if (isDownloading.value) return;
    if (downloadingFiles.has(fileId)) return;
    isDownloading.value = true;
    downloadingFiles.add(fileId);
    try {
        const res = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true
        });
        if (isFileReady(res)) {
            mediaSrc.value = convertFileSrc(res.local.path);
        }
    } catch (e) {
        console.error("Download failed", e);
    } finally {
        downloadingFiles.delete(fileId);
        isDownloading.value = false;
    }
};

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    loadMedia();
}, { immediate: true });
</script>
