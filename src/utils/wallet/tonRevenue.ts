/**
 * TON Gram 收入交易（TDLib `tonTransaction`）的映射与格式化。
 *
 * 数据来源是 `getTonTransactions`（当前用户的 Gram 收入交易，不是 TON 钱包交易）：
 * `gram_amount` 是最小单位（1 Gram = 1e9），正数进账、负数出账；`next_offset` 用于分页。
 *
 * 文案优先用 TDLib 官方语言包 key（`lng_*`）；官方没有对应语义的（建议帖子、掷骰、报价单出售等）
 * 才保留 `tonTx.*` 自定义 key。
 */
import type { TonTransactionType } from 'tdlib-types';
import { formatGram } from './gramRevenue';

/** 无对方资料时左侧的平台图标 */
export type TonTxPlatform = 'fragment' | 'gift' | 'diamond' | 'question';

/** 交易对方：普通用户或频道/群（chat id 为负数，只能排除 0） */
export interface TonTxPeerRef {
    userId?: number;
    chatId?: number;
}

export interface TonTxInfo {
    /** 行文案的 i18n key：无对方/无礼物名时当标题，有对方/礼物名时当副标题 */
    labelKey: string;
    /** 提现状态文案 key（官方 pending / failed）；非提现交易为空 */
    stateKey?: string;
    /** 无对方头像时左侧的平台图标 */
    platform: TonTxPlatform;
    /** 需要预热资料的对端 */
    peer?: TonTxPeerRef;
    /** 升级礼物名称（gift.title || gift.name） */
    giftTitle?: string;
    /** 礼物是否通过报价单卖出 */
    viaOffer?: boolean;
}

/** 官方 key：提现交易（`lng_wallet_row_withdrawal` = Withdrawal） */
const KEY_WITHDRAWAL = 'lng_wallet_row_withdrawal';
/** 官方 key：收到礼物（`lng_credits_box_history_entry_gift_name` = Received Gift） */
const KEY_GIFT_RECEIVED = 'lng_credits_box_history_entry_gift_name';

/** 提现状态 → 官方 key；成功或非提现交易返回 undefined */
function withdrawalStateKey(state: { _?: string } | null | undefined): string | undefined {
    if (state?._ === 'revenueWithdrawalStatePending') return 'lng_channel_earn_history_pending';
    if (state?._ === 'revenueWithdrawalStateFailed') return 'lng_channel_earn_history_failed';
    return undefined;
}

/** 升级礼物名称：优先标题，其次唯一名称 */
function upgradedGiftTitle(gift: { title?: string; name?: string } | null | undefined): string {
    return (gift?.title || gift?.name || '').trim();
}

/** TDLib 交易类型 → 文案 key / 平台图标 / 对端 / 礼物名 */
export function tonTxInfo(type: TonTransactionType | null | undefined): TonTxInfo {
    const fallback: TonTxInfo = {
        labelKey: 'gramRevenueSettings.tonTx.unsupported',
        platform: 'question',
    };
    if (!type) return fallback;
    switch (type._) {
        case 'tonTransactionTypeFragmentDeposit':
            return {
                // 礼物到账用官方 Received Gift；普通充值用官方 Top-up via Fragment
                labelKey: type.is_gift ? KEY_GIFT_RECEIVED : 'lng_credits_currency_summary_in_button',
                platform: 'fragment',
            };
        case 'tonTransactionTypeFragmentWithdrawal':
            return {
                labelKey: KEY_WITHDRAWAL,
                stateKey: withdrawalStateKey(type.withdrawal_state),
                platform: 'fragment',
            };
        case 'tonTransactionTypeSuggestedPostPayment':
            // 官方语言包没有建议帖子交易的类型文案，保留自定义
            return {
                labelKey: 'gramRevenueSettings.tonTx.suggestedPost',
                platform: 'question',
                peer: type.chat_id ? { chatId: type.chat_id } : undefined,
            };
        case 'tonTransactionTypeGiftPurchaseOffer':
            return {
                // 官方：Gift Offer
                labelKey: 'lng_credits_box_history_entry_gift_offer',
                platform: 'gift',
                giftTitle: upgradedGiftTitle(type.gift),
            };
        case 'tonTransactionTypeUpgradedGiftPurchase':
            return {
                // 官方：Gift Purchase
                labelKey: 'lng_credits_box_history_entry_gift_bought',
                platform: 'gift',
                peer: type.user_id ? { userId: type.user_id } : undefined,
                giftTitle: upgradedGiftTitle(type.gift),
            };
        case 'tonTransactionTypeUpgradedGiftSale':
            return {
                // 官方：Gift Sale；「通过报价单出售」官方无对应 key，保留自定义
                labelKey: type.via_offer
                    ? 'gramRevenueSettings.tonTx.giftSaleViaOffer'
                    : 'lng_credits_box_history_entry_gift_sold',
                platform: 'gift',
                peer: type.user_id ? { userId: type.user_id } : undefined,
                giftTitle: upgradedGiftTitle(type.gift),
                viaOffer: type.via_offer,
            };
        case 'tonTransactionTypeStakeDiceStake':
            // 官方只有玩法说明文案（Emoji Stake），没有交易类型文案，保留自定义
            return { labelKey: 'gramRevenueSettings.tonTx.stakeStake', platform: 'diamond' };
        case 'tonTransactionTypeStakeDicePayout':
            return { labelKey: 'gramRevenueSettings.tonTx.stakePayout', platform: 'diamond' };
        default:
            return fallback;
    }
}

/** 交易金额（最小单位）→ 带符号的 Gram 文本（正数补 "+"，负数用 "-"） */
export function formatTonTransactionDelta(gramAmount: number, locale: string): string {
    if (!Number.isFinite(gramAmount)) return formatGram(0, locale);
    const sign = gramAmount > 0 ? '+' : gramAmount < 0 ? '-' : '';
    return sign + formatGram(Math.abs(gramAmount), locale);
}

/** 交易时间：日期 + 时分（按当前界面语言本地化） */
export function formatTonTransactionDate(timestamp: number, locale: string): string {
    if (!timestamp) return '';
    try {
        return new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(timestamp * 1000));
    } catch {
        return new Date(timestamp * 1000).toLocaleString();
    }
}
