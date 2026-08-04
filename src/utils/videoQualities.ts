import type { MediaViewerVideoQuality } from '../components/chat/ChatDetail/MessageContent/MediaViewer.vue';
import { convertFileSrc } from '@tauri-apps/api/core';

/** 简单 file 结构（alternativeVideo.video 等），只取所需字段 */
interface SimpleFile {
    id?: number;
    size?: number;
    local?: { path?: string; is_downloading_completed?: boolean };
}

/** 将 codec 映射为 mime 类型，用于 tdstream 流式播放 */
function codecToMime(codec: string): string {
    const c = (codec || '').toLowerCase();
    if (c.includes('av1') || c.includes('av01')) return 'video/mp4';
    if (c.includes('h265') || c.includes('hevc')) return 'video/mp4';
    if (c.includes('vp9')) return 'video/webm';
    return 'video/mp4';
}

/** 根据视频高度生成分辨率标签，如 1080p / 4K */
export function resolutionLabel(width: number, height: number): string {
    const h = height || 0;
    if (h >= 2160) return '4K';
    if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    if (h >= 360) return '360p';
    if (h >= 240) return '240p';
    if (h >= 144) return '144p';
    if (width && !h) return `${Math.round(width / 16) * 16}p`;
    return 'SD';
}

/** 为 alternative video 生成可播放 src（优先本地文件，否则流式） */
function buildAltSrc(file: SimpleFile | undefined, mime: string): string {
    if (!file) return '';
    if (file.local?.is_downloading_completed) {
        const p = file.local?.path;
        if (p) return convertFileSrc(p);
    }
    if (file.id && file.size && file.size > 0) {
        return `${convertFileSrc(String(file.id), 'tdstream')}?mime=${mime}`;
    }
    return '';
}

/**
 * 根据视频消息内容构建可选画质列表（包含默认主源与 alternative videos）。
 * 只有当存在 alternative videos 时才返回非空数组（即「视频有画质」）。
 *
 * @param altVideos 消息的 alternative_videos 数组
 * @param mainSrc 当前播放的主视频 src（作为默认画质之一）
 * @param mainResolution 主视频分辨率 { width, height }
 * @param mainMime 主视频 mime 类型（用于 alternate 无本地文件时的流式）
 * @returns 画质列表；无可选画质时返回空数组
 */
export function buildVideoQualities(
    altVideos: Array<{ id: string; width: number; height: number; codec: string; video?: unknown }> | undefined,
    mainSrc: string,
    mainResolution: { width: number; height: number },
): MediaViewerVideoQuality[] {
    const list: MediaViewerVideoQuality[] = [];
    const alts = altVideos || [];
    if (!alts.length) return list;

    // 主画质作为一项（用当前播放的 mainSrc）
    if (mainSrc) {
        list.push({
            id: 'main',
            width: mainResolution?.width || 0,
            height: mainResolution?.height || 0,
            src: mainSrc,
            label: resolutionLabel(mainResolution?.width || 0, mainResolution?.height || 0),
        });
    }

    // alternative 画质
    for (const alt of alts) {
        const src = buildAltSrc(alt.video as SimpleFile | undefined, codecToMime(alt.codec));
        if (!src) continue;
        list.push({
            id: alt.id,
            width: alt.width,
            height: alt.height,
            src,
            label: resolutionLabel(alt.width, alt.height),
        });
    }

    // 按分辨率降序排列，去重相同的 src
    const seen = new Set<string>();
    const result: MediaViewerVideoQuality[] = [];
    const sorted = [...list].sort((a, b) => (b.width * b.height) - (a.width * a.height));
    for (const q of sorted) {
        if (seen.has(q.src)) continue;
        seen.add(q.src);
        result.push(q);
    }
    return result;
}
