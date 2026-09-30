<template>
    <!-- bare：对话页合并进顶部卡片，保持原有样式；
         非 bare：列表模式玻璃卡片，带外边距并收紧内距 -->
    <div v-if="player.showEntry && player.currentTrack" class="select-none" :class="[
        compact ? 'text-xs' : 'text-sm',
        bare
            ? 'pb-[5px]'
            : `mx-2 mt-1 rounded-lg overflow-hidden ${UI_GLASS_SURFACE}`
    ]">

        <!-- 主要内容行 -->
        <div class="flex items-center" :class="bare ? 'gap-1.5 px-3 py-1.5' : 'gap-1.5 px-2 pt-1 pb-0.5'">

            <!-- 分隔线（对话页 bare 保留原有） -->
            <div v-if="bare" class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1"></div>

            <!-- 歌曲信息 -->
            <div class="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer" @click.stop="player.toggleOverlay()">
                <div class="flex items-center justify-center shrink-0 overflow-hidden"
                    :class="bare
                        ? 'w-6 h-6 rounded bg-gray-200 dark:bg-gray-700'
                        : 'w-6 h-6 rounded-md bg-gray-200/70 dark:bg-gray-700/70'">
                    <img v-if="player.currentTrack?.coverPath" :src="player.currentTrack.coverPath"
                        class="w-full h-full object-cover" @error="onCoverError" />
                    <MusicIcon v-else class="w-3.5 h-3.5"
                        :class="bare ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'" />
                </div>
                <div class="min-w-0 leading-tight">
                    <p class="truncate font-medium"
                        :class="[
                            compact ? 'text-[11px]' : 'text-xs',
                            bare ? 'text-gray-800 dark:text-gray-200' : 'text-gray-900 dark:text-gray-100'
                        ]">
                        <GlobalEmojiText :text="player.currentTrack.title" />
                    </p>
                    <p class="truncate"
                        :class="[
                            compact ? 'text-[10px]' : 'text-[11px]',
                            bare ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        ]">
                        <GlobalEmojiText :text="player.currentTrack.performer" />
                    </p>
                </div>
            </div>

            <!-- 上一首 -->
            <button @click.stop="player.prevTrack()"
                class="w-7 h-7 flex items-center justify-center rounded-full transition-colors text-gray-600 dark:text-gray-300"
                :class="bare ? 'hover:bg-gray-200 dark:hover:bg-gray-700' : 'hover:bg-gray-200/70 dark:hover:bg-gray-700/70'"
                :title="t('lng_mac_menu_player_previous')">
                <SkipBackIcon class="w-3.5 h-3.5" />
            </button>

            <!-- 播放/暂停 -->
            <button @click.stop="player.togglePlay()"
                class="w-7 h-7 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 transition-colors text-white"
                :class="bare ? '' : 'shadow-sm shadow-blue-500/30'"
                :title="player.isPlaying ? t('lng_mac_menu_player_pause') : t('lng_mac_menu_player_resume')">
                <PlayIcon v-if="!player.isPlaying" class="w-3.5 h-3.5 ml-0.5" />
                <PauseIcon v-else class="w-3.5 h-3.5" />
            </button>

            <!-- 下一首 -->
            <button @click.stop="player.nextTrack()"
                class="w-7 h-7 flex items-center justify-center rounded-full transition-colors text-gray-600 dark:text-gray-300"
                :class="bare ? 'hover:bg-gray-200 dark:hover:bg-gray-700' : 'hover:bg-gray-200/70 dark:hover:bg-gray-700/70'"
                :title="t('lng_mac_menu_player_next')">
                <SkipForwardIcon class="w-3.5 h-3.5" />
            </button>

            <!-- 关闭 -->
            <button @click.stop="player.close()"
                class="w-6 h-6 flex items-center justify-center rounded-full transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                :class="bare ? 'hover:bg-gray-200 dark:hover:bg-gray-700' : 'hover:bg-gray-200/70 dark:hover:bg-gray-700/70'"
                :title="t('player.close')">
                <XIcon class="w-3.5 h-3.5" />
            </button>
        </div>

        <!-- 底部进度条 -->
        <!-- 列表模式热区收到 8px；bare 保持原 12px -->
        <div class="cursor-pointer group/progress relative" :class="bare ? 'px-3' : 'px-2'"
            :style="{ height: bare ? '12px' : '8px' }"
            @click.stop="handleProgressClick" @mousedown.stop="handleProgressStart">
            <!-- 定位条：贴底；轨道与圆点共用，保证 left%/width% 同源 -->
            <div class="absolute bottom-0 left-0 right-0" :class="bare ? 'h-[3px]' : 'h-0.5'">
                <!-- 可视轨道 -->
                <div class="absolute inset-0 rounded-full overflow-hidden"
                    :class="bare
                        ? 'bg-gray-200/60 dark:bg-gray-700/60'
                        : 'bg-black/[0.06] dark:bg-white/[0.10]'">
                    <div class="h-full rounded-full transition-none"
                        :class="bare ? 'bg-blue-500' : 'bg-blue-500/90'" :style="displayStyle"></div>
                </div>
                <!-- 拖拽圆点：圆心对齐进度末端 + 轨道中心 -->
                <div class="absolute top-1/2 w-3 h-3 rounded-full bg-blue-500 shadow-md border-2 border-white dark:border-gray-800
                            opacity-0 group-hover/progress:opacity-100
                            transition-opacity pointer-events-none"
                    :style="{
                        left: displayStyle.width || '0%',
                        transform: 'translate(-50%, -50%)'
                    }">
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { SkipBackIcon, SkipForwardIcon, PlayIcon, PauseIcon, MusicIcon, XIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useAudioPlayerStore } from '../../store/audioPlayer';
import { UI_GLASS_SURFACE } from '../../utils/folderPillsTabClass';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';

defineProps<{
    compact?: boolean;
    bare?: boolean;
}>();

const player = useAudioPlayerStore();
const { t } = useI18n();

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
