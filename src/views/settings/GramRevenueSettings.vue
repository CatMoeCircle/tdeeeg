<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold flex-1 truncate">{{ t('gramRevenueSettings.title') }}</h2>
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                :disabled="loading" :title="t('gramRevenueSettings.refresh')" @click="load">
                <RefreshCwIcon class="w-4 h-4 text-gray-500" :class="{ 'animate-spin': loading }" />
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <div class="w-full max-w-2xl mx-auto pb-10">
                <p v-if="error" class="px-6 pt-4 text-xs text-red-500 break-words">{{ t('gramRevenueSettings.loadFailed', { error }) }}</p>

                <div v-if="loading" class="px-6 pt-6">
                    <LoadingSkeleton variant="list" :rows="6" :avatar="true" :label="t('gramRevenueSettings.loading')" />
                </div>

                <template v-else-if="!error">
                    <!-- 头部主视觉：居中 3D 钻石 → 大字未提现余额 → 累计收益/美元估值 → 提现与刷新 -->
                    <section class="relative px-6 pt-8 pb-6 text-center">
                        <div class="relative flex flex-col items-center">
                            <!-- 顶部 3D 钻石：与钱包卡同一颗蓝钻，可拖拽转向、静置自转 -->
                            <canvas ref="diamondEl" class="gram-diamond" :aria-label="t('gramRevenueSettings.title')"
                                @pointerdown="diamond.onPointerDown" @pointermove="diamond.onPointerMove"
                                @pointerup="diamond.onPointerUp" @pointercancel="diamond.onPointerUp" />
                            <!-- 大字显示未提现余额（可提现额常为 0，用它当主数字会把整页显示成 0） -->
                            <p class="mt-2 text-[32px] leading-10 font-bold tracking-tight text-gray-900 dark:text-gray-50 tabular-nums">
                                {{ formatGram(balanceNanograms, locale) }}
                            </p>
                            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ t('gramRevenueSettings.balanceLabel') }}</p>
                            <p class="mt-0.5 text-[13px] leading-snug text-gray-400 dark:text-gray-500">
                                {{ t('gramRevenueSettings.totalEarned', { value: formatGram(totalNanograms, locale) }) }}
                                <span v-if="balanceUsd"> · {{ t('gramRevenueSettings.usdEstimate', { value: balanceUsd }) }}</span>
                            </p>

                            <!-- 操作行：主按钮提现（withdrawal_enabled 才可点）/ 次按钮刷新 -->
                            <div class="mt-5 flex w-full items-stretch gap-2">
                                <button v-if="withdrawalEnabled" type="button"
                                    class="h-12 flex-1 rounded-xl bg-blue-500 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                                    @click="openWithdraw">
                                    {{ t('gramRevenueSettings.withdraw') }}
                                </button>
                                <button type="button"
                                    class="h-12 flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/60 disabled:opacity-50"
                                    :disabled="loading" @click="load">
                                    {{ t('gramRevenueSettings.refresh') }}
                                </button>
                            </div>
                            <p class="mt-3 flex items-center justify-center gap-1.5 text-[13px]"
                                :class="withdrawalEnabled ? 'text-emerald-500' : 'text-gray-400 dark:text-gray-500'">
                                <span class="w-1.5 h-1.5 rounded-full"
                                    :class="withdrawalEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'"></span>
                                {{ withdrawalEnabled ? t('gramRevenueSettings.withdrawalEnabled') : t('gramRevenueSettings.withdrawalDisabled') }}
                            </p>
                        </div>
                    </section>

                    <!-- 交易区：吸顶方向 Tabs + 交易列表项 -->
                    <div>
                        <div class="sticky top-0 z-20 bg-white/85 dark:bg-gray-900/85 backdrop-blur-xl px-4 py-2">
                            <div class="grid grid-cols-3 gap-1 rounded-2xl border border-gray-200/80 dark:border-gray-700/60 bg-gray-100/70 dark:bg-gray-800/70 p-1">
                                <button v-for="tab in TAB_ITEMS" :key="tab.id" type="button"
                                    class="h-8 rounded-xl text-[13px] transition-colors"
                                    :class="activeTab === tab.id
                                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-300 font-medium shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'"
                                    @click="activeTab = tab.id">
                                    {{ t(tab.key) }}
                                </button>
                            </div>
                        </div>

                        <div class="space-y-2 px-4 pt-3">
                            <p v-if="!rows.length" class="py-12 text-center text-xs text-gray-400">
                                {{ t('gramRevenueSettings.txEmpty') }}
                            </p>
                            <div v-for="row in rows" :key="row.id"
                                class="flex items-center gap-3 rounded-xl border border-gray-200/80 dark:border-gray-700/60 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-3 py-2.5">
                                <!-- 有对方（用户/频道）→ 对方头像；无对方 → 平台图标与交易类型文案 -->
                                <div v-if="row.pending" class="w-10 h-10 shrink-0 animate-pulse rounded-full bg-gray-200/80 dark:bg-gray-700/60" />
                                <Avatar v-else-if="row.avatar" :photo="row.avatar.photo" :title="row.avatar.title"
                                    :first-name="row.avatar.firstName" :last-name="row.avatar.lastName"
                                    :deleted-account="row.avatar.deleted"
                                    size-class="!w-10 !h-10" class="shrink-0" />
                                <div v-else class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="row.tone">
                                    <img v-if="row.iconSrc" :src="row.iconSrc" alt="" class="w-[22px] h-[22px] object-contain" :class="row.iconFilter" />
                                    <component v-else :is="row.iconComponent" class="w-5 h-5" />
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-[15px] font-medium leading-5 text-gray-900 dark:text-gray-100">
                                        {{ row.title }}
                                        <span v-if="row.refund"
                                            class="ml-1.5 inline-block rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 align-middle text-[10px] font-normal text-gray-500 dark:text-gray-300">
                                            {{ t('lng_channel_earn_history_return') }}
                                        </span>
                                    </p>
                                    <p class="mt-0.5 truncate text-[13px] leading-4 text-gray-400 dark:text-gray-500">{{ row.subtitle }}</p>
                                </div>
                                <span class="shrink-0 text-[15px] font-semibold tabular-nums"
                                    :class="row.positive ? 'text-emerald-500' : 'text-gray-700 dark:text-gray-300'">
                                    {{ row.delta }}
                                </span>
                            </div>

                            <div v-if="nextOffset" class="flex justify-center pt-1">
                                <BaseButton variant="ghost" size="sm" :disabled="loadingMore" @click="loadMore">
                                    {{ loadingMore ? t('gramRevenueSettings.loading') : t('lng_channel_earn_history_show_more', { count: PAGE_SIZE }) }}
                                </BaseButton>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <!-- 提现说明：当前 TDLib 版本没有 Gram 提现接口，只展示说明，不伪造提现动作 -->
        <ModalDialog v-model="withdrawOpen" :title="t('gramRevenueSettings.withdrawDialogTitle')">
            <div class="flex flex-col items-center py-1 text-center">
                <TgIcon name="gram-earnings" :size="64" :alt="t('gramRevenueSettings.withdrawDialogTitle')" />
                <p class="mt-3 text-sm leading-relaxed text-gray-800 dark:text-gray-100">
                    {{ t('gramRevenueSettings.withdrawDialogText') }}
                </p>
                <p class="mt-2 text-[13px] leading-snug text-gray-400 dark:text-gray-500">
                    {{ t('gramRevenueSettings.withdrawDialogHint') }}
                </p>
            </div>
            <template #footer>
                <BaseButton variant="ghost" size="sm" @click="withdrawOpen = false">{{ t('gramRevenueSettings.close') }}</BaseButton>
            </template>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    ChevronLeft as ChevronLeftIcon,
    RefreshCw as RefreshCwIcon,
    HelpCircle as HelpCircleIcon,
} from 'lucide-vue-next';
import type { Component } from 'vue';
import type {
    chatPhotoInfo,
    getTonTransactions as GetTonTransactionsRequest,
    gramRevenueStatistics,
    profilePhoto,
    tonTransaction,
} from 'tdlib-types';
import { tdlibSend } from '../../utils/session/tdlib';
import { isDark } from '../../store/settings/theme';
import { toast } from '../../utils/ui/toast';
import {
    ensureChat,
    ensureUser,
    getChatTitle,
    getDeletedAccountLabel,
    getReactiveChat,
    getReactiveUser,
    isDeletedChat,
    isDeletedUser,
} from '../../utils/profile/senderInfo';
import { useDiamondDrag } from '../../composables/useDiamondDrag';
import { PALETTE_BLUE } from '../../utils/diamond/palette';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import ModalDialog from '../../components/ui/modal/ModalDialog.vue';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import Avatar from '../../components/chat/avatar.vue';
import TgIcon from '../../components/common/TgIcon.vue';
import { TgDiamondIcon, TgGiftIcon } from '../../components/common/telegramIconComponents';
import {
    formatGram,
    formatGramUsd,
    parseNanogramAmount,
} from '../../utils/wallet/gramRevenue';
import {
    formatTonTransactionDate,
    formatTonTransactionDelta,
    tonTxInfo,
    type TonTxPlatform,
} from '../../utils/wallet/tonRevenue';
import fragmentPlatformIcon from '../../assets/icons/platform/fragment.svg';

const router = useRouter();
const { t, locale } = useI18n();

/** 每次分页拉取的交易条数 */
const PAGE_SIZE = 20;

const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const stats = ref<gramRevenueStatistics | null>(null);
const transactions = ref<tonTransaction[]>([]);
/** 下一页 offset；空串表示没有更多 */
const nextOffset = ref('');

/** 交易方向 Tab：全部 / 进账 / 出账，本地按 gram_amount 正负过滤，不重复请求 TDLib */
const activeTab = ref('all');
const TAB_ITEMS = [
    { id: 'all', key: 'lng_credits_summary_history_tab_full' },
    { id: 'incoming', key: 'lng_credits_summary_history_tab_in' },
    { id: 'outgoing', key: 'lng_credits_summary_history_tab_out' },
] as const;

/** 提现说明弹窗（TDLib 无 Gram 提现接口，只展示 Fragment 说明） */
const withdrawOpen = ref(false);

// ===== 顶部 3D 钻石（与钱包卡同一颗蓝钻） =====
const diamondEl = ref<HTMLCanvasElement | null>(null);
const diamond = useDiamondDrag({
    canvas: diamondEl,
    palette: PALETTE_BLUE,
    viewportGate: false,
    pressZoom: false,
    spin: true,
});

const totalNanograms = computed(() => parseNanogramAmount(stats.value?.status.total_amount));
const balanceNanograms = computed(() => parseNanogramAmount(stats.value?.status.balance_amount));
const usdRate = computed(() => stats.value?.usd_rate ?? 0);
const balanceUsd = computed(() => formatGramUsd(balanceNanograms.value, usdRate.value, locale.value));
const withdrawalEnabled = computed(() => !!stats.value?.status.withdrawal_enabled);

/**
 * 平台图标（无对方时）：fragment 用平台资源，礼物/钻石用仓库已有的语义图标，
 * 未知交易用问号。filter 只给黑色 glyph 做深色反色。
 */
const PLATFORM_ICONS: Record<TonTxPlatform, { src?: string; component?: Component; filter: string; tone: string }> = {
    fragment: { src: fragmentPlatformIcon, filter: 'dark:invert', tone: 'bg-violet-100 dark:bg-violet-500/15' },
    gift: { component: TgGiftIcon, filter: '', tone: 'bg-pink-100 dark:bg-pink-500/15' },
    diamond: { component: TgDiamondIcon, filter: '', tone: 'bg-sky-100 dark:bg-sky-500/15' },
    question: { component: HelpCircleIcon, filter: '', tone: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300' },
};

/** 列表头像展示模型 */
interface TxAvatarView {
    photo: profilePhoto | chatPhotoInfo | undefined;
    title: string;
    firstName: string;
    lastName: string;
    /** 已注销账户：用归档灰色头像，不显示首字母 */
    deleted: boolean;
}

/** 按当前 Tab 过滤后的交易（进账 = 金额 > 0，出账 = 金额 < 0） */
const filteredTransactions = computed(() => {
    if (activeTab.value === 'all') return transactions.value;
    const incoming = activeTab.value === 'incoming';
    return transactions.value.filter(tx => (tx.gram_amount > 0) === incoming);
});

/** 对方资料是否预热完成：未完成时行内先显示占位，避免瞬间闪成「未知」 */
const peersReady = ref(false);
/** 预热完成后强制重算 rows（响应式 Map 之外的兜底） */
const peerTick = ref(0);

/** 交易列表的展示模型：对方头像/平台图标、标题、副标题（类型/状态 · 时间）、带符号金额 */
const rows = computed(() =>
    filteredTransactions.value.map(tx => {
        const info = tonTxInfo(tx.type);
        let avatar: TxAvatarView | null = null;
        let counterpartyName = '';
        let pending = false;
        const deletedLabel = getDeletedAccountLabel();

        if (info.peer?.userId) {
            const user = getReactiveUser(info.peer.userId);
            if (user) {
                // 已注销/未知账户：头像走归档灰，名字用「已注销账户 + 用户 id」，不再显示未知
                const deleted = isDeletedUser(user);
                counterpartyName = deleted
                    ? deletedLabel + ' #' + user.id
                    : ([user.first_name, user.last_name].filter(Boolean).join(' ')
                        || user.usernames?.active_usernames?.[0] || '');
                avatar = {
                    photo: deleted ? undefined : (user.profile_photo ?? undefined),
                    title: counterpartyName,
                    firstName: deleted ? '' : (user.first_name ?? ''),
                    lastName: deleted ? '' : (user.last_name ?? ''),
                    deleted,
                };
            } else {
                // 资料还没到：先显示占位，加载完成后再出头像/名字（避免闪成未知）
                pending = !peersReady.value;
            }
        } else if (info.peer?.chatId) {
            const chat = getReactiveChat(info.peer.chatId);
            if (chat) {
                const deleted = isDeletedChat(chat);
                counterpartyName = deleted ? deletedLabel : getChatTitle(chat);
                avatar = {
                    photo: deleted ? undefined : (chat.photo ?? undefined),
                    title: counterpartyName,
                    firstName: '',
                    lastName: '',
                    deleted,
                };
            } else {
                pending = !peersReady.value;
            }
        }

        const visual = PLATFORM_ICONS[info.platform];
        const typeLabel = t(info.labelKey);
        const dateText = formatTonTransactionDate(tx.date, locale.value);
        const stateText = info.stateKey ? t(info.stateKey) : '';
        // 有对方或礼物名 → 标题用对方名/礼物名，副标题补类型文案；否则标题用类型文案，提现行副标题补状态
        const useCounterpartyTitle = !!avatar || !!info.giftTitle;
        const title = pending
            ? '…'
            : useCounterpartyTitle
                ? (avatar
                    ? (counterpartyName || t('gramRevenueSettings.tonTx.unsupported'))
                    : info.giftTitle || typeLabel)
                : typeLabel;
        const subtitle = pending
            ? ''
            : [useCounterpartyTitle ? typeLabel : stateText, dateText].filter(Boolean).join(' · ');
        // 读取一次 tick，保证预热完成（响应式 Map 写入之外）也会重算本行
        void peerTick.value;
        return {
            id: tx.id,
            pending,
            title,
            subtitle,
            delta: formatTonTransactionDelta(tx.gram_amount, locale.value),
            refund: tx.is_refund,
            positive: tx.gram_amount > 0,
            avatar,
            tone: visual.tone,
            iconSrc: visual.src ?? '',
            iconFilter: visual.filter,
            iconComponent: visual.component ?? HelpCircleIcon,
        };
    }),
);

function goBack() {
    router.back();
}

function openWithdraw() {
    withdrawOpen.value = true;
}

/** 预取交易里出现的用户 / 频道资料，头像与名字数据到了之后列表自动补上 */
async function prefetchPeers(list: tonTransaction[]): Promise<void> {
    peersReady.value = false;
    const jobs: Promise<void>[] = [];
    for (const tx of list) {
        const info = tonTxInfo(tx.type);
        if (!info.peer) continue;
        if (info.peer.userId) jobs.push(ensureUser(info.peer.userId));
        else if (info.peer.chatId) jobs.push(ensureChat(info.peer.chatId));
    }
    await Promise.allSettled(jobs);
    peersReady.value = true;
    peerTick.value += 1;
}

/**
 * getTonTransactions 请求。
 * direction 传 null 表示不筛选方向：类型文件标成可选，协议侧按必填补齐。
 */
function tonTransactionsRequest(offset: string): GetTonTransactionsRequest {
    return {
        _: 'getTonTransactions',
        direction: null,
        offset,
        limit: PAGE_SIZE,
    } as unknown as GetTonTransactionsRequest;
}

/** 拉取统计与首页交易（刷新 = 重置并重拉） */
async function load() {
    loading.value = true;
    error.value = '';
    try {
        const [statRes, txRes] = await Promise.all([
            tdlibSend({ _: 'getGramRevenueStatistics', is_dark: isDark.value }),
            tdlibSend(tonTransactionsRequest('')),
        ]);
        stats.value = statRes;
        transactions.value = txRes.transactions ?? [];
        nextOffset.value = txRes.next_offset ?? '';
        void prefetchPeers(transactions.value);
    } catch (e: any) {
        error.value = e?.message ?? String(e);
        stats.value = null;
        transactions.value = [];
        nextOffset.value = '';
    } finally {
        loading.value = false;
    }
}

/** 按 next_offset 追加下一页 */
async function loadMore() {
    if (!nextOffset.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
        const res = await tdlibSend(tonTransactionsRequest(nextOffset.value));
        transactions.value = [...transactions.value, ...res.transactions];
        nextOffset.value = res.next_offset ?? '';
        void prefetchPeers(res.transactions ?? []);
    } catch (e: any) {
        toast.error({ content: e?.message ?? String(e) });
    } finally {
        loadingMore.value = false;
    }
}

// 画布在 loading 结束后才渲染：ref 从 null 变为元素时再挂载，否则首帧拿不到 canvas
watch(diamondEl, (el) => {
    if (el) diamond.mount();
    else diamond.unmount();
});

onMounted(() => {
    if (diamondEl.value) diamond.mount();
    void load();
});

onBeforeUnmount(() => {
    diamond.unmount();
});
</script>

<style scoped>
/* 顶部 3D 钻石画布：真实渲染在共享 WebGL 上下文里，这块只是 2D 贴图 + 指针交互 */
.gram-diamond {
    width: 124px;
    height: 124px;
    touch-action: none;
    cursor: grab;
}
</style>
