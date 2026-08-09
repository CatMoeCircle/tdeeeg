<template>
    <Teleport to="body">
        <!-- 遮罩层 -->
        <Transition name="overlay-fade">
            <div v-if="player.showOverlay" class="fixed inset-0 z-9998 flex items-end sm:items-center justify-center"
                @click.self="player.toggleOverlay()">
                <!-- 背景遮罩 -->
                <div class="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>

                <!-- 面板 -->
                <div
                    class="relative w-full sm:w-95 max-h-[90vh] sm:rounded-2xl rounded-t-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden flex flex-col">
                    <!-- 手柄（移动端拖动提示） -->
                    <div class="sm:hidden flex justify-center pt-2 pb-1">
                        <div class="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                    </div>

                    <!-- 头部 -->
                    <div class="flex items-center justify-between px-5 pt-4 pb-2">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">音乐播放器</h3>
                        <button @click="player.toggleOverlay()"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-400">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 当前歌曲信息 -->
                    <div class="px-5 py-3 flex items-center gap-4">
                        <div
                            class="w-16 h-16 rounded-xl bg-linear-to-br from-blue-400 to-purple-500 flex items-center justify-center shrink-0 shadow-lg overflow-hidden">
                            <img v-if="player.currentTrack?.coverPath" :src="player.currentTrack.coverPath"
                                class="w-full h-full object-cover" @error="onCoverError" />
                            <MusicIcon v-else class="w-8 h-8 text-white/80" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                                <GlobalEmojiText :text="player.currentTrack?.title || '未播放'" />
                            </p>
                            <p class="text-sm text-gray-500 truncate mt-0.5">
                                <GlobalEmojiText :text="player.currentTrack?.performer || ''" />
                            </p>
                        </div>
                    </div>

                    <!-- 进度条：可拖拽，拖动实时 seek，无过渡动画（实时跟手） -->
                    <div class="px-5 py-2">
                        <div class="relative h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer group"
                            @mousedown="handleProgressStart">
                            <div class="h-full bg-blue-500 rounded-full"
                                :style="{ width: displayProgress + '%' }"></div>
                            <div class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-blue-500 shadow border-2 border-white dark:border-gray-800 opacity-0 group-hover:opacity-100"
                                :style="{ left: displayProgress + '%' }"></div>
                        </div>
                        <div class="flex justify-between mt-1.5">
                            <span class="text-xs text-gray-400">{{ formatTime(player.currentTime) }}</span>
                            <span class="text-xs text-gray-400">{{ formatTime(player.currentTrack?.duration || 0)
                            }}</span>
                        </div>
                    </div>

                    <!-- 控制按钮 -->
                    <div class="flex items-center justify-center gap-4 px-5 py-3">
                        <!-- 循环模式 -->
                        <button @click="player.cycleRepeatMode()"
                            class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            :class="repeatIconClass" :title="repeatTitle">
                            <component :is="repeatIcon" class="w-4.5 h-4.5" />
                        </button>

                        <!-- 上一首 -->
                        <button @click="player.prevTrack()"
                            class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                            <SkipBackIcon class="w-5 h-5" />
                        </button>

                        <!-- 播放/暂停 -->
                        <button @click="player.togglePlay()"
                            class="w-14 h-14 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 transition-colors text-white shadow-lg shadow-blue-500/30">
                            <PlayIcon v-if="!player.isPlaying" class="w-6 h-6 ml-1" />
                            <PauseIcon v-else class="w-6 h-6" />
                        </button>

                        <!-- 下一首 -->
                        <button @click="player.nextTrack()"
                            class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                            <SkipForwardIcon class="w-5 h-5" />
                        </button>

                        <!-- 音量 -->
                        <div class="relative group/vol">
                            <button @click="toggleMute"
                                class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                                <Volume2Icon v-if="player.volume > 0.5" class="w-4.5 h-4.5" />
                                <Volume1Icon v-else-if="player.volume > 0" class="w-4.5 h-4.5" />
                                <VolumeXIcon v-else class="w-4.5 h-4.5" />
                            </button>
                            <!-- 音量滑块：去掉 mb-2 空隙，hover 区域从按钮顶一直连续到滑块，
                                 避免鼠标上移途中脱离按钮 hover 导致滑块消失 -->
                            <div
                                class="absolute bottom-full left-1/2 -translate-x-1/2 hidden group-hover/vol:flex flex-col items-center py-2 px-1 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600">
                                <input type="range" min="0" max="1" step="0.05"
                                    class="w-16 h-1 appearance-none cursor-pointer bg-gray-300 dark:bg-gray-500 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                                    :value="player.volume" @input="onVolumeChange" />
                            </div>
                        </div>
                    </div>

                    <!-- 播放列表 -->
                    <div
                        class="flex-1 overflow-y-auto custom-scrollbar border-t border-gray-100 dark:border-gray-700 mt-2">
                        <div class="px-4 py-2 flex items-center justify-between">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">播放列表 ({{
                                player.playlist.length }})</span>
                        </div>
                        <div class="pb-2">
                            <div v-for="(track, idx) in player.playlist" :key="track.messageId"
                                @click="player.playTrack(idx)"
                                class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                :class="{ 'bg-blue-50 dark:bg-blue-900/20': idx === player.currentIndex }">
                                <div
                                    class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                                    <img v-if="track.coverPath" :src="track.coverPath"
                                        class="w-full h-full object-cover" @error="onListCoverError($event, track)" />
                                    <MusicIcon v-else class="w-4 h-4 text-gray-500" />
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate"
                                        :class="{ 'text-blue-600 dark:text-blue-400': idx === player.currentIndex }">
                                        <GlobalEmojiText :text="track.title" />
                                    </p>
                                    <p class="text-xs text-gray-500 truncate"><GlobalEmojiText :text="track.performer" /></p>
                                </div>
                                <span class="text-xs text-gray-400 shrink-0">{{ formatTime(track.duration) }}</span>
                                <div v-if="idx === player.currentIndex && player.isPlaying"
                                    class="flex gap-0.5 items-center shrink-0">
                                    <span class="w-0.5 h-3 bg-blue-500 rounded-full animate-equalizer"
                                        style="animation-delay: 0s"></span>
                                    <span class="w-0.5 h-4 bg-blue-500 rounded-full animate-equalizer"
                                        style="animation-delay: 0.15s"></span>
                                    <span class="w-0.5 h-2.5 bg-blue-500 rounded-full animate-equalizer"
                                        style="animation-delay: 0.3s"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon,
    XIcon, MusicIcon, Volume2Icon, Volume1Icon, VolumeXIcon,
    RepeatIcon, Repeat1Icon, ShuffleIcon, ListOrderedIcon,
} from 'lucide-vue-next';
import { useAudioPlayerStore } from '../../store/audioPlayer';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';

const player = useAudioPlayerStore();
const previousVolume = ref(1);

/** 拖拽中即时显示的进度 (0~1)，拖动时优先使用本地值，松手后回退到 store */
const dragRatio = ref<number | null>(null);

/** 实际渲染用的进度百分比：拖拽时用本地 dragRatio（跟手），否则用播放进度 */
const displayProgress = computed(() => {
    if (dragRatio.value !== null) return dragRatio.value * 100;
    const track = player.currentTrack;
    if (!track || track.duration === 0) return 0;
    return Math.min((player.currentTime / track.duration) * 100, 100);
});

/** 根据鼠标 X 计算进度比例 (0~1) */
function calcRatio(el: HTMLElement, clientX: number): number {
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

/** 进度条拖拽：拖动只更新跟手位置，松手（onUp）时才真正 seek */
function handleProgressStart(e: MouseEvent) {
    const bar = e.currentTarget as HTMLElement;

    const update = (clientX: number) => {
        dragRatio.value = calcRatio(bar, clientX);
    };

    update(e.clientX);

    const onMove = (ev: MouseEvent) => {
        ev.preventDefault();
        update(ev.clientX);
    };

    const onUp = () => {
        if (dragRatio.value !== null && player.currentTrack) {
            player.seek(dragRatio.value * player.currentTrack.duration);
        }
        dragRatio.value = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

const repeatIcon = computed(() => {
    switch (player.repeatMode) {
        case 'one': return Repeat1Icon;
        case 'all': return RepeatIcon;
        case 'shuffle': return ShuffleIcon;
        default: return ListOrderedIcon; // none：顺序播放
    }
});

const repeatIconClass = computed(() => {
    if (player.repeatMode === 'none') return 'text-gray-400 dark:text-gray-500';
    return 'text-blue-500';
});

const repeatTitle = computed(() => {
    switch (player.repeatMode) {
        case 'none': return '顺序播放';
        case 'one': return '单曲循环';
        case 'all': return '列表循环';
        case 'shuffle': return '随机播放';
    }
});

function onVolumeChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    player.setVolume(val);
}

function toggleMute() {
    if (player.volume > 0) {
        previousVolume.value = player.volume;
        player.setVolume(0);
    } else {
        player.setVolume(previousVolume.value || 0.8);
    }
}

function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function onCoverError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
}

/** 播放列表项封面加载失败：清空该 track 的 coverPath，回退到音乐图标 */
function onListCoverError(e: Event, track: { coverPath?: string }) {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
    // Vue 会因 coverPath 已删除而重新走 v-else（MusicIcon）分支
    (track as { coverPath?: string }).coverPath = undefined;
}
</script>

<style scoped>
.overlay-fade-enter-active,
.overlay-fade-leave-active {
    transition: opacity 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
    opacity: 0;
}

@keyframes equalizer {

    0%,
    100% {
        height: 4px;
    }

    50% {
        height: 12px;
    }
}

.animate-equalizer {
    animation: equalizer 0.8s ease-in-out infinite alternate;
}
</style>
