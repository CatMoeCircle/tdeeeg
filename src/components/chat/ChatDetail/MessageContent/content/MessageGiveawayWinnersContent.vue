<template>
    <div ref="rootEl" class="min-w-57.5 max-w-[320px] select-text">
        <!-- 1. 居中 图标 + 标题 + 奖品 + 获奖说明 -->
        <div class="flex flex-col items-center">
            <MessageStickerContent v-if="stickerContent" :content="stickerContent" :size="112" class="shrink-0" />
            <!-- 无纪念贴纸时，播放本地 party.tgs 抽奖动画（只播一次，点击可重播） -->
            <RlottiePlayer v-else-if="partyTgsData" ref="partyPlayerRef" :src="partyTgsData" :loop="false"
                :autoplay="true" :width="partyRenderSize" :height="partyRenderSize"
                :class="['h-28 w-28 shrink-0 cursor-pointer overflow-hidden', partyHiResClass]" :style="partyHiResStyle"
                @click="onPartyClick" @load="onPartyLoad"></RlottiePlayer>
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
                        class="mx-auto flex w-fit cursor-pointer items-center gap-1.5 rounded-full pr-3 transition-opacity hover:opacity-80"
                        :style="winnerRowStyle(w)" @click="openUserProfile(w.id)">
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
            <button type="button" @click="openDetails"
                class="mx-auto block w-[calc(100%-10px)] rounded-[5px] px-6 py-1.5 text-center text-sm font-medium shadow-sm transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                :style="learnMoreStyle">
                了解更多
            </button>
        </div>
    </div>

    <!-- 了解更多：抽奖结果详情弹窗 -->
    <Teleport to="body">
        <Transition name="giveaway-dialog">
            <div v-if="detailsOpen"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="giveaway-winners-dialog-title"
                @mousedown.self="closeDetails">
                <div
                    class="w-105 max-w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1d1d1d]">
                    <div class="relative px-6 pb-5 pt-5">
                        <button type="button" aria-label="关闭"
                            class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                            @click="closeDetails">
                            <XIcon class="h-5 w-5" />
                        </button>
                        <h2 id="giveaway-winners-dialog-title"
                            class="text-center text-2xl font-semibold text-gray-900 dark:text-white">
                            抽奖活动已结束
                        </h2>
                        <div class="mt-4 space-y-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                            <!-- 中奖状态（灰色背景框） -->
                            <div class="rounded-xl px-4 py-3 text-center text-sm font-medium" :class="statusBoxClass"
                                :style="statusBoxStyle">
                                {{ statusText }}
                            </div>
                            <p>
                                此次抽奖活动由
                                <span class="font-semibold text-gray-900 dark:text-white">
                                    <GlobalEmojiText :text="sponsorName" />
                                </span>
                                的管理员赞助，他们已为其成员准备了
                                <span class="font-semibold text-gray-900 dark:text-white">{{ prizeText }}</span>。
                            </p>
                            <p>
                                Telegram 于
                                <span class="font-semibold text-gray-900 dark:text-white">{{ selectionDateText }}</span>
                                自动选择了已加入
                                <span class="font-semibold text-gray-900 dark:text-white">
                                    <GlobalEmojiText :text="sponsorName" />
                                </span>
                                的
                                <span class="font-semibold text-gray-900 dark:text-white">{{
                                    formatCount(props.content.winner_count) }}</span>
                                位随机用户
                            </p>
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
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { XIcon } from 'lucide-vue-next';
import type { chat, message, messageGiveaway, messageGiveawayWinners, messageSticker, profilePhoto, sticker, user } from 'tdlib-types';
import { tdlibSend } from '../../../../../utils/tdlib';
import { accentColorStyle } from '../../../../../store/colors';
import { useChatStore } from '../../../../../store/chat';
import { useUserStore } from '../../../../../store/user';
import { useLottiePause } from '../../../../../composables/useLottiePause';
import { useRlottieRenderSize } from '../../../../../composables/useRlottieRenderSize';
import { RlottiePlayer, type RlottiePlayerInstance } from 'rlottie-wasm-vue-player';
import * as pako from 'pako';
import Avatar from '../../../avatar.vue';
import GlobalEmojiText from '../../../../common/GlobalEmojiText.vue';
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
const PARTY_TGS_URL = new URL('../../../../../assets/party.tgs', import.meta.url).href;

const rootEl = ref<HTMLElement | null>(null);
const partyPlayerRef = ref<RlottiePlayerInstance | null>(null);
/** 解析后的 party TGS Lottie JSON（字符串形式，作为 RlottiePlayer 的 src） */
const partyTgsData = ref<string | null>(null);

/** party 动画目标显示边长（100px） */
const partySize = computed(() => 112);
/** 超采样渲染尺寸与显示样式（本地 party.tgs，仅抽奖结果弹出时短暂播放；走默认极低质量以保持速率一致） */
const { renderSize: partyRenderSize, hiResStyle: partyHiResStyle, hiResClass: partyHiResClass } = useRlottieRenderSize(partySize);

/** 统一的 Lottie 暂停/恢复控制器：视口离开、窗口失焦、平滑滚动时暂停 */
const { register: registerPartyAnim, get: getPartyAnim, setup: setupPartyPause } = useLottiePause(rootEl);

/** RlottiePlayer 加载完成回调：把实例注册进暂停/恢复控制器 */
function onPartyLoad() {
    registerPartyAnim(partyPlayerRef.value);
}

/** 加载本地 party.tgs（gzipped Lottie JSON），只播一次 */
async function loadPartyAnimation() {
    try {
        // 清空旧数据使 RlottiePlayer 卸载重建
        partyTgsData.value = null;
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
        // RlottiePlayer 的 src 接受 stringified JSON（不以 http / 开头会被当作 JSON 串处理）
        partyTgsData.value = JSON.stringify(animData);
    } catch (e) {
        console.error('Failed to load party.tgs:', e);
    }
}

/** 点击时从头重播（只播一次，播放完停在最后一帧） */
function onPartyClick() {
    const anim = getPartyAnim();
    if (!anim) return;
    // 若因窗口失焦/离开视口被暂停，重播不受影响
    anim.stop?.();
    anim.play();
}

onMounted(() => {
    setupPartyPause();
    // 挂载后 DOM 已就绪，尝试播放 party.tgs（无贴纸时 v-else 分支已渲染）
    loadPartyAnimation();
    window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => window.removeEventListener('keydown', onKeydown));

// 贴纸来源变化时（如有/无纪念贴纸）同步刷新 party 动画
watch(stickerContent, () => {
    // 没有纪念贴纸时才渲染 party 动画；否则卸载并清空
    if (stickerContent.value) {
        partyTgsData.value = null;
        registerPartyAnim(null);
    } else {
        nextTick(() => loadPartyAnimation());
    }
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

/* ---------- 了解更多详情弹窗 ---------- */

const chatStore = useChatStore();
const userStore = useUserStore();
const router = useRouter();
const detailsOpen = ref(false);

/** 点击获奖者行 → 打开该用户的个人资料页 */
function openUserProfile(userId: number) {
    router.push({ name: 'user-profile', params: { id: String(userId) } });
}
/** 赞助频道名称（boosted_chat_id 对应频道），由 TG 返回的 chat.title 决定 */
const sponsorName = ref('');

/** 是否当前用户中奖（依据中奖结果消息的 winner_user_ids） */
const isCurrentUserWinner = computed(() => {
    const myId = userStore.userProfile?.id;
    return !!myId && props.content.winner_user_ids.includes(myId);
});

/** 中奖状态提示文本：未中奖时显示灰色背景框文案 */
const statusText = computed(() =>
    isCurrentUserWinner.value ? '恭喜您在此次抽奖活动中获奖' : '您在本次抽奖中没有获奖',
);

/** 中奖状态框：中奖用主题色浅背景，未中奖用灰色背景 */
const statusBoxClass = computed(() =>
    isCurrentUserWinner.value ? '' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
);
const statusBoxStyle = computed<Record<string, string> | undefined>(() => {
    if (!isCurrentUserWinner.value) return undefined;
    const s = accentColorStyle(5);
    return { backgroundColor: s.soft, color: s.color };
});

/** 开奖日期（actual_winners_selection_date），如“5月10日” */
const selectionDateText = computed(() => {
    const ts = props.content.actual_winners_selection_date;
    if (!ts) return '未知时间';
    const d = new Date(ts * 1000);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
});

/** 加载赞助频道名称（TG 返回的 chat.title） */
async function loadSponsor() {
    const chatId = props.content.boosted_chat_id;
    if (!chatId) return;
    let chat: chat | undefined = chatStore.chats[chatId] as chat | undefined;
    if (!chat) {
        try {
            chat = await tdlibSend({ _: 'getChat', chat_id: chatId }) as unknown as chat;
        } catch {
            return;
        }
    }
    sponsorName.value = chat?.title?.trim() || `频道 #${chatId}`;
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

/** 仅使用中奖结果消息自带的纪念贴纸（通常没有）；缺失时播放本地 party.tgs 抽奖动画 */
async function loadGiveaway() {
    setSticker((props.content as GiveawayWinnersWithSticker).sticker);

    const cached = findGiveawayInMessageList();
    if (cached) {
        applyGiveaway(cached);
        return;
    }

    const chatId = props.content.boosted_chat_id;
    const messageId = props.content.giveaway_message_id;
    if (chatId && messageId > 0) {
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
    void loadSponsor();
}, { immediate: true });

watch(() => props.messageList, () => {
    if (!giveawayContent.value) void loadGiveaway();
});
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
