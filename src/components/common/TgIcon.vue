<template>
    <!-- Telegram 风格图标：
         - 彩色图标（Gram 蓝 / Stars 金 / Premium）原样呈现，自带配色；
         - 单色图标（boost / diamond / coin / gift / gram / star 等）在深色主题下反色，
           保证浅色背景黑、深色背景白，都清晰可见。 -->
    <img :src="resolved" :width="size" :height="size" :alt="alt" :class="iconClass"
        class="inline-block shrink-0 select-none" draggable="false" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { TELEGRAM_ICONS, TELEGRAM_MONO_ICONS, type TelegramIconName } from '../../utils/ui/telegramIcons';

const props = withDefaults(
    defineProps<{ name: TelegramIconName; size?: number | string; alt?: string }>(),
    { size: 20, alt: '' },
);

const resolved = computed(() => TELEGRAM_ICONS[props.name]);
const isMono = computed(() => TELEGRAM_MONO_ICONS.has(props.name));
/** 单色图标：稍降不透明度贴近灰阶图标，并在深色主题反色 */
const iconClass = computed(() => (isMono.value ? 'opacity-70 dark:opacity-80 dark:invert' : ''));
</script>
