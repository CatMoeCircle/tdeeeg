import { type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type {
    basicGroup, chat, ChatMemberStatus, file as TdFile, message, MessageSender, ReactionType, supergroup,
} from 'tdlib-types';
import {
    Reply as ReplyIcon, Quote as QuoteIcon, Pencil as PencilIcon, CheckSquare as CheckSquareIcon,
    CopyPlus as CopyPlusIcon, Share as ShareIcon, Bookmark as BookmarkIcon, FolderOpen as FolderOpenIcon,
    Download as DownloadIcon, Languages as LanguagesIcon, Link as LinkIcon, Eye as EyeIcon,
    UserCheck as UserCheckIcon, MessageSquare as MessageSquareIcon, AudioLines as AudioLinesIcon,
    Flag as FlagIcon, Undo2 as Undo2Icon, CircleStop as CircleStopIcon, Pin as PinIcon, Trash as TrashIcon,
    ClipboardCopy as ClipboardCopyIcon,
} from 'lucide-vue-next';
import { tdlibSend, isFileReady } from '../../../../utils/tdlib';
import { revealFileInDir, saveFileAs } from '../../../../utils/fileActions';
import { toast } from '../../../../utils/toast';
import { getMessagePlainText, getMessageFormattedText } from '../../../../utils/messageText';
import { messageSenderKey } from '../../../../utils/senderInfo';
import { settings } from '../../../../store/settings';
import { showCopyJsonInMenus } from '../../../../store/debug';
import { openContextMenu } from '../../../../store/contextMenu';
import {
    copyMessageText, copyMessageJson, copyMessageLink,
    toggleMessagePinned, pinMessage, getMessageProperties, getCachedMessageProperties,
    executeDeleteActions,
    canCopyMessage, canForwardMessage, canGetMessageLink, canPinMessage, canDeleteMessage,
    canReplyMessage, canEditMessage,
    canSaveMessage, canGetViewers, canGetReadDate, canGetAuthor,
    canGetMessageThread, canRecognizeSpeech, canReportMessage,
    toggleReaction,
    canRetractPollVote, canStopPoll, retractPollVote, stopPollMessage,
} from '../../../contextMenu/messageActions';
import {
    showTranslateDialog, translateInlineMessage, getInlineTranslation,
    removeInlineTranslation, isTranslateReplaceDisplay, getTranslateTargetLang,
} from '../../../../store/translate';
import {
    openTranscripts, transcriptKey, transcriptTextOf,
    getTranscriptTranslation, clearTranscriptTranslation, translateTranscript,
} from '../../../../composables/speechTranscript';
import { DEFAULT_TRANSLATE_TARGET } from '../../../../utils/translateLanguages';
import { confirmDeleteMessage } from '../../../../store/deleteMessage';
import type { DeleteMessageRequest, DeleteSenderInfo } from '../../../../store/deleteMessage';
import { confirmPinMessage } from '../../../../store/pinMessage';
import { confirmStopPoll } from '../../../../store/stopPoll';
import { confirmReportMessage } from '../../../../store/reportMessage';
import { isServiceMessage } from './messageType';
import type { ContextMenuItem, ContextMenuReactionItem, ContextMenuReactionRow } from '../../../contextMenu/types';

/** 翻译目标语言（用户设置） */
function translateTargetLang(): string {
    return getTranslateTargetLang() || DEFAULT_TRANSLATE_TARGET;
}

/**
 * 消息右键菜单 + 单条消息动作（复制/转发/保存/翻译/置顶/删除/举报……）。
 *
 * 从 `ChatDetail/index.vue` 抽出。所有依赖以 ref / 回调注入，
 * 函数体与原实现逐行一致；`pendingReadDateLabel` / `currentMenuMsg` /
 * `pendingReactionRow` 等跨调用状态留在本模块。
 */
export function useMessageContextMenu(deps: {
    chat: Ref<chat | undefined>;
    chatId: ComputedRef<number | undefined>;
    myId: ComputedRef<number>;
    isInSavedMessages: ComputedRef<boolean>;
    selectionMode: Ref<boolean>;
    exitSelectionMode: () => void;
    supergroups: Ref<Record<number, supergroup>>;
    basicGroups: Ref<Record<number, basicGroup>>;
    memberStatus: Ref<Record<number, { status?: ChatMemberStatus }>>;
    startReply: (msg: message | null) => void;
    startQuoteReply: (msg: message, quote: string) => void;
    startForward: (msg: message) => void;
    enterSelectionMode: (msg: message) => void;
    startEdit: (msg: message) => void | Promise<void>;
    openReactionPicker: (
        msg: message,
        anchorEl?: HTMLElement,
        fullEmoji?: boolean,
        contextMenuRect?: { x: number; y: number; width: number; height: number },
    ) => void;
    onMessagePinnedStateChanged: (messageId: number, isPinned: boolean) => void;
    getDisplaySenderName: (msg: message) => string;
    getDisplaySenderPhoto: (msg: message) => import('tdlib-types').chatPhotoInfo | import('tdlib-types').profilePhoto | undefined;
    getDisplaySenderNames: (msg: message) => { first: string; last: string };
    getDisplaySenderProfileAccentId: (msg: message) => number | undefined;
    getDisplaySenderDeleted: (msg: message) => boolean;
}) {
    const { t } = useI18n();
    const router = useRouter();
    const { chat, chatId, myId, isInSavedMessages, selectionMode } = deps;

    // ===== 阅读状态 / 回应栏 / 菜单目标（跨调用状态） =====
    /** 当前右键菜单对应的阅读状态标签（异步预取后写入） */
    let pendingReadDateLabel: string | null = null;
    /** 当前右键菜单对应的消息（供获取完成后判断是否需要打开菜单） */
    let currentMenuMsg: message | null = null;
    /** 缓存最近一次构建的回应栏（供 v-context-menu 指令读取） */
    let pendingReactionRow: ContextMenuReactionRow | null = null;

    /** 获取当前文档选中文本中属于「该消息气泡」的片段（无选中返回 null） */
    function getSelectedQuoteForMessage(msg: message): string | null {
        const sel = window.getSelection?.();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return null;
        let container = range.commonAncestorContainer as Node;
        if (container.nodeType !== Node.ELEMENT_NODE) container = container.parentElement as Node;
        const el = container as HTMLElement | null;
        const bubble = el?.closest(`[data-bubble-msg-id="${msg.id}"]`);
        if (!bubble) return null;
        const text = sel.toString();
        return text.trim() ? text.trim() : null;
    }

    // ===== 单条消息动作 =====

    /** 保存消息到收藏（Saved Messages） */
    async function handleSaveMessage(msg: message) {
        const cid = chatId.value;
        if (cid === undefined) return;
        try {
            const savedChatId = myId.value;
            if (!savedChatId) {
                toast.warning(t('chat.savedChatUnavailable'));
                return;
            }
            await tdlibSend({
                _: 'forwardMessages',
                from_chat_id: cid,
                message_ids: [msg.id],
                to_chat_id: savedChatId,
                as_copy: true,
                disable_notification: false,
                send_pinned: false,
            });
            toast.success(t('chat.savedToSaved'));
        } catch (e: any) {
            console.error('saveMessage failed:', e);
            toast.error(e?.message || t('chat.saveFailed'));
        }
    }

    /** 查看消息回应者 */
    async function handleGetViewers(msg: message) {
        const cid = chatId.value;
        if (cid === undefined) return;
        try {
            const result = await tdlibSend({
                _: 'getMessageViewers',
                chat_id: cid,
                message_id: msg.id,
            }) as any;
            const viewers: Array<{ user_id: number; view_date: number }> = result?.viewers || [];
            if (viewers.length === 0) {
                toast.info(t('lng_context_seen_reacted_none'));
                return;
            }
            const users = await Promise.all(viewers.map(v =>
                tdlibSend({ _: 'getUser', user_id: v.user_id } as any).catch(() => null)
            ));
            const names = users
                .filter((u): u is any => u && u._ === 'user')
                .map(u => `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}`);
            const nameList = names.length > 0 ? names.join(', ') : t('chat.userCount', { count: viewers.length });
            toast.success({ content: t('chat.reactorsList', { names: nameList }), duration: 5000 });
        } catch (e: any) {
            console.error('getMessageViewers failed:', e);
            toast.error(e?.message || t('chat.getReactorsFailed'));
        }
    }

    /** 预取阅读状态，返回可显示的标签文本（null 表示不显示） */
    async function fetchReadDateLabel(msg: message): Promise<string | null> {
        const cid = msg.chat_id || chatId.value;
        if (cid === undefined) return null;
        if (!canGetReadDate(msg, cid)) return null;
        try {
            const result = await tdlibSend({
                _: 'getMessageReadDate',
                chat_id: cid,
                message_id: msg.id,
            }) as any;
            switch (result?._) {
                case 'messageReadDateRead': {
                    const d = new Date(result.read_date * 1000);
                    const timeStr = d.toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    });
                    return t('chat.readAt', { time: timeStr });
                }
                case 'messageReadDateUnread':
                    return t('lng_sr_message_not_seen');
                case 'messageReadDateTooOld':
                    return t('chat.readDateTooOld');
                case 'messageReadDateUserPrivacyRestricted':
                    return t('chat.readDatePrivacyOther');
                case 'messageReadDateMyPrivacyRestricted':
                    return t('chat.readDatePrivacyMe');
                default:
                    return null;
            }
        } catch {
            return null;
        }
    }

    /** 查看消息真实作者（频道代发消息） */
    async function handleGetAuthor(msg: message) {
        const cid = chatId.value;
        if (cid === undefined) return;
        try {
            const author = await tdlibSend({
                _: 'getMessageAuthor',
                chat_id: cid,
                message_id: msg.id,
            }) as any;
            if (author && author._ === 'user') {
                router.push({ name: 'user-profile', params: { id: String(author.id) } });
            } else {
                toast.info(t('chat.authorUnavailable'));
            }
        } catch (e: any) {
            console.error('getMessageAuthor failed:', e);
            toast.error(e?.message || t('chat.getAuthorFailed'));
        }
    }

    /** 打开频道帖子的评论线程视图（评论条 / 右键「查看消息线程」共用入口） */
    function openCommentsThread(msg: message) {
        const cid = chatId.value;
        if (cid === undefined) return;
        router.push(`/home/chat/${cid}/thread/${msg.id}`);
    }

    /** 语音转文字 */
    async function handleRecognizeSpeech(msg: message) {
        const cid = chatId.value;
        if (cid === undefined) return;
        try {
            const result = await tdlibSend({
                _: 'recognizeSpeech',
                chat_id: cid,
                message_id: msg.id,
            }) as any;
            if (result && result.text) {
                toast.success(t('chat.transcriptResult', { text: result.text }));
            } else {
                toast.info(t('chat.transcriptEmpty'));
            }
        } catch (e: any) {
            console.error('recognizeSpeech failed:', e);
            toast.error(e?.message || t('chat.transcriptFailed'));
        }
    }

    /** 举报消息（弹出举报原因选择器） */
    async function handleReportMessage(msg: message) {
        const cid = chatId.value;
        if (cid === undefined) return;
        try {
            await confirmReportMessage({ chatId: cid, msg });
            toast.success(t('lng_report_spam_thanks'));
        } catch (e: any) {
            if (e?.message !== 'canceled') {
                console.error('reportChat failed:', e);
                toast.error(e?.message || t('chat.reportFailed'));
            }
        }
    }

    // ===== 翻译 =====

    /** 打开消息翻译弹窗（提取富文本并交给 TranslateMessageModal） */
    function openTranslateDialogFor(msg: message) {
        const ft = getMessageFormattedText(msg);
        if (!ft || !ft.text.trim()) return;
        showTranslateDialog({
            chatId: chatId.value ?? 0,
            msg,
            text: ft,
            plainText: getMessagePlainText(msg),
        });
    }

    /** 根据「翻译显示设置」选择弹窗 / 内联 / 原位替换 */
    function openTranslateFor(msg: message) {
        const ft = getMessageFormattedText(msg);
        if (!ft || !ft.text.trim()) return;
        const cid = chatId.value ?? 0;
        const targetLang = translateTargetLang();
        // 相册消息不提供内联展示槽位，回退到弹窗
        const isAlbumMember = !!msg.media_album_id && msg.media_album_id !== '0';
        const mode = settings.translate.displayMode;
        if ((mode === 'inline' || mode === 'replace') && !isAlbumMember) {
            void translateInlineMessage(cid, msg.id, ft, targetLang, 'manual', getMessagePlainText(msg));
        } else {
            openTranslateDialogFor(msg);
        }
    }

    /** 移除该消息的翻译（右键「显示原文」） */
    function removeTranslateFor(msg: message) {
        removeInlineTranslation(chatId.value ?? 0, msg.id);
    }

    /** 气泡底部时间行是否标注「已翻译」 */
    function isShowingTranslation(msg: message): boolean {
        if (!isTranslateReplaceDisplay()) return false;
        const cid = msg.chat_id || chatId.value;
        if (cid === undefined) return false;
        return !!getInlineTranslation(cid, msg.id)?.translatedText
            || !!getTranscriptTranslation(cid, msg.id)?.text;
    }

    /** 翻译语音 / 圆形视频的识别文本（右键菜单） */
    function openTranslateForTranscript(msg: message, text: string) {
        const cid = chatId.value ?? 0;
        openTranscripts.add(transcriptKey(cid, msg.id));
        const mode = settings.translate.displayMode;
        if (mode === 'inline' || mode === 'replace') {
            void translateTranscript(cid, msg.id, text);
        } else {
            showTranslateDialog({
                chatId: cid,
                text: { _: 'formattedText', text, entities: [] },
                plainText: text,
            });
        }
    }

    // ===== 媒体文件 =====

    /** 从文档/图片/视频/音乐消息中提取实际承载内容的 file 对象（无则返回 undefined） */
    function getMessageFile(msg: message): TdFile | undefined {
        const c = msg.content;
        if (c._ === 'messagePhoto') {
            const sizes = c.photo.sizes;
            if (sizes.length === 0) return undefined;
            const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
            return largest.photo;
        }
        if (c._ === 'messageVideo') return c.video.video;
        if (c._ === 'messageDocument') return c.document.document;
        if (c._ === 'messageAudio') return c.audio.audio;
        return undefined;
    }

    /** 提取媒体文件建议名称：优先发送方提供的 file_name，图片等无名称时回退本地路径末段 */
    function getMessageFileName(msg: message, file: TdFile): string {
        const c = msg.content;
        let name = '';
        if (c._ === 'messageVideo') name = c.video.file_name;
        else if (c._ === 'messageDocument') name = c.document.file_name;
        else if (c._ === 'messageAudio') name = c.audio.file_name;
        if (name) return name;
        const p = file.local.path;
        return p ? p.split(/[\\/]/).pop() || 'media' : 'media';
    }

    // ===== 删除 / 权限 =====

    /** 当前用户在当前对话的成员管理权限（与具体发送者无关） */
    function getChatModeration(): { canDeleteAll: boolean; canDeleteReactions: boolean; canBan: boolean } {
        const c = chat.value;
        if (!c) return { canDeleteAll: false, canDeleteReactions: false, canBan: false };

        if (c.type._ === 'chatTypeSupergroup') {
            const status = deps.supergroups.value[c.type.supergroup_id]?.status;
            if (!status) return { canDeleteAll: false, canDeleteReactions: false, canBan: false };
            if (status._ === 'chatMemberStatusCreator') {
                return { canDeleteAll: true, canDeleteReactions: true, canBan: true };
            }
            if (status._ === 'chatMemberStatusAdministrator') {
                return {
                    canDeleteAll: status.rights.can_delete_messages,
                    canDeleteReactions: status.rights.can_delete_messages,
                    canBan: status.rights.can_restrict_members,
                };
            }
            return { canDeleteAll: false, canDeleteReactions: false, canBan: false };
        }

        if (c.type._ === 'chatTypeBasicGroup') {
            const status = deps.basicGroups.value[c.type.basic_group_id]?.status;
            if (!status) return { canDeleteAll: false, canDeleteReactions: false, canBan: false };
            // 基础群管理员可封禁、可删除回应；deleteChatMessagesBySender 仅超级群支持
            if (status._ === 'chatMemberStatusCreator' || status._ === 'chatMemberStatusAdministrator') {
                return { canDeleteAll: false, canDeleteReactions: true, canBan: true };
            }
            return { canDeleteAll: false, canDeleteReactions: false, canBan: false };
        }

        return { canDeleteAll: false, canDeleteReactions: false, canBan: false };
    }

    /** 消息发送者（用户类型）的 user_id；其他类型发送者（频道等）返回 undefined */
    function senderUserIdOf(msg: message): number | undefined {
        const s = msg.sender_id;
        return s?._ === 'messageSenderUser' ? s.user_id : undefined;
    }

    /** 当前用户能否封禁/限制该发送者（成员状态感知） */
    async function canRestrictSender(cid: number, sender: MessageSender): Promise<boolean> {
        if (sender._ !== 'messageSenderUser') return false;
        const uid = sender.user_id;
        let status: ChatMemberStatus | undefined = deps.memberStatus.value[uid]?.status;
        if (!status) {
            try {
                const member = await tdlibSend({
                    _: 'getChatMember',
                    chat_id: cid,
                    member_id: { _: 'messageSenderUser', user_id: uid },
                }) as import('tdlib-types').chatMember;
                status = member?.status;
            } catch {
                return true;
            }
        }
        if (!status) return true;
        if (status._ === 'chatMemberStatusCreator') return false;
        if (status._ === 'chatMemberStatusAdministrator') return status.can_be_edited === true;
        return true;
    }

    /** 收集选中消息的发送者（去重、剔除自己与「以本聊天身份发言」），并逐人判定能否封禁 */
    async function collectDeleteSenders(msgs: message[], cid: number): Promise<DeleteSenderInfo[]> {
        const { canDeleteAll, canDeleteReactions, canBan } = getChatModeration();
        const unique = new Map<string, { sender: MessageSender; msg: message; name: string }>();
        for (const msg of msgs) {
            const sender = msg.sender_id;
            if (!sender) continue;
            if (msg.is_outgoing === true) continue;
            if (sender._ === 'messageSenderUser' && sender.user_id === myId.value) continue;
            if (sender._ === 'messageSenderChat' && sender.chat_id === cid) continue;

            const key = messageSenderKey(sender);
            if (unique.has(key)) continue;
            unique.set(key, {
                sender,
                msg,
                name: deps.getDisplaySenderName(msg) || t('deleteConfirm.thisUser'),
            });
        }
        return Promise.all([...unique.entries()].map(async ([key, info]) => ({
            key,
            sender: info.sender,
            name: info.name,
            photo: deps.getDisplaySenderPhoto(info.msg),
            firstName: deps.getDisplaySenderNames(info.msg).first,
            lastName: deps.getDisplaySenderNames(info.msg).last,
            accentColorId: deps.getDisplaySenderProfileAccentId(info.msg),
            isDeleted: deps.getDisplaySenderDeleted(info.msg),
            canDeleteAll,
            canDeleteReactions,
            canBan: canBan && await canRestrictSender(cid, info.sender),
        })));
    }

    /** 打开「删除消息」确认弹窗，并根据发送者集合执行删除 / 批量管理动作 */
    async function openDeletePopup(msgs: message[]) {
        const cid = chatId.value;
        if (cid === undefined || msgs.length === 0) return;

        // 删除入口已保证可删；这里补齐精确属性用于判定「对所有人 / 仅自己」与举报
        await Promise.all(msgs.map(m => getMessageProperties(cid, m.id)));
        const propsList = msgs.map(m => getCachedMessageProperties(cid, m.id));
        const canDeleteForAll = propsList.some(p => p?.can_be_deleted_for_all_users === true);

        const senders = await collectDeleteSenders(msgs, cid);
        const type = chat.value?.type;
        const showDeleteForAll =
            type?._ === 'chatTypePrivate' ||
            type?._ === 'chatTypeSecret' ||
            type?._ === 'chatTypeBasicGroup';
        const canReportSpam =
            senders.length > 0 && propsList.some(p => p?.can_report_supergroup_spam === true);

        const req: DeleteMessageRequest = {
            chatId: cid,
            msgs,
            senders,
            showDeleteForAll,
            canDeleteForAll,
            canReportSpam,
            supportsBan: getChatModeration().canBan,
        };

        try {
            const result = await confirmDeleteMessage(req);
            const supergroupId =
                type?._ === 'chatTypeSupergroup' ? type.supergroup_id : undefined;
            await executeDeleteActions(cid, msgs, senders, result, supergroupId);
            if (selectionMode.value) deps.exitSelectionMode();
        } catch {
            // 用户取消，忽略
        }
    }

    /** 单条消息的删除弹窗（右键菜单入口） */
    async function openDeleteConfirm(msg: message) {
        await openDeletePopup([msg]);
    }

    /**
     * 打开「置顶」确认弹窗。
     * - 频道：无可选，直接置顶；
     * - 私聊：弹窗询问是否为对方置顶；
     * - 群组：弹窗询问是否通知群成员。
     */
    async function openPinConfirm(msg: message) {
        const cid = chatId.value;
        if (cid === undefined) return;

        const type = chat.value?.type;
        const isChannel = type?._ === 'chatTypeSupergroup' && type.is_channel;
        const isPrivate = type?._ === 'chatTypePrivate' || type?._ === 'chatTypeSecret';
        const isGroup = type?._ === 'chatTypeBasicGroup' || (type?._ === 'chatTypeSupergroup' && !type.is_channel);

        // 频道（或无法识别类型）：无可选，直接置顶
        if (isChannel || (!isPrivate && !isGroup)) {
            if (await pinMessage(cid, msg)) deps.onMessagePinnedStateChanged(msg.id, true);
            return;
        }

        const scope: 'private' | 'group' = isPrivate ? 'private' : 'group';
        const otherName = chat.value?.title || '';

        try {
            const result = await confirmPinMessage({ chatId: cid, msg, scope, otherName });
            if (scope === 'private') {
                if (await pinMessage(cid, msg, { onlyForSelf: !result.pinForOther })) {
                    deps.onMessagePinnedStateChanged(msg.id, true);
                }
            } else {
                if (await pinMessage(cid, msg, { disableNotification: !result.notifyMembers })) {
                    deps.onMessagePinnedStateChanged(msg.id, true);
                }
            }
        } catch {
            // 用户取消，忽略
        }
    }

    /** 打开「停止投票」确认弹窗，确认后调用 stopPoll */
    async function openStopPollConfirm(cid: number, msg: message) {
        try {
            await confirmStopPoll({ chatId: cid, msg });
        } catch {
            return;
        }
        await stopPollMessage(cid, msg);
    }

    // ===== 回应栏 =====

    /**
     * 构建消息右键菜单的回应栏数据。
     * 调用 TDLib getMessageAvailableReactions 获取该消息的可用回应，取前 6 个作为快捷行。
     */
    async function buildReactionRow(msg: message): Promise<ContextMenuReactionRow | null> {
        const cid = msg.chat_id || chatId.value;
        if (cid === undefined) return null;
        try {
            const result = await tdlibSend({
                _: 'getMessageAvailableReactions',
                chat_id: cid,
                message_id: msg.id,
            });
            if (result._ !== 'availableReactions') return null;
            const avail = result;
            const seen = new Set<string>();
            const all: { type: ReactionType; emoji: string; customEmojiId?: string; needsPremium: boolean }[] = [];
            for (const r of [...avail.top_reactions, ...avail.recent_reactions, ...avail.popular_reactions]) {
                const key = r.type._ === 'reactionTypeEmoji' ? r.type.emoji
                    : r.type._ === 'reactionTypeCustomEmoji' ? `c:${r.type.custom_emoji_id}`
                        : 'paid';
                if (seen.has(key)) continue;
                seen.add(key);
                const emoji = r.type._ === 'reactionTypeEmoji' ? r.type.emoji
                    : r.type._ === 'reactionTypeCustomEmoji' ? '🏷'
                        : t('lng_sr_message_column_paid_reactions');
                all.push({
                    type: r.type,
                    emoji,
                    customEmojiId: r.type._ === 'reactionTypeCustomEmoji' ? r.type.custom_emoji_id : undefined,
                    needsPremium: r.needs_premium,
                });
                if (all.length >= 6) break;
            }
            if (all.length === 0) return null;
            const isAllReactions = chat.value?.available_reactions?._ === 'chatAvailableReactionsAll';
            const totalAvailable = avail.top_reactions.length + avail.recent_reactions.length + avail.popular_reactions.length;
            return {
                reactions: all.map((r): ContextMenuReactionItem => ({
                    type: r.type,
                    emoji: r.emoji,
                    customEmojiId: r.customEmojiId,
                    needsPremium: r.needsPremium,
                    onClick: () => void toggleReaction(cid!, msg, r.type),
                })),
                hasMore: totalAvailable > 6 || isAllReactions,
                onMore: (anchorRect) => deps.openReactionPicker(msg, undefined, isAllReactions, anchorRect),
            };
        } catch (e) {
            console.warn('buildReactionRow failed:', e);
            return null;
        }
    }

    /**
     * 返回消息右键菜单构建函数（指令函数形式受支持）。
     * 用户实际右键时先触发 getMessageProperties 离线预取，等待精确权限后再渲染菜单。
     */
    function makeMsgMenu(msg: message) {
        return {
            items: async (_e: MouseEvent, _data?: any): Promise<ContextMenuItem[]> => {
                const cid = msg.chat_id || chatId.value;
                if (cid !== undefined) await getMessageProperties(cid, msg.id);
                pendingReadDateLabel = await fetchReadDateLabel(msg);
                pendingReactionRow = await buildReactionRow(msg);
                return buildMessageContextMenu(msg);
            },
            get reactionRow() { return pendingReactionRow; },
        };
    }

    /** 针对指定消息在给定坐标处直接打开右键菜单 */
    async function openMessageContextMenu(msg: message, x: number, y: number) {
        if (selectionMode.value) return;
        currentMenuMsg = msg;
        const cid = msg.chat_id || chatId.value;
        if (cid !== undefined) await getMessageProperties(cid, msg.id);
        const [readLabel, reactionRow] = await Promise.all([
            fetchReadDateLabel(msg),
            buildReactionRow(msg),
        ]);
        pendingReadDateLabel = readLabel;
        if (currentMenuMsg !== msg) return;
        openContextMenu(x, y, buildMessageContextMenu(msg), null, null, reactionRow);
    }

    /** 相册中某块媒体被右键：以该条消息 + 坐标打开菜单 */
    function onAlbumMessageContextMenu(msg: message, x: number, y: number) {
        if (selectionMode.value) return;
        void openMessageContextMenu(msg, x, y);
    }

    /** 构建消息右键菜单项（开发环境附带“复制消息原始 JSON”） */
    function buildMessageContextMenu(msg: message): ContextMenuItem[] {
        const items: ContextMenuItem[] = [];
        const isService = isServiceMessage(msg);
        // 评论线程中的消息归属讨论组，能力查询用消息自身 chat_id
        const cid = msg.chat_id || chatId.value;

        // —— 阅读状态（信息项，不可点击）——
        if (pendingReadDateLabel) {
            items.push({ key: 'read-status', label: pendingReadDateLabel, disabled: true });
            items.push({ key: 'divider-read', label: '', divider: true });
        }

        // —— 回复 ——
        if (!isService && canReplyMessage(msg, cid)) {
            items.push({
                key: 'reply',
                label: t('lng_context_reply_msg'),
                icon: (ReplyIcon),
                onClick: () => deps.startReply(msg),
            });
        }

        // —— 引用回复（仅当用户已拖动选中了该消息内容的一段文本时出现）——
        const quotedText = getSelectedQuoteForMessage(msg);
        if (!isService && quotedText && canReplyMessage(msg, cid)) {
            items.push({
                key: 'quote-reply',
                label: t('lng_context_quote_and_reply'),
                icon: QuoteIcon,
                onClick: () => deps.startQuoteReply(msg, quotedText),
            });
        }

        // —— 编辑 ——
        if (!isService && !isInSavedMessages.value && canEditMessage(msg, cid)) {
            items.push({
                key: 'edit',
                label: t('lng_theme_edit'),
                icon: PencilIcon,
                onClick: () => void deps.startEdit(msg),
            });
        }

        // —— 多选 ——
        if (!isService) {
            items.push({
                key: 'multi-select',
                label: t('lng_context_select_msg'),
                icon: CheckSquareIcon,
                onClick: () => deps.enterSelectionMode(msg),
            });
        }

        // —— 复制文本 / 媒体描述 ——
        if (canCopyMessage(msg, cid)) {
            items.push({
                key: 'copy-text',
                label: t('lng_context_copy_text'),
                icon: CopyPlusIcon,
                onClick: () => copyMessageText(msg),
            });
        }

        // —— 转发 ——
        if (canForwardMessage(msg, cid)) {
            items.push({
                key: 'forward',
                label: t('lng_mediaview_forward'),
                icon: ShareIcon,
                onClick: () => deps.startForward(msg),
            });
        }

        // —— 保存到收藏 ——
        if (!isService && canSaveMessage(msg, cid)) {
            items.push({
                key: 'save',
                label: t('chat.saveToSaved'),
                icon: BookmarkIcon,
                onClick: () => handleSaveMessage(msg),
            });
        }

        // —— 媒体文件：打开目录 / 另存为 ——
        const mediaFile = getMessageFile(msg);
        if (mediaFile && isFileReady(mediaFile)) {
            items.push({ key: 'divider-file', label: '', divider: true });
            items.push({
                key: 'reveal-in-dir',
                label: t('lng_context_show_in_folder'),
                icon: FolderOpenIcon,
                onClick: () => revealFileInDir(mediaFile.local.path),
            });
            items.push({
                key: 'save-as',
                label: t('lng_context_save_image'),
                icon: DownloadIcon,
                onClick: () => saveFileAs(mediaFile, getMessageFileName(msg, mediaFile)),
            });
        }

        // —— 翻译 ——
        const msgFormattedText = getMessageFormattedText(msg);
        const msgHasTranslatable = !isService && msgFormattedText && msgFormattedText.text.trim().length > 0;
        if (msgHasTranslatable && settings.translate.showTranslateButton) {
            const existing = getInlineTranslation(cid ?? 0, msg.id);
            if (existing) {
                items.push({
                    key: 'translate-original',
                    label: t('lng_translate_show_original'),
                    icon: LanguagesIcon,
                    onClick: () => removeTranslateFor(msg),
                });
            } else {
                items.push({
                    key: 'translate',
                    label: t('lng_context_translate'),
                    icon: LanguagesIcon,
                    onClick: () => openTranslateFor(msg),
                });
            }
        }

        // —— 复制链接 ——
        items.push({
            key: 'copy-link',
            label: t('lng_context_copy_link'),
            icon: LinkIcon,
            disabled: !canGetMessageLink(msg, cid),
            onClick: () => copyMessageLink(cid!, msg),
        });

        // —— 查看回应者 ——
        if (!isService && canGetViewers(msg, cid)) {
            items.push({
                key: 'viewers',
                label: t('chat.viewReactors'),
                icon: EyeIcon,
                onClick: () => handleGetViewers(msg),
            });
        }

        // —— 查看真实作者（频道代发消息） ——
        if (!isService && canGetAuthor(msg, cid)) {
            items.push({
                key: 'author',
                label: t('chat.viewRealAuthor'),
                icon: UserCheckIcon,
                onClick: () => handleGetAuthor(msg),
            });
        }

        // —— 查看消息线程（仅当有回复时才显示） ——
        if (!isService && canGetMessageThread(msg, cid) && (msg.interaction_info?.reply_info?.reply_count ?? 0) > 0) {
            items.push({
                key: 'thread',
                label: t('lng_replies_view_thread'),
                icon: MessageSquareIcon,
                onClick: () => openCommentsThread(msg),
            });
        }

        // —— 语音转文字 / 识别文本翻译 ——
        const transcriptText = transcriptTextOf(msg);
        if (!isService && transcriptText) {
            if (settings.translate.showTranslateButton) {
                const transcriptTranslation = getTranscriptTranslation(cid ?? 0, msg.id);
                if (transcriptTranslation) {
                    items.push({
                        key: 'translate-transcript-original',
                        label: t('lng_translate_show_original'),
                        icon: LanguagesIcon,
                        onClick: () => clearTranscriptTranslation(cid ?? 0, msg.id),
                    });
                } else {
                    items.push({
                        key: 'translate-transcript',
                        label: t('lng_context_translate'),
                        icon: LanguagesIcon,
                        onClick: () => openTranslateForTranscript(msg, transcriptText),
                    });
                }
            }
        } else if (!isService && canRecognizeSpeech(msg, cid)) {
            items.push({
                key: 'recognize-speech',
                label: t('lng_feature_transcribe'),
                icon: AudioLinesIcon,
                onClick: () => handleRecognizeSpeech(msg),
            });
        }

        // —— 举报 ——
        if (!isService && canReportMessage(msg, cid)) {
            items.push({
                key: 'report',
                label: t('lng_context_report_msg'),
                icon: FlagIcon,
                danger: true,
                onClick: () => handleReportMessage(msg),
            });
        }

        // —— 投票：撤回投票 / 停止投票 ——
        if (!isService && cid !== undefined) {
            const canRetract = canRetractPollVote(msg);
            const canStop = canStopPoll(msg, cid);
            if (canRetract || canStop) {
                items.push({ key: 'divider-poll', label: '', divider: true });
                if (canRetract) {
                    items.push({
                        key: 'poll-retract',
                        label: t('lng_polls_retract'),
                        icon: Undo2Icon,
                        onClick: () => retractPollVote(cid, msg),
                    });
                }
                if (canStop) {
                    items.push({
                        key: 'poll-stop',
                        label: t('lng_polls_stop'),
                        icon: CircleStopIcon,
                        danger: true,
                        onClick: () => openStopPollConfirm(cid, msg),
                    });
                }
            }
        }

        // —— 置顶 / 删除 ——
        const canPin = !isService && canPinMessage(msg, cid);
        const canDelete = !isService && cid !== undefined && canDeleteMessage(msg, cid);

        if (canPin || canDelete) {
            items.push({ key: 'divider-1', label: '', divider: true });

            if (canPin) {
                if (msg.is_pinned) {
                    items.push({
                        key: 'pin',
                        label: t('lng_context_unpin_from_top'),
                        icon: PinIcon,
                        onClick: async () => {
                            if (await toggleMessagePinned(cid!, msg)) {
                                deps.onMessagePinnedStateChanged(msg.id, !msg.is_pinned);
                            }
                        },
                    });
                } else {
                    items.push({
                        key: 'pin',
                        label: t('lng_context_pin_to_top'),
                        icon: PinIcon,
                        onClick: async () => { await openPinConfirm(msg); },
                    });
                }
            }

            if (canDelete) {
                items.push({
                    key: 'delete',
                    label: t('lng_selected_delete'),
                    icon: TrashIcon,
                    danger: true,
                    onClick: async () => { await openDeleteConfirm(msg); },
                });
            }
        }

        // 复制消息原始 JSON（调试用）
        if (showCopyJsonInMenus.value) {
            items.push({ key: 'divider-json', label: '', divider: true });
            items.push({
                key: 'copy-json',
                label: t('chat.copyJson'),
                icon: ClipboardCopyIcon,
                onClick: () => copyMessageJson(msg),
            });
        }

        return items;
    }

    return {
        makeMsgMenu,
        openMessageContextMenu,
        onAlbumMessageContextMenu,
        openCommentsThread,
        openDeletePopup,
        isShowingTranslation,
        senderUserIdOf,
    };
}
