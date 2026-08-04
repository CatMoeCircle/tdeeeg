<template>
  <div
    class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    :class="{ 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800': clickable }"
    @click="emit('click')">
    <span class="text-sm text-gray-500 dark:text-gray-400 w-16 shrink-0">{{ label }}</span>
    <span class="text-sm flex-1 min-w-0 truncate text-gray-900 dark:text-gray-100 select-all">{{ value }}</span>
    <button v-if="copyable" type="button"
      class="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      @click.stop="emit('copy')">
      <Copy class="w-4 h-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Copy } from "lucide-vue-next";

defineProps<{
  label: string;
  value: string;
  copyable?: boolean;
  clickable?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "copy"): void;
}>();
</script>
