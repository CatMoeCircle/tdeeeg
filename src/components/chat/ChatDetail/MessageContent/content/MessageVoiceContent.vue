<template>
    <!-- Voice Note -->
    <div v-if="content._ === 'messageVoiceNote'" ref="rootEl" class="flex min-w-0 max-w-full flex-col">
        <div class="flex items-start gap-2">
            <!-- 左：播放/暂停，未下载时带下载角标（与音乐消息一致） -->
            <div class="relative h-12 w-12 shrink-0">
                <button type="button"
                    class="flex h-full w-full items-center justify-center rounded-full bg-blue-500 text-white transition-transform active:scale-95"
                    :aria-label="isGloballyPlaying ? t('lng_mac_menu_player_pause') : t('content.play')"
                    @click="togglePlayback">
                    <PauseIcon v-if="isGloballyPlaying" class="h-5 w-5 fill-current" />
                    <PlayIcon v-else class="ml-0.5 h-5 w-5 fill-current" />
                </button>
                <span v-if="!mediaSrc"
                    class="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow-sm dark:border-gray-800 pointer-events-none">
                    <DownloadIcon class="h-2.5 w-2.5" stroke-width="2.5" />
                </span>
            </div>

            <!-- 中：5-bit 波形 + 时长/未听标记 -->
            <!-- 展开识别文本后随消息气泡变宽（flex-1），否则按时长固定宽度 -->
            <div class="flex min-w-0 flex-col"
                :class="transcriptOpen ? 'flex-1' : ''"
                :style="{ minWidth: waveWidth + 'px', width: transcriptOpen ? undefined : waveWidth + 'px' }">
                <div ref="waveEl" class="flex h-6 cursor-pointer items-center gap-[2px]" @click="onWaveClick">
                    <span v-for="(bar, i) in waveBars" :key="i"
                        class="w-[2px] shrink-0 rounded-full bg-blue-500 transition-opacity"
                        :class="[i / waveBars.length < progress ? 'opacity-100' : 'opacity-40', transcribing ? 'animate-pulse' : '']"
                        :style="{ height: bar + 'px', animationDelay: transcribing ? `${i * 60}ms` : undefined }"></span>
                </div>
                <div class="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    <span>{{ timeLabel }}</span>
                    <span v-if="!content.is_listened" class="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                </div>
            </div>

            <!-- 右：转文字（可识别时显示） -->
            <button v-if="canRecognize" type="button"
                class="relative flex h-6 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-500 transition-colors hover:bg-blue-500/25 active:scale-95"
                :aria-label="t('content.transcribe')" @click="toggleTranscript">
                <!-- 识别文本已展开：向上箭头，点击收起后恢复原图标 -->
                <ArrowUpIcon v-if="transcriptOpen && transcriptState?._ === 'speechRecognitionResultText'" class="h-4 w-4" />
                <span v-else class="tgico tgico-transcribe text-[16px]" />
                <!-- 识别中：围绕按钮外沿转圈的纯色描边 -->
                <span v-if="transcribing"
                    class="pointer-events-none absolute -inset-0.5 animate-spin rounded-lg border-2 border-blue-500 border-t-transparent" />
            </button>
        </div>

        <!-- 识别结果：整行显示 -->
        <p v-if="transcriptOpen" class="mt-1 whitespace-pre-wrap text-sm"
            :class="transcriptState?._ === 'speechRecognitionResultError' ? 'text-gray-500 dark:text-gray-400' : ''">
            {{ transcriptDisplay }}
        </p>
        <MessageTextContent v-if="content.caption?.text" :formattedText="content.caption" :chatId="chatId"
            :messageId="messageId" class="mt-1" />
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { messageVoiceNote, messageVideoNote, file, message } from 'tdlib-types';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { VideoIcon, PlayIcon, PauseIcon, DownloadIcon, ArrowUpIcon } from 'lucide-vue-next';
import MessageTextContent from './MessageTextContent.vue';
import RichMediaDownload from '../rich/RichMediaDownload.vue';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { shouldAutoDownloadFiles, shouldAutoDownloadVideos } from '../../../../../utils/autoDownload';
import { useDownloadStore } from '../../../../../store/downloads';
import { useAudioPlayerStore } from '../../../../../store/audioPlayer';
import { getMessageProperties } from '../../../../../components/contextMenu/messageActions';

const props = defineProps<{
    content: messageVoiceNote | messageVideoNote;
    chatId?: number;
    messageId?: number;
}>();

const { t } = useI18n();
const downloadStore = useDownloadStore();
const audioPlayer = useAudioPlayerStore();
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

/** 5-bit 波形解码（TDLib 给 base64，每个采样 5 bit、LSB 优先打包） */
function decodeWaveform(b64: string): number[] {
    const bin = atob(b64);
    const out: number[] = [];
    for (let i = 0; i < Math.floor((bin.length * 8) / 5); i++) {
        const bit = i * 5;
        const byte = bit >> 3;
        const hi = byte + 1 < bin.length ? bin.charCodeAt(byte + 1) : 0;
        out.push(((bin.charCodeAt(byte) | (hi << 8)) >> (bit & 7)) & 31);
    }
    return out;
}

/** 波形宽度：与 Unigram ProgressVoice 一致（时长 2s→72px，30s→226px 线性插值） */
const waveWidth = computed(() => {
    const d = Math.max(2, Math.min(30, duration.value));
    return Math.round(72 + (226 - 72) * (d - 2) / 28);
});

/** 波形行实际宽度（随气泡变化时重算竖条数量） */
const waveEl = ref<HTMLElement | null>(null);
const measuredWidth = ref(0);
let waveResizeObserver: ResizeObserver | undefined;
onMounted(() => {
    if (!waveEl.value) return;
    waveResizeObserver = new ResizeObserver(([entry]) => {
        measuredWidth.value = entry.contentRect.width;
    });
    waveResizeObserver.observe(waveEl.value);
});
onUnmounted(() => waveResizeObserver?.disconnect());

/** 按宽度重采样为竖条高度（px） */
const waveBars = computed<number[]>(() => {
    if (props.content._ !== 'messageVoiceNote') return [];
    const samples = decodeWaveform(props.content.voice_note.waveform);
    // 每根竖条 2px + 2px 间距，共 n 根占 4n-2px，取整保证不超出实际宽度
    const n = Math.max(1, Math.floor(((measuredWidth.value || waveWidth.value) + 2) / 4));
    if (!samples.length) return Array<number>(n).fill(3);
    return Array.from({ length: n }, (_, i) => {
        const v = samples[Math.floor(i * samples.length / n)] ?? 0;
        return Math.max(3, Math.round((v / 31) * 18));
    });
});

/* ---------- 播放：复用全局音频播放器（与音乐消息一致） ---------- */

const isCurrentTrack = computed(() => props.content._ === 'messageVoiceNote' && props.messageId != null
    && audioPlayer.currentTrack?.messageId === props.messageId && audioPlayer.currentTrack?.chatId === props.chatId);
const isGloballyPlaying = computed(() => isCurrentTrack.value && audioPlayer.isPlaying);
const trackDuration = computed(() => isCurrentTrack.value && audioPlayer.currentTrack?.duration
    ? audioPlayer.currentTrack.duration : duration.value);
const progress = computed(() => isCurrentTrack.value && trackDuration.value > 0
    ? Math.min(1, audioPlayer.currentTime / trackDuration.value) : 0);

function fmtTime(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** 当前曲目显示剩余时长，否则显示总时长 */
const timeLabel = computed(() => fmtTime(isCurrentTrack.value
    ? Math.max(0, trackDuration.value - audioPlayer.currentTime) : duration.value));

async function togglePlayback() {
    const c = props.content;
    if (c._ !== 'messageVoiceNote') return;
    if (isCurrentTrack.value) {
        audioPlayer.togglePlay();
        return;
    }
    // 语音包装为 messageAudio 交给全局播放器（同 RichAudio 的做法）
    const v = c.voice_note;
    const msg = {
        _: 'message', id: props.messageId ?? 0, chat_id: props.chatId ?? 0,
        content: {
            _: 'messageAudio', caption: c.caption, is_pinned: false,
            audio: {
                _: 'audio', duration: v.duration, title: '', performer: '', mime_type: 'audio/ogg',
                file_name: `voice_${v.voice.id}.ogg`, album_cover_minithumbnail: null,
                album_cover_thumbnail: null, external_album_covers: [], audio: v.voice,
            },
        },
    } as unknown as message;
    await audioPlayer.playMessageAudio(msg);
}

/** 点击波形：当前曲目则跳转进度，否则开始播放 */
function onWaveClick(e: MouseEvent) {
    if (!isCurrentTrack.value) {
        void togglePlayback();
        return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audioPlayer.seek(ratio * trackDuration.value);
}

/* ---------- 语音转文字（结果写回 voice_note.speech_recognition_result） ---------- */

/** 是否可转文字：TDLib messageProperties.can_recognize_speech（已含 Premium / 时长等条件）。
 *  缓存是非响应式 Map，这里异步拉取后写入 ref，保证按钮出现。 */
const canRecognize = ref(false);
watch(() => [props.chatId, props.messageId] as const, async ([cid, mid]) => {
    canRecognize.value = false;
    if (props.content._ !== 'messageVoiceNote' || !cid || !mid) return;
    const p = await getMessageProperties(cid, mid);
    canRecognize.value = p?.can_recognize_speech === true;
}, { immediate: true });
const transcriptOpen = ref(false);
const transcriptState = computed(() => props.content._ === 'messageVoiceNote'
    ? props.content.voice_note.speech_recognition_result : undefined);
/** 识别进行中：展开且尚无最终结果（波形闪烁 + 按钮加载环） */
const transcribing = computed(() => transcriptOpen.value
    && (!transcriptState.value || transcriptState.value._ === 'speechRecognitionResultPending'));
const transcriptDisplay = computed(() => {
    const r = transcriptState.value;
    if (r?._ === 'speechRecognitionResultText') return r.text;
    if (r?._ === 'speechRecognitionResultError') return t('content.noWordsRecognized');
    if (r?._ === 'speechRecognitionResultPending' && r.partial_text) return r.partial_text;
    return t('content.transcribing');
});

async function toggleTranscript() {
    if (props.content._ !== 'messageVoiceNote' || !props.chatId || !props.messageId) return;
    transcriptOpen.value = !transcriptOpen.value;
    if (!transcriptOpen.value || transcriptState.value) return;
    try {
        await tdlibSend({ _: 'recognizeSpeech', chat_id: props.chatId, message_id: props.messageId });
    } catch (e: any) {
        console.error('recognizeSpeech failed:', e);
        transcriptOpen.value = false; // 失败则收起，避免一直转圈
        MessagePlugin.error(e?.message || t('chat.transcriptFailed'));
    }
}

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

    // 就绪资源直接使用（加载时判断，不依赖视口）
    if (isFileReady(f) && f.local.path) {
        mediaSrc.value = convertFileSrc(f.local.path);
        return;
    }
    // 未就绪：仅在允许自动下载时发起下载
    if (f.local.can_be_downloaded && !f.local.is_downloading_active) {
        if (!canAutoDownload()) return;
        await downloadFile(f.id);
    }
};

/** 加载时立刻套用 content 内已就绪的语音/视频留言文件 */
function applyNoteReadyFromContent() {
    const f = getFile();
    if (f && isFileReady(f) && f.local.path) {
        mediaSrc.value = convertFileSrc(f.local.path);
        return true;
    }
    return false;
}

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
        // 按 File + remote.id 查询完成态，避免 session id 复用误判就绪
        return downloadStore.getDownloadInfoForFile(f)?.is_completed === true || isFileReady(f);
    },
    (ready) => {
        if (ready && noteFile.value?.id && !mediaSrc.value) {
            void applyReadyFile(noteFile.value.id);
        }
    },
);

// 视口门控仅用于触发下载；就绪文件在加载时直接使用
const { start: startViewportLoad, entered: noteEntered } = useViewportLoad(rootEl, () => {
    return loadMedia();
});
watch(() => props.content, () => {
    noteLoadSeq++;
    mediaSrc.value = undefined;
    isDownloading.value = false;
    setNotePreview();
    // 就绪资源加载时直接使用，不经过视口
    applyNoteReadyFromContent();
    // 未就绪且已在视口时才走下载
    if (noteEntered.value) void loadMedia();
}, { immediate: true });
onMounted(() => {
    applyNoteReadyFromContent();
    startViewportLoad();
});
</script>
