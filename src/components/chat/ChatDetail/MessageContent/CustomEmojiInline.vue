<template>
  <span class="inline-flex items-center align-middle mx-0.5 overflow-hidden"
    :style="{ width: size + 'px', height: size + 'px' }">
    <!-- 已下载完成：根据格式渲染 -->
    <template v-if="state.ready && state.filePath && state.sticker">
      <!-- WEBP static -->
      <img v-if="emojiFormat === 'webp'" :src="state.filePath" class="w-full h-full object-contain" />
      <!-- TGS animated (Lottie) -->
      <div v-else-if="emojiFormat === 'tgs'" ref="lottieRef" class="w-full h-full"></div>
      <!-- WEBM video -->
      <video v-else-if="emojiFormat === 'webm'" :src="state.filePath" autoplay loop muted playsinline
        class="w-full h-full object-contain" />
    </template>
    <!-- 缩略图预览（模糊） -->
    <img v-else-if="state.thumbnailUrl" :src="state.thumbnailUrl" class="w-full h-full object-contain rounded"
      :style="{ filter: 'blur(1.5px)', transform: 'scale(1.2)' }" />
    <!-- 加载中灰色骨架 -->
    <div v-else-if="fallbackText" class="w-full h-full flex items-center justify-center select-none"
      :style="{ fontSize: Math.max(12, size - 2) + 'px', lineHeight: '1' }">
      {{ fallbackText }}
    </div>
    <div v-else class="w-full h-full rounded bg-gray-200 dark:bg-gray-700 animate-pulse">
    </div>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue';
import { useCustomEmoji } from '../../../../store/customEmoji';
import lottie, { type AnimationItem } from 'lottie-web';
import * as pako from 'pako';

const props = defineProps<{
  emojiId: string;
  size?: number;
  /** 未加载完成或加载失败时显示的原始 emoji 兜底 */
  fallbackText?: string;
}>();

const size = computed(() => props.size || 22);
const state = useCustomEmoji(props.emojiId);
const lottieRef = ref<HTMLElement | null>(null);
let lottieAnim: AnimationItem | null = null;
/** 当前是否处于全局平滑滚动中（滚动期间暂停 Lottie canvas 重绘以避免卡顿） */
let scrolling = false;

/** 检测贴纸格式 */
const emojiFormat = computed(() => {
  if (!state.sticker) return 'webp';
  const fmt = state.sticker.format._;
  if (fmt === 'stickerFormatTgs') return 'tgs';
  if (fmt === 'stickerFormatWebm') return 'webm';
  return 'webp';
});

/** 加载 TGS（gzipped Lottie JSON）并播放 */
async function loadTgs(path: string) {
  destroyLottie();
  try {
    // state.filePath 已在 store 中经过 convertFileSrc 转为 asset protocol URL，
    // 此处直接使用，避免重复转换导致无效 URL
    const resp = await fetch(path);
    const compressed = new Uint8Array(await resp.arrayBuffer());
    let jsonStr: string;
    try {
      const decompressed = pako.inflate(compressed);
      jsonStr = new TextDecoder('utf-8').decode(decompressed);
    } catch {
      jsonStr = new TextDecoder('utf-8').decode(compressed);
    }
    const animData = JSON.parse(jsonStr);
    await nextTick();
    if (!lottieRef.value) return;
    lottieAnim = lottie.loadAnimation({
      container: lottieRef.value,
      animationData: animData,
      renderer: 'canvas',
      loop: true,
      autoplay: true,
    });
    // 若创建时正处于全局滚动中，立即暂停（避免异步加载完成后仍每帧重绘）
    if (scrolling) lottieAnim.pause();
  } catch (e) {
    console.error('Failed to load TGS custom emoji:', e);
  }
}

function destroyLottie() {
  if (lottieAnim) {
    lottieAnim.destroy();
    lottieAnim = null;
  }
}

// 当 emoji 就绪且为 tgs 格式时，加载 Lottie
watch([() => state.ready, () => state.filePath, emojiFormat], async ([ready, filePath, fmt]) => {
  if (ready && filePath && fmt === 'tgs') {
    await loadTgs(filePath);
  }
}, { immediate: true });

/**
 * 滚动性能优化：滚轮平滑滚动期间暂停 Lottie（canvas 每帧重绘代价高），
 * 滚动结束后恢复。WebP 为静态图、WebM 走 <video>，均不受影响。
 */
function onScrollActive(e: Event) {
  const active = (e as CustomEvent<boolean>).detail;
  if (active === scrolling || emojiFormat.value !== 'tgs') return;
  scrolling = active;
  if (lottieAnim) {
    if (active) lottieAnim.pause();
    else lottieAnim.play();
  }
}

document.addEventListener('tdgram:scroll-active', onScrollActive);

onUnmounted(() => {
  document.removeEventListener('tdgram:scroll-active', onScrollActive);
  destroyLottie();
});
</script>
