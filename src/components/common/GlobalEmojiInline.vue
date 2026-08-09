<template>
  <!-- 有对应 Apple 图片则渲染 <img>；否则回退显示原始 emoji 字符 -->
  <span v-if="src" class="gemoji" :style="sizeStyle">
    <img :src="src" :alt="emoji" draggable="false" loading="lazy" decoding="async" />
  </span>
  <span v-else class="gemoji-text" :style="textStyle">{{ emoji }}</span>
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

/**
 * 内部 <img> 用 width:1em，因此想让 size 真正生效必须同时给容器设 font-size=size，
 * 否则 img 永远约等于继承字号（~14px），显示不跟随 size。
 */
const sizeStyle = computed(() =>
  props.size
    ? {
      width: `${props.size}px`,
      height: `${props.size}px`,
      fontSize: `${props.size}px`,
    }
    : undefined
);

/** 回退纯文本：同样用 font-size 控制 emoji 字符大小 */
const textStyle = computed(() =>
  props.size
    ? { fontSize: `${props.size}px`, lineHeight: '1', display: 'inline-block' }
    : undefined
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

/* 回退纯文本：字符基线对齐，行高与图片版一致 */
.gemoji-text {
  vertical-align: middle;
}
</style>
