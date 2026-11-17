/**
 * Gram 钱包卡片（TDLib `tonWalletCard`）的渲染模型。
 *
 * 数据来源是 `userFullInfo.ton_wallet_card`：
 * - `address`：钱包地址（48 字符 base64url）；
 * - `gram_amount`：最小单位余额（1 Gram = 1e9），余额低于 0.01 Gram 时资料页不展示卡片；
 * - `stickers`：收藏礼物（NFT）贴纸，位置是 TDLib 的 `areaPosition` 百分比；
 * - `background_nft_address`：用哪一枚贴纸的礼物配色作为卡片背景。
 *
 * 几何规则参考 Telegram Desktop / Telegram Desktop 的 `wallet_card_space`：X/Y 是贴纸中心相对卡片宽/高的百分比，
 * 宽/高同样是百分比，旋转围绕贴纸中心顺时针，圆角按卡片宽度取百分比。
 * 贴纸保持正方形：height% 必须等于 width% × (卡片宽 / 卡片高)。
 */
import type {
    areaPosition,
    sticker,
    tonWalletCard,
    upgradedGift,
    upgradedGiftBackdropColors,
} from 'tdlib-types';
import { intToRgb, rgbToCss } from '../../store/settings/colors';

/** 卡片设计尺寸（逻辑像素）；宽高比约 1.65，与官方钱包卡一致 */
export const WALLET_CARD_WIDTH = 400;
export const WALLET_CARD_HEIGHT = 243;
/** 卡片圆角（相对 400 宽度的像素值，小尺寸渲染时按比例缩放） */
export const WALLET_CARD_RADIUS = 15;

/** 贴纸边长占卡片宽度的百分比范围：太小看不清，太大会盖住余额 */
export const WALLET_CARD_STICKER_MIN_PERCENT = 12;
export const WALLET_CARD_STICKER_MAX_PERCENT = 34;

/** 卡片配色：中心色 / 边缘色 / 高亮色 / 正文色 */
export interface WalletCardPalette {
    center: string;
    edge: string;
    accent: string;
    text: string;
    /**
     * TDLib 原始 RGB 整数。3D 材质（侧面 / 极光 / 边缘光）需要从礼物的
     * center / edge 重新拟合色相，只有 CSS 字符串不够。
     */
    centerColor?: number;
    edgeColor?: number;
    symbolColor?: number;
    textColor?: number;
}

/** 默认的 Gram 品牌蓝（未设置 `background_nft_address` 时使用） */
export const DEFAULT_WALLET_CARD_PALETTE: WalletCardPalette = {
    center: 'rgba(79, 196, 248, 1)',
    edge: 'rgba(9, 116, 208, 1)',
    accent: 'rgba(122, 230, 255, 1)',
    text: 'rgba(255, 255, 255, 1)',
};

/** 一枚贴纸需要渲染的数据：TDLib 贴纸（真实礼物）或本地资源（示例）二选一 */
export interface WalletCardStickerView {
    position: areaPosition;
    /** 升级礼物的模型贴纸（nft.gift.model.sticker），真实数据 */
    sticker?: sticker;
    /** 本地 TGS / 图片 URL，仅示例数据使用 */
    src?: string;
}

/**
 * `tonWalletCard.stickers` → 渲染用的贴纸列表（真实接入时直接调用）。
 *
 * TDLib 的约定：`nft.gift` 非空时直接画礼物的模型贴纸，不必再下载 NFT 媒体的贴纸；
 * 否则退回 `nft.sticker`。
 */
export function walletCardStickerViews(card: tonWalletCard): WalletCardStickerView[] {
    return card.stickers.map((item) => ({
        position: item.position,
        sticker: item.nft.gift?.model?.sticker ?? item.nft.sticker,
    }));
}

/** 贴纸在卡片坐标系里的像素矩形 */
export interface WalletCardStickerRect {
    left: number;
    top: number;
    width: number;
    height: number;
    rotation: number;
    radius: number;
}

/** 礼物 backdrop 的 RGB 整数 → 卡片配色 */
export function walletCardPaletteFromBackdrop(
    colors?: upgradedGiftBackdropColors | null,
): WalletCardPalette | null {
    if (!colors) return null;
    return {
        center: rgbToCss(intToRgb(colors.center_color)),
        edge: rgbToCss(intToRgb(colors.edge_color)),
        accent: rgbToCss(intToRgb(colors.symbol_color)),
        text: rgbToCss(intToRgb(colors.text_color)),
        centerColor: colors.center_color,
        edgeColor: colors.edge_color,
        symbolColor: colors.symbol_color,
        textColor: colors.text_color,
    };
}

/**
 * 从卡片数据里挑出背景礼物：`background_nft_address` 指向某枚贴纸的 NFT，
 * 用它的 upgradedGift.backdrop.colors 上色；没有匹配时返回 null（用品牌蓝）。
 */
export function walletCardPaletteFromCard(card: tonWalletCard): WalletCardPalette | null {
    return walletCardPaletteFromBackdrop(walletCardBackgroundGift(card)?.backdrop?.colors);
}

/**
 * 背景礼物：`background_nft_address` 指向的那枚贴纸的 NFT。
 * 它的 backdrop 决定卡片颜色，symbol 贴纸决定卡面上的小图标图案。
 */
export function walletCardBackgroundGift(card: tonWalletCard): upgradedGift | null {
    const address = card.background_nft_address.trim();
    if (!address) return null;
    const source = card.stickers.find((item) => item.nft.address === address);
    return source?.nft.gift ?? null;
}

/** 卡面符号图案用的贴纸：礼物 backdrop 的 symbol，没有时返回 null */
export function walletCardPatternSticker(card: tonWalletCard): sticker | null {
    return walletCardBackgroundGift(card)?.symbol?.sticker ?? null;
}

/**
 * 构造贴纸位置：宽度按卡片宽度取百分比，高度按卡片高度换算，保证屏幕上是正方形。
 *
 * @param x 贴纸中心 X（卡片宽度百分比）
 * @param y 贴纸中心 Y（卡片高度百分比）
 * @param width 贴纸边长（卡片宽度百分比）
 * @param rotation 顺时针旋转角度
 */
export function walletCardStickerArea(
    x: number,
    y: number,
    width: number,
    rotation = 0,
): areaPosition {
    return {
        _: 'areaPosition',
        x_percentage: x,
        y_percentage: y,
        width_percentage: width,
        height_percentage: width * (WALLET_CARD_WIDTH / WALLET_CARD_HEIGHT),
        rotation_angle: normalizedRotation(rotation),
        corner_radius_percentage: 0,
    };
}

/** 旋转角归一到 0–360，与 TDLib 的 rotation_angle 取值范围一致 */
export function normalizedRotation(angle: number): number {
    if (!Number.isFinite(angle)) return 0;
    return ((angle % 360) + 360) % 360;
}

/** areaPosition → 卡片内的像素矩形（含中心旋转与圆角） */
export function walletCardStickerRect(
    position: areaPosition,
    cardWidth = WALLET_CARD_WIDTH,
    cardHeight = WALLET_CARD_HEIGHT,
): WalletCardStickerRect {
    const width = (position.width_percentage / 100) * cardWidth;
    const height = (position.height_percentage / 100) * cardHeight;
    return {
        left: (position.x_percentage / 100) * cardWidth - width / 2,
        top: (position.y_percentage / 100) * cardHeight - height / 2,
        width,
        height,
        rotation: position.rotation_angle,
        radius: (position.corner_radius_percentage / 100) * cardWidth,
    };
}

/** 把贴纸中心夹回卡片内（与官方编辑器的 CardStickerClampedCenter 同口径，忽略旋转外接框） */
export function clampWalletCardSticker(position: areaPosition): areaPosition {
    const halfWidth = Math.min(50, position.width_percentage / 2);
    const halfHeight = Math.min(50, position.height_percentage / 2);
    const x = Math.min(100 - halfWidth, Math.max(halfWidth, position.x_percentage));
    const y = Math.min(100 - halfHeight, Math.max(halfHeight, position.y_percentage));
    if (x === position.x_percentage && y === position.y_percentage) return position;
    return { ...position, x_percentage: x, y_percentage: y };
}

/**
 * 默认贴纸布局：给「还没摆过贴纸」的卡片用。
 * 顶部留给最大的那枚礼物（官方卡片常见位置），底部与右侧错开余额、芯片、地址与用户名。
 */
export const DEFAULT_WALLET_CARD_STICKERS: readonly areaPosition[] = [
    walletCardStickerArea(17, 18, 22, -6),
    walletCardStickerArea(42, 11, 12, 8),
    walletCardStickerArea(63, 14, 12, -10),
    walletCardStickerArea(83, 67, 13, 6),
    walletCardStickerArea(53, 72, 17, -8),
    walletCardStickerArea(12, 69, 14, 12),
];
