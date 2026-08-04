import type { chat, chatPhotoInfo, message, messageForwardInfo, profilePhoto, user } from 'tdlib-types';
import { isSavedMessagesChat } from '../../../../utils/savedMessages';
import { isDeletedSender } from '../../../../utils/senderInfo';

/**
 * 发送者 / 转发来源的显示信息计算（纯函数，无任何响应式依赖）。
 *
 * 将 `ChatDetail/index.vue` 中与"发送者名称 / 头像 / accent 配色 / 转发来源"相关的
 * 展示计算独立出来。所有依赖（用户与聊天缓存、当前聊天、我的用户 id、主题色函数）
 * 均以参数注入，保证模块纯函数、可独立测试。
 */

/** 用户 / 聊天缓存映射 */
export interface SenderCache {
    users: Record<number, user>;
    chats: Record<number, chat>;
}

/** 发送者名称计算所需上下文 */
export interface SenderNameContext extends SenderCache {
    /** 当前打开的聊天 */
    chat: chat | undefined;
    /** 当前登录用户的 id */
    myId: number;
}

/**
 * 计算转发信息中的来源显示名。
 *
 * @param forwardInfo - TDLib 转发信息
 * @param caches - 用户 / 聊天缓存
 * @returns 来源显示名
 */
export function getForwardName(
    forwardInfo: messageForwardInfo,
    caches: SenderCache,
): string {
    const origin = forwardInfo.origin;
    switch (origin._) {
        case 'messageOriginUser': {
            const sourceUser = caches.users[origin.sender_user_id];
            return sourceUser
                ? `${sourceUser.first_name} ${sourceUser.last_name}`.trim()
                : '用户';
        }
        case 'messageOriginHiddenUser':
            return origin.sender_name || '隐藏用户';
        case 'messageOriginChat':
            return caches.chats[origin.sender_chat_id]?.title || origin.author_signature || '聊天';
        case 'messageOriginChannel':
            return caches.chats[origin.chat_id]?.title || origin.author_signature || '频道';
    }
}

/**
 * 获取转发来源携带的原始作者签名（频道帖子/匿名群管消息）。
 */
export function getForwardAuthorSignature(
    forwardInfo: messageForwardInfo,
): string | undefined {
    const origin = forwardInfo.origin;
    if (origin._ === 'messageOriginChannel' || origin._ === 'messageOriginChat') {
        return origin.author_signature?.trim() || undefined;
    }
    return undefined;
}

/**
 * 计算转发信息中的来源头像。
 *
 * @param forwardInfo - TDLib 转发信息
 * @param caches - 用户 / 聊天缓存
 * @returns 来源头像；隐藏来源时为 `undefined`
 */
export function getForwardPhoto(
    forwardInfo: messageForwardInfo,
    caches: SenderCache,
): chatPhotoInfo | profilePhoto | undefined {
    const origin = forwardInfo.origin;
    switch (origin._) {
        case 'messageOriginUser':
            return caches.users[origin.sender_user_id]?.profile_photo;
        case 'messageOriginChat':
            return caches.chats[origin.sender_chat_id]?.photo;
        case 'messageOriginChannel':
            return caches.chats[origin.chat_id]?.photo;
        case 'messageOriginHiddenUser':
            return undefined;
    }
}

/**
 * 计算发送者的显示名称（用户取 姓+名，频道取标题）。
 *
 * @param msg - 消息对象
 * @param caches - 用户 / 聊天缓存
 * @returns 发送者显示名
 */
export function getSenderName(
    msg: message,
    caches: SenderCache,
): string {
    if (msg.sender_id._ === 'messageSenderUser') {
        const u = caches.users[msg.sender_id.user_id];
        if (!u) return '未知用户';
        if (u.type?._ === 'userTypeDeleted') return '已注销账户';
        return `${u.first_name} ${u.last_name}`.trim() || '未知用户';
    } else if (msg.sender_id._ === 'messageSenderChat') {
        const c = caches.chats[msg.sender_id.chat_id];
        return c ? c.title : '未知频道';
    }
    return '未知';
}

/**
 * 计算发送者的头像。
 *
 * @param msg - 消息对象
 * @param caches - 用户 / 聊天缓存
 * @returns 发送者头像；无法获取时为 `undefined`
 */
export function getSenderPhoto(
    msg: message,
    caches: SenderCache,
): chatPhotoInfo | profilePhoto | undefined {
    if (msg.sender_id._ === 'messageSenderUser') {
        return caches.users[msg.sender_id.user_id]?.profile_photo;
    } else if (msg.sender_id._ === 'messageSenderChat') {
        return caches.chats[msg.sender_id.chat_id]?.photo;
    }
    return undefined;
}

/**
 * 判断消息是否为"收藏中的转发消息"（当前聊天是收藏夹且有转发信息）。
 *
 * @param msg - 消息对象
 * @param ctx - 发送者名称上下文（含当前聊天与我的 id）
 * @returns 是收藏中的转发消息返回 `true`，否则返回 `false`
 */
export function isSavedForwardedMessage(
    msg: message,
    ctx: SenderNameContext,
): boolean {
    return !!msg.forward_info && !!ctx.chat && isSavedMessagesChat(ctx.chat, ctx.myId);
}

/**
 * 计算转发来源的头像渐变 profile_accent_color_id（用于无头像时的头像背景）。
 *
 * @param forwardInfo - TDLib 转发信息
 * @param caches - 用户 / 聊天缓存
 * @returns profile accent 色 id；无有效值时为 `undefined`
 */
export function getForwardProfileAccentId(
    forwardInfo: messageForwardInfo,
    caches: SenderCache,
): number | undefined {
    const origin = forwardInfo.origin;
    let id: number | undefined;
    switch (origin._) {
        case 'messageOriginUser':
            id = caches.users[origin.sender_user_id]?.profile_accent_color_id;
            break;
        case 'messageOriginChat':
            id = caches.chats[origin.sender_chat_id]?.profile_accent_color_id;
            break;
        case 'messageOriginChannel':
            id = caches.chats[origin.chat_id]?.profile_accent_color_id;
            break;
        case 'messageOriginHiddenUser':
            id = undefined;
            break;
    }
    return id !== undefined && id !== -1 ? id : undefined;
}

/** 上方各函数所需的外部依赖集合 */
export type SenderDisplayContext = SenderNameContext;

/** 发送者显示名计算的完整依赖（含收藏转发判断与来源名/头像） */
export interface SenderDisplayDeps extends SenderDisplayContext {
    /** 发送者名称主题色 id（接入 `getSenderAccentColorId`） */
    getSenderAccentId: (msg: message) => number | undefined;
    /** 发送者头像渐变主题色 id（接入 `getSenderProfileAccentColorId`） */
    getSenderProfileAccentId: (msg: message) => number | undefined;
    /** 计算 accent 文字色（接入 `accentTextColor`） */
    accentTextColor: (id: number) => string;
    /** 是否显示发送者名称（接入 showSenderName computed） */
    showSenderName: boolean;
    /** 判断消息是否为"自己发送" */
    isSelf: (msg: message) => boolean;
}

/**
 * 计算消息的展示发送者名称：优先级 author_signature > 收藏转发来源名 > 普通发送者名。
 *
 * @param msg - 消息对象
 * @param deps - 外部依赖
 * @returns 展示发送者名称
 */
export function getDisplaySenderName(
    msg: message,
    deps: SenderDisplayDeps,
): string {
    const signature = msg.author_signature?.trim();
    if (signature) return signature;
    if (isSavedForwardedMessage(msg, deps) && msg.forward_info) {
        return getForwardName(msg.forward_info, deps);
    }
    // 自己发送的消息显示为「你」（内联 bot 消息的名称行也用「你」）
    if (deps.isSelf(msg)) return '你';
    return getSenderName(msg, deps);
}

/**
 * 判断是否显示发送者名称：有 author_signature 时显示；否则非自己消息且开启了发送者名称才显示。
 * 自己通过内联机器人发送的消息也显示名称行（用于在名称旁展示 `via @bot`）。
 *
 * @param msg - 消息对象
 * @param deps - 外部依赖
 * @returns 需要显示发送者名称返回 `true`，否则返回 `false`
 */
export function showSenderDisplayName(
    msg: message,
    deps: SenderDisplayDeps,
): boolean {
    if (!deps.showSenderName) return false;
    if (msg.author_signature?.trim()) return true;
    if (deps.isSelf(msg)) return !!msg.via_bot_user_id;
    return true;
}

/**
 * 计算消息的展示头像：收藏中的转发消息用原始来源头像，否则用发送者头像。
 *
 * @param msg - 消息对象
 * @param deps - 外部依赖
 * @returns 展示头像；无法获取时为 `undefined`
 */
export function getDisplaySenderPhoto(
    msg: message,
    deps: SenderDisplayDeps,
): chatPhotoInfo | profilePhoto | undefined {
    return isSavedForwardedMessage(msg, deps) && msg.forward_info
        ? getForwardPhoto(msg.forward_info, deps)
        : getSenderPhoto(msg, deps);
}

/**
 * 计算消息的展示头像背景 profile accent id：
 * 收藏中的转发消息用来源的 profile accent，否则用发送者的。
 *
 * @param msg - 消息对象
 * @param deps - 外部依赖
 * @returns profile accent 色 id；无有效值时为 `undefined`
 */
export function getDisplaySenderProfileAccentId(
    msg: message,
    deps: SenderDisplayDeps,
): number | undefined {
    if (isSavedForwardedMessage(msg, deps) && msg.forward_info) {
        return getForwardProfileAccentId(msg.forward_info, deps);
    }
    return deps.getSenderProfileAccentId(msg);
}

/**
 * 计算发送者名称内联样式颜色；无 accent 时回退蓝色。
 *
 * @param msg - 消息对象
 * @param deps - 外部依赖
 * @returns `{ color }` 样式对象
 */
export function senderNameColor(
    msg: message,
    deps: SenderDisplayDeps,
): Record<string, string> {
    const id = deps.getSenderAccentId(msg);
    if (id === undefined) return { color: '#3b82f6' };
    return { color: deps.accentTextColor(id) };
}

/** 转发颜色判断的输入：单条消息或相册条目 */
export type ForwardColorInput = { msg: message } | { messages: message[] };

/**
 * 计算转发来源名颜色：自己消息保持浅色类（不设内联色），他人用发送者 accent 色。
 *
 * @param item - 单条消息或相册条目
 * @param isAlbum - 是否为相册
 * @param isSelf - 判断某条消息是否为自己发送（含相册处理）
 * @param deps - 外部依赖
 * @returns 内联颜色样式；自己消息时为 `undefined`
 */
export function forwardColor(
    item: ForwardColorInput,
    isAlbum: boolean,
    isSelf: (msg: message) => boolean,
    deps: SenderDisplayDeps,
): Record<string, string> | undefined {
    const msg = isAlbum
        ? (item as { messages: message[] }).messages[0]
        : (item as { msg: message }).msg;
    const self = isAlbum ? isSelf((item as { messages: message[] }).messages[0]) : isSelf(msg);
    if (self) return undefined;
    return senderNameColor(msg, deps);
}

/**
 * 判断展示发送者是否为已删除账户（用于头像显示删除图标）。
 *
 * @param msg - 消息对象
 * @returns 已删除返回 `true`，否则返回 `false`
 */
export function getDisplaySenderDeleted(msg: message): boolean {
    return isDeletedSender(msg.sender_id);
}

/**
 * 计算消息通过内联机器人发送时的 bot 用户名（`via @username`）。
 *
 * @param msg - 消息对象
 * @param caches - 用户 / 聊天缓存
 * @param maxLength - 用户名最大显示长度（超过则省略为 `...`），默认 20
 * @returns 形如 `@botname` 的字符串；无内联 bot 或无用户名时返回空串
 */
export function getViaBotText(
    msg: message,
    caches: SenderCache,
    maxLength = 20,
): string {
    if (!msg.via_bot_user_id) return '';
    const u = caches.users[msg.via_bot_user_id];
    const username = u?.usernames?.active_usernames?.[0];
    if (!username) return '';
    // 消息不够长时（无法容纳完整用户名）可省略 @ 后的内容为 ...
    const truncated =
        username.length > maxLength ? `${username.slice(0, maxLength)}…` : username;
    return `via @${truncated}`;
}
