<template>
    <Teleport to="body">
        <Transition name="ton-detail">
            <div v-if="open" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="ton-transfer-detail-amount"
                @mousedown.self="emitClose">
                <!-- 面板本身不裁剪：石头按压放大时要能探出边界（与聊天卡片同一套手感） -->
                <div
                    class="relative w-100 max-w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-800">
                    <!-- 关闭按钮压在内容之上，不随滚动区滚走 -->
                    <button type="button" :aria-label="t('lng_close')"
                        class="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                        @click="emitClose">
                        <XIcon class="h-4.5 w-4.5" />
                    </button>

                    <!-- 钻石 / 金额 / 备注 / 表格是**同一个**滚动区：有备注时整体一起滚 -->
                    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-6">
                        <!-- 钻石：与转账卡片共用同一个离屏渲染器，配色取 0 号（蓝色，官方交易详情用的就是这套）；
                             弹窗里只保留拖拽（拖起来转石头），不做按压缩放 -->
                        <div class="mx-auto flex h-28 items-center justify-center">
                            <canvas ref="stoneEl" class="ton-detail-stone" @pointerdown="onPointerDown"
                                @pointermove="onPointerMove" @pointerup="onPointerUp"
                                @pointercancel="onPointerUp" @lostpointercapture="onPointerUp" />
                        </div>

                        <h2 id="ton-transfer-detail-amount"
                            class="mt-0.5 text-center text-lg font-semibold text-gray-900 dark:text-white">
                            <!-- 收入绿色 / 支出保持默认正文色；「Gram」单位始终中性灰 -->
                            <span :class="amountToneClass">{{ amount.sign }}{{ amount.whole }}<span
                                    class="text-[0.75em]">{{ amount.fraction }}</span></span>
                            <span class="ml-1 text-sm font-medium text-gray-500 dark:text-gray-300">{{
                                t('lng_action_gram_transfer_ticker', 1) }}</span>
                        </h2>

                        <!-- 备注：灰底包起来的一整块，\n 真换行 -->
                        <p v-if="hasComment"
                            class="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-center text-sm leading-snug whitespace-pre-wrap text-gray-700 select-text dark:bg-gray-700/60 dark:text-gray-100">
                            <SpoilerSpan v-if="content.is_comment_encrypted">{{
                                t('lng_action_gram_transfer_encrypted_comment') }}</SpoilerSpan>
                            <template v-else>{{ content.comment }}</template>
                        </p>

                        <!-- 介绍表格：对方 / 地址 / 费用 / 日期 -->
                        <div class="mt-3 overflow-hidden rounded-lg border border-gray-200 text-[13px] dark:border-gray-600">
                            <!-- 对方：和礼物详情里的「所有者」同样的头像 + 主题色名字 -->
                            <div v-if="party" class="flex min-h-10 border-b border-gray-200 dark:border-gray-600">
                                <div
                                    class="flex w-18 shrink-0 items-center bg-gray-50 px-2.5 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                    {{ partyLabel }}
                                </div>
                                <div
                                    class="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-[#168acd] dark:text-sky-400">
                                    <div class="flex h-6 w-6 shrink-0 overflow-hidden rounded-full">
                                        <Avatar :photo="party.photo" :title="party.name" :first-name="party.firstName"
                                            :last-name="party.lastName" :accent-color-id="party.accentColorId" />
                                    </div>
                                    <span class="min-w-0 truncate font-medium">
                                        <GlobalEmojiText :text="party.name" />
                                    </span>
                                </div>
                            </div>

                            <!-- 地址：悬停高亮，点击复制 -->
                            <button type="button"
                                class="group flex w-full min-h-10 items-start border-b border-gray-200 text-left transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/60 dark:border-gray-600 dark:hover:bg-gray-700/40"
                                :aria-label="t('lng_wallet_details_address')" @click="copyAddress">
                                <span
                                    class="flex w-18 shrink-0 items-center self-stretch bg-gray-50 px-2.5 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                    {{ t('lng_wallet_details_address') }}
                                </span>
                                <span class="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5">
                                    <span class="ton-detail-address">{{ addressText || '—' }}</span>
                                    <CheckIcon v-if="copied"
                                        class="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                    <CopyIcon v-else
                                        class="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
                                </span>
                            </button>

                            <!-- 费用：可能由 Telegram 承担（gasless），此时附一个「?」说明 -->
                            <div class="flex min-h-10 border-b border-gray-200 dark:border-gray-600">
                                <div
                                    class="flex w-18 shrink-0 items-center bg-gray-50 px-2.5 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                    {{ t('lng_wallet_details_fee') }}
                                </div>
                                <div
                                    class="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-gray-800 select-text dark:text-gray-100">
                                    <!-- 费用还在查：用骨架占位，不写「…」 -->
                                    <span v-if="loadingTransaction"
                                        class="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
                                        aria-hidden="true" />
                                    <span v-else class="min-w-0 break-words">{{ feeText }}</span>
                                    <!-- 主题色「?」：悬停 / 键盘聚焦时给出每日免费笔数说明 -->
                                    <span v-if="feeIsGasless" class="inline-flex shrink-0 rounded-full"
                                        tabindex="0" aria-describedby="ton-detail-gasless-tip"
                                        @mouseenter="showTip" @mouseleave="hideTip" @focus="showTip" @blur="hideTip">
                                        <span
                                            class="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-[var(--app-brand)] text-[10px] font-semibold leading-none text-white select-none">?</span>
                                    </span>
                                </div>
                            </div>

                            <!-- 日期 -->
                            <div class="flex min-h-10">
                                <div
                                    class="flex w-18 shrink-0 items-center bg-gray-50 px-2.5 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                    {{ t('lng_wallet_details_date') }}
                                </div>
                                <div
                                    class="flex min-w-0 flex-1 items-center px-2.5 py-1.5 text-gray-800 select-text dark:text-gray-100">
                                    {{ dateText || '—' }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        class="shrink-0 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                        <button type="button"
                            class="w-full rounded-lg bg-[#2e9cd3] py-2 text-sm font-medium text-white hover:bg-[#278cc0] focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            @click="emitClose">
                            {{ t('lng_box_ok') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- 「?」的悬停说明：表格是 overflow:hidden，说明挂到 body 上才不会被裁掉；
             位置按「?」的实时矩形算，贴它右下角展开 -->
        <div v-if="tipVisible" id="ton-detail-gasless-tip" class="ton-detail-tip" :style="tipStyle" role="tooltip">
            {{ gaslessHint }}
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckIcon, CopyIcon, XIcon } from 'lucide-vue-next';
import type { messageTonWalletTransfer, tonWalletTransaction } from 'tdlib-types';
import Avatar from '../chat/avatar.vue';
import SpoilerSpan from '../chat/ChatDetail/MessageContent/spoiler/SpoilerSpan.vue';
import GlobalEmojiText from './GlobalEmojiText.vue';
import { useDiamondDrag } from '../../composables/useDiamondDrag';
import { PALETTE_BLUE } from '../../utils/diamond/palette';
import { tdlibSend } from '../../utils/session/tdlib';
import { toast } from '../../utils/ui/toast';
import { tdPlural } from '../../utils/i18n/tdLang';
import type { GiftDetailParty } from '../../utils/message/giftDetail';
import {
    formatGramAddressLines,
    formatGramAmount,
    formatGramDate,
    formatGramFee,
    isNegativeGramAmount,
} from '../../utils/message/tonTransfer';

const { t } = useI18n();

const props = defineProps<{
    open: boolean;
    content: messageTonWalletTransfer;
    /** 消息发送时间：交易还没完成（没有 date）时先拿它兜底 */
    date?: number;
    /** 消息由自己发出：金额强制显示负号、费用行下方的对方是「接收方」 */
    outgoing?: boolean;
    /** 转账对方（头像 + 名字），与礼物详情的所有者同一套展示 */
    party?: GiftDetailParty | null;
}>();

const emit = defineEmits<{ close: [] }>();

function emitClose() { emit('close'); }

const stoneEl = ref<HTMLCanvasElement | null>(null);

/** 拖拽：与聊天里的转账卡片同一套交互；弹窗里只要拖拽，不做按压缩放（配色取 0 号蓝色） */
const {
    mount: mountStone,
    unmount: unmountStone,
    onPointerDown,
    onPointerMove,
    onPointerUp,
} = useDiamondDrag({ canvas: stoneEl, palette: PALETTE_BLUE, pressZoom: false });

const amount = computed(() => formatGramAmount(props.content.amount, props.outgoing === true));
/** 收入绿色；支出保持正文默认色（不用红色） */
const isExpense = computed(() => props.outgoing === true || isNegativeGramAmount(props.content.amount));
const amountToneClass = computed(() => (isExpense.value
    ? ''
    : 'text-emerald-600 dark:text-emerald-400'));

const addressText = computed(() => formatGramAddressLines(props.content.peer_address, 4));
const hasComment = computed(() => props.content.is_comment_encrypted || !!props.content.comment?.trim());

/** 对方行的标签：自己发出时是收件人，否则是发送方 */
const partyLabel = computed(() => (props.outgoing
    ? t('lng_wallet_details_recipient')
    : t('lng_wallet_details_sender')));

/** 复制地址（悬停整行高亮，复制后图标变勾） */
const copied = ref(false);
let copiedTimer = 0;

async function copyAddress() {
    const value = props.content.peer_address?.trim();
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
        copied.value = true;
        window.clearTimeout(copiedTimer);
        copiedTimer = window.setTimeout(() => { copied.value = false; }, 1500);
        toast.success(t('lng_text_copied'));
    } catch {
        // 剪贴板不可用（无权限 / 非安全上下文）：不做视觉反馈，也不弹错误
    }
}

/** 交易详情（手续费 / 完成时间 / 是否 gasless）；拿不到时各项显示占位符 */
const transaction = ref<tonWalletTransaction | null>(null);
const loadingTransaction = ref(false);

/** gasless 每日免费笔数：TDLib 选项说了算，读不到就按官方文档的 5 笔 */
const gaslessDailyMax = ref(5);

const gaslessHint = computed(() => tdPlural('lng_wallet_about_fees_text', gaslessDailyMax.value));

/** 「?」的悬停说明：宽度固定，左右夹在视口内 */
const TIP_WIDTH = 200;
const TIP_GAP = 6;
const tipVisible = ref(false);
const tipStyle = ref<Record<string, string>>({});

function showTip(event: MouseEvent | FocusEvent) {
    const anchor = event.currentTarget as HTMLElement | null;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - TIP_WIDTH, window.innerWidth - TIP_WIDTH - 8));
    tipStyle.value = {
        left: `${left}px`,
        top: `${rect.bottom + TIP_GAP}px`,
        width: `${TIP_WIDTH}px`,
    };
    tipVisible.value = true;
}

function hideTip() {
    tipVisible.value = false;
}

/** 交易类型里携带的 is_gasless：只有转账类型才有这个字段 */
const feeIsGasless = computed(() => {
    const type = transaction.value?.type;
    return type?._ === 'tonWalletTransactionTypeTransfer' && type.is_gasless;
});

// 手续费信息刷新后可能不再免单：说明气泡跟着「?」一起收起
watch(feeIsGasless, (gasless) => {
    if (!gasless) hideTip();
});

/** 交易还没上链（没有 transaction_id）时不做查询，费用留空 */
const hasTransactionId = computed(() => !!props.content.transaction_id);

/** 查询失败时 TDLib 给的原始错误消息（`error.message`），直接当费用文案显示 */
const lookupError = ref('');

const feeText = computed(() => {
    const tx = transaction.value;
    if (!tx) {
        if (lookupError.value) return lookupError.value;
        return hasTransactionId.value ? t('lng_wallet_details_fee_unknown') : '—';
    }
    if (feeIsGasless.value) return t('lng_wallet_details_fee_free');
    return `${formatGramFee(tx.fee_amount)} ${t('lng_action_gram_transfer_ticker', 1)}`;
});

const dateText = computed(() => formatGramDate(transaction.value?.date ?? props.date));

async function loadGaslessDailyMax() {
    try {
        const res = await tdlibSend({ _: 'getOption', name: 'ton_wallet_gasless_transfer_daily_count_max' }) as
            { value?: unknown };
        const value = Number(res?.value);
        if (Number.isFinite(value) && value > 0) gaslessDailyMax.value = value;
    } catch {
        // 选项不可用时保留默认值，不影响弹窗其它内容
    }
}

async function loadTransaction() {
    const id = props.content.transaction_id;
    lookupError.value = '';
    if (!id) {
        transaction.value = null;
        return;
    }
    loadingTransaction.value = true;
    try {
        transaction.value = await tdlibSend({ _: 'getTonWalletTransaction', transaction_id: id });
    } catch (error) {
        // 交易还没上链 / 已被本地缓存淘汰：把失败原因原样显示出来，比「—」有用
        transaction.value = null;
        const message = (error as { message?: unknown } | null)?.message;
        lookupError.value = typeof message === 'string' ? message.trim() : '';
    } finally {
        loadingTransaction.value = false;
    }
}

// flush: 'post' —— 画布要等 v-if 的 DOM 落地后才存在
watch(() => props.open, (open) => {
    if (open) {
        mountStone();
        copied.value = false;
        void loadTransaction();
        void loadGaslessDailyMax();
    } else {
        unmountStone();
        hideTip();
    }
}, { flush: 'post' });

onMounted(() => {
    if (props.open) {
        mountStone();
        void loadTransaction();
        void loadGaslessDailyMax();
    }
});

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) emitClose();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    window.clearTimeout(copiedTimer);
    unmountStone();
});
</script>

<style scoped>
/* 地址是 48 字符的 base64url：4 字符一组、每行 4 组（16 字符），等宽字体才对得齐 */
.ton-detail-address {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.01em;
    white-space: pre-line;
    word-break: break-all;
}

/*
 * 弹窗里的石头：104px、只可拖拽（不做按压缩放，放大只属于聊天里的转账卡片）。
 * z-index 压过后面那些静态兄弟（金额 / 备注 / 表格）。
 */
.ton-detail-stone {
    position: relative;
    z-index: 1;
    width: 104px;
    height: 104px;
    cursor: grab;
    touch-action: none;
    user-select: none;
}

.ton-detail-stone:active {
    cursor: grabbing;
}

/*
 * 「?」的悬停说明（Teleport 到 body，position:fixed）：
 * 位置由 showTip() 按锚点矩形写入，层级压在弹窗（z-9998）之上。
 */
.ton-detail-tip {
    position: fixed;
    z-index: 9999;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgb(17 24 39 / 0.95);
    color: #fff;
    font-size: 11px;
    line-height: 1.35;
    text-align: left;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.24);
    pointer-events: none;
}

.ton-detail-enter-active,
.ton-detail-leave-active {
    transition: opacity 0.16s ease;
}

.ton-detail-enter-from,
.ton-detail-leave-to {
    opacity: 0;
}
</style>
