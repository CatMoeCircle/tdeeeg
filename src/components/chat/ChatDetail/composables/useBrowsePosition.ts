import type { Ref } from 'vue';

/**
 * 上次浏览位置缓存（模块级 + localStorage）。
 * 按 chatId(+topicId) 缓存「视口顶第一条消息 id + 该消息相对容器顶的像素偏移」，
 * 跨聊天切换 / 关闭重开 / 应用重启后仍可回到上次阅读位置。
 *
 * 从 `ChatDetail/index.vue` 抽出；仅把 `unreadBoundaryMessageId` /
 * `sessionUnreadBaseId` 以 ref 注入，逻辑与原来一致。
 */
export interface BrowsePosition {
    /** 视口顶第一条消息 id */
    anchorId: number;
    /** 该消息 top 相对容器顶的像素偏移（不是相对 window 视口） */
    pixelFromTop: number;
    /** 保存时的 last_read_inbox_message_id，用于失效判断 */
    readInboxMaxId: number;
    savedAt: number;
}

const BROWSE_POS_STORAGE_KEY = 'tdgram-browse-pos';
const BROWSE_POS_STORAGE_VERSION = 1;

function lastBrowseCacheKey(id: number, tid?: number | null) {
    return tid ? `${id}:${tid}` : `${id}`;
}

function loadBrowsePosStore(): Map<string, BrowsePosition> {
    const map = new Map<string, BrowsePosition>();
    try {
        const raw = localStorage.getItem(BROWSE_POS_STORAGE_KEY);
        if (!raw) return map;
        const parsed = JSON.parse(raw) as { v?: number; entries?: Record<string, BrowsePosition> };
        if (!parsed || parsed.v !== BROWSE_POS_STORAGE_VERSION || !parsed.entries) return map;
        for (const [key, entry] of Object.entries(parsed.entries)) {
            if (entry && typeof entry.anchorId === 'number' && entry.anchorId > 0
                && typeof entry.pixelFromTop === 'number'
                && typeof entry.readInboxMaxId === 'number'
                && typeof entry.savedAt === 'number') {
                map.set(key, entry);
            }
        }
    } catch {
        // localStorage 损坏：丢弃，走未读/底部逻辑
    }
    return map;
}

function persistBrowsePosStore(map: Map<string, BrowsePosition>) {
    try {
        const entries: Record<string, BrowsePosition> = {};
        for (const [key, entry] of map) entries[key] = entry;
        localStorage.setItem(BROWSE_POS_STORAGE_KEY, JSON.stringify({
            v: BROWSE_POS_STORAGE_VERSION,
            entries,
        }));
    } catch {
        // 配额/隐私模式：仅保留内存缓存
    }
}

const lastBrowsePositionCache = loadBrowsePosStore();

export function useBrowsePosition(deps: {
    unreadBoundaryMessageId: Ref<number | null>;
    sessionUnreadBaseId: Ref<number>;
}) {
    const { unreadBoundaryMessageId, sessionUnreadBaseId } = deps;

    /** 读取某聊天的上次浏览位置 */
    const getBrowsePosition = (id: number, tid?: number | null): BrowsePosition | null =>
        lastBrowsePositionCache.get(lastBrowseCacheKey(id, tid)) ?? null;

    /** 写入某聊天的上次浏览位置（内存 + localStorage） */
    const setBrowsePosition = (id: number, tid: number | null | undefined, pos: BrowsePosition) => {
        lastBrowsePositionCache.set(lastBrowseCacheKey(id, tid), pos);
        persistBrowsePosStore(lastBrowsePositionCache);
    };

    /** 删除某聊天的缓存位置（贴底 / 滑进未读 / 已读线变化 / 失效时使用） */
    const clearLastBrowsePosition = (id: number, tid?: number | null) => {
        const key = lastBrowseCacheKey(id, tid);
        if (!lastBrowsePositionCache.delete(key)) return;
        persistBrowsePosStore(lastBrowsePositionCache);
    };

    /**
     * 已读线前进时同步缓存 readInboxMaxId。
     * 否则 capture 与 viewMessages 竞态会让 saved.readInboxMaxId 落后于 last_read_inbox_message_id，
     * 退出再进时被「已读线变化」误失效。
     */
    const bumpBrowsePosReadInboxMaxId = (id: number, tid: number | null | undefined, readInboxMaxId: number) => {
        const key = lastBrowseCacheKey(id, tid);
        const entry = lastBrowsePositionCache.get(key);
        if (!entry || entry.readInboxMaxId >= readInboxMaxId) return;
        lastBrowsePositionCache.set(key, { ...entry, readInboxMaxId });
        persistBrowsePosStore(lastBrowsePositionCache);
    };

    /**
     * anchor 是否已滑进未读区（capture / 进入会话共用，避免两份判定漂移）。
     * - 有 UI 未读边界（含相册边界）→ 以边界为准
     * - 无边界（首窗不含未读，unreadBoundary 为 null）→ 兜底比较「打开时已读线」
     *
     * 必须用 sessionUnreadBaseId 而非 live last_read / lastReported：
     * 后两者会被 markVisible 推进，用户刚滚进未读时兜底会失效。
     */
    function isAnchorInUnreadZone(anchorId: number): boolean {
        const unreadBoundary = unreadBoundaryMessageId.value;
        if (unreadBoundary != null && unreadBoundary > 0) {
            return anchorId >= unreadBoundary;
        }
        return sessionUnreadBaseId.value > 0 && anchorId > sessionUnreadBaseId.value;
    }

    return {
        getBrowsePosition,
        setBrowsePosition,
        clearLastBrowsePosition,
        bumpBrowsePosReadInboxMaxId,
        isAnchorInUnreadZone,
    };
}
