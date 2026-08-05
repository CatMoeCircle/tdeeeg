<template>
    <!-- Telegram 风格剧透：粒子遮罩 + 点击 ripple 波纹揭示 -->
    <span ref="rootRef" class="sp">
        <span ref="baseRef" class="sp-base"><slot /></span>
        <span ref="viewRef" class="sp-view"></span>
        <canvas ref="cvRef" class="sp-cv"></canvas>
    </span>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { SpoilerFX, type SpoilerFXOptions } from '../../../../utils/spoilerFX';

const props = defineProps<{
    /** 剧透粒子特效配置（可选，缺省用 Telegram 默认动画参数） */
    fx?: SpoilerFXOptions;
}>();

const rootRef = ref<HTMLElement | null>(null);
const baseRef = ref<HTMLElement | null>(null);
const viewRef = ref<HTMLElement | null>(null);
const cvRef = ref<HTMLCanvasElement | null>(null);

let fx: SpoilerFX | null = null;

onMounted(() => {
    if (!rootRef.value || !baseRef.value || !viewRef.value || !cvRef.value) return;
    // 用 base 的真实内容渲染 view（供 reveal 时显示，保持与 base 完全一致）
    viewRef.value.innerHTML = baseRef.value.innerHTML;
    fx = new SpoilerFX(rootRef.value, props.fx ?? {}, {
        base: baseRef.value,
        view: viewRef.value,
        cv: cvRef.value,
    });
});

onUnmounted(() => {
    fx?.destroy();
    fx = null;
});
</script>
