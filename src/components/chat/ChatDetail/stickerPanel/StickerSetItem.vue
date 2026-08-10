<template>
  <div>
    <!-- 懒加载分组头：滚动到可视区才拉取完整 set -->
    <div ref="setRef" class="sp-set-header flex items-center justify-between px-1 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" @click="load">
      <span class="text-[11px] font-medium text-gray-500 truncate">{{ set.title }}</span>
      <span class="text-[10px] text-gray-400 shrink-0 ml-2">{{ loadedCount || set.size }}</span>
    </div>
    <div class="grid grid-cols-4 gap-0.5">
      <StickerMediaItem
        v-for="s in stickers"
        :key="s.id"
        :item="s"
        kind="sticker"
        :size="52"
        :skin-tone="skinTone"
        @pick="onPick"
      />
      <!-- 未加载时显示骨架占位 -->
      <template v-if="!loadedCount">
        <div v-for="i in Math.min(set.size, 8)" :key="i" class="sp-skeleton aspect-square rounded" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { sticker, animation, stickerSetInfo } from 'tdlib-types';
import StickerMediaItem from './StickerMediaItem.vue';

const props = defineProps<{
  set: stickerSetInfo;
  /** 按需加载完整 set（返回 stickers） */
  loader: (setId: string) => Promise<sticker[]>;
  /** 读取已加载 stickers */
  getStickers: (setId: string) => sticker[] | undefined;
  skinTone?: number;
}>();

const emit = defineEmits<{ (e: 'pick', s: sticker): void }>();

const stickers = computed<sticker[]>(() => props.getStickers(props.set.id) ?? []);
const loadedCount = computed(() => stickers.value.length);
const loading = ref(false);

onMounted(() => {
  // 首个加载（若上层未主动拉）
  if (stickers.value.length === 0) load();
});

async function load() {
  if (loading.value || stickers.value.length > 0) return;
  loading.value = true;
  try {
    await props.loader(props.set.id);
  } finally {
    loading.value = false;
  }
}

function onPick(item: sticker | animation) {
  if (item._ !== 'sticker') return;
  emit('pick', item);
}
</script>

<style scoped>
/* 骨架占位（纯色，无动画） */
.sp-skeleton {
  background: rgba(128, 128, 128, 0.12);
}
</style>
