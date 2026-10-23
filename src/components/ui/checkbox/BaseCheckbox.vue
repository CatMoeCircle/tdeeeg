<template>
    <button type="button" role="checkbox" :aria-checked="modelValue" :disabled="disabled"
        class="w-4 h-4 shrink-0 rounded-[5px] border-2 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :class="modelValue
            ? 'bg-blue-500 border-blue-500 text-white'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'"
        @click.stop="modelValue = !modelValue">
        <CheckIcon v-if="modelValue" class="w-3 h-3" :stroke-width="3" />
    </button>
</template>

<script setup lang="ts">
/**
 * 通用复选框。用 button 而不是 input[type=checkbox]：
 * 原生勾选框跨平台样式不一致，且点击会冒泡到整行（行本身也有点击行为）。
 * 需要“点整行也能勾选”时，把行自己的 @click 绑上即可，本组件已 .stop。
 */
import { CheckIcon } from 'lucide-vue-next';

const modelValue = defineModel<boolean>({ default: false });

defineProps<{
    disabled?: boolean;
}>();
</script>
