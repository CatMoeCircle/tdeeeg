import { ref } from 'vue';
import { useAudioPlayerStore } from './audioPlayer';

/**
 * 全局视频播放管理模块。
 * 确保同一时间只有一个视频在播放，且静音状态全局同步。
 * GIF（messageAnimation）不受影响。
 */

/** 当前正在播放的视频的消息 ID */
export const currentlyPlayingId = ref<number | null>(null);

/** 全局视频静音状态 */
export const globalVideoMuted = ref(true);

/**
 * 视频开始播放时调用，记录当前播放的视频 ID。
 * 如果已有其他视频在播放，之前的视频会通过回调处理。
 * @param messageId 当前视频的消息 ID
 * @param onPausePrevious 可选回调，用于暂停之前的视频
 */
export function registerPlaying(
    messageId: number,
    onPausePrevious?: (previousId: number) => void
): void {
    const prevId = currentlyPlayingId.value;
    if (prevId !== null && prevId !== messageId) {
        onPausePrevious?.(prevId);
    }
    currentlyPlayingId.value = messageId;

    // 如果视频未静音（正在发声），暂停音乐
    if (!globalVideoMuted.value) {
        pauseAudioForVideo();
    }
}

/**
 * 视频停止播放时调用。
 * @param messageId 当前视频的消息 ID
 */
export function unregisterPlaying(messageId: number): void {
    if (currentlyPlayingId.value === messageId) {
        currentlyPlayingId.value = null;
    }
    // 没有视频在播放时，尝试恢复音乐
    if (currentlyPlayingId.value === null) {
        resumeAudioAfterVideo();
    }
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