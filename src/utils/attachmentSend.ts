import { ref } from 'vue';
import { tdlibSend } from './tdlib';
import { probeImage, probeVideo } from './mediaProbe';
import type { $Function } from 'tdlib-types';
import type { inputTextQuote } from 'tdlib-types';
import type { AttachmentItem, AttachmentKind } from '../store/attachment';

/** 文件大小上限 */
const BYTES_2GB = 2 * 1024 * 1024 * 1024;
const BYTES_4GB = 4 * 1024 * 1024 * 1024;

/** 相册单组最大媒体数 */
export const ALBUM_MAX = 10;

/** 宽高比阈值 */
const RATIO_LIMIT = 20;
const DIMENSION_SUM_LIMIT = 10000;

/** 常见图片扩展名 */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'ico'];
/** 常见视频扩展名 */
const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpeg', 'mpg', 'wmv', 'flv', '3gp', 'ts', 'mts', 'ogv'];
/** 常见音频扩展名（音乐） */
const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wav', 'wma', 'amr']; 
const IMAGE_MAX_BYTES = 256 * 1024 * 1024; // 图片解码探测的安全上限

function extOf(name: string): string {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export interface ClassifyInput {
    path: string;
    name: string;
    size: number;
    /** 当前是否处于相册模式（已存在图片/视频附件） */
    album: boolean;
    isPremium: boolean;
    /** 强制作为普通文档发送（不自动识别为图片/视频/音频）。用于「文件」菜单选择 */
    forceDocument?: boolean;
}

export type ClassifyResult =
    | { status: 'ok'; kind: AttachmentKind; width?: number; height?: number; duration?: number; probeFailed?: boolean }
    | { status: 'rejected'; reason: string };

/**
 * 对单个待添加文件进行分类并校验。
 * 若返回 rejected，调用方将在聊天框顶部显示 reason（也已用 MessagePlugin 提示）。
 */
export async function classifyAttachment(input: ClassifyInput): Promise<ClassifyResult> {
    const { path, name, size, album, isPremium, forceDocument } = input;

    // ===== 大小上限校验（图片/视频）=====
    if (size > BYTES_4GB) {
        return rejected(`文件超过 4GB 上限，无法发送`);
    }
    if (size > BYTES_2GB && !isPremium) {
        return rejected(`发送超过 2GB 的文件需要 Telegram Premium`);
    }

    // 「文件」菜单选择：一律作为普通文档发送，不做图片/视频/音频自动识别
    if (forceDocument) {
        return { status: 'ok', kind: 'document' };
    }

    const ext = extOf(name);
    const isImage = IMAGE_EXTS.includes(ext);
    const isVideo = VIDEO_EXTS.includes(ext);
    const isAudio = AUDIO_EXTS.includes(ext);

    // 音频一律按音乐发送（仅扩展名判断，无需解码探测）
    if (isAudio) {
        return { status: 'ok', kind: 'audio' };
    }

    // 未知类型一律作为文档
    if (!isImage && !isVideo) {
        return { status: 'ok', kind: 'document' };
    }

    // ===== 大小检查（相册模式）=====
    // 相册模式不允许加入图片（即使转文档也不行，除非本身是文档类型）
    // 这里仅对图片做相册限制；视频可直接进入相册

    // ===== 探测 =====
    if (isVideo) {
        const probe = await probeVideo(path);
        if (!probe.ok) {
            // 解码失败 → 文档兜底
            return { status: 'ok', kind: 'document', probeFailed: true };
        }
        return { status: 'ok', kind: 'video', width: probe.width, height: probe.height, duration: probe.duration };
    }

    if (isImage) {
        // 图片过大时不做完整解码，避免大文件读入内存（此时按文档发送最稳妥）
        if (size > IMAGE_MAX_BYTES) {
            return { status: 'ok', kind: 'document', probeFailed: true };
        }
        const probe = await probeImage(path);

        // 解码失败（尺寸为 0 / 无法加载）→ 文档兜底
        if (!probe.ok) {
            return { status: 'ok', kind: 'document', probeFailed: true };
        }

        // GIF 不能进入相册；即使当前已有相册媒体，也保留为 animation，
        // 发送阶段会单独走 sendMessage，不会混入 sendMessageAlbum。
        if (ext === 'gif' || probe.gif) {
            return { status: 'ok', kind: 'animation', width: probe.width, height: probe.height };
        }

        // 宽高比 / 尺寸和超标
        const ratio = Math.max(probe.width, probe.height) / Math.max(1, Math.min(probe.width, probe.height));
        const sum = probe.width + probe.height;
        if (ratio > RATIO_LIMIT || sum > DIMENSION_SUM_LIMIT) {
            if (album) {
                return rejected('文件太大无法添加');
            }
            return { status: 'ok', kind: 'document', width: probe.width, height: probe.height };
        }

        return { status: 'ok', kind: 'photo', width: probe.width, height: probe.height };
    }

    return { status: 'ok', kind: 'document' };
}

function rejected(reason: string): ClassifyResult {
    return { status: 'rejected', reason };
}

function fmtText(text: string) {
    return { _: 'formattedText', text, entities: [] } as const;
}

function file(path: string) {
    return { _: 'inputFileLocal', path } as const;
}

/** 构造 inputThumbnail（封面缩略图），用于文档/音频封面 */
function thumbnailOf(path?: string) {
    if (!path) return undefined;
    return { _: 'inputThumbnail', thumbnail: file(path), width: 0, height: 0 } as const;
}

function photoContent(it: AttachmentItem, caption: string) {
    return {
        _: 'inputMessagePhoto',
        photo: { _: 'inputPhoto', photo: file(it.path), width: it.width, height: it.height },
        caption: fmtText(caption),
    } as const;
}

function videoContent(it: AttachmentItem, caption: string, cover?: string) {
    return {
        _: 'inputMessageVideo',
        video: {
            _: 'inputVideo',
            video: file(it.path),
            width: it.width,
            height: it.height,
            duration: it.duration,
            supports_streaming: true,
            cover: cover ? file(cover) : undefined,
        },
        caption: fmtText(caption),
    } as const;
}

function animationContent(it: AttachmentItem, caption: string) {
    return {
        _: 'inputMessageAnimation',
        animation: {
            _: 'inputAnimation',
            animation: file(it.path),
            width: it.width,
            height: it.height,
        },
        caption: fmtText(caption),
    } as const;
}

function documentContent(it: AttachmentItem, caption: string, cover?: string) {
    return {
        _: 'inputMessageDocument',
        document: {
            _: 'inputDocument',
            document: file(it.path),
            disable_content_type_detection: false,
            thumbnail: thumbnailOf(cover),
        },
        caption: fmtText(caption),
    } as const;
}

function audioContent(it: AttachmentItem, caption: string, cover?: string) {
    return {
        _: 'inputMessageAudio',
        audio: {
            _: 'inputAudio',
            audio: file(it.path),
            album_cover_thumbnail: thumbnailOf(cover),
        },
        caption: fmtText(caption),
    } as const;
}

interface SendCtx {
    chatId: number;
    topicId?: number | null;
    replyTo?: {
        _: 'inputMessageReplyToMessage';
        message_id: number;
        quote: inputTextQuote | null;
        checklist_task_id: number;
        poll_option_id?: string;
    } | null;
}

function baseParams(ctx: SendCtx) {
    const p: Record<string, unknown> = {
        chat_id: ctx.chatId,
        // options 字段可省略：TDLib 会使用默认发送选项（不传即用默认值）
    };
    if (ctx.topicId) p.topic_id = { _: 'messageTopicForum', forum_topic_id: ctx.topicId };
    if (ctx.replyTo) p.reply_to = ctx.replyTo;
    return p;
}

/**
 * 发送附件列表。
 * TDLib 规定 sendMessageAlbum 只能把同类文件组成相册：
 * - 图片/视频 → 相册（media 组）
 * - 文档 → 仅文档组成相册
 * - 音频 → 仅音频组成相册
 * - GIF 动画 → 不进相册，单独发送
 * 每类相册满 10 个自动再拆一组；单条则单独 sendMessage。
 * description 作为描述附加到（各类相册的）最后一张媒体。
 */
export async function sendAttachments(
    attachments: AttachmentItem[],
    ctx: SendCtx,
    description: string,
): Promise<boolean> {
    if (!attachments.length) return false;
    let ok = true;

    const hasAnyCaption = attachments.some((a) => (a.caption ?? '').length > 0);

    /**
     * 计算某个文件的描述：
     * - 该文件设置了独立描述 → 用它；
     * - 否则若没有任一带独立描述、且这是（相册的）最后一张媒体 → 用底部输入框的整体描述；
     * - 否则为空。
     */
    const captionFor = (it: AttachmentItem, isLastMedia: boolean): string => {
        if (it.caption) return it.caption;
        if (!hasAnyCaption && isLastMedia) return description;
        return '';
    };

    // 根据相册分组类型生成对应 InputMessageContent
    const buildContent = (it: AttachmentItem, caption: string) => {
        switch (it.kind) {
            case 'photo': return photoContent(it, caption);
            case 'video': return videoContent(it, caption, it.cover);
            case 'document': return documentContent(it, caption, it.cover);
            case 'audio': return audioContent(it, caption, it.cover);
            case 'animation': default: return animationContent(it, caption);
        }
    };

    // 发一条消息（单独/单条）
    const sendSingle = async (it: AttachmentItem) => {
        const cap = captionFor(it, true);
        try {
            await tdlibSend({
                ...baseParams(ctx),
                _: 'sendMessage',
                input_message_content: buildContent(it, cap),
            } as $Function);
        } catch (e) {
            console.error('sendMessage failed', e);
            ok = false;
        }
    };

    // 发一个相册组（每 10 个一组）。groupItems 必须属于同一相册分组类型。
    const sendAlbum = async (chunk: AttachmentItem[]) => {
        const contents = chunk.map((it, idx) => {
            const cap = captionFor(it, idx === chunk.length - 1);
            return buildContent(it, cap);
        }).map((c) => c as unknown as never);
        try {
            await tdlibSend({
                ...baseParams(ctx),
                _: 'sendMessageAlbum',
                input_message_contents: contents,
            } as $Function);
        } catch (e) {
            console.error('sendMessageAlbum failed', e);
            ok = false;
        }
    };

    // 把某类附件按 10 个一组分发：单条走 sendMessage，多条走 sendMessageAlbum
    const dispatchAlbumable = async (items: AttachmentItem[]) => {
        for (let i = 0; i < items.length; i += ALBUM_MAX) {
            const chunk = items.slice(i, i + ALBUM_MAX);
            if (chunk.length === 1) {
                await sendSingle(chunk[0]);
            } else {
                await sendAlbum(chunk);
            }
        }
    };

    // 按相册分组类型拆分：media / document / audio 各自成组发送；animation 单独发送
    const animations = attachments.filter((a) => a.kind === 'animation');
    const groups: Record<'media' | 'document' | 'audio', AttachmentItem[]> = {
        media: attachments.filter((a) => a.kind === 'photo' || a.kind === 'video'),
        document: attachments.filter((a) => a.kind === 'document'),
        audio: attachments.filter((a) => a.kind === 'audio'),
    };

    for (const type of ['media', 'document', 'audio'] as const) {
        if (groups[type].length) await dispatchAlbumable(groups[type]);
    }

    // GIF 动画单独发送（不能进相册）
    for (const it of animations) {
        await sendSingle(it);
    }

    return ok;
}

/** 用于 UI 展示的发送进度简要状态 */
export const sending = ref(false);
