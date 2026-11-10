<template>
    <div class="flex items-center justify-between gap-3 px-3 py-2.5"
        :class="disabled ? 'opacity-50' : ''">
        <div class="min-w-0">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ label }}</p>
            <p v-if="hint" class="mt-0.5 text-xs text-gray-400">{{ hint }}</p>
        </div>
        <button type="button" role="switch" :aria-checked="modelValue" :disabled="disabled"
            class="relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed"
            :class="modelValue ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'"
            @click="!disabled && emit('update:modelValue', !modelValue)">
            <span
                class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                :class="modelValue ? 'translate-x-4' : 'translate-x-0'" />
        </button>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    label: string;
    modelValue: boolean;
    disabled?: boolean;
    hint?: string;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
}>();
</script>
