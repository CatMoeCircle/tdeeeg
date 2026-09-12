import { ref } from 'vue';
import { useAudioPlayerStore } from './audioPlayer';

/**
 * 全局视频播放管理模块。
 * 确保同一时间只有一个视频在播放，且静音状态全局同步。
 * GIF（messageAnimation）不受影响。
 *
 * 播放权决策：
 * 1. 先按可见比例过滤——只有露出足够多（默认 ≥60%「可显示高度」）的视频才有资格；
 *    只露一条边 / 半截划走的视频不会继续播。
 * 2. 在有资格的视频中选「中心点离视口中心最近」的那个。
 *    相比原先「后进入视口者优先」，上下滚动是对称的。
 *
 * 比例分母用 min(元素高度, 视口高度)：竖长视频铺满视口时算 1.0，
 * 不会因为元素比视口高而永远达不到阈值。
 */

/** 播放所需的最低可见比例（相对可显示高度，0–1） */
export const MIN_PLAY_RATIO = 0.6;

/** 当前正在播放的视频的消息 ID */
export const currentlyPlayingId = ref<number | null>(null);

/** 全局视频静音状态 */
export const globalVideoMuted = ref(true);

/** 视口内视频的度量：可见比例 + 中心点到视口中心的距离（px） */
export interface VideoViewportMetrics {
    /** 相对可显示高度的可见比例，0–1；≤0 视为不可见 */
    ratio: number;
    /** 元素中心到视口中心的绝对距离（px） */
    centerDist: number;
}

/** messageId → 最近一次可见性度量 */
const visibleVideos = new Map<number, VideoViewportMetrics>();

/** 通过 DOM 查找指定视频的 <video> 元素 */
function getVideoEl(id: number): HTMLVideoElement | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector(
        `[data-video-msg-id="${id}"]`
    ) as HTMLVideoElement | null;
}

/**
 * 可见比例：visibleH / min(元素高度, 视口高度)。
 * 元素比视口矮时 = 露出占比；比视口高时 = 铺满视口的程度。
 */
export function computeVisibleRatio(elHeight: number, visibleH: number): number {
    const denom = Math.min(elHeight, typeof window !== 'undefined' ? (window.innerHeight || elHeight) : elHeight);
    if (denom <= 0 || visibleH <= 0) return 0;
    return Math.min(1, Math.max(0, visibleH / denom));
}

/** 从 DOM 重测单个视频；不可见或元素缺失返回 null */
function measureVideoEl(el: HTMLVideoElement): VideoViewportMetrics | null {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const vh = window.innerHeight || 0;
    const visibleH = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    if (visibleH <= 0) return null;
    const ratio = computeVisibleRatio(rect.height, visibleH);
    const elCenter = rect.top + rect.height / 2;
    return { ratio, centerDist: Math.abs(elCenter - vh / 2) };
}

/**
 * 按当前 DOM 重测所有已登记视频并重算播放权。
 * IO 只在跨 threshold 时回调，滚动过程中中心距会变陈旧；
 * 任一视频上报或滚动时调用此函数，保证「最居中」判断用的是最新几何。
 */
export function remeasureAllVisibleVideos(): void {
    if (visibleVideos.size === 0) return;
    const ids = [...visibleVideos.keys()];
    for (const id of ids) {
        const el = getVideoEl(id);
        const metrics = el ? measureVideoEl(el) : null;
        if (!metrics) visibleVideos.delete(id);
        else visibleVideos.set(id, metrics);
    }
    recomputePlaying();
}

// 捕获阶段监听 scroll，覆盖消息列表等内层滚动容器；rAF 合帧避免每事件都测
let remeasureRaf = 0;
function scheduleRemeasure() {
    if (remeasureRaf || typeof requestAnimationFrame !== 'function') return;
    remeasureRaf = requestAnimationFrame(() => {
        remeasureRaf = 0;
        remeasureAllVisibleVideos();
    });
}
if (typeof document !== 'undefined') {
    document.addEventListener('scroll', scheduleRemeasure, { capture: true, passive: true });
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
 * 规则：先过滤 ratio ≥ MIN_PLAY_RATIO，再在合格者中选 centerDist 最小者；
 * 距离相同比 ratio；再比 messageId 保证稳定。无人合格则暂停。
 */
function recomputePlaying(): void {
    let desired: number | null = null;
    let bestRatio = -1;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const [id, m] of visibleVideos) {
        if (m.ratio < MIN_PLAY_RATIO) continue;
        const better =
            desired === null ||
            m.centerDist < bestDist ||
            (m.centerDist === bestDist && m.ratio > bestRatio) ||
            (m.centerDist === bestDist && m.ratio === bestRatio && id < desired);
        if (better) {
            desired = id;
            bestDist = m.centerDist;
            bestRatio = m.ratio;
        }
    }

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
 * 上报视频与视口的交集度量（由 IntersectionObserver 回调驱动）。
 * ratio ≤ 0 或 metrics 为 null 时视为离开视口。
 *
 * @param silent 为 true 时只更新注册表、不抢播放权（用于媒体查看器关闭后的恢复，
 *               避免刚关掉全屏就立刻自动播）。离开视口仍会触发重算。
 */
export function reportVideoVisibility(
    messageId: number,
    metrics: VideoViewportMetrics | null,
    options?: { silent?: boolean },
): void {
    if (!metrics || metrics.ratio <= 0) {
        if (!visibleVideos.has(messageId) && currentlyPlayingId.value !== messageId) return;
        visibleVideos.delete(messageId);
        recomputePlaying();
        return;
    }

    visibleVideos.set(messageId, metrics);
    // 任一视频几何变化时同步重测其余已登记视频，避免陈旧 centerDist 选错播放目标
    if (!options?.silent) {
        remeasureAllVisibleVideos();
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
