/**
 * tlottie 运行时预热。
 *
 * 用 Worker + WASM 渲染 TGS；首次播放前调用可提前拉起 worker 与 wasm，避免
 * 首张贴纸/表情出现额外卡顿。
 *
 * 关键事实：tlottie 的默认 worker 池只有 **1 个** worker。所有 TGS 的 gzip 解压、
 * wasm 内 JSON parse、每帧渲染都排在同一条线程上——贴纸面板一次挂十来个 TGS 时，
 * 用户看到的第一张要等前面排队的解析全部跑完，"不能像图片一样瞬间出现"主要来自
 * 这里（单张解析本身只有几毫秒）。
 *
 * 所以策略是：启动仍只用 1 个 worker（首屏最快），等应用空闲再把池子扩到
 * 2–4 个（按 CPU 核数），把并发解析/渲染摊开。每个 worker 一份 wasm 实例，
 * 内存代价可控；扩池后的新 worker 由 initializeTLottie 一并 warm。
 */
import { initializeTLottie } from 'tlottie';

let readyPromise: Promise<void> | null = null;
/** 当前池容量：tlottie 默认池初始为 1，bootstrap 预热的也是这 1 个 */
let poolSize = 1;

/** 并发 worker 数：低端机 2 个，高端机最多 4 个 */
export function tlottieWorkerCount(): number {
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;
    return Math.max(2, Math.min(4, Math.round(cores / 2)));
}

/** 启动预热（1 个 worker + wasm）。失败不缓存，允许下次重试 */
export function initTlottie(): Promise<void> {
    if (!readyPromise) {
        readyPromise = initializeTLottie().catch((e) => {
            readyPromise = null;
            throw e;
        });
    }
    return readyPromise;
}

/**
 * 空闲期把 worker 池扩到 {@link tlottieWorkerCount}。
 *
 * 幂等：已经扩过就直接返回；扩池失败不致命（已 warm 的 worker 仍可用，只是
 * 并发度退回 1）——调用方按 warn 处理即可。
 */
export function warmTlottiePool(): Promise<void> {
    const target = tlottieWorkerCount();
    if (target <= poolSize) return readyPromise ?? Promise.resolve();
    poolSize = target;
    const growing = initializeTLottie({ workerCount: target });
    // 启动预热若已失败，扩池仍要照做（不能因为一次失败就永远只有 1 个 worker）
    readyPromise = readyPromise
        ? readyPromise.catch(() => undefined).then(() => growing)
        : growing;
    return readyPromise;
}
