import { ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { settings } from '../store/settings';

/**
 * 自定义气泡皮肤（QQ 风格图片气泡）。
 *
 * 用 canvas 分析出气泡主体与右下角装饰，得到九宫格四条切线的自动默认值；
 * 用户可在设置中手动校准切线（`customBubbleSlice`），并调节皮肤边距与内容内边距。
 */
export interface CustomBubbleSkin {
    /** convertFileSrc 资源 URL */
    url: string;
    /**
     * 水平镜像副本（data URL）。
     * 别人的消息（左侧气泡）用它渲染，装饰角色翻到左下角（头像侧）；
     * 使用时切线/边距的左右两维同步交换。
     */
    urlFlipped: string;
    /** 生效切线 [上,右,下,左]（源图像素） */
    slice: [number, number, number, number];
    /** 自动分析得到的切线（“恢复自动”用） */
    autoSlice: [number, number, number, number];
    /** 皮肤绘制边框（border-image-width）[上,右,下,左]（CSS px）= 切片 × 皮肤边距比例 */
    border: [number, number, number, number];
    /**
     * 白底边缘的绘制内缩 [上,右,下,左]（CSS px）= 源图主体边距 × 皮肤边距比例。
     * 内容（文字）起点 = whiteInset + padding，与皮肤绘制尺寸解耦，
     * 因此 padding=0 时文字紧贴白底边缘。
     */
    whiteInset: [number, number, number, number];
    /** 图片原始尺寸 [宽,高]（切线拖拽钳制用） */
    size: [number, number];
    /** 内容内边距（px，加在 whiteInset 之上） */
    padding: number;
}

/** 圆角覆盖范围估计（源图像素，含透明边距） */
const CORNER = 24;
/** 皮肤边距默认比例：显示边框 = 切片 × 该系数 */
const DEFAULT_BORDER_SCALE = 0.6;

const skin = ref<CustomBubbleSkin | null>(null);
/** 防止路径快速切换时旧结果覆盖新结果 */
let loadSeq = 0;

interface SkinAnalysis {
    slice: [number, number, number, number];
    /** 源图主体（白底）相对图片边缘的边距 [上,右,下,左] */
    bodyMargin: [number, number, number, number];
    size: [number, number];
    /** 水平镜像副本（data URL，分析时顺带生成并缓存） */
    flipped: string;
}

/** 按路径缓存分析结果：调节边距/内边距/切线时不重复读文件 */
let cachedPath = '';
let cachedAnalysis: SkinAnalysis | null = null;

/** 猜测图片 MIME（分析时构造 Blob 用） */
function guessImageMime(path: string): string {
    const ext = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'image/jpeg';
}

/**
 * 加载图片供 canvas 读像素。
 * 必须走 Tauri readFile + Blob URL：convertFileSrc 的 asset URL 画到 canvas 会污染画布，
 * getImageData 抛 SecurityError（见 utils/wallpaper.ts 同样结论）。
 */
async function loadImagePixels(path: string): Promise<HTMLImageElement> {
    const bytes = await readFile(path);
    const blob = new Blob([bytes], { type: guessImageMime(path) });
    const url = URL.createObjectURL(blob);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        // 解码完成后即可回收 objectURL：像素数据已在 img 中
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** 生成水平镜像副本（incoming 气泡用）；失败返回空串（调用方退回原图不镜像） */
function flipHorizontal(img: HTMLImageElement): string {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return '';
    }
}

/** 无法分析时的兜底：四边各取 20% 作为切片；主体边距未知按 0 处理 */
function fallbackAnalysis(w: number, h: number, flipped: string): SkinAnalysis {
    return {
        size: [w, h],
        flipped,
        bodyMargin: [0, 0, 0, 0],
        slice: [
            Math.round(h * 0.2),
            Math.round(w * 0.2),
            Math.round(h * 0.2),
            Math.round(w * 0.2),
        ],
    };
}

/** 分析气泡图：中线定位主体矩形，体内深色像素定位装饰（角色线稿） */
async function analyzeSkin(path: string): Promise<SkinAnalysis> {
    const img = await loadImagePixels(path);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('empty image');
    const flipped = flipHorizontal(img);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallbackAnalysis(w, h, flipped);
    ctx.drawImage(img, 0, 0);

    let data: Uint8ClampedArray;
    try {
        data = ctx.getImageData(0, 0, w, h).data;
    } catch {
        // 跨域污染等异常：退回固定切片
        return fallbackAnalysis(w, h, flipped);
    }

    const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3];
    const opaque = (x: number, y: number) => alphaAt(x, y) > 16;

    // 几乎全不透明（非透明底皮肤）：无法用九宫格，退回固定切片
    let transparent = 0;
    let sampled = 0;
    for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
            sampled++;
            if (!opaque(x, y)) transparent++;
        }
    }
    if (transparent < sampled * 0.02) return fallbackAnalysis(w, h, flipped);

    // 中线扫描定位气泡主体矩形
    const midY = h >> 1;
    const midX = w >> 1;
    let bodyL = -1;
    let bodyR = -1;
    let bodyT = -1;
    let bodyB = -1;
    for (let x = 0; x < w; x++) if (opaque(x, midY)) { bodyL = x; break; }
    for (let x = w - 1; x >= 0; x--) if (opaque(x, midY)) { bodyR = x; break; }
    for (let y = 0; y < h; y++) if (opaque(midX, y)) { bodyT = y; break; }
    for (let y = h - 1; y >= 0; y--) if (opaque(midX, y)) { bodyB = y; break; }
    if (bodyL < 0 || bodyR - bodyL < 8 || bodyT < 0 || bodyB - bodyT < 8) {
        return fallbackAnalysis(w, h, flipped);
    }

    // 主体内深色像素 = 装饰线稿（角色轮廓）；排除四角圆弧（贴近两条边的深色属气泡自身描边）
    const inset = 4;
    let decX = Infinity;
    let decY = Infinity;
    for (let y = bodyT + inset; y <= bodyB - inset; y++) {
        for (let x = bodyL + inset; x <= bodyR - inset; x++) {
            const nearCorner =
                (x < bodyL + CORNER || x > bodyR - CORNER) &&
                (y < bodyT + CORNER || y > bodyB - CORNER);
            if (nearCorner) continue;
            const i = (y * w + x) * 4;
            if (data[i + 3] < 128) continue;
            const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            if (luma < 110) {
                if (x < decX) decX = x;
                if (y < decY) decY = y;
            }
        }
    }

    const sliceL = bodyL + CORNER;
    const sliceT = bodyT + CORNER;
    const sliceR = Number.isFinite(decX) ? w - decX : w - bodyR + CORNER;
    const sliceB = Number.isFinite(decY) ? h - decY : h - bodyB + CORNER;

    // 每侧不超过对应边长 60%，保证中心仍可拉伸；总和超出时浏览器会按比例压缩
    const clamp = (v: number, max: number) => Math.max(8, Math.min(Math.round(v), Math.floor(max * 0.6)));
    return {
        size: [w, h],
        flipped,
        bodyMargin: [bodyT, w - 1 - bodyR, h - 1 - bodyB, bodyL],
        slice: [
            clamp(sliceT, h),
            clamp(sliceR, w),
            clamp(sliceB, h),
            clamp(sliceL, w),
        ],
    };
}

async function getAnalysis(path: string): Promise<SkinAnalysis> {
    if (cachedPath === path && cachedAnalysis) return cachedAnalysis;
    const result = await analyzeSkin(path);
    cachedPath = path;
    cachedAnalysis = result;
    return result;
}

/** 把切线钳制进合法范围（每侧 8 ~ 边长 60%） */
function clampSlice(
    slice: [number, number, number, number],
    size: [number, number],
): [number, number, number, number] {
    const [w, h] = size;
    const clamp = (v: number, max: number) => Math.max(8, Math.min(Math.round(v), Math.floor(max * 0.6)));
    return [
        clamp(slice[0], h),
        clamp(slice[1], w),
        clamp(slice[2], h),
        clamp(slice[3], w),
    ];
}

async function rebuildSkin(): Promise<void> {
    const id = ++loadSeq;
    const path = settings.message.customBubbleImage;
    if (!path) {
        skin.value = null;
        return;
    }
    try {
        const analysis = await getAnalysis(path);
        if (id !== loadSeq) return;
        const override = settings.message.customBubbleSlice;
        const slice = clampSlice(override ?? analysis.slice, analysis.size);
        const scale = settings.message.customBubbleBorderScale || DEFAULT_BORDER_SCALE;
        const border = slice.map((v) => Math.max(8, Math.round(v * scale))) as [
            number, number, number, number,
        ];
        // 白底内缩 = 源图主体边距 × 比例；夹在绘制边框内，防止手动切线小于主体边距时溢出
        const whiteInset = analysis.bodyMargin.map((v, i) =>
            Math.min(Math.round(v * scale), border[i]),
        ) as [number, number, number, number];
        skin.value = {
            url: convertFileSrc(path),
            urlFlipped: analysis.flipped,
            slice,
            autoSlice: analysis.slice,
            border,
            whiteInset,
            size: analysis.size,
            padding: settings.message.customBubblePadding,
        };
    } catch (e) {
        console.error('[customBubble] 分析气泡图片失败:', e);
        if (id === loadSeq) skin.value = null;
    }
}

watch(
    [
        () => settings.message.customBubbleImage,
        () => settings.message.customBubbleSlice,
        () => settings.message.customBubbleBorderScale,
        () => settings.message.customBubblePadding,
    ],
    () => {
        void rebuildSkin();
    },
    { immediate: true },
);

/** 当前生效的自定义气泡皮肤（null = 未启用） */
export function useCustomBubbleSkin() {
    return skin;
}

/**
 * 皮肤 → 气泡内联样式：border-image 九宫格拉伸 + 清除默认背景/阴影/圆角/内边距。
 *
 * 两组边框解耦：
 * - `border-image-width`（skin.border）：皮肤绘制尺寸，决定白底/角色画多大；
 * - `border-width`：内容占位 = 白底内缩 + 内边距，文字起点紧贴白底边缘（padding=0 时）。
 * 文字绘制在 border-image 之上，因此可以落在绘制区内。
 *
 * @param mirror - 水平镜像（别人的左侧消息）：换用翻转图并交换左右切线/边距，
 *                 装饰角色从右下角翻到左下角（头像侧）。翻转图缺失时退回原图不镜像。
 *
 * 自定义皮肤为浅色底，强制深色正文，避免暗色主题下浅字压白底。
 */
export function customSkinStyle(skin: CustomBubbleSkin, mirror = false): Record<string, string> {
    const mirrored = mirror && !!skin.urlFlipped;
    const swap = <T,>(v: [T, T, T, T]): [T, T, T, T] =>
        mirrored ? [v[0], v[3], v[2], v[1]] : v;
    const slice = swap(skin.slice);
    const border = swap(skin.border);
    const inset = swap(skin.whiteInset);
    const [it, ir, ib, il] = border;
    const [wt, wr, wb, wl] = inset;
    const pad = skin.padding;
    const side = (v: number) => `${Math.max(1, v + pad)}px`;
    return {
        borderStyle: 'solid',
        borderWidth: `${side(wt)} ${side(wr)} ${side(wb)} ${side(wl)}`,
        borderImageSource: `url("${mirrored ? skin.urlFlipped : skin.url}")`,
        borderImageSlice: `${slice[0]} ${slice[1]} ${slice[2]} ${slice[3]} fill`,
        borderImageWidth: `${it}px ${ir}px ${ib}px ${il}px`,
        borderImageRepeat: 'stretch',
        borderRadius: '0px',
        background: 'none',
        boxShadow: 'none',
        padding: '0px',
        color: '#17212b',
    };
}
