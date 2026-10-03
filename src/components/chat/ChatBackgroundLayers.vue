<template>
    <div v-if="render" class="chat-bg-layers absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <!-- 底层：纯色 / 渐变 / freeform；反色图案时整层压黑，填充改由遮罩层绘制 -->
        <div class="absolute inset-0" :style="baseStyle"></div>

        <!-- backgroundTypePattern：非反色用 soft-light 叠图案，反色则用图案当遮罩裁剪填充 -->
        <div v-if="render.pattern && !render.pattern.inverted" class="absolute inset-0" :style="positivePatternStyle">
        </div>
        <template v-else-if="render.pattern">
            <div class="absolute inset-0" :style="maskedFillStyle"></div>
            <div class="absolute inset-0 bg-black" :style="{ opacity: 1 - render.pattern.intensity }"></div>
        </template>

        <!-- 深色主题压暗（chatBackground.dark_theme_dimming） -->
        <div v-if="dimmingOpacity > 0" class="absolute inset-0 bg-black" :style="{ opacity: dimmingOpacity }"></div>

        <!-- 主题遮罩：让壁纸不影响上方文字可读性 -->
        <div v-if="scrimOpacity > 0" class="absolute inset-0"
            :style="{ background: overlayColor, opacity: scrimOpacity }"></div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fillToCss, type ChatBackgroundRender } from '../../utils/chatBackground';

const props = withDefaults(defineProps<{
    /** 解析后的背景模型；null 表示不铺（透出底层） */
    render?: ChatBackgroundRender | null;
    /** 主题遮罩不透明度 0-100 */
    overlayOpacity?: number;
    /** 额外模糊半径（px）：用户设置的壁纸模糊，图片层用 */
    blurPx?: number;
    overlayColor?: string;
}>(), {
    render: null,
    overlayOpacity: 0,
    blurPx: 0,
    overlayColor: 'var(--app-bg-elevated, #fff)',
});

/** TDLib is_blurred 的语义：450×450 降采样 + 半径 12 模糊 */
const TD_BLUR_RADIUS = 12;

const baseStyle = computed<Record<string, string>>(() => {
    const render = props.render;
    if (!render) return {};
    if (render.pattern?.inverted) return { backgroundColor: '#000' };
    if (render.wallpaper) {
        // 图片未就绪时的底色，避免首帧漏出下层
        return { backgroundColor: render.baseColor, ...wallpaperStyle(render.wallpaper.url) };
    }
    return fillToCss(render.fill);
});

function wallpaperStyle(url: string): Record<string, string> {
    const blur = (props.render?.wallpaper?.blurred ? TD_BLUR_RADIUS : 0) + props.blurPx;
    const style: Record<string, string> = {
        backgroundImage: `url("${url}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    };
    if (blur > 0) {
        style.filter = `blur(${blur}px)`;
        style.transform = 'scale(1.05)';
    }
    return style;
}

const positivePatternStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};
    const pattern = props.render?.pattern;
    if (!pattern) return style;
    style.backgroundImage = `url("${pattern.url}")`;
    style.backgroundSize = `${pattern.tileWidth}px ${pattern.tileHeight}px`;
    style.backgroundRepeat = 'repeat';
    // 图案叠加在填充之上：soft-light 让白色图案提亮、深色图案压暗（对齐 Unigram BlendEffect）
    style.mixBlendMode = 'soft-light';
    style.opacity = String(pattern.intensity);
    return style;
});

const maskedFillStyle = computed<Record<string, string>>(() => {
    const pattern = props.render?.pattern;
    if (!pattern) return {};
    const url = `url("${pattern.url}")`;
    const size = `${pattern.tileWidth}px ${pattern.tileHeight}px`;
    const style: Record<string, string> = fillToCss(props.render?.fill ?? null);
    style.maskImage = url;
    style.maskRepeat = 'repeat';
    style.maskSize = size;
    style.WebkitMaskImage = url;
    style.WebkitMaskRepeat = 'repeat';
    style.WebkitMaskSize = size;
    return style;
});

const dimmingOpacity = computed(() => (props.render?.dimming ?? 0) / 100);
const scrimOpacity = computed(() => props.overlayOpacity / 100);
</script>

<style scoped>
.chat-bg-layers {
    z-index: 0;
}
</style>
