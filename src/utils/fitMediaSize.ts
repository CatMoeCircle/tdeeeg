/**
 * 媒体等比缩放 + 最大/最小尺寸限制。
 * 对应 Unigram AspectView.MeasureOverride 与 App.xaml 中的
 * TelegramMediaMaxWidth/Height（432）、TelegramMediaMinWidth/Height（96）。
 */

export const MEDIA_MAX = 432;
export const MEDIA_MIN = 96;

export interface FitMediaOptions {
    maxWidth?: number;
    maxHeight?: number;
    minWidth?: number;
    minHeight?: number;
}

export interface FitMediaSize {
    width: number;
    height: number;
}

/**
 * 按原始宽高比等比缩放，并约束在 [min, max] 范围内。
 * 任一边超过 max 时按最小缩放比收束；随后分别 clamp 到 min（与 Unigram 一致）。
 */
export function fitMediaSize(
    srcWidth: number,
    srcHeight: number,
    options: FitMediaOptions = {},
): FitMediaSize {
    const maxWidth = options.maxWidth ?? MEDIA_MAX;
    const maxHeight = options.maxHeight ?? MEDIA_MAX;
    const minWidth = options.minWidth ?? MEDIA_MIN;
    const minHeight = options.minHeight ?? MEDIA_MIN;

    let width = Math.max(1, srcWidth || 1);
    let height = Math.max(1, srcHeight || 1);

    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
    }

    width = Math.max(width, minWidth);
    height = Math.max(height, minHeight);

    return {
        width: Math.round(width),
        height: Math.round(height),
    };
}

/** 固定显示尺寸（消息内图片/视频/GIF）。 */
export function mediaSizeStyle(
    srcWidth: number,
    srcHeight: number,
    options?: FitMediaOptions,
): Record<string, string> {
    const { width, height } = fitMediaSize(srcWidth, srcHeight, options);
    return {
        width: `${width}px`,
        height: `${height}px`,
    };
}

/**
 * 可收缩容器样式（链接预览等）：
 * 宽度可随气泡收缩到 100%，但不超过 fit 后的 max；高度由 aspect-ratio 推导，
 * maxHeight 作为细长图的安全兜底，防止超出范围。
 */
export function mediaFitStyle(
    srcWidth: number,
    srcHeight: number,
    options?: FitMediaOptions,
): Record<string, string> {
    const { width, height } = fitMediaSize(srcWidth, srcHeight, options);
    const w = Math.max(1, srcWidth || 1);
    const h = Math.max(1, srcHeight || 1);
    return {
        width: '100%',
        maxWidth: `${width}px`,
        aspectRatio: `${w} / ${h}`,
        maxHeight: `${height}px`,
    };
}
