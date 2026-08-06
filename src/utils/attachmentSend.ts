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
}

export type ClassifyResult =
    | { status: 'ok'; kind: AttachmentKind; width?: number; height?: number; duration?: number; probeFailed?: boolean }
    | { status: 'rejected'; reason: string };

/**
 * 对单个待添加文件进行分类并校验。
 * 若返回 rejected，调用方将在聊天框顶部显示 reason（也已用 MessagePlugin 提示）。
 */
export async function classifyAttachment(input: ClassifyInput): Promise<ClassifyResult> {
    const { path, name, size, album, isPremium } = input;

    // ===== 大小上限校验（图片/视频）=====
    if (size > BYTES_4GB) {
        return rejected(`文件超过 4GB 上限，无法发送`);
    }
    if (size > BYTES_2GB && !isPremium) {
        return rejected(`发送超过 2GB 的文件需要 Telegram Premium`);
    }

    const ext = extOf(name);
    const isImage = IMAGE_EXTS.includes(ext);
    const isVideo = VIDEO_EXTS.includes(ext);

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

function photoContent(it: AttachmentItem, caption: string) {
    return {
        _: 'inputMessagePhoto',
        photo: { _: 'inputPhoto', photo: file(it.path), width: it.width, height: it.height },
        caption: fmtText(caption),
    } as const;
}

function videoContent(it: AttachmentItem, caption: string) {
    return {
        _: 'inputMessageVideo',
        video: {
            _: 'inputVideo',
            video: file(it.path),
            width: it.width,
            height: it.height,
            duration: it.duration,
            supports_streaming: true,
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

function documentContent(it: AttachmentItem, caption: string) {
    return {
        _: 'inputMessageDocument',
        document: {
            _: 'inputDocument',
            document: file(it.path),
            disable_content_type_detection: false,
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
        options: { _: 'messageSendOptions', disable_notification: false, from_background: false },
    };
    if (ctx.topicId) p.topic_id = { _: 'messageTopicForum', forum_topic_id: ctx.topicId };
    if (ctx.replyTo) p.reply_to = ctx.replyTo;
    return p;
}

/**
 * 发送附件列表。
 * - 图片/视频构成相册（每 10 个一组）；单个图片/视频单独发送。
 * - GIF 按动画发送；其余按文档发送（各自单独发送，不会混入相册）。
 * - description 作为描述附加到首个媒体消息。
 */
export async function sendAttachments(
    attachments: AttachmentItem[],
    ctx: SendCtx,
    description: string,
): Promise<boolean> {
    if (!attachments.length) return false;
    let ok = true;

    const media = attachments.filter((a) => a.kind === 'photo' || a.kind === 'video');
    const others = attachments.filter((a) => a.kind === 'animation' || a.kind === 'document');

    // 是否任一文件设置了独立描述（若都没有，则把底部输入框的内容作为整体描述加到最后一张媒体上）
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

    // ===== 相册/单媒体 =====
    for (let i = 0; i < media.length; i += ALBUM_MAX) {
        const chunk = media.slice(i, i + ALBUM_MAX);
        if (chunk.length === 1) {
            const it = chunk[0];
            const cap = captionFor(it, true);
            const content = it.kind === 'photo'
                ? photoContent(it, cap)
                : videoContent(it, cap);
            try {
                await tdlibSend({
                    ...baseParams(ctx),
                    _: 'sendMessage',
                    input_message_content: content,
                } as $Function);
            } catch (e) {
                console.error('sendMessage failed', e);
                ok = false;
            }
        } else {
            // 相册（TDLib 只让最后一条携带可见描述；独立描述逐条附加到对应文件的 caption）
            const contents = chunk.map((it, idx) => {
                const cap = captionFor(it, idx === chunk.length - 1);
                return it.kind === 'photo'
                    ? photoContent(it, cap)
                    : videoContent(it, cap);
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
        }
    }

    // ===== GIF / 文档（各自单独发送）=====
    for (const it of others) {
        const cap = captionFor(it, true);
        const content = it.kind === 'animation'
            ? animationContent(it, cap)
            : documentContent(it, cap);
        try {
            await tdlibSend({
                ...baseParams(ctx),
                _: 'sendMessage',
                input_message_content: content,
            } as $Function);
        } catch (e) {
            console.error('sendMessage (document/animation) failed', e);
            ok = false;
        }
    }

    return ok;
}

/** 用于 UI 展示的发送进度简要状态 */
export const sending = ref(false);
