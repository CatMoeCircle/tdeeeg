<template>
  <span ref="rootEl" class="inline-flex items-center align-middle mx-0.5 overflow-hidden"
    :style="{ width: size + 'px', height: size + 'px' }">
    <!-- 已下载完成：根据格式渲染 -->
    <template v-if="state.ready && state.filePath && state.sticker">
      <!-- WEBP static -->
      <img v-if="emojiFormat === 'webp'" :src="state.filePath" class="w-full h-full object-contain" />
      <!-- TGS animated (Lottie) -->
      <RlottiePlayer v-else-if="emojiFormat === 'tgs' && tgsData" ref="playerRef" :src="tgsData" :loop="true"
        :autoplay="true" :width="emojiRenderSize" :height="emojiRenderSize" :class="emojiHiResClass"
        :style="emojiHiResStyle" @load="onAnimLoad" />
      <!-- WEBM video -->
      <video v-else-if="emojiFormat === 'webm'" ref="videoRef" :src="state.filePath" autoplay loop muted playsinline
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
import { useRlottieRenderSize } from '../../composables/useRlottieRenderSize';
import { readFile } from '@tauri-apps/plugin-fs';
import { RlottiePlayer, type RlottiePlayerInstance } from 'rlottie-wasm-vue-player';
import * as pako from 'pako';

const props = defineProps<{
  emojiId: string;
  size?: number;
  /** 未加载完成或加载失败时显示的原始 emoji 兜底 */
  fallbackText?: string;
}>();

const size = computed(() => props.size || 22);
/**
 * 自定义 emoji（消息文本内联 / 聊天列表 / 对话文件夹等）→ 极低质量渲染。
 * 用默认超采样倍率 1：此类 emoji 出现数量极大，务必保证显示速率一致、不掉帧。
 */
const { renderSize: emojiRenderSize, hiResStyle: emojiHiResStyle, hiResClass: emojiHiResClass } = useRlottieRenderSize(size);
const rootEl = ref<HTMLElement | null>(null);
// 创建状态但不立即拉取下载；进入视口后由 requestCustomEmoji 触发（视口懒加载）
const state = useCustomEmoji(props.emojiId, false);
const playerRef = ref<RlottiePlayerInstance | null>(null);
/** WEBM/GIF 视频元素（受同一窗口/视口暂停门控） */
const videoRef = ref<HTMLVideoElement | null>(null);
/** 解析后的 TGS Lottie JSON（字符串形式，作为 RlottiePlayer 的 src） */
const tgsData = ref<string | null>(null);

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

/** 加载 TGS（gzipped Lottie JSON）并交给 RlottiePlayer 播放 */
async function loadTgs(rawPath: string) {
  try {
    // 清空旧数据使 RlottiePlayer 卸载重建，避免残留上一份动画
    tgsData.value = null;
    // 通过 fs 插件直接读取文件原始字节。
    // 不用 fetch(convertFileSrc(...))——生产构建 CSP 默认不放开 connect-src 到 asset
    // 协议，fetch 会被拦截（403），改用 readFile 读取原始字节更可靠。
    const compressed = await readFile(rawPath);
    let jsonStr: string;
    try {
      const decompressed = pako.inflate(compressed);
      jsonStr = new TextDecoder('utf-8').decode(decompressed);
    } catch {
      jsonStr = new TextDecoder('utf-8').decode(compressed);
    }
    const animData = JSON.parse(jsonStr);
    // RlottiePlayer 的 src 接受 stringified JSON
    tgsData.value = JSON.stringify(animData);
  } catch (e) {
    console.error('Failed to load TGS custom emoji:', e);
  }
}

/** RlottiePlayer 加载完成回调：把实例注册进暂停/恢复控制器 */
function onAnimLoad() {
  registerAnim(playerRef.value);
}

// 当 emoji 就绪且为 tgs 格式时，加载 Lottie。
// TGS 用 fs 插件读原始字节，因此这里取原始本地路径（state.sticker.sticker.local.path），
// 而不是已 convertFileSrc 的 filePath（那是给 <img>/<video> 的 asset URL）。
watch([() => state.ready, () => state.sticker?.sticker?.local?.path, emojiFormat],
  async ([ready, rawPath, fmt]) => {
    if (ready && rawPath && fmt === 'tgs') {
      await loadTgs(rawPath);
    } else {
      // 格式变化为非 TGS 时确保不再渲染过期动画
      tgsData.value = null;
      registerAnim(null);
    }
  }, { immediate: true });

// WEBM 视频：等 DOM 渲染出 <video> 后注册进窗口/视口暂停门控
watch([emojiFormat, () => state.ready], () => {
  registerVideo(emojiFormat.value === 'webm' ? videoRef.value : null);
}, { flush: 'post' });

// 视口门控：进入视口才拉取/下载自定义 emoji；未进入显示 fallback 文本或骨架。
const { start: startViewportLoad } = useViewportLoad(rootEl, () => {
  requestCustomEmoji(props.emojiId);
});

// 挂载后初始化暂停控制器（视口观察 + 窗口聚焦 + 平滑滚动监听）
onMounted(() => {
  setupPause();
  startViewportLoad();
});

onUnmounted(() => {
  registerAnim(null);
});
</script>
