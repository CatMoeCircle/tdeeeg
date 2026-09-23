<template>
    <Teleport to="body">
        <Transition name="gift-dialog">
            <div v-if="open" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="gift-detail-title" @mousedown.self="emitClose">
                <div
                    class="w-90 max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-800 flex flex-col">
                    <!-- NFT 头部：渐变底 + 符号图案 + 标题 -->
                    <div v-if="isUpgraded" class="relative shrink-0 overflow-hidden px-5 pb-3.5 pt-3 text-center"
                        :style="headerBackdropStyle">
                        <!-- 光晕层（与 GiftDisplay 一致：backdrop 内 200×200 居中） -->
                        <div v-if="headerColors" class="gift-halo pointer-events-none" :style="headerHaloStyle" />
                        <!-- 背景符号图案（Symbol.Sticker，半透明棋盘格绕中心铺开） -->
                        <div v-if="symbolStickerMsg" class="gift-pattern pointer-events-none">
                            <div v-for="(item, i) in patternItems" :key="i" class="pattern-cell" :style="item.style">
                                <MessageStickerContent :content="symbolStickerMsg" :size="item.size" />
                            </div>
                        </div>

                        <div class="relative z-10 flex items-center justify-end gap-0.5">
                            <button v-if="showMore" type="button" :aria-label="t('lng_context_menu_more')"
                                class="flex h-7 w-7 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
                                @click="emitMore">
                                <MoreHorizontalIcon class="h-4.5 w-4.5" />
                            </button>
                            <button type="button" :aria-label="t('lng_close')"
                                class="flex h-7 w-7 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
                                @click="emitClose">
                                <XIcon class="h-4.5 w-4.5" />
                            </button>
                        </div>

                        <div class="relative z-10 mx-auto flex h-28 items-center justify-center">
                            <MessageStickerContent :content="stickerContent" :size="112" />
                        </div>
                        <h2 id="gift-detail-title"
                            class="relative z-10 mt-0.5 text-lg font-semibold text-white drop-shadow-sm">
                            <GlobalEmojiText :text="title" />
                        </h2>
                        <p v-if="subtitle" class="relative z-10 text-xs text-white/85">
                            <GlobalEmojiText :text="subtitle" />
                        </p>
                    </div>

                    <!-- 普通礼物头部：白底 + 贴纸 + 标题说明 -->
                    <div v-else class="relative shrink-0 px-5 pb-3 pt-3 text-center">
                        <button type="button" :aria-label="t('lng_close')"
                            class="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="emitClose">
                            <XIcon class="h-4.5 w-4.5" />
                        </button>
                        <div class="mx-auto flex h-28 items-center justify-center">
                            <MessageStickerContent :content="stickerContent" :size="112" />
                        </div>
                        <h2 id="gift-detail-title" class="mt-0.5 text-lg font-semibold text-gray-900 dark:text-white">
                            <GlobalEmojiText :text="title" />
                        </h2>
                        <p v-if="description" class="mx-auto mt-0.5 max-w-sm text-xs leading-snug text-gray-600 dark:text-gray-300">
                            <GlobalEmojiText :text="description" />
                        </p>
                    </div>

                    <!-- 信息表 + 说明区（两种礼物共用） -->
                    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-3"
                        :class="isUpgraded ? 'pt-3' : 'pt-0'">
                        <div class="overflow-hidden rounded-lg border border-gray-200 text-[13px] dark:border-gray-600">
                            <template v-for="(row, ri) in tableRows" :key="ri">
                                <!-- 带标签的行 -->
                                <div v-if="row.label"
                                    class="flex min-h-10 border-b border-gray-200 last:border-b-0 dark:border-gray-600">
                                    <div
                                        class="flex w-18 shrink-0 items-center bg-gray-50 px-2.5 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                        {{ row.label }}
                                    </div>
                                    <div class="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5"
                                        :class="row.accent ? 'text-[#168acd] dark:text-sky-400' : 'text-gray-800 dark:text-gray-100'">
                                        <!-- 对方头像 -->
                                        <template v-if="row.kind === 'party' && row.party">
                                            <div class="flex h-6 w-6 shrink-0 overflow-hidden rounded-full">
                                                <Avatar :photo="row.party.photo" :title="row.party.name"
                                                    :accent-color-id="row.party.accentColorId" />
                                            </div>
                                            <span class="truncate font-medium">
                                                <GlobalEmojiText :text="row.party.name" />
                                            </span>
                                        </template>
                                        <!-- 星星价值：本地 TGS 星标 -->
                                        <template v-else-if="row.kind === 'stars'">
                                            <PaidReactionIcon :size="18" />
                                            <span>{{ row.value }}</span>
                                        </template>
                                        <!-- 带稀有度徽章 -->
                                        <template v-else-if="row.kind === 'attr'">
                                            <span class="shrink-0">
                                                <GlobalEmojiText :text="row.value || ''" />
                                            </span>
                                            <span v-if="row.rarity"
                                                class="shrink-0 rounded-full bg-sky-100 px-1.5 py-px text-[10px] font-medium leading-tight text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                                                {{ row.rarity }}
                                            </span>
                                        </template>
                                        <!-- 价值 + 了解更多 -->
                                        <template v-else-if="row.kind === 'value'">
                                            <span class="shrink-0">{{ row.value }}</span>
                                            <button v-if="row.learnMore" type="button"
                                                class="shrink-0 rounded-full bg-sky-100 px-1.5 py-px text-[10px] font-medium leading-tight text-sky-700 hover:bg-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:hover:bg-sky-500/30"
                                                @click="emitLearnMore">
                                                {{ row.learnMore }}
                                            </button>
                                        </template>
                                        <!-- 普通文本 -->
                                        <template v-else>
                                            <span class="min-w-0">
                                                <GlobalEmojiText :text="row.value || ''" />
                                            </span>
                                        </template>
                                    </div>
                                </div>
                                <!-- 无标签整行（礼物说明 / 留言，支持自定义 emoji） -->
                                <div v-else
                                    class="flex min-h-9 items-center border-b border-gray-200 bg-gray-50/80 px-2.5 py-1.5 last:border-b-0 dark:border-gray-600 dark:bg-gray-700/40">
                                    <span class="min-w-0 text-gray-800 dark:text-gray-100">
                                        <FormattedTextInline v-if="row.formattedText" :formattedText="row.formattedText"
                                            :size="emojiSize" />
                                        <GlobalEmojiText v-else :text="row.value || ''" />
                                    </span>
                                </div>
                            </template>
                        </div>

                        <p v-if="footer" class="mt-2.5 text-xs leading-snug text-gray-500 dark:text-gray-400">
                            <GlobalEmojiText :text="footer" />
                        </p>
                    </div>

                    <div class="shrink-0 border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                        <button type="button"
                            class="w-full rounded-lg bg-[#2e9cd3] py-2 text-sm font-medium text-white hover:bg-[#278cc0] focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            @click="emitClose">
                            {{ t('lng_box_ok') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { MoreHorizontalIcon, XIcon } from 'lucide-vue-next';
import type { messageSticker, sticker } from 'tdlib-types';
import Avatar from '../chat/avatar.vue';
import MessageStickerContent from '../chat/ChatDetail/MessageContent/content/MessageStickerContent.vue';
import GlobalEmojiText from './GlobalEmojiText.vue';
import FormattedTextInline from '../chat/FormattedTextInline.vue';
import PaidReactionIcon from './PaidReactionIcon.vue';
import { intToRgb, rgbToCss } from '../../store/colors';
import type { GiftDetailData, GiftDetailRow } from '../../utils/giftDetail';

const { t } = useI18n();

const props = withDefaults(defineProps<{
    open: boolean;
    data: GiftDetailData | null;
    /** 说明区自定义 emoji 尺寸 */
    emojiSize?: number;
}>(), {
    emojiSize: 16,
});

const emit = defineEmits<{
    close: [];
    more: [];
    learnMore: [];
}>();

function emitClose() { emit('close'); }
function emitMore() { emit('more'); }
function emitLearnMore() { emit('learnMore'); }

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) emitClose();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

const data = computed(() => props.data);
const isUpgraded = computed(() => data.value?.kind === 'upgraded');
const title = computed(() => data.value?.title ?? '');
const subtitle = computed(() => data.value?.subtitle);
const description = computed(() => data.value?.description);
const footer = computed(() => data.value?.footer);
const tableRows = computed<GiftDetailRow[]>(() => data.value?.rows ?? []);
const showMore = computed(() => !!data.value?.showMore);
const emojiSize = computed(() => props.emojiSize);

const stickerContent = computed<messageSticker>(() => ({
    _: 'messageSticker',
    sticker: data.value!.sticker,
    is_premium: false,
}));

// ---------- NFT 头部背景 ----------
const upgradedData = computed(() => data.value?.upgraded ?? null);

const symbolSticker = computed<sticker | null>(() => upgradedData.value?.symbol?.sticker ?? null);

const symbolStickerMsg = computed(() => {
    if (!symbolSticker.value) return null;
    return {
        _: 'messageSticker' as const,
        sticker: symbolSticker.value,
        is_premium: false,
    };
});

const headerColors = computed(() => {
    const c = upgradedData.value?.backdrop?.colors;
    if (!c) return null;
    return {
        center: intToRgb(c.center_color),
        edge: intToRgb(c.edge_color),
        symbol: intToRgb(c.symbol_color),
        text: intToRgb(c.text_color),
    };
});

const headerBackdropStyle = computed(() => {
    if (!headerColors.value) return { background: '#3d8f6e' };
    return { background: rgbToCss(headerColors.value.edge) };
});

const headerHaloStyle = computed(() => {
    if (!headerColors.value) return {};
    const c = headerColors.value.center;
    const e = headerColors.value.edge;
    // 与 GiftDisplay._halo 一致：200×200 居中径向渐变，不要铺满（避免盖住图案层）
    return {
        width: '200px',
        height: '200px',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(rgb(${c.join(',')}) 0%, rgb(${e.join(',')}) 50%)`,
    };
});

/** 背景符号图案：与 GiftDisplay 同算法（棋盘格绕中心铺开，越靠边越淡） */
const patternItems = computed(() => {
    // 头部可视区域约 360×200，以中心为原点铺棋盘格
    const half = 180;
    const cell = 36;
    const symbol = 28;
    const extent = 5;
    const items: { size: number; style: Record<string, string> }[] = [];
    const cx = half;
    const cy = 100;
    for (let row = -extent; row <= extent; row++) {
        for (let col = -extent; col <= extent; col++) {
            // 棋盘交错：放一个空一个，下一行错位
            if (((row + col) & 1) !== 0) continue;
            const x = col * cell;
            const y = row * cell * 0.9;
            const dist = Math.hypot(x, y);
            // 跳过正中心（留给 Model.Sticker 主体）
            if (dist < 12) continue;
            // 越靠边越透明
            const opacity = Math.max(0.12, 1 - (dist / half) * 0.75);
            items.push({
                size: symbol,
                style: {
                    width: `${symbol}px`,
                    height: `${symbol}px`,
                    left: `${cx + x - symbol / 2}px`,
                    top: `${cy + y - symbol / 2}px`,
                    opacity: opacity.toFixed(2),
                } as Record<string, string>,
            });
        }
    }
    return items;
});
</script>

<style scoped>
/* 光晕：absolute 200×200 居中（尺寸由 headerHaloStyle 内联给出） */
.gift-halo {
    position: absolute;
    pointer-events: none;
}

/* 背景图案层：铺满头部、裁剪溢出；整体半透明 */
.gift-pattern {
    position: absolute;
    inset: 0;
    overflow: hidden;
    opacity: 0.55;
}

.pattern-cell {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
}

.gift-dialog-enter-active,
.gift-dialog-leave-active {
    transition: opacity 0.16s ease;
}

.gift-dialog-enter-from,
.gift-dialog-leave-to {
    opacity: 0;
}
</style>
