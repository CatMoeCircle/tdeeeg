<template>
    <div class="flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div class="px-3 pt-2 pb-2">
            <div class="flex items-center justify-between">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {{ t('lng_filters_icon_header') }}
                </p>
                <button type="button" class="px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors"
                    :class="!iconName ? 'bg-blue-500/15 text-blue-500' : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/10'"
                    @click="emit('pick-icon', '')">
                    {{ t('lng_settings_angle_backend_auto') }}
                </button>
            </div>
            <div class="mt-2 grid grid-cols-8 gap-1.5">
                <button v-for="name in FOLDER_ICON_NAMES" :key="name" type="button"
                    class="aspect-square rounded-lg flex items-center justify-center border transition-colors"
                    :class="iconName === name ? activeTileClass : idleTileClass" :title="name"
                    @click="emit('pick-icon', name)">
                    <component :is="folderIconFor(name)" class="w-4 h-4" :stroke-width="1.5" />
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/** 分组图标选择器：只有 TDLib 的 chatFolderIcon 固定图标网格（不支持 emoji） */
import { useI18n } from 'vue-i18n';
import { FOLDER_ICON_NAMES, folderIconFor } from '../../utils/folderIcons';

defineProps<{
    iconName: string;
}>();
const emit = defineEmits<{
    /** 选 TDLib 图标名；空串 = 自动 */
    'pick-icon': [name: string];
}>();

const { t } = useI18n();

const activeTileClass = 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400';
const idleTileClass = 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800';
</script>
