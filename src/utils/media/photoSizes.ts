import type { file, photo } from 'tdlib-types';

/**
 * 消息图片双尺寸策略：
 * - Small：sizes 中面积最小的一档，始终可下，作渐进清晰占位 / 回复缩略图 / 资料页网格
 * - Big：sizes 中面积最大的一档，聊天气泡正式展示与全屏查看；是否自动下载跟「图片」设置
 * 只使用 Small / Big 两档，中间尺寸一律忽略。
 */

function sortedByArea(photo: photo) {
    return (photo.sizes || [])
        .filter((s) => s.photo)
        .slice()
        .sort((a, b) => a.width * a.height - b.width * b.height);
}

/** Small：最小面积尺寸（渐进占位 / 引用回复 / 资料页网格） */
export function pickSmallPhotoSize(photo: photo | undefined | null): file | undefined {
    if (!photo) return undefined;
    const list = sortedByArea(photo);
    return list[0]?.photo;
}

/** Big：最大面积尺寸（气泡正式展示 / 全屏查看） */
export function pickBigPhotoSize(photo: photo | undefined | null): file | undefined {
    if (!photo) return undefined;
    const list = sortedByArea(photo);
    return list[list.length - 1]?.photo;
}

/** Big 的展示宽高（布局用；无尺寸时回退 1:1） */
export function pickBigPhotoDimensions(photo: photo | undefined | null): { width: number; height: number } {
    if (!photo) return { width: 1, height: 1 };
    const list = sortedByArea(photo);
    const big = list[list.length - 1];
    if (!big) return { width: 1, height: 1 };
    return { width: big.width, height: big.height };
}
