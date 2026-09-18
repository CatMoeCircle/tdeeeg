import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DL_PRIORITY } from "../utils/downloadPriority";
import {
    DL_TAG,
    FILTER_KEY,
    DEFAULT_FILTER_KEYS,
    FILTER_OPTIONS,
    buildDownloadTags,
    resolveItemTags,
    isGenericItem,
    isAutoPhotoItem,
    isAutoVideoItem,
    isIncompleteStreaming,
    isItemVisibleByFilter,
    tagChipClass,
} from "../utils/downloadTags";

export { DL_TAG, FILTER_KEY, FILTER_OPTIONS, resolveItemTags, tagChipClass };
export {
    isGenericItem,
    isAutoPhotoItem,
    isAutoVideoItem,
    isIncompleteStreaming,
};

/** 文件类型分类（与 Rust 端 DownloadFileType 对应） */
export type DownloadFileType =
    | "document"
    | "photo"
    | "video"
    | "audio"
    | "voice"
    | "animation"
    | "sticker"
    | "avatar"
    | "other";

/**
 * 从 TDLib file 对象取稳定主键。
 * 优先 file.remote.id（跨重启不变）；无远程 id 时回退 session:<file_id>。
 */
export function remoteIdOf(file: { id?: number; remote?: { id?: string } } | null | undefined): string {
    const rid = file?.remote?.id;
    if (rid && rid.length > 0) return rid;
    if (typeof file?.id === "number") return `session:${file.id}`;
    return "";
}

/** Rust 端 DownloadItem 的序列化结构 */
export interface DownloadItem {
    /** 稳定主键：file.remote.id（跨重启不变）；无远程 id 时为 session:<id> / legacy:<id> */
    remote_id: string;
    /** 当前 TDLib 会话 file.id（重启后会变），pause/cancel 等操作使用 */
    session_file_id?: number;
    /** 兼容字段：当前会话 file_id */
    file_id: number;
    file_name: string;
    chat_title: string;
    chat_id?: number;
    message_id?: number;
    total_size: number;
    downloaded_size: number;
    progress: number;
    is_paused: boolean;
    is_completed: boolean;
    local_path?: string;
    thumbnail_data_url?: string;
    file_type: DownloadFileType;
    is_generic: boolean;
    hidden_category?: string;
    is_auto_photo: boolean;
    is_streaming: boolean;
    /** 多标签 */
    tags?: string[];
    /** 来源补充（用户 / 贴纸集 / emoji 集 / 资料页…） */
    source_label?: string;
    dismissed: boolean;
    is_upload?: boolean;
    created_at?: number;
}

export type HiddenCategory =
    | "emoji"
    | "video_cover"
    | "avatar"
    | "story_cover"
    | "sticker"
    | "gift"
    | "music_cover"
    | "other";

const HIDDEN_CATEGORY_LABELS: Record<HiddenCategory, string> = {
    emoji: "emoji",
    video_cover: "视频封面",
    avatar: "用户头像",
    story_cover: "动态封面",
    sticker: "贴纸",
    gift: "礼物",
    music_cover: "音乐封面",
    other: "通用",
};

/** 遗留：隐藏分类标签（有 tags 时优先用 tags） */
export function hiddenCategoryLabel(item: Pick<DownloadItem, "is_generic" | "hidden_category" | "tags">): string {
    const tags = resolveItemTags(item as never);
    if (tags.length > 0) {
        // 取第一个非资源类型标签作为分类展示，否则取第一个
        const preferred = tags.find((t) => t !== DL_TAG.IMAGE && t !== DL_TAG.VIDEO && t !== DL_TAG.MUSIC) ?? tags[0];
        return preferred;
    }
    const cat = item.hidden_category as HiddenCategory | undefined;
    if (cat && HIDDEN_CATEGORY_LABELS[cat]) return HIDDEN_CATEGORY_LABELS[cat];
    return HIDDEN_CATEGORY_LABELS.other;
}

function inferHiddenCategory(fileType: DownloadFileType): HiddenCategory {
    switch (fileType) {
        case "avatar": return "avatar";
        case "sticker": return "sticker";
        default: return "other";
    }
}

export const useDownloadStore = defineStore("downloads", () => {
    /** 条目：key = remote_id（稳定主键） */
    const items = ref<Record<string, DownloadItem>>({});
    /** 会话 file.id → remote_id，供 UI 按 file.id 查询进度 */
    const sessionIdMap = ref<Record<number, string>>({});

    /** 标签过滤器已启用集合（默认隐藏通用资源与自动下载图片） */
    const filterKeys = ref<Set<string>>(new Set(DEFAULT_FILTER_KEYS));

    function setFilterKey(key: string, enabled: boolean) {
        const next = new Set(filterKeys.value);
        if (enabled) next.add(key);
        else next.delete(key);
        filterKeys.value = next;
        try {
            localStorage.setItem("tdgram_dl_filters", JSON.stringify([...next]));
        } catch { /* ignore */ }
    }

    function resetFilters() {
        filterKeys.value = new Set(DEFAULT_FILTER_KEYS);
        try { localStorage.removeItem("tdgram_dl_filters"); } catch { /* ignore */ }
    }

    function loadFilters() {
        try {
            const raw = localStorage.getItem("tdgram_dl_filters");
            if (raw) {
                const arr = JSON.parse(raw) as string[];
                if (Array.isArray(arr)) filterKeys.value = new Set(arr);
            }
        } catch { /* ignore */ }
    }

    /** 按会话 file.id 或 remote_id 解析 store 键 */
    function resolveKey(id: number | string): string {
        if (typeof id === "string") return id;
        return sessionIdMap.value[id] || `session:${id}`;
    }

    function getItemByKey(id: number | string): DownloadItem | undefined {
        return items.value[resolveKey(id)];
    }

    /**
     * 按 TDLib File 对象查询下载条目。
     *
     * file.id 只在当前 TDLib 会话内有效，重启后会变，且不同文件可能复用同一 id。
     * 因此必须优先用 file.remote.id（跨重启稳定）查找；按 session id 回退时，
     * 仅当映射到的条目 remote_id 与当前 file 一致才接受，否则视为 id 复用冲突。
     */
    function getDownloadInfoForFile(
        file: { id?: number; remote?: { id?: string } } | null | undefined,
    ): DownloadItem | undefined {
        if (!file) return undefined;
        const remoteId = file.remote?.id;
        if (remoteId && remoteId.length > 0) {
            const byRemote = items.value[remoteId];
            if (byRemote) return byRemote;
            if (typeof file.id !== "number") return undefined;
            const mapped = items.value[sessionIdMap.value[file.id] || `session:${file.id}`];
            if (!mapped) return undefined;
            // session 映射指向其他 remote → file.id 被复用，不得当作本文件
            if (mapped.remote_id && mapped.remote_id !== remoteId) return undefined;
            return mapped.remote_id === remoteId ? mapped : undefined;
        }
        if (typeof file.id === "number") return getItemByKey(file.id);
        return undefined;
    }

    /** 读取某 File 的已完成本地路径；remote_id 不匹配时返回空串，避免串媒体 */
    function getCompletedPathForFile(
        file: { id?: number; remote?: { id?: string } } | null | undefined,
    ): string {
        const info = getDownloadInfoForFile(file);
        return info?.is_completed && info.local_path ? info.local_path : "";
    }

    /** 全部未 dismiss 条目 */
    const allItems = computed(() => Object.values(items.value));

    /** 过滤后可见项 */
    const visibleItems = computed(() =>
        allItems.value
            .filter((item) => !item.dismissed && isItemVisibleByFilter(item as never, filterKeys.value))
            .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || (b.file_id ?? 0) - (a.file_id ?? 0))
    );

    /** 活跃下载（红点）：排除默认隐藏的通用资源与自动下载图片 */
    const activeItems = computed(() =>
        allItems.value.filter(
            (item) =>
                !item.is_completed &&
                !item.dismissed &&
                !isGenericItem(item as never) &&
                !isAutoPhotoItem(item as never)
        )
    );

    const activeCount = computed(() => activeItems.value.length);

    const activeDownloadingCount = computed(() =>
        activeItems.value.filter((item) => !item.is_paused).length
    );

    const completedItems = computed(() =>
        visibleItems.value.filter((item) => item.is_completed)
    );

    const pendingItems = computed(() =>
        visibleItems.value.filter((item) => !item.is_completed)
    );

    /** 正在下载：未完成、未暂停、且不是「未完成流式传输」 */
    const downloadingItems = computed(() =>
        visibleItems.value.filter(
            (item) => !item.is_completed && !item.is_paused && !isIncompleteStreaming(item as never)
        )
    );

    /** 已暂停：未完成、已暂停、且不是流式传输未完成项 */
    const pausedItems = computed(() =>
        visibleItems.value.filter(
            (item) => !item.is_completed && item.is_paused && !isIncompleteStreaming(item as never)
        )
    );

    /** 流式传输中（未完成）：独立可折叠分区，不进已暂停 */
    const streamingItems = computed(() =>
        visibleItems.value.filter((item) => isIncompleteStreaming(item as never))
    );

    /** 默认隐藏中仍有活跃任务（过滤器未打开时提示用） */
    const hasHiddenActive = computed(() =>
        allItems.value.some(
            (item) =>
                !item.is_completed &&
                !item.dismissed &&
                (isGenericItem(item as never) || isAutoPhotoItem(item as never)) &&
                !isItemVisibleByFilter(item as never, filterKeys.value)
        )
    );

    const hiddenStats = computed(() => {
        let generics = 0;
        let autoPhotos = 0;
        let active = 0;
        for (const i of allItems.value) {
            if (i.dismissed || i.is_completed) continue;
            if (isItemVisibleByFilter(i as never, filterKeys.value)) continue;
            const g = isGenericItem(i as never);
            const ap = isAutoPhotoItem(i as never);
            if (g) generics++;
            if (ap) autoPhotos++;
            if (g || ap) active++;
        }
        return { generics, autoPhotos, active };
    });

    const hiddenGenericsCount = computed(() => hiddenStats.value.generics);
    const hiddenAutoPhotosCount = computed(() => hiddenStats.value.autoPhotos);
    const hiddenActiveCount = computed(() => hiddenStats.value.active);
    const hasHiddenAutoPhotos = computed(() => hiddenStats.value.autoPhotos > 0);

    let unlistenProgress: (() => void) | null = null;
    let pendingUpdates = new Map<string, DownloadItem>();
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    function indexSession(item: DownloadItem) {
        const key = item.remote_id || resolveKey(item.session_file_id ?? item.file_id);
        if (item.session_file_id != null) sessionIdMap.value[item.session_file_id] = key;
        if (item.file_id) sessionIdMap.value[item.file_id] = key;
        return key;
    }

    function applyItem(payload: DownloadItem) {
        const key = indexSession(payload);
        const existing = items.value[key];
        if (!existing) {
            items.value[key] = { ...payload, remote_id: key };
            return;
        }
        const completedBefore = !!existing.is_completed && !!existing.local_path;
        existing.downloaded_size = payload.downloaded_size;
        existing.total_size = payload.total_size;
        existing.progress = payload.progress;
        existing.is_paused = payload.is_paused;
        existing.is_completed = payload.is_completed;
        if (payload.local_path !== undefined) existing.local_path = payload.local_path;
        if (payload.file_name !== undefined && payload.file_name !== existing.file_name) {
            existing.file_name = payload.file_name;
        }
        if (payload.chat_title !== undefined && payload.chat_title !== existing.chat_title) {
            existing.chat_title = payload.chat_title;
        }
        if (typeof payload.file_type === "string") existing.file_type = payload.file_type;
        if (typeof payload.chat_id === "number") existing.chat_id = payload.chat_id;
        if (typeof payload.message_id === "number") existing.message_id = payload.message_id;
        if (payload.thumbnail_data_url !== undefined) existing.thumbnail_data_url = payload.thumbnail_data_url;
        if (payload.is_generic !== undefined) existing.is_generic = payload.is_generic;
        if (typeof payload.hidden_category === "string" && payload.hidden_category !== existing.hidden_category) {
            existing.hidden_category = payload.hidden_category;
        }
        if (payload.is_auto_photo !== undefined) existing.is_auto_photo = payload.is_auto_photo;
        if (payload.is_streaming !== undefined) existing.is_streaming = payload.is_streaming;
        if (payload.tags && payload.tags.length) existing.tags = payload.tags;
        if (payload.source_label !== undefined) existing.source_label = payload.source_label;
        if (payload.dismissed !== undefined) existing.dismissed = payload.dismissed;
        if (payload.session_file_id != null) existing.session_file_id = payload.session_file_id;
        if (payload.file_id) existing.file_id = payload.file_id;
        if (typeof payload.created_at === "number" && payload.created_at !== existing.created_at) {
            existing.created_at = payload.created_at;
        }
        if (!existing.remote_id) existing.remote_id = key;
        // 「下载完成」里程碑：替换条目引用。
        // 否则 watch(() => getDownloadInfo(id)) 因 Object.is 同引用永不回调，
        // 消息气泡会一直停在等待态（下载管理器却已显示完成）。
        const completedNow = !!existing.is_completed && !!existing.local_path;
        if (completedNow && !completedBefore) {
            items.value[key] = { ...existing };
        }
    }

    function flushPendingUpdates() {
        throttleTimer = null;
        if (pendingUpdates.size > 0) {
            const batch = pendingUpdates;
            pendingUpdates = new Map();
            for (const [, item] of batch) {
                applyItem(item);
            }
        }
    }

    function scheduleUpdate(item: DownloadItem) {
        const key = item.remote_id || resolveKey(item.session_file_id ?? item.file_id);
        pendingUpdates.set(key, item);
        if (throttleTimer === null) {
            throttleTimer = setTimeout(flushPendingUpdates, 0);
        }
    }

    async function init() {
        loadFilters();
        await refreshFromRust();
        if (!unlistenProgress) {
            unlistenProgress = await listen<DownloadItem>("download-progress-update", (event) => {
                const item = event.payload;
                if (item) scheduleUpdate(item);
            });
        }
    }

    async function refreshFromRust() {
        try {
            const rustItems: DownloadItem[] = await invoke("get_downloads");
            const map: Record<string, DownloadItem> = {};
            const sidMap: Record<number, string> = {};
            for (const item of rustItems) {
                const key = item.remote_id || `session:${item.session_file_id ?? item.file_id}`;
                map[key] = { ...item, remote_id: key };
                if (item.session_file_id != null) sidMap[item.session_file_id] = key;
                if (item.file_id) sidMap[item.file_id] = key;
            }
            items.value = map;
            sessionIdMap.value = sidMap;
        } catch (e) {
            console.error("Failed to load downloads from Rust:", e);
        }
    }

    function destroy() {
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        pendingUpdates.clear();
        if (unlistenProgress) {
            unlistenProgress();
            unlistenProgress = null;
        }
    }

    /**
     * 注册下载项。
     * @param remoteId file.remote.id（稳定主键）；缺省时用 session:<fileId>
     * @param tags 标签；缺省时按 fileType/hiddenCategory 等推断
     * @param sourceLabel 来源补充展示（用户 / 贴纸集 / emoji 集…）
     */
    async function registerDownload(
        fileId: number,
        fileName: string,
        chatTitle: string,
        totalSize: number,
        fileType: DownloadFileType,
        thumbnailDataUrl?: string,
        chatId?: number,
        messageId?: number,
        isGeneric?: boolean,
        isAutoPhoto?: boolean,
        hiddenCategory?: string,
        isStreaming?: boolean,
        tags?: string[],
        sourceLabel?: string,
        remoteId?: string,
    ) {
        const generic = isGeneric ?? (fileType === "sticker" || fileType === "avatar" || fileType === "other");
        const category = hiddenCategory ?? (generic ? inferHiddenCategory(fileType) : undefined);
        const rid = remoteId && remoteId.length > 0 ? remoteId : `session:${fileId}`;
        const finalTags = buildDownloadTags({
            fileType,
            hiddenCategory: category,
            isGeneric: generic,
            isAutoPhoto,
            isStreaming,
            extraTags: tags,
        });
        try {
            await invoke("register_download", {
                remoteId: rid,
                fileId,
                fileName,
                chatTitle,
                totalSize,
                fileType,
                thumbnailDataUrl: thumbnailDataUrl || null,
                chatId: chatId || null,
                messageId: messageId || null,
                isGeneric: generic,
                hiddenCategory: category ?? null,
                isAutoPhoto: isAutoPhoto ?? false,
                isStreaming: isStreaming ?? false,
                tags: finalTags,
                sourceLabel: sourceLabel || null,
            });
            const item: DownloadItem = {
                remote_id: rid,
                session_file_id: fileId,
                file_id: fileId,
                file_name: fileName,
                chat_title: chatTitle,
                total_size: totalSize,
                downloaded_size: 0,
                progress: 0,
                is_paused: false,
                is_completed: false,
                file_type: fileType,
                thumbnail_data_url: thumbnailDataUrl,
                is_generic: generic,
                hidden_category: category,
                is_auto_photo: isAutoPhoto ?? false,
                is_streaming: isStreaming ?? false,
                tags: finalTags,
                source_label: sourceLabel,
                dismissed: false,
                chat_id: chatId,
                message_id: messageId,
                local_path: undefined,
                created_at: Date.now(),
            };
            items.value[rid] = item;
            sessionIdMap.value[fileId] = rid;
        } catch (e) {
            console.error("registerDownload failed:", e);
        }
    }

    function getProgress(fileId: number | string): number {
        const item = getItemByKey(fileId);
        if (!item) return -1;
        if (item.is_completed) return 1;
        return item.progress;
    }

    /**
     * @param remoteId 可选：file.remote.id。优先按其写入，避免 session file.id
     *   被其他文件复用时把完成路径写到错误条目。
     */
    function markCompleted(fileId: number | string, localPath: string, remoteId?: string) {
        const key = remoteId && remoteId.length > 0 ? remoteId : resolveKey(fileId);
        const item = items.value[key];
        if (!item) return;
        // 替换引用，保证依赖 getDownloadInfo 的 watch 能收到完成事件
        items.value[key] = {
            ...item,
            local_path: localPath,
            is_completed: true,
            progress: 1,
            downloaded_size: item.total_size,
            created_at: Date.now(),
        };
    }

    function getDownloadInfo(fileId: number | string): DownloadItem | undefined {
        return getItemByKey(fileId);
    }

    /** 条目当前会话 TDLib file.id */
    function sessionFileId(item: DownloadItem): number {
        return item.session_file_id ?? item.file_id;
    }

    async function togglePause(fileId: number | string) {
        const item = getItemByKey(fileId);
        if (!item) return;
        const sid = sessionFileId(item);
        try {
            if (!item.is_paused) {
                await invoke("tdlib_send", {
                    request: { _: "toggleDownloadIsPaused", file_id: sid, is_paused: true },
                });
                item.is_paused = true;
            } else {
                await invoke("tdlib_send", {
                    request: { _: "toggleDownloadIsPaused", file_id: sid, is_paused: false },
                });
                await invoke("tdlib_send", {
                    request: { _: "downloadFile", file_id: sid, priority: DL_PRIORITY.USER_ACTIVE, offset: 0, limit: 0, synchronous: false },
                });
                item.is_paused = false;
            }
        } catch (e) {
            console.error("toggleDownloadIsPaused failed:", e);
        }
    }

    async function cancelDownload(fileId: number | string) {
        const item = getItemByKey(fileId);
        if (!item) return;
        const sid = sessionFileId(item);
        try {
            await invoke("tdlib_send", {
                request: { _: "cancelDownloadFile", file_id: sid },
            });
            await dismissItem(item.remote_id || sid);
        } catch (e) {
            console.error("cancelDownloadFile failed:", e);
        }
    }

    async function cancelAllDownloads() {
        const pending = allItems.value.filter((item) => !item.is_completed && !item.dismissed);
        for (const item of pending) {
            try {
                await invoke("tdlib_send", {
                    request: { _: "cancelDownloadFile", file_id: sessionFileId(item) },
                });
                await dismissItem(item.remote_id || sessionFileId(item));
            } catch (e) {
                console.error("cancelDownloadFile failed for", item.remote_id, e);
            }
        }
    }

    async function dismissItem(fileId: number | string) {
        const key = resolveKey(fileId);
        try {
            await invoke("dismiss_download", { key: String(key) });
            if (items.value[key]) {
                items.value[key] = { ...items.value[key], dismissed: true };
            }
        } catch (e) {
            console.error("dismiss_download failed:", e);
        }
    }

    async function clearCompleted() {
        try {
            await invoke("clear_completed_downloads");
            for (const key of Object.keys(items.value)) {
                if (items.value[key]?.is_completed || items.value[key]?.dismissed) {
                    delete items.value[key];
                }
            }
        } catch (e) {
            console.error("clear_completed_downloads failed:", e);
        }
    }

    /** 兼容旧 API：切换通用资源显示（映射到标签过滤器） */
    async function toggleShowHidden() {
        setFilterKey(FILTER_KEY.GENERIC, !filterKeys.value.has(FILTER_KEY.GENERIC));
    }

    /** 兼容旧 API：切换自动下载图片显示 */
    async function toggleShowAutoPhotos() {
        setFilterKey(FILTER_KEY.AUTO_IMAGE, !filterKeys.value.has(FILTER_KEY.AUTO_IMAGE));
    }

    const showHidden = computed(() => filterKeys.value.has(FILTER_KEY.GENERIC));
    const showAutoPhotos = computed(() => filterKeys.value.has(FILTER_KEY.AUTO_IMAGE));

    // ─── 下载面板开关 ─────────────────────────────
    const isPanelOpen = ref(false);
    function openPanel() { isPanelOpen.value = true; }
    function closePanel() { isPanelOpen.value = false; }
    function togglePanel() { isPanelOpen.value = !isPanelOpen.value; }

    return {
        items,
        sessionIdMap,
        filterKeys,
        setFilterKey,
        resetFilters,
        activeItems,
        activeCount,
        activeDownloadingCount,
        visibleItems,
        completedItems,
        pendingItems,
        downloadingItems,
        pausedItems,
        streamingItems,
        showHidden,
        showAutoPhotos,
        hasHiddenActive,
        hasHiddenAutoPhotos,
        hiddenGenericsCount,
        hiddenAutoPhotosCount,
        hiddenActiveCount,
        isPanelOpen,
        openPanel,
        closePanel,
        togglePanel,
        init,
        destroy,
        refreshFromRust,
        registerDownload,
        getProgress,
        markCompleted,
        getDownloadInfo,
        getDownloadInfoForFile,
        getCompletedPathForFile,
        togglePause,
        cancelDownload,
        cancelAllDownloads,
        dismissItem,
        clearCompleted,
        toggleShowHidden,
        toggleShowAutoPhotos,
        resolveKey,
        sessionFileId,
    };
});
