<template>
    <div class="flex items-center justify-between py-1.5">
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ label }}</span>
        <ToggleSwitch :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)" />
    </div>
</template>

<script setup lang="ts">
import ToggleSwitch from './ToggleSwitch.vue';

defineProps<{
    label: string;
    modelValue: boolean;
}>();
defineEmits<{
    'update:modelValue': [value: boolean];
}>();
</script>
