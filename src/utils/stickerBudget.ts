/**
 * 贴纸动画（tlottie）负载预算。
 *
 * 背景：trace 实测聊天页里贴纸动画是主线程 + tlottie Worker 的最大负载源
 * （worker 自耗时 25s+，主线程 rAF 动画回调 25s+，丢帧率 68%）。
 *
 * 两件事：
 * 1. 负重注册表 —— 按动画内容 key 登记实例（同一内容重复注册只累加计数，
 *    同一播放器重复 acquire 幂等）。30fps 档下同 key 的重复实例只保留一个
 *    继续播、其余冻结，防止同样的贴纸被重复渲染。
 * 2. FPS 预算 —— rAF 实测帧间隔。目标 60fps：连续 2 个 1s 窗口平均 >19ms
 *    （或单窗口 >34ms 立即）视为预算不足，降为 30fps 档；连续 3 个窗口
 *    平均 <17.5ms 回到 60 档。30 档用 50% 占空比（33ms 播 / 33ms 停）驱动
 *    播放器：Worker 停摆不渲染，恢复时 PlayerEngine 按墙钟补帧，播放时长
 *    不变、渲染开销减半。原生帧率 ≤30 的动画在 30 档豁免（再对半会掉到
 *    15fps），通过 tlottie 帧快照估算实际渲染帧率，>35fps 才纳入占空比。
 *
 * ponytail: 占空比对所有实例同相同停（全局冻结 33ms），比逐个错峰更省
 * Worker rAF；若观感出现整体闪冻，再给每个实例加相位偏移即可。
 */

/** 由播放器（TgsPlayer）实现的预算句柄 */
export interface BudgetHandle {
    /** 外部门控（视口/窗口/滚动等 play/pause 意图）是否要求播放 */
    isWanted(): boolean;
    /** 30 档占空比：true = 本周期强制停（内部转为 pause，不改变外部意图） */
    setDutyOff(off: boolean): void;
    /** 估算当前渲染帧率（fps）；尚无帧快照时返回 null */
    sampleFps(): number | null;
}

type Entry = { count: number; handles: Set<BudgetHandle> };

/** 负重注册表：key → 实例集合 */
const registry = new Map<string, Entry>();

let mode: 60 | 30 = 60;
let dutyPhase = false;
let dutyTimer: ReturnType<typeof setInterval> | null = null;
let rafId = 0;
let lastAt = 0;
let winStart = 0;
let winSum = 0;
let winN = 0;
let overStreak = 0;
let goodStreak = 0;

/** 纯函数：一个观测窗口的平均帧间隔 → 模式迁移（stickerBudget.check 覆盖） */
export function budgetStep(
    avgMs: number,
    cur: 60 | 30,
    over: number,
    good: number,
): { mode: 60 | 30; over: number; good: number } {
    if (cur === 60) {
        if (avgMs > 34) return { mode: 30, over: 0, good: 0 };
        if (avgMs > 19) {
            const o = over + 1;
            return { mode: o >= 2 ? 30 : 60, over: o >= 2 ? 0 : o, good: 0 };
        }
        return { mode: 60, over: 0, good: 0 };
    }
    if (avgMs < 17.5) {
        const g = good + 1;
        if (g >= 3) return { mode: 60, over: 0, good: 0 };
        return { mode: 30, over: 0, good: g };
    }
    return { mode: 30, over: 0, good: 0 };
}

/**
 * 登记一个贴纸动画实例，返回释放函数（幂等）。
 * 同一句柄重复登记不产生第二条记录；同 key 多实例只累加计数。
 */
export function acquireSticker(key: string, handle: BudgetHandle): () => void {
    if (registry.size === 0) startMeter();
    let entry = registry.get(key);
    if (!entry) {
        entry = { count: 0, handles: new Set() };
        registry.set(key, entry);
    }
    entry.count += 1;
    entry.handles.add(handle);

    let released = false;
    return () => {
        if (released) return;
        released = true;
        handle.setDutyOff(false);
        entry.count -= 1;
        entry.handles.delete(handle);
        if (entry.count <= 0) registry.delete(key);
        if (registry.size === 0) stopMeter();
    };
}

function setMode(m: 60 | 30) {
    if (mode === m) return;
    mode = m;
    if (m === 30) startDuty();
    else stopDuty();
}

function startDuty() {
    if (dutyTimer) return;
    dutyTimer = setInterval(() => {
        dutyPhase = !dutyPhase;
        // 同 key 的重复实例在 30 档只留一个继续播（占空比），其余冻结
        const seen = new Set<string>();
        for (const [key, entry] of registry) {
            for (const h of entry.handles) {
                if (!h.isWanted()) {
                    // 外部门控已暂停：不参与占空比，保持其暂停意图
                    h.setDutyOff(false);
                    continue;
                }
                const fps = h.sampleFps();
                if (fps != null && fps <= 35) {
                    // 原生 ≤30fps：已在预算内，豁免降频
                    h.setDutyOff(false);
                    continue;
                }
                const keepFirst = !seen.has(key);
                seen.add(key);
                h.setDutyOff(keepFirst ? !dutyPhase : true);
            }
        }
    }, 33);
}

function stopDuty() {
    if (dutyTimer) {
        clearInterval(dutyTimer);
        dutyTimer = null;
    }
    for (const entry of registry.values()) {
        for (const h of entry.handles) h.setDutyOff(false);
    }
}

function startMeter() {
    if (rafId) return;
    lastAt = 0;
    winStart = 0;
    winSum = 0;
    winN = 0;
    overStreak = 0;
    goodStreak = 0;
    rafId = requestAnimationFrame(onFrame);
}

function stopMeter() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    setMode(60);
}

function onFrame(now: number) {
    rafId = requestAnimationFrame(onFrame);
    if (!lastAt) {
        lastAt = now;
        winStart = now;
        return;
    }
    // 隐藏页恢复等超大间隔不计入（rAF 在隐藏页本就停摆）
    winSum += Math.min(now - lastAt, 250);
    winN += 1;
    lastAt = now;
    if (now - winStart < 1000 && winN < 120) return;
    const avg = winSum / winN;
    winStart = now;
    winSum = 0;
    winN = 0;
    const r = budgetStep(avg, mode, overStreak, goodStreak);
    overStreak = r.over;
    goodStreak = r.good;
    if (r.mode !== mode) setMode(r.mode);
}
