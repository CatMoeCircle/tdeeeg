<template>
    <div
        class="absolute left-3 right-3 bottom-3 z-20 flex items-center gap-2 px-3 h-13 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <button type="button" :aria-label="t('chat.exitSelection')"
            class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" @click="emit('close')">
            <XIcon class="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
            {{ t('lng_media_selected_message', { count }) }}
            <span class="text-xs font-normal text-gray-500 dark:text-gray-400">/ {{ max }}</span>
        </span>
        <button type="button" :aria-label="t('lng_context_forward_selected')" :title="t('lng_mediaview_forward')"
            class="p-2 rounded-full enabled:hover:bg-gray-100 dark:enabled:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40"
            :disabled="count === 0" @click="emit('forward')">
            <ShareIcon class="w-5 h-5" />
        </button>
        <button type="button" :aria-label="t('lng_context_delete_selected')" :title="t('lng_selected_delete')"
            class="p-2 rounded-full enabled:hover:bg-red-50 dark:enabled:hover:bg-red-900/30 text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!canDelete" @click="emit('delete')">
            <TrashIcon class="w-5 h-5" />
        </button>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { X as XIcon, Share as ShareIcon, Trash as TrashIcon } from 'lucide-vue-next';

/** 多选操作栏：多选模式时叠在输入框上方。 */
defineProps<{ count: number; max: number; canDelete: boolean }>();
const emit = defineEmits<{ close: []; forward: []; delete: [] }>();
const { t } = useI18n();
</script>
