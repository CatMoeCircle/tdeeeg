<template>
  <!-- 有对应 Apple 图片则渲染 <img>；否则回退显示原始 emoji 字符 -->
  <span v-if="src" class="gemoji" :style="sizeStyle">
    <img :src="src" :alt="emoji" draggable="false" loading="lazy" decoding="async" />
  </span>
  <template v-else>{{ emoji }}</template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { emojiImageSrc } from "../../utils/emoji";

const props = defineProps<{
  /** 单个已知为 emoji 的字符串 */
  emoji: string;
  /** 可选：显式尺寸（px）；缺省时跟随字号(1em) */
  size?: number;
}>();

const src = computed(() => emojiImageSrc(props.emoji));

const sizeStyle = computed(() =>
  props.size ? { width: `${props.size}px`, height: `${props.size}px` } : undefined
);
</script>

<style scoped>
/* 参照 Telegram / Twemoji 的 emoji 图片内联样式 */
.gemoji {
  display: inline-block;
  vertical-align: -0.1em;
  line-height: 0;
}
.gemoji img {
  display: inline-block;
  width: 1em;
  height: 1em;
  margin: 0 0.05em;
  vertical-align: -0.1em;
  object-fit: contain;
}
</style>
