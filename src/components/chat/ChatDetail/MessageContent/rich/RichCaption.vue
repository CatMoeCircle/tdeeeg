<template>
    <figcaption class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        <RichText :text="caption.text" />
        <span v-if="caption.credit" class="block mt-0.5 opacity-80">
            <RichText :text="caption.credit" />
        </span>
    </figcaption>
</template>

<script setup lang="ts">
import type { pageBlockCaption } from 'tdlib-types';
import RichText from './RichText.vue';

defineProps<{
    caption: pageBlockCaption;
}>();
</script>
