<template>
    <div class="my-1.5 overflow-hidden rounded-lg bg-black/[0.04] dark:bg-white/[0.08]" role="link" tabindex="0"
        @click="emit('open', preview.url)" @keydown.enter.prevent="emit('open', preview.url)"
        @keydown.space.prevent="emit('open', preview.url)">
        <div class="flex gap-2 px-2.5 pt-2.5 pb-2">
            <div class="w-0.5 shrink-0 rounded-full bg-blue-500" :style="accentBarStyle"></div>

            <div class="min-w-0 flex-1">
                <div v-if="preview.site_name" class="truncate text-xs font-semibold text-blue-500 dark:text-blue-400"
                    :style="accentTextStyle">
                    {{ preview.site_name }}
                </div>
                <div v-if="preview.title" class="mt-0.5 text-sm font-semibold leading-5">
                    {{ preview.title }}
                </div>
                <div v-if="preview.author" class="mt-0.5 truncate text-xs opacity-65">
                    {{ preview.author }}
                </div>
                <div v-if="preview.description?.text" class="preview-description mt-1.5 whitespace-pre-wrap text-sm leading-5">
                    <FormattedTextInline :formattedText="preview.description" :size="18" />
                </div>
            </div>
        </div>

        <button type="button"
            class="block w-[calc(100%-1.25rem)] mx-2.5 border-t border-black/10 py-2 text-center text-sm font-medium text-blue-500 transition-colors hover:text-blue-600 dark:border-white/10 dark:text-blue-400 dark:hover:text-blue-300"
            :style="accentTextStyle" @click.stop="emit('open', preview.url)">
            查看
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { linkPreview } from 'tdlib-types';
import FormattedTextInline from '../../FormattedTextInline.vue';
import { useColors } from '../../../../store/colors';

const props = defineProps<{
    preview: linkPreview;
    accentColorId?: number;
}>();

const emit = defineEmits<{
    open: [url: string];
}>();

const { accentColorStyle } = useColors();
const accent = computed(() => typeof props.accentColorId === 'number'
    ? accentColorStyle(props.accentColorId)
    : undefined);
const accentBarStyle = computed(() => accent.value ? { backgroundColor: accent.value.color } : undefined);
const accentTextStyle = computed(() => accent.value ? { color: accent.value.text } : undefined);
</script>

<style scoped>
.preview-description {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 8;
}
</style>
