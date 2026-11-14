/**
 * 媒体尺寸计算，对齐 Telegram Desktop（tdesktop/dev）：
 * - `ui/chat/chat.style`：msgMaxWidth / maxMediaSize 430、minPhotoSize 100、
 *   historyPhotoBubbleMinWidth 200、maxGifSize 320、historyGroupWidthMax/Min
 * - `history_view_photo.cpp` Photo::countOptimalSize / countCurrentSize
 * - `history_view_gif.cpp` Gif::countThumbSize / countOptimalSize
 * - `media/streaming/media_streaming_utility.cpp` DecideFrameResize / FrameResizeMayExpand
 *
 * 气泡内媒体不是「严格按原比例」：官方先算出盒子尺寸（最小宽 200、最小高 100、
 * 上限 430），再用 adjustHeightForLessCrop 在「裁切不超过约 1/4」时把盒子拉高，
 * 剩余差异用 contain（模糊背景留边）或 cover（裁切）二选一填充。
 */

/** 媒体最大边长（官方 maxMediaSize / msgMaxWidth） */
export const MEDIA_MAX = 430;
/** 媒体最小边（官方 minPhotoSize） */
export const MEDIA_MIN = 100;
/** 气泡内媒体最小宽度（官方 historyPhotoBubbleMinWidth） */
export const BUBBLE_MEDIA_MIN_WIDTH = 200;
/** 动图（GIF / 动画）单独的上限（官方 maxGifSize） */
export const GIF_MAX = 320;

export interface FitMediaOptions {
    maxWidth?: number;
    maxHeight?: number;
    minWidth?: number;
    minHeight?: number;
    /** 全局尺寸系数（默认 1）：同时缩放上下限，对应外观设置的「媒体尺寸比例」 */
    scale?: number;
}

export interface FitMediaSize {
    width: number;
    height: number;
}

/**
 * 按原始宽高比等比缩放，并约束在 [min, max] 范围内。
 * 1. 任一边超过 max 时按最小缩放比收束
 * 2. 若任一边低于 min，在不超出 max 的前提下等比放大
 */
export function fitMediaSize(
    srcWidth: number,
    srcHeight: number,
    options: FitMediaOptions = {},
): FitMediaSize {
    const scale = Math.min(1.5, Math.max(0.3, options.scale ?? 1));
    const maxWidth = Math.round((options.maxWidth ?? MEDIA_MAX) * scale);
    const maxHeight = Math.round((options.maxHeight ?? MEDIA_MAX) * scale);
    const minWidth = Math.max(1, Math.round((options.minWidth ?? MEDIA_MIN) * scale));
    const minHeight = Math.max(1, Math.round((options.minHeight ?? MEDIA_MIN) * scale));

    let width = Math.max(1, srcWidth || 1);
    let height = Math.max(1, srcHeight || 1);

    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
    }

    // 等比放大到至少满足 min（若放大后会超出 max 则放弃）
    const minScale = Math.max(minWidth / width, minHeight / height, 1);
    if (minScale > 1) {
        const nextW = width * minScale;
        const nextH = height * minScale;
        if (nextW <= maxWidth && nextH <= maxHeight) {
            width = nextW;
            height = nextH;
        }
    }

    return {
        width: Math.round(width),
        height: Math.round(height),
    };
}

/**
 * 消息内媒体样式：优先使用 fit 尺寸，但 maxWidth:100% 保证
 * 气泡/窗口变窄时可收缩；高度由 aspect-ratio 推导，避免固定高度裁切。
 */
export function mediaSizeStyle(
    srcWidth: number,
    srcHeight: number,
    options?: FitMediaOptions,
): Record<string, string> {
    const { width } = fitMediaSize(srcWidth, srcHeight, options);
    const w = Math.max(1, srcWidth || 1);
    const h = Math.max(1, srcHeight || 1);
    return {
        width: `${width}px`,
        maxWidth: '100%',
        aspectRatio: `${w} / ${h}`,
    };
}

/**
 * 可收缩容器样式（链接预览等）：
 * 宽度可随气泡收缩到 100%，但不超过 fit 后的 max；高度由 aspect-ratio 推导。
 */
export function mediaFitStyle(
    srcWidth: number,
    srcHeight: number,
    options?: FitMediaOptions,
): Record<string, string> {
    return mediaSizeStyle(srcWidth, srcHeight, options);
}

/** 官方 DownscaledSize：等比缩到不超过 max 的正方形内 */
function downscaledSize(width: number, height: number, max: number): FitMediaSize {
    const w = Math.max(1, width || 1);
    const h = Math.max(1, height || 1);
    const ratio = Math.min(max / w, max / h, 1);
    return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) };
}

/**
 * 官方 FrameResizeMayExpand：判断「把盒子拉高填满」是否还留着足够画面。
 * 与 decideFrameResize 默认的 3/4 不同，这里把可见比例再按最短边收紧
 * （nominator = 3*min-4, denominator = 4*min），因此裁切较多时返回 false。
 */
export function frameResizeMayExpand(outer: FitMediaSize, original: FitMediaSize): boolean {
    const min = Math.min(outer.width, outer.height, original.width, original.height);
    if (min <= 0) return false;
    // (3/4) - (1/min) 不足 1/2 时直接放弃
    if (2 * 3 * min < 2 * 4 + 4 * min) return false;
    return decideFrameResize(outer, original, 3 * min - 4, 4 * min).expanding;
}

function decideFrameResize(
    outer: FitMediaSize,
    original: FitMediaSize,
    minVisibleNominator = 3,
    minVisibleDenominator = 4,
): { result: FitMediaSize; expanding: boolean } {
    const w = Math.max(1, outer.width);
    const h = Math.max(1, outer.height);
    const ow = Math.max(1, original.width);
    const oh = Math.max(1, original.height);
    const scale = Math.max(w / ow, h / oh); // KeepAspectRatioByExpanding
    // 取整后比较，避免浮点误差把「刚好铺满」判成放不下
    const bigW = Math.round(ow * scale);
    const bigH = Math.round(oh * scale);
    if (bigW <= w && bigH * minVisibleNominator <= h * minVisibleDenominator) {
        return { result: { width: bigW, height: bigH }, expanding: true };
    }
    return { result: { width: w, height: h }, expanding: false };
}

export type MediaFillMode = 'contain' | 'cover';

export interface BubbleMediaBox {
    /** 盒子宽度（px） */
    width: number;
    /** 盒子高度（px） */
    height: number;
    /** 图片/视频在盒子里的填充方式 */
    fill: MediaFillMode;
}

interface BubbleMediaBoxOptions {
    /** 该类型媒体的边长上限：图片/视频 430，动图 320 */
    maxSize?: number;
    /** 是否需要气泡内最小宽度（官方 historyPhotoBubbleMinWidth） */
    bubble?: boolean;
    /** 气泡可用宽度，默认按 430 估算；窄窗口由 max-width:100% 收缩 */
    availableWidth?: number;
    /**
     * 全局尺寸系数（默认 1）：同时缩放上限与下限。
     * 官方常量按大窗口设定，窄窗口/小字号下用 <1 的值整体收一档。
     */
    scale?: number;
}

/**
 * 气泡内媒体的盒子尺寸，逐条对应官方 Photo::countCurrentSize / Gif::countCurrentSize：
 * 1. 缩到 maxSize 以内
 * 2. 宽度至少 bubbleMinWidth（官方 historyPhotoBubbleMinWidth=200）
 * 3. 高度至少 minPhotoSize=100，再按 adjustHeightForLessCrop 在裁切不超过约 1/4 时拉高
 * 4. 拉高后若仍需裁切则以 cover 填充，否则 contain（保留完整画面）
 *
 * availableWidth 取气泡可用宽度；默认按 430 估算（窗口极窄时由 max-width:100% 收缩）。
 */
export function measureBubbleMedia(
    srcWidth: number,
    srcHeight: number,
    options: BubbleMediaBoxOptions = {},
): BubbleMediaBox {
    // 系数同时作用于上限与下限，保证盒子的比例关系不变，只整体放大/缩小
    const scale = Math.min(1.5, Math.max(0.3, options.scale ?? 1));
    const maxSize = Math.round((options.maxSize ?? MEDIA_MAX) * scale);
    const useBubble = options.bubble !== false;
    const availableWidth = Math.min(
        Math.round((options.availableWidth ?? MEDIA_MAX) * scale),
        maxSize,
    );
    const minEdge = Math.max(1, Math.round(MEDIA_MIN * scale));
    const bubbleMinWidth = Math.max(1, Math.round(BUBBLE_MEDIA_MIN_WIDTH * scale));
    const srcW = Math.max(1, srcWidth || 1);
    const srcH = Math.max(1, srcHeight || 1);

    const scaled = downscaledSize(srcW, srcH, maxSize);
    // CountPhotoMediaSize：先按宽度收，再把高度也约束到可用宽度内
    let mediaW = Math.min(scaled.width, availableWidth);
    let mediaH = scaled.height;
    if (mediaH > availableWidth) {
        const ratio = availableWidth / mediaH;
        mediaW = Math.max(1, Math.round(mediaW * ratio));
        mediaH = availableWidth;
    }

    const minWidth = useBubble
        ? Math.min(bubbleMinWidth, availableWidth)
        : Math.min(minEdge, availableWidth);

    let width = Math.max(mediaW, minWidth);
    let height = Math.max(mediaH, Math.min(minEdge, maxSize));

    // adjustHeightForLessCrop：裁切不多时把盒子拉高，减少裁剪
    if (useBubble && frameResizeMayExpand({ width, height }, { width: srcW, height: srcH })) {
        height = Math.max(height, (width * srcH) / srcW);
    }

    width = Math.round(width);
    height = Math.round(height);
    const { expanding } = decideFrameResize({ width, height }, { width: srcW, height: srcH });
    return { width, height, fill: expanding ? 'cover' : 'contain' };
}

/** 气泡内媒体容器的内联样式（尺寸 + 盒子比例） */
export function bubbleMediaStyle(box: BubbleMediaBox): Record<string, string> {
    return {
        width: `${box.width}px`,
        maxWidth: '100%',
        aspectRatio: `${box.width} / ${box.height}`,
    };
}

/**
 * 相册宫格尺寸：官方 historyGroupWidthMax/Min（430 / 100）。
 */
export const ALBUM_MAX_WIDTH = MEDIA_MAX;
export const ALBUM_MIN_WIDTH = MEDIA_MIN;
