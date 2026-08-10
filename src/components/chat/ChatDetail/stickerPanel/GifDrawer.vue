<template>
    <div class="sp-gif-drawer flex h-full flex-col">
        <!-- 搜索框 -->
        <div class="sp-search px-3 pt-2 pb-1">
            <div class="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/10 px-3 py-1.5">
                <SearchIcon class="w-4 h-4 text-gray-400 shrink-0" />
                <input v-model="query" type="text" placeholder="搜索 GIF"
                    class="flex-1 bg-transparent outline-none text-sm py-0.5 placeholder-gray-400" />
                <button v-if="query" class="text-gray-400 hover:text-gray-600" @click="query = ''">
                    <XIcon class="w-4 h-4" />
                </button>
            </div>
        </div>

        <div ref="scrollEl" class="sp-gif-scroll custom-scrollbar flex-1 overflow-y-auto px-2 pb-2" @scroll="onScroll">
            <div v-if="results.length === 0 && searching" class="flex gap-1 justify-center py-8">
                <div class="sp-skeleton w-20 h-20 rounded-lg"></div>
                <div class="sp-skeleton w-20 h-20 rounded-lg"></div>
                <div class="sp-skeleton w-20 h-20 rounded-lg"></div>
            </div>
            <div v-else class="grid grid-cols-2 gap-1">
                <div v-for="r in results" :key="r.resultId"
                    class="relative aspect-square rounded-lg overflow-hidden cursor-pointer group" @click="onPick(r)"
                    @contextmenu.prevent="toggleSavedResult(r)">
                    <StickerMediaItem :item="r.animation" kind="animation" :size="gifCellSize" />
                    <!-- 已保存标记 -->
                    <span v-if="isSavedResult(r)"
                        class="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-black/50 text-white"
                        title="已收藏">
                        <span class="text-[9px]">★</span>
                    </span>
                </div>
            </div>
            <div v-if="hasMore" class="text-center py-3 text-xs text-gray-400">滚动加载更多…</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { SearchIcon, XIcon } from 'lucide-vue-next';
import StickerMediaItem from './StickerMediaItem.vue';
import { useGifPicker, type GifResult } from './composables/useGifPicker';
import { stickerPanelState } from './types';

const emit = defineEmits<{ (e: 'pickAnimation', fileId: number, stickerId: string): void }>();

const gifs = useGifPicker({
    chatId: () => stickerPanelState.value.chat?.id,
    onUpdateSavedAnimations: (_cb) => {
        // 简化：此处不接入全局事件总线；后续可对接 updateSavedAnimations
        return () => { };
    },
});

const query = computed({
    get: () => gifs.query.value,
    set: (v: string) => { gifs.query.value = v; },
});

/** 顶层解包（模板自动解包 ref） */
const results = gifs.results;
const searching = gifs.searching;
const hasMore = gifs.hasMore;

function isSavedResult(r: GifResult): boolean {
    return gifs.isSaved(r);
}
function toggleSavedResult(r: GifResult) {
    void gifs.toggleSaved(r);
}
function loadMoreGifs() {
    gifs.loadMore();
}

const scrollEl = ref<HTMLElement | null>(null);
/** 每格显示尺寸（两列正方形格子，由滚动容器宽度反推） */
const gifCellSize = ref(120);

onMounted(() => {
    gifs.activate();
    measureCellSize();
});

/** GIF 每格正方形边长：滚动容器内边距 px-2(左右各 8px) + grid-cols-2 gap-1(4px) */
function measureCellSize() {
    const el = scrollEl.value;
    if (!el) return;
    const style = getComputedStyle(el);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const contentW = el.clientWidth - padL - padR;
    gifCellSize.value = Math.max(24, Math.floor((contentW - 4) / 2));
}

onBeforeUnmount(() => {
    gifs.deactivate();
});

function onScroll() {
    const el = scrollEl.value;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
        loadMoreGifs();
    }
}

function onPick(r: GifResult) {
    const anim = r.animation;
    emit('pickAnimation', anim.animation.id, String(anim.animation.id));
}

defineExpose({ activate: () => gifs.activate(), deactivate: () => gifs.deactivate() });
</script>

<style scoped>
.sp-gif-scroll {
    overscroll-behavior: contain;
}

/* 骨架屏（加载中，纯色占位，无动画） */
.sp-skeleton {
    background: rgba(128, 128, 128, 0.12);
}
</style>
