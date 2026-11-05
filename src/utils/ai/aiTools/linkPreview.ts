/**
 * AI 工具层：链接预览（linkPreview）的**纯逻辑** —— 只留模型读得懂的文字与动画信息。
 *
 * 不 import Tauri / vue / i18n，scripts/checkAiTools.ts 直接断言。
 * 缩略图 / minithumbnail / 文件对象一律不返回：模型看不见图，二进制字段纯浪费上下文。
 */
import type { linkPreview } from "tdlib-types";

/** 预览里的媒体（动画 / 视频 / 音频…）；普通网页、图片返回 undefined */
export interface LinkMediaInfo {
  kind:
    | "animation"
    | "video"
    | "audio"
    | "voice_note"
    | "video_note"
    | "document"
    | "sticker"
    | "embedded_animation"
    | "embedded_video";
  file_name?: string;
  mime_type?: string;
  /** 时长（秒） */
  duration?: number;
  width?: number;
  height?: number;
  /** 贴纸表情 */
  emoji?: string;
  /** 贴纸格式：stickerFormatTgs（动画）/ stickerFormatWebm（视频）/ stickerFormatWebp（静态） */
  sticker_format?: string;
}

export interface LinkPreviewInfo {
  message_id: number;
  /** 消息里的原始 URL */
  url: string;
  display_url: string;
  site_name: string;
  title: string;
  /** 纯文本简介 */
  description: string;
  author: string;
  /** 原样给模型：linkPreviewTypeAnimation / linkPreviewTypeArticle … 不自造枚举 */
  type: string;
  media?: LinkMediaInfo;
}

/** 动画 / 视频 / 音频共有的字段（音频没有宽高） */
function fileInfo(f: { file_name: string; mime_type: string; duration: number; width?: number; height?: number }): Omit<LinkMediaInfo, "kind"> {
  return { file_name: f.file_name, mime_type: f.mime_type, duration: f.duration, width: f.width, height: f.height };
}

function mediaOf(type: linkPreview["type"]): LinkMediaInfo | undefined {
  switch (type._) {
    case "linkPreviewTypeAnimation":
      return { kind: "animation", ...fileInfo(type.animation) };
    case "linkPreviewTypeVideo":
      return { kind: "video", ...fileInfo(type.video) };
    case "linkPreviewTypeAudio":
      return { kind: "audio", ...fileInfo(type.audio) };
    case "linkPreviewTypeVoiceNote":
      return { kind: "voice_note", mime_type: type.voice_note.mime_type, duration: type.voice_note.duration };
    case "linkPreviewTypeVideoNote":
      // 视频消息是圆的，宽高都等于 length
      return {
        kind: "video_note",
        duration: type.video_note.duration,
        width: type.video_note.length,
        height: type.video_note.length,
      };
    case "linkPreviewTypeDocument":
      return { kind: "document", file_name: type.document.file_name, mime_type: type.document.mime_type };
    case "linkPreviewTypeSticker":
      return {
        kind: "sticker",
        emoji: type.sticker.emoji,
        sticker_format: type.sticker.format._,
        width: type.sticker.width,
        height: type.sticker.height,
      };
    case "linkPreviewTypeEmbeddedAnimationPlayer":
      return { kind: "embedded_animation", duration: type.duration, width: type.width, height: type.height };
    case "linkPreviewTypeEmbeddedVideoPlayer":
      return { kind: "embedded_video", duration: type.duration, width: type.width, height: type.height };
    default:
      return undefined;
  }
}

export function linkPreviewInfo(messageId: number, preview: linkPreview): LinkPreviewInfo {
  const media = mediaOf(preview.type);
  return {
    message_id: messageId,
    url: preview.url,
    display_url: preview.display_url,
    site_name: preview.site_name,
    title: preview.title,
    description: preview.description?.text ?? "",
    author: preview.author,
    type: preview.type._,
    ...(media ? { media } : {}),
  };
}
