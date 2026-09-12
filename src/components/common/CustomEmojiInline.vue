<template>
  <span ref="rootEl" class="inline-flex items-center align-middle mx-0.5 overflow-hidden"
    :style="{ width: size + 'px', height: size + 'px' }">
    <!-- 已下载完成：根据格式渲染 -->
    <template v-if="state.ready && state.filePath && state.sticker">
      <!-- WEBP static -->
      <img v-if="emojiFormat === 'webp'" :src="state.filePath" class="w-full h-full object-contain" />
      <!-- TGS animated (Lottie / tlottie) -->
      <TgsPlayer v-else-if="emojiFormat === 'tgs' && tgsSrc" ref="playerRef" :src="tgsSrc"
        :loop="props.loop ?? true" :autoplay="true" :size="size" @load="onAnimLoad" @error="onAnimError" />
      <!-- WEBM video -->
      <video v-else-if="emojiFormat === 'webm'" ref="videoRef" :src="state.filePath" autoplay :loop="props.loop ?? true" muted playsinline
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
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useCustomEmoji, requestCustomEmoji } from '../../store/customEmoji';
import { useLottiePause } from '../../composables/useLottiePause';
import { useViewportLoad } from '../../composables/useViewportLoad';
import { convertFileSrc } from '@tauri-apps/api/core';
import TgsPlayer, { type TgsPlayerInstance } from './TgsPlayer.vue';

const props = defineProps<{
  emojiId: string;
  size?: number;
  /** 未加载完成或加载失败时显示的原始 emoji 兜底 */
  fallbackText?: string;
  /** 是否循环播放动态 Emoji，默认循环 */
  loop?: boolean;
}>();

const size = computed(() => props.size || 22);
const rootEl = ref<HTMLElement | null>(null);
// 创建状态但不立即拉取下载；进入视口后由 requestCustomEmoji 触发（视口懒加载）
const state = useCustomEmoji(props.emojiId, false);
const playerRef = ref<TgsPlayerInstance | null>(null);
/** WEBM/GIF 视频元素（受同一窗口/视口暂停门控） */
const videoRef = ref<HTMLVideoElement | null>(null);
/** TGS 本地文件 URL（convertFileSrc，交给 tlottie fetch） */
const tgsSrc = ref<string | null>(null);

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerAnim, registerVideo, setup: setupPause } = useLottiePause(rootEl);

/** 检测贴纸格式 */
const emojiFormat = computed(() => {
  if (!state.sticker) return 'webp';
  const fmt = state.sticker.format._;
  if (fmt === 'stickerFormatTgs') return 'tgs';
  if (fmt === 'stickerFormatWebm') return 'webm';
  return 'webp';
});

/** 用本地路径生成 asset URL，交给 tlottie 以 src 方式 fetch */
function loadTgs(rawPath: string) {
  tgsSrc.value = null;
  // 下一帧再赋值，确保 LottiePlayer 在 key 变化时干净重建
  requestAnimationFrame(() => {
    tgsSrc.value = convertFileSrc(rawPath);
  });
}

function onAnimError(e: unknown) {
  console.error('[CustomEmojiInline] TGS load error', e, tgsSrc.value);
}

/** TgsPlayer 加载完成：把实例注册进暂停/恢复控制器 */
function onAnimLoad() {
  registerAnim(playerRef.value);
}

// 当 emoji 就绪且为 tgs 格式时，加载 Lottie。
watch([() => state.ready, () => state.sticker?.sticker?.local?.path, emojiFormat],
  async ([ready, rawPath, fmt]) => {
    if (ready && rawPath && fmt === 'tgs') {
      loadTgs(rawPath);
    } else {
      tgsSrc.value = null;
      registerAnim(null);
    }
  }, { immediate: true });

// WEBM 视频：等 DOM 渲染出 <video> 后注册进窗口/视口暂停门控
watch([emojiFormat, () => state.ready], () => {
  registerVideo(emojiFormat.value === 'webm' ? videoRef.value : null);
}, { flush: 'post' });

// 视口门控：进入视口才拉取/下载自定义 emoji
const { start: startViewportLoad } = useViewportLoad(rootEl, () => {
  requestCustomEmoji(props.emojiId);
});

onMounted(() => {
  setupPause();
  startViewportLoad();
});

onUnmounted(() => {
  registerAnim(null);
});
</script>
