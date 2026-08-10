<template>
    <div class="sp-emoji-drawer flex h-full flex-col">
        <!-- 顶部：搜索框 -->
        <div class="sp-search px-3 pt-2 pb-1">
            <div class="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/10 px-3 py-1.5">
                <SearchIcon class="w-4 h-4 text-gray-400 shrink-0" />
                <input v-model="query" type="text" placeholder="搜索表情"
                    class="flex-1 bg-transparent outline-none text-sm py-0.5 placeholder-gray-400" />
                <button v-if="query" class="text-gray-400 hover:text-gray-600" @click="updateQuery('')">
                    <XIcon class="w-4 h-4" />
                </button>
            </div>
        </div>

        <!-- 顶部：单行横向滚动 —— 最近 + 本地胶囊(可展开/收缩) + 自定义包 -->
        <div ref="catsRowEl"
            class="sp-cats-row flex items-center gap-1 overflow-x-auto no-scrollbar px-3 py-1.5 border-b border-black/5 dark:border-white/10"
            @wheel.prevent="onCatsRowWheel">
            <!-- 最近 -->
            <button type="button"
                class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-base leading-none transition-colors"
                :class="activeBlock === 'recent' ? 'bg-blue-500/15 text-blue-500' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/10'"
                @click="scrollToBlock('recent')" title="最近">
                <ClockIcon class="w-4 h-4" />
            </button>

            <!-- 本地胶囊（可展开/收缩） -->
            <div class="sp-emoji-cats flex items-center gap-0.5 rounded-full px-1 py-0.5">
                <!-- 折叠态：未聚焦本地 emoji 时，只显示代表图标 -->
                <template v-if="!isLocalActive">
                    <button type="button"
                        class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-base leading-none transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        @click="scrollToBlock(localActiveCatId)" :title="localActiveCatName">
                        <GlobalEmojiInline :emoji="localActiveCatEmoji" :size="20" />
                    </button>
                </template>
                <!-- 展开态：聚焦本地 emoji 之一时，显示全部本地分类 -->
                <template v-else>
                    <button v-for="cat in categories" :key="cat.id" type="button"
                        class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-base leading-none transition-colors"
                        :class="activeBlock === cat.id ? 'bg-white dark:bg-gray-700 shadow' : 'hover:bg-black/5 dark:hover:bg-white/10'"
                        @click="scrollToBlock(cat.id)" :title="cat.name">
                        <GlobalEmojiInline :emoji="cat.items[0]?.emoji ?? ''" :size="20" />
                    </button>
                </template>
            </div>

            <!-- 自定义 emoji 包（自己的） -->
            <button v-for="set in installedSets" :key="`custom_${set.id}`" type="button"
                class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center transition-colors"
                :class="activeBlock === `custom_${set.id}` ? 'bg-blue-500/15' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/10'"
                @click="scrollToBlock(`custom_${set.id}`)" :title="set.title">
                <StickerMediaItem v-if="installedIcon(set) && !isTgsIcon(set)" :item="installedIcon(set)" kind="sticker"
                    :size="20" :skin-tone="skinTone" />
                <span v-else class="text-sm">{{ (set.title || '表情')?.[0] ?? '✨' }}</span>
            </button>
        </div>

        <!-- 中间：内容区（垂直排列 + 懒加载骨架） -->
        <div ref="scrollEl" class="sp-emoji-scroll custom-scrollbar flex-1 overflow-y-auto px-2 pb-2"
            @scroll="onScroll">
            <!-- 搜索结果 -->
            <template v-if="hasQuery">
                <div v-if="searching" class="flex justify-center py-8">
                    <div class="sp-skeleton w-40 h-4 rounded"></div>
                </div>
                <div v-else class="sp-emoji-shelf">
                    <button v-for="(r, i) in searchResults" :key="`${r.isCustom}-${r.key}-${i}`"
                        class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                        @click="onPickResult(r)">
                        <template v-if="r.isCustom">
                            <StickerMediaItem v-if="customStickerOf(r.key)" :item="customStickerOf(r.key)"
                                kind="sticker" :size="30" :skin-tone="skinTone" />
                            <span v-else class="text-xl">{{ r.display }}</span>
                        </template>
                        <GlobalEmojiInline v-else :emoji="r.display" :size="28" />
                    </button>
                </div>
                <div v-if="!searching && searchResults.length === 0" class="text-center text-sm text-gray-400 py-8">
                    无匹配结果
                </div>
            </template>

            <!-- 内容区：全部区块完整展开（不折叠），垂直滚动 -->
            <template v-else>
                <!-- 最近 -->
                <div class="sp-emoji-section" data-emoji-block="recent">
                    <p class="sp-emoji-block-title">最近</p>
                    <div class="sp-emoji-shelf">
                        <button v-for="em in recentEmoji" :key="em"
                            class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                            @click="onPickLocal(em)">
                            <GlobalEmojiInline :emoji="em" :size="28" />
                        </button>
                        <div v-if="recentEmoji.length === 0"
                            class="text-center text-sm text-gray-400 py-6 col-span-full">
                            还没有最近使用
                        </div>
                    </div>
                    <!-- 最近自定义 emoji -->
                    <div v-if="recentCustomStickers.length > 0" class="mt-1">
                        <p class="sp-emoji-block-title">最近动态表情</p>
                        <div class="flex flex-wrap gap-0.5">
                            <StickerMediaItem v-for="s in recentCustomStickers" :key="s.id" :item="s" kind="sticker"
                                :size="36" :skin-tone="skinTone" @pick="onPickCustom($event)" />
                        </div>
                    </div>
                </div>

                <!-- 8 大分类：完整展开（标题为纯文字，不显示图标） -->
                <div v-for="cat in categories" :key="cat.id" class="sp-emoji-section" :data-emoji-block="cat.id">
                    <p class="sp-emoji-block-title">{{ cat.name }}</p>
                    <div class="sp-emoji-shelf">
                        <button v-for="it in cat.items" :key="it.emoji"
                            class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                            @click="it.fitzpatrick ? openSkinTone(it.emoji) : onPickLocal(it.emoji)">
                            <GlobalEmojiInline :emoji="it.emoji" :size="28" />
                        </button>
                    </div>
                </div>

                <!-- 已安装自定义 emoji 包（自己的） -->
                <div v-if="installedSets.length > 0" class="sp-emoji-divider">
                    <p class="sp-emoji-block-title">我的表情包</p>
                </div>
                <div v-for="set in installedSets" :key="set.id" class="sp-emoji-section"
                    :data-emoji-block="`custom_${set.id}`" :ref="(el) => registerCustomSetSection(set.id, el)">
                    <div class="flex items-center justify-between">
                        <p class="sp-emoji-block-title">{{ setEmojiTitle(set) }}</p>
                        <button type="button" v-if="!isCustomLoaded(set.id)"
                            class="mr-1 text-[11px] text-blue-500 hover:underline shrink-0"
                            @click="loadCustomSet(set.id)">加载全部</button>
                    </div>
                    <div class="sp-emoji-shelf">
                        <StickerMediaItem v-for="s in installedStamps(set)" :key="s.id" :item="s" kind="sticker"
                            :size="26" :skin-tone="skinTone" @pick="onPickCustom" />
                    </div>
                </div>

                <!-- 推荐自定义 emoji 包（热门，折叠预览：前几排 + 数量 + 添加按钮） -->
                <div v-if="trendingSets.length > 0" class="sp-emoji-divider">
                    <p class="sp-emoji-block-title">推荐表情包</p>
                </div>
                <div v-for="set in trendingSets" :key="set.id" class="sp-emoji-section sp-emoji-trending"
                    :data-emoji-block="`trending_${set.id}`">
                    <div class="sp-emoji-shelf">
                        <StickerMediaItem v-for="s in previewStamps(set)" :key="s.id" :item="s" kind="sticker"
                            :size="26" :skin-tone="skinTone" @pick="onPickCustom" />
                        <div v-if="previewMore(set) > 0" class="sp-trending-more-cnt flex items-center justify-center">
                            +{{ previewMore(set) }}
                        </div>
                    </div>
                    <!-- 底部：数量 + 包名 + 添加按钮 -->
                    <div class="flex items-center justify-between px-1 pt-1.5">
                        <span class="text-[11px] text-gray-400 truncate min-w-0">{{ set.title }} · {{ set.size }}
                            个表情</span>
                        <button type="button" :disabled="isSetInstalled(set.id)"
                            class="sp-add-btn shrink-0 ml-2 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
                            :class="isSetInstalled(set.id) ? 'bg-black/5 dark:bg-white/10 text-gray-400 cursor-default' : 'bg-blue-500/15 text-blue-500 hover:bg-blue-500/25'"
                            @click="addTrendingSet(set.id)">
                            {{ isSetInstalled(set.id) ? '已添加' : '添加' }}
                        </button>
                    </div>
                </div>
            </template>
        </div>

        <!-- 肤色选择 popup -->
        <Teleport to="body">
            <div v-if="skinToneTarget" class="fixed inset-0 z-200 flex items-center justify-center"
                @click.self="closeSkinTone()">
                <div
                    class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 border border-black/10 dark:border-white/10">
                    <div class="flex items-center gap-2 mb-2">
                        <GlobalEmojiInline :emoji="skinToneTarget" :size="40" />
                    </div>
                    <div class="flex items-center gap-2">
                        <button v-for="t in SKIN_TONES" :key="t.value"
                            class="w-8 h-8 rounded-full flex items-center justify-center border border-black/10 dark:border-white/10 hover:ring-2 hover:ring-blue-400"
                            :style="{ background: t.color }" :title="t.label"
                            @click="onPickSkinTone(skinToneTarget, t.value)">
                            <template v-if="t.value === 0">{{ skinToneTarget }}</template>
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SearchIcon, XIcon, ClockIcon } from 'lucide-vue-next';
import GlobalEmojiInline from '../../../common/GlobalEmojiInline.vue';
import StickerMediaItem from './StickerMediaItem.vue';
import { useEmojiPicker, type EmojiSearchResult } from './composables/useEmojiPicker';
import { useLocalEmojiPrefs } from './composables/useLocalEmojiPrefs';
import { onVisibleOnce, unobserve, setProgrammaticScroll, beginUserScroll, endUserScroll } from './composables/useStickerVisibility';
import { stickerPanelState } from './types';
import { tdlibSend } from '../../../../utils/tdlib';
import type { sticker, animation, stickerSetInfo } from 'tdlib-types';

/** Fitzpatrick 肤色选项 */
const SKIN_TONES = [
    { value: 0, color: '#FFE0BD', label: '默认' },   // 用皮肤色占位，实际渲染原 emoji
    { value: 1, color: '#FFE0BD', label: '1-2' },
    { value: 3, color: '#FFCD94', label: '3' },
    { value: 4, color: '#E8B98A', label: '4' },
    { value: 5, color: '#C68745', label: '5' },
    { value: 6, color: '#7A4A22', label: '6' },
];

const props = defineProps<{
    isPremium?: boolean;
}>();

const emit = defineEmits<{
    (e: 'pickEmoji', emoji: string): void;
    (e: 'pickCustomEmoji', id: string): void;
}>();

/** Fitzpatrick 修饰符（U+1F3FB ~ U+1F3FF）对应 type 1..6 */
const FITZ_TYPE_TO_MODIFIER: Record<number, string> = {
    1: '\u{1F3FB}',
    2: '\u{1F3FB}',
    3: '\u{1F3FC}',
    4: '\u{1F3FD}',
    5: '\u{1F3FE}',
    6: '\u{1F3FF}',
};

/** 给 emoji 应用肤色修饰符；type=0 返回原样 */
function applySkinTone(emoji: string, tone: number): string {
    if (!tone) return emoji;
    const mod = FITZ_TYPE_TO_MODIFIER[tone];
    if (!mod) return emoji;
    return `${emoji}\u{200D}${mod}`;
}

const prefs = useLocalEmojiPrefs();

const picker = useEmojiPicker({
    isPremium: () => props.isPremium ?? stickerPanelState.value.isPremium,
});

const query = computed({
    get: () => picker.query.value,
    set: (v: string) => picker.setQuery(v),
});

const categories = computed(() => picker.categories);
const hasQuery = computed(() => picker.hasQuery.value);
const searching = computed(() => picker.searching.value);
const searchResults = computed(() => picker.searchResults.value);
const recentCustomStickers = computed(() => picker.recentCustomStickers.value);
const skinToneTarget = computed(() => picker.skinToneTarget.value);
/** 顶层解包，便于模板自动解包 */
const recentEmoji = picker.prefs.recentEmoji;
const skinTone = picker.prefs.skinTone;

/** 自定义 emoji 包数据（已安装「自己的」+ 热门「推荐」） */
const customData = picker.customData;
const installedSets = customData.installedSets;
const trendingSets = customData.trendingSets;
function loadCustomSet(setId: string) {
    return customData.loadSet(setId);
}
/** 已装自定义包的顶部图标贴纸（covers 第一个；无 covers 返回 undefined） */
function installedIcon(set: stickerSetInfo): sticker | undefined {
    const covers = (set as any).covers ?? [];
    return covers[0] as sticker | undefined;
}
/** 该图标是否为 TGS（TGS 在胶囊里不下载，改用文字） */
function isTgsIcon(set: stickerSetInfo): boolean {
    return installedIcon(set)?.format?._ === 'stickerFormatTgs';
}
/** 推荐包是否已被安装（用于"添加"按钮文案切换） */
function isSetInstalled(setId: string): boolean {
    return installedSets.value.some((s) => String(s.id) === String(setId));
}

/** 顶部分类选择器当前高亮的区块 key：'recent' | 内置分类 id | 自定义包 key */
const activeBlock = ref<'recent' | string>('recent');
/** 聚焦是否在内置本地分类中 */
const isLocalActive = computed(() =>
    categories.value.some((c) => c.id === activeBlock.value)
);
/** 折叠态代表图标的分类（当前聚焦的本地分类，否则第一个） */
function localActiveCat(): { id: string; name: string; emoji: string } {
    const c = categories.value.find((x) => x.id === activeBlock.value) ?? categories.value[0];
    return {
        id: c?.id ?? '',
        name: c?.name ?? '',
        emoji: c?.items?.[0]?.emoji ?? '',
    };
}
const localActiveCatId = computed(() => localActiveCat().id);
const localActiveCatName = computed(() => localActiveCat().name);
const localActiveCatEmoji = computed(() => localActiveCat().emoji);

const scrollEl = ref<HTMLElement | null>(null);
/** 顶部单行（最近+本地胶囊+自定义包）滚动容器 */
const catsRowEl = ref<HTMLElement | null>(null);

/** 顶部整行：鼠标滚轮 → 横向滚动 */
function onCatsRowWheel(e: WheelEvent) {
    const el = catsRowEl.value;
    if (!el) return;
    el.scrollLeft += e.deltaY || e.deltaX;
}

/** 程序化（平滑）跳转结束判定计时器 */
let progScrollTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * 程序化平滑跳转结束后解除「抑制沿途下载」。采用滚动停顿检测：
 * 每次收到 scroll 事件重置计时器，停顿 ~200ms 即视为跳转结束。
 */
function clearProgrammaticScroll() {
    if (progScrollTimer) clearTimeout(progScrollTimer);
    progScrollTimer = setTimeout(() => {
        progScrollTimer = null;
        setProgrammaticScroll(false);
    }, 200);
}

/** 滚动到指定 emoji 区块，并更新顶部选择器高亮（与贴纸抽屉 scrollToSet 一致） */
function scrollToBlock(key: string) {
    activeBlock.value = key;
    const el = scrollEl.value;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-emoji-block="${key}"]`);
    if (target) {
        // 平滑跳转途中会沿途扫过中间区块，若让途径的 emoji 一并下载会浪费；
        // 置「程序化跳转」标志，StickerMediaItem 途中不下载，落地后再补下。
        setProgrammaticScroll(true);
        el.scrollTo({ top: target.offsetTop - el.offsetTop - 4, behavior: 'smooth' });
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
    // 用户滚动进行中：维持「抑制沿途下载」标志，停顿后自动解除
    beginUserScroll();
    clearUserScroll();
    if (hasQuery.value) {
        if (progScrollTimer) clearProgrammaticScroll();
        return;
    }
    // 程序化跳转进行中：有 scroll 事件即重置停顿计时器
    if (progScrollTimer) clearProgrammaticScroll();
    // rAF 去抖联动顶部选择器高亮：避免每次滚动事件都同步遍历 + 强制布局
    if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        const j = scrollEl.value;
        if (!j) return;
        let current: string | null = null;
        for (const node of j.querySelectorAll<HTMLElement>('[data-emoji-block]')) {
            if (node.offsetTop - j.scrollTop <= j.clientHeight * 0.4) {
                current = node.dataset.emojiBlock ?? null;
            } else {
                break;
            }
        }
        if (current && current !== activeBlock.value) activeBlock.value = current;
    });
}

/** 自定义包区块标题（优先用标题文本） */
function setEmojiTitle(set: stickerSetInfo): string {
    return set.title || '表情包';
}

/** 已安装自定义包展示的贴纸：已完整加载则用完整列表，否则用 covers 占位 + 滚入时自动加载 */
function installedStamps(set: stickerSetInfo): sticker[] {
    const loaded = customData.loadedSets.value[set.id];
    if (loaded && loaded.length > 0) return loaded;
    const covers = (set as any).covers ?? [];
    return covers as sticker[];
}
/** 已安装包是否已加载完整 */
function isCustomLoaded(setId: string): boolean {
    return !!customData.loadedSets.value[setId];
}

/** 推荐包折叠预览：只取前两排（8 列 ≈ 16 个）的 covers */
const TRENDING_PREVIEW_COUNT = 16;
function previewStamps(set: stickerSetInfo): sticker[] {
    const covers = (set as any).covers ?? [];
    return covers.slice(0, TRENDING_PREVIEW_COUNT) as sticker[];
}
/** 推荐包剩余数量（预览之外还有多少） */
function previewMore(set: stickerSetInfo): number {
    return Math.max(0, (set.size ?? 0) - TRENDING_PREVIEW_COUNT);
}

onMounted(() => {
    picker.activate();
});

// ─── 已安装自定义包「滚动进入可视区」懒加载（与贴纸抽屉 StickerGroupSection 一致）───
// 打开面板时 useEmojiPicker.activate 只 loadSet 首个包，其余包在对应区块
// 滚动进入可视区时再拉取完整贴纸，避免一次性对所有已装包发起 GetStickerSet。
/** 记录每个已安装自定义包区块的根元素 */
const customSetEls = new Map<string, HTMLElement>();
/** 已注册过「可视区懒加载」的 set id（避免重复观察） */
const observedSetIds = new Set<string>();

function registerCustomSetSection(setId: string, el: unknown) {
    if (!el) { customSetEls.delete(setId); return; }
    customSetEls.set(setId, el as HTMLElement);
}

/** 为尚未完整加载的 set 区块注册一次性可视区观察，进入可视区才 loadSet */
function observeCustomSet(setId: string) {
    if (isCustomLoaded(setId) || observedSetIds.has(setId)) return;
    const el = customSetEls.get(setId);
    if (!el) return;
    observedSetIds.add(setId);
    onVisibleOnce(el, () => {
        customData.loadSet(setId);
    });
}

watch(installedSets, async () => {
    // installedSets 由 activate 异步填充，等待区块渲染后再注册观察器
    await nextTick();
    for (const set of installedSets.value) {
        observeCustomSet(set.id);
    }
}, { deep: true });

onBeforeUnmount(() => {
    for (const el of customSetEls.values()) unobserve(el);
    customSetEls.clear();
    observedSetIds.clear();
    if (userScrollTimer) { clearTimeout(userScrollTimer); userScrollTimer = null; }
    if (scrollRaf !== null) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
    endUserScroll();
});

function onPickResult(r: EmojiSearchResult) {
    picker.pickEmoji(r, (key, isCustom) => {
        if (isCustom) {
            emit('pickCustomEmoji', key);
        } else {
            const final = applySkinTone(key, prefs.skinTone.value);
            picker.prefs.addRecent(final);
            emit('pickEmoji', final);
        }
    });
}

function onPickLocal(emoji: string) {
    const final = applySkinTone(emoji, prefs.skinTone.value);
    picker.prefs.addRecent(final);
    emit('pickEmoji', final);
}

function onPickCustom(s: sticker | animation) {
    if (s._ !== 'sticker') return;
    const id = String(s.id);
    picker.recordRecentCustom(id);
    emit('pickCustomEmoji', id);
}

function updateQuery(v: string) {
    picker.setQuery(v);
}

function closeSkinTone() {
    picker.setSkinToneTarget(null);
}

function openSkinTone(emoji: string) {
    picker.openSkinTone(emoji);
}

function onPickSkinTone(emoji: string, tone: number) {
    prefs.setSkinTone(tone);
    const final = applySkinTone(emoji, tone);
    prefs.addRecent(final);
    emit('pickEmoji', final);
    picker.setSkinToneTarget(null);
}

/** 添加推荐自定义 emoji 包到已安装（TDLib changeStickerSet） */
function addTrendingSet(setId: string) {
    const c = customData;
    (async () => {
        try {
            await tdlibSend({ _: 'changeStickerSet', set_id: setId as any, is_installed: true } as any);
        } catch { /* 静默 */ }
        await c.ensureInstalledCustomEmoji(true);
    })();
}

function customStickerOf(id: string): sticker | undefined {
    // 从已加载的自定义 set 中查找匹配 sticker
    for (const set of picker.customData.installedSets.value) {
        const found = picker.customData.loadedSets.value[set.id]?.find((s) => String(s.id) === id);
        if (found) return found;
    }
    return undefined;
}

defineExpose({ activate: picker.activate, deactivate: picker.deactivate });
</script>

<style scoped>
.sp-emoji-drawer {
    height: 100%;
}

.sp-emoji-scroll {
    overscroll-behavior: contain;
}

.sp-emoji-cell {
    transition: background 0.1s ease;
}

/* 每个 emoji 分类/区块：垂直堆叠，上下滑动浏览 */
.sp-emoji-section {
    margin-bottom: 6px;
}

.sp-emoji-section:first-child {
    margin-top: 4px;
}

/* 区块标题（与贴纸抽屉的分区标题一致） */
.sp-emoji-block-title {
    padding: 4px 4px 2px;
    font-size: 11px;
    font-weight: 500;
    color: rgba(128, 128, 128, 0.9);
}

/* 内置分类折叠标题条：点击展开，可点整行 */
.sp-cat-head {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 6px 4px;
    margin: 2px 0;
    border-radius: 8px;
    border: 1px solid rgba(128, 128, 128, 0.14);
    transition: background 0.1s ease;
}

.sp-cat-head:hover {
    background: rgba(128, 128, 128, 0.08);
}

/* emoji 网格：固定 8 列 + 每格 aspect-square，保证所有包/所有格大小完全一致且更密 */
.sp-emoji-shelf {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 4px;
}

/* 空态占满整行 */
.sp-emoji-shelf .col-span-full {
    grid-column: 1 / -1;
}

/* 自定义包区块的分区标题分隔线 */
.sp-emoji-divider {
    margin: 4px 0 0;
}

/* 自定义包未加载时的提示占位 */
.sp-emoji-hint {
    grid-column: 1 / -1;
    padding: 10px 0;
    text-align: center;
    font-size: 12px;
    color: rgba(128, 128, 128, 0.8);
    cursor: pointer;
}

/* 推荐包折叠预览末尾的「+N」占位 */
.sp-trending-more {
    font-size: 12px;
    font-weight: 600;
    color: rgba(128, 128, 128, 0.85);
}

.sp-trending-more-cnt {
    font-size: 12px;
    font-weight: 600;
    color: rgba(128, 128, 128, 0.85);
}

/* 推荐包：预览 + 底部信息条 */
.sp-emoji-trending {
    padding: 4px;
    border: 1px solid rgba(128, 128, 128, 0.14);
    border-radius: 10px;
}

/* 添加按钮 */
.sp-add-btn {
    color: #3b82f6;
}

/* 分类选择器：隐藏横向滚动条 */
.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    scrollbar-width: none;
}

/* 顶部分类胶囊条：外圈胶囊背景包裹本地分类图标 */
.sp-emoji-cats {
    background: rgba(128, 128, 128, 0.12);
}

/* 集分界线样式（复用贴纸抽屉的分界线） */
.sp-set-divider {
    border-top: 1px solid rgba(128, 128, 128, 0.16);
}

/* 骨架屏（加载中，纯色占位，无动画） */
.sp-skeleton {
    background: rgba(128, 128, 128, 0.14);
}
</style>
