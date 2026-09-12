/**
 * tlottie/vue 类型 shim。
 *
 * 包内情况：
 * - package.json `exports["./vue"].types` → `dist/vue/index.d.ts`（不存在）
 * - 真实入口 JS：`dist/vue/index.js`（可用）
 * - 真实类型文件：`dist/vue/vue/index.d.ts`，但其中
 *   `export { default as LottiePlayer } from './LottiePlayer.vue'`
 *   所引用的 LottiePlayer.vue 并未随包发布 → 官方类型链断裂。
 *
 * 因此这里按 dist/vue/index.js 的实际 API 手写最小可用声明。
 * 若上游补全了 .d.ts / .vue 产物，可删掉本文件并改用：
 *   paths: { "tlottie/vue": ["./node_modules/tlottie/dist/vue/vue/index.d.ts"] }
 */
declare module "tlottie/vue" {
    import type { DefineComponent } from "vue";
    import type { FitzModifier, LoopConfig, PlayDirection } from "tlottie";

    export interface LottiePlayerProps {
        src?: string;
        data?: string | Uint8Array;
        speed?: number;
        loop?: LoopConfig;
        direction?: PlayDirection;
        autoplay?: boolean;
        fitzModifier?: FitzModifier;
        layerColorReplacements?: { layerNamePrefix: string; color: number }[];
        quality?: { antialias?: boolean; curveTolerance?: number };
        wasmUrl?: string;
        workerCount?: number;
        forceRender?: boolean;
        reportFrames?: boolean;
        outline?: string;
        class?: string;
        playOnClick?: boolean;
    }

    /** 组件 ref 暴露：`playerRef.value.tlottie()` 取 TLottie 实例 */
    export const LottiePlayer: DefineComponent<LottiePlayerProps>;

    export * from "tlottie";
}

declare module "tlottie/vue/style.css";
