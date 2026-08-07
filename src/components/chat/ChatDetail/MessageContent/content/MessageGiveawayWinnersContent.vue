<template>
    <div class="min-w-57.5 max-w-[320px] select-text">
        <!-- 1. 居中 图标 + 标题 + 奖品 + 获奖说明 -->
        <div class="flex flex-col items-center">
            <MessageStickerContent v-if="stickerContent" :content="stickerContent" :size="112" class="shrink-0" />
            <!-- 无纪念贴纸时，播放本地 party.tgs 抽奖动画（只播一次，点击可重播） -->
            <div v-else ref="partyLottieRef" class="h-28 w-28 shrink-0 cursor-pointer overflow-hidden"
                @click="onPartyClick"></div>
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
                class="mx-auto block w-[calc(100%-10px)] rounded-[5px] px-6 py-1.5 text-center text-sm font-medium shadow-sm transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                :style="learnMoreStyle">
                了解更多
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { message, messageGiveaway, messageGiveawayWinners, messageSticker, profilePhoto, sticker, user } from 'tdlib-types';
import { tdlibSend } from '../../../../../utils/tdlib';
import { accentColorStyle } from '../../../../../store/colors';
import { useLottiePause } from '../../../../../composables/useLottiePause';
import lottie, { type AnimationItem } from 'lottie-web';
import * as pako from 'pako';
import Avatar from '../../../avatar.vue';
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

/** 本地 party.tgs（抽奖庆祝动画）资源 URL */
const PARTY_TGS_URL = new URL('../../../../assets/party.tgs', import.meta.url).href;

const partyLottieRef = ref<HTMLElement | null>(null);
let partyAnim: AnimationItem | null = null;

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerPartyAnim, get: getPartyAnim, setup: setupPartyPause } = useLottiePause(partyLottieRef);

function destroyPartyAnim() {
    if (partyAnim) {
        partyAnim.destroy();
        partyAnim = null;
    }
}

/** 加载本地 party.tgs（gzipped Lottie JSON），只播一次 */
async function loadPartyAnimation() {
    destroyPartyAnim();
    if (!partyLottieRef.value) return;
    try {
        const resp = await fetch(PARTY_TGS_URL);
        const compressed = new Uint8Array(await resp.arrayBuffer());

        // 解压 gzip
        let jsonStr: string;
        try {
            jsonStr = new TextDecoder('utf-8').decode(pako.inflate(compressed));
        } catch {
            jsonStr = new TextDecoder('utf-8').decode(compressed);
        }

        const animData = JSON.parse(jsonStr);

        await nextTick();
        if (!partyLottieRef.value) return;

        partyAnim = lottie.loadAnimation({
            container: partyLottieRef.value,
            renderer: 'svg',
            loop: false,
            autoplay: true,
            animationData: animData,
        });
        registerPartyAnim(partyAnim);
    } catch (e) {
        console.error('Failed to load party.tgs:', e);
    }
}

/** 点击时从头重播（只播一次，播放完停在最后一帧） */
function onPartyClick() {
    const anim = getPartyAnim();
    if (!anim) return;
    // 若因窗口失焦/离开视口被暂停，重播不受影响
    anim.stop();
    anim.play();
}

onMounted(() => {
    setupPartyPause();
    // 挂载后 DOM 已就绪，尝试播放 party.tgs（无贴纸时 v-else 分支已渲染）
    loadPartyAnimation();
});

onUnmounted(() => {
    destroyPartyAnim();
});

// 贴纸来源变化时（如有/无纪念贴纸）同步刷新 party 动画
watch(stickerContent, () => {
    nextTick(() => loadPartyAnimation());
});

/** 获奖者行样式：按用户主题色生成浅色背景与文字色，不同用户颜色不同 */
function winnerRowStyle(w: WinnerUser): Record<string, string> {
    const s = accentColorStyle(w.accentColorId ?? 5);
    return { background: s.soft, color: s.color };
}

/** 了解更多按键：配色跟随 TDLib 主题 accent 色（默认蓝 5），明暗主题自适应 */
const learnMoreStyle = computed(() => {
    const s = accentColorStyle(5);
    return { backgroundColor: s.soft, color: s.color };
});

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
