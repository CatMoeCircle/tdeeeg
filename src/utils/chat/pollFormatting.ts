import type { formattedText, InputPollMedia, location, sticker, textEntity } from 'tdlib-types';

/** 投票富文本里的自定义 emoji：id 用于发送实体，alt 作为文本占位/回退字符 */
export interface PollEmoji {
    id: string;
    alt: string;
}

/**
 * 投票选项可附的媒体。对齐 Android 投票选项：图片、贴纸、位置、链接；
 * 不支持音频 / 普通文件。
 */
export type PollOptionMedia =
    | { kind: 'photo'; path: string; name: string; size: number; width: number; height: number }
    | { kind: 'video'; path: string; name: string; size: number; width: number; height: number; duration: number }
    | { kind: 'audio'; path: string; name: string; size: number; duration: number }
    | { kind: 'sticker'; fileId: number; name: string; width: number; height: number; sticker: sticker }
    | { kind: 'location'; location: location; name: string }
    | { kind: 'link'; url: string; name: string };

/**
 * 把「纯文本 + 自定义 emoji 列表」组装成 formattedText。
 * 与消息输入框的 buildCustomEmojiEntities 同源：按插入顺序用 indexOf 定位占位字符。
 */
export function buildPollFormattedText(
    text: string,
    emojis: PollEmoji[],
): formattedText {
    const entities: textEntity[] = [];
    let searchFrom = 0;
    for (const emoji of emojis) {
        if (!emoji.alt) continue;
        const index = text.indexOf(emoji.alt, searchFrom);
        if (index < 0) continue;
        entities.push({
            _: 'textEntity',
            offset: index,
            length: emoji.alt.length,
            type: { _: 'textEntityTypeCustomEmoji', custom_emoji_id: emoji.id },
        });
        searchFrom = index + emoji.alt.length;
    }
    return { _: 'formattedText', text, entities };
}

function localFile(path: string) {
    return { _: 'inputFileLocal', path } as const;
}

/** 投票选项媒体 → TDLib inputPollMedia* */
export function buildPollOptionMedia(item: PollOptionMedia): InputPollMedia {
    switch (item.kind) {
        case 'photo':
            return {
                _: 'inputPollMediaPhoto',
                photo: {
                    _: 'inputPhoto',
                    photo: localFile(item.path),
                    thumbnail: null,
                    video: null,
                    added_sticker_file_ids: [],
                    width: item.width,
                    height: item.height,
                },
            } as unknown as InputPollMedia;
        case 'video':
            return {
                _: 'inputPollMediaVideo',
                video: {
                    _: 'inputVideo',
                    video: localFile(item.path),
                    thumbnail: null,
                    cover: null,
                    start_timestamp: 0,
                    added_sticker_file_ids: [],
                    duration: item.duration,
                    width: item.width,
                    height: item.height,
                    supports_streaming: true,
                },
            } as unknown as InputPollMedia;
        case 'audio':
            return {
                _: 'inputPollMediaAudio',
                audio: {
                    _: 'inputAudio',
                    audio: localFile(item.path),
                    album_cover_thumbnail: null,
                    duration: item.duration,
                    title: '',
                    performer: '',
                },
            } as unknown as InputPollMedia;
        case 'sticker':
            return {
                _: 'inputPollMediaSticker',
                sticker: {
                    _: 'inputSticker',
                    sticker: { _: 'inputFileId', id: item.fileId },
                    thumbnail: null,
                    width: item.width,
                    height: item.height,
                },
            } as unknown as InputPollMedia;
        case 'location':
            return {
                _: 'inputPollMediaLocation',
                location: item.location,
            } as unknown as InputPollMedia;
        case 'link':
            return {
                _: 'inputPollMediaLink',
                url: item.url,
            } as unknown as InputPollMedia;
    }
}
