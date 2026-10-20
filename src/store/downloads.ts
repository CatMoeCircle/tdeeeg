import { defineStore } from "pinia";
import { ref, computed, reactive, toRaw } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DL_PRIORITY } from "../utils/downloadPriority";
import i18n from "../i18n";
import {
    DL_TAG,
    FILTER_KEY,
    DEFAULT_FILTER_KEYS,
    FILTER_OPTIONS,
    GENERIC_TAGS,
    buildDownloadTags,
    resolveItemTags,
    isGenericItem,
    isAutoPhotoItem,
    isAutoVideoItem,
    isIncompleteStreaming,
    isItemVisibleByFilter,
    tagChipClass,
    tagLabel,
} from "../utils/downloadTags";

export { DL_TAG, FILTER_KEY, FILTER_OPTIONS, resolveItemTags, tagChipClass, tagLabel };
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
 *
 * 优先 file.remote.unique_id：它不含 file_reference，同一文件跨刷新/跨对话恒定。
 * 退回 file.remote.id：里面编码了 file_reference，TDLib 刷新后会变（官方文档明确
 * 「同一文件可以有很多个有效的 remote.id」），仅作兜底。再退回 session:<file_id>。
 */
export function remoteIdOf(file: { id?: number; remote?: { id?: string; unique_id?: string } } | null | undefined): string {
    const uid = file?.remote?.unique_id;
    if (uid && uid.length > 0) return uid;
    const rid = file?.remote?.id;
    if (rid && rid.length > 0) return rid;
    if (typeof file?.id === "number") return `session:${file.id}`;
    return "";
}

/** Rust 端 DownloadItem 的序列化结构 */
export interface DownloadItem {
    /** 稳定主键：file.remote.unique_id（含 file_reference 的 remote.id 会刷新，仅兜底） */
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
    /** 溯源：来源类型（sticker_set / user / chat） */
    source_kind?: string;
    /** 溯源目标 id（贴纸集 id / user id / chat id） */
    source_id?: number;
}

/**
 * Rust 端 `get_downloads` 分页快照。
 *
 * `active` 是全部未完成条目（分区与角标依赖完整集合），`completed` 是已完成区的一页，
 * `completed_total` 是当前过滤条件下已完成的条数（判断还有没有下一页 / 分区计数）。
 */
export interface DownloadsPage {
    active: DownloadItem[];
    completed: DownloadItem[];
    completed_total: number;
}

/**
 * 拆进度事件载荷：单条 `DownloadItem`，或 Rust 侧合并后的 `{ updates: [...] }` 批次。
 *
 * 批量下载时闸门把同一窗口内多个文件、多个通道各合成一条事件（Tauri 每条事件都会让
 * 渲染进程编译一段新脚本），这里拆回逐条，消费侧行为与「每条一个」时完全一致。
 */
export function progressBatch<T>(payload: T | { updates?: T[] } | null | undefined): T[] {
    if (!payload) return [];
    const batch = (payload as { updates?: T[] }).updates;
    if (Array.isArray(batch)) return batch;
    return [payload as T];
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

/** trackDownloadFile / reconcileFromFile 的可选展示元数据 */
export interface TrackFileMeta {
    fileName?: string;
    chatTitle?: string;
    chatId?: number;
    messageId?: number;
    fileType?: DownloadFileType;
    isGeneric?: boolean;
    hiddenCategory?: string;
    isStreaming?: boolean;
    tags?: string[];
    sourceLabel?: string;
}

/** 隐藏分类 → 标签 ID（展示时经 tagLabel 转 i18n） */
const HIDDEN_CATEGORY_LABELS: Record<HiddenCategory, string> = {
    emoji: DL_TAG.EMOJI,
    video_cover: DL_TAG.VIDEO_COVER,
    avatar: DL_TAG.AVATAR,
    story_cover: DL_TAG.STORY_COVER,
    sticker: DL_TAG.STICKER,
    gift: DL_TAG.GIFT,
    music_cover: DL_TAG.MUSIC_COVER,
    other: DL_TAG.THUMB,
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

/** 是否为自动生成的占位文件名（真实文件名到达时应替换） */
function isPlaceholderFileName(name: string | undefined): boolean {
    if (!name) return true;
    // i18n 兜底名形如 "File #123" / "文件 #123"（任意语言），历史数据为 "文件 #123" / "文件_123"
    return /#\d+$/.test(name) || /^文件_\d+$/.test(name);
}

/** 同一文件的探针（内容身份：类型 + 文件名 + 大小），与 Rust 端 content_key 对齐 */
interface SameFileProbe {
    file_type?: string;
    file_name?: string;
    total_size?: number;
}

/**
 * 两个条目是否指向同一个文件内容。
 *
 * 历史条目以旧 remote.id 为键（含 file_reference，刷新后会变），同一文件因此会留下
 * 多行；这些老行没有稳定身份，只能按内容身份认亲。占位名与大小为 0 的一律不认，
 * 避免把「文件 #12」这类空壳互相合并。
 */
function isSameFileRecord(item: DownloadItem | undefined, probe: SameFileProbe): boolean {
    if (!item || item.dismissed) return false;
    const name = probe.file_name;
    const size = probe.total_size ?? 0;
    if (!name || size <= 0 || isPlaceholderFileName(name)) return false;
    return item.file_type === probe.file_type
        && item.file_name === name
        && item.total_size === size;
}

/** 把同一文件的另一条记录并入 dst（进度/完成态取更完整的一份，标签并集） */
function mergeRecords(dst: DownloadItem, src: DownloadItem): DownloadItem {
    const dstHasPath = !!dst.local_path;
    const srcHasPath = !!src.local_path;
    const next: DownloadItem = { ...dst };
    if ((src.total_size ?? 0) > (next.total_size ?? 0)) next.total_size = src.total_size;
    if ((src.downloaded_size ?? 0) > (next.downloaded_size ?? 0)) next.downloaded_size = src.downloaded_size;
    if ((src.progress ?? 0) > (next.progress ?? 0)) next.progress = src.progress;
    if (srcHasPath && (!dstHasPath || (src.is_completed && !dst.is_completed))) {
        next.local_path = src.local_path;
    }
    if (src.is_completed && (!next.is_completed || !dstHasPath)) next.is_completed = true;
    if ((src.completed_at ?? 0) > (next.completed_at ?? 0)) next.completed_at = src.completed_at;
    if (!next.created_at || (src.created_at && src.created_at < next.created_at)) {
        next.created_at = src.created_at;
    }
    next.in_tdlib_list = !!(next.in_tdlib_list || src.in_tdlib_list);
    next.has_tdlib_update = !!(next.has_tdlib_update || src.has_tdlib_update);
    // 流式标记只增不清
    next.is_streaming = !!(next.is_streaming || src.is_streaming);
    if (src.tags?.length) {
        const merged = [...(next.tags ?? [])];
        for (const tag of src.tags) if (!merged.includes(tag)) merged.push(tag);
        next.tags = merged;
    }
    if (!next.file_name || (isPlaceholderFileName(next.file_name) && !isPlaceholderFileName(src.file_name))) {
        next.file_name = src.file_name;
    }
    if (!next.chat_title) next.chat_title = src.chat_title;
    if (next.chat_id == null) next.chat_id = src.chat_id;
    if (next.message_id == null) next.message_id = src.message_id;
    if (!next.thumbnail_data_url) next.thumbnail_data_url = src.thumbnail_data_url;
    if (!next.source_label) next.source_label = src.source_label;
    if (!next.source_kind && src.source_kind) {
        next.source_kind = src.source_kind;
        next.source_id = src.source_id;
    }
    if (next.file_type === "other" && next.is_generic) {
        next.file_type = src.file_type;
        next.is_generic = src.is_generic;
        next.hidden_category = src.hidden_category;
        next.is_auto_photo = src.is_auto_photo;
    }
    if ((src.session_file_id ?? 0) > (next.session_file_id ?? 0)) {
        next.session_file_id = src.session_file_id;
        if (src.file_id) next.file_id = src.file_id;
    }
    next.dismissed = next.dismissed && src.dismissed;
    if (next.is_completed) {
        next.is_paused = false;
        if (next.total_size > 0) {
            next.downloaded_size = next.total_size;
            next.progress = 1;
        }
        if (!next.completed_at) next.completed_at = next.created_at || Date.now();
    }
    return next;
}

/** 从 TDLib message 推断下载管理器展示用的文件名 */
function fileNameFromTdlibMessage(msg: Record<string, unknown> | undefined): string {
    if (!msg) return "";
    const content = msg.content as Record<string, unknown> | undefined;
    if (!content) return "";
    const msgId = typeof msg.id === "number" ? msg.id : 0;
    if (content._ === "messageDocument") {
        const doc = content.document as Record<string, unknown> | undefined;
        return (doc?.file_name as string) || i18n.global.t("download.row.fileFallback", { id: msgId });
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

    /**
     * 数据版本号：条目表 / 会话映射的**任何**变化（新增、删除、字段写回）都 +1。
     *
     * 为什么需要：条目量可达数千（实测 8394）。全表聚合与热路径扫描若逐条读响应式
     * 条目，会为每条各走一次 Proxy（实测 8000 条：Object.values 7.5ms、全表过滤
     * 9.5ms），而 registerDownload/trackDownloadFile 每次都全表扫一遍 → 批量下载时
     * 每次都撞出长任务。
     *
     * 现在改成：
     *   - 全表只依赖这一个版本号（不再逐条进响应式依赖）；
     *   - 扫描在 toRaw() 的原始表上做（实测快约 4 倍，2.5ms）；
     *   - 返回给模板的条目再包回 reactive()，进度条等字段级更新语义不变。
     * 写入路径统一调 touch()；新增写入点时务必一并调用，否则聚合列表不会刷新。
     */
    const revision = ref(0);
    function touch() { revision.value++; }

    /** 标签过滤器已启用集合（默认隐藏通用资源与自动下载图片） */
    const filterKeys = ref<Set<string>>(new Set(DEFAULT_FILTER_KEYS));

    function setFilterKey(key: string, enabled: boolean) {
        const before = completedFilterKey();
        const next = new Set(filterKeys.value);
        if (enabled) next.add(key);
        else next.delete(key);
        filterKeys.value = next;
        try {
            localStorage.setItem("tdgram_dl_filters", JSON.stringify([...next]));
        } catch { /* ignore */ }
        // 已完成区的过滤在 Rust 侧做（否则每页几乎全是头像/贴纸），开关一变就得重取第一页
        if (isPanelOpen.value && completedFilterKey() !== before) void loadCompletedPage(true);
    }

    function resetFilters() {
        const before = completedFilterKey();
        filterKeys.value = new Set(DEFAULT_FILTER_KEYS);
        try { localStorage.removeItem("tdgram_dl_filters"); } catch { /* ignore */ }
        if (isPanelOpen.value && completedFilterKey() !== before) void loadCompletedPage(true);
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
     * 因此必须优先用稳定键（file.remote.unique_id，退回 remote.id）查找；历史条目可能
     * 仍挂在旧 remote.id 键上，故再试一次原始 remote.id。按 session id 回退时，
     * 仅当映射到的条目与本文件的稳定键一致才接受，否则视为 id 复用冲突。
     */
    function getDownloadInfoForFile(
        file: { id?: number; remote?: { id?: string; unique_id?: string } } | null | undefined,
    ): DownloadItem | undefined {
        if (!file) return undefined;
        const canonical = remoteIdOf(file);
        if (canonical && !canonical.startsWith("session:")) {
            const byKey = items.value[canonical];
            if (byKey) return byKey;
            const rawRemoteId = file.remote?.id;
            if (rawRemoteId && rawRemoteId !== canonical) {
                const byRaw = items.value[rawRemoteId];
                if (byRaw) return byRaw;
            }
            if (typeof file.id !== "number") return undefined;
            const mapped = items.value[sessionIdMap.value[file.id] || `session:${file.id}`];
            if (!mapped) return undefined;
            // session 映射指向其他文件 → file.id 被复用，不得当作本文件
            if (mapped.remote_id && mapped.remote_id !== canonical && mapped.remote_id !== rawRemoteId) {
                return undefined;
            }
            return mapped;
        }
        if (typeof file.id === "number") return getItemByKey(file.id);
        return undefined;
    }

    /** 读取某 File 的已完成本地路径；稳定身份不匹配时返回空串，避免串媒体 */
    function getCompletedPathForFile(
        file: { id?: number; remote?: { id?: string; unique_id?: string } } | null | undefined,
    ): string {
        const info = getDownloadInfoForFile(file);
        return info?.is_completed && info.local_path ? info.local_path : "";
    }

    /**
     * 全部条目（原始对象）。
     * 唯一依赖是 revision：条目增删/字段写回都会让它失效，但不再逐条建立 Proxy 依赖。
     */
    const allItems = computed(() => {
        void revision.value;
        return Object.values(toRaw(items.value));
    });

    /** 过滤 + 排序后的可见项（原始对象，供下方分区复用） */
    const visibleRaw = computed(() =>
        allItems.value
            .filter((item) =>
                !item.dismissed
                && hasTdlibUpdate(item)
                && isItemVisibleByFilter(item as never, filterKeys.value)
            )
            .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || (b.file_id ?? 0) - (a.file_id ?? 0))
    );

    /**
     * 一次遍历把可见项分到各分区。
     *
     * 原来是每个分区各自 filter 一遍 visibleItems：面板打开时 6 个 computed 各扫
     * 全表一遍（实测 8000 条合计 ~110ms）。这里合并成单次扫描。
     */
    const visibleGroups = computed(() => {
        const completed: DownloadItem[] = [];
        const pending: DownloadItem[] = [];
        const downloading: DownloadItem[] = [];
        const paused: DownloadItem[] = [];
        const streaming: DownloadItem[] = [];
        for (const item of visibleRaw.value) {
            if (item.is_completed) {
                completed.push(item);
                continue;
            }
            pending.push(item);
            if (isIncompleteStreaming(item as never)) streaming.push(item);
            else if (item.is_paused) paused.push(item);
            else downloading.push(item);
        }
        // 已完成：按完成时间倒序（缺 completed_at 时回退 created_at）
        completed.sort((a, b) =>
            ((b.completed_at ?? b.created_at ?? 0) - (a.completed_at ?? a.created_at ?? 0))
            || ((b.file_id ?? 0) - (a.file_id ?? 0))
        );
        return { completed, pending, downloading, paused, streaming };
    });

    /** 交回模板的条目重新包成响应式：DownloadRow 直接读 item.progress 等字段 */
    const asReactiveItems = (list: DownloadItem[]) => list.map((item) => reactive(item));

    /** 过滤后可见项（仅展示真正收到 TDLib update 的任务） */
    const visibleItems = computed(() => asReactiveItems(visibleRaw.value));

    /**
     * 活跃下载（红点）：排除默认隐藏的通用资源、自动下载图片，
     * 以及未完成的流式传输（流式项只在面板独立分区展示，不计入角标）。
     * 同时排除「已注册但尚未收到 update」的空任务。
     */
    const activeItems = computed(() =>
        asReactiveItems(allItems.value.filter(
            (item) =>
                !item.is_completed &&
                !item.dismissed &&
                hasTdlibUpdate(item) &&
                !isGenericItem(item as never) &&
                !isAutoPhotoItem(item as never) &&
                !isIncompleteStreaming(item as never)
        ))
    );

    const activeCount = computed(() => activeItems.value.length);

    /** 角标数字：仅统计真实「正在下载」，不含流式传输 */
    const activeDownloadingCount = computed(() =>
        activeItems.value.filter((item) => !item.is_paused).length
    );

    /** 已完成：按完成时间倒序（缺 completed_at 时回退 created_at） */
    const completedItems = computed(() => asReactiveItems(visibleGroups.value.completed));

    const pendingItems = computed(() => asReactiveItems(visibleGroups.value.pending));

    /** 正在下载：未完成、未暂停、且不是「未完成流式传输」 */
    const downloadingItems = computed(() => asReactiveItems(visibleGroups.value.downloading));

    /** 已暂停：未完成、已暂停、且不是流式传输未完成项 */
    const pausedItems = computed(() => asReactiveItems(visibleGroups.value.paused));

    /** 流式传输中（未完成）：独立可折叠分区，不进已暂停 */
    const streamingItems = computed(() => asReactiveItems(visibleGroups.value.streaming));

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

    /**
     * session:<id> → 稳定键迁移。
     * TDLib file.id 会话内可能复用；稳定 id 就绪后必须把旧条目并入稳定键，
     * 否则后续 updateFile 按稳定键查不到，进度/完成态永远写不进去。
     */
    function migrateToRemoteKey(sessionFileId: number, remoteId: string): string {
        if (!remoteId || remoteId.length === 0) return `session:${sessionFileId}`;
        const oldKey = sessionIdMap.value[sessionFileId] || `session:${sessionFileId}`;
        if (oldKey === remoteId) return remoteId;
        const old = items.value[oldKey];
        if (old && oldKey !== remoteId) {
            const target = items.value[remoteId];
            const merged: DownloadItem = target
                ? mergeRecords(target, old)
                : { ...old, remote_id: remoteId };
            merged.remote_id = remoteId;
            merged.session_file_id = sessionFileId;
            merged.file_id = sessionFileId;
            // 保留原 has_tdlib_update：register 迁移不能把「未开下」标成已开始
            merged.has_tdlib_update = !!(merged.has_tdlib_update || old.has_tdlib_update);
            delete items.value[oldKey];
            items.value[remoteId] = merged;
            reindexKey(oldKey, remoteId);
        }
        sessionIdMap.value[sessionFileId] = remoteId;
        touch();
        return remoteId;
    }

    /** 键改名后同步 session 映射，避免按 file.id 查到已删除的键 */
    function reindexKey(from: string, to: string) {
        // 原始表遍历：sessionIdMap 可达数千条，走响应式代理会为每条建一次 Proxy
        const raw = toRaw(sessionIdMap.value);
        for (const sid in raw) {
            if (raw[sid] === from) sessionIdMap.value[Number(sid)] = to;
        }
    }

    /**
     * 同一文件的历史条目收编到稳定键。
     *
     * 旧版本的键是 remote.id（含 file_reference），TDLib 刷新后同一文件换了 id，
     * 旧条目就留成了第二行。这里按内容身份（类型+名字+大小）认亲并合入当前键，
     * 与 Rust 端 register_download 的收编逻辑对齐。
     */
    function adoptSameFileRow(key: string, probe: SameFileProbe): DownloadItem | undefined {
        if (!key || key.startsWith("session:") || key.startsWith("legacy:")) return undefined;
        // 探针本身不成立（占位名 / 大小未知）时不可能认亲，直接跳过全表扫描
        if (!probe.file_name || (probe.total_size ?? 0) <= 0 || isPlaceholderFileName(probe.file_name)) {
            return undefined;
        }
        // 在原始表上扫描：这条路径每次 registerDownload/trackDownloadFile 都会走，
        // 逐条读响应式条目会给全表（数千条）各建一次 Proxy（实测 8000 条 ~9ms/次）
        const raw = toRaw(items.value);
        const staleKeys = Object.keys(raw).filter(
            (k) => k !== key && isSameFileRecord(raw[k], probe),
        );
        if (staleKeys.length === 0) return undefined;
        let merged: DownloadItem | undefined = items.value[key];
        for (const staleKey of staleKeys) {
            const stale = items.value[staleKey];
            delete items.value[staleKey];
            merged = merged ? mergeRecords(merged, stale) : { ...stale, remote_id: key };
            reindexKey(staleKey, key);
        }
        if (merged) items.value[key] = merged;
        touch();
        return merged;
    }

    function applyItem(payload: DownloadItem) {
        // 先做 session→稳定键迁移，避免旧 session 键条目与新稳定键并存
        const sid = payload.session_file_id ?? payload.file_id;
        const rid = payload.remote_id;
        if (rid && rid.length > 0 && !rid.startsWith("session:") && !rid.startsWith("legacy:") && sid) {
            migrateToRemoteKey(sid, rid);
        }
        const key = indexSession(payload);
        const existing = items.value[key];
        if (!existing) {
            // Rust 端收编的历史行不会有「删除」事件，这里按内容身份同步一次
            const adopted = adoptSameFileRow(key, payload);
            const fresh: DownloadItem = {
                ...payload,
                remote_id: key,
                has_tdlib_update: true,
                completed_at: payload.completed_at
                    || (payload.is_completed ? (payload.created_at || Date.now()) : undefined),
            };
            items.value[key] = adopted ? mergeRecords(fresh, adopted) : fresh;
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
            touch();
        }
    }

    function scheduleUpdate(item: DownloadItem) {
        const key = item.remote_id || resolveKey(item.session_file_id ?? item.file_id);
        pendingUpdates.set(key, item);
        if (throttleTimer === null) {
            throttleTimer = setTimeout(flushPendingUpdates, 0);
        }
    }

    /** 面板关闭时判断该条目是否已被当前页面注册（items 中已有行） */
    function hasTrackedItem(item: DownloadItem): boolean {
        if (item.remote_id && items.value[item.remote_id]) return true;
        const sid = item.session_file_id ?? item.file_id;
        if (sid != null) {
            const mapped = sessionIdMap.value[sid];
            if (mapped && items.value[mapped]) return true;
            if (items.value[`session:${sid}`]) return true;
        }
        return false;
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
                file_name: payload.fileName || i18n.global.t("download.row.fileFallback", { id: payload.fileId }),
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
            touch();
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
        if (payload.fileName && (isPlaceholderFileName(existing.file_name) || !existing.file_name)) {
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
            touch();
            return;
        }
        if (dirty) touch();
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
        if (!unlistenProgress) {
            unlistenProgress = await listen<DownloadItem | { updates: DownloadItem[] }>("download-progress-update", (event) => {
                // 同一窗口内多个文件的进度合成一条事件，逐条处理（语义与单条事件相同）
                for (const item of progressBatch(event.payload)) {
                    if (!item) continue;
                    // 面板关闭：列表由 Rust 权威记账（打开面板时快照读取），
                    // 前端只回写当前页面已注册条目的进度（消息内进度条/完成态）
                    if (!isPanelOpen.value) {
                        scheduleBadgeRefresh();
                        if (!hasTrackedItem(item)) continue;
                    }
                    scheduleUpdate(item);
                }
            });
        }
        // Rust 侧聚合统计事件（可选增强，与 other 通道并存）
        if (!unlistenStats) {
            unlistenStats = await listen<Record<string, unknown>>("tdlib-download-list-stats", (event) => {
                if (event.payload) applyTdlibListTotals(event.payload);
            });
        }
        // 启动时先向 Rust 对一次角标计数（列表快照延迟到面板打开时读取）
        scheduleBadgeRefresh();
    }

    // ─── 已完成区分页（打开面板只取第一页，滚动到底再取下一页） ─────────
    /** 已完成区页大小 */
    const COMPLETED_PAGE_SIZE = 30;
    /** 服务端报告的已完成条数（当前过滤条件下） */
    const completedTotal = ref(0);
    /** 已完成区已取到的位置，等于下一页的 offset */
    const completedLoaded = ref(0);
    /** 已完成区见过的键（去重；dismiss 时据此判断游标要不要回退一行） */
    const completedKeys = new Set<string>();
    let completedLoading = false;
    /** 请求序号：切过滤器/重开面板时丢弃在途的旧页 */
    let pageSeq = 0;
    /** 上一次成功分页时的服务端过滤指纹 */
    let pageFilterKey = "";

    /** 通用资源在已完成区是否可见：通用开关，或任一细分通用标签 / 资料页 / 动态开关 */
    function completedShowsGeneric(): boolean {
        return filterKeys.value.has(FILTER_KEY.GENERIC)
            || filterKeys.value.has(DL_TAG.PROFILE)
            || filterKeys.value.has(DL_TAG.STORY)
            || [...GENERIC_TAGS].some((tag) => filterKeys.value.has(tag));
    }

    /** 服务端过滤指纹：变化时必须重取第一页（结果集变了） */
    function completedFilterKey(): string {
        return `${completedShowsGeneric()}|${filterKeys.value.has(FILTER_KEY.AUTO_IMAGE)}`;
    }

    /** 已完成区是否还有下一页 */
    const hasMoreCompleted = computed(() => completedLoaded.value < completedTotal.value);

    function mergeDownloadPage(page: DownloadsPage, offset: number) {
        const completed = page.completed ?? [];
        const incoming = [...(page.active ?? []), ...completed];
        for (const item of incoming) {
            const key = item.remote_id || `session:${item.session_file_id ?? item.file_id}`;
            // 快照是 Rust 权威记账，直接覆盖（进度事件随后会继续回写）
            items.value[key] = { ...item, remote_id: key };
            if (item.session_file_id != null) sessionIdMap.value[item.session_file_id] = key;
            if (item.file_id) sessionIdMap.value[item.file_id] = key;
        }
        for (const item of completed) {
            completedKeys.add(item.remote_id || `session:${item.session_file_id ?? item.file_id}`);
        }
        completedTotal.value = page.completed_total ?? 0;
        // 游标按「请求位置 + 本页条数」推进：整页都是已加载行时也不会原地打转
        completedLoaded.value = completed.length > 0
            ? Math.max(completedLoaded.value, offset + completed.length)
            // 空页 = 游标已到集合末尾
            : Math.max(completedLoaded.value, completedTotal.value);
        if (incoming.length > 0) touch();
    }

    /**
     * 取一页面板快照。
     * @param reset true：重取第一页（打开面板 / 通用·自动图片开关变化）。
     *   已加载的行不清：面板关闭后消息气泡还要靠它们查进度/完成路径，第一页只覆盖同名键。
     *   只有过滤条件变了（服务端结果集不同）才把游标拉回起点，否则保留游标直接续下一页，
     *   免得重开面板后把已加载的几百行重取一遍。
     */
    async function loadCompletedPage(reset = false) {
        if (!reset && (completedLoading || !hasMoreCompleted.value)) return;
        const filterKey = completedFilterKey();
        if (reset && filterKey !== pageFilterKey) {
            completedKeys.clear();
            completedLoaded.value = 0;
            completedTotal.value = 0;
        }
        const offset = reset ? 0 : completedLoaded.value;
        const seq = ++pageSeq;
        completedLoading = true;
        try {
            const page = await invoke<DownloadsPage>("get_downloads", {
                completedOffset: offset,
                completedLimit: COMPLETED_PAGE_SIZE,
                includeGeneric: completedShowsGeneric(),
                includeAutoPhotos: filterKeys.value.has(FILTER_KEY.AUTO_IMAGE),
            });
            // 期间被重新发起（切过滤器 / 重开面板）：这一页属于旧请求，丢弃
            if (seq !== pageSeq) return;
            pageFilterKey = filterKey;
            mergeDownloadPage(page, offset);
        } catch (e) {
            console.error("Failed to load downloads from Rust:", e);
        } finally {
            if (seq === pageSeq) completedLoading = false;
        }
    }

    /** 兼容旧调用：重取第一页（打开面板时用） */
    function refreshFromRust() {
        return loadCompletedPage(true);
    }

    /** 滚动到底：取下一页已完成 */
    function loadMoreCompleted() {
        return loadCompletedPage(false);
    }

    function destroy() {
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        if (badgeTimer !== null) {
            clearTimeout(badgeTimer);
            badgeTimer = null;
        }
        pendingUpdates.clear();
        if (unlistenProgress) {
            unlistenProgress();
            unlistenProgress = null;
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
            touch();
            return;
        }
        items.value[`session:${fileId}`] = {
            remote_id: `session:${fileId}`,
            session_file_id: fileId,
            file_id: fileId,
            file_name: i18n.global.t("download.row.fileFallback", { id: fileId }),
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
        touch();
    }

    /**
     * 注册下载项。
     * @param remoteId 稳定主键（remoteIdOf：unique_id → remote.id → session:<fileId>）
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
        /** 溯源：来源类型（sticker_set / user / chat）与目标 id，供面板跳回来源 */
        sourceKind?: string,
        sourceId?: number,
    ) {
        const generic = isGeneric ?? (fileType === "sticker" || fileType === "avatar" || fileType === "other");
        const category = hiddenCategory ?? (generic ? inferHiddenCategory(fileType) : undefined);
        const rid = remoteId && remoteId.length > 0
            ? migrateToRemoteKey(fileId, remoteId)
            : `session:${fileId}`;
        // 同一文件若还有挂在旧 remote.id 键上的条目（TDLib 刷新过 file_reference），先收编
        adoptSameFileRow(rid, { file_type: fileType, file_name: fileName, total_size: totalSize });
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
                sourceKind: sourceKind || null,
                sourceId: sourceId ?? null,
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
                    touch();
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
                        source_kind: sourceKind ?? existing.source_kind,
                        source_id: sourceId ?? existing.source_id,
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
                    source_kind: sourceKind,
                    source_id: sourceId,
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
            touch();
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
     * @param remoteId 可选：稳定主键（remoteIdOf）。优先按其写入，避免 session file.id
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
        touch();
    }

    /**
     * 校准：把一次下载请求返回的 File 纳入下载管理器。
     *
     * 覆盖所有 downloadFile / getFile 拿到的 file：
     * - 条目已存在 → 按 file 回写进度 / 完成态 / 本地路径
     * - 条目不存在且确有下载活动或完成 → 补录（有 meta 用 meta，否则按通用资源隐藏）
     *
     * 用于修复「音乐播放器等旁路请求下载后，下载管理器没有记录」。
     */
    function trackDownloadFile(
        file: {
            id?: number;
            remote?: { id?: string };
            size?: number;
            expected_size?: number;
            local?: {
                downloaded_size?: number;
                is_downloading_active?: boolean;
                is_downloading_completed?: boolean;
                path?: string;
            };
        } | null | undefined,
        meta?: TrackFileMeta,
    ): boolean {
        if (!file || typeof file.id !== "number") return false;
        const fileId = file.id;
        const remoteId = remoteIdOf(file);
        const path = file.local?.path && file.local.path.length > 0 ? file.local.path : undefined;
        const ready = !!(file.local?.is_downloading_completed && path);
        const downloaded = typeof file.local?.downloaded_size === "number" ? file.local.downloaded_size : 0;
        const size = typeof file.size === "number" && file.size > 0 ? file.size : 0;
        const expected = typeof file.expected_size === "number" ? file.expected_size : 0;
        const total = size > 0 ? size : expected;
        const active = !!file.local?.is_downloading_active;

        const key = remoteId && remoteId.length > 0
            ? migrateToRemoteKey(fileId, remoteId)
            : (sessionIdMap.value[fileId] || `session:${fileId}`);
        let existing: DownloadItem | undefined = items.value[key];
        if (!existing && meta?.fileName && total > 0) {
            // 同一文件的历史条目（旧 remote.id 键）先收编，避免补录出第二行
            existing = adoptSameFileRow(key, {
                file_type: meta.fileType ?? "other",
                file_name: meta.fileName,
                total_size: total,
            });
        }

        // 无进度且调用方未给语义 → 不补录，避免空壳任务
        if (!existing) {
            // 面板关闭且调用方未登记元数据 → 不补录前端条目：
            // 下载列表由 Rust 权威记账（download_store），面板打开时快照读取
            if (!isPanelOpen.value && !meta) return false;
            const hasActivity = ready || active || downloaded > 0;
            if (!hasActivity && !meta) return false;

            const fileType = meta?.fileType ?? "other";
            const generic = meta?.isGeneric
                ?? (fileType === "sticker" || fileType === "avatar" || fileType === "other");
            const category = meta?.hiddenCategory ?? (generic ? inferHiddenCategory(fileType) : undefined);
            const finalTags = buildDownloadTags({
                fileType,
                hiddenCategory: category,
                isGeneric: generic,
                isStreaming: meta?.isStreaming,
                extraTags: meta?.tags,
            });
            const rid = key;
            void invoke("register_download", {
                remoteId: rid,
                fileId,
                fileName: meta?.fileName || (path ? path.split(/[\\/]/).pop() : undefined) || i18n.global.t("download.row.fileFallback", { id: fileId }),
                chatTitle: meta?.chatTitle || "",
                totalSize: total,
                fileType,
                thumbnailDataUrl: null,
                chatId: meta?.chatId || null,
                messageId: meta?.messageId || null,
                isGeneric: generic,
                hiddenCategory: category ?? null,
                isAutoPhoto: false,
                isStreaming: meta?.isStreaming ?? false,
                tags: finalTags,
                sourceLabel: meta?.sourceLabel || null,
            }).catch(() => { /* Rust 侧失败不阻塞前端展示 */ });

            const now = Date.now();
            items.value[rid] = {
                remote_id: rid,
                session_file_id: fileId,
                file_id: fileId,
                file_name: meta?.fileName || (path ? path.split(/[\\/]/).pop() : undefined) || i18n.global.t("download.row.fileFallback", { id: fileId }),
                chat_title: meta?.chatTitle || "",
                chat_id: meta?.chatId,
                message_id: meta?.messageId,
                total_size: total,
                downloaded_size: ready && total > 0 ? total : downloaded,
                progress: ready ? 1 : (total > 0 ? Math.min(1, downloaded / total) : 0),
                is_paused: ready ? false : (!active && !ready),
                is_completed: ready,
                local_path: path,
                file_type: fileType,
                is_generic: generic,
                hidden_category: category,
                is_auto_photo: false,
                is_streaming: meta?.isStreaming ?? false,
                tags: finalTags,
                source_label: meta?.sourceLabel,
                dismissed: false,
                created_at: now,
                completed_at: ready ? now : undefined,
                has_tdlib_update: true,
                in_tdlib_list: false,
            };
            sessionIdMap.value[fileId] = rid;
            touch();
            return true;
        }

        // 已有条目：回写进度 / 完成态（TDLib 对已完成文件可能不再推 updateFile）
        let dirty = false;
        const nextDownloaded = ready && (total > 0 ? total : downloaded) ? (total > 0 ? total : downloaded) : downloaded;
        if (existing.downloaded_size !== nextDownloaded) {
            existing.downloaded_size = nextDownloaded;
            dirty = true;
        }
        if (total > 0 && existing.total_size !== total) {
            existing.total_size = total;
            dirty = true;
        }
        const nextProgress = ready ? 1 : (existing.total_size > 0
            ? Math.min(1, existing.downloaded_size / existing.total_size)
            : existing.progress);
        if (existing.progress !== nextProgress) {
            existing.progress = nextProgress;
            dirty = true;
        }
        if (!existing.has_tdlib_update && (ready || active || downloaded > 0)) {
            existing.has_tdlib_update = true;
            dirty = true;
        }
        if (existing.session_file_id !== fileId || existing.file_id !== fileId) {
            existing.session_file_id = fileId;
            existing.file_id = fileId;
            dirty = true;
        }
        if (!existing.remote_id) {
            existing.remote_id = key;
            dirty = true;
        }
        if (meta?.fileName && (isPlaceholderFileName(existing.file_name) || !existing.file_name)) {
            existing.file_name = meta.fileName;
            dirty = true;
        }
        if (meta?.chatTitle && !existing.chat_title) {
            existing.chat_title = meta.chatTitle;
            dirty = true;
        }
        if (meta?.chatId != null && existing.chat_id == null) {
            existing.chat_id = meta.chatId;
            dirty = true;
        }
        if (meta?.messageId != null && existing.message_id == null) {
            existing.message_id = meta.messageId;
            dirty = true;
        }
        sessionIdMap.value[fileId] = existing.remote_id || key;

        if (ready && path) {
            if (existing.is_completed && existing.local_path === path) {
                return dirty;
            }
            markCompleted(fileId, path, existing.remote_id || remoteIdOf(file));
            return true;
        }
        if (dirty) {
            items.value[key] = { ...existing };
            touch();
        }
        return dirty;
    }

    /**
     * 内容快照 / TDLib File 已就绪时，把 store 中同文件的未完成条目对账为已完成；
     * 条目缺失时按 file 补录。兼容旧调用，语义并入 trackDownloadFile。
     */
    function reconcileFromFile(
        file: {
            id?: number;
            remote?: { id?: string };
            size?: number;
            expected_size?: number;
            local?: {
                downloaded_size?: number;
                is_downloading_active?: boolean;
                is_downloading_completed?: boolean;
                path?: string;
            };
        } | null | undefined,
        meta?: TrackFileMeta,
    ): boolean {
        return trackDownloadFile(file, meta);
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
                touch();
            } else {
                await invoke("tdlib_send", {
                    request: { _: "toggleDownloadIsPaused", file_id: sid, is_paused: false },
                });
                await invoke("tdlib_send", {
                    request: { _: "downloadFile", file_id: sid, priority: DL_PRIORITY.USER_ACTIVE, offset: 0, limit: 0, synchronous: false },
                }).then((res) => {
                    // 校准：恢复下载返回的 file 也纳入下载管理器
                    if (res && typeof (res as { id?: number }).id === "number") {
                        trackDownloadFile(res as never);
                    }
                }).catch(() => { /* ignore */ });
                item.is_paused = false;
                touch();
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
                // 该行从服务端集合里消失：游标回退一行，避免下一页漏掉一行
                if (completedKeys.delete(key)) {
                    completedLoaded.value = Math.max(0, completedLoaded.value - 1);
                }
                touch();
            }
        } catch (e) {
            console.error("dismiss_download failed:", e);
        }
    }

    async function clearCompleted() {
        try {
            await invoke("clear_completed_downloads");
            // 原始表遍历：数千条逐条读响应式条目会各建一次 Proxy
            const raw = toRaw(items.value);
            let removed = false;
            for (const key of Object.keys(raw)) {
                if (raw[key]?.is_completed || raw[key]?.dismissed) {
                    delete items.value[key];
                    removed = true;
                }
            }
            if (removed) touch();
            // 已完成的都被 Rust 删了：分页游标回到起点
            completedKeys.clear();
            completedLoaded.value = 0;
            completedTotal.value = 0;
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
    /** 面板关闭时的角标计数：直接问 Rust，不依赖前端列表 */
    const rustActiveCount = ref(0);
    let badgeTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleBadgeRefresh() {
        if (badgeTimer !== null) return;
        badgeTimer = setTimeout(() => {
            badgeTimer = null;
            void invoke("get_download_active_count")
                .then((n) => { if (typeof n === "number") rustActiveCount.value = n; })
                .catch(() => { /* Rust 不可用时保持上次计数 */ });
        }, 1000);
    }
    const badgeCount = computed(() =>
        isPanelOpen.value ? activeDownloadingCount.value : rustActiveCount.value);

    function openPanel() {
        isPanelOpen.value = true;
        // 打开时读取 Rust 权威快照 + TDLib 官方下载列表；关闭期间前端不维护列表
        void refreshFromRust();
        tdlibListLoaded = false;
        void loadTdlibDownloadList();
    }
    function closePanel() { isPanelOpen.value = false; }
    function togglePanel() {
        if (isPanelOpen.value) closePanel();
        else openPanel();
    }

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
        badgeCount,
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
        loadMoreCompleted,
        hasMoreCompleted,
        completedTotal,
        loadTdlibDownloadList,
        registerDownload,
        markInTdlibList,
        getProgress,
        markCompleted,
        reconcileFromFile,
        trackDownloadFile,
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
