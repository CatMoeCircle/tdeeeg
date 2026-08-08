<template>
    <!-- Voice Note -->
    <div v-if="content._ === 'messageVoiceNote'" ref="rootEl" class="flex items-center gap-2 min-w-37.5">
        <div class="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
            <MicIcon class="w-4 h-4 text-blue-500" />
        </div>
        <div class="flex flex-col">
            <span class="text-xs">语音 ({{ duration }}s)</span>
            <audio v-if="mediaSrc" :src="mediaSrc" controls class="h-8 w-40 mt-1"></audio>
            <MessageTextContent v-if="content.caption?.text" :formattedText="content.caption" class="mt-1" />
        </div>
    </div>

    <!-- Video Note -->
    <div v-else-if="content._ === 'messageVideoNote'" ref="rootEl" class="w-32 h-32">
        <video v-if="mediaSrc" :src="mediaSrc" controls class="w-full h-full rounded-lg object-cover"></video>
        <img v-else-if="previewSrc" :src="previewSrc" class="w-full h-full rounded-lg object-cover opacity-60" />
        <div v-else class="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
            <VideoIcon class="w-6 h-6 text-gray-500" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { messageVoiceNote, messageVideoNote } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { MicIcon, VideoIcon } from 'lucide-vue-next';
import MessageTextContent from './MessageTextContent.vue';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';

const props = defineProps<{
    content: messageVoiceNote | messageVideoNote;
}>();

const rootEl = ref<HTMLElement | null>(null);
const mediaSrc = ref<string | undefined>(undefined);
const previewSrc = ref<string | undefined>(undefined);
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

/**
 * 设置视频留言 base64 缩略图预览（不下载），供离屏消息显示占位。
 * 语音留言无缩略图 base64，保持仅时长文本。
 */
function setNotePreview() {
    const c = props.content;
    const min = c._ === 'messageVideoNote' ? c.video_note.minithumbnail : undefined;
    previewSrc.value = min?.data ? `data:image/jpeg;base64,${min.data}` : undefined;
}

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

// 视口门控：挂载时只设置 base64 预览，进入视口才下载语音/视频留言文件。
const { start: startViewportLoad, entered: noteEntered } = useViewportLoad(rootEl, () => {
    loadMedia();
});
watch(() => props.content, () => {
    mediaSrc.value = undefined;
    setNotePreview();
    if (noteEntered.value) loadMedia();
}, { immediate: true });
onMounted(() => {
    startViewportLoad();
});
</script>
