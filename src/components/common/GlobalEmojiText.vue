<template>
  <template v-for="(token, i) in tokens" :key="i">
    <GlobalEmojiInline v-if="token.isEmoji" :emoji="token.text" :size="size" />
    <template v-else>{{ token.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { splitTextByEmoji } from "../../utils/emoji";
import GlobalEmojiInline from "./GlobalEmojiInline.vue";

const props = defineProps<{
  /** 需要渲染的文本（可含 emoji，会被替换成 Apple 风格图片） */
  text: string;
  /** 可选：emoji 显式尺寸(px)；缺省跟随字号 */
  size?: number;
}>();

const tokens = computed(() => splitTextByEmoji(props.text ?? ""));
</script>
