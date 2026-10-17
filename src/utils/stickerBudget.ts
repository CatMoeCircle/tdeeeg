/**
 * 贴纸动画（tlottie）负载预算。
 *
 * 背景（33.1s trace，dev + Slow 4G 录制，绝对值被放大，结构性结论与构建模式无关）：
 * 旧实现 rAF 每帧无条件重排（onFrame 调用 4028 次 = 每帧一次），注册表非空时永不 idle，
 * 迫使页面每帧都走完整管线（Layerize 4031 次 / 2977ms，样式重算 3434 次）。
 * 主线程占用 21.0s / 33.1s（63.5%），掉帧 1037 / 4028；采样函数自身仅约 278ms。
 * 旧结论"worker 自耗时 25s+"本次不成立：tlottie worker isolate 采样 31s 中 idle 29.2s，
 * 真实工作约 1.2s。瓶颈是主线程的常驻 rAF 循环，不是 Worker 计算。
 *
 * 两件事：
 * 1. 负重注册表 —— 按动画内容 key 登记实例（同一内容重复注册只累加计数，
 *    同一播放器重复 acquire 幂等）。30fps 档下所有实例（含同 key 重复实例）
 *    统一走 50% 占空比：都在动，但每帧渲染量减半。
 * 2. FPS 预算 —— 突发式 rAF 实测帧间隔（见下方采样旋钮）。目标 60fps：连续 2 个窗口平均 >19ms
 *    （或单窗口 >34ms 立即）视为预算不足，降为 30fps 档；连续 3 个窗口
 *    平均 <17.5ms 回到 60 档。30 档用 50% 占空比（33ms 播 / 33ms 停）驱动
 *    播放器：Worker 停摆不渲染，恢复时 PlayerEngine 按墙钟补帧，播放时长
 *    不变、渲染开销减半。原生帧率 ≤30 的动画在 30 档豁免（再对半会掉到
 *    15fps），通过 tlottie 帧快照估算实际渲染帧率，>35fps 才纳入占空比。
 *
 * 采样改为突发式：每次突发 ≤1s 或 ≤30 个样本（先到者结束），之后空闲 900ms，
 * 不再常驻 rAF。判定语义不变，检测延迟变长（约 3–4s 才能降档/升档）。
 *
 * ponytail: 突发采样漏检完全落在空闲窗口内的卡顿；需要更精确时改用
 * PerformanceObserver('long-animation-frame')，或只在确有 isWanted() 的实例时才采样。
 * 占空比对所有实例同相同停（全局冻结 33ms），比逐个错峰更省 Worker rAF；
 * 若观感出现整体闪冻，再给每个实例加相位偏移即可。
 */

/** 突发采样窗口上限（ms）：与原 1s 观测窗口一致，保证 budgetStep 阈值含义不变 */
const BURST_MS = 1000;
/** 突发样本上限：60fps 约 500ms 凑满，30fps 约 1s 凑满；30 个间隔的均值足以区分 16.7ms 与 33ms */
const BURST_SAMPLES = 30;
/** 突发间空闲（ms）：突发占比约 1/3，给页面留出 idle 窗口；只影响检测延迟，不影响判定 */
const REST_MS = 900;
/** 单个帧间隔上限（ms）：隐藏页恢复等超大间隔不计入（rAF 在隐藏页本就停摆） */
const MAX_GAP_MS = 250;

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
let restTimer: ReturnType<typeof setTimeout> | null = null;
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
        for (const [, entry] of registry) {
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
                // 同内容重复实例（如一条消息里几十个相同自定义 emoji）不再只留一个播、
                // 其余永久冻结——那会让同一 emoji 有的在动有的静止。统一走 50% 占空比，
                // 全部都在动、渲染开销仍是一半。
                // ponytail: 重复实例同相冻结仍是全屏级 33ms 停顿；出现观感抖动再给实例加相位偏移。
                h.setDutyOff(dutyPhase);
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

/** 开始一次突发采样：清空窗口，重新建立帧基线（跳过空闲期间的超大间隔） */
function beginBurst() {
    lastAt = 0;
    winStart = 0;
    winSum = 0;
    winN = 0;
    rafId = requestAnimationFrame(onFrame);
}

function startMeter() {
    // 幂等：采样中或空闲等待中都不再起第二个循环/定时器
    if (rafId || restTimer) return;
    overStreak = 0;
    goodStreak = 0;
    beginBurst();
}

function stopMeter() {
    if (rafId) cancelAnimationFrame(rafId);
    if (restTimer) clearTimeout(restTimer);
    rafId = 0;
    restTimer = null;
    setMode(60);
}

function onFrame(now: number) {
    if (!lastAt) {
        lastAt = now;
        winStart = now;
        rafId = requestAnimationFrame(onFrame);
        return;
    }
    winSum += Math.min(now - lastAt, MAX_GAP_MS);
    winN += 1;
    lastAt = now;
    if (now - winStart < BURST_MS && winN < BURST_SAMPLES) {
        rafId = requestAnimationFrame(onFrame);
        return;
    }
    // 突发结束：评估一个窗口，然后空闲 REST_MS 再开下一次突发
    rafId = 0;
    const avg = winSum / winN;
    const r = budgetStep(avg, mode, overStreak, goodStreak);
    overStreak = r.over;
    goodStreak = r.good;
    if (r.mode !== mode) setMode(r.mode);
    restTimer = setTimeout(() => {
        restTimer = null;
        if (registry.size > 0) beginBurst();
    }, REST_MS);
}
