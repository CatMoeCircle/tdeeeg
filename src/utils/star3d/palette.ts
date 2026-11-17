/**
 * 星星的金色配色。
 *
 * 数值来源：Telegram 官方桌面端渲染器里写死的主题常量（StarsGradient1 /
 * StarsGradient2 / 对话框背景），这里换算成 0..1 的浮点。
 *
 * 官方更新配色时只做两件事：金色外观的渐变直接用两个金色；背景色取
 * "Premium 紫半透明混合进对话框底色"，白天对白、夜间对 #1E1E1E。
 * 另外夜间的高光更弱更散（spec1 1.0 / spec2 0.2，白天是 2.0 / 0.13）。
 */

/** 颜色三元组，0..1 */
export type Rgb = readonly [number, number, number];

/** 一套星星外观需要的颜色与高光强度 */
export interface StarPalette {
    /** 渐变起点色 */
    gradientColor1: Rgb;
    /** 渐变终点色 */
    gradientColor2: Rgb;
    /** 背景色（Premium 分支才读，金色分支保留同值以免换外观时闪色） */
    backgroundColor: Rgb;
    /** 第一层高光强度（Premium 分支） */
    spec1: number;
    /** 第二层高光强度（Premium 分支） */
    spec2: number;
}

/** Premium 星的第一个渐变色 */
const PREMIUM_GRADIENT_1 = 0x55a5ff;
/** Premium 星的第二个渐变色 */
const PREMIUM_GRADIENT_2 = 0xa767ff;
/** 金色星星的渐变起点 */
const STARS_GRADIENT_1 = 0xfec846;
/** 金色星星的渐变终点 */
const STARS_GRADIENT_2 = 0xec920a;
/** 白天对话框底色 */
const LIGHT_DIALOG_BACKGROUND = 0xffffff;
/** 夜间对话框底色 */
const DARK_DIALOG_BACKGROUND = 0x1e1e1e;

/** 取一个 0..255 通道并归一到 0..1 */
function channel(color: number, shift: number): number {
    return ((color >> shift) & 0xff) / 255;
}

/** 0xRRGGBB → 浮点三元组 */
function toRgb(color: number): Rgb {
    return [channel(color, 16), channel(color, 8), channel(color, 0)];
}

/** 逐通道线性混合（alpha 不参与） */
function blend(from: number, to: number, ratio: number): Rgb {
    return [
        channel(from, 16) * (1 - ratio) + channel(to, 16) * ratio,
        channel(from, 8) * (1 - ratio) + channel(to, 8) * ratio,
        channel(from, 0) * (1 - ratio) + channel(to, 0) * ratio,
    ];
}

/** 背景色：第二个 Premium 渐变色半透明混进对话框底色 */
const BACKGROUND_COLOR = {
    light: blend(PREMIUM_GRADIENT_2, LIGHT_DIALOG_BACKGROUND, 0.5),
    night: blend(PREMIUM_GRADIENT_2, DARK_DIALOG_BACKGROUND, 0.5),
} as const;

/** 金色星星的白天配色（Stars 页默认） */
export const GOLDEN_STAR_PALETTE_LIGHT: StarPalette = {
    // 注意顺序：官方的 Stars 渐变是「亮金 → 暗金」，与 Premium 的次序相反
    gradientColor1: toRgb(STARS_GRADIENT_1),
    gradientColor2: toRgb(STARS_GRADIENT_2),
    backgroundColor: BACKGROUND_COLOR.light,
    spec1: 2.0,
    spec2: 0.13,
};

/** 金色星星的夜间配色：高光更弱、背景更暗 */
export const GOLDEN_STAR_PALETTE_NIGHT: StarPalette = {
    gradientColor1: toRgb(STARS_GRADIENT_1),
    gradientColor2: toRgb(STARS_GRADIENT_2),
    backgroundColor: BACKGROUND_COLOR.night,
    spec1: 1.0,
    spec2: 0.2,
};

/** 紫色 Premium 星的白天配色（不接 UI，保留以对齐官方两套外观） */
export const PREMIUM_STAR_PALETTE_LIGHT: StarPalette = {
    // 官方这里把两个 Premium 色**反过来**用
    gradientColor1: toRgb(PREMIUM_GRADIENT_2),
    gradientColor2: toRgb(PREMIUM_GRADIENT_1),
    backgroundColor: BACKGROUND_COLOR.light,
    spec1: 2.0,
    spec2: 0.13,
};

/** 紫色 Premium 星的夜间配色 */
export const PREMIUM_STAR_PALETTE_NIGHT: StarPalette = {
    gradientColor1: toRgb(PREMIUM_GRADIENT_2),
    gradientColor2: toRgb(PREMIUM_GRADIENT_1),
    backgroundColor: BACKGROUND_COLOR.night,
    spec1: 1.0,
    spec2: 0.2,
};

/** 按外观与日夜取一套配色 */
export function starPalette(golden: boolean, night: boolean): StarPalette {
    if (golden) return night ? GOLDEN_STAR_PALETTE_NIGHT : GOLDEN_STAR_PALETTE_LIGHT;
    return night ? PREMIUM_STAR_PALETTE_NIGHT : PREMIUM_STAR_PALETTE_LIGHT;
}
