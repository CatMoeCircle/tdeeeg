<template>
    <RlottiePlayer v-if="tgsData" ref="playerRef" :src="tgsData" :loop="false" :autoplay="false" :width="renderSize"
        :height="renderSize" class="rlottie-hi-res" :style="hiResStyle" @load="onLoad" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { RlottiePlayer, type RlottiePlayerInstance } from 'rlottie-wasm-vue-player';
import * as pako from 'pako';
import { useRlottieRenderSize } from '../../composables/useRlottieRenderSize';

const props = withDefaults(defineProps<{
    /** 动画的 CSS 显示尺寸 */
    size?: number;
}>(), {
    size: 22,
});

/** 本地 PaidReactionActivate.tgs 资源 URL */
const PAID_TGS_URL = new URL('../../assets/PaidReactionActivate.tgs', import.meta.url).href;

const displaySize = ref(props.size);
const { renderSize, hiResStyle } = useRlottieRenderSize(displaySize);

const playerRef = ref<RlottiePlayerInstance | null>(null);
const tgsData = ref<string | null>(null);
/** 播放完毕后用于 seek+pause 的定时器 */
let endTimer: ReturnType<typeof setTimeout> | null = null;
/** 防止底层播放器重复触发 load 时重新播放 */
let hasPlayed = false;
/** Lottie JSON 解析后的总帧数与帧率，用于精确计算播放时长 */
let totalFrames = 0;
let frameRate = 30;

async function loadTgs() {
    try {
        const resp = await fetch(PAID_TGS_URL);
        const compressed = new Uint8Array(await resp.arrayBuffer());
        let jsonStr: string;
        try {
            jsonStr = new TextDecoder('utf-8').decode(pako.inflate(compressed));
        } catch {
            jsonStr = new TextDecoder('utf-8').decode(compressed);
        }
        const animData = JSON.parse(jsonStr);
        totalFrames = animData.op ?? animData.fr ?? 60;
        frameRate = animData.fr ?? 30;
        tgsData.value = JSON.stringify(animData);
    } catch (e) {
        console.error('PaidReactionIcon: failed to load TGS:', e);
    }
}

/** RlottiePlayer 加载完成：播放一次动画，播完后停在最后一帧 */
function onLoad() {
    const anim = playerRef.value;
    if (!anim || hasPlayed) return;
    hasPlayed = true;
    if (endTimer !== null) {
        clearTimeout(endTimer);
        endTimer = null;
    }
    anim.play();
    // 动画播完后 seek 到最后一帧并暂停（冻结）
    const durationMs = Math.round((totalFrames / frameRate) * 1000) + 200;
    endTimer = setTimeout(() => {
        anim.seek(100);
        anim.pause();
    }, durationMs);
}

onMounted(() => {
    void loadTgs();
});

onUnmounted(() => {
    if (endTimer !== null) {
        clearTimeout(endTimer);
        endTimer = null;
    }
});
</script>
