<template>
    <button
        class="absolute right-4 z-20 w-10 h-10 bg-white dark:bg-gray-700 rounded-full shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
        :style="{ bottom }" @click="emit('click')" :title="t('chat.scrollToBottom')">
        <span v-if="count > 0"
            class="absolute -top-1 -right-1 min-w-4.5 h-4.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
            <template v-if="count > 99">99+</template>
            <template v-else>
                <Counter :value="count" :places="places" :font-size="10" :padding="2" :gap="0"
                    :border-radius="0" :horizontal-padding="0" text-color="#ffffff" :font-weight="700"
                    :gradient-height="0" aria-hidden="true" />
                <!-- 计数器每列叠放 0-9 供视觉滚动，读屏只读这一份真实数字 -->
                <span class="sr-only">{{ count }}</span>
            </template>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
            <path fill-rule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clip-rule="evenodd" />
        </svg>
    </button>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Counter from '../../ui/counter/Counter.vue';

/** 回到最底部按钮：贴在输入区上方，带未读新消息徽标。 */
defineProps<{ bottom: string; count: number; places: (number | '.')[] }>();
const emit = defineEmits<{ click: [] }>();
const { t } = useI18n();
</script>
