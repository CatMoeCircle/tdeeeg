/**
 * tlottie 运行时预热。
 *
 * 用 Worker + WASM 渲染 TGS；首次播放前调用可提前拉起 worker 与 wasm，
 * 避免首张贴纸/表情出现额外卡顿。
 */
import { initializeTLottie } from "tlottie";

let readyPromise: Promise<void> | null = null;

export function initTlottie(): Promise<void> {
    if (!readyPromise) {
        readyPromise = initializeTLottie().catch((e) => {
            readyPromise = null;
            throw e;
        });
    }
    return readyPromise;
}
