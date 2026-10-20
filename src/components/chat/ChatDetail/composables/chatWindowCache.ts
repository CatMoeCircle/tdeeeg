import type { message } from 'tdlib-types';

/**
 * 已渲染消息窗口的进程内缓存（每个「会话 + 话题/线程」一份）。
 *
 * 目的对齐 Unigram 的观感：切回看过的会话时先原样铺上上次的窗口并立即露出，
 * 后台再照常按原逻辑取数/覆盖，从而没有「骨架屏闪一下」的中间态。
 * 只缓存已经 markRaw 的消息对象引用（不复制），离开会话时写入，最多保留最近几份。
 */
export interface ChatWindowSnapshot {
    messages: message[];
    /** 该窗口是否已贴到真实最新（供 updateNewMessage 判断能否直接 append） */
    windowReachesLatest: boolean;
}

/** 最多保留的窗口数（每份 ≤ MAX_MESSAGE_WINDOW 条，只存引用） */
const MAX_WINDOWS = 6;

const windows = new Map<string, ChatWindowSnapshot>();

export function chatWindowKey(
    chatId: number,
    topicId: number | null | undefined,
    threadRootId: number | null | undefined,
): string {
    return `${chatId}:${topicId ?? 0}:${threadRootId ?? 0}`;
}

/** 写入（并刷新 LRU 顺序）；空窗口不写 */
export function saveChatWindow(key: string, snapshot: ChatWindowSnapshot): void {
    if (snapshot.messages.length === 0) return;
    windows.delete(key);
    windows.set(key, snapshot);
    while (windows.size > MAX_WINDOWS) {
        const oldest = windows.keys().next();
        if (oldest.done) break;
        windows.delete(oldest.value);
    }
}

/** 读取并刷新 LRU 顺序 */
export function peekChatWindow(key: string): ChatWindowSnapshot | null {
    const hit = windows.get(key);
    if (!hit) return null;
    windows.delete(key);
    windows.set(key, hit);
    return hit;
}
