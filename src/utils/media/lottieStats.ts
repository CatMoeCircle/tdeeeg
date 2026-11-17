/**
 * 诊断计数器：tlottie 引擎装载次数 + play/pause 指令次数。
 *
 * 用途：确认播放门控「有没有真的动」——
 * - `loads` 在滚动/切会话时上涨 = 玩家在被反复重建（引擎 + Worker 装载是重活）；
 * - `playing`（plays - pauses）异常大 = 有动画在离屏/失焦状态下仍被要求播放；
 * - `topKeys` = 被重复装载最多的动画内容，用来定位到底是哪类消息在重建。
 *
 * 只做数字递增 + 一张 Map，不采样、不监听，默认零成本。
 * devtools 里 `__lottieStats()` 看快照，`__lottieStats.reset()` 清零后做对照。
 */

/** 首帧耗时统计（贴纸从组件挂载到引擎 load 事件） */
export interface LottieLoadTiming {
    /** 最近一次首帧耗时 ms；还没样本时 null */
    lastMs: number | null;
    /** 平均首帧耗时 ms；还没样本时 null */
    avgMs: number | null;
    /** 最慢一次首帧耗时 ms；还没样本时 null */
    maxMs: number | null;
    /** 样本数 */
    samples: number;
}

export interface LottieStatsSnapshot {
    /** 引擎 onLoad 次数（重建/换源都算一次） */
    loads: number;
    /** 不同动画内容数（src / data 去重后） */
    uniqueKeys: number;
    plays: number;
    pauses: number;
    /** plays - pauses：当前被要求播放的数量 */
    playing: number;
    /** 单内容重复装载最多的前几名 */
    topKeys: { key: string; loads: number }[];
    /** 首帧耗时（从组件挂载到引擎 load）：用来验证预热/扩池是否真的变快 */
    loadTiming: LottieLoadTiming;
}

const perKey = new Map<string, number>();
let loads = 0;
let plays = 0;
let pauses = 0;
let loadSamples = 0;
let loadSum = 0;
let loadMax = 0;
let loadLast: number | null = null;

/**
 * 记一次引擎装载。
 *
 * @param key 动画内容 key
 * @param elapsedMs 可选：从组件挂载到 load 的毫秒数（首帧耗时）
 */
export function countLottieLoad(key: string, elapsedMs?: number): void {
    loads++;
    perKey.set(key, (perKey.get(key) ?? 0) + 1);
    if (elapsedMs == null || !Number.isFinite(elapsedMs)) return;
    const value = Math.max(0, elapsedMs);
    loadSamples += 1;
    loadSum += value;
    loadMax = Math.max(loadMax, value);
    loadLast = value;
}

export function countLottieCommand(cmd: 'play' | 'pause'): void {
    if (cmd === 'play') plays++;
    else pauses++;
}

export function lottieStats(): LottieStatsSnapshot {
    const topKeys = [...perKey.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, n]) => ({ key: key.length > 80 ? `${key.slice(0, 40)}…${key.slice(-20)}` : key, loads: n }));
    return {
        loads,
        uniqueKeys: perKey.size,
        plays,
        pauses,
        playing: plays - pauses,
        topKeys,
        loadTiming: {
            lastMs: loadLast == null ? null : Math.round(loadLast),
            avgMs: loadSamples ? Math.round(loadSum / loadSamples) : null,
            maxMs: loadSamples ? Math.round(loadMax) : null,
            samples: loadSamples,
        },
    };
}

export function resetLottieStats(): void {
    perKey.clear();
    loads = 0;
    plays = 0;
    pauses = 0;
    loadSamples = 0;
    loadSum = 0;
    loadMax = 0;
    loadLast = null;
}

// 挂在 window 上，不引入 UI：窗口重载即清零，不需要额外开关
if (typeof window !== 'undefined') {
    const api = lottieStats as typeof lottieStats & { reset: typeof resetLottieStats };
    api.reset = resetLottieStats;
    (window as unknown as { __lottieStats?: typeof api }).__lottieStats = api;
}
