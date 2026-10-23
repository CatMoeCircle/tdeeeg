<template>
    <input :value="modelValue" v-bind="$attrs" :class="INPUT_CLASS" @input="onInput" />
</template>

<script setup lang="ts">
/**
 * 通用文本输入框（设置页 / 登录页那一套：半透明底 + 聚焦蓝边）。
 *
 * 支持 v-model，也保留 v-model.trim（传进 modelModifiers 后自己剪），
 * 其余属性（type / placeholder / spellcheck / class）原样落到 input 上。
 */
const props = withDefaults(
    defineProps<{
        modelValue?: string | number;
        /** v-model.trim 的修饰符，组件需要自己处理 */
        modelModifiers?: Record<string, boolean>;
    }>(),
    { modelValue: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>();

const INPUT_CLASS =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm ' +
    'text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none';

function onInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    emit('update:modelValue', props.modelModifiers?.trim ? raw.trim() : raw);
}
</script>
