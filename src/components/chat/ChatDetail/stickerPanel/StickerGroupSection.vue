<template>
    <!-- 每个贴纸集之间用一条分界线隔开 -->
    <div ref="sectionEl" class="mb-2">
        <div class="sp-set-divider border-t border-gray-200/70 dark:border-gray-700/60"></div>
        <div class="flex items-center justify-between px-1 pt-1.5 pb-1">
            <p class="sp-set-title min-w-0 truncate text-[11px] font-medium text-gray-400">{{ group.title }}</p>
            <span v-if="group.lazy" class="ml-2 shrink-0 text-[10px] text-gray-300 dark:text-gray-500">
                {{ group.size }} 个贴纸
            </span>
        </div>
        <!-- 懒加载分组：滚动进入可视区才拉取完整 set（快速跳转路过时不拉取） -->
        <div v-if="group.lazy" class="grid grid-cols-4 gap-1">
            <!-- 用 covers 占位展示（最多前几个） -->
            <StickerMediaItem v-for="s in group.stickers.slice(0, 8)" :key="s.id" :item="s" kind="sticker"
                :size="cellSize" :skin-tone="skinTone" @pick="onPick" @contextmenu="onItemContextMenu" />
            <!-- 骨架占位（不显示进度条） -->
            <div v-for="i in placeholderCount" :key="`ph-${i}`" class="sp-skeleton aspect-square rounded" />
        </div>
        <!-- 已加载：完整网格 -->
        <div v-else class="grid grid-cols-4 gap-1">
            <StickerMediaItem v-for="s in group.stickers" :key="s.id" :item="s" kind="sticker" :size="cellSize"
                :skin-tone="skinTone" @pick="onPick" @contextmenu="onItemContextMenu" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import StickerMediaItem from './StickerMediaItem.vue';
import type { StickerGroup } from './composables/useStickerPicker';
import { useLocalEmojiPrefs } from './composables/useLocalEmojiPrefs';
import { onVisibleOnce, unobserve } from './composables/useStickerVisibility';
import type { sticker, animation } from 'tdlib-types';

const props = withDefaults(defineProps<{
    group: StickerGroup;
    /** 懒加载完整 set 的回调 */
    loadSet?: (setId: string) => void;
    /** 每格正方形边长（px），由抽屉按容器宽度算出 */
    cellSize?: number;
}>(), {
    loadSet: undefined,
    cellSize: 48,
});

const emit = defineEmits<{
    (e: 'pick', s: sticker): void;
    (e: 'contextmenu', ev: MouseEvent, s: sticker): void;
}>();

const prefs = useLocalEmojiPrefs();
const skinTone = computed(() => prefs.skinTone.value);

const placeholderCount = computed(() =>
    Math.max(0, Math.min(props.group.size - props.group.stickers.length, 8))
);

/** 本分组根元素，用于可视区门控 */
const sectionEl = ref<HTMLElement | null>(null);

onMounted(() => {
    // 懒加载分组：仅当分组滚动进入（放大的）可视区才拉取完整 set。
    // 之前「创建即拉取」会在通过顶部选择器平滑跳转时，把沿途所有未加载的
    // 贴纸包一并拉取；改为进入可视区才拉取，路过即不加载。
    if (props.group.lazy && props.loadSet) {
        onVisibleOnce(sectionEl.value, () => {
            if (props.group.lazy) props.loadSet!(props.group.setId);
        });
    }
});

onBeforeUnmount(() => {
    unobserve(sectionEl.value);
});

function onPick(item: sticker | animation) {
    if (item._ !== 'sticker') return;
    emit('pick', item);
}

function onItemContextMenu(ev: MouseEvent, item: sticker | animation) {
    if (item._ !== 'sticker') return;
    emit('contextmenu', ev, item);
}
</script>

<style scoped>
/* 骨架占位：灰块 + 微光扫过（不显示进度条） */
.sp-skeleton {
    background: rgba(128, 128, 128, 0.12);
    background-image: linear-gradient(100deg,
            transparent 20%,
            rgba(255, 255, 255, 0.3) 40%,
            transparent 60%);
    background-size: 200% 100%;
    animation: sp-shimmer 1.4s infinite;
}

@keyframes sp-shimmer {
    0% {
        background-position: 200% 0;
    }

    100% {
        background-position: -200% 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .sp-skeleton {
        animation: none;
    }
}
</style>
