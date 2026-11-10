/**
 * Gram 转账（`messageTonWalletTransfer`）的数值与文案格式化。
 *
 * 金额与地址的规则逐条对齐 Telegram 的 `WalletActionLayout`：
 * - 金额按最小单位（nanogram，1 Gram = 1e9）换算；
 * - 小于 0.01 Gram 时保留最多 4 位小数，否则最多 2 位，末尾零一律去掉；
 * - 入账带 `+`、出账带 `–`（en dash，官方就是用它，不是 ASCII 减号）；
 * - 地址转大写后每 4 个字符分组，再从中间折成两行。
 */

/** 1 Gram = 1e9 最小单位 */
export const GRAM_SCALE = 1_000_000_000;
/** BigInt 版的 1 Gram（最小单位），用于避免大余额丢精度 */
const GRAM_SCALE_BIG = 1_000_000_000n;
/** 低于这个金额（0.01 Gram）时多留两位小数，否则小额会显示成 0 */
const TWO_DECIMAL_THRESHOLD_BIG = GRAM_SCALE_BIG / 100n;

/** TDLib 1.8.70 起金额改为字符串（nanogram），旧版本为 number；两种都接受 */
export type GramAmount = number | string;

/**
 * 卡片尺寸
 * 卡片本体 220×148、圆角 16dp（官方 198×132，这里加宽 22dp 让金额与两行地址更舒展，
 * 并比官方的 132dp 高 16dp，给放大的钻石让出位置）。
 */
export const TON_CARD_WIDTH = 220;
export const TON_CARD_HEIGHT = 148;
export const TON_CARD_RADIUS = 16;
/** 钻石边长（dp）：官方 42dp，这里放大到 56dp，屏幕上的物理像素更多、边缘更干净 */
export const TON_STONE_SIZE = 56;
/** 卡片相对服务消息底色的内缩：底色比卡片四周各大 6dp，卡片才像浮在上面 */
export const TON_CARD_INSET = 6;

/** 转账卡片右上角缎带的状态 */
export type TonTransferStatus = 'received' | 'sent' | 'failed';

/** 缎带底色，取自官方三处常量（收到 / 已发送 / 失败） */
export const TON_RIBBON_COLORS: Record<TonTransferStatus, string> = {
    received: '#4BB9FE',
    sent: '#15BE00',
    failed: '#F55951',
};

export interface FormattedGramAmount {
    /** 入账 `+` / 出账 `–` */
    sign: string;
    /** 整数部分 */
    whole: string;
    /** 小数部分（含前导小数点，可能为空串）；渲染时按 0.75 倍字号缩小 */
    fraction: string;
}

/** 最小单位金额 → BigInt（兼容 1.8.69 的 number 与 1.8.70 的 string） */
function gramAmountToBigInt(amount: GramAmount): bigint {
    if (typeof amount === 'number') {
        return Number.isFinite(amount) ? BigInt(Math.trunc(amount)) : 0n;
    }
    const text = amount.trim();
    if (!text) return 0n;
    try {
        return BigInt(text);
    } catch {
        const value = Number(text);
        return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
    }
}

/** 金额是否为负（1.8.70 用带符号字符串表示出账） */
export function isNegativeGramAmount(amount: GramAmount): boolean {
    return gramAmountToBigInt(amount) < 0n;
}

/** 金额换算成 JS number（仅用于复数选择等近似场景，不用于展示） */
export function gramAmountToNumber(amount: GramAmount): number {
    return Number(gramAmountToBigInt(amount));
}

/**
 * 按小数位格式化（等价于 DecimalFormat("0.##")）。
 * 用 BigInt 做「加半个单位再整除」实现四舍五入，避免大额余额丢精度。
 */
function formatGramValue(absolute: bigint, maxDecimals: number): { whole: string; fraction: string } {
    const factor = 10n ** BigInt(maxDecimals);
    const scaled = (absolute * factor + GRAM_SCALE_BIG / 2n) / GRAM_SCALE_BIG;
    const whole = (scaled / factor).toString();
    const fraction = (scaled % factor)
        .toString()
        .padStart(maxDecimals, '0')
        .replace(/0+$/, '');
    return { whole, fraction: fraction ? `.${fraction}` : '' };
}

/**
 * 格式化转账金额（`messageTonWalletTransfer.amount`）。
 *
 * @param amount 最小单位的有符号金额（1.8.69 为 number，1.8.70 起为 string）
 * @param forceOutgoing 消息是自己发出时强制显示负号：TDLib 偶尔会给出正数，
 *                      但「我转给别人」在语义上一定是支出
 * @returns 符号、整数部分与小数部分
 */
export function formatGramAmount(amount: GramAmount, forceOutgoing = false): FormattedGramAmount {
    const nano = gramAmountToBigInt(amount);
    const absolute = nano < 0n ? -nano : nano;
    const decimals = absolute < TWO_DECIMAL_THRESHOLD_BIG ? 4 : 2;
    const { whole, fraction } = formatGramValue(absolute, decimals);
    return {
        sign: nano < 0n || forceOutgoing ? '\u2013' : '+',
        whole,
        fraction,
    };
}

/**
 * 地址排版：转大写 → 每 4 字符一组 → 从中间折成两行。
 *
 * @param address TON 地址（48 字符 base64url）
 * @returns 已折行的地址文本；分组不足两组时原样返回
 */
export function formatGramAddress(address: string): string {
    const upper = address.trim().toUpperCase();
    if (!upper) return '';
    const groups = upper.match(/.{1,4}/g) ?? [];
    if (groups.length < 2) return upper;
    const lineBreak = Math.floor(groups.length / 2);
    return groups
        .map((group, index) => (index === 0 ? group : (index === lineBreak ? '\n' : ' ') + group))
        .join('');
}

/**
 * 格式化手续费（`tonWalletTransaction.fee_amount`，无符号最小单位）。
 *
 * 手续费往往比转账金额小两个数量级（0.005 Gram），沿用金额的小数位规则：
 * 不足 0.01 Gram 时保留 4 位，否则 2 位，末尾零去掉。
 *
 * @param amount 最小单位的费用（取绝对值）
 * @returns 纯数字文案，例如 `0.0055`
 */
export function formatGramFee(amount: GramAmount): string {
    const nano = gramAmountToBigInt(amount);
    const absolute = nano < 0n ? -nano : nano;
    const decimals = absolute < TWO_DECIMAL_THRESHOLD_BIG ? 4 : 2;
    const { whole, fraction } = formatGramValue(absolute, decimals);
    return `${whole}${fraction}`;
}

/**
 * 格式化转账详情里的日期：`2026/11/05 18:20`（跟随系统区域设置）。
 *
 * @param timestamp Unix 秒
 * @returns 格式化后的日期；无时间戳时返回空串
 */
export function formatGramDate(timestamp: number | undefined): string {
    if (!timestamp) return '';
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(timestamp * 1000));
}

/**
 * 详情弹窗里的地址排版：仍然 4 字符一组，但每行固定 `groupsPerLine` 组。
 *
 * @param address TON 地址（48 字符 base64url）
 * @param groupsPerLine 每行几组（默认 4 组 = 16 字符，48 字符正好 3 行）
 */
export function formatGramAddressLines(address: string, groupsPerLine = 4): string {
    const upper = address.trim().toUpperCase();
    if (!upper) return '';
    const groups = upper.match(/.{1,4}/g) ?? [];
    const lines: string[] = [];
    for (let index = 0; index < groups.length; index += groupsPerLine) {
        lines.push(groups.slice(index, index + groupsPerLine).join(' '));
    }
    return lines.join('\n');
}

/**
 * 推断转账状态：出账失败 / 出账成功 / 入账。
 *
 * @param amount 最小单位的有符号金额（1.8.69 为 number，1.8.70 起为 string）
 * @param isOutgoing 消息是否为自己发出
 * @param failed 发送状态是否为失败
 */
export function tonTransferStatus(amount: GramAmount, isOutgoing: boolean, failed: boolean): TonTransferStatus {
    if (failed) return 'failed';
    if (isOutgoing || isNegativeGramAmount(amount)) return 'sent';
    return 'received';
}
