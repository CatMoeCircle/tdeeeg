import { computed, type Ref } from 'vue';

/**
 * rlottie (rlottie-wasm-vue-player) 渲染质量控制工具。
 *
 * 背景：`RlottiePlayer` 组件的 canvas 物理分辨率等于其 `width/height` props，
 * 与 CSS 显示尺寸（canvas 100% 填满容器）在 DPR>1 或放大场景下不匹配，
 * 导致 TGS 动画看上去模糊/锯齿。
 *
 * 本工具采用「超采样」：让组件以 显示尺寸 × SCALE 的分辨率渲染，
 * 再用带 `!important` 的容器样式把最终显示尺寸压回目标尺寸。
 *
 * SCALE 越高渲染像素越多、单帧越慢——当 TGS emoji 密集出现（表情选择器、聊天列表、
 * 对话文件夹、消息文本内联 emoji）时，低渲染能力导致部分动画掉帧、看起来「变慢」，
 * 显示速率不一致。降为 1 后每个动画负载骤减（面积只有 2x 的 1/4），可保证所有
 * 动画以一致速率满帧播放。质量不做保证，仅「消息气泡中的贴纸」通过 MessageStickerContent
 * 单独传较高的 scale 保留清晰度。
 */

/** 渲染超采样倍数（默认）：渲染分辨率 = 显示尺寸 × SCALE。1 = 极低质量、速率一致；2 = 高质量、负载高 */
export const RLOTTIE_RENDER_SCALE = 1;

/** 用于把 RlottiePlayer 显示尺寸固定为目标值的全局类（配合 CSS 变量，见 index.css） */
export const RLOTTIE_HI_RES_CLASS = 'rlottie-hi-res';

/**
 * 根据目标显示尺寸（reactive）计算 RlottiePlayer 的渲染尺寸与显示样式。
 * @param displaySize 期望的 CSS 显示边长（px），可为任意（响应式）数值 ref
 * @param scaleOverride 可选的超采样倍数覆盖。默认用 RLOTTIE_RENDER_SCALE；
 *       传给低质量场景（如贴纸网格）可传 1 以省渲染像素，换取更高数量/性能。
 * @returns { renderSize, hiResStyle, hiResClass }
 *  - renderSize:   传给 RlottiePlayer 的 :width / :height（高分辨率渲染）
 *  - hiResStyle:   传给 RlottiePlayer 的 :style，通过 CSS 变量指定目标显示尺寸
 *  - hiResClass:   传给 RlottiePlayer 的 class（配合 hiResStyle 的变量做 !important 覆盖）
 */
export function useRlottieRenderSize(displaySize: Ref<number>, scaleOverride?: number) {
    const scale = scaleOverride ?? RLOTTIE_RENDER_SCALE;
    const renderSize = computed(() => Math.round(displaySize.value * scale));

    /** 通过 CSS 变量设置目标显示尺寸；.rlottie-hi-res 用它覆盖组件容器内联尺寸 */
    const hiResStyle = computed<Record<string, string>>(() => ({
        '--rlottie-w': `${displaySize.value}px`,
        '--rlottie-h': `${displaySize.value}px`,
    }));

    return { renderSize, hiResStyle, hiResClass: RLOTTIE_HI_RES_CLASS };
}
