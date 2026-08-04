<template>
    <div v-if="player.showEntry && player.currentTrack" class="select-none" :class="[
        compact ? 'text-xs' : 'text-sm',
        bare ? '' : 'rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50'
    ]">

        <!-- 主要内容行 -->
        <div class="flex items-center gap-1.5 px-3 py-1.5">

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

            <!-- 关闭 -->
            <button @click.stop="player.close()"
                class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                title="关闭播放器">
                <XIcon class="w-3.5 h-3.5" />
            </button>
        </div>

        <!-- 底部进度条 -->
        <div class="px-3 overflow-hidden cursor-pointer group/progress relative h-0.75 group-hover/progress:h-3 transition-all duration-150 ease-out"
            @click.stop="handleProgressClick" @mousedown.stop="handleProgressStart">
            <!-- 可视轨道（贴底细线，hover 变高） -->
            <div class="absolute bottom-0 left-0 right-0
                        h-0.75 group-hover/progress:h-2
                        bg-gray-200/60 dark:bg-gray-700/60
                        rounded-full overflow-hidden
                        transition-all duration-150 ease-out">
                <div class="h-full bg-blue-500 rounded-full transition-none" :style="displayStyle"></div>
            </div>
            <!-- 拖拽圆点（hover 时显示；仅透明度过渡，left 实时跟手不加动画） -->
            <div class="absolute bottom-0 -translate-x-1/2
                        w-3 h-3 -mb-0.5 rounded-full bg-blue-500 shadow-md border-2 border-white dark:border-gray-800
                        opacity-0 group-hover/progress:opacity-100
                        transition-opacity pointer-events-none"
                :style="{ left: displayStyle.width || '0%' }">
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
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

/** 拖拽中即时显示的进度 (0~1)，不依赖 store 更新，保证跟手 */
const dragRatio = ref<number | null>(null);

/** 实际渲染用的进度样式：拖拽时优先使用本地 dragRatio，松手后回退到 store */
const displayStyle = computed(() => {
    let pct: number;
    if (dragRatio.value !== null) {
        pct = dragRatio.value * 100;
    } else if (player.currentTrack && player.currentTrack.duration > 0) {
        pct = (player.currentTime / player.currentTrack.duration) * 100;
    } else {
        pct = 0;
    }
    return { width: Math.min(pct, 100) + '%' };
});

function calcRatio(el: HTMLElement, clientX: number): number {
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function handleProgressClick(e: MouseEvent) {
    const ratio = calcRatio(e.currentTarget as HTMLElement, e.clientX);
    if (player.currentTrack) {
        player.seek(ratio * player.currentTrack.duration);
    }
}

function handleProgressStart(e: MouseEvent) {
    const bar = e.currentTarget as HTMLElement;

    const update = (clientX: number) => {
        // 拖动只更新跟手位置，松手（onUp）时才真正 seek
        dragRatio.value = calcRatio(bar, clientX);
    };

    update(e.clientX);

    const onMove = (ev: MouseEvent) => {
        ev.preventDefault();
        update(ev.clientX);
    };

    const onUp = () => {
        // 将最终位置同步到 store
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
</script>
