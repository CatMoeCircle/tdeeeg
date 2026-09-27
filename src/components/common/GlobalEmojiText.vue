<template>
  <span :style="sizeStyle">{{ displayText }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  /**
   * 需要渲染的文本（含 emoji，由全局 Apple Color Emoji 字体渲染）。
   * 允许 String-like 对象（如 DELETED_ACCOUNT_LABEL 惰性 i18n 句柄）。
   */
  text: string | number | { toString(): string };
  /** 可选：显式尺寸(px)；缺省跟随字号 */
  size?: number;
}>();

const displayText = computed(() => String(props.text ?? ""));

const sizeStyle = computed(() =>
  props.size
    ? { fontSize: `${props.size}px`, lineHeight: "1" }
    : undefined
);
</script>
