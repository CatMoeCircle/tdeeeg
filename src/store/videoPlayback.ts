import { ref } from 'vue';

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
}

/**
 * 视频停止播放时调用。
 * @param messageId 当前视频的消息 ID
 */
export function unregisterPlaying(messageId: number): void {
    if (currentlyPlayingId.value === messageId) {
        currentlyPlayingId.value = null;
    }
}

/**
 * 切换全局静音状态。所有视频实例应同步此状态。
 */
export function toggleGlobalMute(): boolean {
    globalVideoMuted.value = !globalVideoMuted.value;
    return globalVideoMuted.value;
}

/**
 * 设置全局静音状态。
 */
export function setGlobalMute(muted: boolean): void {
    globalVideoMuted.value = muted;
}
