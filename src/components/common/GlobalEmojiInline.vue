<template>
  <!-- 使用 Apple Color Emoji 字体渲染 emoji -->
  <span class="apple-emoji" :style="sizeStyle">{{ emoji }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  /** 单个已知为 emoji 的字符串 */
  emoji: string;
  /** 可选：显式尺寸（px）；缺省时跟随字号(1em) */
  size?: number;
}>();

/** font-size 控制 emoji 字体渲染大小 */
const sizeStyle = computed(() =>
  props.size
    ? { fontSize: `${props.size}px`, lineHeight: '1', display: 'inline-block' }
    : undefined
);
</script>

<style scoped>
/* Apple Color Emoji 字体渲染 */
.apple-emoji {
  font-family: "Apple Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
  font-style: normal;
  font-weight: normal;
  line-height: 1;
  vertical-align: -0.2em;
  display: inline-block;
}
</style>
