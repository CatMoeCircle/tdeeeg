<template>
    <label class="relative inline-flex items-center" :class="disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'">
        <input type="checkbox" class="sr-only peer" :checked="modelValue" :disabled="disabled"
            @change="$emit('update:modelValue', !modelValue)" />
        <div
            class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500">
        </div>
    </label>
</template>

<script setup lang="ts">
defineProps<{
    modelValue: boolean;
    disabled?: boolean;
}>();
defineEmits<{
    'update:modelValue': [value: boolean];
}>();
</script>
