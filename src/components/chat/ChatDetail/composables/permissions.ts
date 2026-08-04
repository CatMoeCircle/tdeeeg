import type { basicGroup, chat, ChatMemberStatus, supergroup, user } from 'tdlib-types';

/**
 * 聊天权限与会话类型判断（纯函数，无任何响应式依赖）。
 *
 * 将 `ChatDetail/index.vue` 中与"能否发送 / 是否加入 / 是否频道 / 是否显示发送者"等
 * 判断逻辑独立出来。所有依赖（当前聊天、supergroup / basicGroup 缓存）均以参数注入，
 * 保证模块纯函数、可独立测试。
 */

/** supergroup / basicGroup 缓存 */
export interface GroupCache {
    supergroups: Record<number, supergroup>;
    basicGroups: Record<number, basicGroup>;
}

/**
 * 取当前聊天的成员状态。仅超级群组 / 基础群组有状态，其余返回 `undefined`。
 *
 * @param currentChat - 当前聊天（可为空）
 * @param caches - supergroup / basicGroup 缓存
 * @returns 成员状态；无法确定时为 `undefined`
 */
export function getCurrentMemberStatus(
    currentChat: chat | undefined,
    caches: GroupCache,
): ChatMemberStatus | undefined {
    if (currentChat?.type._ === 'chatTypeSupergroup') {
        return caches.supergroups[currentChat.type.supergroup_id]?.status;
    }
    if (currentChat?.type._ === 'chatTypeBasicGroup') {
        return caches.basicGroups[currentChat.type.basic_group_id]?.status;
    }
    return undefined;
}

/**
 * 判断成员状态是否为"已是成员"（成员 / 管理员 / 创建者 / 受限且 is_member）。
 *
 * @param status - 成员状态
 * @returns 视为已是成员返回 `true`，否则返回 `false`
 */
export function isMemberStatus(status: ChatMemberStatus): boolean {
    if (status._ === 'chatMemberStatusMember' || status._ === 'chatMemberStatusAdministrator') return true;
    if (status._ === 'chatMemberStatusCreator' || status._ === 'chatMemberStatusRestricted') return status.is_member;
    return false;
}

/**
 * 判断当前用户在会话权限角度上是否属于"管理员/创建者"。
 *
 * @param currentChat - 当前聊天
 * @param caches - supergroup / basicGroup 缓存
 * @returns 是管理员或创建者返回 `true`，否则返回 `false`
 */
export function isAdminOrCreator(
    currentChat: chat,
    caches: GroupCache,
): boolean {
    if (currentChat.type._ === 'chatTypeSupergroup') {
        const sg = caches.supergroups[currentChat.type.supergroup_id];
        if (sg) return sg.status._ === 'chatMemberStatusCreator' || sg.status._ === 'chatMemberStatusAdministrator';
    } else if (currentChat.type._ === 'chatTypeBasicGroup') {
        const bg = caches.basicGroups[currentChat.type.basic_group_id];
        if (bg) return bg.status._ === 'chatMemberStatusCreator' || bg.status._ === 'chatMemberStatusAdministrator';
    }
    return false;
}

/**
 * 判断当前用户是否可以向当前聊天发送消息。
 *
 * @param currentChat - 当前聊天（可为空）
 * @param memberStatus - 当前成员状态（可为空）
 * @param caches - supergroup / basicGroup 缓存
 * @returns 可以发送返回 `true`，否则返回 `false`
 */
export function canSend(
    currentChat: chat | undefined,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
): boolean {
    if (!currentChat) return false;
    const c = currentChat;
    if (c.type._ === 'chatTypePrivate') return true;

    if (c.type._ === 'chatTypeSupergroup' || c.type._ === 'chatTypeBasicGroup') {
        if (!memberStatus || !isMemberStatus(memberStatus)) return false;
        if (memberStatus._ === 'chatMemberStatusRestricted') return memberStatus.permissions.can_send_basic_messages;
    }

    if (c.permissions?.can_send_basic_messages) return true;
    // 管理员或创建者
    return isAdminOrCreator(c, caches);
}

/**
 * 判断是否需要在底部显示"加入/申请加入"操作。
 *
 * @param currentChat - 当前聊天（可为空）
 * @param memberStatus - 当前成员状态（可为空）
 * @returns 需要显示加入操作返回 `true`，否则返回 `false`
 */
export function showMembershipAction(
    currentChat: chat | undefined,
    memberStatus: ChatMemberStatus | undefined,
): boolean {
    if (!currentChat || !memberStatus) return false;
    if (currentChat.type._ !== 'chatTypeSupergroup' && currentChat.type._ !== 'chatTypeBasicGroup') return false;
    return !isMemberStatus(memberStatus);
}

/**
 * 判断当前聊天是否可加入（未被封禁）。
 *
 * @param memberStatus - 当前成员状态（可为空）
 * @returns 可加入返回 `true`，否则返回 `false`
 */
export function canJoinCurrentChat(memberStatus: ChatMemberStatus | undefined): boolean {
    return memberStatus?._ !== 'chatMemberStatusBanned';
}

/**
 * 判断当前聊天是否是频道（超级群组且 is_channel）。
 *
 * @param currentChat - 当前聊天（可为空）
 * @returns 是频道返回 `true`，否则返回 `false`
 */
export function isChannel(currentChat: chat | undefined): boolean {
    return currentChat?.type._ === 'chatTypeSupergroup' && currentChat.type.is_channel;
}

/**
 * 判断当前频道是否开启了显示发送者信息（个人资料显示）。
 * 仅对频道有效；此时即使自己发的消息也应和其他消息一样靠左显示。
 *
 * @param currentChat - 当前聊天（可为空）
 * @param caches - supergroup / basicGroup 缓存
 * @returns 开启了发送者显示返回 `true`，否则返回 `false`
 */
export function isChannelWithSenderDisplay(
    currentChat: chat | undefined,
    caches: GroupCache,
): boolean {
    if (!currentChat) return false;
    if (currentChat.type._ !== 'chatTypeSupergroup' || !currentChat.type.is_channel) return false;
    const sg = caches.supergroups[currentChat.type.supergroup_id];
    if (!sg) return false;
    return sg.sign_messages || sg.show_message_sender;
}

/**
 * 判断私聊之外是否需要显示发送者名称。
 *
 * @param currentChat - 当前聊天（可为空）
 * @returns 需要显示发送者名称返回 `true`，否则返回 `false`
 */
export function showSenderName(currentChat: chat | undefined): boolean {
    if (!currentChat) return false;
    return currentChat.type._ !== 'chatTypePrivate';
}

/**
 * 判断是否显示左侧头像列（群组和开启了显示发送者的频道）。
 *
 * @param currentChat - 当前聊天（可为空）
 * @param caches - supergroup / basicGroup 缓存
 * @returns 需要显示头像列返回 `true`，否则返回 `false`
 */
export function showAvatarColumn(
    currentChat: chat | undefined,
    caches: GroupCache,
): boolean {
    if (!currentChat) return false;
    if (currentChat.type._ === 'chatTypePrivate') return false;
    if (currentChat.type._ === 'chatTypeSupergroup' && currentChat.type.is_channel) {
        const sg = caches.supergroups[currentChat.type.supergroup_id];
        if (sg) return !!(sg.sign_messages || sg.show_message_sender);
        return true; // 保守策略
    }
    return true;
}

/**
 * 判断是否需要在只读频道底部显示频道操作栏。
 *
 * @param currentChat - 当前聊天（可为空）
 * @param canSendNow - 当前是否可发送
 * @param caches - supergroup / basicGroup 缓存
 * @returns 需要显示频道操作返回 `true`，否则返回 `false`
 */
export function showChannelActions(
    currentChat: chat | undefined,
    canSendNow: boolean,
    caches: GroupCache,
): boolean {
    if (!currentChat || canSendNow || currentChat.type._ !== 'chatTypeSupergroup') return false;
    if (currentChat.type.is_channel) return true;
    return !!caches.supergroups[currentChat.type.supergroup_id]?.is_broadcast_group;
}

//
// ==================== 附件菜单权限（曲别针） ====================
//
// 规则说明（用户需求）：
// - 投票：超群/基本群直接允许；私聊仅当对方是 Bot 或"自己（Saved Messages）"。
// - 清单比投票多两个限制：不能是密聊（Secret Chat）、不能是频道，且需要 Premium。
// - 其余情况：看 chat.permissions / 受限成员 permissions 中对应能力。
//

/** 支持的聊天权限能力键（受限成员与聊天级权限共用） */
export type ChatCapabilityKey =
    | 'can_send_basic_messages'
    | 'can_send_documents'
    | 'can_send_audios'
    | 'can_send_photos'
    | 'can_send_videos'
    | 'can_send_polls';

/** 私聊 / 密聊默认放开（无权限对象时按允许处理） */
function isPeerChat(currentChat: chat): boolean {
    return currentChat.type._ === 'chatTypePrivate' || currentChat.type._ === 'chatTypeSecret';
}

/**
 * 读取某项聊天能力是否允许发送。
 * 优先用受限成员状态的 permissions，其次用聊天级 chat.permissions；
 * 权限对象缺失时按"未知放开"处理（保持附件菜单可用）。
 */
export function canSendCapability(
    currentChat: chat,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
    cap: ChatCapabilityKey,
): boolean {
    if (isPeerChat(currentChat)) return true;
    // 管理员 / 创建者始终允许
    if (isAdminOrCreator(currentChat, caches)) return true;
    const perms = memberStatus?._ === 'chatMemberStatusRestricted'
        ? memberStatus.permissions
        : currentChat.permissions;
    if (!perms) return true; // 未知时放开
    return perms[cap] !== false;
}

/** 照片/视频：需同时允许 photos 与 videos */
export function canSendPhotoRights(
    currentChat: chat,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
): boolean {
    return canSendCapability(currentChat, memberStatus, caches, 'can_send_photos')
        && canSendCapability(currentChat, memberStatus, caches, 'can_send_videos');
}

/** 文件 */
export function canSendDocumentRights(
    currentChat: chat,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
): boolean {
    return canSendCapability(currentChat, memberStatus, caches, 'can_send_documents');
}

/** 音乐 */
export function canSendAudioRights(
    currentChat: chat,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
): boolean {
    return canSendCapability(currentChat, memberStatus, caches, 'can_send_audios');
}

/** 位置 / 联系人（基于 can_send_basic_messages） */
export function canSendMessageRights(
    currentChat: chat,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
): boolean {
    return canSendCapability(currentChat, memberStatus, caches, 'can_send_basic_messages');
}

/**
 * 投票的聊天类型是否允许（pollsAllowed）：
 * - 超群 / 基本群：直接允许；
 * - 私聊：对方是 Bot 或是"自己（Saved Messages）"。
 */
export function pollsAllowedType(
    currentChat: chat,
    peerUser: user | undefined,
    myId: number,
): boolean {
    const type = currentChat.type._;
    if (type === 'chatTypeSupergroup' || type === 'chatTypeBasicGroup') return true;
    if (type === 'chatTypePrivate') {
        if (!peerUser) return false; // 未知用户不放行
        return peerUser.type?._ === 'userTypeBot' || peerUser.id === myId;
    }
    return false;
}

/** 投票：权限（can_send_polls）且聊天类型允许 */
export function canSendPollRights(
    currentChat: chat,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
    peerUser: user | undefined,
    myId: number,
): boolean {
    return canSendCapability(currentChat, memberStatus, caches, 'can_send_polls')
        && pollsAllowedType(currentChat, peerUser, myId);
}

/**
 * 清单/待办的聊天类型是否允许（checklistsAllowed）：
 * 比投票额外要求：不能是密聊（Secret Chat）、不能是频道。
 */
export function checklistsAllowedType(currentChat: chat): boolean {
    if (currentChat.type._ === 'chatTypeSecret') return false;
    if (currentChat.type._ === 'chatTypeSupergroup' && currentChat.type.is_channel) return false;
    return true;
}

/**
 * 清单/待办：权限（can_send_polls）+ 聊天类型 + Premium。
 * @param isPremium - 当前用户是否 Premium
 * @param isPremiumAvailable - 是否可购买 Premium（未知时视为 true）
 */
export function canSendChecklistRights(
    currentChat: chat,
    memberStatus: ChatMemberStatus | undefined,
    caches: GroupCache,
    isPremium: boolean,
    isPremiumAvailable: boolean,
): boolean {
    if (!canSendCapability(currentChat, memberStatus, caches, 'can_send_polls')) return false;
    if (!checklistsAllowedType(currentChat)) return false;
    return isPremium || isPremiumAvailable;
}
