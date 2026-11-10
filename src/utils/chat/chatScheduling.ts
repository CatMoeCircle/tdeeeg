/**
 * 发送选项（静默 / 定时 / 提醒 / 在线时发送）的可用性判定。
 *
 * 规则来自 TDLib 的 SendOptions 约束与官方客户端的发送按钮菜单：
 * - 静默发送（disable_notification）：密聊没有通知通道，收藏夹没有接收方，两者不提供；
 * - 定时发送：密聊（secret chat）、频道私聊群组（direct messages）不能定时，
 *   收藏夹里同一条能力显示为「设置提醒」；
 * - 在线时发送：仅私聊且对方在线状态精确可见（在线，或离线但带上次在线时间）时提供。
 */
import type { chat, messageSchedulingStateSendAtDate$Input, messageSchedulingStateSendWhenOnline$Input, user } from 'tdlib-types';
import { isSavedMessagesChat } from './savedMessages';

/** 发送时附加的选项（静默 / 定时），由输入区传给发送链路 */
export interface OutgoingMessageOptions {
    /** 不触发接收方通知 */
    silent?: boolean;
    /** 定时状态；缺省为立即发送 */
    schedulingState?:
        | messageSchedulingStateSendAtDate$Input
        | messageSchedulingStateSendWhenOnline$Input;
}

/** 指定时间发送的调度状态 */
export function schedulingStateAt(sendAt: number): messageSchedulingStateSendAtDate$Input {
    return {
        _: 'messageSchedulingStateSendAtDate',
        send_date: sendAt,
        repeat_period: 0,
    };
}

/** 对方上线时发送的调度状态 */
export function schedulingStateWhenOnline(): messageSchedulingStateSendWhenOnline$Input {
    return { _: 'messageSchedulingStateSendWhenOnline' };
}

/** 定时发送的语义：普通定时 / 收藏夹提醒 / 不提供 */
export type ScheduledSendMode = 'none' | 'schedule' | 'reminder';

/** 定时发送时间上限（TDLib：send_date 必须在未来 367 天内） */
export const SCHEDULE_MAX_DAYS = 367;

/** 是否可以在发送时静默（不触发对方通知） */
export function canSendSilently(
    currentChat: chat | undefined,
    currentUserId?: number,
): boolean {
    if (!currentChat) return false;
    // 收藏夹：消息发给自己，没有「对方通知」可关
    if (isSavedMessagesChat(currentChat, currentUserId)) return false;
    // 密聊：服务端加密消息没有静音标记
    if (currentChat.type._ === 'chatTypeSecret') return false;
    return true;
}

/**
 * 当前会话的定时发送语义。
 * @param isDirectMessages 是否为频道私聊群组（TDLib 禁止在其话题里定时）
 */
export function scheduledSendModeOf(
    currentChat: chat | undefined,
    currentUserId?: number,
    isDirectMessages = false,
): ScheduledSendMode {
    if (!currentChat) return 'none';
    if (currentChat.type._ === 'chatTypeSecret') return 'none';
    if (isDirectMessages) return 'none';
    if (isSavedMessagesChat(currentChat, currentUserId)) return 'reminder';
    return 'schedule';
}

/**
 * 是否提供「在线时发送」。
 *
 * TDLib 要求私聊且对方在线状态精确已知；官方客户端在对端「最近上线」被隐藏
 * （userStatusRecently / LastWeek / LastMonth）时不提供，机器人 / 自己也不提供。
 */
export function canScheduleUntilOnline(otherUser: user | undefined): boolean {
    if (!otherUser) return false;
    if (otherUser.type._ !== 'userTypeRegular') return false;
    const status = otherUser.status;
    // 在线 / 离线且有明确的上次在线时间 = 精确可见；Recently / LastWeek / LastMonth 表示已隐藏
    if (status._ === 'userStatusOnline') return true;
    return status._ === 'userStatusOffline' && status.was_online > 0;
}

/** 私聊对端用户 id（非私聊返回 undefined） */
export function privatePeerUserId(currentChat: chat | undefined): number | undefined {
    if (!currentChat) return undefined;
    if (currentChat.type._ === 'chatTypePrivate' || currentChat.type._ === 'chatTypeSecret') {
        return currentChat.type.user_id;
    }
    return undefined;
}
