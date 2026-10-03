<template>
    <Teleport to="body">
        <!-- 遮罩层 -->
        <Transition name="overlay-fade">
            <div v-if="player.showOverlay" class="fixed inset-0 z-9998 flex items-end sm:items-center justify-center"
                @click.self="player.toggleOverlay()">
                <!-- 背景遮罩 -->
                <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>

                <!-- 面板：小屏为底部抽屉，sm 起为居中卡片，md 起左右分栏。
                     高度同时受绝对上限与视口 90vh 约束：窗口很高时长列表不会把卡片拉到过高，
                     窗口很矮时又退回 90vh，不至于顶出视口 -->
                <div class="relative w-full sm:w-[460px] md:w-[780px] md:max-w-[calc(100vw-2rem)]
                            max-h-[90vh] md:max-h-[min(600px,90vh)] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col
                            bg-white/85 dark:bg-gray-900/85 backdrop-blur-2xl
                            shadow-[0_24px_64px_-16px_rgba(15,23,42,0.45)]
                            ring-1 ring-black/5 dark:ring-white/10">

                    <!-- 封面弥散背景：随当前封面变化的模糊色块，给整块面板定调 -->
                    <div class="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
                        <img v-if="heroCover" :src="heroCover"
                            class="w-full h-full object-cover scale-150 blur-3xl opacity-45 dark:opacity-35" />
                        <div
                            class="absolute inset-0 bg-linear-to-b from-white/55 via-white/80 to-white/95 dark:from-gray-900/60 dark:via-gray-900/85 dark:to-gray-900/95">
                        </div>
                    </div>

                    <!-- 手柄（移动端拖动提示） -->
                    <div class="relative z-10 sm:hidden flex justify-center pt-2.5">
                        <div class="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                    </div>

                    <!-- 头部 -->
                    <div class="relative z-10 flex items-center justify-between pl-5 pr-3 pt-4 pb-1 md:pb-2">
                        <h3 class="text-[13px] font-medium tracking-wide text-gray-500 dark:text-gray-400">
                            {{ t('player.title') }}
                        </h3>
                        <button @click="player.toggleOverlay()"
                            class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95"
                            :title="t('player.close')">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 主体 -->
                    <div class="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row">

                        <!-- 左栏（md 起）：大封面 + 曲目信息 + 进度 + 控制 -->
                        <div class="shrink-0 flex flex-col items-center px-6 pt-2 pb-6
                                    md:w-[360px] md:justify-center md:px-7 md:pt-0 md:pb-7">
                            <div class="relative">
                                <!-- 封面光晕：让封面“浮”起来 -->
                                <div v-if="heroCover"
                                    class="pointer-events-none absolute -inset-3 rounded-[26px] overflow-hidden blur-2xl opacity-50 dark:opacity-40 scale-105"
                                    aria-hidden="true">
                                    <img :src="heroCover" class="w-full h-full object-cover" />
                                </div>

                                <div class="relative w-44 h-44 md:w-[220px] md:h-[220px] rounded-2xl overflow-hidden
                                            shadow-2xl shadow-black/25 ring-1 ring-black/10 dark:ring-white/15
                                            bg-blue-500">
                                    <img v-if="heroCover" :src="heroCover" class="w-full h-full object-cover"
                                        @error="heroCoverError = true" />
                                    <div v-else class="w-full h-full flex items-center justify-center">
                                        <MusicIcon class="w-16 h-16 text-white/80" />
                                    </div>
                                    <!-- 底部压暗：增加体积感，避免平封面发飘（仅真实封面；无封面时保持纯主题色） -->
                                    <div v-if="heroCover"
                                        class="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/25 to-transparent pointer-events-none">
                                    </div>
                                </div>
                            </div>

                            <h2
                                class="mt-5 w-full text-center text-[17px] font-semibold text-gray-900 dark:text-gray-50 truncate">
                                <GlobalEmojiText :text="player.currentTrack?.title || t('player.nothingPlaying')" />
                            </h2>
                            <p class="mt-1 w-full text-center text-[13px] text-gray-500 dark:text-gray-400 truncate">
                                <GlobalEmojiText :text="player.currentTrack?.performer || ''" />
                            </p>

                            <!-- 进度条：可拖拽，拖动实时跟手，松手才 seek -->
                            <div class="w-full pt-4">
                                <!-- 越界拉伸上限取左栏水平内边距（px-6 = 24px），拉动时不会越出栏外 -->
                                <SmoothSlider :model-value="progressValue" :max-value="progressMax"
                                    :max-overflow="24" :disabled="progressMax <= 0" @update:model-value="onProgressUpdate"
                                    @change="onProgressCommit" />
                                <div class="flex justify-between">
                                    <span class="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{{
                                        formatTime(progressValue) }}</span>
                                    <span class="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{{
                                        formatTime(progressMax) }}</span>
                                </div>
                            </div>

                            <!-- 控制按钮 -->
                            <div class="w-full flex items-center justify-center gap-2.5 pt-3">
                                <!-- 循环模式 -->
                                <button @click="player.cycleRepeatMode()"
                                    class="w-10 h-10 flex items-center justify-center rounded-full transition-colors active:scale-95 hover:bg-black/5 dark:hover:bg-white/10"
                                    :class="repeatIconClass" :title="repeatTitle">
                                    <component :is="repeatIcon" class="w-[18px] h-[18px]" />
                                </button>

                                <!-- 上一首 -->
                                <button @click="player.prevTrack()" :title="t('lng_mac_menu_player_previous')"
                                    class="w-11 h-11 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200
                                           hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95">
                                    <SkipBackIcon class="w-5 h-5" />
                                </button>

                                <!-- 播放/暂停 -->
                                <button @click="player.togglePlay()"
                                    :title="player.isPlaying ? t('lng_mac_menu_player_pause') : t('lng_mac_menu_player_resume')"
                                    class="w-16 h-16 flex items-center justify-center rounded-full text-white
                                           bg-linear-to-br from-sky-400 to-blue-600
                                           shadow-lg shadow-blue-500/35 hover:shadow-xl hover:shadow-blue-500/45
                                           transition-all active:scale-95">
                                    <PlayIcon v-if="!player.isPlaying" class="w-6.5 h-6.5 ml-0.5" />
                                    <PauseIcon v-else class="w-6.5 h-6.5" />
                                </button>

                                <!-- 下一首 -->
                                <button @click="player.nextTrack()" :title="t('lng_mac_menu_player_next')"
                                    class="w-11 h-11 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200
                                           hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95">
                                    <SkipForwardIcon class="w-5 h-5" />
                                </button>

                                <!-- 音量 -->
                                <div class="relative group/vol">
                                    <button @click="toggleMute"
                                        class="w-10 h-10 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200
                                               hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95">
                                        <Volume2Icon v-if="player.volume > 0.5" class="w-[18px] h-[18px]" />
                                        <Volume1Icon v-else-if="player.volume > 0" class="w-[18px] h-[18px]" />
                                        <VolumeXIcon v-else class="w-[18px] h-[18px]" />
                                    </button>
                                    <!-- 音量滑块：hover 区域从按钮顶连续到滑块，避免鼠标上移途中脱离 hover 导致滑块消失；
                                         拖拽与回弹期间由 volumeActive 锁住显示，否则指针移出弹层会中途隐藏 -->
                                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 items-center
                                                p-1.5 rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-md
                                                shadow-xl ring-1 ring-black/5 dark:ring-white/10"
                                        :class="volumeActive ? 'flex' : 'hidden group-hover/vol:flex'">
                                        <ScrubField :label="t('player.volume')" suffix="%" size="md" :value="volumePercent"
                                            :min="0" :max="100" :step="1" chip-color="transparent"
                                            @change="onVolumeScrub" @update:dragging="volumeDragging = $event"
                                            @update:settling="volumeSettling = $event" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 右栏：播放列表（md 起与左栏并排） -->
                        <div
                            class="flex-1 min-w-0 min-h-0 flex flex-col border-t border-black/5 dark:border-white/10
                                   md:border-t-0 md:border-l">
                            <div
                                class="shrink-0 flex items-center justify-between px-5 py-2.5
                                       border-b border-black/5 dark:border-white/10">
                                <span class="text-[12px] font-medium text-gray-500 dark:text-gray-400">{{
                                    t('lng_media_saved_music_title') }}</span>
                                <span
                                    class="text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-full
                                           bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400">{{ player.playlist.length }}</span>
                            </div>
                            <div class="flex-1 min-h-0 overflow-y-auto py-1.5">
                                <div v-for="(track, idx) in player.playlist" :key="track.messageId || track.fileId"
                                    @click="player.playTrack(idx)" @contextmenu.prevent.stop="onTrackContextMenu($event, track, idx)"
                                    class="mx-2 flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer transition-colors"
                                    :class="idx === player.currentIndex
                                        ? 'bg-blue-500/10 dark:bg-blue-400/15'
                                        : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'">
                                    <div
                                        class="relative w-10 h-10 rounded-lg shrink-0 overflow-hidden
                                               bg-gray-200/70 dark:bg-gray-700/70 ring-1 ring-black/5 dark:ring-white/10">
                                        <img v-if="track.coverPath" :src="track.coverPath"
                                            class="w-full h-full object-cover" @error="onListCoverError($event, track)" />
                                        <MusicIcon v-else class="absolute inset-0 m-auto w-4 h-4 text-gray-400" />
                                        <!-- 正在播放：封面蒙层 + 跳动条 -->
                                        <div v-if="idx === player.currentIndex && player.isPlaying"
                                            class="absolute inset-0 flex items-center justify-center gap-[2px] bg-black/45">
                                            <span class="w-[2px] h-2.5 bg-white rounded-full animate-equalizer"
                                                style="animation-delay: 0s"></span>
                                            <span class="w-[2px] h-3.5 bg-white rounded-full animate-equalizer"
                                                style="animation-delay: 0.15s"></span>
                                            <span class="w-[2px] h-2 bg-white rounded-full animate-equalizer"
                                                style="animation-delay: 0.3s"></span>
                                        </div>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="text-[13px] font-medium truncate"
                                            :class="idx === player.currentIndex
                                                ? 'text-blue-600 dark:text-blue-400'
                                                : 'text-gray-800 dark:text-gray-200'">
                                            <GlobalEmojiText :text="track.title" />
                                        </p>
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            <GlobalEmojiText :text="track.performer" />
                                        </p>
                                    </div>
                                    <span class="text-[11px] tabular-nums text-gray-400 dark:text-gray-500 shrink-0">{{
                                        formatTime(track.duration) }}</span>
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
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon,
    XIcon, MusicIcon, Volume2Icon, Volume1Icon, VolumeXIcon,
    RepeatIcon, Repeat1Icon, ShuffleIcon, ListOrderedIcon,
    EyeIcon, FolderOpenIcon, DownloadIcon, BookmarkPlusIcon, Trash2Icon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { save } from '@tauri-apps/plugin-dialog';
import { copyFile } from '@tauri-apps/plugin-fs';
import { useAudioPlayerStore, type AudioTrack } from '../../store/audioPlayer';
import { useUserStore } from '../../store/user';
import { openContextMenu } from '../../store/contextMenu';
import type { ContextMenuItem } from '../contextMenu/types';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';
import SmoothSlider from '../common/SmoothSlider.vue';
import ScrubField from '../common/ScrubField.vue';

const player = useAudioPlayerStore();
const userStore = useUserStore();
const router = useRouter();
const { t } = useI18n();
const previousVolume = ref(1);

/** 音量百分比（0~100）：ScrubField 按整数百分比工作，store 侧存 0~1 */
const volumePercent = computed(() => Math.round(player.volume * 100));

/**
 * 音量字段交互中（拖拽 + 松手回弹）：锁住 hover 弹层。
 * 指针被拖到弹层外时松手，仅靠 hover 会让弹层立刻隐藏，回弹纠正动画就看不见了。
 */
const volumeDragging = ref(false);
const volumeSettling = ref(false);
const volumeActive = computed(() => volumeDragging.value || volumeSettling.value);

/** 当前用户 id（判断是否为「自己个人资料」的歌曲） */
const myUserId = computed(() => userStore.userProfile?.id);

/** 大封面加载失败标记：失败后退回音符占位图，避免只留一个空框 */
const heroCoverError = ref(false);
watch(
    () => [player.currentIndex, player.currentTrack?.coverPath] as const,
    () => { heroCoverError.value = false; },
);

/** 大封面使用的图片地址（失败后置空，模板走 MusicIcon 分支） */
const heroCover = computed(() =>
    heroCoverError.value ? undefined : player.currentTrack?.coverPath
);

/** 曲目右键菜单：跳转消息 / 打开文件夹 / 另存为 / 保存到我的资料（自己的资料歌曲则为移除） */
function onTrackContextMenu(e: MouseEvent, track: AudioTrack, idx: number) {
    const items: ContextMenuItem[] = [];

    // 跳转消息（对话/群资料来源，有消息快照）
    if (track.source !== 'profile' && track.messageSnapshot && track.chatId && track.messageId) {
        items.push({
            key: 'jump-to-message',
            label: t('lng_downloads_view_in_chat'),
            icon: EyeIcon,
            onClick: () => {
                player.toggleOverlay();
                router.push({
                    name: 'chat-detail',
                    params: { id: String(track.chatId) },
                    query: { message: String(track.messageId) },
                });
            },
        });
    }

    // 打开文件夹 / 另存为（需本地已下载文件）
    const localPath = track.localPath;
    if (localPath) {
        items.push({
            key: 'reveal-in-dir',
            label: t('lng_context_show_in_folder'),
            icon: FolderOpenIcon,
            onClick: async () => {
                try {
                    await revealItemInDir([localPath]);
                } catch (err) {
                    console.error('revealItemInDir failed:', err);
                    MessagePlugin.error(t('context.actionFailed'));
                }
            },
        });
        items.push({
            key: 'save-as',
            label: t('lng_mediaview_save_as'),
            icon: DownloadIcon,
            onClick: async () => {
                try {
                    const fileName = track.title || `audio_${track.fileId}.mp3`;
                    const dest = await save({ title: t('lng_mediaview_save_as'), defaultPath: fileName });
                    if (!dest) return;
                    await copyFile(localPath, dest);
                    MessagePlugin.success(t('player.savedAs'));
                } catch (err) {
                    console.error('saveAs failed:', err);
                    MessagePlugin.error(t('player.saveAsFailed'));
                }
            },
        });
    }

    // 自己个人资料的歌曲 → 从我的资料移除；否则 → 保存到我的资料
    const isOwnProfileTrack =
        track.source === 'profile' && !!myUserId.value && track.profileUserId === myUserId.value;

    items.push({ key: 'divider-profile', label: '', divider: true });
    if (isOwnProfileTrack) {
        items.push({
            key: 'remove-profile-audio',
            label: t('player.removeFromProfile'),
            icon: Trash2Icon,
            danger: true,
            onClick: async () => {
                const ok = await player.removeTrackFromMyProfile(track);
                if (ok) {
                    player.removeTrackAt(idx);
                    MessagePlugin.success(t('lng_saved_music_removed'));
                } else {
                    MessagePlugin.error(t('context.actionFailed'));
                }
            },
        });
    } else {
        items.push({
            key: 'save-to-profile',
            label: t('player.saveToProfile'),
            icon: BookmarkPlusIcon,
            onClick: async () => {
                const ok = await player.saveTrackToMyProfile(track);
                MessagePlugin.success(ok ? t('lng_saved_music_added') : t('player.saveFailedNotDownloaded'));
            },
        });
    }

    // 从播放列表移除（仅移出当前列表，不影响资料/消息）
    items.push({
        key: 'remove-from-list',
        label: t('player.removeFromList'),
        icon: XIcon,
        onClick: () => {
            player.removeTrackAt(idx);
        },
    });

    openContextMenu(e.clientX, e.clientY, items, e.currentTarget as HTMLElement);
}

/** 拖拽中的本地秒数：拖动时优先用它（跟手），松手 seek 后清空回退到 store */
const dragValue = ref<number | null>(null);

/** 取值范围上界 = 当前曲目时长 */
const progressMax = computed(() => player.currentTrack?.duration || 0);

/** 实际渲染用的进度值（秒） */
const progressValue = computed(() => dragValue.value ?? player.currentTime);

function onProgressUpdate(value: number) {
    dragValue.value = value;
}

function onProgressCommit(value: number) {
    player.seek(value);
    dragValue.value = null;
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
        case 'none': return t('player.repeatNone');
        case 'one': return t('player.repeatOne');
        case 'all': return t('player.repeatAll');
        case 'shuffle': return t('lng_audio_player_shuffle');
    }
});

function onVolumeScrub(percent: number) {
    player.setVolume(percent / 100);
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
