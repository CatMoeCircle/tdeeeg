<template>
    <div class="sp-emoji-drawer flex h-full flex-col" :class="{ 'sp-emoji-drawer--reaction': reactionMode }">
        <!-- 顶部：搜索框 -->
        <div v-if="!showDefaultEmojiStatus" class="sp-search px-3 pt-2 pb-1">
            <div class="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/10 px-3 py-1.5">
                <SearchIcon class="w-4 h-4 text-gray-400 shrink-0" />
                <input v-model="query" type="text" placeholder="搜索表情"
                    class="flex-1 bg-transparent outline-none text-sm py-0.5 placeholder-gray-400" />
                <button v-if="query" class="text-gray-400 hover:text-gray-600" @click="updateQuery('')">
                    <XIcon class="w-4 h-4" />
                </button>
            </div>
        </div>

        <!-- 顶部：单行横向滚动 -->
        <div ref="catsRowEl"
            class="sp-cats-row flex items-center gap-1 overflow-x-auto no-scrollbar px-3 py-1.5 border-b border-black/5 dark:border-white/10"
            @wheel.prevent="onCatsRowWheel">
            <!-- 可用回应（回应选择器）：前 16 个固定列表，排在第一位 -->
            <button v-if="reactionMode" type="button"
                class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-base leading-none transition-colors"
                :class="activeBlock === 'available_reactions' ? 'bg-blue-500/15 text-blue-500' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/10'"
                @click="scrollToBlock('available_reactions')" title="可用回应">
                <span :style="{ fontSize: '14px', lineHeight: '1' }">{{ availableNavEmoji }}</span>
            </button>

            <!-- 最近：普通模式为聊天最近；回应模式为可用回应第 17 个起的剩余项（无剩余则不显示） -->
            <button v-if="!reactionMode || leftoverReactions.length > 0" type="button"
                class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-base leading-none transition-colors"
                :class="activeBlock === 'recent' ? 'bg-blue-500/15 text-blue-500' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/10'"
                @click="scrollToBlock('recent')" :title="t('lng_recent_title')">
                <ClockIcon class="w-4 h-4" />
            </button>

            <!-- 本地胶囊（可展开/收缩；回应模式下隐藏，由可用回应列表替代） -->
            <div v-if="!showDefaultEmojiStatus && !reactionMode"
                class="sp-emoji-cats flex items-center gap-0.5 rounded-full px-1 py-0.5">
                <!-- 折叠态：未聚焦本地 emoji 时，只显示代表图标 -->
                <template v-if="!isLocalActive">
                    <button type="button"
                        class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-base leading-none transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        @click="scrollToBlock(localActiveCatId)" :title="localActiveCatName">
                        <span :style="{ fontSize: '14px', lineHeight: '1' }">{{ localActiveCatEmoji }}</span>
                    </button>
                </template>
                <!-- 展开态：聚焦本地 emoji 之一时，显示全部本地分类 -->
                <template v-else>
                    <button v-for="cat in categories" :key="cat.id" type="button"
                        class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-base leading-none transition-colors"
                        :class="activeBlock === cat.id ? 'bg-white dark:bg-gray-700 shadow' : 'hover:bg-black/5 dark:hover:bg-white/10'"
                        @click="scrollToBlock(cat.id)" :title="cat.name">
                        <span :style="{ fontSize: '14px', lineHeight: '1' }">{{ cat.items[0]?.emoji ?? '' }}</span>
                    </button>
                </template>
            </div>

            <!-- 升级礼物典藏品（回应模式下隐藏） -->
            <button v-if="giftEmojiIds.length > 0 && !reactionMode" type="button"
                class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center transition-colors"
                :class="activeBlock === 'gift_status' ? 'bg-blue-500/15' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/10'"
                @click="scrollToBlock('gift_status')" title="典藏品">
                <span class="tgico tgico-collectible text-[20px]" />
            </button>

            <!-- 自定义 emoji 包（自己的） -->
            <button v-for="set in installedSets" :key="`custom_${set.id}`" type="button"
                class="sp-cat-pill shrink-0 w-8 h-8 flex items-center justify-center transition-colors"
                :class="activeBlock === `custom_${set.id}` ? 'bg-blue-500/15' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/10'"
                @click="scrollToBlock(`custom_${set.id}`)" :title="set.title">
                <StickerMediaItem v-if="installedIcon(set) && !isTgsIcon(set)" :item="installedIcon(set)" kind="sticker"
                    :size="16" :skin-tone="skinTone" />
                <span v-else class="text-sm">{{ (set.title || t('lng_stickers_installed_tab'))?.[0] ?? '✨' }}</span>
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
                                kind="sticker" :skin-tone="skinTone" />
                            <span v-else class="text-xl">{{ r.display }}</span>
                        </template>
                        <span v-else class="sp-cell-emoji" :style="{ fontSize: GRID_EMOJI_FONT }">{{ r.display }}</span>
                    </button>
                </div>
                <div v-if="!searching && searchResults.length === 0" class="text-center text-sm text-gray-400 py-8">
                    无匹配结果
                </div>
            </template>

            <!-- 内容区：全部区块完整展开（不折叠），垂直滚动 -->
            <template v-else>
                <!-- 可用回应固定区：前 16 个，始终排在第一位 -->
                <div v-if="reactionMode" class="sp-emoji-section" data-emoji-block="available_reactions">
                    <p class="sp-emoji-block-title">可用回应</p>
                    <div v-if="availableList.length === 0" class="text-center text-xs text-gray-400 py-4">
                        加载中...
                    </div>
                    <div v-else class="sp-emoji-shelf">
                        <button v-for="r in fixedReactions" :key="availableReactionKey(r)" type="button"
                            class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                            :class="{ 'opacity-50 cursor-not-allowed': !canPickAvailable(r) }"
                            :disabled="!canPickAvailable(r)"
                            :title="!canPickAvailable(r) ? '需要 Premium' : ''" @click="onPickAvailable(r)">
                            <ReactionEmojiAnim v-if="isReactionEmoji(r.type)" :emoji="r.type.emoji"
                                :size="GRID_MEDIA_PX" :fallback-font="20" />
                            <CustomEmojiInline v-else-if="isReactionCustomEmoji(r.type)"
                                :emojiId="r.type.custom_emoji_id" :size="GRID_MEDIA_PX"
                                :fallbackText="r.type.custom_emoji_id" />
                            <PaidReactionIcon v-else :size="GRID_MEDIA_PX" />
                        </button>
                    </div>
                </div>

                <!-- 最近：回应模式下为可用回应第 17 个起的剩余项；普通模式为聊天最近 -->
                <div v-if="!reactionMode || leftoverReactions.length > 0" class="sp-emoji-section"
                    data-emoji-block="recent">
                    <template v-if="reactionMode">
                        <p class="sp-emoji-block-title">最近</p>
                        <div class="sp-emoji-shelf">
                            <button v-for="r in leftoverReactions" :key="availableReactionKey(r)" type="button"
                                class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                                :class="{ 'opacity-50 cursor-not-allowed': !canPickAvailable(r) }"
                                :disabled="!canPickAvailable(r)"
                                :title="!canPickAvailable(r) ? '需要 Premium' : ''" @click="onPickAvailable(r)">
                                <ReactionEmojiAnim v-if="isReactionEmoji(r.type)" :emoji="r.type.emoji"
                                    :size="GRID_MEDIA_PX" :fallback-font="20" />
                                <CustomEmojiInline v-else-if="isReactionCustomEmoji(r.type)"
                                    :emojiId="r.type.custom_emoji_id" :size="GRID_MEDIA_PX"
                                    :fallbackText="r.type.custom_emoji_id" />
                                <PaidReactionIcon v-else :size="GRID_MEDIA_PX" />
                            </button>
                        </div>
                    </template>
                    <template v-else>
                        <p class="sp-emoji-block-title">最近</p>
                        <div class="sp-emoji-shelf">
                            <button v-if="showDefaultEmojiStatus" type="button"
                                class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                                title="默认会员徽章" @click="emit('pickDefaultStatus')">
                                <span class="tgico tgico-emoji-status text-[28px]" />
                            </button>
                            <template v-if="showDefaultEmojiStatus">
                                <StickerMediaItem v-for="s in recentStatusStickers" :key="s.id" :item="s"
                                    kind="sticker" :size="26" :skin-tone="skinTone" @pick="onPickCustom" />
                            </template>
                            <button v-else v-for="em in recentEmoji" :key="em"
                                class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                                @click="onPickLocal(em)">
                                <span class="sp-cell-emoji" :style="{ fontSize: GRID_EMOJI_FONT }">{{ em }}</span>
                            </button>
                            <div
                                v-if="(showDefaultEmojiStatus ? recentStatusStickers.length : recentEmoji.length) === 0"
                                class="text-center text-sm text-gray-400 py-6 col-span-full">
                                还没有最近使用
                            </div>
                        </div>
                        <!-- 最近自定义 emoji -->
                        <div v-if="!showDefaultEmojiStatus && recentCustomStickers.length > 0" class="mt-1">
                            <p class="sp-emoji-block-title">最近动态表情</p>
                            <div class="flex flex-wrap gap-0.5">
                                <StickerMediaItem v-for="s in recentCustomStickers" :key="s.id" :item="s"
                                    kind="sticker" :size="36" :skin-tone="skinTone" @pick="onPickCustom($event)" />
                            </div>
                        </div>
                    </template>
                </div>

                <!-- 8 大分类：完整展开（回应模式下隐藏——这些并非可用回应） -->
                <div v-if="!showDefaultEmojiStatus && !reactionMode" v-for="cat in categories" :key="cat.id"
                    class="sp-emoji-section" :data-emoji-block="cat.id">
                    <p class="sp-emoji-block-title">{{ cat.name }}</p>
                    <div class="sp-emoji-shelf">
                        <button v-for="it in cat.items" :key="it.emoji"
                            class="sp-emoji-cell flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-full aspect-square"
                            @click="it.fitzpatrick ? openSkinTone(it.emoji) : onPickLocal(it.emoji)">
                            <span class="sp-cell-emoji" :style="{ fontSize: GRID_EMOJI_FONT }">{{ it.emoji }}</span>
                        </button>
                    </div>
                </div>

                <!-- 升级礼物状态（典藏品） -->
                <div v-if="giftEmojiIds.length > 0 && !reactionMode" class="sp-emoji-section"
                    data-emoji-block="gift_status">
                    <p class="sp-emoji-block-title">典藏品</p>
                    <div class="sp-emoji-shelf">
                        <StickerMediaItem v-for="s in giftStickers" :key="s.id" :item="s" kind="sticker"
                            :size="26" :skin-tone="skinTone" @pick="onPickCustom" />
                    </div>
                </div>

                <!-- 已安装自定义 emoji 包（自己的）：完整展开 -->
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
                            :size="26" :skin-tone="skinTone" :source-label="setEmojiTitle(set)" @pick="onPickCustom" />
                    </div>
                </div>

                <!-- 推荐自定义 emoji 包（热门）：默认折叠预览，可手动展开 -->
                <div v-if="trendingSets.length > 0" class="sp-emoji-divider">
                    <p class="sp-emoji-block-title">推荐表情包</p>
                </div>
                <div v-for="set in trendingSets" :key="set.id" class="sp-emoji-section sp-emoji-trending"
                    :data-emoji-block="`trending_${set.id}`">
                    <button type="button" class="sp-cat-head w-full text-left"
                        @click="toggleTrendingExpand(String(set.id))">
                        <span class="sp-emoji-block-title flex-1 min-w-0 truncate">{{ set.title }}</span>
                        <span class="text-[10px] text-gray-400 shrink-0 ml-1">{{ set.size }} 个表情</span>
                        <ChevronDownIcon v-if="trendingTotal(set) > PREVIEW_COUNT || isTrendingExpanded(String(set.id))"
                            class="w-3.5 h-3.5 shrink-0 ml-1 transition-transform"
                            :class="isTrendingExpanded(String(set.id)) ? 'rotate-180' : ''" />
                    </button>
                    <div class="sp-emoji-shelf">
                        <StickerMediaItem v-for="s in trendingDisplayStamps(set)" :key="s.id" :item="s" kind="sticker"
                            :size="26" :skin-tone="skinTone" :source-label="set.title || setEmojiTitle(set)" @pick="onPickCustom" />
                        <button v-if="trendingCanExpand(set)" type="button"
                            class="sp-trending-more-cnt flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
                            :title="`展开剩余 ${trendingMore(set)} 个`"
                            @click="toggleTrendingExpand(String(set.id))">
                            +{{ trendingMore(set) }}
                        </button>
                    </div>
                    <!-- 底部：添加按钮 -->
                    <div class="flex items-center justify-end px-1 pt-1.5">
                        <button type="button" :disabled="isSetInstalled(set.id)"
                            class="sp-add-btn shrink-0 ml-2 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
                            :class="isSetInstalled(set.id) ? 'bg-black/5 dark:bg-white/10 text-gray-400 cursor-default' : 'bg-blue-500/15 text-blue-500 hover:bg-blue-500/25'"
                            @click="addTrendingSet(set.id)">
                            {{ isSetInstalled(set.id) ? '已添加' : t('lng_stickers_featured_add') }}
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
                        <span :style="{ fontSize: '40px', lineHeight: '1' }">{{ skinToneTarget }}</span>
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
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SearchIcon, XIcon, ClockIcon, ChevronDownIcon } from 'lucide-vue-next';
// GlobalEmojiInline removed - using global Apple Color Emoji font
import StickerMediaItem from './StickerMediaItem.vue';
import CustomEmojiInline from '../../../common/CustomEmojiInline.vue';
import PaidReactionIcon from '../../../common/PaidReactionIcon.vue';
import ReactionEmojiAnim from '../../../common/ReactionEmojiAnim.vue';
import { prefetchEmojiReactionAnims } from '../../../../store/emojiReactions';
import { useEmojiPicker, type EmojiSearchResult } from './composables/useEmojiPicker';
import { useLocalEmojiPrefs } from './composables/useLocalEmojiPrefs';
import { onVisibilityChange, unobserve, setProgrammaticScroll, beginUserScroll, endUserScroll } from './composables/useStickerVisibility';
import { enqueueViewportLoad, DEFAULT_DWELL_MS } from '../../../../utils/viewportLoadGate';
import { stickerPanelState } from './types';
import { tdlibSend } from '../../../../utils/tdlib';
import type { sticker, animation, stickerSetInfo, emojiStatus, availableReaction, ReactionType } from 'tdlib-types';
import { isReactionEmoji, isReactionCustomEmoji } from '../../../../utils/reactionHelpers';

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
    emojiStatusGiftStatuses?: emojiStatus[];
    emojiStatusRecentStatuses?: emojiStatus[];
    showDefaultEmojiStatus?: boolean;
    /** 回应选择器模式：可用默认回应列表位于「最近」与「自定义 emoji」之间，隐藏 8 大 Unicode 分类 */
    reactionMode?: boolean;
    /** 可用回应列表（reactionMode 下展示） */
    availableReactions?: availableReaction[];
}>();

const emit = defineEmits<{
    (e: 'pickEmoji', emoji: string): void;
    (e: 'pickCustomEmoji', id: string): void;
    (e: 'pickDefaultStatus'): void;
    /** 选择了一个可用回应（含 emoji / 自定义 / 付费） */
    (e: 'pickReaction', type: ReactionType): void;
}>();

/** 可用回应列表（回应选择器） */
const availableList = computed(() => props.availableReactions ?? []);
/** 固定展示：前 16 个，始终排在第一位 */
const FIXED_REACTION_COUNT = 16;
const fixedReactions = computed(() => availableList.value.slice(0, FIXED_REACTION_COUNT));
/** 第 17 个起：归入「最近」区块 */
const leftoverReactions = computed(() => availableList.value.slice(FIXED_REACTION_COUNT));
/**
 * 网格内视觉尺寸：普通 emoji 与自定义/付费媒体对齐。
 * 回应选择器整体更紧凑，再缩一档。
 */
const GRID_EMOJI_FONT = computed(() => (props.reactionMode ? '20px' : '22px'));
const GRID_MEDIA_PX = computed(() => (props.reactionMode ? 22 : 24));
/** 顶部「可用回应」导航图标 */
const availableNavEmoji = computed(() => {
    const first = fixedReactions.value.find((r) => isReactionEmoji(r.type)) as any;
    return first?.type?.emoji ?? '👍';
});
const isPremium = computed(() => props.isPremium ?? stickerPanelState.value.isPremium);

function availableReactionKey(r: availableReaction): string {
    if (isReactionEmoji(r.type)) return r.type.emoji;
    if (isReactionCustomEmoji(r.type)) return `c:${r.type.custom_emoji_id}`;
    return 'paid';
}

function canPickAvailable(r: availableReaction): boolean {
    return !(r.needs_premium && !isPremium.value);
}

/** 点击可用默认回应：发出完整 ReactionType */
function onPickAvailable(r: availableReaction) {
    if (!canPickAvailable(r)) return;
    if (isReactionEmoji(r.type)) {
        picker.prefs.addRecent(r.type.emoji);
    }
    emit('pickReaction', r.type);
}

/** 打开/列表变化时预热反应动画（对齐 Unigram getEmojiReaction） */
watch(availableList, (list) => {
    if (!props.reactionMode || !list.length) return;
    prefetchEmojiReactionAnims(
        list.filter((r) => isReactionEmoji(r.type)).map((r) => (r.type as any).emoji as string),
    );
}, { immediate: true });

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
const giftEmojiIds = computed(() => (props.emojiStatusGiftStatuses ?? [])
    .map((status: any) => status.type?._ === 'emojiStatusTypeUpgradedGift'
        ? String(status.type.model_custom_emoji_id) : '')
    .filter(Boolean));
const giftStickers = ref<sticker[]>([]);
const recentStatusStickers = ref<sticker[]>([]);
const recentStatusEmojiIds = computed(() => (props.emojiStatusRecentStatuses ?? [])
    .map((status: any) => status.type?._ === 'emojiStatusTypeCustomEmoji'
        ? String(status.type.custom_emoji_id)
        : status.type?._ === 'emojiStatusTypeUpgradedGift'
            ? String(status.type.model_custom_emoji_id) : '')
    .filter(Boolean));

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
/** 推荐包是否已被安装（用于 t('lng_stickers_featured_add') 按钮文案切换） */
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

/** 折叠预览条数：两排 × 8 列 */
const PREVIEW_COUNT = 16;

/** 推荐包展开状态（默认收起） */
const expandedTrending = ref<Set<string>>(new Set());

function isTrendingExpanded(setId: string | number): boolean {
    return expandedTrending.value.has(String(setId));
}

/** 已安装自定义包的源贴纸：已完整加载则用完整列表，否则用 covers 占位 */
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

/** 推荐包源贴纸：优先用已加载完整列表，否则用 covers */
function trendingStamps(set: stickerSetInfo): sticker[] {
    const loaded = customData.loadedSets.value[set.id];
    if (loaded && loaded.length > 0) return loaded;
    const covers = (set as any).covers ?? [];
    return covers as sticker[];
}
function trendingDisplayStamps(set: stickerSetInfo): sticker[] {
    const list = trendingStamps(set);
    if (isTrendingExpanded(set.id)) return list;
    return list.slice(0, PREVIEW_COUNT);
}
function trendingTotal(set: stickerSetInfo): number {
    return Math.max(set.size ?? 0, trendingStamps(set).length);
}
function trendingCanExpand(set: stickerSetInfo): boolean {
    return !isTrendingExpanded(set.id) && trendingTotal(set) > PREVIEW_COUNT;
}
function trendingMore(set: stickerSetInfo): number {
    return Math.max(0, trendingTotal(set) - PREVIEW_COUNT);
}
function toggleTrendingExpand(setId: string | number) {
    const key = String(setId);
    const next = new Set(expandedTrending.value);
    if (next.has(key)) {
        next.delete(key);
    } else {
        next.add(key);
        // 展开时拉取完整 set（covers 不够时）
        if (!customData.loadedSets.value[key]) void customData.loadSet(key);
    }
    expandedTrending.value = next;
}

async function loadGiftStickers(ids: string[]) {
    if (ids.length === 0) {
        giftStickers.value = [];
        return;
    }
    giftStickers.value = await customData.resolveCustomEmojis(ids);
}

async function loadRecentStatusStickers(ids: string[]) {
    if (ids.length === 0) {
        recentStatusStickers.value = [];
        return;
    }
    recentStatusStickers.value = await customData.resolveCustomEmojis(ids);
}

onMounted(() => {
    picker.activate();
    void loadGiftStickers(giftEmojiIds.value);
    void loadRecentStatusStickers(recentStatusEmojiIds.value);
});

watch(giftEmojiIds, (ids) => {
    void loadGiftStickers(ids);
}, { deep: true });

watch(recentStatusEmojiIds, (ids) => {
    void loadRecentStatusStickers(ids);
}, { deep: true });

// ─── 已安装自定义包「滚动进入可视区」懒加载（与贴纸抽屉 StickerGroupSection 一致）───
// 打开面板时 useEmojiPicker.activate 只 loadSet 首个包，其余包在对应区块
// 滚动进入可视区时再拉取完整贴纸，避免一次性对所有已装包发起 GetStickerSet。
/** 记录每个已安装自定义包区块的根元素 */
const customSetEls = new Map<string, HTMLElement>();
/** 已注册过「可视区懒加载」的 set id（避免重复观察） */
const observedSetIds = new Set<string>();
/** 各 set 区块的停留/在视口状态 */
const setDwellTimers = new Map<string, ReturnType<typeof setTimeout>>();
const setInView = new Map<string, boolean>();

function clearSetDwell(setId: string) {
    const t = setDwellTimers.get(setId);
    if (t !== undefined) {
        clearTimeout(t);
        setDwellTimers.delete(setId);
    }
}

function registerCustomSetSection(setId: string, el: unknown) {
    if (!el) { customSetEls.delete(setId); return; }
    customSetEls.set(setId, el as HTMLElement);
}

/** 为尚未完整加载的 set 区块注册可视区观察：停留后经贴纸池限流 loadSet */
function observeCustomSet(setId: string) {
    if (isCustomLoaded(setId) || observedSetIds.has(setId)) return;
    const el = customSetEls.get(setId);
    if (!el) return;
    observedSetIds.add(setId);
    onVisibilityChange(
        el,
        () => {
            setInView.set(setId, true);
            if (isCustomLoaded(setId)) return;
            clearSetDwell(setId);
            setDwellTimers.set(setId, setTimeout(() => {
                setDwellTimers.delete(setId);
                if (!setInView.get(setId) || isCustomLoaded(setId)) return;
                enqueueViewportLoad(async () => { await customData.loadSet(setId); }, 'sticker');
            }, DEFAULT_DWELL_MS));
        },
        () => {
            setInView.set(setId, false);
            clearSetDwell(setId);
        },
    );
}

watch(installedSets, async () => {
    // installedSets 由 activate 异步填充，等待区块渲染后再注册观察器
    await nextTick();
    for (const set of installedSets.value) {
        observeCustomSet(set.id);
    }
}, { deep: true });

onBeforeUnmount(() => {
    for (const t of setDwellTimers.values()) clearTimeout(t);
    setDwellTimers.clear();
    setInView.clear();
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
.tgico-collectible::before {
    content: "\e9ef";
}

.tgico-emoji-status::before {
    content: "\ea2a";
    color: #FF5288C1;
}

.sp-emoji-drawer {
    height: 100%;
}

.sp-emoji-scroll {
    overscroll-behavior: contain;
}

.sp-emoji-cell {
    transition: background 0.1s ease;
}

/* 网格内普通 emoji：与媒体项同量级，整体偏小 */
.sp-cell-emoji {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    line-height: 1;
    font-size: 22px;
}

/* 自定义包贴纸在格子内略缩进，避免铺满显得过大 */
.sp-emoji-shelf .sp-media-item {
    padding: 4px;
    box-sizing: border-box;
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

/* 已安装/推荐包折叠标题条：点击展开/收起 */
.sp-cat-head {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 4px 4px 2px;
    margin: 0;
    border-radius: 6px;
    border: none;
    background: transparent;
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

/* 回应选择器：收紧网格与区块间距（emoji 已偏小，格子不宜过大） */
.sp-emoji-drawer--reaction .sp-emoji-shelf {
    gap: 2px;
}

.sp-emoji-drawer--reaction .sp-emoji-section {
    margin-bottom: 2px;
}

.sp-emoji-drawer--reaction .sp-emoji-scroll {
    padding-left: 4px;
    padding-right: 4px;
}

.sp-emoji-drawer--reaction .sp-search,
.sp-emoji-drawer--reaction .sp-cats-row {
    padding-left: 6px;
    padding-right: 6px;
}

.sp-emoji-drawer--reaction .sp-cats-row {
    padding-top: 4px;
    padding-bottom: 4px;
}

.sp-emoji-drawer--reaction .sp-emoji-block-title {
    margin: 2px 0 2px;
}

.sp-emoji-drawer--reaction .sp-emoji-shelf .sp-media-item {
    padding: 2px;
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
