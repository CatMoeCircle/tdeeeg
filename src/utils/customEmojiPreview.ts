import { useCustomEmoji } from '../store/customEmoji';

/**
 * 富文本预览里自定义 emoji 的媒体源解析（聊天输入框与分组名称输入框共用）。
 * 首次遇到某个 id 时惰性请求贴纸，之后复用 store 里的响应式状态；
 * 下载完成后调用方重新求值即可把占位升级为图片/动画。
 */
const cache = new Map<string, ReturnType<typeof useCustomEmoji>>();

export function resolveCustomEmojiSrc(id: string): { src: string; kind: 'img' | 'video' } | null {
    let st = cache.get(id);
    if (!st && !cache.has(id)) {
        st = useCustomEmoji(id, true);
        cache.set(id, st);
    }
    if (!st) return null;
    const fmt = st.sticker?.format?._;
    if (fmt === 'stickerFormatWebm') {
        // webm 动画 → <video>（img 无法播放）；完整文件未就绪时缩略图兜底
        if (st.filePath) return { src: st.filePath, kind: 'video' };
        if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
        return null;
    }
    if (fmt === 'stickerFormatWebp') {
        // webp 静态 → <img>：优先完整文件，未就绪时用缩略图，避免闪回系统 emoji
        if (st.filePath) return { src: st.filePath, kind: 'img' };
        if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
        return null;
    }
    if (fmt === 'stickerFormatTgs') {
        // tgs 主文件无法用 <img>/<video> 显示，只能用 webp 缩略图；不能拿 .tgs 当图源
        if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
        return null;
    }
    // 未知格式：主文件或缩略图任意可显示源
    if (st.filePath) return { src: st.filePath, kind: 'img' };
    if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
    return null;
}
