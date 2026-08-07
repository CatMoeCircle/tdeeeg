import type { AttachmentItem, AttachmentKind } from '../store/attachment';

/**
 * 判断当前附件列表是否处于「相册模式」。
 * 相册模式 = 已存在至少一个可组相册的附件（图片/视频/文档/音频，不含 GIF 动画）。
 * 后续同类文件会尝试组成相册。
 */
export function isInAlbum(items: AttachmentItem[]): boolean {
    return items.some((i) => i.kind === 'photo' || i.kind === 'video' || i.kind === 'document' || i.kind === 'audio');
}

/** 是否包含以图片/视频发送的附件 */
export function hasMedia(items: AttachmentItem[]): boolean {
    return items.some((i) => i.kind === 'photo' || i.kind === 'video');
}

/**
 * 某附件所属的「相册分组类型」。
 * TDLib 规定：图片+视频可组一组；文档只能和文档一组；音频只能和音频一组；
 * GIF 动画不能进相册（返回 null，单独发送）。
 */
export type AlbumGroupKind = 'media' | 'document' | 'audio' | null;

export function albumGroupOf(kind: AttachmentKind): AlbumGroupKind {
    switch (kind) {
        case 'photo':
        case 'video':
            return 'media';
        case 'document':
            return 'document';
        case 'audio':
            return 'audio';
        default:
            return null; // animation
    }
}
