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
import { computed, ref, shallowRef, watch, onMounted, onUnmounted } from 'vue';
import { useCustomEmoji, requestCustomEmoji } from '../../store/customEmoji';
import { useLottiePause } from '../../composables/useLottiePause';
import { useViewportLoad } from '../../composables/useViewportLoad';
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
// 创建状态但不立即拉取下载；进入视口后由 requestCustomEmoji 触发（视口懒加载）。
// 必须随 props.emojiId 重绑：组件被 v-for(index key) 复用时 emojiId 会变，
// 只在 setup 取一次会让 state 永远指向首个 id 的缓存条目（窜图）。
const state = shallowRef(useCustomEmoji(props.emojiId, false));
const playerRef = ref<TgsPlayerInstance | null>(null);
/** WEBM/GIF 视频元素（受同一窗口/视口暂停门控） */
const videoRef = ref<HTMLVideoElement | null>(null);
/** TGS 本地文件 URL（convertFileSrc，交给 tlottie fetch） */
const tgsSrc = ref<string | null>(null);

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerAnim, registerVideo, setup: setupPause } = useLottiePause(rootEl);

/** 检测贴纸格式 */
const emojiFormat = computed(() => {
  if (!state.value.sticker) return 'webp';
  const fmt = state.value.sticker.format._;
  if (fmt === 'stickerFormatTgs') return 'tgs';
  if (fmt === 'stickerFormatWebm') return 'webm';
  return 'webp';
});

function onAnimError(e: unknown) {
  console.error('[CustomEmojiInline] TGS load error', e, tgsSrc.value);
}

/** TgsPlayer 加载完成：把实例注册进暂停/恢复控制器 */
function onAnimLoad() {
  registerAnim(playerRef.value);
}

// 当 emoji 就绪且为 tgs 格式时，加载 Lottie。
// 用 state.value.filePath（已是 convertFileSrc 后的 URL）作为 tgsSrc，
// 不依赖 sticker.local.path——下载完成后 store 不一定把它写回 sticker 对象。
watch([() => state.value.ready, () => state.value.filePath, emojiFormat],
  async ([ready, filePath, fmt]) => {
    if (ready && filePath && fmt === 'tgs') {
      // 下一帧赋值，确保 LottiePlayer 在 src 变化时干净重建
      tgsSrc.value = null;
      requestAnimationFrame(() => {
        tgsSrc.value = filePath;
      });
    } else {
      tgsSrc.value = null;
      registerAnim(null);
    }
  }, { immediate: true });

// WEBM 视频：等 DOM 渲染出 <video> 后注册进窗口/视口暂停门控
watch([emojiFormat, () => state.value.ready], () => {
  registerVideo(emojiFormat.value === 'webm' ? videoRef.value : null);
}, { flush: 'post' });

// 视口门控：进入预取带才拉取/下载自定义 emoji；本地已就绪时 requestCustomEmoji 直接跳过 downloadFile
const { start: startViewportLoad, entered } = useViewportLoad(rootEl, () => {
  requestCustomEmoji(props.emojiId);
}, { dwellMs: 200 });

// emojiId 变化（v-for index key 复用组件实例）时重绑 state，
// 否则 state 永远指向首个 id 的缓存条目 → 迷你图窜到别的位置。
watch(() => props.emojiId, (id) => {
  state.value = useCustomEmoji(id, false);
  // once 门控已触发过，不会为新 id 自动拉取，需手动补一次
  if (entered.value) requestCustomEmoji(id);
});

onMounted(() => {
  setupPause();
  startViewportLoad();
});

onUnmounted(() => {
  registerAnim(null);
});
</script>
