<template>
  <span class="relative inline-flex shrink-0" :title="label" @click.stop="pinned = !pinned"
    @mouseenter="hovering = true" @mouseleave="hovering = false">
    <span
      class="w-[18px] h-[18px] rounded-full overflow-hidden bg-white dark:bg-gray-800 ring-1 ring-gray-300/80 dark:ring-gray-500/80 flex items-center justify-center">
      <img :src="appLogo" alt="" class="w-full h-full object-cover" draggable="false" />
    </span>
    <!-- 上方常驻悬浮提示：悬停或点按出现，停留至移开/再次点按 -->
    <span v-show="hovering || pinned"
      class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 whitespace-nowrap rounded-md bg-gray-900/95 dark:bg-gray-100/95 px-2 py-1 text-[11px] font-medium leading-none text-white dark:text-gray-900 shadow-md">
      {{ label }}
      <span
        class="absolute left-1/2 -translate-x-1/2 top-full -mt-px border-4 border-transparent border-t-gray-900/95 dark:border-t-gray-100/95"></span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import appLogo from '../../assets/logo.png';
import type { ProfileRoleBadgeKind } from '../../utils/profileBadges';

const props = defineProps<{ kind: ProfileRoleBadgeKind }>();

const { t } = useI18n();
const label = computed(() => t(`profileBadges.${props.kind}`));
const hovering = ref(false);
const pinned = ref(false);
</script>
