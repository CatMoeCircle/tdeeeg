/**
 * 频道私聊（Direct Messages）话题数据层。
 *
 * TDLib 将频道私信会话建模为独立于 forumTopic 的 directMessagesChatTopic：
 * - loadDirectMessagesChatTopics：分页加载，话题经 updateDirectMessagesChatTopic 抵达
 * - getDirectMessagesChatTopic / getDirectMessagesChatTopicHistory：单条查询
 * - 消息 topic_id 为 messageTopicDirectMessages（direct_messages_chat_topic_id）
 *
 * 本模块负责：订阅 update → 聚合成响应式列表 → 供 TopicTagBar / ChatDetail 使用。
 */
import type { directMessagesChatTopic, MessageSender, chatPhotoInfo, profilePhoto, chat } from 'tdlib-types';
import { tdlibSend } from './tdlib';
import { onTdlibUpdate } from '../store/tdlibBus';
import {
    ensureSenderLoaded,
    getSenderName,
    getSenderPhoto,
    getReactiveUser,
    isDeletedUser,
    getDeletedAccountLabel,
} from './senderInfo';
import { messageContentTypeLabel, stickerPreviewLabel } from './messagePreview';

export { getSenderPhoto };

/** 单个会话条目（已附带发送者展示名/头像，便于标签栏直接渲染） */
export interface DmTopicEntry {
    id: number;
    senderId: MessageSender | undefined;
    /** 对方展示名（用户 first+last 或聊天标题）；已注销/空账户为「已注销账户」 */
    title: string;
    /** 对方是否按已注销账户展示（类型已注销/未知，或空名账户） */
    isDeleted: boolean;
    /** 对方头像 */
    photo?: chatPhotoInfo | profilePhoto;
    /** 是否已读完 */
    isMarkedAsUnread: boolean;
    unreadCount: number;
    unreadReactionCount: number;
    order: string;
    lastMessageDate: number;
    lastMessageText: string;
    canSendUnpaidMessages: boolean;
    topic: directMessagesChatTopic;
}

interface ChatDmState {
    topics: Map<number, directMessagesChatTopic>;
    loading: boolean;
    /** 是否已全部加载完（loadDirectMessagesChatTopics 返回 404） */
    exhausted: boolean;
    /** load 是否可用（非管理员可能被拒绝） */
    available: boolean;
    listeners: Set<() => void>;
    loadPromise: Promise<void> | null;
}

const states = new Map<number, ChatDmState>();

function getState(chatId: number): ChatDmState {
    let s = states.get(chatId);
    if (!s) {
        s = {
            topics: new Map(),
            loading: false,
            exhausted: false,
            available: true,
            listeners: new Set(),
            loadPromise: null,
        };
        states.set(chatId, s);
    }
    return s;
}

function notify(chatId: number) {
    const s = states.get(chatId);
    if (!s) return;
    for (const fn of s.listeners) {
        try { fn(); } catch (e) { console.error('dm topics listener error:', e); }
    }
}

// 订阅 updateDirectMessagesChatTopic（tdlib-other 通道）
onTdlibUpdate('other', (update) => {
    if (update._ !== 'updateDirectMessagesChatTopic') return;
    const topic = (update as any).topic as directMessagesChatTopic | undefined;
    if (!topic || typeof topic.chat_id !== 'number') return;
    const s = getState(topic.chat_id);
    s.topics.set(topic.id, topic);
    notify(topic.chat_id);
});

/**
 * 加载私信话题（增量）。
 * 首次调用会拉一页；再次调用在未 exhausted 时继续拉。
 * 非管理员（无权限）时 available=false，调用方应回退普通聊天视图。
 */
export async function loadDmTopics(chatId: number, limit = 50): Promise<void> {
    const s = getState(chatId);
    if (s.loadPromise) return s.loadPromise;
    if (s.exhausted || !s.available) return;

    s.loading = true;
    notify(chatId);
    s.loadPromise = (async () => {
        try {
            await tdlibSend({
                _: 'loadDirectMessagesChatTopics',
                chat_id: chatId,
                limit,
            });
            // 未返回 404 → 仍有更多
        } catch (e: any) {
            const msg = String(e?.message ?? e ?? '');
            if (/404|NOT_FOUND|not found/i.test(msg)) {
                s.exhausted = true;
            } else if (/403|FORBIDDEN|Forbidden/i.test(msg)) {
                // 非当前用户管理的私信群：不可用
                s.available = false;
                s.exhausted = true;
            } else {
                console.warn('loadDmTopics failed:', e);
            }
        } finally {
            s.loading = false;
            s.loadPromise = null;
            notify(chatId);
        }
    })();
    return s.loadPromise;
}

/** 订阅某聊天的私信话题列表（响应式）；返回取消订阅函数 */
export function watchDmTopics(chatId: number, cb: () => void): () => void {
    const s = getState(chatId);
    s.listeners.add(cb);
    return () => { s.listeners.delete(cb); };
}

/** 按 order 降序取话题列表（TDLib 约定） */
export function getDmTopicsSorted(chatId: number): directMessagesChatTopic[] {
    const s = states.get(chatId);
    if (!s) return [];
    return [...s.topics.values()].sort((a, b) => {
        // order 是十进制字符串（可能超 2^53），用 BigInt 比较
        try {
            const ao = BigInt(a.order || '0');
            const bo = BigInt(b.order || '0');
            return bo > ao ? 1 : bo < ao ? -1 : 0;
        } catch {
            return Number(b.order || 0) - Number(a.order || 0);
        }
    });
}

export function getDmTopic(chatId: number, topicId: number): directMessagesChatTopic | undefined {
    return states.get(chatId)?.topics.get(topicId);
}

/** 获取单个话题（缓存未命中时走 TDLib） */
export async function ensureDmTopic(chatId: number, topicId: number): Promise<directMessagesChatTopic | undefined> {
    const cached = getDmTopic(chatId, topicId);
    if (cached) return cached;
    try {
        const t = await tdlibSend({
            _: 'getDirectMessagesChatTopic',
            chat_id: chatId,
            topic_id: topicId,
        }) as directMessagesChatTopic;
        const s = getState(chatId);
        s.topics.set(t.id, t);
        notify(chatId);
        return t;
    } catch (e) {
        console.warn('ensureDmTopic failed:', e);
        return undefined;
    }
}

const nameCache = new Map<number, string>();

/**
 * 发送者是否按「已注销账户」展示：
 * - userTypeDeleted / userTypeUnknown
 * - 资料未加载或空名账户（无 first/last）
 * - 无 senderId
 */
export function isDeletedDmSender(senderId: MessageSender | undefined): boolean {
    if (!senderId) return true;
    if (senderId._ !== 'messageSenderUser') return false;
    const u = getReactiveUser(senderId.user_id);
    if (!u) return true;
    if (isDeletedUser(u)) return true;
    return !`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
}

/** 解析发送者展示名（用户/频道），带缓存；已注销/空账户统一显示「已注销账户」 */
export async function resolveDmSenderName(senderId: MessageSender | undefined): Promise<string> {
    const deleted = getDeletedAccountLabel();
    if (!senderId) return deleted;
    const key = senderId._ === 'messageSenderUser' ? senderId.user_id : (senderId as any).chat_id;
    const cached = nameCache.get(key);
    if (cached) return cached;
    await ensureSenderLoaded(senderId);

    if (senderId._ === 'messageSenderUser') {
        const u = getReactiveUser(senderId.user_id);
        // 已注销 / 未知 / 空名 / 未加载：统一按已注销账户展示
        if (!u || isDeletedUser(u) || !`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()) {
            nameCache.set(key, deleted);
            return deleted;
        }
    }

    const name = getSenderName(senderId) || deleted;
    nameCache.set(key, name);
    return name;
}

/** 转成标签栏条目（含展示名） */
export async function toDmTopicEntries(chatId: number): Promise<DmTopicEntry[]> {
    const list = getDmTopicsSorted(chatId);
    const entries: DmTopicEntry[] = [];
    for (const t of list) {
        const title = await resolveDmSenderName(t.sender_id);
        entries.push({
            id: t.id,
            senderId: t.sender_id,
            title,
            isDeleted: isDeletedDmSender(t.sender_id),
            photo: getSenderPhoto(t.sender_id),
            isMarkedAsUnread: t.is_marked_as_unread,
            unreadCount: t.unread_count,
            unreadReactionCount: t.unread_reaction_count,
            order: t.order,
            lastMessageDate: t.last_message?.date ?? 0,
            lastMessageText: extractPreviewText(t.last_message),
            canSendUnpaidMessages: t.can_send_unpaid_messages,
            topic: t,
        });
    }
    return entries;
}

function extractPreviewText(msg: directMessagesChatTopic['last_message']): string {
    if (!msg) return '';
    const content = (msg as any).content;
    if (!content || typeof content !== 'object') return '';
    switch (content._) {
        case 'messageText':
            return content.text?.text ?? '';
        case 'messagePhoto':
            return content.caption?.text || messageContentTypeLabel('messagePhoto');
        case 'messageVideo':
            return content.caption?.text || messageContentTypeLabel('messageVideo');
        case 'messageDocument':
            return content.caption?.text || content.document?.file_name || messageContentTypeLabel('messageDocument');
        case 'messageSticker':
            return content.sticker?.emoji || stickerPreviewLabel();
        case 'messageVoiceNote':
            return messageContentTypeLabel('messageVoiceNote');
        case 'messageVideoNote':
            return messageContentTypeLabel('messageVideoNote');
        case 'messageAnimation':
            return content.caption?.text || messageContentTypeLabel('messageAnimation');
        case 'messageAudio':
            return content.caption?.text || messageContentTypeLabel('messageAudio');
        case 'messageContact':
            return messageContentTypeLabel('messageContact');
        case 'messageLocation':
            return messageContentTypeLabel('messageLocation');
        case 'messageVenue':
            return messageContentTypeLabel('messageVenue');
        case 'messagePoll':
            return content.poll?.question?.text || messageContentTypeLabel('messagePoll');
        case 'messageDice':
            return messageContentTypeLabel('messageDice');
        case 'messageChatChangeTitle':
            return messageContentTypeLabel('messageChatChangeTitle');
        default:
            return messageContentTypeLabel(content._ ?? '');
    }
}

/** 判断聊天是否可能是频道私聊群（同步粗判，仅 supergroup） */
export function looksLikeDmGroup(chat: chat | undefined | null): boolean {
    return !!(chat && chat.type?._ === 'chatTypeSupergroup');
}

/**
 * 统一消息 topic_id 构造：论坛用 messageTopicForum，私信用 messageTopicDirectMessages。
 * 供 ChatDetail / attachmentSend / SearchBar 共用，避免散落 if。
 */
export function buildMessageTopicInput(
    isDm: boolean,
    topicId: number | undefined | null,
): { _: 'messageTopicForum'; forum_topic_id: number } | { _: 'messageTopicDirectMessages'; direct_messages_chat_topic_id: number } | undefined {
    if (!topicId) return undefined;
    return isDm
        ? { _: 'messageTopicDirectMessages', direct_messages_chat_topic_id: topicId }
        : { _: 'messageTopicForum', forum_topic_id: topicId };
}

/** 从消息 topic_id 提取数字话题 id（论坛或私信） */
export function extractTopicNumber(topic: { _: string; [k: string]: unknown } | undefined | null): number {
    if (!topic) return 0;
    if (topic._ === 'messageTopicForum') return Number(topic.forum_topic_id) || 0;
    if (topic._ === 'messageTopicDirectMessages') return Number(topic.direct_messages_chat_topic_id) || 0;
    return 0;
}
