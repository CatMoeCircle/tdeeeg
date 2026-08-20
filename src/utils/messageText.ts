import type { message, formattedText } from "tdlib-types";

/**
 * 从消息内容中提取可复制/展示的纯文本。
 * 支持文本、富文本、代码、引用、文件/音频 caption、媒体 caption、贴纸 emoji 等。
 */
export function getMessagePlainText(msg: message): string {
    const c = msg.content;
    if (!c) return "";

    function textOf(t?: formattedText): string {
        if (!t) return "";
        return t.text ?? "";
    }

    switch (c._) {
        case "messageText":
            return textOf(c.text);
        case "messageRichMessage":
            // 富文本消息：内容位于 blocks（PageBlock 数组），本函数暂不提取
            return "";
        case "messagePhoto":
            return textOf(c.caption);
        case "messageVideo":
            return textOf(c.caption);
        case "messageDocument":
            return textOf(c.caption) || c.document.file_name;
        case "messageAudio":
            return textOf(c.caption) ||
                (c.audio.performer + " - " + c.audio.title).trim();
        case "messageVoiceNote":
            return textOf(c.caption);
        case "messageVideoNote":
            return "";
        case "messageAnimation":
            return textOf(c.caption);
        case "messageSticker":
            // 贴纸 emoji
            return c.sticker.emoji ?? "";
        case "messagePoll":
            return c.poll.question.text ?? "";
        case "messagePollOptionAdded":
            return "添加了选项：" + (c.text.text ?? "");
        case "messagePollOptionDeleted":
            return "删除了选项：" + (c.text.text ?? "");
        case "messageLocation":
            return "位置";
        case "messageVenue":
            return c.venue.title ?? "位置";
        case "messageContact":
            return (c.contact.first_name + " " + c.contact.last_name).trim() || "联系人";
        case "messageGame":
            return c.game.title ?? "";
        case "messageDice":
            return (c.emoji ?? "") + " " + (c.value ?? "") + "🎲";
        case "messageCall":
            return c.is_video ? "视频通话" : "语音通话";
        default:
            return "";
    }
}

/**
 * 从消息内容中提取可翻译的富文本（formattedText）。
 * 支持文本消息与媒体 caption；无可用文本时返回 null。
 */
export function getMessageFormattedText(msg: message): formattedText | null {
    const c = msg.content;
    if (!c) return null;
    switch (c._) {
        case "messageText":
            return c.text;
        case "messagePhoto":
        case "messageVideo":
        case "messageAnimation":
        case "messageVoiceNote":
        case "messageAudio":
        case "messageDocument":
        case "messagePaidMedia":
            return c.caption;
        default:
            return null;
    }
}
