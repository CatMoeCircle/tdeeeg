<template>
  <span
    ref="el"
    class="copyable-text"
    :class="disabled ? '' : 'cursor-pointer transition-colors duration-150 hover:text-blue-500 dark:hover:text-blue-400'"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-label="disabled ? undefined : t('lng_bot_copy_text_tooltip', { text: displayText })"
    @click="handleCopy"
    @keydown.enter.prevent="handleCopy"
    @keydown.space.prevent="handleCopy"
  >
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';

/**
 * 可复制文本：默认正常颜色（黑色），悬停变蓝，点击复制内容。
 */
const props = withDefaults(
  defineProps<{
    /** 要展示的内容；不传时展示插槽文本 */
    text?: string;
    /** 实际复制的内容；省略时与 text 相同（用于展示不含 @、复制需带 @ 等） */
    copyAs?: string;
    /** 是否禁用复制 */
    disabled?: boolean;
  }>(),
  {
    text: '',
    copyAs: undefined,
    disabled: false,
  },
);

const el = ref<HTMLElement | null>(null);
const { t } = useI18n();

/** 展示/用于提示的文本（text 属性优先） */
const displayText = computed(() => props.text.trim());

/** 实际复制的内容：copyAs > text > 插槽文本 */
function resolveCopyValue(): string {
  return props.copyAs?.trim() || props.text.trim() || el.value?.textContent?.trim() || '';
}

async function handleCopy(e?: Event) {
  if (props.disabled) return;
  // 阻止冒泡，避免嵌套可复制文本时触发外层重复复制
  e?.stopPropagation();
  const value = resolveCopyValue();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    await MessagePlugin.success({ content: t('lng_text_copied'), placement: 'top-right' });
  } catch (e) {
    console.error('复制失败:', e);
    MessagePlugin.error({ content: t('dev.copyFailed'), placement: 'top-right' });
  }
}
</script>
