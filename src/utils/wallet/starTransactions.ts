/**
 * Telegram Stars 交易（TDLib `starTransaction`）的映射与格式化。
 *
 * 数据来源是 `getStarTransactions`：返回的 `star_amount` 是当前余额，
 * `transactions` 是交易列表（分页 token 在 `next_offset`）。
 *
 * - 金额：`star_amount` = `star_count`（整数个 Star，可能为负）+ `nanostar_count`（十亿分之一）；
 * - 交易类型：`type._` 是 `starTransactionType*` 之一，这里映射到 UI 文案 key 与图标分类；
 * - 退款：`is_refund` 为 true 时要额外标出，金额仍按 `star_amount` 的正负显示。
 */
import type { MessageSender, starAmount, starTransaction } from 'tdlib-types';

/** 交易分类：决定列表里的图标与配色，不承载文案 */
export type StarTxCategory =
    | 'deposit'
    | 'withdrawal'
    | 'purchase'
    | 'sale'
    | 'gift'
    | 'reaction'
    | 'message'
    | 'subscription'
    | 'premium'
    | 'api'
    | 'other';

export interface StarTxMeta {
    /** 行文案的 i18n key；空串表示不显示类型文案（平台名已表达同一含义） */
    label: string;
    category: StarTxCategory;
    /** label 含 {count} 时的取值（目前只有 Telegram API 用量的计费请求数） */
    count?: number;
}

/** 官方语言包里复用的类型文案 */
const TX_MEDIA = 'lng_credits_box_history_entry_media';
const TX_SUBSCRIPTION = 'lng_credits_box_history_entry_subscription';
const TX_MESSAGE = 'lng_credits_box_history_entry_message';
const TX_REACTION = 'lng_credits_box_history_entry_reaction_name';

/**
 * TDLib 交易类型 → 文案 key / 分类。
 * 键是去掉 starTransactionType 前缀、首字母小写后的类型名；官方语言包有的用 lng_*，
 * 官方没有对应语义的才保留 `txTypes.*` 自定义 key。
 */
const TRANSACTION_META: Record<string, { label: string; category: StarTxCategory }> = {
    premiumBotDeposit: { label: 'lng_credits_box_history_entry_premium_bot', category: 'deposit' },
    appStoreDeposit: { label: 'lng_credits_summary_history_entry_inner_in', category: 'deposit' },
    googlePlayDeposit: { label: 'lng_credits_summary_history_entry_inner_in', category: 'deposit' },
    fragmentDeposit: { label: 'lng_credits_currency_summary_in_button', category: 'deposit' },
    userDeposit: { label: 'lng_credits_box_history_entry_gift_name', category: 'deposit' },
    giveawayDeposit: { label: 'lng_credits_box_history_entry_giveaway_name', category: 'deposit' },

    fragmentWithdrawal: { label: 'lng_wallet_row_withdrawal', category: 'withdrawal' },
    telegramAdsWithdrawal: { label: 'lng_wallet_row_withdrawal', category: 'withdrawal' },
    telegramApiUsage: { label: 'lng_credits_box_history_entry_floodskip_about', category: 'api' },

    botPaidMediaPurchase: { label: TX_MEDIA, category: 'purchase' },
    botPaidMediaSale: { label: TX_MEDIA, category: 'sale' },
    channelPaidMediaPurchase: { label: TX_MEDIA, category: 'purchase' },
    channelPaidMediaSale: { label: TX_MEDIA, category: 'sale' },

    botInvoicePurchase: { label: 'starsSettings.txTypes.botInvoicePurchase', category: 'purchase' },
    botInvoiceSale: { label: 'starsSettings.txTypes.botInvoiceSale', category: 'sale' },
    botSubscriptionPurchase: { label: TX_SUBSCRIPTION, category: 'subscription' },
    botSubscriptionSale: { label: TX_SUBSCRIPTION, category: 'sale' },
    channelSubscriptionPurchase: { label: TX_SUBSCRIPTION, category: 'subscription' },
    channelSubscriptionSale: { label: TX_SUBSCRIPTION, category: 'sale' },

    giftAuctionBid: { label: 'lng_credits_box_history_entry_gift_offer', category: 'gift' },
    giftPurchase: { label: 'lng_credits_box_history_entry_gift_bought', category: 'gift' },
    giftPurchaseOffer: { label: 'lng_credits_box_history_entry_gift_offer', category: 'gift' },
    giftTransfer: { label: 'lng_credits_box_history_entry_gift_transfer', category: 'gift' },
    giftOriginalDetailsDrop: { label: 'starsSettings.txTypes.giftOriginalDetailsDrop', category: 'gift' },
    giftSale: { label: 'lng_credits_box_history_entry_gift_sold', category: 'gift' },
    giftUpgrade: { label: 'lng_credits_box_history_entry_gift_upgrade', category: 'gift' },
    giftUpgradePurchase: { label: 'lng_credits_box_history_entry_gift_upgrade', category: 'gift' },
    upgradedGiftPurchase: { label: 'lng_credits_box_history_entry_gift_bought', category: 'gift' },
    upgradedGiftSale: { label: 'lng_credits_box_history_entry_gift_sold', category: 'gift' },

    channelPaidReactionSend: { label: TX_REACTION, category: 'reaction' },
    channelPaidReactionReceive: { label: TX_REACTION, category: 'reaction' },
    affiliateProgramCommission: { label: 'lng_credits_box_history_entry_affiliate', category: 'sale' },

    paidMessageSend: { label: TX_MESSAGE, category: 'message' },
    paidMessageReceive: { label: TX_MESSAGE, category: 'message' },
    paidGroupCallMessageSend: { label: TX_MESSAGE, category: 'message' },
    paidGroupCallMessageReceive: { label: TX_MESSAGE, category: 'message' },
    paidGroupCallReactionSend: { label: TX_REACTION, category: 'reaction' },
    paidGroupCallReactionReceive: { label: TX_REACTION, category: 'reaction' },

    suggestedPostPaymentSend: { label: 'starsSettings.txTypes.suggestedPostPaymentSend', category: 'message' },
    suggestedPostPaymentReceive: { label: 'starsSettings.txTypes.suggestedPostPaymentReceive', category: 'message' },

    premiumPurchase: { label: 'lng_premium_summary_title', category: 'premium' },

    businessBotTransferSend: { label: 'starsSettings.txTypes.businessBotTransferSend', category: 'other' },
    businessBotTransferReceive: { label: 'starsSettings.txTypes.businessBotTransferReceive', category: 'other' },
    publicPostSearch: { label: '', category: 'api' },
    unsupported: { label: 'starsSettings.txTypes.unsupported', category: 'other' },
};

/**
 * 交易类型 → 行文案 key / 分类。
 * TelegramApiUsage 额外带 request_count，供官方 {count} Messages 复数文案使用。
 */
export function starTxMeta(type: starTransaction['type'] | null | undefined): StarTxMeta {
    const fallback: StarTxMeta = { label: 'starsSettings.txTypes.unsupported', category: 'other' };
    if (!type) return fallback;
    const raw = type._.replace(/^starTransactionType/, '');
    const key = raw ? raw.charAt(0).toLowerCase() + raw.slice(1) : '';
    const meta = TRANSACTION_META[key];
    if (!meta) return fallback;
    if (type._ === 'starTransactionTypeTelegramApiUsage') {
        return { label: meta.label, category: meta.category, count: type.request_count };
    }
    return { label: meta.label, category: meta.category };
}

/** `starAmount` → 可参与运算的 Star 数（含小数部分） */
export function starAmountValue(amount: starAmount | null | undefined): number {
    if (!amount) return 0;
    return (amount.star_count ?? 0) + (amount.nanostar_count ?? 0) / 1e9;
}

/**
 * 格式化 Star 数：整数不带小数位，非整数最多两位。
 * `signed` 为 true 时正数补 "+"、负数用 "-"，用于交易流水。
 */
export function formatStars(value: number, locale: string, signed = false): string {
    const safe = Number.isFinite(value) ? value : 0;
    const abs = Math.abs(safe);
    const digits = Number.isInteger(abs) ? 0 : 2;
    const text = new Intl.NumberFormat(locale, {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
    }).format(abs);
    if (!signed) return text;
    if (safe > 0) return `+${text}`;
    if (safe < 0) return `-${text}`;
    return text;
}

/** 交易的带符号 Star 数（列表右侧） */
export function formatStarTransactionDelta(tx: starTransaction, locale: string): string {
    return formatStars(starAmountValue(tx.star_amount), locale, true);
}

/** 交易时间：日期 + 时分（按当前界面语言本地化） */
export function formatStarTransactionDate(timestamp: number, locale: string): string {
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

/**
 * 支付档位价格：TDLib 的 `amount` 是最小货币单位。
 * 小数位按该货币的 CLDR 规则推导（日元等 0 位，第纳尔等 3 位），不能一律除以 100。
 */
export function formatStarPrice(amount: number, currency: string, locale: string): string {
    try {
        const decimals = new Intl.NumberFormat(locale, { style: 'currency', currency })
            .resolvedOptions().maximumFractionDigits ?? 2;
        const value = amount / Math.pow(10, decimals);
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: decimals,
        }).format(value);

    } catch {
        // 未知货币代码：退回原始数字 + 代码，避免整页报错
        return `${amount} ${currency}`;
    }
}

// ===== 交易对手 / 平台（列表头像与标题来源；逐类型显式映射，不做兜底猜测） =====

/** 有对方时：头像来源（用户或频道，二选一） */
export interface StarTxPeerRef {
    userId?: number;
    chatId?: number;
}

/** 无对方时：平台图标分类 */
export type StarTxPlatform =
    | 'premium'
    | 'app-store'
    | 'google-play'
    | 'fragment'
    | 'ads'
    | 'api'
    | 'search'
    | 'gift'
    | 'unsupported';

/** 列表行的头像/标题来源：对方（用户/频道）或平台，二者互斥 */
export interface StarTxInfo {
    /** 有对方：用户或频道 */
    peer?: StarTxPeerRef;
    /** 有对方：MessageSender（用户或频道，调用方再拆） */
    sender?: MessageSender;
    /** 无对方：平台图标 */
    platform?: StarTxPlatform;
}

/** 从用户 id 取对端；id 无效时按未识别处理，不猜测 */
function fromUser(userId: number | null | undefined): StarTxInfo {
    return userId && userId > 0 ? { peer: { userId } } : { platform: 'unsupported' };
}

/**
 * 从聊天 id 取对端；id 无效时按未识别处理，不猜测。
 * 注意：频道/超级群的 chat id 是**负数**（-100…），群组也可能是负数，
 * 所以这里只能判断「非 0」，不能用 > 0（否则所有频道都会掉进未知）。
 */
function fromChat(chatId: number | null | undefined): StarTxInfo {
    return chatId ? { peer: { chatId } } : { platform: 'unsupported' };
}

/**
 * 交易类型 → 列表行的头像/标题来源。
 *
 * 每个类型都显式列出，不做「有 user_id 就当用户」之类的兜底：
 * 礼物类里 owner_id 可能是频道，upgradedGiftPurchase 展示的是卖家用户，
 * giftPurchaseOffer 在出价时卖家未知，只能用礼物图标。
 */
export function starTxInfo(type: starTransaction['type'] | null | undefined): StarTxInfo {
    if (!type) return { platform: 'unsupported' };
    switch (type._) {
        // ===== 无对方：平台 =====
        case 'starTransactionTypePremiumBotDeposit':
            return { platform: 'premium' };
        case 'starTransactionTypeAppStoreDeposit':
            return { platform: 'app-store' };
        case 'starTransactionTypeGooglePlayDeposit':
            return { platform: 'google-play' };
        case 'starTransactionTypeFragmentDeposit':
        case 'starTransactionTypeFragmentWithdrawal':
            return { platform: 'fragment' };
        case 'starTransactionTypeTelegramAdsWithdrawal':
            return { platform: 'ads' };
        case 'starTransactionTypeTelegramApiUsage':
            return { platform: 'api' };
        case 'starTransactionTypePublicPostSearch':
            return { platform: 'search' };
        case 'starTransactionTypeGiftPurchaseOffer':
            // 出价时卖家未知，官方这里也没有对方，只用礼物图标
            return { platform: 'gift' };

        // ===== 有对方：用户 =====
        case 'starTransactionTypeUserDeposit':
            // user_id 为 0 表示通过 Fragment 赠送，没有可显示的人
            return type.user_id > 0 ? { peer: { userId: type.user_id } } : { platform: 'fragment' };
        case 'starTransactionTypeBotPaidMediaPurchase':
        case 'starTransactionTypeBotPaidMediaSale':
        case 'starTransactionTypeChannelPaidMediaSale':
        case 'starTransactionTypeBotInvoicePurchase':
        case 'starTransactionTypeBotInvoiceSale':
        case 'starTransactionTypeBotSubscriptionPurchase':
        case 'starTransactionTypeBotSubscriptionSale':
        case 'starTransactionTypeChannelSubscriptionSale':
        case 'starTransactionTypeChannelPaidReactionReceive':
        case 'starTransactionTypeSuggestedPostPaymentReceive':
        case 'starTransactionTypePremiumPurchase':
        case 'starTransactionTypeBusinessBotTransferSend':
        case 'starTransactionTypeBusinessBotTransferReceive':
        case 'starTransactionTypeGiftSale':
        case 'starTransactionTypeGiftUpgrade':
        case 'starTransactionTypeUpgradedGiftPurchase':
        case 'starTransactionTypeUpgradedGiftSale':
            return fromUser(type.user_id);

        // ===== 有对方：频道 =====
        case 'starTransactionTypeGiveawayDeposit':
        case 'starTransactionTypeChannelPaidMediaPurchase':
        case 'starTransactionTypeChannelSubscriptionPurchase':
        case 'starTransactionTypeChannelPaidReactionSend':
        case 'starTransactionTypePaidMessageSend':
        case 'starTransactionTypePaidGroupCallMessageSend':
        case 'starTransactionTypePaidGroupCallReactionSend':
        case 'starTransactionTypeSuggestedPostPaymentSend':
        case 'starTransactionTypeAffiliateProgramCommission':
            return fromChat(type.chat_id);

        // ===== 有对方：MessageSender（用户或频道） =====
        case 'starTransactionTypePaidMessageReceive':
        case 'starTransactionTypePaidGroupCallMessageReceive':
        case 'starTransactionTypePaidGroupCallReactionReceive':
            return { sender: type.sender_id };
        case 'starTransactionTypeGiftPurchase':
        case 'starTransactionTypeGiftAuctionBid':
        case 'starTransactionTypeGiftUpgradePurchase':
        case 'starTransactionTypeGiftOriginalDetailsDrop':
        case 'starTransactionTypeGiftTransfer':
            return { sender: type.owner_id };

        // 未识别类型：问号图标，不猜测对端
        default:
            return { platform: 'unsupported' };
    }
}
