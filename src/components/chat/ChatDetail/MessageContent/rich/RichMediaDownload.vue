<template>
    <!-- 覆盖式下载按钮（视频/动画缩略图右下角，半透明圆形） -->
    <button v-if="overlay && showButton" type="button" :class="[
        'absolute z-10 flex items-center justify-center rounded-full bg-black/50 text-white shadow-md transition-colors hover:bg-black/70 active:scale-95',
        small ? 'bottom-1 -right-1 h-5 w-5' : 'bottom-1.5 right-1.5 h-8 w-8',
    ]" :aria-label="isDownloading ? '正在下载' : '下载文件'" :title="isDownloading ? '正在下载' : '下载文件'"
        @click.stop="startDownload">
        <LoaderIndicator v-if="isDownloading" :progress="progress > 0 && progress < 1 ? progress : undefined"
            :size="small ? '10' : '16'" color="#ffffff" />
        <DownloadIcon v-else :class="small ? 'h-2.5 w-2.5' : 'h-4 w-4'" />
    </button>

    <!-- 行内下载按钮（音频/语音右侧小按钮） -->
    <button v-else-if="!overlay && showButton" type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 active:scale-95 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20"
        :aria-label="isDownloading ? '正在下载' : '下载文件'" :title="isDownloading ? '正在下载' : '下载文件'"
        @click.stop="startDownload">
        <LoaderIndicator v-if="isDownloading" :progress="progress > 0 && progress < 1 ? progress : undefined" size="14"
            color="#3b82f6" />
        <DownloadIcon v-else class="h-3.5 w-3.5" />
    </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch } from 'vue';
import type { file } from 'tdlib-types';
import { DownloadIcon } from 'lucide-vue-next';
import { tdlibSend, isFileReady, downloadingFiles, reactiveDownloadingFiles } from '../../../../../utils/tdlib';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { useDownloadStore, type DownloadFileType } from '../../../../../store/downloads';
import { useChatStore } from '../../../../../store/chat';
import LoaderIndicator from '../../../../common/LoaderIndicator';

const props = withDefaults(defineProps<{
    /** 要下载的文件（audio.audio / video.video / animation.animation / voice_note.voice） */
    file: file;
    /** 文件名，用于下载管理器展示 */
    fileName?: string;
    /** 文件类型分类（下载管理器展示） */
    fileType?: DownloadFileType;
    chatId?: number;
    messageId?: number;
    /** 覆盖式（缩略图角落半透明圆形）还是行内（右侧小按钮） */
    overlay?: boolean;
    /** 覆盖式按钮使用小尺寸（音频封面等小缩略图右下角角标） */
    small?: boolean;
}>(), {
    fileName: '',
    fileType: 'document',
    overlay: false,
    small: false,
});

const downloadStore = useDownloadStore();

const fileId = computed(() => props.file?.id ?? 0);

const state = reactive<{ downloading: boolean; progress: number }>({ downloading: false, progress: 0 });

/** 下载进度（0~1），暴露给模板 */
const progress = computed(() => state.progress);

/** 是否正在下载（本地发起或全局下载集合中，如被其他路径触发） */
const isDownloading = computed(() => state.downloading || reactiveDownloadingFiles.value.has(fileId.value));

/** 文件是否已下载就绪（本地状态或下载管理器已标记完成） */
const ready = computed(() => {
    if (!fileId.value) return false;
    if (isFileReady(props.file)) return true;
    const info = downloadStore.getDownloadInfo(fileId.value);
    return !!info?.is_completed;
});

/** 是否可下载（TDLib 允许下载） */
const canDownload = computed(() => !!fileId.value && !!props.file?.local?.can_be_downloaded);

/** 是否显示下载按钮：可下载且未就绪 */
const showButton = computed(() => canDownload.value && !ready.value);

let unsubWatch: (() => void) | null = null;

function stopTracking() {
    if (unsubWatch) {
        unsubWatch();
        unsubWatch = null;
    }
}

/** 通过 download store 的 item 持续跟踪下载进度 */
function trackProgress() {
    if (unsubWatch) return;
    state.downloading = true;
    unsubWatch = watch(
        () => downloadStore.getDownloadInfo(fileId.value),
        (info) => {
            if (!info) return;
            state.progress = info.progress;
            if (info.is_completed) {
                state.downloading = false;
                stopTracking();
            }
        },
        { immediate: true },
    );
}

/** 文件被其他路径触发全局下载时，自动同步进度显示 */
watch(
    () => reactiveDownloadingFiles.value.has(fileId.value),
    (globally) => {
        if (globally) trackProgress();
    },
);

async function startDownload() {
    const fid = fileId.value;
    if (!fid || !canDownload.value || ready.value) return;
    if (downloadingFiles.has(fid)) {
        trackProgress();
        return;
    }

    downloadingFiles.add(fid);
    state.downloading = true;
    state.progress = 0;
    try {
        // 获取文件信息用于注册下载（真实大小）
        let totalSize = props.file.size || props.file.expected_size || 0;
        try {
            const info = await tdlibSend({ _: 'getFile', file_id: fid }) as any;
            totalSize = info.size || info.expected_size || totalSize;
        } catch { /* 忽略 */ }

        const chatTitle = props.chatId ? getChatTitle(props.chatId) : '';
        await downloadStore.registerDownload(
            fid,
            props.fileName || `文件 #${fid}`,
            chatTitle,
            totalSize,
            props.fileType,
            undefined,
            props.chatId,
            props.messageId,
        );

        // 用户手动点击下载：走 addFileToDownloads（持久化下载列表）
        await tdlibSend({
            _: 'addFileToDownloads',
            file_id: fid,
            chat_id: props.chatId,
            message_id: props.messageId,
            priority: DL_PRIORITY.USER_ACTIVE,
        });
        trackProgress();
    } catch (e) {
        console.error('富文本文件下载失败:', e);
        state.downloading = false;
    } finally {
        downloadingFiles.delete(fid);
    }
}

function getChatTitle(id: number): string {
    try {
        const chatStore = useChatStore();
        return chatStore.chats[id]?.title || `对话 #${id}`;
    } catch {
        return `对话 #${id}`;
    }
}

onBeforeUnmount(stopTracking);
</script>
