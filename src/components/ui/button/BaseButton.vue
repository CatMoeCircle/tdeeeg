<template>
    <button :type="type" :disabled="disabled" :class="buttonClass">
        <slot />
    </button>
</template>

<script setup lang="ts">
/**
 * 通用按钮。只收两档变体 + 两档尺寸，样式差异请用 class 传入（Vue 会把 class 合并上来）。
 *
 * - primary：主操作（蓝底白字，带 font-medium）
 * - ghost：次要 / 取消（灰字，悬停浅底）
 *
 * 类名与拆分前手写的一致，所以替换后外观不变。
 */
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        variant?: 'primary' | 'ghost';
        /** sm 用于对话框底部，md 用于页面主体 */
        size?: 'sm' | 'md';
        type?: 'button' | 'submit';
        disabled?: boolean;
    }>(),
    { variant: 'primary', size: 'md', type: 'button', disabled: false },
);

const VARIANTS = {
    primary: 'bg-blue-500 text-white font-medium hover:bg-blue-600',
    ghost: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
} as const;

const SIZES = {
    sm: 'px-4 py-1.5',
    md: 'px-4 py-2',
} as const;

const buttonClass = computed(
    () => `${VARIANTS[props.variant]} ${SIZES[props.size]} rounded-lg text-sm transition-colors disabled:opacity-50`,
);
</script>
