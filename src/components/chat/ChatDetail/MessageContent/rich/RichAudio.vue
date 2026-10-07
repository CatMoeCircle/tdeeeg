<template>
    <figure ref="rootEl" class="my-1.5">
        <div
            class="relative flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg bg-black/5 dark:bg-white/10 p-2">
            <!-- 封面 + 播放按钮 -->
            <div class="relative h-12 w-12 shrink-0">
                <div class="group relative h-full w-full overflow-hidden rounded-xl bg-blue-100 dark:bg-blue-950">
                    <img v-if="coverSrc" :src="coverSrc" :alt="audioTitle"
                        class="h-full w-full select-none object-cover" @error="coverSrc = undefined" />
                    <div v-else class="flex h-full w-full items-center justify-center">
                        <MusicIcon class="h-5 w-5 text-blue-500 dark:text-blue-300" />
                    </div>
                    <button type="button"
                        class="audio-cover-button absolute inset-0 flex items-center justify-center bg-black/20 text-white transition-colors hover:bg-black/30"
                        :aria-label="isGloballyPlaying ? t('lng_mac_menu_player_pause') : t('content.play')" @click="togglePlayback">
                        <PauseIcon v-if="isGloballyPlaying" class="h-5 w-5 fill-current" />
                        <PlayIcon v-else class="ml-0.5 h-5 w-5 fill-current" />
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
                <!-- 当前曲目（含暂停）一直显示进度条，切换到其他曲目才恢复作者名；作者行 py-[3px] 补足到与滑块相同的 22px 行高 -->
                <SmoothSlider v-if="isCurrentTrack" :model-value="progressValue" :max-value="displayDuration"
                    :max-overflow="0" :disabled="displayDuration <= 0" @update:model-value="onProgressUpdate"
                    @change="onProgressCommit" />
                <span v-else class="truncate py-[3px] text-xs text-gray-500 dark:text-gray-400">{{ audio?.performer ||
                    t('content.unknownArtist') }}</span>
                <div class="mt-1 text-[10px] leading-none tabular-nums text-gray-400 dark:text-gray-500">
                    {{ formatDuration(progressValue) }} / {{ formatDuration(displayDuration) }}
                </div>
            </div>
        </div>
        <RichCaption v-if="caption" :caption="caption" />
    </figure>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, onMounted, ref, watch } from 'vue';
import type { audio, pageBlockCaption, thumbnail } from 'tdlib-types';
import { MusicIcon, PauseIcon, PlayIcon } from 'lucide-vue-next';
import { tdlibSend, isFileReady } from '../../../../../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { isThumbnailImgRenderable } from '../../../../../utils/thumbnail';
import { fetchItunesCoverForAudio } from '../../../../../utils/itunesCover';
import { useAudioPlayerStore } from '../../../../../store/audioPlayer';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import RichMediaDownload from './RichMediaDownload.vue';
import RichCaption from './RichCaption.vue';
import SmoothSlider from '../../../../common/SmoothSlider.vue';

const props = defineProps<{
    audio?: audio | null;
    caption?: pageBlockCaption | null;
    chatId?: number;
    messageId?: number;
}>();

const audioPlayer = useAudioPlayerStore();

const rootEl = ref<HTMLElement | null>(null);
const coverSrc = ref<string | undefined>(undefined);

const audioTitle = computed(() => {
    const a = props.audio;
    if (!a) return t('content.audioFallback');
    const parts = [a.performer, a.title].filter(Boolean);
    if (parts.length) return parts.join(' - ');
    return a.file_name || t('content.audioFallback');
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

/** 拖拽中的本地秒数：拖动时跟手，松手 seek 后清空回退到 store */
const dragValue = ref<number | null>(null);

/** 进度条与时间展示值：拖拽时优先用拖拽值 */
const progressValue = computed(() => dragValue.value ?? displayTime.value);

function onProgressUpdate(value: number) {
    dragValue.value = value;
}

function onProgressCommit(value: number) {
    audioPlayer.seek(value);
    dragValue.value = null;
}

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

function formatDuration(seconds: number) {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

/** 加载代次：audio 变化时自增，丢弃过期异步封面写回，避免封面窜到另一首音频 */
let coverLoadSeq = 0;

/** 加载专辑封面：minithumbnail → 内嵌缩略图 → iTunes Search（不再下载 external_album_covers） */
async function loadCover() {
    const a = props.audio;
    if (!a) return;
    const seq = coverLoadSeq;
    const audioFileId = a.audio?.id;
    // file.id 可能在 TDLib 会话内被复用：记住期望的 remote.id
    const expectedRemoteId = a.album_cover_thumbnail?.file?.remote?.id;

    coverSrc.value = a.album_cover_minithumbnail?.data
        ? `data:image/jpeg;base64,${a.album_cover_minithumbnail.data}`
        : undefined;

    const imgRenderable = (t: thumbnail | undefined): t is thumbnail =>
        !!t && isThumbnailImgRenderable(t.format) && !!t.file.local?.can_be_downloaded;

    const primary = imgRenderable(a.album_cover_thumbnail) ? a.album_cover_thumbnail : undefined;

    if (primary) {
        const file = primary.file;
        if (isFileReady(file)) {
            if (seq !== coverLoadSeq || props.audio?.audio?.id !== audioFileId) return;
            coverSrc.value = convertFileSrc(file.local.path);
            return;
        }
        try {
            const downloaded = await tdlibSend({
                _: 'downloadFile',
                file_id: file.id,
                priority: DL_PRIORITY.THUMBNAIL,
                offset: 0,
                limit: 0,
                synchronous: true,
            });
            if (seq !== coverLoadSeq || props.audio?.audio?.id !== audioFileId) return;
            // remote.id 不一致 = file.id 被复用，丢弃结果避免窜图
            if (expectedRemoteId && downloaded?.remote?.id && downloaded.remote.id !== expectedRemoteId) return;
            if (isFileReady(downloaded)) {
                coverSrc.value = convertFileSrc(downloaded.local.path);
                return;
            }
        } catch (_) { }
    }

    // 内嵌封面为空/下载失败 → iTunes Search；无结果则保持当前（minithumbnail 或空）
    const itunes = await fetchItunesCoverForAudio(a);
    if (seq !== coverLoadSeq) return;
    if (itunes && props.audio?.audio?.id === audioFileId) coverSrc.value = itunes;
}

/** 立即设置 base64 封面预览（不下载），供离屏富文本音频显示占位。 */
function setCoverPreview() {
    coverSrc.value = props.audio?.album_cover_minithumbnail?.data
        ? `data:image/jpeg;base64,${props.audio.album_cover_minithumbnail.data}`
        : undefined;
}

// 视口门控：进入视口才下载专辑封面；未进入只显示 base64 预览。
const { start: startViewportLoad, entered: audioEntered } = useViewportLoad(rootEl, () => {
    return loadCover();
});
watch(() => props.audio?.audio?.id, () => {
    coverLoadSeq++;
    setCoverPreview();
    if (audioEntered.value) loadCover();
}, { immediate: true });

onMounted(() => {
    startViewportLoad();
});
</script>

<style scoped>
.audio-cover-button:active {
    transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {

    .audio-cover-button {
        transition: none;
    }
}
</style>
