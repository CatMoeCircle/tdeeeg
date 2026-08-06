import type {
    chat,
    message,
    messageForwardInfo,
    replyMarkupInlineKeyboard,
    ChatMemberStatus,
    MessageSender,
} from 'tdlib-types';
import { isOutgoingMessageForDisplay } from '../../../../utils/savedMessages';
import { getForwardAuthorSignature } from './senderDisplay';
import type { AlbumDisplayItem } from './messageItems';


// ==================== 消息自身 / 已读判断 ====================

/** `isSelf` 计算所需的外部依赖 */
export interface SelfDeps {
    /** 当前打开的聊天 */
    chat: chat | undefined;
    /** 当前登录用户的 id */
    myId: number;
    /** 当前频道是否开启「显示发送者信息」（开启时自己的消息也靠左、不按发出显示） */
    isChannelWithSenderDisplay: boolean;
}

/**
 * 判断消息是否为「自己发送」（用于气泡靠右 / 颜色区分）。
 * 在开启了发送者显示的频道中，所有消息统一靠左，不区分颜色。
 *
 * @param msg - 消息对象
 * @param deps - 外部依赖
 * @returns 视为自己发送返回 `true`，否则返回 `false`
 */
export function isSelfMessage(msg: message, deps: SelfDeps): boolean {
    if (deps.isChannelWithSenderDisplay) return false;
    return isOutgoingMessageForDisplay(msg, deps.chat, deps.myId);
}

/**
 * 判断消息是否已被对方阅读（只在发出、无发送中状态、且 id 不晚于
 * 聊天已读收件箱消息 id 时才算已读）。
 *
 * @param msg - 消息对象
 * @param chat - 当前聊天（可为空）
 * @returns 已读返回 `true`，否则返回 `false`
 */
export function isMessageRead(msg: message, chat: chat | undefined): boolean {
    return !!msg.is_outgoing
        && !msg.sending_state
        && !!chat
        && msg.id <= chat.last_read_outbox_message_id;
}

/**
 * 判断相册条目是否为「自己发送」相册（依据首条消息的自身判断）。
 *
 * @param item - 相册展示条目
 * @param isSelf - 单条消息的自身判断函数
 * @returns 自己发送的相册返回 `true`，否则返回 `false`
 */
export function isSelfAlbum(item: AlbumDisplayItem, isSelf: (msg: message) => boolean): boolean {
    return isSelf(item.messages[0]);
}

// ==================== 发送者角色标签 ====================

/** 群成员信息缓存项（用于在消息右上角显示角色/标签：创建者/管理员/自定义 tag） */
export interface MemberMeta {
    status?: ChatMemberStatus;
    /** 成员自定义标签（管理员的 custom title，或个人资料标签） */
    tag?: string;
}

/** 发送者角色 / 标签计算所需的外部依赖 */
export interface RoleContext {
    /** 当前打开的聊天 */
    chat: chat | undefined;
    /** 群成员信息缓存（user_id → 成员信息） */
    memberStatus: Record<number, MemberMeta>;
}

/**
 * 根据发送者 id 计算其在当前群聊中的角色标签。
 * 返回 `'creator' | 'admin' | 'member'`；私聊/频道/未知时返回 `undefined`（不显示标签）。
 *
 * @param sender - 发送者（用户 / 频道 / 群组）
 * @param ctx - 聊天 + 成员缓存上下文
 * @returns 角色；无法确定时不返回
 */
export function getSenderRole(
    sender: MessageSender | undefined,
    ctx: RoleContext,
): 'creator' | 'admin' | 'member' | undefined {
    if (!ctx.chat) return undefined;
    const ct = ctx.chat.type;
    if (ct._ === 'chatTypeBasicGroup') {
        // 基础群组：正常显示
    } else if (ct._ === 'chatTypeSupergroup') {
        // 超级群组：仅普通群组显示成员角色标签，频道不显示
        if (ct.is_channel) return undefined;
    } else {
        return undefined;
    }
    if (!sender || sender._ !== 'messageSenderUser') return undefined;
    const member = ctx.memberStatus[sender.user_id];
    if (!member?.status) return undefined;
    switch (member.status._) {
        case 'chatMemberStatusCreator':
            // 匿名创建者不显示个人标签
            return member.status.is_anonymous ? undefined : 'creator';
        case 'chatMemberStatusAdministrator':
            return 'admin';
        default:
            return 'member';
    }
}

/**
 * 消息右上角标签文本：
 * - 若有自定义标签（管理员 custom title 或个人信息标签），优先显示之（含群主/管理员）
 * - 无自定义标签时：
 *   创建者 → 「群主」
 *   管理员 → 「管理员」
 *   普通成员 → 空串（不显示）
 * 颜色（getSenderRoleClass）始终按角色保持不变：群主=紫、管理员=绿、成员=灰。
 *
 * @param sender - 发送者
 * @param ctx - 聊天 + 成员缓存上下文
 * @returns 标签文本
 */
export function getSenderRoleText(sender: MessageSender | undefined, ctx: RoleContext): string {
    if (!sender || sender._ !== 'messageSenderUser') return '';
    const member = ctx.memberStatus[sender.user_id];
    // 自定义标签优先（群主和管理员也可能有 custom title）
    if (member?.tag) return member.tag;
    const role = getSenderRole(sender, ctx);
    if (role === 'creator') return '群主';
    if (role === 'admin') return '管理员';
    return '';
}

/**
 * 消息右上角标签样式 class（胶囊 + 文字色）：
 * - 创建者 → 浅紫色胶囊 + 浅色文字
 * - 管理员 → 浅绿色胶囊 + 绿色文字
 * - 普通成员 → 无胶囊，纯灰色文字
 *
 * @param sender - 发送者
 * @param ctx - 聊天 + 成员缓存上下文
 * @returns Tailwind 样式类
 */
export function getSenderRoleClass(sender: MessageSender | undefined, ctx: RoleContext): string {
    const role = getSenderRole(sender, ctx);
    if (role === 'creator') {
        return 'bg-purple-200/70 text-purple-500 dark:bg-purple-500/20 dark:text-purple-300';
    }
    if (role === 'admin') {
        return 'bg-green-200/70 text-green-600 dark:bg-green-500/20 dark:text-green-300';
    }
    if (role === 'member') {
        return 'text-gray-500 dark:text-gray-400';
    }
    return '';
}

// ==================== 群组关联频道消息 ====================

/**
 * 判断消息是否为「群组关联频道」自动转到群组的消息。
 * 这类消息的 sender 是频道（messageSenderChat），且 forward_info 指向同一个频道
 * （即频道把帖子同步推送到其讨论群组），不作为普通转发显示，也不显示转发标记。
 *
 * @param msg - 消息对象
 * @returns 是群组关联频道消息返回 `true`，否则返回 `false`
 */
export function isLinkedChannelMessage(msg: message): boolean {
    if (msg.sender_id?._ !== 'messageSenderChat') return false;
    if (!msg.forward_info) return false;
    const origin = msg.forward_info.origin;
    return origin._ === 'messageOriginChannel' && origin.chat_id === msg.sender_id.chat_id;
}

/**
 * 消息右上角标签文本（整条消息维度）：
 * - 群组关联频道的消息 → 「频道」
 * - 否则回退到按发送者角色判断（创建者/管理员/成员 tag）
 *
 * @param msg - 消息对象
 * @param ctx - 聊天 + 成员缓存上下文
 * @returns 标签文本
 */
export function getMessageLabel(msg: message, ctx: RoleContext): string {
    if (isLinkedChannelMessage(msg)) return '频道';
    return getSenderRoleText(msg.sender_id, ctx);
}

/**
 * 消息右上角标签样式 class（整条消息维度）。
 *
 * @param msg - 消息对象
 * @param ctx - 聊天 + 成员缓存上下文
 * @returns Tailwind 样式类
 */
export function getMessageLabelClass(msg: message, ctx: RoleContext): string {
    if (isLinkedChannelMessage(msg)) {
        return 'bg-gray-200/70 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300';
    }
    return getSenderRoleClass(msg.sender_id, ctx);
}

/**
 * 取应传给内容/转发组件的 forwardInfo：
 * 群组关联频道的消息不显示转发标记，返回 undefined；否则返回原始 forward_info。
 *
 * @param msg - 消息对象
 * @returns 展示用的转发信息
 */
export function getDisplayForwardInfo(msg: message): messageForwardInfo | undefined {
    return isLinkedChannelMessage(msg) ? undefined : msg.forward_info;
}

// ==================== 消息数据访问器 ====================

/**
 * 消息发送者的 user_id（仅当发送者为用户时返回，频道/群组等返回 undefined）。
 *
 * @param msg - 消息对象
 * @returns 发送者的用户 id；发送者不是用户时为 `undefined`
 */
export function senderUserId(msg: message): number | undefined {
    return msg.sender_id?._ === 'messageSenderUser' ? msg.sender_id.user_id : undefined;
}

/**
 * 消息的内联键盘（仅当 reply_markup 为内联键盘类型时返回）。
 *
 * @param msg - 消息对象
 * @returns 内联键盘；不存在时为 `undefined`
 */
export function getInlineKeyboard(msg: message): replyMarkupInlineKeyboard | undefined {
    return msg.reply_markup?._ === 'replyMarkupInlineKeyboard' ? msg.reply_markup : undefined;
}

/**
 * 消息展示用作者签名：消息自带 author_signature 优先，否则回退到转发来源的原始作者签名。
 *
 * @param msg - 消息对象
 * @returns 作者签名；无有效值时返回 `undefined`
 */
export function getDisplayAuthorSignature(msg: message): string | undefined {
    const signature = msg.author_signature?.trim();
    if (signature) return signature;
    return msg.forward_info ? getForwardAuthorSignature(msg.forward_info) : undefined;
}
