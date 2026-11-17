/**
 * Gram 钱包卡片的材质配色。
 *
 * 背景色来自礼物 backdrop（center / edge），但卡片是有厚度的 3D 材质：侧面、极光、
 * 边缘光、镜面高光、投影都不能再用固定的品牌蓝，否则粉 / 橙 / 黑卡一倾斜就露出蓝边。
 * 这里的取色方式对齐 Telegram Desktop 的 WalletCardMaterials：
 * 以官方蓝卡的明度 / 彩度为基准，把礼物的色相套上去（OKLCH），
 * 深色礼物保留自己的深度，不会被抬成蓝卡的亮度。
 */
import type { WalletCardPalette } from './walletCard';

/** 卡片各层最终写进 CSS 的颜色（已含透明度） */
export interface WalletCardMaterialLayers {
    edgeTop: string;
    edgeBottom: string;
    auroraCore: string;
    auroraMid: string;
    rimCore: string;
    rimMid: string;
    rimBevel: string;
    sheenA: string;
    sheenB: string;
    sheenC: string;
    chipTint: string;
    shadow: string;
    glow: string;
    spark: string;
    fiat: string;
    unitShadow: string;
    address: string;
    stoneShadow: string;
}

export interface WalletCardMaterial {
    background: string;
    sheen: string;
    accent: string;
    edgeColor: string;
    /** 背景符号的填充色（深色卡片用白色） */
    pattern: string;
    /** 符号层的整体不透明度 */
    patternOpacity: number;
    glint: string;
    isGift: boolean;
    layers: WalletCardMaterialLayers;
}

/** 官方蓝卡：保持现有观感，不参与礼物取色 */
export const DEFAULT_WALLET_CARD_MATERIAL: WalletCardMaterial = {
    background: '#0479e6',
    sheen: '#169af9',
    accent: '#6ddcff',
    edgeColor: '#0a4d90',
    pattern: '#ffffff',
    patternOpacity: 0,
    glint: '#ffffff',
    isGift: false,
    layers: {
        edgeTop: '#0a4d90',
        edgeBottom: '#052f5c',
        auroraCore: 'rgba(150, 235, 255, 0.34)',
        auroraMid: 'rgba(52, 168, 255, 0.2)',
        rimCore: 'rgba(255, 255, 255, 0.95)',
        rimMid: 'rgba(170, 238, 255, 0.62)',
        rimBevel: 'rgba(90, 200, 255, 0.16)',
        sheenA: 'rgba(140, 230, 255, 0.18)',
        sheenB: 'rgba(255, 255, 255, 0.16)',
        sheenC: 'rgba(140, 230, 255, 0.14)',
        chipTint: 'rgba(214, 240, 255, 0.2)',
        shadow: 'rgba(0, 38, 74, 0.5)',
        glow: 'rgba(92, 198, 255, 0.32)',
        spark: '#ffffff',
        fiat: 'rgba(168, 240, 255, 0.95)',
        unitShadow: 'rgba(0, 40, 85, 0.34)',
        address: 'rgba(0, 69, 208, 0.85)',
        stoneShadow: 'rgba(0, 50, 100, 0.28)',
    },
};

/** 从礼物 backdrop 取材质；缺少数值色（旧数据 / 示例配色）时退回蓝卡 */
export function walletCardMaterialFromPalette(
    palette?: WalletCardPalette | null,
): WalletCardMaterial {
    if (!palette) {
        return DEFAULT_WALLET_CARD_MATERIAL;
    }
    // 新数据带 TDLib 原始整数；手工构造的 palette 只有 CSS 字符串，也尽量还原。
    const center = palette.centerColor ?? parseCssColor(palette.center);
    const edge = palette.edgeColor ?? parseCssColor(palette.edge);
    if (center == null || edge == null) {
        return DEFAULT_WALLET_CARD_MATERIAL;
    }
    const text = palette.textColor ?? parseCssColor(palette.text) ?? 0xffffffff;
    return materialFromBackdrop(center, edge, text);
}

// ---------------------------------------------------------------------------
// OKLCH：与 Telegram Desktop WalletCardMaterials 的拟合口径一致
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number];

const STOCK = {
    background: 0xff0079ff,
    sheen: 0xff169af9,
    accent: 0xff6ddcff,
    dark: 0xff088fee,
    light: 0xff16abf9,
} as const;

/** 蓝卡材质在着色器里的原始色（线性值） */
const STOCK_PALETTE: Record<string, Rgb> = {
    gradientFrom: [0.025, 0.140, 0.885],
    gradientTo: [0.038, 0.180, 0.955],
    reflection: [0.090, 0.565, 0.965],
    spark: [0.55, 0.8, 1.0],
    bevel: [0.10, 0.36, 0.85],
    edge: [0.014, 0.085, 0.40],
    streak: [0.30, 0.62, 1.0],
    ring: [0.047, 0.451, 0.835],
};

const MATERIAL_SATURATION = 1.6;

interface OklchColor {
    L: number;
    C: number;
    H: number;
}

function materialFromBackdrop(centerColor: number, edgeColor: number, textColor?: number): WalletCardMaterial {
    const center = 0xff000000 | (centerColor >>> 0);
    const edge = 0xff000000 | (edgeColor >>> 0);

    const gift = oklchOf(blend(center, edge, 0.5));
    const hueDegrees = ((gift.H * 180) / Math.PI + 360) % 360;

    // 紫 / 丁香色在同样彩度下看起来更淡：300° 附近补一点彩度、压一点明度。
    const violet = Math.exp(-Math.pow((hueDegrees - 300) / 38, 2));
    const chroma = clamp((gift.C * 1.5) / 0.155, 0.15, 1.0) * (1 + 0.18 * violet);
    const lightnessShift = -0.025 * violet;

    const c = oklchOf(center);
    const e = oklchOf(edge);
    const darkness = clamp((0.6 - (c.L + e.L) / 2) / 0.15, 0, 1);

    const stockDark = oklchOf(STOCK.dark).L;
    const stockLight = oklchOf(STOCK.light).L;

    function tint(stock: number): number {
        const reference = oklchOf(stock);
        const position = clamp((reference.L - stockDark) / (stockLight - stockDark), -2, 3);
        const own = e.L - 0.02 + position * (c.L - e.L);
        const lightness = reference.L + (own - reference.L) * darkness + lightnessShift;

        // 永远不要比背景本身艳太多，粉色尤其容易过头。
        const cap = c.C * 1.2 * (reference.C / 0.173);
        const colorfulness = Math.min(reference.C * chroma, cap) * (1 - darkness) + c.C * 1.1 * darkness;

        return oklchArgb(clamp(lightness, 0.05, 0.97), colorfulness, gift.H);
    }

    /** 浅色强调色：深色卡上也要保持清晰的亮度 */
    function accentOf(color: number): number {
        const o = oklchOf(color);
        return o.L >= 0.8 ? color : oklchArgb(0.8, o.C, o.H);
    }

    const tone = oklchOf(tint(STOCK.dark));
    const darkCard = e.L < 0.2;
    const pattern = darkCard ? 0xffffffff : oklchArgb(tone.L * 0.7, tone.C * 1.4, tone.H);
    const glint = darkCard ? 0xffffffff : oklchArgb(tone.L * 0.86, tone.C * 1.6, tone.H);

    // 材质色的“屏幕观感”：编码 + 饱和；CSS 里直接用这一层颜色。
    function tintShown(stock: Rgb): string {
        return hexOf(tint(toShown(stock)));
    }

    const reflection = tintShown(STOCK_PALETTE.reflection);
    const spark = tintShown(STOCK_PALETTE.spark);
    const bevel = tintShown(STOCK_PALETTE.bevel);
    const edgeTone = tintShown(STOCK_PALETTE.edge);
    const streak = tintShown(STOCK_PALETTE.streak);

    const background = hexOf(tint(STOCK.background));
    const sheen = hexOf(tint(STOCK.sheen));
    const accent = hexOf(accentOf(tint(STOCK.accent)));
    const text = textColor == null ? '#ffffff' : hexOf(0xff000000 | (textColor >>> 0));

    return {
        background,
        sheen,
        accent,
        edgeColor: edgeTone,
        pattern: hexOf(pattern),
        patternOpacity: darkCard ? 0.32 : 1,
        glint: hexOf(glint),
        isGift: true,
        layers: {
            edgeTop: mixHex(edgeTone, '#ffffff', 0.08),
            edgeBottom: mixHex(edgeTone, '#000000', 0.45),
            auroraCore: withAlpha(spark, 0.34),
            auroraMid: withAlpha(reflection, 0.2),
            rimCore: withAlpha(spark, 0.95),
            rimMid: withAlpha(accent, 0.62),
            rimBevel: withAlpha(bevel, 0.16),
            sheenA: withAlpha(reflection, 0.18),
            sheenB: withAlpha('#ffffff', 0.16),
            sheenC: withAlpha(streak, 0.14),
            chipTint: withAlpha(spark, 0.2),
            shadow: withAlpha(edgeTone, 0.5),
            glow: withAlpha(accent, 0.32),
            spark,
            fiat: withAlpha(spark, 0.95),
            unitShadow: withAlpha(edgeTone, 0.34),
            address: withAlpha(text, 0.85),
            stoneShadow: withAlpha(edgeTone, 0.28),
        },
    };
}

// ---------------------------------------------------------------------------
// 颜色工具
// ---------------------------------------------------------------------------

/** CSS 颜色（#rrggbb / rgb() / rgba()）→ 0xRRGGBB；无法识别时 null */
function parseCssColor(color?: string | null): number | null {
    if (!color) return null;
    const value = color.trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (hex) {
        return Number.parseInt(hex[1], 16);
    }
    const rgb = /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/i.exec(value);
    if (rgb) {
        return (Number(rgb[1]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[3]);
    }
    return null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function decode(v: number): number {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function encode(v: number): number {
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function cbrt(x: number): number {
    return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3);
}

function blend(from: number, to: number, ratio: number): number {
    let result = 0xff000000;
    for (let shift = 16; shift >= 0; shift -= 8) {
        const a = (from >>> shift) & 0xff;
        const b = (to >>> shift) & 0xff;
        result |= ((a * (1 - ratio) + b * ratio) | 0) << shift;
    }
    return result >>> 0;
}

function oklchOf(argb: number): OklchColor {
    const r = decode(((argb >> 16) & 0xff) / 255);
    const g = decode(((argb >> 8) & 0xff) / 255);
    const b = decode((argb & 0xff) / 255);

    const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

    const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

    return { L: lightness, C: Math.sqrt(a * a + bb * bb), H: Math.atan2(bb, a) };
}

function toLinear(lightness: number, chroma: number, hue: number, rgb: number[]): void {
    const a = chroma * Math.cos(hue);
    const b = chroma * Math.sin(hue);

    let l = lightness + 0.3963377774 * a + 0.2158037573 * b;
    let m = lightness - 0.1055613458 * a - 0.0638541728 * b;
    let s = lightness - 0.0894841775 * a - 1.291485548 * b;

    l = l * l * l;
    m = m * m * m;
    s = s * s * s;

    rgb[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    rgb[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    rgb[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
}

function outOfGamut(rgb: number[]): boolean {
    return rgb[0] < -0.001 || rgb[0] > 1.001
        || rgb[1] < -0.001 || rgb[1] > 1.001
        || rgb[2] < -0.001 || rgb[2] > 1.001;
}

/** OKLCH → sRGB；超出色域时逐步降低彩度，保持明度与色相 */
function oklchArgb(lightness: number, chroma: number, hue: number): number {
    const rgb = [0, 0, 0];
    toLinear(lightness, chroma, hue, rgb);

    for (let guard = 0; guard < 40 && outOfGamut(rgb); guard++) {
        chroma *= 0.95;
        toLinear(lightness, chroma, hue, rgb);
    }

    let result = 0xff000000;
    for (let i = 0; i < 3; i++) {
        const encoded = encode(clamp(rgb[i], 0, 1));
        result |= Math.floor(encoded * 255 + 0.5) << (16 - 8 * i);
    }
    return result >>> 0;
}

function luminance(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toShown(tone: Rgb): number {
    const r = encode(Math.max(tone[0], 0));
    const g = encode(Math.max(tone[1], 0));
    const b = encode(Math.max(tone[2], 0));
    const lum = luminance(r, g, b);

    return toArgb([
        lum + (r - lum) * MATERIAL_SATURATION,
        lum + (g - lum) * MATERIAL_SATURATION,
        lum + (b - lum) * MATERIAL_SATURATION,
    ]);
}

function toArgb(color: Rgb): number {
    const channel = (v: number) => clamp(Math.floor(v * 255 + 0.5), 0, 255);
    return (0xff000000 | (channel(color[0]) << 16) | (channel(color[1]) << 8) | channel(color[2])) >>> 0;
}

function hexOf(argb: number): string {
    return '#' + (argb & 0xffffff).toString(16).padStart(6, '0');
}

/** #rrggbb + 透明度 → rgba() */
export function withAlpha(color: string, alpha: number): string {
    const value = Number.parseInt(color.replace('#', ''), 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/** 两个 #rrggbb 线性混合 */
export function mixHex(from: string, to: string, ratio: number): string {
    const a = Number.parseInt(from.replace('#', ''), 16);
    const b = Number.parseInt(to.replace('#', ''), 16);
    const t = clamp(ratio, 0, 1);
    const channel = (shift: number) => {
        const av = (a >> shift) & 0xff;
        const bv = (b >> shift) & 0xff;
        return Math.round(av * (1 - t) + bv * t);
    };
    return '#' + [channel(16), channel(8), channel(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
