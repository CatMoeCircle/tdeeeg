import { convertFileSrc } from '@tauri-apps/api/core';
import type { thumbnail, ThumbnailFormat } from 'tdlib-types';

/**
 * TDLib 缩略图格式兼容层。
 *
 * 缩略图（thumbnail）的 `format` 字段有 7 种子类型：
 * - 静态图片：thumbnailFormatJpeg / thumbnailFormatPng / thumbnailFormatWebp / thumbnailFormatGif
 * - 动态视频：thumbnailFormatMpeg4 / thumbnailFormatWebm
 * - Lottie 动画：thumbnailFormatTgs（无法用 <img> 直接显示）
 *
 * 之前代码对所有缩略图一律当成 <img> 静态图处理，导致 MPEG4/WEBM/TGS
 * 这类缩略图渲染失败或显示异常。此处统一按格式分类，并提供对应的 MIME 类型，
 * 供调用方决定用 <img> / <video> 渲染，或跳过不可直接显示的缩略图。
 */

export type ThumbnailKind = 'image' | 'video' | 'lottie' | 'unknown';

export interface ThumbnailMeta {
    /** 缩略图类别 */
    kind: ThumbnailKind;
    /** 合适的 MIME 类型（用于 <img> 的静态图 / <video> 的动态图） */
    mimeType?: string;
    /** 是否可以在 <img> 中直接显示（静态位图） */
    imgRenderable: boolean;
    /** 是否可以在 <video> 中直接显示（MPEG4/WEBM 动态图） */
    videoRenderable: boolean;
}

const FORMAT_META: Record<string, ThumbnailMeta> = {
    thumbnailFormatJpeg: { kind: 'image', mimeType: 'image/jpeg', imgRenderable: true, videoRenderable: false },
    thumbnailFormatPng: { kind: 'image', mimeType: 'image/png', imgRenderable: true, videoRenderable: false },
    thumbnailFormatWebp: { kind: 'image', mimeType: 'image/webp', imgRenderable: true, videoRenderable: false },
    thumbnailFormatGif: { kind: 'image', mimeType: 'image/gif', imgRenderable: true, videoRenderable: false },
    thumbnailFormatMpeg4: { kind: 'video', mimeType: 'video/mp4', imgRenderable: false, videoRenderable: true },
    thumbnailFormatWebm: { kind: 'video', mimeType: 'video/webm', imgRenderable: false, videoRenderable: true },
    thumbnailFormatTgs: { kind: 'lottie', mimeType: undefined, imgRenderable: false, videoRenderable: false },
};

/** 根据缩略图 format 获取元信息；未知格式回退为 unknown */
export function getThumbnailMeta(format: ThumbnailFormat | undefined | null): ThumbnailMeta {
    const key = format?._;
    if (key && key in FORMAT_META) return FORMAT_META[key];
    return { kind: 'unknown', mimeType: undefined, imgRenderable: false, videoRenderable: false };
}

/** 该缩略图是否为可在 <img> 中显示的静态位图（JPEG/PNG/WEBP/GIF） */
export function isThumbnailImgRenderable(format: ThumbnailFormat | undefined | null): boolean {
    return getThumbnailMeta(format).imgRenderable;
}

/** 该缩略图是否为需要 <video> 渲染的动态图（MPEG4/WEBM） */
export function isThumbnailVideoRenderable(format: ThumbnailFormat | undefined | null): boolean {
    return getThumbnailMeta(format).videoRenderable;
}

/** 该缩略图是否完全无法用标准 <img>/<video> 显示（TGS Lottie） */
export function isThumbnailNonRenderable(format: ThumbnailFormat | undefined | null): boolean {
    return getThumbnailMeta(format).kind === 'lottie';
}

/**
 * 将一个 thumbnail 转换为可直接用于 <img src> 的 URL。
 *
 * 仅当缩略图为静态位图（JPEG/PNG/WEBP/GIF）时返回路径；MPEG4/WEBM/TGS
 * 等动态格式无法用 <img> 显示，返回 undefined，避免渲染出破碎图片。
 * 若要显示动态缩略图，请用 `thumbnailToVideoSrc`。
 */
export function thumbnailToImgSrc(thumb: thumbnail | null | undefined): string | undefined {
    if (!thumb) return undefined;
    if (!isThumbnailImgRenderable(thumb.format)) return undefined;
    if (!thumb.file.local?.path) return undefined;
    return convertFileSrc(thumb.file.local.path);
}

/**
 * 将一个 thumbnail 转换为可直接用于 <video src> 的 URL。
 *
 * 仅当缩略图为 MPEG4/WEBM 动态图时返回路径；静态位图与 TGS 不适用。
 */
export function thumbnailToVideoSrc(thumb: thumbnail | null | undefined): string | undefined {
    if (!thumb) return undefined;
    if (!isThumbnailVideoRenderable(thumb.format)) return undefined;
    if (!thumb.file.local?.path) return undefined;
    return convertFileSrc(thumb.file.local.path);
}
