<template>
    <!-- Voice Note -->
    <div v-if="content._ === 'messageVoiceNote'" ref="rootEl" class="flex items-center gap-2 min-w-37.5">
        <div class="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
            <MicIcon class="w-4 h-4 text-blue-500" />
        </div>
        <div class="flex min-w-0 flex-col">
            <span class="text-xs">语音 ({{ duration }}s)</span>
            <audio v-if="mediaSrc" :src="mediaSrc" controls class="h-8 w-40 mt-1"></audio>
            <RichMediaDownload v-else-if="noteFile" :file="noteFile" :file-name="`voice_${noteFile.id}`"
                file-type="audio" :chat-id="chatId" :message-id="messageId" class="mt-1 self-start" />
            <MessageTextContent v-if="content.caption?.text" :formattedText="content.caption" :chatId="chatId"
                class="mt-1" />
        </div>
    </div>

    <!-- Video Note -->
    <div v-else-if="content._ === 'messageVideoNote'" ref="rootEl" class="relative w-32 h-32">
        <video v-if="mediaSrc" :src="mediaSrc" controls class="w-full h-full rounded-lg object-cover"></video>
        <template v-else>
            <img v-if="previewSrc" :src="previewSrc" class="w-full h-full rounded-lg object-cover opacity-60" />
            <div v-else class="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <VideoIcon class="w-6 h-6 text-gray-500" />
            </div>
            <RichMediaDownload v-if="noteFile" :file="noteFile" :file-name="`video_note_${noteFile.id}.mp4`"
                file-type="video" :chat-id="chatId" :message-id="messageId" overlay />
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { messageVoiceNote, messageVideoNote, file } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { MicIcon, VideoIcon } from 'lucide-vue-next';
import MessageTextContent from './MessageTextContent.vue';
import RichMediaDownload from '../rich/RichMediaDownload.vue';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { shouldAutoDownloadFiles, shouldAutoDownloadVideos } from '../../../../../utils/autoDownload';
import { useDownloadStore } from '../../../../../store/downloads';

const props = defineProps<{
    content: messageVoiceNote | messageVideoNote;
    chatId?: number;
    messageId?: number;
}>();

const downloadStore = useDownloadStore();
const rootEl = ref<HTMLElement | null>(null);
const mediaSrc = ref<string | undefined>(undefined);
const previewSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);

const duration = computed(() => {
    if (props.content._ === 'messageVoiceNote') return props.content.voice_note.duration;
    if (props.content._ === 'messageVideoNote') return props.content.video_note.duration;
    return 0;
});

const noteFile = computed<file | undefined>(() => {
    const c = props.content;
    if (c._ === 'messageVoiceNote') return c.voice_note.voice;
    if (c._ === 'messageVideoNote') return c.video_note.video;
    return undefined;
});

const getFile = () => noteFile.value;

/** 加载代次：content 替换时自增，丢弃过期下载结果，避免视频留言缩略图串图 */
let noteLoadSeq = 0;

/**
 * 设置视频留言 base64 缩略图预览（不下载），供离屏消息显示占位。
 * 语音留言无缩略图 base64，保持仅时长文本。
 */
function setNotePreview() {
    const c = props.content;
    const min = c._ === 'messageVideoNote' ? c.video_note.minithumbnail : undefined;
    previewSrc.value = min?.data ? `data:image/jpeg;base64,${min.data}` : undefined;
}

/** 当前消息是否允许自动下载：语音跟「文件」，视频留言跟「视频」（均含体积上限） */
function canAutoDownload(): boolean {
    const c = props.content;
    const f = getFile();
    if (!f) return false;
    if (c._ === 'messageVoiceNote') {
        return shouldAutoDownloadFiles(props.chatId, f.size || 0);
    }
    return shouldAutoDownloadVideos(props.chatId, f.size || 0);
}

const loadMedia = async () => {
    const f = getFile();
    if (!f) return;

    if (isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
    } else if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        if (!canAutoDownload()) return;
        downloadFile(f.id);
    }
};

const downloadFile = async (fileId: number) => {
    const seq = noteLoadSeq;
    if (isDownloading.value) return;
    if (downloadingFiles.has(fileId)) return;
    isDownloading.value = true;
    downloadingFiles.add(fileId);
    try {
        const res = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: DL_PRIORITY.DEFAULT,
            offset: 0,
            limit: 0,
            synchronous: true
        });
        if (seq !== noteLoadSeq) return;
        if (isFileReady(res)) {
            mediaSrc.value = convertFileSrc(res.local.path);
        }
    } catch (e) {
        console.error("Download failed", e);
    } finally {
        downloadingFiles.delete(fileId);
        if (seq === noteLoadSeq) isDownloading.value = false;
    }
};

/** 手动下载完成后（RichMediaDownload / 全局下载）拉起本地路径 */
async function applyReadyFile(fileId: number) {
    const seq = noteLoadSeq;
    try {
        const info = await tdlibSend({ _: 'getFile', file_id: fileId }) as file;
        if (seq !== noteLoadSeq) return;
        if (isFileReady(info) && noteFile.value?.id === fileId) {
            mediaSrc.value = convertFileSrc(info.local.path);
        }
    } catch { /* ignore */ }
}

watch(
    () => {
        const f = noteFile.value;
        if (!f?.id) return false;
        return downloadStore.getDownloadInfo(f.id)?.is_completed === true || isFileReady(f);
    },
    (ready) => {
        if (ready && noteFile.value?.id && !mediaSrc.value) {
            void applyReadyFile(noteFile.value.id);
        }
    },
);

// 视口门控：挂载时只设置 base64 预览，进入视口才下载语音/视频留言文件。
const { start: startViewportLoad, entered: noteEntered } = useViewportLoad(rootEl, () => {
    loadMedia();
});
watch(() => props.content, () => {
    noteLoadSeq++;
    mediaSrc.value = undefined;
    isDownloading.value = false;
    setNotePreview();
    if (noteEntered.value) loadMedia();
}, { immediate: true });
onMounted(() => {
    startViewportLoad();
});
</script>
