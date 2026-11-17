<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold flex-1 truncate">{{ t('starsSettings.title') }}</h2>
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                :disabled="loading" :title="t('starsSettings.refresh')" @click="refresh">
                <RefreshCwIcon class="w-4 h-4 text-gray-500" :class="{ 'animate-spin': loading }" />
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <div class="w-full max-w-2xl mx-auto pb-10">
                <p v-if="error" class="px-6 pt-4 text-xs text-red-500 break-words">{{ t('starsSettings.loadFailed', { error }) }}</p>

                <div v-if="loading" class="px-6 pt-6">
                    <LoadingSkeleton variant="form" :rows="3" :label="t('starsSettings.loading')" />
                </div>

                <template v-else-if="!error">
                    <!-- 头部主视觉（对齐 StarsIntroActivity）：官方 3D 金色星星（拖拽/自转在组件内） + 四周闪烁星芒 → 32px 粗体余额 → 48px 操作行 -->
                    <section class="relative px-6 pt-7 pb-6 text-center">
                        <div class="relative flex flex-col items-center">
                            <!-- 大星：无光晕/背景，只有零散星芒 + 3D 拖拽倾斜 + 呼吸浮动 -->
                            <div class="star-hero relative flex h-36 w-36 select-none items-center justify-center">
                                <span v-for="(sparkle, index) in STAR_SPARKLES" :key="index" class="star-sparkle"
                                    :style="sparkleStyle(sparkle)">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M12 0c1 8 4 11 12 12-8 1-11 4-12 12-1-8-4-11-12-12 8-1 11-4 12-12Z"
                                            :fill="sparkle.color" />
                                    </svg>
                                </span>
                                <div class="star-float">
                                    <Star3DIcon :size="120" draggable :aria-label="t('starsSettings.title')" />
                                </div>
                            </div>

                            <p class="mt-1 text-[32px] leading-10 font-bold tracking-tight text-gray-900 dark:text-gray-50 tabular-nums">
                                {{ formatStars(balance, locale) }}
                            </p>
                            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ t('starsSettings.balanceTitle') }}</p>
                            <p class="mt-0.5 text-[13px] leading-snug text-gray-400 dark:text-gray-500">{{ t('starsSettings.balanceHint') }}</p>
                            <p v-if="updatedText" class="mt-1 text-xs text-gray-400 dark:text-gray-500">{{ updatedText }}</p>

                            <!-- 操作行：主按钮充值 / 次按钮定位到交易明细；提现入口保留（可提现时） -->
                            <div class="mt-5 flex w-full items-stretch gap-2">
                                <button type="button"
                                    class="h-12 flex-1 rounded-xl bg-blue-500 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                                    @click="openTopUp">
                                    {{ t('starsSettings.topUp') }}
                                </button>
                                <button type="button"
                                    class="h-12 flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/60"
                                    @click="scrollToTransactions">
                                    {{ t('lng_channel_earn_credits_history') }}
                                </button>
                            </div>
                            <button v-if="canWithdraw" type="button"
                                class="mt-2 h-12 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/60"
                                @click="openWithdraw">
                                {{ t('starsSettings.withdraw') }}
                            </button>
                        </div>
                    </section>

                    <!-- 交易区：吸顶方向 Tabs + TransactionCell 风格列表项 -->
                    <div ref="txSection" class="scroll-mt-1">
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
                                {{ activeTab === 'all' ? t('starsSettings.txEmpty') : t('starsSettings.txEmptyFiltered') }}
                            </p>
                            <div v-for="row in rows" :key="row.id"
                                class="flex items-center gap-3 rounded-xl border border-gray-200/80 dark:border-gray-700/60 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-3 py-2.5">
                                <!-- 有对方（用户/频道）→ 对方头像与全名；无对方 → 平台图标与平台名；类型文案放副标题 -->
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
                                    {{ loadingMore ? t('starsSettings.txLoadingMore') : t('lng_channel_earn_history_show_more', { count: PAGE_SIZE }) }}
                                </BaseButton>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <!-- 充值：仅列出 getStarPaymentOptions 返回的档位 -->
        <ModalDialog v-model="topUpOpen" :title="t('starsSettings.topUpTitle')">
            <div v-if="topUpLoading" class="py-2">
                <LoadingSkeleton variant="list" :rows="3" :avatar="true" :label="t('starsSettings.topUpLoading')" />
            </div>
            <p v-else-if="topUpDisabled" class="py-8 text-center text-xs text-gray-400">{{ t('starsSettings.topUpDisabled') }}</p>
            <p v-else-if="!topUpOptions.length" class="py-8 text-center text-xs text-gray-400">{{ t('starsSettings.topUpEmpty') }}</p>
            <template v-else>
                <div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
                    <div v-for="opt in visibleTopUpOptions" :key="`${opt.currency}-${opt.amount}-${opt.star_count}`"
                        class="flex items-center gap-3 px-4 py-3">
                        <TgStarColoredIcon class="w-5 h-5 shrink-0" />
                        <span class="text-sm font-medium text-gray-800 dark:text-gray-100 tabular-nums">
                            {{ formatStars(opt.star_count, locale) }}
                        </span>
                        <span class="ml-auto text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                            {{ formatStarPrice(opt.amount, opt.currency, locale) }}
                        </span>
                    </div>
                </div>
                <button v-if="hasAdditional" type="button" class="mt-3 text-xs text-blue-500 hover:underline"
                    @click="topUpShowAll = !topUpShowAll">
                    {{ topUpShowAll ? t('starsSettings.topUpShowLess') : t('starsSettings.topUpShowAll') }}
                </button>
                <p class="mt-3 text-[11px] text-gray-400">{{ t('starsSettings.topUpNote') }}</p>
            </template>
            <template #footer>
                <BaseButton variant="ghost" size="sm" @click="topUpOpen = false">{{ t('starsSettings.close') }}</BaseButton>
            </template>
        </ModalDialog>

        <!-- 提现：调用 getStarWithdrawalUrl 取链接，再走系统浏览器 -->
        <ModalDialog v-model="withdrawOpen" :title="t('starsSettings.withdrawTitle')">
            <p class="text-xs text-gray-400">
                {{ t('starsSettings.withdrawAvailable', { count: formatStars(balance, locale) }) }}
            </p>
            <div class="mt-4 space-y-3">
                <label class="block">
                    <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('starsSettings.withdrawAmount') }}</span>
                    <BaseInput v-model="withdrawAmount" type="number" min="1" inputmode="numeric" class="mt-1" />
                </label>
                <p v-if="withdrawMin > 0" class="text-[11px] text-gray-400">
                    {{ t('starsSettings.withdrawMinHint', { count: formatStars(withdrawMin, locale) }) }}
                </p>
                <p v-if="withdrawMax > 0" class="text-[11px] text-gray-400">
                    {{ t('starsSettings.withdrawMaxHint', { count: formatStars(withdrawMax, locale) }) }}
                </p>
                <label class="block">
                    <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('starsSettings.withdrawPassword') }}</span>
                    <BaseInput v-model="withdrawPassword" type="password" autocomplete="off" class="mt-1" />
                    <span class="mt-1 block text-[11px] text-gray-400">{{ t('starsSettings.withdrawPasswordHint') }}</span>
                </label>
            </div>
            <p class="mt-3 text-[11px] text-gray-400">{{ t('starsSettings.withdrawNote') }}</p>
            <template #footer>
                <BaseButton variant="ghost" size="sm" :disabled="withdrawing" @click="withdrawOpen = false">
                    {{ t('starsSettings.close') }}
                </BaseButton>
                <BaseButton size="sm" :disabled="withdrawing" @click="submitWithdraw">
                    {{ withdrawing ? t('starsSettings.loading') : t('starsSettings.withdrawSubmit') }}
                </BaseButton>
            </template>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
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
    getStarTransactions as GetStarTransactionsRequest,
    httpUrl,
    MessageSender,
    profilePhoto,
    starAmount,
    starPaymentOption,
    starTransaction,
} from 'tdlib-types';
import { tdlibSend } from '../../utils/session/tdlib';
import { useUserStore } from '../../store/session/user';
import { onTdlibUpdate } from '../../store/session/tdlibBus';
import { confirmAndOpenExternalLink } from '../../utils/link/openExternalLink';
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
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import ModalDialog from '../../components/ui/modal/ModalDialog.vue';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import BaseInput from '../../components/ui/input/BaseInput.vue';
import Avatar from '../../components/chat/avatar.vue';
import Star3DIcon from '../../components/common/Star3DIcon.vue';
import {
    TgStarColoredIcon,
    TgGiftIcon,
    TgPremiumIcon,
} from '../../components/common/telegramIconComponents';
import {
    formatStarPrice,
    formatStarTransactionDate,
    formatStarTransactionDelta,
    formatStars,
    starAmountValue,
    starTxInfo,
    starTxMeta,
    type StarTxPlatform,
} from '../../utils/wallet/starTransactions';
import fragmentPlatformIcon from '../../assets/icons/platform/fragment.svg';
import appStorePlatformIcon from '../../assets/icons/platform/app-store.webp';
import androidPlayPlatformIcon from '../../assets/icons/platform/android-play.webp';
import adsChannelPlatformIcon from '../../assets/icons/platform/ads-channel.webp';
import searchPlatformIcon from '../../assets/icons/platform/search.webp';
import paidBroadcastPlatformIcon from '../../assets/icons/platform/paid-broadcast.svg';

const router = useRouter();
const { t, locale } = useI18n();

/** 每次分页拉取的交易条数 */
const PAGE_SIZE = 20;

const userStore = useUserStore();

/** 当前用户 id（Stars 所有者）：优先 Pinia 缓存，缺失时回退 getMe 并缓存 */
let cachedOwnerId = 0;
async function resolveOwnerId(): Promise<number> {
    if (cachedOwnerId) return cachedOwnerId;
    const cached = userStore.userProfile?.id ?? 0;
    if (cached) {
        cachedOwnerId = cached;
        return cachedOwnerId;
    }
    const me = await tdlibSend({ _: 'getMe' });
    cachedOwnerId = me.id;
    return cachedOwnerId;
}

/** 当前用户作为 Stars 所有者的 MessageSender（owner_id 在 TDLib 侧是必填字段） */
async function currentStarOwner(): Promise<{ _: 'messageSenderUser'; user_id: number }> {
    const user_id = await resolveOwnerId();
    return { _: 'messageSenderUser', user_id };
}

/**
 * getStarTransactions 请求。
 * TDLib 侧 owner_id / subscription_id / direction 都是必填：
 * subscription_id 传空串表示不筛选订阅，direction 传 null 表示全部方向；
 * 类型文件把它们都标成了可选，这里按协议补齐。
 */
async function starTransactionsRequest(offset: string): Promise<GetStarTransactionsRequest> {
    return {
        _: 'getStarTransactions',
        owner_id: await currentStarOwner(),
        subscription_id: '',
        direction: null,
        offset,
        limit: PAGE_SIZE,
    } as unknown as GetStarTransactionsRequest;
}

const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
/** 当前余额（`getStarTransactions` 的 star_amount） */
const balance = ref(0);
const transactions = ref<starTransaction[]>([]);
/** 下一页 offset；空串表示没有更多 */
const nextOffset = ref('');
/** 最近一次成功拉取的时间（秒） */
const lastUpdated = ref(0);

/** 交易方向 Tab：全部 / 收入 / 支出，本地按金额正负过滤，不重复请求 TDLib */
const activeTab = ref('all');
const TAB_ITEMS = [
    { id: 'all', key: 'lng_credits_summary_history_tab_full' },
    { id: 'incoming', key: 'lng_credits_summary_history_tab_in' },
    { id: 'outgoing', key: 'lng_credits_summary_history_tab_out' },
] as const;

/** 交易区锚点：次按钮「明细」滚动到这里 */
const txSection = ref<HTMLElement | null>(null);


/** 四周零散星芒：固定位置 + 错峰闪烁（不是背景光斑） */
const STAR_SPARKLES = [
    { x: 5, y: 30, size: 12, color: '#FDE68A', duration: 2.4, delay: 0.2 },
    { x: 85, y: 12, size: 9, color: '#FFFFFF', duration: 3.0, delay: 0.9 },
    { x: 98, y: 54, size: 13, color: '#FCD34D', duration: 2.6, delay: 1.4 },
    { x: 74, y: 92, size: 8, color: '#FFFFFF', duration: 3.2, delay: 0.5 },
    { x: 30, y: 97, size: 11, color: '#FDE68A', duration: 2.8, delay: 1.8 },
    { x: 1, y: 68, size: 7, color: '#FFFFFF', duration: 2.2, delay: 1.1 },
    { x: 15, y: 4, size: 6, color: '#FCD34D', duration: 3.0, delay: 0.35 },
    { x: 93, y: 90, size: 7, color: '#FDE68A', duration: 2.5, delay: 1.6 },
] as const;

function sparkleStyle(sparkle: (typeof STAR_SPARKLES)[number]): Record<string, string> {
    return {
        left: sparkle.x + '%',
        top: sparkle.y + '%',
        width: sparkle.size + 'px',
        height: sparkle.size + 'px',
        '--sparkle-duration': sparkle.duration + 's',
        '--sparkle-delay': sparkle.delay + 's',
    };
}


// ===== 提现额度 =====
const withdrawMin = ref(0);
const withdrawMax = ref(0);

// ===== 充值 =====
const topUpOpen = ref(false);
const topUpLoading = ref(false);
const topUpDisabled = ref(false);
const topUpShowAll = ref(false);
const topUpOptions = ref<starPaymentOption[]>([]);
const visibleTopUpOptions = computed(() =>
    topUpShowAll.value ? topUpOptions.value : topUpOptions.value.filter(option => !option.is_additional),
);
const hasAdditional = computed(() => topUpOptions.value.some(option => option.is_additional));

// ===== 提现弹窗 =====
const withdrawOpen = ref(false);
const withdrawing = ref(false);
const withdrawAmount = ref('');
const withdrawPassword = ref('');

/**
 * 平台图标（无对方交易）：src 为 Android 资源导出的静态图，component 为仓库已有的语义图标。
 * filter：黑色 glyph 用 dark:invert；白色 glyph 用 invert dark:invert-0。
 */
const PLATFORM_ICONS: Record<StarTxPlatform, { src?: string; component?: Component; filter: string; tone: string }> = {
    premium: { component: TgPremiumIcon, filter: '', tone: 'bg-indigo-100 dark:bg-indigo-500/15' },
    'app-store': { src: appStorePlatformIcon, filter: 'invert dark:invert-0', tone: 'bg-gray-100 dark:bg-gray-700/70' },
    'google-play': { src: androidPlayPlatformIcon, filter: 'invert dark:invert-0', tone: 'bg-emerald-100 dark:bg-emerald-500/15' },
    fragment: { src: fragmentPlatformIcon, filter: 'dark:invert', tone: 'bg-violet-100 dark:bg-violet-500/15' },
    ads: { src: adsChannelPlatformIcon, filter: 'invert dark:invert-0', tone: 'bg-rose-100 dark:bg-rose-500/15' },
    api: { src: paidBroadcastPlatformIcon, filter: 'dark:invert', tone: 'bg-teal-100 dark:bg-teal-500/15' },
    search: { src: searchPlatformIcon, filter: 'invert dark:invert-0', tone: 'bg-sky-100 dark:bg-sky-500/15' },
    gift: { component: TgGiftIcon, filter: '', tone: 'bg-pink-100 dark:bg-pink-500/15' },
    unsupported: { component: HelpCircleIcon, filter: '', tone: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300' },
};

/** 平台分类 → 文案 key：优先官方语言包；官方没有「礼物」平台名，保留自定义 */
const PLATFORM_I18N_KEY: Record<StarTxPlatform, string> = {
    premium: 'lng_credits_box_history_entry_via_premium_bot',
    'app-store': 'lng_credits_box_history_entry_app_store',
    'google-play': 'lng_credits_box_history_entry_play_market',
    fragment: 'lng_credits_box_history_entry_fragment',
    ads: 'lng_credits_box_history_entry_ads',
    api: 'lng_credits_box_history_entry_api',
    search: 'lng_credits_box_history_entry_posts_search',
    gift: 'starsSettings.platform.gift',
    unsupported: 'lng_credits_box_history_entry_anonymous',
};

/** 拆 MessageSender：用户或频道，用于头像与标题 */
function senderPeer(sender: MessageSender | undefined): { userId?: number; chatId?: number } | null {
    if (!sender) return null;
    if (sender._ === 'messageSenderUser' && sender.user_id > 0) return { userId: sender.user_id };
    // 频道/超级群的 chat id 是负数（-100…），只能排除 0，不能要求 > 0
    if (sender._ === 'messageSenderChat' && sender.chat_id) return { chatId: sender.chat_id };
    return null;
}

/** 列表头像展示模型 */
interface TxAvatarView {
    photo: profilePhoto | chatPhotoInfo | undefined;
    title: string;
    firstName: string;
    lastName: string;
    /** 已注销账户：用归档灰色头像，不显示首字母 */
    deleted: boolean;
}

/** 按当前 Tab 过滤后的交易（收入 = 金额非负，支出 = 金额为负） */
const filteredTransactions = computed(() => {
    if (activeTab.value === 'all') return transactions.value;
    const incoming = activeTab.value === 'incoming';
    return transactions.value.filter(tx => (starAmountValue(tx.star_amount) >= 0) === incoming);
});

/** 交易列表的展示模型：对方头像/平台图标、对方名字/平台名、说明·时间、带符号金额 */
const rows = computed(() =>
    filteredTransactions.value.map(tx => {
        const meta = starTxMeta(tx.type);
        const info = starTxInfo(tx.type);
        const target = info.peer ?? senderPeer(info.sender);
        const hasCounterparty = !!(info.peer || info.sender);

        // 有对方 → 对方头像与全名/频道标题；资料没加载到 → 问号 + Unknown（不猜测）
        let avatar: TxAvatarView | null = null;
        let counterpartyName = '';
        let pending = false;
        const deletedLabel = getDeletedAccountLabel();
        if (target?.userId) {
            const user = getReactiveUser(target.userId);
            if (user) {
                // 已注销/未知账户：头像走归档灰，名字用「已注销账户 + 用户 id」，不再显示未知
                const deleted = isDeletedUser(user);
                counterpartyName = deleted
                    ? `${deletedLabel} #${user.id}`
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
        } else if (target?.chatId) {
            const chat = getReactiveChat(target.chatId);
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

        // 有对方且预热已完成但资料仍缺失 → 官方失败分支（问号 + Unknown）；无对方 → 平台图标与平台名
        const platformKind: StarTxPlatform = hasCounterparty && !avatar && !pending
            ? 'unsupported'
            : (info.platform ?? 'unsupported');
        const visual = PLATFORM_ICONS[platformKind];
        // 官方 {count} Messages 需要计费请求数；空 key 表示平台名已表达类型（不重复显示）
        const typeLabel = meta.label
            ? (meta.count !== undefined ? t(meta.label, { count: meta.count }) : t(meta.label))
            : '';
        const dateText = formatStarTransactionDate(tx.date, locale.value);
        const unknownName = t('lng_credits_box_history_entry_anonymous');
        // 读取一次 tick，保证预热完成（响应式 Map 写入之外）也会重算本行
        void peerTick.value;
        return {
            id: tx.id,
            pending,
            title: pending
                ? '…'
                : hasCounterparty
                    ? (avatar ? (counterpartyName || unknownName) : unknownName)
                    : t(PLATFORM_I18N_KEY[platformKind]),
            subtitle: [typeLabel, dateText].filter(Boolean).join(' · '),
            delta: formatStarTransactionDelta(tx, locale.value),
            refund: tx.is_refund,
            positive: starAmountValue(tx.star_amount) >= 0,
            avatar,
            tone: visual.tone,
            iconSrc: visual.src ?? '',
            iconFilter: visual.filter,
            iconComponent: visual.component ?? HelpCircleIcon,
        };
    }),
);

/** 最近更新时间文案；从未成功拉取时为空 */
const updatedText = computed(() => {
    if (!lastUpdated.value) return '';
    let time = '';
    try {
        time = new Intl.DateTimeFormat(locale.value, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(lastUpdated.value * 1000));
    } catch {
        time = new Date(lastUpdated.value * 1000).toLocaleString();
    }
    return t('starsSettings.updatedAt', { time });
});

/** 余额够且达到最低提现额时才显示提现入口；额度未知时按 0 处理，由 TDLib 兜底校验 */
const canWithdraw = computed(
    () => balance.value > 0 && (withdrawMin.value <= 0 || balance.value >= withdrawMin.value),
);

function goBack() {
    router.back();
}

/** 「明细」次按钮：平滑滚动到交易区（吸顶 Tabs 会停在顶部） */
function scrollToTransactions() {
    txSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 对方资料是否预热完成：未完成时行内先显示占位，避免瞬间闪成「未知」 */
const peersReady = ref(false);
/** 预热完成后强制重算 rows（响应式 Map 之外的兜底） */
const peerTick = ref(0);

/** 预取交易里出现的用户 / 聊天资料，头像与名字数据到了之后列表自动补上 */
async function prefetchPeers(list: starTransaction[]): Promise<void> {
    peersReady.value = false;
    const jobs: Promise<void>[] = [];
    for (const tx of list) {
        const info = starTxInfo(tx.type);
        const target = info.peer ?? senderPeer(info.sender);
        if (!target) continue;
        if (target.userId) jobs.push(ensureUser(target.userId));
        else if (target.chatId) jobs.push(ensureChat(target.chatId));
    }
    await Promise.allSettled(jobs);
    peersReady.value = true;
    peerTick.value += 1;
}

/** 读取提现额度选项；失败不阻塞页面，提交时 TDLib 仍会校验 */
async function loadWithdrawLimits() {
    try {
        const [minRaw, maxRaw] = await Promise.all([
            tdlibSend({ _: 'getOption', name: 'star_withdrawal_count_min' }),
            tdlibSend({ _: 'getOption', name: 'star_withdrawal_count_max' }),
        ]);
        withdrawMin.value = optionNumber(minRaw);
        withdrawMax.value = optionNumber(maxRaw);
    } catch {
        withdrawMin.value = 0;
        withdrawMax.value = 0;
    }
}

function optionNumber(raw: unknown): number {
    const value = (raw as { value?: number | string } | null | undefined)?.value;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** 拉取首页交易（同时刷新余额） */
async function load() {
    loading.value = true;
    error.value = '';
    try {
        const res = await tdlibSend(await starTransactionsRequest(''));
        balance.value = starAmountValue(res.star_amount);
        transactions.value = res.transactions ?? [];
        nextOffset.value = res.next_offset ?? '';
        lastUpdated.value = Math.floor(Date.now() / 1000);
        void prefetchPeers(transactions.value);
    } catch (e: any) {
        error.value = e?.message ?? String(e);
    } finally {
        loading.value = false;
    }
}

/** 按 next_offset 追加下一页 */
async function loadMore() {
    if (!nextOffset.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
        const res = await tdlibSend(await starTransactionsRequest(nextOffset.value));
        balance.value = starAmountValue(res.star_amount);
        transactions.value = [...transactions.value, ...res.transactions];
        nextOffset.value = res.next_offset ?? '';
        lastUpdated.value = Math.floor(Date.now() / 1000);
        void prefetchPeers(res.transactions ?? []);
    } catch (e: any) {
        toast.error({ content: e?.message ?? String(e) });
    } finally {
        loadingMore.value = false;
    }
}

async function refresh() {
    await Promise.all([load(), loadWithdrawLimits()]);
}

/** 打开充值弹窗时才拉档位；无渠道 / 全局关闭时显示对应说明 */
async function openTopUp() {
    topUpOpen.value = true;
    topUpShowAll.value = false;
    topUpLoading.value = true;
    try {
        const [options, disabledRaw] = await Promise.all([
            tdlibSend({ _: 'getStarPaymentOptions' }),
            tdlibSend({ _: 'getOption', name: 'star_top_up_disabled' }).catch(() => null),
        ]);
        topUpOptions.value = options.options ?? [];
        topUpDisabled.value = !!(disabledRaw as { value?: boolean } | null)?.value;
    } catch (e: any) {
        topUpOptions.value = [];
        toast.error({ content: e?.message ?? String(e) });
    } finally {
        topUpLoading.value = false;
    }
}

function openWithdraw() {
    const available = Math.trunc(balance.value);
    const capped = withdrawMax.value > 0 ? Math.min(available, withdrawMax.value) : available;
    withdrawAmount.value = String(capped > 0 ? capped : '');
    withdrawPassword.value = '';
    withdrawOpen.value = true;
}

/** 取提现链接后交给系统浏览器；用户取消确认时静默忽略 */
async function submitWithdraw() {
    const count = Math.trunc(Number(withdrawAmount.value));
    if (!Number.isFinite(count) || count <= 0) {
        toast.error({ content: t('starsSettings.withdrawInvalid') });
        return;
    }
    if (withdrawMin.value > 0 && count < withdrawMin.value) {
        toast.error({ content: t('starsSettings.withdrawBelowMin') });
        return;
    }
    if (withdrawMax.value > 0 && count > withdrawMax.value) {
        toast.error({ content: t('starsSettings.withdrawAboveMax') });
        return;
    }

    withdrawing.value = true;
    try {
        // owner_id 必填（当前用户）；返回的是 HttpUrl 对象（{ _: 'httpUrl', url }），不是字符串
        const url = await tdlibSend({
            _: 'getStarWithdrawalUrl',
            owner_id: await currentStarOwner(),
            star_count: count,
            password: withdrawPassword.value,
        }) as httpUrl;
        if (!url || url._ !== 'httpUrl' || !url.url) {
            toast.warning({ content: t('starsSettings.openLinkFailed') });
            return;
        }
        withdrawOpen.value = false;
        withdrawPassword.value = '';
        try {
            await confirmAndOpenExternalLink(url.url);
        } catch (openError: any) {
            // 取消确认（canceled）不提示；真正的打开失败才提示
            if (openError?.message !== 'canceled') {
                toast.warning({ content: t('starsSettings.openLinkFailed') });
            }
        }
    } catch (e: any) {
        toast.error({ content: t('starsSettings.withdrawFailed', { error: e?.message ?? String(e) }) });
    } finally {
        withdrawing.value = false;
    }
}

/** updateOwnedStarCount：余额在别处变化时自动同步（只改余额，不整页重载） */
let unsubStarCount: (() => void) | null = null;

onMounted(() => {
    void refresh();
    unsubStarCount = onTdlibUpdate('other', (update) => {
        if (update._ !== 'updateOwnedStarCount') return;
        const amount = (update as unknown as { star_amount?: starAmount }).star_amount;
        if (amount) balance.value = starAmountValue(amount);
    });
});

onBeforeUnmount(() => {
    if (unsubStarCount) {
        unsubStarCount();
        unsubStarCount = null;
    }
});
</script>

<style scoped>
/* 大星舞台：3D 星由 WebGL 在 canvas 内渲染，无 CSS 透视、无背景光晕 */


/* 4s 上下 3px 呼吸浮动：套在外层，和拖拽倾斜（内层 transform）互不覆盖 */
.star-float {
    animation: star-float 4s ease-in-out infinite;
}


/* 四周零散星芒：小四角星，错峰闪烁 */
.star-sparkle {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    animation: star-sparkle var(--sparkle-duration, 2.6s) ease-in-out infinite;
    animation-delay: var(--sparkle-delay, 0s);
}

.star-sparkle svg {
    display: block;
    width: 100%;
    height: 100%;
}

@keyframes star-sparkle {
    0%,
    100% {
        transform: translate(-50%, -50%) scale(0.4);
        opacity: 0.15;
    }

    50% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.95;
    }
}

@keyframes star-float {
    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-3px);
    }
}

/* 尊重系统「减少动态效果」：关掉闪烁/浮动，倾斜改由 JS 直接跳过 */
@media (prefers-reduced-motion: reduce) {
    .star-float,
    .star-sparkle {
        animation: none;
    }
}
</style>