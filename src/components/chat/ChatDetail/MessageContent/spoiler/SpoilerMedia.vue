<template>
    <!-- 媒体剧透：canvas 粒子覆盖 + 点击 ripple 波纹揭示（露出媒体）
         overlay 模式用于叠加在已渲染媒体之上的局部覆盖层 -->
    <div ref="rootRef" class="media-sp" :class="{ 'is-overlay': overlay }">
        <slot />
        <canvas ref="cvRef" class="sp-cv"></canvas>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { SpoilerFX, type SpoilerFXOptions } from '../../../../../utils/spoilerFX';

const props = defineProps<{
    /** 是否显示剧透（false 时不初始化粒子） */
    hasSpoiler?: boolean;
    /** 是否为叠加在已渲染媒体之上的覆盖层（absolute 定位） */
    overlay?: boolean;
    fx?: SpoilerFXOptions;
}>();

const rootRef = ref<HTMLElement | null>(null);
const cvRef = ref<HTMLCanvasElement | null>(null);

let fx: SpoilerFX | null = null;

onMounted(() => {
    if (!rootRef.value || !cvRef.value) return;
    if (props.hasSpoiler === false) return;
    // 媒体模式：base 为媒体本身（不透明），ripple 裁剪粒子画布露出媒体。
    // 使用较大、较密集的中灰粒子，在明暗照片上都有清晰对比（类似官方 MediaSpoiler 底纹）
    fx = new SpoilerFX(rootRef.value, {
        revealTarget: 'cv',
        hideBase: false,
        count: 220,
        sizeMin: 2.2,
        sizeMax: 4,
        speedMin: 6,
        speedMax: 18,
        color: '#808285',
        // 半透明底色增强遮罩可见性（露出前能看到明显的"遮住"效果）
        layerBg: 'rgba(0, 0, 0, 0.35)',
        ...props.fx,
    } as Required<SpoilerFXOptions>, {
        base: rootRef.value,
        view: null,
        cv: cvRef.value,
    });
});

onUnmounted(() => {
    fx?.destroy();
    fx = null;
});
</script>
