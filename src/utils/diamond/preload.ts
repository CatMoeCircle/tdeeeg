/**
 * 钻石预热：在应用空闲期把「拉表 → 建 WebGL 上下文 → 编译着色器」整套提前跑完，
 * 并产出三种配色的首帧占位图。
 *
 * 不预热的话，这套成本会在用户第一次看到转账卡片时支付（冷启动秒级）。
 * 预热完再遇到钻石，首现只剩一帧绘制；即使当天是冷启动、预热还没跑完，
 * 也有占位图先顶着（见 placeholder.ts）。
 */
import { PALETTE_BLUE, PALETTE_COOL, PALETTE_ICE } from './palette';

const PALETTES = [PALETTE_BLUE, PALETTE_ICE, PALETTE_COOL] as const;

/** 首帧占位图刚启动就试着读（很小，不占关键路径） */
const PLACEHOLDER_DELAY_MS = 600;
/** WebGL 预热再晚一点，避开启动时 TDLib / 首屏渲染的高峰 */
const WARM_DELAY_MS = 1200;

let scheduled = false;
let warming: Promise<void> | null = null;

/** 读回磁盘上的占位图（幂等，失败静默） */
export function preloadDiamondPlaceholders(): void {
    void import('./placeholder').then((m) => m.loadDiamondPlaceholders(PALETTES)).catch(() => {});
}

/**
 * 安排一次后台预热：延迟后走 requestIdleCallback（没有则 setTimeout），
 * 与启动关键路径错开。重复调用无副作用。
 */
export function scheduleDiamondPrewarm(): void {
    if (scheduled) return;
    scheduled = true;
    // 占位图很小，早一点读：读到后即使预热还没跑完，卡片也能立刻有画面
    setTimeout(preloadDiamondPlaceholders, PLACEHOLDER_DELAY_MS);
    const run = () => {
        void prewarmDiamond();
    };
    setTimeout(() => {
        const idle = (window as unknown as {
            requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number;
        }).requestIdleCallback;
        if (typeof idle === 'function') {
            idle(run, { timeout: 3000 });
        } else {
            run();
        }
    }, WARM_DELAY_MS);
}

/** 立即预热（诊断 / 需要时手动触发）；返回的 Promise 永不 reject */
export function prewarmDiamond(): Promise<void> {
    if (!warming) {
        warming = (async () => {
            let prewarm: (() => Promise<void>) | null = null;
            try {
                prewarm = (await import('./stage')).prewarmDiamondStage;
            } catch (error) {
                if (import.meta.env.DEV) console.warn('[diamond] prewarm chunk load failed:', error);
                return;
            }
            try {
                await prewarm();
            } catch (error) {
                // 预热失败不影响正常路径：真正出现钻石时 stage 自己会带退避重试
                if (import.meta.env.DEV) console.warn('[diamond] prewarm failed:', error);
            }
        })();
    }
    return warming;
}
