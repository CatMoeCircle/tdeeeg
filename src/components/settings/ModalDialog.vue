<template>
    <Teleport to="body">
        <Transition name="md-fade">
            <div v-show="modelValue" class="fixed inset-0 z-[200] flex items-center justify-center p-4"
                @mousedown.self="$emit('update:modelValue', false)">
                <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
                <div
                    class="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#1f2937] shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ title }}</h3>
                        <button type="button" aria-label="关闭"
                            class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="$emit('update:modelValue', false)">
                            <XIcon class="w-4.5 h-4.5" />
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-5">
                        <slot />
                    </div>
                    <div v-if="$slots.footer"
                        class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 shrink-0">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { XIcon } from 'lucide-vue-next';

defineProps<{
    modelValue: boolean;
    title: string;
}>();

defineEmits<{
    'update:modelValue': [value: boolean];
}>();
</script>

<style scoped>
.md-fade-enter-active,
.md-fade-leave-active {
    transition: opacity 0.15s ease;
}

.md-fade-enter-from,
.md-fade-leave-to {
    opacity: 0;
}
</style>
