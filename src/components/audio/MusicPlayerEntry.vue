<template>
    <div v-if="player.showEntry && player.currentTrack" class="flex items-center gap-1.5 px-3 py-1.5 select-none"
        :class="[
            compact ? 'text-xs' : 'text-sm',
            bare ? '' : 'rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50'
        ]">
        <!-- 上一首 -->
        <button @click.stop="player.prevTrack()"
            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
            title="上一首">
            <SkipBackIcon class="w-3.5 h-3.5" />
        </button>

        <!-- 播放/暂停 -->
        <button @click.stop="player.togglePlay()"
            class="w-7 h-7 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 transition-colors text-white"
            title="播放/暂停">
            <PlayIcon v-if="!player.isPlaying" class="w-3.5 h-3.5 ml-0.5" />
            <PauseIcon v-else class="w-3.5 h-3.5" />
        </button>

        <!-- 下一首 -->
        <button @click.stop="player.nextTrack()"
            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
            title="下一首">
            <SkipForwardIcon class="w-3.5 h-3.5" />
        </button>

        <!-- 分隔线 -->
        <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1"></div>

        <!-- 歌曲信息 -->
        <div class="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer" @click.stop="player.toggleOverlay()">
            <div
                class="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                <img v-if="player.currentTrack?.coverPath" :src="player.currentTrack.coverPath"
                    class="w-full h-full object-cover" @error="onCoverError" />
                <MusicIcon v-else class="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div class="min-w-0 leading-tight">
                <p class="truncate font-medium text-gray-800 dark:text-gray-200"
                    :class="compact ? 'text-[11px]' : 'text-xs'">
                    {{ player.currentTrack.title }}
                </p>
                <p class="truncate text-gray-500" :class="compact ? 'text-[10px]' : 'text-[11px]'">
                    {{ player.currentTrack.performer }}
                </p>
            </div>
        </div>

        <!-- 进度条（简洁版） -->
        <div class="hidden sm:block w-16 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer shrink-0"
            @click.stop="handleProgressClick">
            <div class="h-full bg-blue-500 rounded-full transition-all duration-300" :style="progressStyle"></div>
        </div>

        <!-- 关闭 -->
        <button @click.stop="player.close()"
            class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
            title="关闭播放器">
            <XIcon class="w-3.5 h-3.5" />
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SkipBackIcon, SkipForwardIcon, PlayIcon, PauseIcon, MusicIcon, XIcon } from 'lucide-vue-next';
import { useAudioPlayerStore } from '../../store/audioPlayer';

defineProps<{
    compact?: boolean;
    bare?: boolean;
}>();

const player = useAudioPlayerStore();

function onCoverError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
}

const progressStyle = computed(() => {
    if (!player.currentTrack || player.currentTrack.duration === 0) return { width: '0%' };
    const pct = (player.currentTime / player.currentTrack.duration) * 100;
    return { width: Math.min(pct, 100) + '%' };
});

function handleProgressClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    if (player.currentTrack) {
        player.seek(ratio * player.currentTrack.duration);
    }
}
</script>
