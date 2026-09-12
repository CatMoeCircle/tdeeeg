/**
 * 媒体等比缩放 + 最大/最小尺寸限制。
 * 对应 Unigram AspectView.MeasureOverride 与 App.xaml 中的
 * TelegramMediaMaxWidth/Height（432）、TelegramMediaMinWidth/Height（96）。
 *
 * 注意：min 只作「优先尺寸」——在不超过 max 的前提下等比放大；
 * 不会单独 clamp 单边，避免细长图被撑宽导致溢出裁切。
 * UI 层还需配合 max-width:100%，使窗口变窄时能随气泡收缩。
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
 * 1. 任一边超过 max 时按最小缩放比收束
 * 2. 若任一边低于 min，在不超出 max 的前提下等比放大
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
