<template>
    <div class="min-w-57.5 max-w-[320px] select-text">
        <!-- 1. 居中 图标 + 标题 + 奖品 + 获奖说明 -->
        <div class="flex flex-col items-center">
            <MessageStickerContent v-if="stickerContent" :content="stickerContent" :size="112" class="shrink-0" />
            <div v-else class="flex h-28 w-28 shrink-0 items-center justify-center rounded-full" :style="iconStyle">
                <GiftIcon v-if="isPremium" class="h-14 w-14 text-white" />
                <StarIcon v-else class="h-14 w-14 fill-current text-white" />
            </div>
            <h3 class="mt-3 text-base font-bold text-gray-900 dark:text-white">获奖者已选出</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ winnersText }}</p>
            <p v-if="prizeDescription" class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{{
                prizeDescription }}</p>
        </div>

        <!-- 获奖者 -->
        <div class="mt-3">
            <div class="px-3 py-2.5 text-center">
                <div class="text-base font-medium text-gray-500 dark:text-gray-400">获奖者</div>
                <div v-if="winners.length" class="mt-2 space-y-1.5">
                    <div v-for="w in winners" :key="w.id"
                        class="mx-auto flex w-fit items-center gap-1.5 rounded-full pr-3" :style="winnerRowStyle(w)">
                        <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                            <Avatar :photo="w.photo" :title="w.name" :accent-color-id="w.accentColorId" />
                        </div>
                        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ w.name }}</span>
                    </div>
                </div>
                <p v-else-if="winnersLoading" class="mt-1 text-sm text-gray-500 dark:text-gray-400">加载中...</p>
                <p v-else class="mt-1 text-sm text-gray-500 dark:text-gray-400">暂无获奖者</p>
            </div>
        </div>

        <!-- 所有获奖者已收到礼物 -->
        <div class="mt-2">
            <div class="px-3 py-2.5 text-center">
                <div class="text-base font-medium text-gray-500 dark:text-gray-400">所有获奖者都已收到 {{ prizeText }}</div>
            </div>
        </div>

        <!-- 了解更多的按键 -->
        <div class="mt-3">
            <button type="button"
                class="mx-auto block w-[calc(100%-10px)] rounded-[5px] bg-sky-100 px-6 py-1.5 text-center text-sm font-medium text-sky-800 shadow-sm hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300/60 dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60">
                了解更多
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { GiftIcon, StarIcon } from 'lucide-vue-next';
import type { message, messageGiveaway, messageGiveawayWinners, messageSticker, profilePhoto, sticker, user } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';
import { accentColorStyle } from '../../../../store/colors';
import Avatar from '../../avatar.vue';
import MessageStickerContent from './MessageStickerContent.vue';

interface WinnerUser {
    id: number;
    name: string;
    photo?: profilePhoto;
    accentColorId?: number;
}

type GiveawayWinnersWithSticker = messageGiveawayWinners & { sticker?: sticker };

const props = defineProps<{
    content: messageGiveawayWinners;
    messageList?: message[];
}>();

const winners = ref<WinnerUser[]>([]);
const winnersLoading = ref(false);
const giveawayContent = ref<messageGiveaway | null>(null);
const stickerContent = ref<messageSticker | null>(null);
const userCache = new Map<number, user>();

const numberFormatter = new Intl.NumberFormat('zh-CN');
const formatCount = (count: number) => numberFormatter.format(count);

/** 是否为 Telegram Premium 抽奖（否则为 Stars 抽奖） */
const isPremium = computed(() => props.content.prize._ === 'giveawayPrizePremium');

/** 图标渐变：Premium 用紫罗兰礼物，Stars 用琥珀星星 */
const iconStyle = computed(() => ({
    background: isPremium.value
        ? 'linear-gradient(135deg, #9a7bff, #6560f6)'
        : 'linear-gradient(135deg, #ffc24d, #ff8f00)',
}));

/** 获奖者行样式：按用户主题色生成浅色背景与文字色，不同用户颜色不同 */
function winnerRowStyle(w: WinnerUser): Record<string, string> {
    const s = accentColorStyle(w.accentColorId ?? 5);
    return { background: s.soft, color: s.color };
}

/** 附加奖品描述（prize_description） */
const prizeDescription = computed(() => props.content.prize_description?.trim() || '');

/** 奖品名称：Stars 数量或 Premium 月数 */
const prizeText = computed(() => {
    const prize = props.content.prize;
    if (prize._ === 'giveawayPrizeStars') {
        return `${formatCount(prize.star_count)} 星星`;
    }
    return `Telegram Premium ${prize.month_count} 个月`;
});

/** 获奖人数与奖品说明 */
const winnersText = computed(() => {
    const prize = props.content.prize;
    const count = props.content.winner_count;
    if (prize._ === 'giveawayPrizeStars') {
        return `Telegram 已随机选出 ${count} 位获奖者`;
    }
    return `Telegram 已随机选出 ${count} 位获奖者获`;
});


function displayUserName(value: user): string {
    return `${value.first_name} ${value.last_name}`.trim() || `用户 #${value.id}`;
}

async function resolveWinner(id: number): Promise<WinnerUser | undefined> {
    let value = userCache.get(id);
    if (!value) {
        try {
            value = await tdlibSend({ _: 'getUser', user_id: id }) as user;
            userCache.set(id, value);
        } catch {
            return undefined;
        }
    }

    return {
        id,
        name: displayUserName(value),
        photo: value.profile_photo,
        accentColorId: value.accent_color_id,
    };
}

async function loadWinners() {
    winnersLoading.value = true;
    const ids = [...new Set(props.content.winner_user_ids.filter((id) => id > 0))];
    const results = await Promise.all(ids.map((id) => resolveWinner(id)));
    winners.value = results.filter((w): w is WinnerUser => !!w);
    winnersLoading.value = false;
}

function applyGiveaway(content: messageGiveaway | undefined) {
    giveawayContent.value = content ?? null;
    setSticker(content?.sticker);
}

function setSticker(value?: sticker | null) {
    stickerContent.value = value
        ? { _: 'messageSticker', sticker: value, is_premium: false }
        : null;
}

function findGiveawayInMessageList(): messageGiveaway | undefined {
    const id = props.content.giveaway_message_id;
    const found = props.messageList?.find((m) => m.id === id);
    return found?.content?._ === 'messageGiveaway' ? found.content : undefined;
}

/** 图标优先沿用原抽奖消息的贴纸，缺失时回退到渐变图标 */
async function loadGiveaway() {
    setSticker((props.content as GiveawayWinnersWithSticker).sticker);

    const cached = findGiveawayInMessageList();
    if (cached) {
        applyGiveaway(cached);
        return;
    }

    const chatId = props.content.boosted_chat_id;
    const messageId = props.content.giveaway_message_id;
    if (chatId > 0 && messageId > 0) {
        try {
            const result = await tdlibSend({
                _: 'getMessage',
                chat_id: chatId,
                message_id: messageId,
            }) as unknown as message;
            if (result?.content?._ === 'messageGiveaway') {
                applyGiveaway(result.content);
            }
        } catch {
            // 原抽奖消息可能已删除，继续使用中奖结果消息自身的奖品信息
        }
    }
}

watch(() => props.content, () => {
    void loadGiveaway();
    void loadWinners();
}, { immediate: true });

watch(() => props.messageList, () => {
    if (!giveawayContent.value) void loadGiveaway();
});
</script>
