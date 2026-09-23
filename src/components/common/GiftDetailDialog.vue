<template>
    <Teleport to="body">
        <Transition name="gift-dialog">
            <div v-if="open" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="gift-detail-title" @mousedown.self="emitClose">
                <div
                    class="w-90 max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-800 flex flex-col">
                    <!-- NFT 头部：渐变底 + 符号图案 + 标题 -->
                    <div v-if="isUpgraded" class="relative shrink-0 overflow-hidden px-6 pb-5 pt-4 text-center"
                        :style="headerBackdropStyle">
                        <div v-if="headerColors" class="gift-halo pointer-events-none absolute" :style="headerHaloStyle" />
                        <div v-if="symbolStickerMsg" class="gift-pattern pointer-events-none absolute inset-0">
                            <div v-for="(item, i) in patternItems" :key="i" class="pattern-cell" :style="item.style">
                                <MessageStickerContent :content="symbolStickerMsg" :size="item.size" />
                            </div>
                        </div>

                        <div class="relative z-10 flex items-center justify-end gap-1">
                            <button v-if="showMore" type="button" :aria-label="t('lng_context_menu_more')"
                                class="flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
                                @click="emitMore">
                                <MoreHorizontalIcon class="h-5 w-5" />
                            </button>
                            <button type="button" :aria-label="t('lng_close')"
                                class="flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
                                @click="emitClose">
                                <XIcon class="h-5 w-5" />
                            </button>
                        </div>

                        <div class="relative z-10 mx-auto flex h-36 items-center justify-center">
                            <MessageStickerContent :content="stickerContent" :size="144" />
                        </div>
                        <h2 id="gift-detail-title"
                            class="relative z-10 mt-1 text-2xl font-semibold text-white drop-shadow-sm">
                            <GlobalEmojiText :text="title" />
                        </h2>
                        <p v-if="subtitle" class="relative z-10 mt-0.5 text-sm text-white/85">
                            <GlobalEmojiText :text="subtitle" />
                        </p>
                    </div>

                    <!-- 普通礼物头部：白底 + 贴纸 + 标题说明 -->
                    <div v-else class="relative shrink-0 px-6 pb-4 pt-5 text-center">
                        <button type="button" :aria-label="t('lng_close')"
                            class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="emitClose">
                            <XIcon class="h-5 w-5" />
                        </button>
                        <div class="mx-auto flex h-36 items-center justify-center">
                            <MessageStickerContent :content="stickerContent" :size="144" />
                        </div>
                        <h2 id="gift-detail-title" class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                            <GlobalEmojiText :text="title" />
                        </h2>
                        <p v-if="description" class="mx-auto mt-1 max-w-sm text-sm text-gray-600 dark:text-gray-300">
                            <GlobalEmojiText :text="description" />
                        </p>
                    </div>

                    <!-- 信息表 + 说明区（两种礼物共用） -->
                    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-4" :class="isUpgraded ? 'pt-4' : 'pt-0'">
                        <div class="overflow-hidden rounded-lg border border-gray-200 text-left text-sm dark:border-gray-600">
                            <template v-for="(row, ri) in tableRows" :key="ri">
                                <!-- 带标签的行 -->
                                <div v-if="row.label" class="flex min-h-12 border-b border-gray-200 last:border-b-0 dark:border-gray-600">
                                    <div
                                        class="flex w-20 shrink-0 items-center bg-gray-50 px-3 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                        {{ row.label }}
                                    </div>
                                    <div class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
                                        :class="row.accent ? 'text-[#168acd] dark:text-sky-400' : 'text-gray-800 dark:text-gray-100'">
                                        <!-- 对方头像 -->
                                        <template v-if="row.kind === 'party' && row.party">
                                            <div class="flex h-7 w-7 shrink-0 overflow-hidden rounded-full">
                                                <Avatar :photo="row.party.photo" :title="row.party.name"
                                                    :accent-color-id="row.party.accentColorId" />
                                            </div>
                                            <span class="truncate font-medium">
                                                <GlobalEmojiText :text="row.party.name" />
                                            </span>
                                        </template>
                                        <!-- 星星价值 -->
                                        <template v-else-if="row.kind === 'stars'">
                                            <span class="text-xl leading-none">⭐</span>
                                            <span>{{ row.value }}</span>
                                        </template>
                                        <!-- 带稀有度徽章 -->
                                        <template v-else-if="row.kind === 'attr'">
                                            <span class="shrink-0">
                                                <GlobalEmojiText :text="row.value || ''" />
                                            </span>
                                            <span v-if="row.rarity"
                                                class="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium leading-none text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                                                {{ row.rarity }}
                                            </span>
                                        </template>
                                        <!-- 价值 + 了解更多 -->
                                        <template v-else-if="row.kind === 'value'">
                                            <span class="shrink-0">{{ row.value }}</span>
                                            <button v-if="row.learnMore" type="button"
                                                class="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium leading-none text-sky-700 hover:bg-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:hover:bg-sky-500/30"
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
                                    class="flex min-h-12 items-center border-b border-gray-200 bg-gray-50/80 px-3 py-2 last:border-b-0 dark:border-gray-600 dark:bg-gray-700/40">
                                    <span class="min-w-0 text-gray-800 dark:text-gray-100">
                                        <FormattedTextInline v-if="row.formattedText" :formattedText="row.formattedText"
                                            :size="emojiSize" />
                                        <GlobalEmojiText v-else :text="row.value || ''" />
                                    </span>
                                </div>
                            </template>
                        </div>

                        <p v-if="footer" class="mt-4 text-sm text-gray-500 dark:text-gray-400">
                            <GlobalEmojiText :text="footer" />
                        </p>
                    </div>

                    <div class="shrink-0 border-t border-gray-200 bg-gray-50 px-7 py-5 dark:border-gray-700 dark:bg-gray-900/40">
                        <button type="button"
                            class="w-full rounded-lg bg-[#2e9cd3] py-2.5 text-base font-medium text-white hover:bg-[#278cc0] focus:outline-none focus:ring-2 focus:ring-sky-400/60"
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
import { intToRgb, rgbToCss } from '../../store/colors';
import type { GiftDetailData, GiftDetailRow } from '../../utils/giftDetail';

const { t } = useI18n();

const props = withDefaults(defineProps<{
    open: boolean;
    data: GiftDetailData | null;
    /** 说明区自定义 emoji 尺寸 */
    emojiSize?: number;
}>(), {
    emojiSize: 18,
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
    return {
        inset: '0',
        background: `radial-gradient(rgb(${c.join(',')}) 0%, rgb(${e.join(',')}) 55%)`,
    };
});

/** 符号图案：绕中心棋盘格铺开，边缘更淡 */
const patternItems = computed(() => {
    const width = 360;
    const height = 220;
    const cx = width / 2;
    const cy = height * 0.42;
    const cell = 32;
    const symbol = 24;
    const items: { size: number; style: Record<string, string> }[] = [];
    for (let row = -4; row <= 4; row++) {
        for (let col = -8; col <= 8; col++) {
            if (((row + col) & 1) !== 0) continue;
            const x = col * cell;
            const y = row * cell;
            const dist = Math.hypot(x, y * 1.4);
            if (dist < 8) continue;
            const opacity = Math.max(0.06, 1 - (dist / 160) * 0.85);
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
.gift-halo {
    position: absolute;
    pointer-events: none;
}

.gift-pattern {
    overflow: hidden;
    opacity: 0.35;
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
