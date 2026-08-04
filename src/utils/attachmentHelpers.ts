import type { AttachmentItem } from '../store/attachment';

/**
 * 判断当前附件列表是否处于「相册模式」。
 * 相册模式 = 已存在至少一个图片或视频附件（后续同类文件会尝试组成相册）。
 */
export function isInAlbum(items: AttachmentItem[]): boolean {
    return items.some((i) => i.kind === 'photo' || i.kind === 'video');
}

/** 是否包含以图片/视频发送的附件 */
export function hasMedia(items: AttachmentItem[]): boolean {
    return items.some((i) => i.kind === 'photo' || i.kind === 'video');
}
