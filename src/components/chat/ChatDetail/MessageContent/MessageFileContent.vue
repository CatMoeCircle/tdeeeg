<template>
    <div class="min-w-0">
        <!-- Document -->
        <div v-if="content._ === 'messageDocument'"
            class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 text-black dark:text-white p-2 rounded-lg max-w-xs relative">
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
        <div v-else-if="content._ === 'messageAudio'" class="flex w-70 max-w-full min-w-0 items-center gap-3">
            <div class="relative h-14 w-14 shrink-0">
                <div class="group relative h-full w-full overflow-hidden rounded-xl bg-blue-100 dark:bg-blue-950">
                    <img v-if="coverSrc" :src="coverSrc" :alt="content.audio.title || content.audio.file_name"
                        class="h-full w-full select-none object-cover" @error="coverSrc = undefined" />
                    <div v-else class="flex h-full w-full items-center justify-center">
                        <MusicIcon class="h-6 w-6 text-blue-500 dark:text-blue-300" />
                    </div>
                    <button type="button"
                        class="audio-cover-button absolute inset-0 flex items-center justify-center bg-black/20 text-white transition-colors hover:bg-black/30"
                        :aria-label="isGloballyPlaying ? '暂停' : '播放'" @click="togglePlayback">
                        <PauseIcon v-if="isGloballyPlaying" class="h-6 w-6 fill-current" />
                        <PlayIcon v-else class="ml-0.5 h-6 w-6 fill-current" />
                    </button>
                </div>

                <button v-if="!fileReady" type="button"
                    class="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow-sm transition-transform active:scale-90 dark:border-gray-800"
                    :aria-label="isDownloading ? '正在下载' : '下载音乐'" :disabled="isDownloading"
                    @click.stop="handleDownload(content.audio.audio.id)">
                    <svg v-if="isDownloading" class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                            class="opacity-80" />
                    </svg>
                    <DownloadIcon v-else class="h-3 w-3" stroke-width="2.5" />
                </button>
            </div>

            <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-medium"
                    :class="isCurrentTrack ? 'text-blue-600 dark:text-blue-400' : ''">
                    {{ content.audio.title || content.audio.file_name }}
                </span>
                <span class="truncate text-xs text-gray-500 dark:text-gray-400">
                    {{ content.audio.performer || '未知艺术家' }}
                </span>
                <input class="audio-progress mt-1.5 w-full" type="range" min="0" :max="displayDuration || 1" step="0.1"
                    :value="displayTime" :style="audioProgressStyle" :disabled="!isCurrentTrack || displayDuration <= 0"
                    aria-label="音乐播放进度" @input="seekAudio" />
                <div class="mt-0.5 flex justify-between text-[10px] leading-none text-gray-400 dark:text-gray-500">
                    <span>{{ formatDuration(displayTime) }}</span>
                    <span>{{ formatDuration(displayDuration) }}</span>
                </div>
            </div>
        </div>

        <p v-if="captionSegments.length" class="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-5">
            <template v-for="(segment, index) in captionSegments" :key="index">
                <a v-if="segment.href" :href="segment.href"
                    class="text-blue-500 hover:underline dark:text-blue-400 transition-colors"
                    :class="[segment.className, captionLoadingLinks.has(segment.href) ? 'animate-pulse bg-blue-400/20 dark:bg-blue-300/20 rounded' : '']"
                    @click.prevent.stop="openCaptionLink(segment.href)">{{ segment.text
                    }}</a>
                <span v-else :class="segment.className">{{ segment.text }}</span>
            </template>
        </p>
    </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { messageDocument, messageAudio, textEntity, InternalLinkType } from 'tdlib-types';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from '@tauri-apps/plugin-opener';
import { FileIcon, DownloadIcon, MusicIcon, PauseIcon, PlayIcon } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useDownloadStore, type DownloadFileType } from '../../../../store/downloads';
import { useChatStore } from '../../../../store/chat';
import { settings } from '../../../../store/settings';
import { getChatCategory } from '../../../../utils/autoDownload';
import { useAudioPlayerStore } from '../../../../store/audioPlayer';

const props = defineProps<{
    content: messageDocument | messageAudio;
    chatId?: number;
    messageId?: number;
}>();

const mediaSrc = ref<string | undefined>(undefined);
const coverSrc = ref<string | undefined>(undefined);
const isDownloading = ref(false);
const currentFileId = ref<number>(0);
const router = useRouter();
const captionLoadingLinks = ref<Set<string>>(new Set());
const downloadProgress = ref(0);
const downloadCurrentSize = ref(0);
const downloadTotalSize = ref(0);

const downloadStore = useDownloadStore();
const audioPlayer = useAudioPlayerStore();

/** 当前消息是否为全局播放器中正在播放的曲目 */
const isCurrentTrack = computed(() => {
    if (props.content._ !== 'messageAudio' || !props.messageId) return false;
    return audioPlayer.currentTrack?.messageId === props.messageId;
});

/** 是否正在播放（全局播放器中当前曲目且正在播放） */
const isGloballyPlaying = computed(() => isCurrentTrack.value && audioPlayer.isPlaying);

/** 显示进度（全局播放器同步） */
const displayTime = computed(() => isCurrentTrack.value ? audioPlayer.currentTime : 0);
const displayDuration = computed(() => {
    if (isCurrentTrack.value && audioPlayer.currentTrack) {
        return audioPlayer.currentTrack.duration;
    }
    return props.content._ === 'messageAudio' ? props.content.audio.duration : 0;
});

const audioProgressStyle = computed<Record<string, string>>(() => {
    const ratio = isCurrentTrack.value && displayDuration.value > 0
        ? displayTime.value / displayDuration.value
        : downloadProgress.value;
    return { '--audio-progress': `${Math.min(1, Math.max(0, ratio)) * 100}%` };
});

/** 音频文件是否已下载就绪 */
const fileReady = computed(() => {
    if (props.content._ !== 'messageAudio') return false;
    return isFileReady(props.content.audio.audio);
});

type CaptionSegment = {
    text: string;
    href?: string;
    className: string;
};

const captionSegments = computed<CaptionSegment[]>(() => {
    const text = props.content.caption?.text ?? '';
    if (!text) return [];

    const entities = (props.content.caption.entities ?? [])
        .map(entity => ({
            entity,
            start: Math.max(0, Math.min(text.length, entity.offset)),
            end: Math.max(0, Math.min(text.length, entity.offset + entity.length)),
        }))
        .filter(item => item.end > item.start);
    const boundaries = new Set([0, text.length]);
    for (const entity of entities) {
        boundaries.add(entity.start);
        boundaries.add(entity.end);
    }
    const offsets = [...boundaries].sort((a, b) => a - b);

    return offsets.slice(0, -1).map((start, index) => {
        const end = offsets[index + 1];
        const segmentText = text.slice(start, end);
        const activeEntities = entities
            .filter(item => item.start <= start && item.end >= end)
            .map(item => item.entity);
        const href = activeEntities
            .map(entity => getEntityHref(entity, segmentText))
            .find((value): value is string => !!value);
        const className = activeEntities.map(getEntityClass).filter(Boolean).join(' ');
        return { text: segmentText, href, className };
    });
});

function getEntityHref(entity: textEntity, text: string): string | undefined {
    switch (entity.type._) {
        case 'textEntityTypeTextUrl': return entity.type.url;
        case 'textEntityTypeUrl': return text;
        case 'textEntityTypeEmailAddress': return `mailto:${text}`;
        case 'textEntityTypePhoneNumber': return `tel:${text}`;
        case 'textEntityTypeMention': return `https://t.me/${text.replace(/^@/, '')}`;
        case 'textEntityTypeMentionName': return `tg://user?id=${entity.type.user_id}`;
        default: return undefined;
    }
}

function getEntityClass(entity: textEntity): string {
    switch (entity.type._) {
        case 'textEntityTypeBold': return 'font-semibold';
        case 'textEntityTypeItalic': return 'italic';
        case 'textEntityTypeUnderline': return 'underline';
        case 'textEntityTypeStrikethrough': return 'line-through';
        case 'textEntityTypeCode':
        case 'textEntityTypePre':
        case 'textEntityTypePreCode':
            return 'rounded bg-black/5 px-0.5 font-mono dark:bg-white/10';
        case 'textEntityTypeSpoiler': return 'caption-spoiler';
        default: return '';
    }
}

async function openCaptionLink(href: string) {
    if (href.startsWith('https://t.me/') || href.startsWith('tg://')) {
        await resolveCaptionLink(href);
    } else if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        try {
            await openUrl(href);
        } catch (error) {
            console.error('Open caption link failed', error);
        }
    }
}

async function resolveCaptionLink(href: string) {
    captionLoadingLinks.value = new Set(captionLoadingLinks.value).add(href);
    try {
        const linkType = await tdlibSend({ _: 'getInternalLinkType', link: href }) as InternalLinkType;

        switch (linkType._) {
            case 'internalLinkTypeMessage': {
                const info = await tdlibSend({ _: 'getMessageLinkInfo', url: linkType.url });
                if (info.chat_id) {
                    const query: Record<string, string> = {};
                    if (info.message) {
                        query.message = String(info.message.id);
                    }
                    await router.push({
                        name: 'chat-detail',
                        params: { id: String(info.chat_id) },
                        query: Object.keys(query).length > 0 ? query : undefined,
                    });
                }
                break;
            }
            case 'internalLinkTypePublicChat': {
                const chat = await tdlibSend({ _: 'searchPublicChat', username: linkType.chat_username });
                await router.push(`/home/chats/${chat.id}`);
                break;
            }
            default: {
                openUrl(href);
                break;
            }
        }
    } catch (e) {
        console.warn('Failed to resolve internal link, opening externally:', e);
        openUrl(href);
    } finally {
        const next = new Set(captionLoadingLinks.value);
        next.delete(href);
        captionLoadingLinks.value = next;
    }
}

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
        return;
    }
    // 文档（文件）：仅在自动下载设置允许时自动下载
    if (props.content._ === 'messageDocument' && f.local.can_be_downloaded && !f.local.is_downloading_active) {
        if (props.chatId && settings.autoDownload.enabled) {
            const cs = useChatStore();
            const chatData = cs.chats[props.chatId] as any;
            if (chatData) {
                const category = getChatCategory(chatData);
                const cfg = settings.autoDownload.files;
                const shouldAuto = cfg.enabled && cfg[category];
                if (shouldAuto) {
                    const sizeMB = props.content.document.document.size / (1024 * 1024);
                    if (sizeMB <= cfg.maxSize) {
                        handleDownload(f.id);
                        return;
                    }
                }
            }
        }
        // 不自动下载，仅显示下载按钮（由模板中的 handleDownload 按钮触发）
    }
};

/** 只下载专辑封面，不为显示封面而下载整首音乐。 */
async function loadAudioCover() {
    if (props.content._ !== 'messageAudio') return;
    const audio = props.content.audio;
    const audioFileId = audio.audio.id;

    coverSrc.value = audio.album_cover_minithumbnail?.data
        ? `data:image/jpeg;base64,${audio.album_cover_minithumbnail.data}`
        : undefined;

    const candidates = [audio.album_cover_thumbnail, ...(audio.external_album_covers ?? [])].filter(Boolean);
    for (const thumbnail of candidates) {
        if (!thumbnail) continue;
        const file = thumbnail.file;
        if (isFileReady(file)) {
            if (props.content._ === 'messageAudio' && props.content.audio.audio.id === audioFileId) {
                coverSrc.value = convertFileSrc(file.local.path);
            }
            return;
        }
        if (!file.local.can_be_downloaded) continue;
        try {
            const downloaded = await tdlibSend({
                _: 'downloadFile',
                file_id: file.id,
                priority: 1,
                offset: 0,
                limit: 0,
                synchronous: true,
            });
            if (isFileReady(downloaded)) {
                if (props.content._ === 'messageAudio' && props.content.audio.audio.id === audioFileId) {
                    coverSrc.value = convertFileSrc(downloaded.local.path);
                }
                return;
            }
        } catch (_) { }
    }
}

/** 获取来源对话标题 */
function getChatTitleById(id: number): string {
    try {
        const chatStore = useChatStore();
        return chatStore.chats[id]?.title || `对话 #${id}`;
    } catch { return `对话 #${id}`; }
}

/** 获取缩略图 data URL */
function getThumbnailDataUrl(): string | undefined {
    const c = props.content;
    if (c._ === 'messageDocument') {
        if (c.document.minithumbnail) return `data:image/jpeg;base64,${c.document.minithumbnail.data}`;
        // document thumbnail is a file that needs downloading, skip for registration
    }
    return undefined;
}

/** 确定文件类型 */
function getFileType(): DownloadFileType {
    const c = props.content;
    if (c._ === 'messageAudio') return 'audio';
    if (c._ === 'messageDocument') {
        const mime = c.document.mime_type || '';
        if (mime.startsWith('image/')) return 'photo';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        return 'document';
    }
    return 'document';
}

/** 处理文件下载 */
async function handleDownload(fileId: number) {
    if (isDownloading.value) return;
    if (downloadingFiles.has(fileId)) return;
    isDownloading.value = true;
    currentFileId.value = fileId;
    downloadingFiles.add(fileId);

    // 获取文件信息用于注册下载
    try {
        const fileInfo = await tdlibSend({ _: 'getFile', file_id: fileId }) as any;
        const fileName = props.content._ === 'messageDocument'
            ? props.content.document.file_name
            : props.content._ === 'messageAudio'
                ? (props.content.audio.title || props.content.audio.file_name)
                : `文件 #${fileId}`;
        const totalSize = fileInfo.size || fileInfo.expected_size || 0;
        downloadTotalSize.value = totalSize;
        const chatTitle = props.chatId ? getChatTitleById(props.chatId) : '';
        const thumbUrl = getThumbnailDataUrl();
        const fileType = getFileType();
        await downloadStore.registerDownload(fileId, fileName, chatTitle, totalSize, fileType, thumbUrl, props.chatId, props.messageId);
    } catch (_) { /* ignore */ }

    try {
        await tdlibSend({ _: 'downloadFile', file_id: fileId, priority: 1, offset: 0, limit: 0, synchronous: false });
    } catch (e) {
        console.error("Download failed", e);
        isDownloading.value = false;
        downloadingFiles.delete(fileId);
    }
}

/** 通过下载 store 的 updateFile 事件持续跟踪进度 */
let unsubFileWatch: (() => void) | null = null;
watch(currentFileId, (fileId) => {
    if (unsubFileWatch) { unsubFileWatch(); unsubFileWatch = null; }
    if (!fileId) return;
    unsubFileWatch = watch(
        () => downloadStore.getDownloadInfo(fileId),
        (info) => {
            if (!info) return;
            downloadProgress.value = info.progress;
            downloadCurrentSize.value = info.downloaded_size;
            downloadTotalSize.value = info.total_size;

            if (info.is_completed && info.local_path) {
                downloadingFiles.delete(fileId);
                isDownloading.value = false;
                mediaSrc.value = convertFileSrc(info.local_path);
            }
        },
        { immediate: true }
    );
});

async function togglePlayback() {
    if (props.content._ !== 'messageAudio') return;

    // 如果当前消息正是全局播放器的曲目，切换播放/暂停
    if (isCurrentTrack.value) {
        audioPlayer.togglePlay();
        return;
    }

    // 否则通知全局播放器播放此消息
    // 构造一个 message 对象传入
    const msg: any = {
        _: 'message',
        id: props.messageId ?? 0,
        chat_id: props.chatId ?? 0,
        content: props.content,
        date: 0,
        is_outgoing: false,
        media_album_id: '0',
        sender_id: { _: 'messageSenderUser', user_id: 0 },
    };
    await audioPlayer.playMessageAudio(msg);
}

function seekAudio(event: Event) {
    if (!isCurrentTrack.value) return;
    const nextTime = Number((event.target as HTMLInputElement).value);
    audioPlayer.seek(nextTime);
}

function formatDuration(seconds: number) {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

const formatSize = (size: number) => {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
};

watch(() => props.content, () => {
    mediaSrc.value = undefined;
    coverSrc.value = undefined;
    downloadProgress.value = 0;
    isDownloading.value = false;
    currentFileId.value = 0;
    loadMedia();
    loadAudioCover();
}, { immediate: true });

onUnmounted(() => {
    if (unsubFileWatch) unsubFileWatch();
});
</script>

<style scoped>
.audio-cover-button:active {
    transform: scale(0.96);
}

.caption-spoiler {
    border-radius: 0.2rem;
    background: currentColor;
    color: transparent;
    transition: color 120ms ease-out;
}

.caption-spoiler:hover,
.caption-spoiler:focus {
    color: inherit;
    background: transparent;
}

.audio-progress {
    --audio-progress: 0%;
    appearance: none;
    height: 12px;
    margin-inline: 0;
    cursor: pointer;
    background: transparent;
}

.audio-progress:disabled {
    cursor: default;
    opacity: 1;
}

.audio-progress::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 9999px;
    background: linear-gradient(to right, #3b82f6 var(--audio-progress), rgb(209 213 219) var(--audio-progress));
}

.audio-progress::-webkit-slider-thumb {
    width: 9px;
    height: 9px;
    margin-top: -3px;
    appearance: none;
    border: 0;
    border-radius: 9999px;
    background: #3b82f6;
}

.audio-progress:disabled::-webkit-slider-thumb {
    opacity: 0;
}

.audio-progress::-moz-range-track {
    height: 3px;
    border-radius: 9999px;
    background: rgb(209 213 219);
}

.audio-progress::-moz-range-progress {
    height: 3px;
    border-radius: 9999px;
    background: #3b82f6;
}

.audio-progress::-moz-range-thumb {
    width: 9px;
    height: 9px;
    border: 0;
    border-radius: 9999px;
    background: #3b82f6;
}

.audio-progress:disabled::-moz-range-thumb {
    opacity: 0;
}

:global(.dark) .audio-progress::-webkit-slider-runnable-track {
    background: linear-gradient(to right, #60a5fa var(--audio-progress), rgb(75 85 99) var(--audio-progress));
}

@media (prefers-reduced-motion: reduce) {

    .audio-cover-button,
    .audio-progress,
    .caption-spoiler {
        transition: none;
    }
}
</style>
