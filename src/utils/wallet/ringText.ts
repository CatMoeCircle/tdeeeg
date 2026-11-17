/**
 * Gram 钱包「收款」弹窗里绕二维码转圈的地址带。
 *
 * 几何与排版参考 Telegram Desktop 的 `Views/Wallet/Popups/WalletSharePopup.xaml.cs`：
 * - `RoundedRectPath`：路径是圆角矩形，距离 0 在顶边中点，顺时针；
 * - `RingTextPresenter`：地址按 4 字符分组，每个字重 1、每组末尾补一个
 *   `separatorWeight` 的分隔格，整条带按总字重**均分周长**（等宽字体 + 两端对齐），
 *   所以每个字形落在周长的固定比例上，与实测字宽无关。
 *
 * 本文件只做几何与排版计算，不碰 DOM：动画由组件每帧取一次 `evaluate()` 摆字，
 * 静止态（用户要求减少动效）直接摆最后一帧，两条路径共用同一份几何。
 */

const HALF_PI = Math.PI / 2;
const PI = Math.PI;

/** 路径上某一点的坐标与切线角（弧度，0 = 字头朝上、沿 +X 前进） */
export interface RingPose {
    x: number;
    y: number;
    angle: number;
}

/** 圆角矩形环路径 */
export interface RoundedRingPath {
    /** SVG `path` / CSS `offset-path: path(...)` 用的路径数据 */
    data: string;
    /** 周长（px） */
    length: number;
    /** 把「沿路径的弧长」映射到坐标与切线角 */
    evaluate(distance: number): RingPose;
}

/** 路径上的一个字形（`fraction` 是沿周长的比例，0~1） */
export interface RingGlyph {
    char: string;
    fraction: number;
}

function fmt(value: number): string {
    return (Math.round(value * 100) / 100).toString();
}

/**
 * 圆角矩形环路径。
 *
 * @param width 路径外框宽
 * @param height 路径外框高
 * @param radius 圆角半径
 * @param inset 外框四边内缩（字形中心落在路径上，留出字身的高度）
 */
export function roundedRingPath(
    width: number,
    height: number,
    radius: number,
    inset = 0,
): RoundedRingPath {
    const x = inset;
    const y = inset;
    const w = Math.max(1, width - inset * 2);
    const h = Math.max(1, height - inset * 2);
    // 半径下限取 1：`evaluate` 里按半径换算角位移，0 会除出 NaN
    const r = Math.max(1, Math.min(radius, Math.min(w, h) / 2));
    const arc = (PI * r) / 2;
    const edgeH = Math.max(0, w - 2 * r);
    const edgeV = Math.max(0, h - 2 * r);
    const length = 2 * edgeH + 2 * edgeV + 4 * arc;

    // 与 evaluate 的起点/方向一致：顶边中点起，顺时针走一圈
    const data = [
        'M', fmt(x + w / 2), fmt(y),
        'L', fmt(x + w - r), fmt(y),
        'A', fmt(r), fmt(r), '0', '0', '1', fmt(x + w), fmt(y + r),
        'L', fmt(x + w), fmt(y + h - r),
        'A', fmt(r), fmt(r), '0', '0', '1', fmt(x + w - r), fmt(y + h),
        'L', fmt(x + r), fmt(y + h),
        'A', fmt(r), fmt(r), '0', '0', '1', fmt(x), fmt(y + h - r),
        'L', fmt(x), fmt(y + r),
        'A', fmt(r), fmt(r), '0', '0', '1', fmt(x + r), fmt(y),
        'L', fmt(x + w / 2), fmt(y),
        'Z',
    ].join(' ');

    const arcPose = (centerX: number, centerY: number, theta: number): RingPose => ({
        x: centerX + Math.cos(theta) * r,
        y: centerY + Math.sin(theta) * r,
        angle: theta + HALF_PI,
    });

    function evaluate(distance: number): RingPose {
        let d = length > 0 ? distance % length : 0;
        if (d < 0) d += length;

        const half = edgeH / 2;

        if (d < half) return { x: x + w / 2 + d, y, angle: 0 }; // 顶边，中点到右
        d -= half;

        if (d < arc) return arcPose(x + w - r, y + r, -HALF_PI + d / r); // 右上角
        d -= arc;

        if (d < edgeV) return { x: x + w, y: y + r + d, angle: HALF_PI }; // 右边，上到下
        d -= edgeV;

        if (d < arc) return arcPose(x + w - r, y + h - r, d / r); // 右下角
        d -= arc;

        if (d < edgeH) return { x: x + w - r - d, y: y + h, angle: PI }; // 底边，右到左
        d -= edgeH;

        if (d < arc) return arcPose(x + r, y + h - r, HALF_PI + d / r); // 左下角
        d -= arc;

        if (d < edgeV) return { x, y: y + h - r - d, angle: -HALF_PI }; // 左边，下到上
        d -= edgeV;

        if (d < arc) return arcPose(x + r, y + r, PI + d / r); // 左上角
        d -= arc;

        return { x: x + r + d, y, angle: 0 }; // 顶边，左到中点
    }

    return { data, length, evaluate };
}

/** 把地址切成两组：4 字符一组的组列表（大写） */
export function ringAddressGroups(address: string): string[] {
    return (address || '').trim().toUpperCase().match(/.{1,4}/g) ?? [];
}

/**
 * 地址沿周长重复几遍合适。
 *
 * 带子按字重均分周长，重复次数决定字距：太多会挤成一团，太少会稀得断成几截。
 * 按「一个权重单位约 `advance` 像素」换算，取最接近整数的重复次数。
 */
export function ringRepeatCount(
    pathLength: number,
    address: string,
    advance = 8.6,
    separatorWeight = 1.5,
): number {
    const groups = ringAddressGroups(address);
    if (!groups.length || pathLength <= 0) return 1;
    const passWeight = groups.length * (4 + separatorWeight);
    const perPass = passWeight * advance;
    return Math.max(1, Math.min(4, Math.round(pathLength / perPass) || 1));
}

/**
 * 一个字符格在路径上的宽度（px）。
 *
 * 字符只有 4 个一组、末组可能不满，所以总字重必须按实际字符数算，
 * 不能拿「组数 × 4」凑——否则末组短的地址算出的格子会偏大，字号跟着偏大。
 *
 * @param pathLength 路径周长
 * @param address TON 地址
 * @param repeats 沿周长重复几遍
 * @param separatorWeight 分隔格相对一个字符的宽度
 */
export function ringCellWidth(
    pathLength: number,
    address: string,
    repeats: number,
    separatorWeight = 1.5,
): number {
    const groups = ringAddressGroups(address);
    if (!groups.length || pathLength <= 0) return 0;
    const chars = groups.reduce((sum, group) => sum + group.length, 0);
    const totalWeight = Math.max(1, repeats) * (chars + groups.length * separatorWeight);
    return pathLength / totalWeight;
}

/**
 * 把地址排成沿路径的等分格：每个字符一格、每组末尾一个分隔格。
 *
 * @param address TON 地址（48 字符 base64url）
 * @param repeats 沿周长重复几遍（见 {@link ringRepeatCount}）
 * @param separatorWeight 分隔格相对一个字符的宽度（Telegram Desktop 参考设计取 1.5）
 */
export function ringGlyphs(
    address: string,
    repeats: number,
    separatorWeight = 1.5,
): RingGlyph[] {
    const groups = ringAddressGroups(address);
    if (!groups.length) return [];

    const cells: { char: string | null; weight: number }[] = [];
    for (let pass = 0; pass < Math.max(1, repeats); pass += 1) {
        for (const group of groups) {
            for (const char of group) cells.push({ char, weight: 1 });
            // 每组末尾都补分隔格（包括最后一组），接缝处的间距才和其他组一致
            cells.push({ char: null, weight: separatorWeight });
        }
    }

    const total = cells.reduce((sum, cell) => sum + cell.weight, 0);
    if (total <= 0) return [];

    const glyphs: RingGlyph[] = [];
    let cursor = 0;
    for (const cell of cells) {
        if (cell.char) {
            // 落在格子的中点，与 Telegram Desktop 的 `distance = cursor + length / 2` 一致
            glyphs.push({ char: cell.char, fraction: (cursor + cell.weight / 2) / total });
        }
        cursor += cell.weight;
    }
    return glyphs;
}
