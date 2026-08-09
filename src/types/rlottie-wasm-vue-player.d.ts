/**
 * rlottie-wasm-vue-player 的类型声明。
 *
 * 该 npm 包未提供任何 TypeScript 类型（仅 JS 构建产物），
 * 因此在此手工补充最小可用的类型面，供本项目的 TGS 渲染迁移使用。
 */
declare module 'rlottie-wasm-vue-player' {
    import type { Plugin } from 'vue';

    /** RlottiePlayer 组件实例（通过模板 ref 暴露的可编程控制 API） */
    export interface RlottiePlayerInstance {
        /** 开始或恢复播放 */
        play(): void;
        /** 暂停播放 */
        pause(): void;
        /** 停止播放并回到第一帧 */
        stop(): void;
        /** 按百分比（0-100）跳转到指定帧 */
        seek(percentage: number): void;
        /** 返回当前动画属性 */
        getProperties(): Record<string, unknown> | null;
    }

    export interface RlottiePlayerProps {
        /** 动画源：stringified JSON 或 URL */
        src: string | Record<string, unknown>;
        /** 播放器宽度 */
        width?: number | string;
        /** 播放器高度 */
        height?: number | string;
        /** 是否自动播放，默认 false */
        autoplay?: boolean;
        /** 是否循环播放，默认 true */
        loop?: boolean;
        /** 播放倍速，默认 1 */
        speed?: number;
        /** 背景色，默认 transparent */
        background?: string;
        /** 图层自定义 */
        layers?: Record<string, unknown>;
        /** 自定义 canvas id */
        canvasId?: string;
        /** 资源路径 */
        assetPath?: string;
    }

    /** RlottiePlayer Vue 组件（Options API，模板 ref 为 RlottiePlayerInstance） */
    export const RlottiePlayer: {
        new (): RlottiePlayerInstance;
        props: Record<string, unknown>;
    } & import('vue').DefineComponent<RlottiePlayerProps>;

    const plugin: Plugin;
    export default plugin;
}
