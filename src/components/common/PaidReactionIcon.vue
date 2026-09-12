<template>
    <TgsPlayer v-if="tgsData" ref="playerRef" :data="tgsData" :loop="false" :autoplay="false" :size="size"
        @load="onLoad" @complete="onComplete" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import TgsPlayer, { type TgsPlayerInstance } from './TgsPlayer.vue';

withDefaults(defineProps<{
    /** 动画的 CSS 显示尺寸 */
    size?: number;
}>(), {
    size: 22,
});

/** 本地 PaidReactionActivate.tgs 资源 URL */
const PAID_TGS_URL = new URL('../../assets/PaidReactionActivate.tgs', import.meta.url).href;

const playerRef = ref<TgsPlayerInstance | null>(null);
const tgsData = ref<Uint8Array | null>(null);
/** 防止底层播放器重复触发 load 时重新播放 */
let hasPlayed = false;

async function loadTgs() {
    try {
        const resp = await fetch(PAID_TGS_URL);
        tgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error('PaidReactionIcon: failed to load TGS:', e);
    }
}

/** 加载完成：播放一次 */
function onLoad() {
    if (hasPlayed) return;
    hasPlayed = true;
    playerRef.value?.play();
}

/** 播完停在末尾（tlottie complete 事件） */
function onComplete() {
    playerRef.value?.pause();
}

onMounted(() => {
    void loadTgs();
});

onUnmounted(() => {
    hasPlayed = false;
});
</script>
