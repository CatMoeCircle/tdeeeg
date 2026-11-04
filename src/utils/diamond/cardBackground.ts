/**
 * 转账卡片的「黑胶唱片」底色：81 个浮点系数的八阶二维切比雪夫光场。
 *
 * 这是独立编写的程序化光场
 *
 * 为什么不用极坐标双臂模型：`cos(2θ)` 在中心有奇点，所有臂都收敛到同一点，
 * 视觉重心全压在中间，而原图是一条横贯整张卡、中心被压暗的暗涡。用
 * `T_m(x)·T_n(y)` 乘积基拟合没有极点，双臂在整张卡上连续延伸。
 *
 * 系数拟合口径：气泡里真实的 cover 裁切显示区（卡片比例），所以生成图的
 * 长宽比必须与卡片一致，并且 1:1 铺满卡片。
 */

/**
 * `T_m(x) * T_n(y)` 的系数，按行主序展开、m 为 x 方向下标。
 * 数值是离线最小二乘拟合出的目标亮度（0..255），着色器与 CPU 采样共用。
 */
export const CARD_BACKGROUND_COEFFICIENTS: readonly number[] = [
    118.0459, -0.1993, -1.9499, -0.3581, -0.1884, 0.0752, -0.0598, -0.0315, 0.0823,
    0.5941, 22.9577, 0.2901, -3.9166, -0.1754, 0.3298, -0.0608, 0.0092, 0.0263,
    7.0904, -0.7712, 5.2530, -0.6835, -1.6036, -0.0401, 0.1089, 0.0695, 0.0446,
    -1.0808, -4.8400, -0.7890, 4.5892, -0.0112, -1.7080, -0.1678, 0.7630, 0.0268,
    -4.1491, 1.4799, -0.4228, 0.1035, 1.8677, -0.3253, -0.8088, 0.0105, 0.3258,
    0.8774, 0.7157, 0.7613, -2.0285, -0.0873, 1.6007, -0.1436, -0.7490, -0.0764,
    1.6674, -0.6969, -0.8391, 0.2396, -0.8686, 0.1778, 0.8620, -0.2154, -0.4107,
    -0.9459, 0.0717, -0.2927, 1.0214, 0.4710, -1.0809, -0.0763, 1.4813, -0.0732,
    -1.1380, 0.7543, 1.4322, -0.2560, -0.0463, 0.1971, -0.4624, 0.1627, 0.8466,
];

/** 光场中值：对比度调整以它为轴心 */
const FIELD_MIDPOINT = 117.12;
/** 亮度 → 绿通道的回归参数（原图拟合结果） */
const GREEN_OFFSET = 6.651125809;
const GREEN_SCALE = 0.825496426;
/** 红通道由绿通道线性回归得到 */
const RED_SLOPE = 0.488476;
const RED_OFFSET = -50.37209;
/** 蓝通道在 250..255 之间随亮度微抬 */
const BLUE_BASE = 250;
const BLUE_SPAN = 5;

/**
 * CPU 孪生的光场采样（测试与离线拟合校验用）。
 *
 * @param x 归一化横坐标，-1..1
 * @param y 归一化纵坐标，-1..1（+1 为图像顶部）
 * @returns 目标亮度，0..255 量纲
 */
export function sampleCardLightness(x: number, y: number): number {
    const tx = [1, x];
    const ty = [1, y];
    for (let n = 2; n < 9; ++n) {
        tx[n] = 2 * x * tx[n - 1] - tx[n - 2];
        ty[n] = 2 * y * ty[n - 1] - ty[n - 2];
    }
    let value = 0;
    for (let m = 0; m < 9; ++m) {
        for (let n = 0; n < 9; ++n) {
            value += CARD_BACKGROUND_COEFFICIENTS[m * 9 + n] * tx[m] * ty[n];
        }
    }
    return value;
}

/**
 * 亮度 → RGB。整张卡的可视对比度全部来自这 46 个亮度单位，
 * 千万不要换成接近白色的端点，否则对比度会被冲淡。
 */
function lightnessToRgb(lightness: number): [number, number, number] {
    const green = (lightness - GREEN_OFFSET) / GREEN_SCALE;
    const red = RED_SLOPE * green + RED_OFFSET;
    const ramp = Math.min(1, Math.max(0, (green - 107) / 56));
    const blue = BLUE_BASE + ramp * BLUE_SPAN;
    return [red, green, blue];
}

/** 4×4 有序抖动：±0.5 个色阶，打散平滑渐变的色带 */
const BAYER_4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
];

export interface CardBackgroundOptions {
    /** 对比度系数，1 为拟合原值 */
    contrast?: number;
}

/**
 * 生成卡片底色位图。
 *
 * 输出长宽比必须与卡片一致（调用方按卡片尺寸 × 设备像素比传参），
 * 因为它 1:1 铺满卡片，而不是被 cover 裁切。
 *
 * @param width 目标像素宽
 * @param height 目标像素高
 * @param options 对比度等可调项
 * @returns PNG data URL；无法创建画布时返回空串
 */
export function renderCardBackground(
    width: number,
    height: number,
    options: CardBackgroundOptions = {},
): string {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const contrast = options.contrast ?? 1;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) return '';

    const image = context.createImageData(w, h);
    const data = image.data;
    for (let y = 0; y < h; ++y) {
        // 与着色器一致：p.y 在图像顶部为 +1
        const py = 1 - (2 * (y + 0.5)) / h;
        for (let x = 0; x < w; ++x) {
            const px = (2 * (x + 0.5)) / w - 1;
            const raw = sampleCardLightness(px, py);
            const lightness = FIELD_MIDPOINT + (raw - FIELD_MIDPOINT) * contrast;
            const [red, green, blue] = lightnessToRgb(lightness);
            const dither = (BAYER_4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9;
            const offset = (y * w + x) * 4;
            data[offset] = Math.min(255, Math.max(0, Math.round(red + dither)));
            data[offset + 1] = Math.min(255, Math.max(0, Math.round(green + dither)));
            data[offset + 2] = Math.min(255, Math.max(0, Math.round(blue)));
            data[offset + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
}

let cachedUrl: string | null = null;

/**
 * 全进程只生成一次卡片底色（所有转账气泡共用同一张图）。
 *
 * @param width 目标像素宽
 * @param height 目标像素高
 * @returns PNG data URL，可作 CSS `background-image`
 */
export function getCardBackgroundUrl(width: number, height: number): string {
    if (!cachedUrl) cachedUrl = renderCardBackground(width, height);
    return cachedUrl;
}
