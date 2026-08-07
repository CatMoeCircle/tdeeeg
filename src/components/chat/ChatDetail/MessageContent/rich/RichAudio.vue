<template>
    <figure class="my-1.5">
        <div
            class="relative flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg bg-black/5 dark:bg-white/10 p-2">
            <!-- 封面 + 播放按钮 -->
            <div class="relative h-14 w-14 shrink-0">
                <div class="group relative h-full w-full overflow-hidden rounded-xl bg-blue-100 dark:bg-blue-950">
                    <img v-if="coverSrc" :src="coverSrc" :alt="audioTitle"
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
                <!-- 未就绪时的下载角标（覆盖式，小尺寸贴合封面） -->
                <RichMediaDownload v-if="audio?.audio" :file="audio.audio" :file-name="audioTitle" file-type="audio"
                    :chat-id="chatId" :message-id="messageId" overlay small />
            </div>

            <!-- 标题 / 艺术家 / 进度 -->
            <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-medium"
                    :class="isCurrentTrack ? 'text-blue-600 dark:text-blue-400' : ''">
                    {{ audioTitle }}
                </span>
                <span class="truncate text-xs text-gray-500 dark:text-gray-400">{{ audio?.performer || '未知艺术家'
                }}</span>
                <input class="audio-progress mt-1.5 w-full" type="range" min="0" :max="displayDuration || 1" step="0.1"
                    :value="displayTime" :style="audioProgressStyle" :disabled="!isCurrentTrack || displayDuration <= 0"
                    aria-label="音乐播放进度" @input="seekAudio" />
                <div class="mt-0.5 flex justify-between text-[10px] leading-none text-gray-400 dark:text-gray-500">
                    <span>{{ formatDuration(displayTime) }}</span>
                    <span>{{ formatDuration(displayDuration) }}</span>
                </div>
            </div>
        </div>
        <RichCaption v-if="caption" :caption="caption" />
    </figure>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { audio, pageBlockCaption, thumbnail } from 'tdlib-types';
import { MusicIcon, PauseIcon, PlayIcon } from 'lucide-vue-next';
import { tdlibSend, isFileReady } from '../../../../../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isThumbnailImgRenderable } from '../../../../../utils/thumbnail';
import { useAudioPlayerStore } from '../../../../../store/audioPlayer';
import RichMediaDownload from './RichMediaDownload.vue';
import RichCaption from './RichCaption.vue';

const props = defineProps<{
    audio?: audio | null;
    caption?: pageBlockCaption | null;
    chatId?: number;
    messageId?: number;
}>();

const audioPlayer = useAudioPlayerStore();

const coverSrc = ref<string | undefined>(undefined);

const audioTitle = computed(() => {
    const a = props.audio;
    if (!a) return '音频';
    const parts = [a.performer, a.title].filter(Boolean);
    if (parts.length) return parts.join(' - ');
    return a.file_name || '音频';
});

/** 当前消息是否为全局播放器中正在播放的曲目 */
const isCurrentTrack = computed(() => {
    if (!props.messageId) return false;
    return audioPlayer.currentTrack?.messageId === props.messageId;
});

/** 是否正在播放（全局播放器中当前曲目且正在播放） */
const isGloballyPlaying = computed(() => isCurrentTrack.value && audioPlayer.isPlaying);

/** 显示进度（全局播放器同步） */
const displayTime = computed(() => (isCurrentTrack.value ? audioPlayer.currentTime : 0));
const displayDuration = computed(() => {
    if (isCurrentTrack.value && audioPlayer.currentTrack) {
        return audioPlayer.currentTrack.duration;
    }
    return props.audio?.duration || 0;
});

const audioProgressStyle = computed<Record<string, string>>(() => {
    const ratio = isCurrentTrack.value && displayDuration.value > 0
        ? displayTime.value / displayDuration.value
        : 0;
    return { '--audio-progress': `${Math.min(1, Math.max(0, ratio)) * 100}%` };
});

/** 播放/暂停：复用全局音频播放器（与普通音乐消息一致） */
async function togglePlayback() {
    if (!props.audio || !props.audio.audio) return;
    // 当前正是全局播放器的曲目，切换播放/暂停
    if (isCurrentTrack.value) {
        audioPlayer.togglePlay();
        return;
    }
    // 否则构造 messageAudio 消息对象交给全局播放器播放
    const msg: any = {
        _: 'message',
        id: props.messageId ?? 0,
        chat_id: props.chatId ?? 0,
        content: {
            _: 'messageAudio',
            audio: props.audio,
            caption: { _: 'formattedText', text: '', entities: [] },
            is_pinned: false,
        },
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

/** 加载专辑封面：minithumbnail → 内嵌缩略图 → 外部封面（只取可渲染为图片的静态位图） */
async function loadCover() {
    const a = props.audio;
    if (!a) return;
    const audioFileId = a.audio?.id;

    coverSrc.value = a.album_cover_minithumbnail?.data
        ? `data:image/jpeg;base64,${a.album_cover_minithumbnail.data}`
        : undefined;

    const imgRenderable = (t: thumbnail | undefined): t is thumbnail =>
        !!t && isThumbnailImgRenderable(t.format) && !!t.file.local?.can_be_downloaded;

    // 优先使用内嵌封面 thumbnail；否则从最高清外部封面开始尝试
    const primary = imgRenderable(a.album_cover_thumbnail) ? a.album_cover_thumbnail : undefined;
    const external = (a.external_album_covers ?? [])
        .filter(imgRenderable)
        .sort((x, y) => x.width * x.height - y.width * y.height);

    const candidates: thumbnail[] = primary
        ? [primary, ...external.reverse()]
        : [...external.reverse()];

    for (const thumbnail of candidates) {
        if (!thumbnail) continue;
        const file = thumbnail.file;
        if (isFileReady(file)) {
            if (props.audio?.audio?.id === audioFileId) coverSrc.value = convertFileSrc(file.local.path);
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
                if (props.audio?.audio?.id === audioFileId) coverSrc.value = convertFileSrc(downloaded.local.path);
                return;
            }
        } catch (_) { }
    }
}

watch(() => props.audio?.audio?.id, () => {
    coverSrc.value = undefined;
    loadCover();
});

onMounted(loadCover);
</script>

<style scoped>
.audio-cover-button:active {
    transform: scale(0.96);
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
    .audio-progress {
        transition: none;
    }
}
</style>
