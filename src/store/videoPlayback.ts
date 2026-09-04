import { ref } from 'vue';
import { useAudioPlayerStore } from './audioPlayer';

/**
 * 全局视频播放管理模块。
 * 确保同一时间只有一个视频在播放，且静音状态全局同步。
 * GIF（messageAnimation）不受影响。
 *
 * 视口内多个视频并存时，采用「后进入视口者优先播放」的策略；
 * 当当前播放的视频离开视口后，会自动恢复上一个仍在视口内的视频播放。
 */

/** 当前正在播放的视频的消息 ID */
export const currentlyPlayingId = ref<number | null>(null);

/** 全局视频静音状态 */
export const globalVideoMuted = ref(true);

/** 当前在视口内的视频消息 ID（按进入顺序）。用于播放权释放后恢复上一个视频。 */
const visibleVideoIds: number[] = [];

/** 通过 DOM 查找指定视频的 <video> 元素 */
function getVideoEl(id: number): HTMLVideoElement | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector(
        `[data-video-msg-id="${id}"]`
    ) as HTMLVideoElement | null;
}

/** 暂停指定视频 */
function pauseVideo(id: number): void {
    getVideoEl(id)?.pause();
}

/** 播放指定视频（失败静默，自动播放被拦截属正常情况） */
function playVideo(id: number): void {
    getVideoEl(id)?.play().catch(() => { });
}

/**
 * 依据当前视口内可见视频，重新计算「应该播放的视频」并同步播放/暂停。
 * 规则：优先播放最近进入视口的可见视频（visibleVideoIds 末尾元素）；
 * 若当前播放者仍在列表中且未变化，则不做任何操作。
 */
function recomputePlaying(): void {
    const desired = visibleVideoIds.length > 0
        ? visibleVideoIds[visibleVideoIds.length - 1]
        : null;

    const prevId = currentlyPlayingId.value;
    if (prevId === desired) return;

    currentlyPlayingId.value = desired;

    // 暂停旧视频（若仍存在且不是新目标）
    if (prevId !== null && prevId !== desired) {
        pauseVideo(prevId);
    }

    // 播放新目标
    if (desired !== null) {
        playVideo(desired);
    }

    // 音乐互斥：无视频播放 → 恢复音乐；有视频且未静音 → 暂停音乐
    if (desired === null) {
        resumeAudioAfterVideo();
    } else if (!globalVideoMuted.value) {
        pauseAudioForVideo();
    }
}

/**
 * 视频进入视口时调用：登记可见并触发播放决策（会暂停旧视频）。
 * @param messageId 当前视频的消息 ID
 */
export function registerPlaying(messageId: number): void {
    if (!visibleVideoIds.includes(messageId)) {
        visibleVideoIds.push(messageId);
    }
    recomputePlaying();
}

/**
 * 视频离开视口时调用：注销可见并触发播放决策（可能恢复上一个仍在视口内的视频）。
 * @param messageId 当前视频的消息 ID
 */
export function unregisterPlaying(messageId: number): void {
    const idx = visibleVideoIds.indexOf(messageId);
    if (idx !== -1) {
        visibleVideoIds.splice(idx, 1);
    }
    recomputePlaying();
}

/**
 * 切换全局静音状态。所有视频实例应同步此状态。
 */
export function toggleGlobalMute(): boolean {
    globalVideoMuted.value = !globalVideoMuted.value;
    if (!globalVideoMuted.value && currentlyPlayingId.value !== null) {
        // 取消静音 → 视频开始发声 → 暂停音乐
        pauseAudioForVideo();
    } else if (globalVideoMuted.value) {
        // 恢复静音 → 视频不再发声 → 恢复音乐（仅当是被视频暂停的）
        resumeAudioAfterVideo();
    }
    return globalVideoMuted.value;
}

/**
 * 设置全局静音状态。
 */
export function setGlobalMute(muted: boolean): void {
    globalVideoMuted.value = muted;
}

// ======== 视频与音频播放器的互斥逻辑 ========

/** 标记音频是否因视频操作而被暂停（用于自动恢复判断） */
let audioPausedByVideo = false;

/** 暂停音频播放器（因视频取消静音/全屏播放） */
export function pauseAudioForVideo(): void {
    const audio = useAudioPlayerStore();
    if (audio.isPlaying) {
        audio.togglePlay();
        audioPausedByVideo = true;
    }
}

/** 恢复音频播放器（视频不再播放时） */
export function resumeAudioAfterVideo(): void {
    if (!audioPausedByVideo) return;
    const audio = useAudioPlayerStore();
    if (!audio.isPlaying) {
        audio.togglePlay();
    }
    audioPausedByVideo = false;
}

/** 当视频停止播放时调用（离开视口 / 关闭查看器 / 播放结束） */
export function onVideoStopped(): void {
    resumeAudioAfterVideo();
}