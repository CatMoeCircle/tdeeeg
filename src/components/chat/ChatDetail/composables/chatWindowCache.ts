import type { message } from 'tdlib-types';

/**
 * 已渲染消息窗口的进程内缓存（每个「会话 + 话题/线程」一份）。
 *
 * 目的对齐 Unigram 的观感：切回看过的会话时先原样铺上上次的窗口并立即露出，
 * 后台再照常按原逻辑取数/覆盖，从而没有「骨架屏闪一下」的中间态。
 * 只缓存已经 markRaw 的消息对象引用（不复制），离开会话时写入，总消息条数超过上限时整窗淘汰最旧的。
 */
export interface ChatWindowSnapshot {
    messages: message[];
    /** 该窗口是否已贴到真实最新（供 updateNewMessage 判断能否直接 append） */
    windowReachesLatest: boolean;
}

/**
 * 所有窗口合计的消息条数上限。按条数而非窗口数封顶：窗口大小不一，
 * 按窗口数封顶会让内存占用随窗口大小波动。只存引用，这里的数字就是内存的近似度量。
 */
const MAX_TOTAL_MESSAGES = 500;

const windows = new Map<string, ChatWindowSnapshot>();

function totalMessages(): number {
    let n = 0;
    for (const w of windows.values()) n += w.messages.length;
    return n;
}

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
    // 整窗淘汰，不切开单个窗口；size > 1 保证刚写入的窗口本身不会被踢掉
    // ponytail: 单窗口 ≤180 条时不会出现「只剩一个窗口仍超限」，若窗口变大需复核这个兜底
    while (totalMessages() > MAX_TOTAL_MESSAGES && windows.size > 1) {
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
