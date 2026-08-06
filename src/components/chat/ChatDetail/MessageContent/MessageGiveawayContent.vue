<template>
    <div class="min-w-57.5 max-w-[320px] select-text">
        <!-- 1. 居中 图标 + 标题 + 奖品 + 获奖说明 -->
        <div class="flex flex-col items-center">
            <MessageStickerContent v-if="stickerContent" :content="stickerContent" :size="112" class="shrink-0" />
            <div v-else class="flex h-28 w-28 shrink-0 items-center justify-center rounded-full" :style="iconStyle">
                <GiftIcon v-if="isPremium" class="h-14 w-14 text-white" />
                <StarIcon v-else class="h-14 w-14 fill-current text-white" />
            </div>
            <h3 class="mt-3 text-base font-bold text-gray-900 dark:text-white">抽奖活动</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ winnersText }}</p>
            <p v-if="prizeDescription" class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{{
                prizeDescription }}</p>
        </div>

        <!-- 参与者 -->
        <div class="mt-3">
            <div class="px-3 py-2.5 text-center">
                <div class="text-base font-medium text-gray-500 dark:text-gray-400">参与者</div>
                <div class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ participantsText }}</div>
                <div v-if="channels.length" class="mt-2 space-y-1.5">
                    <div v-for="ch in channels" :key="ch.id"
                        class="mx-auto flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5"
                        :style="channelRowStyle(ch)">
                        <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                            <Avatar :photo="ch.photo" :title="ch.title" :accent-color-id="ch.accentColorId" />
                        </div>
                        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ ch.title }}</span>
                    </div>
                </div>

            </div>
        </div>

        <!-- 活动时间 -->
        <div class="mt-2">
            <div class="px-3 py-2.5 text-center">
                <div class="text-base font-medium text-gray-500 dark:text-gray-400">抽奖活动结束时间</div>
                <div class="mt-1 text-sm text-gray-800 dark:text-gray-100">{{ dateText }}</div>
            </div>
        </div>

        <!-- 了解更多的按键 -->
        <div class="mt-3">
            <button type="button"
                class="mx-auto block w-[calc(100%-10px)] rounded-[5px] bg-sky-100 px-6 py-1.5 text-center text-sm font-medium text-sky-800 shadow-sm hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300/60 dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60"
                @click="openDetails">
                了解更多
            </button>
        </div>
    </div>

    <Teleport to="body">
        <Transition name="giveaway-dialog">
            <div v-if="detailsOpen"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="giveaway-dialog-title" @mousedown.self="closeDetails">
                <div
                    class="w-105 max-w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1d1d1d]">
                    <div class="relative px-6 pb-5 pt-5">
                        <button type="button" aria-label="关闭"
                            class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                            @click="closeDetails">
                            <XIcon class="h-5 w-5" />
                        </button>
                        <h2 id="giveaway-dialog-title"
                            class="text-center text-2xl font-semibold text-gray-900 dark:text-white">
                            {{ dialogTitle }}
                        </h2>
                        <div class="mt-4 space-y-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                            <p>{{ sponsorText }}</p>
                            <p>{{ selectionText }}</p>
                            <p>您在此抽奖活动中没有中奖。</p>
                        </div>
                        <button type="button"
                            class="mt-5 block w-full rounded-lg bg-sky-500/10 py-2 text-center text-sm font-medium text-sky-600 hover:bg-sky-500/20 focus:outline-none focus:ring-2 focus:ring-sky-400/40 active:bg-sky-500/25 dark:bg-sky-400/10 dark:text-sky-300 dark:hover:bg-sky-400/20"
                            @click="closeDetails">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { GiftIcon, StarIcon, XIcon } from 'lucide-vue-next';
import type { chat, chatPhotoInfo, messageGiveaway, messageSticker } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';
import { useChatStore } from '../../../../store/chat';
import { accentColorStyle } from '../../../../store/colors';
import Avatar from '../../avatar.vue';
import MessageStickerContent from './MessageStickerContent.vue';

interface GiveawayChannel {
    id: number;
    title: string;
    photo?: chatPhotoInfo;
    accentColorId?: number;
}

const props = defineProps<{
    content: messageGiveaway;
    date?: number;
}>();

const detailsOpen = ref(false);
const channels = ref<GiveawayChannel[]>([]);
const chatStore = useChatStore();

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

/** 频道行样式：按频道主题色生成浅色背景与文字色，不同频道颜色不同 */
function channelRowStyle(ch: GiveawayChannel): Record<string, string> {
    const s = accentColorStyle(ch.accentColorId ?? 5);
    return { background: s.soft, color: s.color };
}

/** 消息自带的礼物贴纸（图标），可能缺失；缺失时回退到渐变图标 */
const stickerContent = computed<messageSticker | null>(() => {
    if (!props.content.sticker) return null;
    return { _: 'messageSticker', sticker: props.content.sticker, is_premium: false };
});

/** 奖品信息 */
const prizeText = computed(() => {
    const prize = props.content.prize;
    if (prize._ === 'giveawayPrizeStars') return `${formatCount(prize.star_count)} Stars`;
    return `Telegram Premium ${prize.month_count} 个月`;
});

/** 附加奖品描述（prize_description） */
const prizeDescription = computed(() => props.content.parameters.prize_description?.trim() || '');

/** 获奖人数说明 */
const winnersText = computed(() => {
    const prize = props.content.prize;
    const count = props.content.winner_count;
    if (prize._ === 'giveawayPrizeStars') {
        return `${formatCount(prize.star_count)} Stars 位获奖者将分享 ${count} `;
    }
    return `${count} 位获奖者将获得 Telegram Premium ${prize.month_count} 个月`;
});

/** 参与者（参与资格说明） */
const participantsText = computed(() => `频道所有成员:`);

/** 活动时间（开奖时间） */
const selectionDate = computed(() => props.content.parameters.winners_selection_date || props.date || 0);

const dateText = computed(() => {
    if (!selectionDate.value) return '未知';
    const d = new Date(selectionDate.value * 1000);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const datePart = sameYear
        ? `${d.getMonth() + 1}月${d.getDate()}日`
        : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    const timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${datePart} ${timePart} 开奖`;
});

/** 抽奖状态标题（弹窗用） */
const dialogTitle = computed(() => {
    if (!selectionDate.value) return '抽奖活动';
    return selectionDate.value * 1000 <= Date.now() ? '抽奖活动已结束' : '抽奖活动进行中';
});

/** 主频道（发起抽奖的频道，即参与频道列表第一个） */
const mainChannel = computed(() => channels.value[0]);

const additionalCount = computed(() => props.content.parameters.additional_chat_ids?.length ?? 0);

/** 奖品英文名（弹窗文案用） */
const prizeNameEn = computed(() => {
    const prize = props.content.prize;
    if (prize._ === 'giveawayPrizeStars') return `${formatCount(prize.star_count)} Stars`;
    return `Telegram Premium ${prize.month_count} 个月`;
});

/** 弹窗：赞助方说明 */
const sponsorText = computed(() => {
    const name = mainChannel.value?.title?.trim() || '本频道';
    return `This giveaway was sponsored by the admins of ${name} who acquired ${prizeNameEn.value} for its followers.`;
});

/** 弹窗：开奖机制说明 */
const selectionText = computed(() => {
    const count = props.content.winner_count;
    const main = mainChannel.value?.title?.trim() || '本频道';
    const additional = additionalCount.value;
    const date = selectionDate.value ? formatSelectionDate(selectionDate.value) : '开奖时间';
    const joined = additional > 0 ? `和 ${additional} 其他频道` : '';
    return `在${date}, Telegram将随机选择${count}位成员,已订阅${main}频道${joined}。`;
});

function formatSelectionDate(ts: number): string {
    const d = new Date(ts * 1000);
    return `${d.getMonth() + 1}月${d.getDate()}`;
}

async function resolveChannel(chatId: number): Promise<GiveawayChannel | undefined> {
    let chat: chat | undefined = chatStore.chats[chatId] as chat | undefined;
    if (!chat) {
        try {
            chat = await tdlibSend({ _: 'getChat', chat_id: chatId }) as unknown as chat;
        } catch {
            return undefined;
        }
    }
    if (!chat) return undefined;

    return {
        id: chatId,
        title: chat.title?.trim() || `频道 #${chatId}`,
        photo: chat.photo,
        accentColorId: chat.accent_color_id,
    };
}

async function loadChannels() {
    const params = props.content.parameters;
    const ids = [params.boosted_chat_id, ...(params.additional_chat_ids ?? [])];
    const results = await Promise.all(ids.map((id) => resolveChannel(id)));
    channels.value = results.filter((c): c is GiveawayChannel => !!c);
}

function openDetails() {
    detailsOpen.value = true;
}

function closeDetails() {
    detailsOpen.value = false;
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && detailsOpen.value) closeDetails();
}

watch(() => props.content, loadChannels, { immediate: true });
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.giveaway-dialog-enter-active,
.giveaway-dialog-leave-active {
    transition: opacity 0.16s ease;
}

.giveaway-dialog-enter-from,
.giveaway-dialog-leave-to {
    opacity: 0;
}
</style>
