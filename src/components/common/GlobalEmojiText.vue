<template>
  <span :style="sizeStyle">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  /** 需要渲染的文本（含 emoji，由全局 Apple Color Emoji 字体渲染） */
  text: string;
  /** 可选：显式尺寸(px)；缺省跟随字号 */
  size?: number;
}>();

const sizeStyle = computed(() =>
  props.size
    ? { fontSize: `${props.size}px`, lineHeight: "1" }
    : undefined
);
</script>
