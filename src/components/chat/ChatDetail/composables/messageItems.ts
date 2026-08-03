import type { message } from 'tdlib-types';
import { isAlbumMedia, isServiceMessage } from './messageType';
import { formatDateLabel, isSameCalendarDay } from './dateLabel';
import { getForwardOriginKey } from '../../../../utils/forwardedMessages';

/**
 * 消息列表展示条目类型定义与构建逻辑（纯数据处理）。
 *
 * 本模块把 `ChatDetail/index.vue` 中由 `messageItems` computed 负责的
 * "原始消息数组 → 展示条目数组" 逻辑独立出来：
 * - 插入日期分隔
 * - 插入"新消息"未读分隔
 * - 将连续消息合并为发送者分组（含相册分组、服务消息单独成组）
 *
 * 由于其中个别判断依赖组件内部的响应式 ref（如 `isSelf`、`isSavedForwardedMessage`、
 * `shouldReserveAvatarColumn`），这些判断以回调形式通过 {@link DisplayContext} 注入，
 * 从而保证本模块保持纯函数、可独立测试。
 */

/** 单条消息展示条目 */
export interface SingleDisplayItem {
    type: 'single';
    key: string;
    msg: message;
    index: number;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    showAvatar: boolean;
}

/** 相册分组展示条目 */
export interface AlbumDisplayItem {
    type: 'album';
    key: string;
    messages: message[];
    firstIndex: number;
}

/** 日期分隔展示条目 */
export interface DateDisplayItem {
    type: 'date';
    key: string;
    date: number;
    text: string;
}

/** 未读分隔展示条目 */
export interface UnreadDisplayItem {
    type: 'unread';
    key: string;
}

/** 消息列表统一的展示条目联合类型 */
export type DisplayItem =
    | SingleDisplayItem
    | AlbumDisplayItem
    | DateDisplayItem
    | UnreadDisplayItem;

/**
 * 依赖组件内部 ref 的判断回调集合。
 * 这些判断在组件中依赖响应式状态，无法下沉到纯函数模块，因此通过注入传入。
 */
export interface DisplayContext {
    /** 判断消息是否为"自己发送"（涉及当前用户与聊天类型判断） */
    isSelf: (msg: message) => boolean;
    /** 判断消息是否为"收藏中的转发消息"（涉及当前聊天判断） */
    isSavedForwardedMessage: (msg: message) => boolean;
    /** 判断是否需要为该消息保留左侧头像列 */
    shouldReserveAvatarColumn: (msg: message) => boolean;
}

/**
 * 判断两条消息是否属于同一发送者（用于连续消息分组）。
 *
 * 分组规则：
 * - 自己发送与他人发送永不视为同一发送者；
 * - 收藏中的转发消息按转发来源 key 是否一致判断；
 * - 普通消息按 sender_id 类型与 id 是否一致判断。
 *
 * @param ctx - 依赖组件 ref 的回调集合
 * @param a - 相邻消息 a（可为空）
 * @param b - 相邻消息 b（可为空）
 * @returns 属于同一发送者返回 `true`，否则返回 `false`
 */
export function isSameSender(
    ctx: DisplayContext,
    a: message | undefined,
    b: message | undefined,
): boolean {
    if (!a || !b) return false;
    if (ctx.isSelf(a) !== ctx.isSelf(b)) return false;

    const aIsSavedForward = ctx.isSavedForwardedMessage(a);
    const bIsSavedForward = ctx.isSavedForwardedMessage(b);
    if (aIsSavedForward || bIsSavedForward) {
        return (
            aIsSavedForward
            && bIsSavedForward
            && !!a.forward_info
            && !!b.forward_info
            && getForwardOriginKey(a.forward_info) === getForwardOriginKey(b.forward_info)
        );
    }

    if (a.sender_id._ !== b.sender_id._) return false;
    if (a.sender_id._ === 'messageSenderUser' && b.sender_id._ === 'messageSenderUser') {
        return a.sender_id.user_id === b.sender_id.user_id;
    }
    if (a.sender_id._ === 'messageSenderChat' && b.sender_id._ === 'messageSenderChat') {
        return a.sender_id.chat_id === b.sender_id.chat_id;
    }
    return false;
}

/**
 * 判断两条相邻消息之间是否存在"显示分隔"。
 * 存在分隔时会打断连续消息分组，需要重新显示头像与发送者名。
 *
 * 分隔条件：跨天 / 任一是服务消息 / 任一是相册媒体。
 *
 * @param a - 前一条消息（可为空）
 * @param b - 后一条消息（可为空）
 * @returns 存在分隔返回 `true`，否则返回 `false`
 */
export function isDisplayBreak(a: message | undefined, b: message | undefined): boolean {
    if (!a || !b) return true;
    // 日期分隔
    if (!isSameCalendarDay(a.date, b.date)) return true;
    // 系统消息（居中显示，自成一组）
    if (isServiceMessage(a) || isServiceMessage(b)) return true;
    // 相册（整体显示，自成一组）
    if (a.media_album_id && a.media_album_id !== '0' && isAlbumMedia(a)) return true;
    if (b.media_album_id && b.media_album_id !== '0' && isAlbumMedia(b)) return true;
    return false;
}

/**
 * 判断两条相邻消息之间是否存在未被 {@link isSameSender} 覆盖的额外分组打断。
 * 仅供 messageItems 内部使用（日期 / 服务消息 / 相册分隔的快捷判断）。
 *
 * @internal
 */
function shouldBreak(
    a: message | undefined,
    b: message | undefined,
): boolean {
    return isDisplayBreak(a, b);
}

/**
 * 判断某条消息是否命中未读分隔边界（自身即边界，或属于边界所在相册分组）。
 *
 * @param msg - 待判断的消息
 * @param unreadBoundaryMessageId - 未读分隔边界的消息 id（可为空）
 * @param unreadAlbumId - 未读边界消息所属的相册 id（可为空）
 * @returns 命中未读分隔返回 `true`，否则返回 `false`
 */
function isUnreadDivider(
    msg: message,
    unreadBoundaryMessageId: number | null,
    unreadAlbumId: string | undefined,
): boolean {
    return (
        msg.id === unreadBoundaryMessageId
        || (!!unreadAlbumId && unreadAlbumId !== '0' && msg.media_album_id === unreadAlbumId)
    );
}

/**
 * 将原始消息数组构建为消息展示条目数组（oldest-first）。
 *
 * 处理流程：
 * 1. 相邻跨天消息之间插入日期分隔；
 * 2. 在未读边界位置插入"新消息"分隔（仅一次）；
 * 3. 相册媒体整体合并为一个 album 条目；
 * 4. 服务消息单独成组（居中）；
 * 5. 其余消息按发送者连续性分组，计算 `isFirstInGroup` / `isLastInGroup` 与头像列占用。
 *
 * @param messages - 按旧→新排序的原始消息数组
 * @param unreadBoundaryMessageId - 未读分隔边界的消息 id（无未读时为 `null`）
 * @param ctx - 依赖组件 ref 的判断回调集合
 * @returns 展示条目数组
 */
export function buildDisplayItems(
    messages: message[],
    unreadBoundaryMessageId: number | null,
    ctx: DisplayContext,
): DisplayItem[] {
    const items: DisplayItem[] = [];
    const M = messages;
    if (M.length === 0) return items;

    // 日期分隔逻辑：不同日期的相邻消息之间插入
    let lastDate = M[0].date;
    let hasUnreadDivider = false;
    const unreadBoundary = M.find(m => m.id === unreadBoundaryMessageId);
    const unreadAlbumId = unreadBoundary?.media_album_id;

    // 上一条"可分组"的普通消息（非系统消息/相册）。
    // 遇到日期、未读、系统消息、相册分隔时清空，使被分隔的连续消息重新成组并显示头像
    let prevGroupable: message | undefined = undefined;

    let i = 0;
    while (i < M.length) {
        const msg = M[i];

        // 日期分隔
        if (!isSameCalendarDay(lastDate, msg.date)) {
            items.push({ type: 'date', key: `d-${msg.date}`, date: msg.date, text: formatDateLabel(msg.date) });
            lastDate = msg.date;
            prevGroupable = undefined; // 日期打断连续消息
        }

        // 未读分隔
        if (!hasUnreadDivider && isUnreadDivider(msg, unreadBoundaryMessageId, unreadAlbumId)) {
            items.push({ type: 'unread', key: `unread-${unreadBoundaryMessageId}` });
            hasUnreadDivider = true;
            prevGroupable = undefined; // 未读分隔打断连续消息
        }

        // 相册分组（相册整体显示，打断前后的连续消息）
        if (msg.media_album_id && msg.media_album_id !== '0' && isAlbumMedia(msg)) {
            const albumMsgs: message[] = [msg];
            let j = i + 1;
            while (j < M.length && M[j].media_album_id === msg.media_album_id && isAlbumMedia(M[j])) {
                albumMsgs.push(M[j]);
                j++;
            }
            items.push({ type: 'album', key: `a-${msg.media_album_id}`, messages: albumMsgs, firstIndex: i });
            prevGroupable = undefined; // 相册打断连续消息
            i = j;
            continue;
        }

        // 系统消息：居中显示，单独成组，不占用头像列
        if (isServiceMessage(msg)) {
            items.push({
                type: 'single',
                key: `m-${msg.id}`,
                msg,
                index: i,
                isFirstInGroup: true,
                isLastInGroup: true,
                showAvatar: false,
            });
            prevGroupable = undefined; // 系统消息打断连续消息
            i++;
            continue;
        }

        // 普通消息
        const isFirst = !prevGroupable || !isSameSender(ctx, prevGroupable, msg);
        const next = M[i + 1];
        const unreadNext = !!next && isUnreadDivider(next, unreadBoundaryMessageId, unreadAlbumId);
        const isLast = !next || shouldBreak(msg, next) || unreadNext || !isSameSender(ctx, msg, next);
        items.push({
            type: 'single',
            key: `m-${msg.id}`,
            msg,
            index: i,
            isFirstInGroup: isFirst,
            isLastInGroup: isLast,
            showAvatar: isLast && ctx.shouldReserveAvatarColumn(msg),
        });
        prevGroupable = msg;
        i++;
    }

    return items;
}
