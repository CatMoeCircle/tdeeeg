<template>
    <!-- bare：对话页合并进顶部卡片，保持原有样式；
         merged：列表顶部卡片里与生日条合并，无自身容器与左侧分隔线；
         非 bare：列表模式玻璃卡片，带外边距并收紧内距 -->
    <div v-if="player.showEntry && player.currentTrack" class="select-none" :class="[
        compact ? 'text-xs' : 'text-sm',
        dense
            ? ''
            : `mx-2 mt-1 rounded-lg overflow-hidden ${UI_GLASS_SURFACE}`
    ]">

        <!-- 主要内容行：下内距留给贴底的进度条，进度条自身不再额外占位 -->
        <div class="flex items-center" :class="dense ? 'gap-1.5 px-3 py-1.5' : 'gap-1.5 px-2 pt-1 pb-1.5'">

            <!-- 分隔线（对话页 bare 保留原有） -->
            <div v-if="bare" class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1"></div>

            <!-- 歌曲信息 -->
            <div class="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer" @click.stop="player.toggleOverlay()">
                <div class="flex items-center justify-center shrink-0 overflow-hidden"
                    :class="dense
                        ? 'w-6 h-6 rounded bg-gray-200 dark:bg-gray-700'
                        : 'w-6 h-6 rounded-md bg-gray-200/70 dark:bg-gray-700/70'">
                    <img v-if="player.currentTrack?.coverPath" :src="player.currentTrack.coverPath"
                        class="w-full h-full object-cover" @error="onCoverError" />
                    <MusicIcon v-else class="w-3.5 h-3.5"
                        :class="dense ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'" />
                </div>
                <div class="min-w-0 leading-tight">
                    <p class="truncate font-medium"
                        :class="[
                            compact ? 'text-[11px]' : 'text-xs',
                            dense ? 'text-gray-800 dark:text-gray-200' : 'text-gray-900 dark:text-gray-100'
                        ]">
                        <GlobalEmojiText :text="player.currentTrack.title" />
                    </p>
                    <p class="truncate"
                        :class="[
                            compact ? 'text-[10px]' : 'text-[11px]',
                            dense ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        ]">
                        <GlobalEmojiText :text="player.currentTrack.performer" />
                    </p>
                </div>
            </div>

            <!-- 上一首 -->
            <button @click.stop="player.prevTrack()"
                class="w-7 h-7 flex items-center justify-center rounded-full transition-colors text-gray-600 dark:text-gray-300"
                :class="dense ? 'hover:bg-gray-200 dark:hover:bg-gray-700' : 'hover:bg-gray-200/70 dark:hover:bg-gray-700/70'"
                :title="t('lng_mac_menu_player_previous')">
                <SkipBackIcon class="w-3.5 h-3.5" />
            </button>

            <!-- 播放/暂停 -->
            <button @click.stop="player.togglePlay()"
                class="w-7 h-7 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 transition-colors text-white"
                :class="dense ? '' : 'shadow-sm shadow-blue-500/30'"
                :title="player.isPlaying ? t('lng_mac_menu_player_pause') : t('lng_mac_menu_player_resume')">
                <PlayIcon v-if="!player.isPlaying" class="w-3.5 h-3.5 ml-0.5" />
                <PauseIcon v-else class="w-3.5 h-3.5" />
            </button>

            <!-- 下一首 -->
            <button @click.stop="player.nextTrack()"
                class="w-7 h-7 flex items-center justify-center rounded-full transition-colors text-gray-600 dark:text-gray-300"
                :class="dense ? 'hover:bg-gray-200 dark:hover:bg-gray-700' : 'hover:bg-gray-200/70 dark:hover:bg-gray-700/70'"
                :title="t('lng_mac_menu_player_next')">
                <SkipForwardIcon class="w-3.5 h-3.5" />
            </button>

            <!-- 关闭 -->
            <button @click.stop="player.close()"
                class="w-6 h-6 flex items-center justify-center rounded-full transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                :class="dense ? 'hover:bg-gray-200 dark:hover:bg-gray-700' : 'hover:bg-gray-200/70 dark:hover:bg-gray-700/70'"
                :title="t('player.close')">
                <XIcon class="w-3.5 h-3.5" />
            </button>
        </div>

        <!-- 底部进度条：轨道直接贴卡片底边、左右与内容行对齐，不为拖拽圆点预留行高。
             hover / 拖动时轨道从底边向上长高到与圆点同高，圆点正好落在轨道正中，
             因此它既不需要额外的预留空间，也不会被卡片圆角 / overflow 裁掉。 -->
        <div class="cursor-pointer group/progress relative" :class="dense ? 'h-[3px]' : 'h-0.5'"
            @click.stop="handleProgressClick" @mousedown.stop="handleProgressStart">
            <!-- 透明热区：向上探进内容行的下内距，轨道只有几像素时也点得中、拖得动（绝对定位，不撑高、不占视觉空间） -->
            <div class="absolute inset-x-0 -top-1.5 bottom-0" aria-hidden="true"></div>
            <!-- 轨道与圆点共用同一个定位盒，保证 left% / width% 同源；长高只向上，底边始终贴卡片底边 -->
            <div ref="trackEl"
                class="absolute bottom-0 transition-[height] duration-150 ease-out group-hover/progress:h-2"
                :class="[
                    dense ? 'left-3 right-3' : 'left-2 right-2',
                    dragging ? 'h-2' : (dense ? 'h-[3px]' : 'h-0.5'),
                ]">
                <!-- 可视轨道 -->
                <div class="absolute inset-0 rounded-full overflow-hidden"
                    :class="dense
                        ? 'bg-gray-200/60 dark:bg-gray-700/60'
                        : 'bg-black/[0.06] dark:bg-white/[0.10]'">
                    <!-- 缓存进度（流式播放时已下载、可秒跳的部分）：垫在播放进度下面 -->
                    <div v-if="cachedPct > 0" class="absolute inset-y-0 left-0 rounded-full bg-blue-500/25"
                        :style="{ width: cachedPct + '%' }"></div>
                    <!-- 播放进度 -->
                    <div class="absolute inset-y-0 left-0 rounded-full transition-none"
                        :class="dense ? 'bg-blue-500' : 'bg-blue-500/90'" :style="displayStyle"></div>
                </div>
                <!-- 拖拽圆点：与 hover 态轨道等高，垂直方向自然居中；水平方向用 clamp 收在轨道内，两端不切角 -->
                <div class="absolute bottom-0 w-2 h-2 -translate-x-1/2 rounded-full bg-blue-500 border border-white
                            dark:border-gray-800 shadow-sm
                            transition-opacity pointer-events-none"
                    :class="dragging ? 'opacity-100' : 'opacity-0 group-hover/progress:opacity-100'"
                    :style="dotStyle">
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { SkipBackIcon, SkipForwardIcon, PlayIcon, PauseIcon, MusicIcon, XIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useAudioPlayerStore, cachedSeconds } from '../../store/media/audioPlayer';
import { UI_GLASS_SURFACE } from '../../utils/ui/folderPillsTabClass';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';

const props = defineProps<{
    compact?: boolean;
    bare?: boolean;
    /** 合并进列表顶部卡片：与 bare 一样去掉自身容器，但不画左侧分隔线 */
    merged?: boolean;
}>();

/** bare / merged 都使用紧凑布局 */
const dense = computed(() => props.bare || props.merged);

const player = useAudioPlayerStore();
const { t } = useI18n();

function onCoverError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
}

/** 拖拽中即时显示的进度 (0~1)，不依赖 store 更新，保证跟手 */
const dragRatio = ref<number | null>(null);

/** 正在拖拽：指针移出轨道时 hover 会丢失，靠它把轨道长高态和圆点锁住 */
const dragging = computed(() => dragRatio.value !== null);

/** 轨道定位盒：百分比与点击换算都以它为唯一量尺（两侧内距不参与） */
const trackEl = ref<HTMLElement | null>(null);

/** 进度百分比 (0~100)：拖拽时优先使用本地 dragRatio，松手后回退到 store */
const progressPct = computed(() => {
    if (dragRatio.value !== null) return Math.min(dragRatio.value * 100, 100);
    const track = player.currentTrack;
    if (!track || track.duration <= 0) return 0;
    return Math.min((player.currentTime / track.duration) * 100, 100);
});

/** 填充宽度 */
const displayStyle = computed(() => ({ width: progressPct.value + '%' }));

/**
 * 缓存进度百分比 (0~100)：本地完整文件 = 整首已缓存（铺满轨道），
 * 流式播放取媒体元素已缓冲到的位置（规则见 store 的 cachedSeconds）。
 */
const cachedPct = computed(() => {
    const track = player.currentTrack;
    if (!track || !(track.duration > 0)) return 0;
    const cached = cachedSeconds(track, player.bufferedTime);
    if (!(cached > 0)) return 0;
    return Math.min((cached / track.duration) * 100, 100);
});

/**
 * 圆点位置：横向夹在轨道内、两侧各留半个圆点（外加 1px 余量），
 * 进度到头也不会戳到卡片圆角上被裁掉；纵向由 bottom-0 + 等高自然居中。
 */
const dotStyle = computed(() => ({
    left: `clamp(5px, ${progressPct.value}%, calc(100% - 5px))`,
}));

function calcRatio(clientX: number): number {
    const el = trackEl.value;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function handleProgressClick(e: MouseEvent) {
    const ratio = calcRatio(e.clientX);
    if (player.currentTrack) {
        player.seek(ratio * player.currentTrack.duration);
    }
}

function handleProgressStart(e: MouseEvent) {
    const update = (clientX: number) => {
        // 拖动只更新跟手位置，松手（onUp）时才真正 seek
        dragRatio.value = calcRatio(clientX);
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
