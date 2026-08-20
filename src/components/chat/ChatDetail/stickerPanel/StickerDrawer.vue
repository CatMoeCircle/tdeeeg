<template>
    <div class="sp-sticker-drawer flex h-full flex-col">
        <!-- 搜索框 -->
        <div class="sp-search px-3 pt-2 pb-1">
            <div class="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/10 px-3 py-1.5">
                <SearchIcon class="w-4 h-4 text-gray-400 shrink-0" />
                <input v-model="query" type="text" placeholder="搜索贴纸"
                    class="flex-1 bg-transparent outline-none text-sm py-0.5 placeholder-gray-400" />
                <button v-if="query" class="text-gray-400 hover:text-gray-600" @click="query = ''">
                    <XIcon class="w-4 h-4" />
                </button>
            </div>
        </div>

        <!-- 顶部：贴纸集选择器（支持滚轮横向滚动） -->
        <div v-if="!hasQuery" ref="stickerCatsEl"
            class="sp-sticker-cats flex items-center gap-1 overflow-x-auto px-3 py-1 border-b border-black/5 dark:border-white/10 no-scrollbar"
            @wheel.prevent="onStickerCatsWheel">
            <button v-for="(g, gi) in allGroupsList()" :key="g.key" type="button"
                class="sp-cat-pill shrink-0 max-w-36 truncate px-2.5 py-1 rounded-lg text-xs transition-colors"
                :class="activeSetKey === g.key ? 'bg-blue-500/15 text-blue-500' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/5'"
                :title="g.title" @click="scrollToSet(g, gi)">
                {{ g.title }}
            </button>
        </div>

        <div ref="scrollEl" class="sp-sticker-scroll custom-scrollbar flex-1 overflow-y-auto px-2 pb-2"
            @scroll="onScroll">
            <!-- 搜索模式 -->
            <template v-if="hasQuery">
                <div v-if="searching" class="text-center py-8">
                    <div class="sp-skeleton inline-block w-40 h-4 rounded"></div>
                </div>
                <div v-else>
                    <template v-for="g in searchGroups" :key="g.key">
                        <StickerGroupSection :group="g" :load-set="loadSetFn" :cell-size="cellSize" @pick="onPick"
                            @contextmenu="onStickerContextMenu" />
                    </template>
                    <div v-if="searchGroups.length === 0" class="text-center text-sm text-gray-400 py-8">无匹配贴纸</div>
                </div>
            </template>

            <!-- 浏览模式 -->
            <template v-else>
                <div v-if="loading" class="text-center py-8">
                    <div class="sp-skeleton inline-block w-40 h-4 rounded"></div>
                </div>
                <p v-else-if="allGroupsList().length === 0" class="text-center text-sm text-gray-400 py-8">
                    还没有贴纸，去表情包商店添加吧</p>
                <template v-for="g in allGroupsList()" :key="g.key">
                    <StickerGroupSection :group="g" :load-set="loadSetFn" :cell-size="cellSize" @pick="onPick"
                        :data-set-key="g.key" @contextmenu="onStickerContextMenu" />
                </template>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { SearchIcon, XIcon, Star, Trash2 } from 'lucide-vue-next';
import StickerGroupSection from './StickerGroupSection.vue';
import { useStickerPicker } from './composables/useStickerPicker';
import { setProgrammaticScroll, beginUserScroll, endUserScroll } from './composables/useStickerVisibility';
import { openContextMenu } from '../../../../store/contextMenu';
import type { ContextMenuItem } from '../../../../components/contextMenu/types';
import type { sticker } from 'tdlib-types';
import type { StickerGroup } from './composables/useStickerPicker';

const emit = defineEmits<{ (e: 'pickSticker', stickerId: string): void }>();

/** 贴纸区滚动位置记忆：记录上次浏览位置，重新打开时恢复（模块级，跨会话面板挂载保留） */
let savedScrollTop = 0;

const sticker = useStickerPicker({
    groupSetId: () => '0', // 由 ChatDetail 注入 supergroupFullInfo.sticker_set_id
    onStickerUpdates: () => () => { },
});

const query = computed({
    get: () => sticker.query.value,
    set: (v: string) => { sticker.query.value = v; },
});
const hasQuery = computed(() => sticker.hasQuery.value);

/** 顶层解包 + 方法包装（模板自动解包 ref） */
const searching = sticker.searching;
const loading = sticker.loading;
const searchGroups = sticker.searchGroups;
function allGroupsList() {
    return sticker.allGroups();
}
function loadSetFn(setId: string) {
    return sticker.loadSetStickers(setId);
}

/** 当前贴纸集选择器高亮的 key */
const activeSetKey = ref<string | null>(null);

/** 程序化（平滑）跳转结束判定计时器：平滑滚动停顿 ~200ms 视为结束 */
let progScrollTimer: ReturnType<typeof setTimeout> | null = null;
function clearProgrammaticScroll() {
    if (progScrollTimer) clearTimeout(progScrollTimer);
    progScrollTimer = setTimeout(() => {
        progScrollTimer = null;
        setProgrammaticScroll(false);
    }, 200);
}

/** 滚动到指定贴纸集分组，并更新顶部选择器高亮 */
function scrollToSet(g: StickerGroup, index: number) {
    activeSetKey.value = g.key;
    const el = scrollEl.value;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-set-key="${g.key}"]`);
    if (target) {
        // 平滑跳转途中会沿途扫过中间集，置「程序化跳转」标志，
        // 让 StickerMediaItem 途中只经过不下载，落地后再补下。
        setProgrammaticScroll(true);
        // 兼容从选择器第一项（最近/收藏通常在最前）跳转：找到即滚动
        el.scrollTo({ top: target.offsetTop - el.offsetTop - 4, behavior: 'smooth' });
        clearProgrammaticScroll();
    } else if (index === 0 && el.scrollTop > 0) {
        setProgrammaticScroll(true);
        el.scrollTo({ top: 0, behavior: 'smooth' });
        clearProgrammaticScroll();
    }
}

/** 用户滚动（滚轮/拖动滚动条）停顿判定计时器：停顿 200ms 视为滚动结束 */
let userScrollTimer: ReturnType<typeof setTimeout> | null = null;
function clearUserScroll() {
    if (userScrollTimer) clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => {
        userScrollTimer = null;
        endUserScroll();
    }, 200);
}

/** onScroll 的 rAF 去抖句柄：避免每帧同步强制布局 */
let scrollRaf: number | null = null;

/** 滚动时联动顶部选择器高亮 */
function onScroll() {
    const el = scrollEl.value;
    if (!el) return;
    // 记录滚动位置，供重新打开时恢复记忆
    savedScrollTop = el.scrollTop;
    // 用户滚动进行中：维持「抑制沿途下载」标志，停顿后自动解除
    beginUserScroll();
    clearUserScroll();
    // 程序化跳转进行中：有 scroll 事件即重置停顿计时器
    if (progScrollTimer) clearProgrammaticScroll();
    // 触底加载下一页（搜索模式）：需立即执行，不进 rAF
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60 && hasQuery.value) {
        sticker.loadMore();
    }
    if (hasQuery.value) return;
    // 更新当前贴纸集高亮：rAF 去抖，避免每次滚动同步遍历 + 强制布局
    if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        const j = scrollEl.value;
        if (!j) return;
        let current: string | null = null;
        for (const node of j.querySelectorAll<HTMLElement>('[data-set-key]')) {
            if (node.offsetTop - j.scrollTop <= j.clientHeight * 0.4) {
                current = node.dataset.setKey ?? null;
            } else {
                break;
            }
        }
        if (current && current !== activeSetKey.value) activeSetKey.value = current;
    });
}

const scrollEl = ref<HTMLElement | null>(null);
/** 顶部贴纸集选择器元素（用于滚轮横向滚动） */
const stickerCatsEl = ref<HTMLElement | null>(null);
/** 顶部选择器：鼠标滚轮 → 横向滚动 */
function onStickerCatsWheel(e: WheelEvent) {
    const el = stickerCatsEl.value;
    if (!el) return;
    el.scrollLeft += e.deltaY || e.deltaX;
}
/** 每格贴纸正方形边长（由滚动容器宽度按 grid-cols-4 gap-1 反推） */
const cellSize = ref(48);

onMounted(() => {
    sticker.activate();
    measureCellSize();
    // 恢复上次浏览的滚动位置（需等首帧渲染后再设置）
    if (savedScrollTop > 0 && scrollEl.value) {
        requestAnimationFrame(() => {
            if (scrollEl.value) scrollEl.value.scrollTop = savedScrollTop;
        });
    }
});
onBeforeUnmount(() => {
    sticker.deactivate();
    if (userScrollTimer) { clearTimeout(userScrollTimer); userScrollTimer = null; }
    if (scrollRaf !== null) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
    endUserScroll();
});

/** 面板宽度固定时每格正方形边长：滚动容器内边距 px-2(左右各 8px) + grid-cols-4 gap-1(3×4px) */
function measureCellSize() {
    const el = scrollEl.value;
    if (!el) return;
    const style = getComputedStyle(el);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const contentW = el.clientWidth - padL - padR;
    cellSize.value = Math.max(24, Math.floor((contentW - 12) / 4));
}

function onPick(s: sticker) {
    // 发送贴纸需要的是贴纸的【文件 id】(s.sticker.id)，而非贴纸对象 id (s.id)
    const fileId = s.sticker?.id ?? (s as any).id;
    emit('pickSticker', String(fileId));
}

/**
 * 贴纸项右键菜单：收藏/取消收藏 + 移除最近（与 emoji/GIF 的右键行为一致）。
 * 用 useStickerPicker 维护的 favoriteIds/recentIds 判断当前状态。
 */
function onStickerContextMenu(ev: MouseEvent, s: sticker) {
    const isFav = sticker.isFavorite(s);
    const isRec = sticker.isRecent(s);
    const items: ContextMenuItem[] = [
        {
            key: 'toggle-fav',
            label: isFav ? '取消收藏' : '收藏',
            icon: Star,
            onClick: async () => {
                await sticker.toggleFavorite(s);
            },
        },
    ];
    if (isRec) {
        items.push({
            key: 'remove-recent',
            label: '移除最近',
            icon: Trash2,
            danger: true,
            onClick: async () => {
                await sticker.removeRecent(s);
            },
        });
    }
    openContextMenu(ev.clientX, ev.clientY, items);
}

defineExpose({ activate: () => sticker.activate(), deactivate: () => sticker.deactivate() });
</script>

<style scoped>
.sp-sticker-scroll {
    overscroll-behavior: contain;
}

/* 顶部贴纸集选择器：隐藏横向滚动条 */
.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    scrollbar-width: none;
}

/* 骨架屏（加载中，纯色占位，无动画） */
.sp-skeleton {
    background: rgba(128, 128, 128, 0.14);
}
</style>
