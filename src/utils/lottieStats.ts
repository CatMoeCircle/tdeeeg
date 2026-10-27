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
}

const perKey = new Map<string, number>();
let loads = 0;
let plays = 0;
let pauses = 0;

export function countLottieLoad(key: string): void {
    loads++;
    perKey.set(key, (perKey.get(key) ?? 0) + 1);
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
    return { loads, uniqueKeys: perKey.size, plays, pauses, playing: plays - pauses, topKeys };
}

export function resetLottieStats(): void {
    perKey.clear();
    loads = 0;
    plays = 0;
    pauses = 0;
}

// 挂在 window 上，不引入 UI：窗口重载即清零，不需要额外开关
if (typeof window !== 'undefined') {
    const api = lottieStats as typeof lottieStats & { reset: typeof resetLottieStats };
    api.reset = resetLottieStats;
    (window as unknown as { __lottieStats?: typeof api }).__lottieStats = api;
}
