import { tdlibSend } from "../../utils/tdlib";
import { getMessagePlainText } from "../../utils/messageText";
import { MessagePlugin } from "tdesign-vue-next";
import { TrashIcon } from "lucide-vue-next";
import type { message, messageProperties, MessageSender, formattedText$Input, textEntity$Input } from "tdlib-types";
import type { ContextMenuItem } from "./types";
import type { DeleteMessageResult } from "../../store/deleteMessage";

/* =========================================================================
 * 基于 getMessageProperties 的精确权限能力模块
 *
 * TDLib 提供离线方法 getMessageProperties，返回 messageProperties —— 描述
 * 当前用户此刻可对某条消息执行的所有操作。这是判断菜单项可用性的权威来源，
 * 比本地猜测（isServiceMessage、is_outgoing 等）更精确。
 * ========================================================================= */

/** 属性缓存 key：chatId:msgId */
function propsKey(chatId: number, msgId: number): string {
    return `${chatId}:${msgId}`;
}

/** 已获取到的 messageProperties 缓存（Map 非响应式，仅作查询缓存） */
const propsCache = new Map<string, messageProperties>();
/** 正在加载中的请求，去重避免并发重复调用 */
const pendingProps = new Map<string, Promise<messageProperties | null>>();

/**
 * 调用 getMessageProperties 获取某条消息的属性。
 * 离线方法，走本地缓存立即返回；失败返回 null。
 */
export async function getMessageProperties(
    chatId: number,
    msgId: number,
): Promise<messageProperties | null> {
    const key = propsKey(chatId, msgId);
    if (propsCache.has(key)) return propsCache.get(key)!;
    if (pendingProps.has(key)) return pendingProps.get(key)!;

    const p = (async () => {
        try {
            const res = await tdlibSend({
                _: 'getMessageProperties',
                chat_id: chatId,
                message_id: msgId,
            }) as messageProperties;
            if (res && res._ === 'messageProperties') {
                propsCache.set(key, res);
                return res;
            }
            return null;
        } catch (e) {
            console.warn('getMessageProperties failed:', e);
            return null;
        } finally {
            pendingProps.delete(key);
        }
    })();

    pendingProps.set(key, p);
    return p;
}

/** 同步读取某条消息的已缓存属性；未加载返回 undefined */
export function getCachedMessageProperties(
    chatId: number,
    msgId: number,
): messageProperties | undefined {
    return propsCache.get(propsKey(chatId, msgId));
}

/** 清空属性缓存（切换账号/清空线程时调用） */
export function clearMessagePropertiesCache() {
    propsCache.clear();
}

/**
 * 从消息读取属性（优先缓存，其次 msg 内联字段，最后空对象）。
 * 未命中缓存时以乐观值兜底，保证菜单可先渲染。
 */
function propsOf(chatId: number, msg: message): messageProperties {
    const cached = propsCache.get(propsKey(chatId, msg.id));
    if (cached) return cached;
    const inline = msg as any;
    // 若 message 对象已内联携带（部分 TDLib 版本会在 messageProperties 之外附带），
    // 也可复用；否则返回空属性让上层兜底判断。
    return (inline.properties as messageProperties) ?? ({} as messageProperties);
}

/** 消息是否为系统/服务消息（无操作菜单） */
export function isServiceMessage(msg: message): boolean {
    const c = msg.content;
    if (!c) return true;
    switch (c._) {
        case "messageBasicGroupChatCreate":
        case "messageChatAddMembers":
        case "messageChatChangePhoto":
        case "messageChatChangeTitle":
        case "messageChatDeleteMember":
        case "messageChatDeletePhoto":
        case "messageChatJoinByLink":
        case "messageChatJoinByRequest":
        case "messageChatUpgradeFrom":
        case "messageChatUpgradeTo":
        case "messageCustomServiceAction":
        case "messageGameScore":
        case "messageGiftedPremium":
        case "messageInviteVideoChatParticipants":
        case "messagePassportDataReceived":
        case "messagePaymentSuccessful":
        case "messagePaymentSuccessfulBot":
        case "messagePinMessage":
        case "messageProximityAlertTriggered":
        case "messageScreenshotTaken":
        case "messageVideoChatEnded":
        case "messageVideoChatScheduled":
        case "messageVideoChatStarted":
        case "messageWebAppDataReceived":
        case "messageSuggestProfilePhoto":
        case "messageForumTopicCreated":
        case "messageForumTopicEdited":
        case "messageForumTopicIsClosedToggled":
            return true;
        default:
            return false;
    }
}

/** 消息是否能被当前用户删除（自己可删或全部可删） */
export function canDeleteMessage(msg: message, chatId?: number): boolean {
    let p: messageProperties | undefined;
    if (chatId !== undefined) p = propsOf(chatId, msg);
    const cp = p ?? (msg as any);
    return cp.can_be_deleted_only_for_self === true ||
        cp.can_be_deleted_for_all_users === true;
}

/**
 * 构造删除菜单子项（“为所有人删除” / “为我删除”）。
 * 依据 TDLib messageProperties 动态生成，无权限的选项不会被加入。
 */
export function buildDeleteMenuItems(
    chatId: number,
    msg: message,
    onDone?: () => void,
): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    const p = propsOf(chatId, msg);
    const canAll = p.can_be_deleted_for_all_users === true;
    const canSelf = p.can_be_deleted_only_for_self === true;

    /** 为所有人删除需要二次确认；为我删除直接执行 */
    const ask = (revoke: boolean): boolean => {
        if (!revoke) return true;
        return window.confirm(
            `确定要删除这条消息吗？\n\n删除后所有成员都将看不到这条消息（此操作无法撤销）。`,
        );
    };

    if (canAll) {
        items.push({
            key: 'delete-for-all',
            label: '为所有人删除',
            icon: TrashIcon,
            danger: true,
            onClick: async () => {
                if (ask(true)) {
                    await deleteMessages(chatId, msg, true);
                    onDone?.();
                }
            },
        });
    }
    if (canSelf) {
        items.push({
            key: 'delete-for-self',
            label: '为我删除',
            icon: TrashIcon,
            danger: true,
            onClick: async () => {
                if (ask(false)) {
                    await deleteMessages(chatId, msg, false);
                    onDone?.();
                }
            },
        });
    }
    return items;
}

/** 消息是否能被置顶或取消置顶（按 messageProperties.can_be_pinned） */
export function canPinMessage(msg: message, chatId?: number): boolean {
    if (isServiceMessage(msg)) return false;
    let p: messageProperties | undefined;
    if (chatId !== undefined) p = propsOf(chatId, msg);
    const cp = p ?? (msg as any);
    if (cp.can_be_pinned !== undefined) return cp.can_be_pinned === true;
    // 属性未加载时乐观返回 true（具体由 pinChatMessage 报错兜底）
    return true;
}

/** 消息是否能被转发（messageProperties.can_be_forwarded） */
export function canForwardMessage(msg: message, chatId?: number): boolean {
    if (isServiceMessage(msg)) return false;
    let p: messageProperties | undefined;
    if (chatId !== undefined) p = propsOf(chatId, msg);
    const cp = p ?? (msg as any);
    if (cp.can_be_forwarded !== undefined) return cp.can_be_forwarded === true;
    return (msg as any).can_be_forwarded !== false;
}

/** 消息是否可复制文本/媒体描述（受 can_be_copied 与内容文本约束） */
export function canCopyMessage(msg: message, chatId?: number): boolean {
    if (isServiceMessage(msg)) return false;
    if (getMessagePlainText(msg).trim().length === 0) return false;
    let p: messageProperties | undefined;
    if (chatId !== undefined) p = propsOf(chatId, msg);
    const cp = p ?? (msg as any);
    if (cp.can_be_copied !== undefined) return cp.can_be_copied === true;
    return true;
}

/** 消息是否可复制链接（messageProperties.can_get_link） */
export function canGetMessageLink(msg: message, chatId?: number): boolean {
    if (isServiceMessage(msg)) return false;
    let p: messageProperties | undefined;
    if (chatId !== undefined) p = propsOf(chatId, msg);
    const cp = p ?? (msg as any);
    if (cp.can_get_link !== undefined) return cp.can_get_link === true;
    return true;
}

/** 消息是否可回复（messageProperties.can_be_replied） */
export function canReplyMessage(msg: message, chatId?: number): boolean {
    if (isServiceMessage(msg)) return false;
    let p: messageProperties | undefined;
    if (chatId !== undefined) p = propsOf(chatId, msg);
    const cp = p ?? (msg as any);
    if (cp.can_be_replied !== undefined) return cp.can_be_replied === true;
    return true;
}

/** 消息是否可编辑（messageProperties.can_be_edited） */
export function canEditMessage(msg: message, chatId?: number): boolean {
    if (isServiceMessage(msg)) return false;
    let p: messageProperties | undefined;
    if (chatId !== undefined) p = propsOf(chatId, msg);
    const cp = p ?? (msg as any);
    if (cp.can_be_edited !== undefined) return cp.can_be_edited === true;
    return (msg as any).can_be_edited !== false;
}

/** 编辑消息文本（editMessageText + inputMessageText） */
export async function editTextMessage(
    chatId: number,
    messageId: number,
    text: string,
    entities?: textEntity$Input[],
): Promise<boolean> {
    try {
        const content: formattedText$Input = { _: 'formattedText', text, entities: entities ?? [] };
        await tdlibSend({
            _: 'editMessageText',
            chat_id: chatId,
            message_id: messageId,
            input_message_content: {
                _: 'inputMessageText',
                text: content,
                clear_draft: true,
            },
        } as any);
        return true;
    } catch (e) {
        console.error('editMessageText failed:', e);
        MessagePlugin.error({ content: '编辑消息失败', placement: 'center' });
        return false;
    }
}

/**
 * 置顶消息。
 * - disableNotification：静默置顶（不通知成员），仅群组有效；
 * - onlyForSelf：仅为自己置顶，仅私聊有效。
 */
export async function pinMessage(
    chatId: number,
    msg: message,
    opts?: { disableNotification?: boolean; onlyForSelf?: boolean },
) {
    try {
        await tdlibSend({
            _: 'pinChatMessage',
            chat_id: chatId,
            message_id: msg.id,
            disable_notification: opts?.disableNotification ?? false,
            only_for_self: opts?.onlyForSelf ?? false,
        } as any);
        MessagePlugin.success('已置顶');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 取消置顶 */
export async function unpinMessage(chatId: number, msg: message) {
    try {
        await tdlibSend({
            _: 'unpinChatMessage',
            chat_id: chatId,
            message_id: msg.id,
        });
        MessagePlugin.success('已取消置顶');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 开关消息置顶 */
export async function toggleMessagePinned(chatId: number, msg: message) {
    if (msg.is_pinned) {
        await unpinMessage(chatId, msg);
    } else {
        await pinMessage(chatId, msg);
    }
}

/** 删除消息 */
export async function deleteMessages(chatId: number, msg: message, revoke: boolean) {
    try {
        await tdlibSend({
            _: 'deleteMessages',
            chat_id: chatId,
            message_ids: [msg.id],
            revoke,
        });
        MessagePlugin.success('已删除');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '删除失败');
    }
}

/**
 * 删除某发送者在当前对话中的所有消息（deleteChatMessagesBySender）。
 * 仅超级群组支持，需 can_delete_messages 管理员权限。
 */
export async function deleteChatMessagesBySender(chatId: number, senderId: MessageSender) {
    try {
        await tdlibSend({
            _: 'deleteChatMessagesBySender',
            chat_id: chatId,
            sender_id: senderId as any,
        });
        MessagePlugin.success('已删除该发送者的所有消息');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '删除该发送者所有消息失败');
    }
}

/**
 * 封禁某发送者（banChatMember）。
 * 需 can_restrict_members 管理员权限；超级群组/频道会同时删除其消息。
 */
export async function banChatSender(chatId: number, senderId: MessageSender) {
    try {
        await tdlibSend({
            _: 'banChatMember',
            chat_id: chatId,
            member_id: senderId as any,
            banned_until_date: 0, // 0 = 永久封禁
            revoke_messages: true,
        });
        MessagePlugin.success('已封禁该发送者');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '封禁失败');
    }
}

/**
 * 按删除弹窗的结果组合执行删除动作：
 *  - deleteMessage        → deleteMessages（删除当前消息，走「为所有人删除」）
 *  - deleteAllFromSender  → deleteChatMessagesBySender（删除该发送者全部消息）
 *  - banSender            → banChatMember（封禁该发送者）
 * 逐项执行，单项失败不影响其余项。
 */
export async function executeDeleteActions(
    chatId: number,
    msg: message,
    senderId: MessageSender | undefined,
    result: DeleteMessageResult,
) {
    // 封禁（优先级最高，通常同时删除消息）
    if (result.banSender && senderId) {
        await banChatSender(chatId, senderId);
    }
    // 删除该发送者的所有消息
    if (result.deleteAllFromSender && senderId) {
        await deleteChatMessagesBySender(chatId, senderId);
    }
    // 删除当前消息
    if (result.deleteMessage) {
        await deleteMessages(chatId, msg, true);
    }
}

/** 复制消息文本 */
export async function copyMessageText(msg: message) {
    const text = getMessagePlainText(msg);
    if (!text.trim()) {
        MessagePlugin.warning('该消息没有可复制的文本');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        MessagePlugin.success('已复制');
    } catch {
        MessagePlugin.error('复制失败');
    }
}

/** 复制消息原始 JSON 到剪贴板（开发调试用） */
export async function copyMessageJson(msg: message) {
    try {
        await navigator.clipboard.writeText(JSON.stringify(msg, null, 2));
        MessagePlugin.success('消息 JSON 已复制');
    } catch {
        MessagePlugin.error('复制失败');
    }
}

/** 复制消息链接 */
export async function copyMessageLink(chatId: number, msg: message) {
    try {
        // getMessageLink 需要传入 media_timestamp 或 0（默认）
        const link = await tdlibSend({
            _: 'getMessageLink',
            chat_id: chatId,
            message_id: msg.id,
            media_timestamp: 0,
            for_album: false,
            in_message_thread: false,
        }) as any;
        const url = link?.link;
        if (!url) {
            MessagePlugin.warning('无法获取该消息的链接');
            return;
        }
        await navigator.clipboard.writeText(url);
        MessagePlugin.success('链接已复制');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '无法获取链接');
    }
}
