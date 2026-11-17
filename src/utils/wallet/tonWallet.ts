/**
 * Gram 钱包页（settings/wallet）的数据映射与金额换算。
 *
 * 数据来源（TDLib 方法 / 更新，字段名以 src/types/tdlib-types.d.ts 为准）：
 * - 钱包状态：调用 loadTonWalletState 后由 updateTonWalletState 推送 tonWalletState；
 * - 余额与流水：getTonWalletTransactions 返回 tonWalletTransactions（含 gram_amount、next_offset）；
 * - 地址兜底：getUserTonWalletAddresses 返回 userTonWalletAddress.wallet_address；
 * - 收藏品：getTonWalletNfts 返回 tonNfts。
 *
 * 所有金额一律按最小单位（nanogram，1 Gram = 1e9）用字符串处理，避免大额浮点丢精度；
 * 展示层复用 utils/message/tonTransfer 里转账气泡同一套格式化规则。
 */
import type { tonNft, tonWalletState, tonWalletTransaction } from 'tdlib-types';
import {
    GRAM_SCALE,
    formatGramAmount,
    formatGramBalance,
    isNegativeGramAmount,
    type FormattedGramAmount,
} from '../message/tonTransfer';

/** 一页流水条数（TDLib 上限 100，这里与官方列表观感对齐） */
// TON Center 对单页交易体积有限制：limit ≥ 9 会返回 400 TONCENTER_RESPONSE_TOO_BIG，
// 官方客户端也是小页拉取；20 会让整个交易/余额请求直接失败。
export const WALLET_TX_PAGE_SIZE = 5;
/** 一页收藏品条数（TDLib 要求 <= 20） */
export const WALLET_NFT_PAGE_SIZE = 20;

const GRAM_SCALE_BIG = BigInt(GRAM_SCALE);

/** 钱包交易类型：tonWalletTransactionType* 去掉前缀后的短名 */
export type WalletTransactionKind =
    | 'transfer'
    | 'onRampDeposit'
    | 'nftTransfer'
    | 'telegramGiftTransfer'
    | 'keyChange'
    /** 未来 TDLib 新增、当前代码不认识的类型；文案走 tx.typeUnknown */
    | 'unknown';

/** 钱包状态视图：与 tonWalletState 字段一一对应，不做猜测性加工 */
export interface WalletStateView {
    /** 钱包地址；空串表示暂无 */
    address: string;
    /** 余额（最小单位，无符号） */
    gramAmount: string;
    /** 公钥（base64） */
    publicKey: string;
    /** 钱包正在创建 */
    isBeingCreated: boolean;
    /** 已开启云端备份 */
    isBackupEnabled: boolean;
    /** 可以开启备份（需要所有权证明，见页面说明） */
    canEnableBackup: boolean;
    /** 可以导出助记词 */
    canExportPhrase: boolean;
}

/** 把 tonWalletState 归一化成页面用的视图对象 */
export function mapTonWalletState(state: tonWalletState): WalletStateView {
    return {
        address: state.address ?? '',
        gramAmount: state.gram_amount ?? '0',
        publicKey: state.public_key ?? '',
        isBeingCreated: state.is_being_created === true,
        isBackupEnabled: state.is_backup_enabled === true,
        canEnableBackup: state.can_enable_backup === true,
        canExportPhrase: state.can_export_phrase === true,
    };
}

/** 单条钱包流水视图（金额保留 TDLib 的有符号最小单位字符串） */
export interface WalletTransactionView {
    id: string;
    /** Unix 秒 */
    date: number;
    /** 手续费（最小单位，无符号） */
    feeAmount: string;
    /** 交易是否失败 */
    failed: boolean;
    /** 成功交易的链上哈希；失败时为空串 */
    txHash: string;
    /** 对方 TON 地址；非转账交易可能为空 */
    peerAddress: string;
    /** 对方用户 id；0 表示未知 */
    peerUserId: number;
    /** 对方地址绑定的域名；空串表示没有 */
    peerDomain: string;
    kind: WalletTransactionKind;
    /** 带符号金额（最小单位）；没有金额的交易（NFT / 换钥）为 null */
    amount: string | null;
    /** 是否从本钱包转出 */
    isOutgoing: boolean;
    /** 手续费是否由 Telegram 承担（仅 transfer 类型有） */
    isGasless: boolean;
    /** 备注；空串表示没有 */
    comment: string;
    /** 备注是否加密（需要私钥解密） */
    isCommentEncrypted: boolean;
    /** on-ramp 服务商名称；其它类型为空串 */
    providerName: string;
    /** NFT 转账 / 礼物铸造携带的 NFT；其它类型为 null */
    nft: tonNft | null;
    /** 礼物是否在资料页展示过（仅 telegramGiftTransfer） */
    isSaved: boolean;
}

/** 把 tonWalletTransaction 归一化成列表 / 详情用的视图对象 */
export function mapTonWalletTransaction(tx: tonWalletTransaction): WalletTransactionView {
    const base: WalletTransactionView = {
        id: tx.id,
        date: tx.date,
        feeAmount: tx.fee_amount ?? '0',
        failed: tx.state?._ === 'tonWalletTransactionStateFailed',
        txHash: tx.state?._ === 'tonWalletTransactionStateSucceeded' ? (tx.state.tx_hash ?? '') : '',
        peerAddress: tx.peer_address ?? '',
        peerUserId: tx.peer_user_id ?? 0,
        peerDomain: tx.peer_domain ?? '',
        kind: 'unknown',
        amount: null,
        isOutgoing: false,
        isGasless: false,
        comment: '',
        isCommentEncrypted: false,
        providerName: '',
        nft: null,
        isSaved: false,
    };

    const type = tx.type;
    switch (type._) {
        case 'tonWalletTransactionTypeTransfer':
            base.kind = 'transfer';
            base.amount = type.amount ?? '0';
            base.isOutgoing = isNegativeGramAmount(base.amount);
            base.isGasless = type.is_gasless === true;
            base.comment = type.comment ?? '';
            base.isCommentEncrypted = type.is_comment_encrypted === true;
            break;
        case 'tonWalletTransactionTypeOnRampDeposit':
            base.kind = 'onRampDeposit';
            base.amount = type.amount ?? '0';
            base.isOutgoing = false;
            base.providerName = type.provider_name ?? '';
            break;
        case 'tonWalletTransactionTypeNftTransfer':
            base.kind = 'nftTransfer';
            base.nft = type.nft ?? null;
            base.isOutgoing = type.is_outgoing === true;
            base.comment = type.comment ?? '';
            base.isCommentEncrypted = type.is_comment_encrypted === true;
            break;
        case 'tonWalletTransactionTypeTelegramGiftTransfer':
            base.kind = 'telegramGiftTransfer';
            base.nft = type.nft ?? null;
            base.isOutgoing = type.is_outgoing === true;
            base.isSaved = type.is_saved === true;
            break;
        case 'tonWalletTransactionTypeKeyChange':
            base.kind = 'keyChange';
            break;
        default:
            // TDLib 新增类型：保留原始交易但标记为 unknown，文案显示「交易」
            base.kind = 'unknown';
            break;
    }
    return base;
}

/**
 * 流水标题的 i18n key。
 * 转账按金额正负区分收 / 支；NFT 与礼物按 is_outgoing 区分转入 / 转出。
 */
export function walletTransactionTitleKey(view: WalletTransactionView): string {
    switch (view.kind) {
        case 'transfer':
            return view.isOutgoing ? 'walletPage.tx.typeTransferOut' : 'walletPage.tx.typeTransferIn';
        case 'onRampDeposit':
            return 'walletPage.tx.typeOnRamp';
        case 'nftTransfer':
            return view.isOutgoing ? 'walletPage.tx.typeNftOut' : 'walletPage.tx.typeNftIn';
        case 'telegramGiftTransfer':
            return view.isOutgoing ? 'walletPage.tx.typeGiftOut' : 'walletPage.tx.typeGiftIn';
        case 'keyChange':
            return 'walletPage.tx.typeKeyChange';
        case 'unknown':
            return 'walletPage.tx.typeUnknown';
    }
}

/** 流水金额展示（带 +/– 号）；没有金额的交易返回 null，由界面显示占位 */
export function formatWalletTransactionAmount(view: WalletTransactionView): FormattedGramAmount | null {
    if (view.amount === null) return null;
    return formatGramAmount(view.amount, view.isOutgoing);
}

/** 余额展示：固定两位小数（与官方钱包卡面一致） */
export function formatWalletBalance(gramAmount: string): FormattedGramAmount {
    return formatGramBalance(gramAmount);
}

/**
 * 解析用户输入的 Gram 数量为最小单位字符串。
 * 接受最多 9 位小数（1 nanogram 精度），免费赠送前导 0 与空格；非法输入返回 null。
 */
export function parseGramInputToUnits(input: string): string | null {
    const cleaned = input.trim().replace(/\s+/g, '').replace(',', '.');
    if (!cleaned || !/^\d{0,12}(?:\.\d{0,9})?$/.test(cleaned)) return null;
    if (!/\d/.test(cleaned)) return null;
    const [wholePart, fractionPart] = cleaned.split('.');
    const whole = BigInt(wholePart || '0');
    const fraction = BigInt((fractionPart ?? '').padEnd(9, '0') || '0');
    return (whole * GRAM_SCALE_BIG + fraction).toString();
}

/** 最小单位字符串比较：a < b 返回负数，a > b 返回正数，相等返回 0 */
export function compareGramUnits(a: string, b: string): number {
    const left = toBigInt(a);
    const right = toBigInt(b);
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

/** 最小单位金额是否大于 0 */
export function isPositiveGramUnits(units: string): boolean {
    return toBigInt(units) > 0n;
}

/** 把 TDLib 的数值型金额（number 或字符串）安全转成 BigInt */
function toBigInt(value: string | number): bigint {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
    }
    try {
        return BigInt((value ?? '').trim() || '0');
    } catch {
        return 0n;
    }
}

/**
 * 地址缩写（用于列表副标题）：保留头 6 位与尾 4 位，中间省略。
 * 地址为空返回空串，交给界面显示占位。
 */
export function shortTonAddress(address: string, head = 6, tail = 4): string {
    const text = (address ?? '').trim();
    if (!text) return '';
    if (text.length <= head + tail + 1) return text;
    return text.slice(0, head) + '\u2026' + text.slice(-tail);
}

/** 对方展示名：域名优先，其次用户 id，最后缩写地址（用户昵称由组件额外解析） */
export function walletTransactionPeerLabel(view: WalletTransactionView): string {
    if (view.peerDomain) return view.peerDomain;
    const address = shortTonAddress(view.peerAddress);
    if (address) return address;
    return '';
}

/** 钱包状态是否算「还没有可用钱包」：地址为空且没有余额 */
export function isWalletMissing(state: WalletStateView | null): boolean {
    if (!state) return true;
    return !state.address.trim() && toBigInt(state.gramAmount) === 0n;
}
