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
    <!-- 圆形裁剪（VideoNoteContent 的 Ellipse），点击播放/暂停 -->
    <!-- 圆形视频（官方样式）：无气泡；圆形画面 + 左下倒计时/未看点 + 右下「观看数 · 时间」胶囊。
         转文字与评论按钮在消息右侧（MessageSideActions）；识别结果显示在画面下方 -->
    <div v-else-if="content._ === 'messageVideoNote'" ref="rootEl"
        class="flex min-w-0 max-w-full flex-col transition-all duration-300"
        :class="transcriptOpen ? 'rounded-2xl bg-white px-2 py-1.5 shadow-sm dark:bg-gray-800' : ''">
        <div class="flex items-start gap-2">
            <!-- 圆形画面：关闭时 128px 带覆盖层；转文字后缩小到 48px（语音播放圆圈位置） -->
            <div class="relative shrink-0 transition-all duration-300 ease-out"
                :style="{ width: noteSize + 'px', height: noteSize + 'px' }">
                <div class="relative h-full w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <video v-if="mediaSrc" ref="noteVideoEl" :src="mediaSrc" playsinline loop preload="metadata" :muted="noteMuted"
                        class="h-full w-full cursor-pointer object-cover" @click.stop="toggleNote"
                        @play="notePlaying = true" @pause="notePlaying = false"
                        @timeupdate="onNoteTime" @ended="noteEnded"></video>
                    <template v-else>
                        <img v-if="previewSrc" :src="previewSrc" class="h-full w-full object-cover opacity-60" />
                        <div v-else class="flex h-full w-full items-center justify-center">
                            <VideoIcon class="h-6 w-6 text-gray-500" />
                        </div>
                    </template>
                </div>
                <!-- 进度环：仅展开显示；只让环形轨道可交互，中央点击仍由视频/播放键接管 -->
                <!-- 环先随动画挂载但保持透明，300ms 后再显示；避免展开动画未结束就提前出现 -->
                <svg v-if="!transcriptOpen && noteExpanded" fill="none"
                    class="pointer-events-none absolute touch-none transition-all duration-300 ease-out"
                    :class="[ringVisible ? 'opacity-100' : 'opacity-0', ringInteracting ? 'cursor-pointer' : '']"
                    :style="ringStyle" viewBox="0 0 100 100"
                    @pointerenter="onRingEnter" @pointerleave="onRingLeave"
                    @pointerdown="onRingDown" @pointermove="onRingMove" @pointerup="onRingUp" @pointercancel="onRingUp">
                    <!-- 轨道 -->
                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.35)" pointer-events="none"
                        :stroke-width="ringInteracting ? 1.5 : 1" />
                    <!-- 加宽的透明命中区：只命中环形轨道；svg 根节点 pointer-events-none，圆心点击穿透到视频 -->
                    <circle cx="50" cy="50" r="45" fill="none" stroke="transparent" stroke-width="8" pointer-events="stroke" />
                    <!-- 已播放进度 -->
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-linecap="round" pathLength="100"
                        stroke-dasharray="100" :stroke-width="ringInteracting ? 2 : 1.5"
                        :stroke-dashoffset="100 - noteProgress * 100" transform="rotate(-90 50 50)" pointer-events="none" />
                    <!-- 端点：仅悬停或拖动时显示，缩小避免遮挡视频 -->
                    <circle v-if="ringInteracting" :cx="ringKnob.x" :cy="ringKnob.y" :r="ringActive ? 3.5 : 2.75"
                        fill="#ffffff" pointer-events="none" />
                </svg>
                <!-- 展开 / 收起（放大圆形画面） -->
                <button v-if="!transcriptOpen" type="button"
                    class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
                    @click.stop="noteExpanded = !noteExpanded">
                    <Minimize2Icon v-if="noteExpanded" class="h-3.5 w-3.5" />
                    <Maximize2Icon v-else class="h-3.5 w-3.5" />
                </button>
                <!-- 未播放时的中央播放键（缩小后同步缩小） -->
                <button v-if="mediaSrc && !notePlaying" type="button"
                    class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-all duration-300"
                    :class="transcriptOpen ? 'h-6 w-6' : 'h-10 w-10'"
                    :aria-label="t('content.play')" @click="toggleNote">
                    <PlayIcon :class="transcriptOpen ? 'ml-px h-3 w-3 fill-current' : 'ml-0.5 h-5 w-5 fill-current'" />
                </button>
                <template v-if="!transcriptOpen">
                    <!-- 左下：倒计时（播放中为剩余时长，未播放为总时长）；未看时带蓝点 -->
                    <span class="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5 text-xs tabular-nums text-white">
                        {{ fmtTime(noteRemaining) }}
                        <span v-if="content._ === 'messageVideoNote' && !content.is_viewed" class="h-1.5 w-1.5 rounded-full bg-white"></span>
                    </span>
                    <!-- 右下：观看数 + 发送时间（同官方胶囊） -->
                    <span class="pointer-events-none absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs tabular-nums text-white">
                        <template v-if="viewCount > 0">
                            <EyeIcon class="h-3 w-3" />
                            <span>{{ viewCount }}</span>
                        </template>
                        <span>{{ timeOfDay }}</span>
                    </span>
                </template>
                <RichMediaDownload v-if="!mediaSrc && noteFile" :file="noteFile" :file-name="`video_note_${noteFile.id}.mp4`"
                    file-type="video" :chat-id="chatId" :message-id="messageId" overlay />
            </div>
            <!-- 展开后：语音式中栏（视频自带波形 + 剩余时长） -->
            <div v-if="transcriptOpen" class="flex min-w-0 flex-col" :style="{ width: waveWidth + 'px' }">
                <div class="flex h-6 cursor-pointer items-center gap-[2px]" @click="onNoteWaveClick">
                    <span v-for="(bar, i) in waveBars" :key="i"
                        class="w-[2px] shrink-0 rounded-full bg-blue-500 transition-opacity"
                        :class="[i / waveBars.length < noteProgress ? 'opacity-100' : 'opacity-40', transcribing ? 'animate-pulse' : '']"
                        :style="{ height: bar + 'px', animationDelay: transcribing ? `${i * 60}ms` : undefined }"></span>
                </div>
                <div class="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    <span>{{ fmtTime(noteRemaining) }}</span>
                    <span v-if="content._ === 'messageVideoNote' && !content.is_viewed" class="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                </div>
            </div>
            <!-- 收起按钮：与语音消息的转文字按钮同款（展开后替代右侧小按钮） -->
            <button v-if="transcriptOpen && canRecognize" type="button"
                class="relative flex h-6 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-500 transition-colors hover:bg-blue-500/25 active:scale-95"
                :aria-label="t('content.transcribe')" @click="toggleTranscript">
                <ArrowUpIcon v-if="transcriptState?._ === 'speechRecognitionResultText'" class="h-4 w-4" />
                <span v-else class="tgico tgico-transcribe text-[16px]" />
                <span v-if="transcribing"
                    class="pointer-events-none absolute -inset-0.5 animate-spin rounded-lg border-2 border-blue-500 border-t-transparent" />
            </button>
        </div>
        <!-- 识别结果：气泡内，位于波形行之下 -->
        <p v-if="transcriptOpen" class="mt-1 whitespace-pre-wrap text-sm"
            :class="transcriptState?._ === 'speechRecognitionResultError' ? 'text-gray-500 dark:text-gray-400' : ''">
            {{ transcriptDisplay }}
        </p>
        <!-- 展开后底部：观看数 + 时间（与官方一致，位于气泡右下） -->
        <div v-if="transcriptOpen" class="mt-1 flex items-center justify-end gap-1 text-xs tabular-nums text-gray-400">
            <template v-if="viewCount > 0">
                <EyeIcon class="h-3 w-3" />
                <span>{{ viewCount }}</span>
            </template>
            <span>{{ timeOfDay }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { messageVoiceNote, messageVideoNote, file, message } from 'tdlib-types';
import { useI18n } from 'vue-i18n';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { toast } from '../../../../../utils/toast';
import { VideoIcon, PlayIcon, PauseIcon, DownloadIcon, EyeIcon, ArrowUpIcon, Maximize2 as Maximize2Icon, Minimize2 as Minimize2Icon } from 'lucide-vue-next';
import { getMessageProperties } from '../../../../../components/contextMenu/messageActions';
import { openTranscripts, transcriptKey } from '../../../../../composables/speechTranscript';
import MessageTextContent from './MessageTextContent.vue';
import RichMediaDownload from '../rich/RichMediaDownload.vue';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { shouldAutoDownloadFiles, shouldAutoDownloadVideos } from '../../../../../utils/autoDownload';
import { useDownloadStore } from '../../../../../store/downloads';
import { useAudioPlayerStore } from '../../../../../store/audioPlayer';

const props = defineProps<{
    content: messageVoiceNote | messageVideoNote;
    chatId?: number;
    messageId?: number;
    /** 所属消息：圆形视频右下角显示观看数与发送时间 */
    message?: message;
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

/* ---------- 圆形视频留言：原生 video 播放，点击切换 ---------- */
const noteVideoEl = ref<HTMLVideoElement | null>(null);
const notePlaying = ref(false);
function toggleNote() {
    const v = noteVideoEl.value;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
}
/** 播放位置与总时长以 video 元数据为准；TDLib 整数秒只在元数据就绪前兜底 */
const noteCurrent = ref(0);
const noteDuration = ref(0);
const noteRemaining = computed(() => Math.max(0, effectiveDuration.value - noteCurrent.value));
function onNoteTime(e: Event) {
    const v = e.currentTarget as HTMLVideoElement;
    noteCurrent.value = v.currentTime;
    noteDuration.value = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
}
function noteEnded() {
    notePlaying.value = false;
    // 环走满后才交给 loop 从头播放，避免 TDLib 秒数与视频真实时长不一致导致提前满环
    noteCurrent.value = effectiveDuration.value;
}
/** 视频真实总时长：优先 video.duration，未加载元数据时退回 TDLib 时长 */
const effectiveDuration = computed(() => noteDuration.value || duration.value);
/** 波形进度：视频当前位置占真实总时长的比例（语音走全局音频播放器，视频留言走视频元素） */
const noteProgress = computed(() => effectiveDuration.value > 0 ? Math.min(1, noteCurrent.value / effectiveDuration.value) : 0);
/** 圆形画面尺寸：默认 200px，展开 280px，转文字后缩到 48px（语音播放圆圈位置） */
const noteExpanded = ref(false);
const noteSize = computed(() => transcriptOpen.value ? 48 : noteExpanded.value ? 280 : 200);
/** 未放大（含转文字缩小）时静音循环，放大后才出声 */
const noteMuted = computed(() => !noteExpanded.value || transcriptOpen.value);
/** 进度环拖动：按指针相对圆心的角度（从 12 点顺时针）计算进度，越过 12 点自然绕回 */
const ringActive = ref(false);
/** 进度环悬停：默认窄环无端点，悬停或拖动时才显示拖拽形态 */
const ringHover = ref(false);
const ringInteracting = computed(() => ringHover.value || ringActive.value);
/** 等待 280px 展开动画完成后才显示进度环 */
const ringVisible = ref(false);
watch(noteExpanded, (expanded) => {
    clearTimeout(ringVisibleTimer);
    if (!expanded) {
        ringVisible.value = false;
        return;
    }
    // 与模板 transition-all duration-300 对齐
    ringVisibleTimer = setTimeout(() => {
        if (noteExpanded.value) ringVisible.value = true;
    }, 300);
}, { immediate: true });
let ringVisibleTimer: ReturnType<typeof setTimeout> | undefined;
/** 进度环画在圆形画面内侧：与画面同尺寸叠放，轨道半径 45/50 留出约 8px 边距 */
const ringStyle = computed(() => ({
    left: '0px', top: '0px',
    width: noteSize.value + 'px', height: noteSize.value + 'px',
}));
/** 端点坐标（viewBox 0-100，从 12 点顺时针，半径 45 与轨道一致） */
const ringKnob = computed(() => {
    const a = noteProgress.value * 2 * Math.PI;
    return { x: 50 + 45 * Math.sin(a), y: 50 - 45 * Math.cos(a) };
});
function seekByRing(e: PointerEvent) {
    // 展开动画期间即使指针误命中也不 seek，中心/画面仍保持正常播放暂停
    if (!ringVisible.value) return;
    const v = noteVideoEl.value;
    if (!v || effectiveDuration.value <= 0) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let a = Math.atan2(dx, -dy);
    if (a < 0) a += 2 * Math.PI;
    v.currentTime = (a / (2 * Math.PI)) * effectiveDuration.value;
    noteCurrent.value = v.currentTime;
}
function onRingEnter() {
    ringHover.value = true;
}
function onRingLeave() {
    if (!ringActive.value) ringHover.value = false;
}
function onRingDown(e: PointerEvent) {
    ringActive.value = true;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    seekByRing(e);
}
function onRingMove(e: PointerEvent) {
    if (ringActive.value) seekByRing(e);
}
function onRingUp() {
    ringActive.value = false;
}
/** 点击波形跳转到对应位置 */
function onNoteWaveClick(e: MouseEvent) {
    const v = noteVideoEl.value;
    if (!v || effectiveDuration.value <= 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * effectiveDuration.value;
    noteCurrent.value = v.currentTime;
}
/** 右下胶囊：观看数（TDLib interaction_info，私聊可能没有）与发送时间 HH:mm */
const viewCount = computed(() => props.message?.interaction_info?.view_count ?? 0);
const timeOfDay = computed(() => props.message
    ? new Date(props.message.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : '');

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

/** 波形宽度：与 ProgressVoice 一致（时长 2s→72px，30s→226px 线性插值） */
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
    const b64 = props.content._ === 'messageVoiceNote' ? props.content.voice_note.waveform
        : props.content._ === 'messageVideoNote' ? props.content.video_note.waveform : '';
    if (!b64) return Array<number>(Math.max(1, Math.floor(((measuredWidth.value || waveWidth.value) + 2) / 4))).fill(3);
    const samples = decodeWaveform(b64);
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
    if (!cid || !mid) return;
    const p = await getMessageProperties(cid, mid);
    canRecognize.value = p?.can_recognize_speech === true;
}, { immediate: true });
/** 识别文本是否展开（共享状态，与 MessageSideActions 的圆形视频转文字互不冲突） */
const transcriptOpen = computed(() => props.chatId != null && props.messageId != null
    && openTranscripts.has(transcriptKey(props.chatId, props.messageId)));
const transcriptState = computed(() => props.content._ === 'messageVoiceNote'
    ? props.content.voice_note.speech_recognition_result
    : props.content._ === 'messageVideoNote' ? props.content.video_note.speech_recognition_result : undefined);
/** 识别进行中：展开且尚无最终结果（波形闪烁 + 按钮加载环） */
const transcribing = computed(() => transcriptOpen.value
    && (!transcriptState.value || transcriptState.value._ === 'speechRecognitionResultPending'));
async function toggleTranscript() {
    if (!props.chatId || !props.messageId) return;
    const k = transcriptKey(props.chatId, props.messageId);
    if (openTranscripts.has(k)) {
        openTranscripts.delete(k);
        return;
    }
    openTranscripts.add(k);
    if (transcriptState.value) return;
    try {
        await tdlibSend({ _: 'recognizeSpeech', chat_id: props.chatId, message_id: props.messageId });
    } catch (e: any) {
        console.error('recognizeSpeech failed:', e);
        openTranscripts.delete(k); // 失败则收起，避免一直转圈
        toast.error(e?.message || t('chat.transcriptFailed'));
    }
}
const transcriptDisplay = computed(() => {
    const r = transcriptState.value;
    if (r?._ === 'speechRecognitionResultText') return r.text;
    if (r?._ === 'speechRecognitionResultError') return t('content.noWordsRecognized');
    if (r?._ === 'speechRecognitionResultPending' && r.partial_text) return r.partial_text;
    return t('content.transcribing');
});

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
onUnmounted(() => clearTimeout(ringVisibleTimer));
</script>
