import i18n from '../i18n';

/**
 * 消息预览占位：消息类型 → 展示文案。
 * 优先官方 `lng_in_dlg_*` / `lng_media_type_*`，官方没有的走内部 `preview.*`。
 * ChatList / ForumTopicList / PinnedMessageBar / directMessagesTopics 共用，避免多处拷贝。
 */

/** 消息 content._（或简写类型名）→ 预览类型名 */
export function messageContentTypeLabel(contentType: string): string {
    switch (contentType) {
        case 'messagePhoto':
        case 'photo':
            return i18n.global.t('lng_in_dlg_photo');
        case 'messageVideo':
        case 'video':
            return i18n.global.t('lng_in_dlg_video');
        case 'messageDocument':
        case 'document':
            return i18n.global.t('lng_in_dlg_file');
        case 'messageAudio':
        case 'audio':
            return i18n.global.t('lng_in_dlg_audio_file');
        case 'messageVoiceNote':
            return i18n.global.t('lng_in_dlg_audio');
        case 'messageVideoNote':
            return i18n.global.t('lng_in_dlg_video_message');
        case 'messageAnimation':
        case 'animation':
            return i18n.global.t('preview.gif');
        case 'messageSticker':
        case 'sticker':
            return i18n.global.t('lng_in_dlg_sticker');
        case 'messagePoll':
        case 'poll':
            return i18n.global.t('lng_in_dlg_poll');
        case 'messageContact':
        case 'contact':
            return i18n.global.t('lng_in_dlg_contact');
        case 'messageLocation':
        case 'messageVenue':
        case 'location':
            return i18n.global.t('lng_location_title');
        case 'messageDice':
            return i18n.global.t('lng_sr_message_column_dice');
        case 'messageGame':
            return i18n.global.t('preview.game');
        case 'messageStory':
            return i18n.global.t('lng_in_dlg_story');
        case 'messageTodoList':
            return i18n.global.t('lng_in_dlg_todo_list');
        case 'messageChatChangeTitle':
            return i18n.global.t('preview.chatChangeTitle');
        case 'messagePaidMedia':
            return i18n.global.t('lng_in_dlg_album');
        default:
            return i18n.global.t('preview.message');
    }
}

/**
 * 贴纸预览标签（不含 emoji 前缀）。
 * 有 emoji 时用官方 `lng_in_dlg_sticker_emoji`（`{emoji} Sticker`），否则 `lng_in_dlg_sticker`。
 */
export function stickerPreviewLabel(emoji?: string | null): string {
    const e = (emoji ?? '').trim();
    if (e) return i18n.global.t('lng_in_dlg_sticker_emoji', { emoji: e });
    return i18n.global.t('lng_in_dlg_sticker');
}

/** 贴纸行预览：`emoji [Sticker]` / `[Sticker]`（对齐 ChatList/ForumTopicList 排版） */
export function stickerBracketPreview(emoji?: string | null): string {
    const e = (emoji ?? '').trim();
    const label = i18n.global.t('lng_in_dlg_sticker');
    return e ? `${e} [${label}]` : `[${label}]`;
}

/** `[类型] 补充` 或单独 `[类型]` */
export function bracketTypePreview(label: string, extra?: string | null): string {
    const x = (extra ?? '').trim();
    return x ? `[${label}] ${x}` : `[${label}]`;
}

/** 投票选项增删预览：`Added option: xxx` / `Removed option: xxx` */
export function pollOptionPreviewText(
    kind: 'added' | 'deleted',
    optionText?: string | null,
): string {
    const option = optionText ?? '';
    return kind === 'added'
        ? i18n.global.t('preview.pollOptionAdded', { option })
        : i18n.global.t('preview.pollOptionDeleted', { option });
}

/** 音乐行预览：`[Music] title performer` */
export function musicBracketPreview(title?: string | null, performer?: string | null): string {
    const extra = [title, performer].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
    return bracketTypePreview(i18n.global.t('lng_all_music'), extra);
}
