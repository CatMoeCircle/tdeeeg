/**
 * 会话级小缓存：同一份「短时间不会变」的元信息，来回切对话时不再重复向后端要。
 *
 * 每次进入会话都要 getSupergroup / getSupergroupFullInfo / getChatAvailableMessageSenders /
 * getScopeNotificationSettings / 逐人 getChatMember。连点或来回切时，请求数按「进入次数」翻倍，
 * 每份响应还要在主线程反序列化并触发一轮消息重渲染 —— 这才是切对话卡顿的来源。
 *
 * 只缓存元信息；未读/已读线/消息本身必须实时，走事件，不进这里。
 * ponytail: 进程内 5 分钟 TTL，够挡住连续切换；真要更强一致性再按 kind 单独失效。
 */
const TTL_MS = 5 * 60_000;

type Entry = { at: number; value: unknown };
const stores = new Map<string, Map<number, Entry>>();

function bucket(kind: string): Map<number, Entry> {
    let m = stores.get(kind);
    if (!m) {
        m = new Map();
        stores.set(kind, m);
    }
    return m;
}

/** 读缓存；过期视作没有 */
export function fetchCacheGet<T>(kind: string, id: number): T | undefined {
    const m = bucket(kind);
    const entry = m.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.at > TTL_MS) {
        m.delete(id);
        return undefined;
    }
    return entry.value as T;
}

/** 写缓存（同一个 key 后写覆盖） */
export function fetchCacheSet(kind: string, id: number, value: unknown): void {
    bucket(kind).set(id, { at: Date.now(), value });
}
