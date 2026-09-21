import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DL_PRIORITY } from "../utils/downloadPriority";
import { onTdlibUpdate } from "./tdlibBus";
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
    /** 完成时间（ms）；已完成列表按此排序 */
    completed_at?: number;
    /** 是否收到过 TDLib updateFile；未开下的 register 任务不进列表 */
    has_tdlib_update?: boolean;
    /** 是否仍在 TDLib 官方下载列表中（addFileToDownloads） */
    in_tdlib_list?: boolean;
}

/** 条目是否真正开始过（收到 TDLib update 或已有进度/完成） */
export function hasTdlibUpdate(item: Pick<DownloadItem, "has_tdlib_update" | "is_completed" | "downloaded_size" | "progress">): boolean {
    if (item.has_tdlib_update) return true;
    // 遗留数据：有实质进度或已完成视为已开始
    return !!item.is_completed || (item.downloaded_size ?? 0) > 0 || (item.progress ?? 0) > 0;
}

/** 取消时：无进度 = 尚未真正开下，应 only_if_pending */
function isNeverStarted(item: DownloadItem): boolean {
    return !item.is_completed && !hasTdlibUpdate(item) && (item.downloaded_size ?? 0) <= 0 && !(item.progress > 0);
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

/** TDLib 官方下载列表聚合统计（updateFileDownloads / counts） */
export interface TdlibDownloadListStats {
    total_size: number;
    total_count: number;
    downloaded_size: number;
    active_count: number;
    paused_count: number;
    completed_count: number;
}

/** 从 TDLib message 推断下载管理器展示用的文件名 */
function fileNameFromTdlibMessage(msg: Record<string, unknown> | undefined): string {
    if (!msg) return "";
    const content = msg.content as Record<string, unknown> | undefined;
    if (!content) return "";
    const msgId = typeof msg.id === "number" ? msg.id : 0;
    if (content._ === "messageDocument") {
        const doc = content.document as Record<string, unknown> | undefined;
        return (doc?.file_name as string) || `文件_${msgId}`;
    }
    if (content._ === "messageVideo") {
        const video = content.video as Record<string, unknown> | undefined;
        return (video?.file_name as string) || `video_${msgId}.mp4`;
    }
    if (content._ === "messageAudio") {
        const audio = content.audio as Record<string, unknown> | undefined;
        return (audio?.title as string) || (audio?.file_name as string) || `audio_${msgId}`;
    }
    if (content._ === "messagePhoto") return `photo_${msgId}.jpg`;
    if (content._ === "messageAnimation") return `animation_${msgId}.gif`;
    if (content._ === "messageVoiceNote") return `voice_${msgId}.ogg`;
    return "";
}

function fileTypeFromTdlibMessage(msg: Record<string, unknown> | undefined): DownloadFileType {
    const content = msg?.content as Record<string, unknown> | undefined;
    switch (content?._) {
        case "messagePhoto": return "photo";
        case "messageVideo": return "video";
        case "messageAudio": return "audio";
        case "messageVoiceNote": return "voice";
        case "messageAnimation": return "animation";
        case "messageDocument": {
            const mime = (content.document as Record<string, unknown> | undefined)?.mime_type as string | undefined;
            if (mime?.startsWith("image/")) return "photo";
            if (mime?.startsWith("video/")) return "video";
            if (mime?.startsWith("audio/")) return "audio";
            return "document";
        }
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

    /** 过滤后可见项（仅展示真正收到 TDLib update 的任务） */
    const visibleItems = computed(() =>
        allItems.value
            .filter((item) =>
                !item.dismissed
                && hasTdlibUpdate(item)
                && isItemVisibleByFilter(item as never, filterKeys.value)
            )
            .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || (b.file_id ?? 0) - (a.file_id ?? 0))
    );

    /**
     * 活跃下载（红点）：排除默认隐藏的通用资源、自动下载图片，
     * 以及未完成的流式传输（流式项只在面板独立分区展示，不计入角标）。
     * 同时排除「已注册但尚未收到 update」的空任务。
     */
    const activeItems = computed(() =>
        allItems.value.filter(
            (item) =>
                !item.is_completed &&
                !item.dismissed &&
                hasTdlibUpdate(item) &&
                !isGenericItem(item as never) &&
                !isAutoPhotoItem(item as never) &&
                !isIncompleteStreaming(item as never)
        )
    );

    const activeCount = computed(() => activeItems.value.length);

    /** 角标数字：仅统计真实「正在下载」，不含流式传输 */
    const activeDownloadingCount = computed(() =>
        activeItems.value.filter((item) => !item.is_paused).length
    );

    /** 已完成：按完成时间倒序（缺 completed_at 时回退 created_at） */
    const completedItems = computed(() =>
        visibleItems.value
            .filter((item) => item.is_completed)
            .slice()
            .sort((a, b) =>
                ((b.completed_at ?? b.created_at ?? 0) - (a.completed_at ?? a.created_at ?? 0))
                || ((b.file_id ?? 0) - (a.file_id ?? 0))
            )
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
                hasTdlibUpdate(item) &&
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
            if (!hasTdlibUpdate(i)) continue;
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
    let unlistenOther: (() => void) | null = null;
    let unlistenAuth: (() => void) | null = null;
    let unlistenStats: (() => void) | null = null;
    let tdlibListLoaded = false;
    let pendingUpdates = new Map<string, DownloadItem>();
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    /** TDLib 官方下载列表聚合统计 */
    const tdlibListStats = ref<TdlibDownloadListStats>({
        total_size: 0,
        total_count: 0,
        downloaded_size: 0,
        active_count: 0,
        paused_count: 0,
        completed_count: 0,
    });

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
            items.value[key] = {
                ...payload,
                remote_id: key,
                has_tdlib_update: true,
                completed_at: payload.completed_at
                    || (payload.is_completed ? (payload.created_at || Date.now()) : undefined),
            };
            return;
        }
        const completedBefore = !!existing.is_completed && !!existing.local_path;
        // 进度/完成事件到达 → 标记为已真正开始，才允许进列表
        if (!existing.has_tdlib_update) {
            existing.has_tdlib_update = true;
        }
        // 仅在字段真正变化时写入，避免高频 progress tick 触发无意义的响应式更新
        let dirty = false;
        if (existing.downloaded_size !== payload.downloaded_size) {
            existing.downloaded_size = payload.downloaded_size;
            dirty = true;
        }
        if (payload.total_size && existing.total_size !== payload.total_size) {
            existing.total_size = payload.total_size;
            dirty = true;
        }
        if (existing.progress !== payload.progress) {
            existing.progress = payload.progress;
            dirty = true;
        }
        if (existing.is_paused !== payload.is_paused) {
            existing.is_paused = payload.is_paused;
            dirty = true;
        }
        if (payload.is_completed !== undefined && payload.is_completed !== existing.is_completed) {
            existing.is_completed = payload.is_completed;
            dirty = true;
        }
        if (payload.has_tdlib_update) {
            existing.has_tdlib_update = true;
            dirty = true;
        }
        if (
            existing.is_completed
            && !existing.completed_at
            && (payload.completed_at || payload.created_at)
        ) {
            existing.completed_at = payload.completed_at || payload.created_at;
            dirty = true;
        } else if (payload.completed_at && payload.completed_at !== existing.completed_at) {
            existing.completed_at = payload.completed_at;
            dirty = true;
        }
        if (payload.local_path !== undefined && existing.local_path !== payload.local_path) {
            existing.local_path = payload.local_path;
            dirty = true;
        }
        if (payload.file_name !== undefined && payload.file_name !== existing.file_name) {
            existing.file_name = payload.file_name;
            dirty = true;
        }
        if (payload.chat_title !== undefined && payload.chat_title !== existing.chat_title) {
            existing.chat_title = payload.chat_title;
            dirty = true;
        }
        if (typeof payload.file_type === "string" && payload.file_type !== existing.file_type) {
            existing.file_type = payload.file_type;
            dirty = true;
        }
        if (typeof payload.chat_id === "number" && payload.chat_id !== existing.chat_id) {
            existing.chat_id = payload.chat_id;
            dirty = true;
        }
        if (typeof payload.message_id === "number" && payload.message_id !== existing.message_id) {
            existing.message_id = payload.message_id;
            dirty = true;
        }
        if (payload.thumbnail_data_url !== undefined && payload.thumbnail_data_url !== existing.thumbnail_data_url) {
            existing.thumbnail_data_url = payload.thumbnail_data_url;
            dirty = true;
        }
        if (payload.is_generic !== undefined && payload.is_generic !== existing.is_generic) {
            existing.is_generic = payload.is_generic;
            dirty = true;
        }
        if (typeof payload.hidden_category === "string" && payload.hidden_category !== existing.hidden_category) {
            existing.hidden_category = payload.hidden_category;
            dirty = true;
        }
        if (payload.is_auto_photo !== undefined && payload.is_auto_photo !== existing.is_auto_photo) {
            existing.is_auto_photo = payload.is_auto_photo;
            dirty = true;
        }
        // 流式标记只增不清：updateFile 回退条目可能带 is_streaming=false，不得覆盖已注册的 true
        if (payload.is_streaming && !existing.is_streaming) {
            existing.is_streaming = true;
            dirty = true;
        }
        if (payload.tags && payload.tags.length) {
            const prevTags = existing.tags ?? [];
            const same = payload.tags.length === prevTags.length
                && payload.tags.every((t, i) => prevTags[i] === t);
            if (!same) {
                existing.tags = payload.tags;
                dirty = true;
            }
        }
        if (payload.source_label !== undefined && payload.source_label !== existing.source_label) {
            existing.source_label = payload.source_label;
            dirty = true;
        }
        if (payload.dismissed !== undefined && payload.dismissed !== existing.dismissed) {
            existing.dismissed = payload.dismissed;
            dirty = true;
        }
        if (payload.session_file_id != null && payload.session_file_id !== existing.session_file_id) {
            existing.session_file_id = payload.session_file_id;
            dirty = true;
        }
        if (payload.file_id && payload.file_id !== existing.file_id) {
            existing.file_id = payload.file_id;
            dirty = true;
        }
        if (payload.in_tdlib_list !== undefined && existing.in_tdlib_list !== payload.in_tdlib_list) {
            existing.in_tdlib_list = payload.in_tdlib_list;
            dirty = true;
        }
        if (typeof payload.created_at === "number" && payload.created_at !== existing.created_at) {
            existing.created_at = payload.created_at;
            dirty = true;
        }
        if (!existing.remote_id) {
            existing.remote_id = key;
            dirty = true;
        }
        // 「下载完成」里程碑：替换条目引用。
        // 否则 watch(() => getDownloadInfo(id)) 因 Object.is 同引用永不回调，
        // 消息气泡会一直停在等待态（下载管理器却已显示完成）。
        const completedNow = !!existing.is_completed && !!existing.local_path;
        if (completedNow && !completedBefore) {
            items.value[key] = { ...existing };
            return;
        }
        void dirty;
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

    /**
     * 应用 TDLib 官方下载列表状态到本地条目。
     * Rust 端同步会经 download-progress-update 回写；这里兜底处理
     * other 通道上的原始 update（列表先于 updateFile 到达、调试通道等）。
     */
    function applyTdlibDownloadListState(payload: {
        fileId: number;
        isPaused?: boolean;
        completeDate?: number;
        inTdlibList?: boolean;
        fileName?: string;
        chatId?: number;
        messageId?: number;
        fileType?: DownloadFileType;
    }) {
        const key = sessionIdMap.value[payload.fileId] || `session:${payload.fileId}`;
        const existing = items.value[key];
        const completedAt = payload.completeDate && payload.completeDate > 0
            ? payload.completeDate * 1000
            : undefined;

        if (!existing) {
            if (payload.inTdlibList === false) return;
            items.value[key] = {
                remote_id: key,
                session_file_id: payload.fileId,
                file_id: payload.fileId,
                file_name: payload.fileName || `文件 #${payload.fileId}`,
                chat_title: "",
                chat_id: payload.chatId,
                message_id: payload.messageId,
                total_size: 0,
                downloaded_size: 0,
                progress: 0,
                is_paused: !!payload.isPaused,
                is_completed: false,
                file_type: payload.fileType || "other",
                is_generic: true,
                is_auto_photo: false,
                is_streaming: false,
                dismissed: false,
                created_at: Date.now(),
                completed_at: completedAt,
                has_tdlib_update: true,
                in_tdlib_list: true,
            };
            sessionIdMap.value[payload.fileId] = key;
            return;
        }

        let dirty = false;
        if (payload.isPaused !== undefined && existing.is_paused !== payload.isPaused && !existing.is_completed) {
            existing.is_paused = payload.isPaused;
            dirty = true;
        }
        if (payload.inTdlibList !== undefined && existing.in_tdlib_list !== payload.inTdlibList) {
            existing.in_tdlib_list = payload.inTdlibList;
            dirty = true;
        }
        if (!existing.has_tdlib_update) {
            existing.has_tdlib_update = true;
            dirty = true;
        }
        if (completedAt && !existing.completed_at) {
            existing.completed_at = completedAt;
            dirty = true;
        }
        if (payload.completeDate && payload.completeDate > 0 && existing.local_path) {
            if (!existing.is_completed) {
                existing.is_completed = true;
                existing.is_paused = false;
                if (existing.total_size > 0) {
                    existing.downloaded_size = existing.total_size;
                    existing.progress = 1;
                }
                dirty = true;
            }
        }
        if (payload.fileName && (existing.file_name.startsWith("文件 #") || !existing.file_name)) {
            existing.file_name = payload.fileName;
            dirty = true;
        }
        if (payload.chatId != null && existing.chat_id == null) {
            existing.chat_id = payload.chatId;
            dirty = true;
        }
        if (payload.messageId != null && existing.message_id == null) {
            existing.message_id = payload.messageId;
            dirty = true;
        }
        if (payload.fileType && existing.file_type !== payload.fileType) {
            existing.file_type = payload.fileType;
            dirty = true;
        }
        // 移出 TDLib 列表且无进度：本地 dismiss，避免幽灵任务
        if (payload.inTdlibList === false && !existing.is_completed) {
            const neverStarted = (existing.downloaded_size ?? 0) <= 0
                && !(existing.progress > 0)
                && !existing.local_path;
            if (neverStarted) {
                existing.dismissed = true;
                dirty = true;
            }
        }
        // 完成里程碑：替换引用，让依赖 getDownloadInfo 的 watch 收到回调
        const completedNow = !!existing.is_completed && !!existing.local_path;
        if (completedNow && dirty) {
            items.value[key] = { ...existing };
            return;
        }
        void dirty;
    }

    function applyTdlibCounts(counts: Record<string, unknown> | undefined) {
        if (!counts) return;
        const num = (k: string) => typeof counts[k] === "number" ? counts[k] as number : 0;
        tdlibListStats.value = {
            ...tdlibListStats.value,
            active_count: num("active_count"),
            paused_count: num("paused_count"),
            completed_count: num("completed_count"),
        };
    }

    function applyTdlibListTotals(update: Record<string, unknown>) {
        const num = (k: string) => typeof update[k] === "number" ? update[k] as number : 0;
        tdlibListStats.value = {
            ...tdlibListStats.value,
            total_size: num("total_size"),
            total_count: num("total_count"),
            downloaded_size: num("downloaded_size"),
        };
    }

    /** 处理 other 通道上的 TDLib download-list update */
    function handleDownloadListUpdate(update: Record<string, unknown>) {
        switch (update._) {
            case "updateFileDownload": {
                const fileId = update.file_id as number | undefined;
                if (typeof fileId !== "number") return;
                applyTdlibDownloadListState({
                    fileId,
                    isPaused: !!update.is_paused,
                    completeDate: typeof update.complete_date === "number" ? update.complete_date : 0,
                    inTdlibList: true,
                });
                applyTdlibCounts(update.counts as Record<string, unknown> | undefined);
                break;
            }
            case "updateFileAddedToDownloads": {
                const fd = update.file_download as Record<string, unknown> | undefined;
                if (!fd || typeof fd.file_id !== "number") return;
                const msg = fd.message as Record<string, unknown> | undefined;
                applyTdlibDownloadListState({
                    fileId: fd.file_id,
                    isPaused: !!fd.is_paused,
                    completeDate: typeof fd.complete_date === "number" ? fd.complete_date : 0,
                    inTdlibList: true,
                    fileName: fileNameFromTdlibMessage(msg) || undefined,
                    chatId: typeof msg?.chat_id === "number" ? msg.chat_id : undefined,
                    messageId: typeof msg?.id === "number" ? msg.id : undefined,
                    fileType: fileNameFromTdlibMessage(msg) ? fileTypeFromTdlibMessage(msg) : undefined,
                });
                applyTdlibCounts(update.counts as Record<string, unknown> | undefined);
                break;
            }
            case "updateFileRemovedFromDownloads": {
                const fileId = update.file_id as number | undefined;
                if (typeof fileId !== "number") return;
                applyTdlibDownloadListState({
                    fileId,
                    inTdlibList: false,
                });
                applyTdlibCounts(update.counts as Record<string, unknown> | undefined);
                break;
            }
            case "updateFileDownloads": {
                applyTdlibListTotals(update);
                break;
            }
        }
    }

    /**
     * 拉取一次 TDLib 下载列表。
     * TDLib 文档：updateFileAddedToDownloads / updateFileDownload /
     * updateFileRemovedFromDownloads 仅在下载列表首次加载后才会推送。
     */
    async function loadTdlibDownloadList() {
        if (tdlibListLoaded) return;
        tdlibListLoaded = true;
        try {
            const result = await invoke("tdlib_send", {
                request: {
                    _: "searchFileDownloads",
                    query: "",
                    limit: 100,
                    offset: "",
                },
            }) as { _?: string; files?: Array<Record<string, unknown>>; total_counts?: Record<string, unknown> } | undefined;
            if (result?._ !== "foundFileDownloads") return;
            applyTdlibCounts(result.total_counts);
            for (const fd of result.files ?? []) {
                if (typeof fd.file_id !== "number") continue;
                const msg = fd.message as Record<string, unknown> | undefined;
                applyTdlibDownloadListState({
                    fileId: fd.file_id,
                    isPaused: !!fd.is_paused,
                    completeDate: typeof fd.complete_date === "number" ? fd.complete_date : 0,
                    inTdlibList: true,
                    fileName: fileNameFromTdlibMessage(msg) || undefined,
                    chatId: typeof msg?.chat_id === "number" ? msg.chat_id : undefined,
                    messageId: typeof msg?.id === "number" ? msg.id : undefined,
                    fileType: fileNameFromTdlibMessage(msg) ? fileTypeFromTdlibMessage(msg) : undefined,
                });
            }
        } catch (e) {
            // 授权未就绪 / 网络错误：下次 auth ready 会再试
            tdlibListLoaded = false;
            console.warn("searchFileDownloads failed:", e);
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
        // TDLib 官方下载列表 update（低频，走 other 通道）
        if (!unlistenOther) {
            unlistenOther = onTdlibUpdate("other", (update) => {
                handleDownloadListUpdate(update as Record<string, unknown>);
            });
        }
        // 授权就绪后加载下载列表，激活 updateFileDownload* 推送
        if (!unlistenAuth) {
            unlistenAuth = onTdlibUpdate("auth", (update) => {
                const st = (update as { authorization_state?: { _?: string } }).authorization_state?._;
                if (st === "authorizationStateReady") {
                    void loadTdlibDownloadList();
                }
            });
        }
        // Rust 侧聚合统计事件（可选增强，与 other 通道并存）
        if (!unlistenStats) {
            unlistenStats = await listen<Record<string, unknown>>("tdlib-download-list-stats", (event) => {
                if (event.payload) applyTdlibListTotals(event.payload);
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
        if (unlistenOther) {
            unlistenOther();
            unlistenOther = null;
        }
        if (unlistenAuth) {
            unlistenAuth();
            unlistenAuth = null;
        }
        if (unlistenStats) {
            unlistenStats();
            unlistenStats = null;
        }
    }

    /**
     * UI 发起 addFileToDownloads 成功后标记：该文件在 TDLib 官方下载列表中。
     * cancel 时据此调用 removeFileFromDownloads，避免重启后续传。
     */
    function markInTdlibList(fileId: number, chatId?: number, messageId?: number) {
        const key = sessionIdMap.value[fileId]
            || items.value[`session:${fileId}`]?.remote_id
            || `session:${fileId}`;
        const existing = items.value[key] || items.value[`session:${fileId}`];
        if (existing) {
            if (!existing.in_tdlib_list || existing.chat_id == null || existing.message_id == null) {
                existing.in_tdlib_list = true;
                if (chatId != null && existing.chat_id == null) existing.chat_id = chatId;
                if (messageId != null && existing.message_id == null) existing.message_id = messageId;
            }
            sessionIdMap.value[fileId] = existing.remote_id || key;
            return;
        }
        items.value[`session:${fileId}`] = {
            remote_id: `session:${fileId}`,
            session_file_id: fileId,
            file_id: fileId,
            file_name: `文件 #${fileId}`,
            chat_title: "",
            chat_id: chatId,
            message_id: messageId,
            total_size: 0,
            downloaded_size: 0,
            progress: 0,
            is_paused: false,
            is_completed: false,
            file_type: "other",
            is_generic: false,
            is_auto_photo: false,
            is_streaming: false,
            dismissed: false,
            created_at: Date.now(),
            has_tdlib_update: false,
            in_tdlib_list: true,
        };
        sessionIdMap.value[fileId] = `session:${fileId}`;
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
            // 重复注册（组件重挂载/列表复用）不得把已完成/进行中状态清零：
            // TDLib 对已完成文件不会再推 updateFile，一旦重置就会永远停在「正在下载」。
            const existing = items.value[rid];
            if (existing) {
                // 已完成且路径有效：不整对象替换，避免角标/列表计算无意义重算导致递归更新
                if (existing.is_completed && existing.local_path) {
                    if (existing.session_file_id !== fileId || existing.file_id !== fileId) {
                        // 仅刷新 session 绑定
                        items.value[rid] = {
                            ...existing,
                            session_file_id: fileId,
                            file_id: fileId,
                        };
                    }
                    sessionIdMap.value[fileId] = rid;
                    return;
                }
                const nextStreaming = existing.is_streaming || (isStreaming ?? false);
                const nextTags = finalTags.length ? finalTags : (existing.tags ?? []);
                const prevTags = existing.tags ?? [];
                const tagsSame = nextTags.length === prevTags.length
                    && nextTags.every((t, i) => prevTags[i] === t);
                // 未完成：仅在元数据有变化时替换引用
                if (
                    fileName !== existing.file_name
                    || (chatTitle && chatTitle !== existing.chat_title)
                    || (totalSize && totalSize !== existing.total_size)
                    || nextStreaming !== existing.is_streaming
                    || !tagsSame
                    || existing.session_file_id !== fileId
                    || existing.file_id !== fileId
                    || generic !== existing.is_generic
                ) {
                    items.value[rid] = {
                        ...existing,
                        remote_id: rid,
                        session_file_id: fileId,
                        file_id: fileId,
                        file_name: fileName || existing.file_name,
                        chat_title: chatTitle || existing.chat_title,
                        total_size: totalSize || existing.total_size,
                        file_type: (fileType || existing.file_type) as DownloadFileType,
                        thumbnail_data_url:
                            thumbnailDataUrl !== undefined ? thumbnailDataUrl : existing.thumbnail_data_url,
                        is_generic: generic,
                        hidden_category: category ?? existing.hidden_category,
                        is_auto_photo: isAutoPhoto ?? existing.is_auto_photo,
                        is_streaming: nextStreaming,
                        tags: nextTags,
                        source_label: sourceLabel ?? existing.source_label,
                        chat_id: chatId || existing.chat_id,
                        message_id: messageId || existing.message_id,
                        // 保留进度/完成态/本地路径，不因重复注册回退
                        downloaded_size: existing.downloaded_size,
                        progress: existing.progress,
                        is_paused: existing.is_paused,
                        is_completed: existing.is_completed,
                        local_path: existing.local_path,
                        dismissed: existing.dismissed,
                        created_at: existing.created_at || Date.now(),
                    };
                }
            } else {
                items.value[rid] = {
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
                    // 尚未收到 TDLib update：不进下载列表/角标，避免空进度任务
                    has_tdlib_update: false,
                    completed_at: undefined,
                    in_tdlib_list: false,
                };
            }
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
        // 已是同一完成态：不再替换引用，避免角标计算递归触发更新
        if (item.is_completed && item.local_path === localPath) return;
        const now = Date.now();
        // 替换引用，保证依赖 getDownloadInfo 的 watch 能收到完成事件
        items.value[key] = {
            ...item,
            local_path: localPath,
            is_completed: true,
            progress: 1,
            has_tdlib_update: true,
            completed_at: item.completed_at || now,
            downloaded_size: item.total_size > 0 ? item.total_size : item.downloaded_size,
        };
    }

    /**
     * 内容快照 / TDLib File 已就绪时，把 store 中同文件的未完成条目对账为已完成。
     * 用于修复「本地文件已下载完成，但下载管理器/气泡仍显示正在下载」。
     */
    function reconcileFromFile(
        file: { id?: number; local?: { path?: string; is_downloading_completed?: boolean } } | null | undefined,
    ): boolean {
        if (!file) return false;
        const path = file.local?.path;
        const ready = !!(file.local?.is_downloading_completed && path);
        if (!ready || !path) return false;
        const info = getDownloadInfoForFile(file);
        if (!info || info.is_completed) return false;
        markCompleted(info.session_file_id ?? info.file_id ?? file.id ?? 0, path, info.remote_id || remoteIdOf(file));
        return true;
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

    /**
     * 将文件从 TDLib 官方下载列表移除。
     * 用户手动下载走 addFileToDownloads：若只 cancelDownloadFile 不 remove，
     * TDLib 会在重启后继续续传该文件。
     */
    async function removeFromTdlibDownloadList(fileId: number) {
        if (!fileId) return;
        try {
            await invoke("tdlib_send", {
                request: {
                    _: "removeFileFromDownloads",
                    file_id: fileId,
                    delete_from_cache: false,
                },
            });
        } catch (e) {
            // 不在列表中 / TDLib 未就绪：忽略
            console.warn("removeFileFromDownloads failed:", e);
        }
    }

    async function cancelDownload(fileId: number | string) {
        const item = getItemByKey(fileId);
        if (!item) return;
        const sid = sessionFileId(item);
        // 无下载进度 = 尚未真正开下：only_if_pending=true，只取消排队中的请求
        const onlyIfPending = isNeverStarted(item);
        try {
            await invoke("tdlib_send", {
                request: {
                    _: "cancelDownloadFile",
                    file_id: sid,
                    only_if_pending: onlyIfPending,
                },
            });
            // 在 TDLib 下载列表中的任务必须一并移除，否则重启后会自动续传
            if (item.in_tdlib_list !== false) {
                await removeFromTdlibDownloadList(sid);
            }
            await dismissItem(item.remote_id || sid);
        } catch (e) {
            console.error("cancelDownloadFile failed:", e);
        }
    }

    async function cancelAllDownloads() {
        const pending = allItems.value.filter(
            (item) => !item.is_completed && !item.dismissed && hasTdlibUpdate(item),
        );
        // 未收到 update 的注册项：仅本地 dismiss，不必调 TDLib
        for (const item of allItems.value) {
            if (item.is_completed || item.dismissed || hasTdlibUpdate(item)) continue;
            await dismissItem(item.remote_id || sessionFileId(item));
        }
        for (const item of pending) {
            const onlyIfPending = isNeverStarted(item);
            const sid = sessionFileId(item);
            try {
                await invoke("tdlib_send", {
                    request: {
                        _: "cancelDownloadFile",
                        file_id: sid,
                        only_if_pending: onlyIfPending,
                    },
                });
                if (item.in_tdlib_list !== false) {
                    await removeFromTdlibDownloadList(sid);
                }
                await dismissItem(item.remote_id || sid);
            } catch (e) {
                console.error("cancelDownloadFile failed for", item.remote_id, e);
            }
        }
        // 兜底：清空 TDLib 侧活跃下载列表，防止遗漏条目重启后续传
        try {
            await invoke("tdlib_send", {
                request: {
                    _: "removeAllFilesFromDownloads",
                    only_active: true,
                    only_completed: false,
                    delete_from_cache: false,
                },
            });
        } catch (e) {
            console.warn("removeAllFilesFromDownloads failed:", e);
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
        tdlibListStats,
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
        loadTdlibDownloadList,
        registerDownload,
        markInTdlibList,
        getProgress,
        markCompleted,
        reconcileFromFile,
        getDownloadInfo,
        getDownloadInfoForFile,
        getCompletedPathForFile,
        hasTdlibUpdate,
        togglePause,
        cancelDownload,
        cancelAllDownloads,
        removeFromTdlibDownloadList,
        dismissItem,
        clearCompleted,
        toggleShowHidden,
        toggleShowAutoPhotos,
        resolveKey,
        sessionFileId,
    };
});
