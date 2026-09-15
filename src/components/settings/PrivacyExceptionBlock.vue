<template>
    <div>
        <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{{ title }}</p>
        <div class="flex items-center gap-2 mb-3">
            <input :value="modelValue" type="text" placeholder="@username or user_id" spellcheck="false"
                class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
                @keydown.enter="emit('add')" />
            <button type="button" @click="emit('add')" :disabled="adding"
                class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
                {{ t('lng_edit_privacy_exceptions_add') }}
            </button>
        </div>
        <p v-if="error" class="text-xs text-red-500 mb-2">{{ error }}</p>
        <div v-if="list.length === 0" class="text-sm text-gray-400 py-2 text-center">{{ emptyText }}</div>
        <div v-else class="space-y-1.5">
            <div v-for="e in list" :key="(e.isChat ? 'c' : 'u') + e.id"
                class="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                <div class="w-8 h-8 shrink-0">
                    <Avatar :photo="e.photo" :title="e.title" :accentColorId="e.accentId" sizeClass="!w-8 !h-8" />
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ e.title }}</div>
                    <div v-if="e.subtitle" class="text-xs text-gray-400 truncate">{{ e.subtitle }}</div>
                </div>
                <button type="button" @click="emit('remove', e)"
                    class="text-xs text-red-500 hover:text-red-600 shrink-0">{{ t('lng_box_remove') }}</button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
export interface ExceptionEntry {
    id: number;
    isChat: boolean;
    title: string;
    /** 用户：最后上线时间；群组/频道：成员/订阅者数量 */
    subtitle?: string;
    photo?: any;
    accentId?: number;
}
</script>

<script setup lang="ts">
import Avatar from '../chat/avatar.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
defineProps<{
    title: string;
    emptyText: string;
    modelValue: string;
    list: ExceptionEntry[];
    error?: string;
    adding?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'add'): void;
    (e: 'remove', entry: ExceptionEntry): void;
}>();
</script>
