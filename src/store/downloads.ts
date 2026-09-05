import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DL_PRIORITY } from "../utils/downloadPriority";

/** 文件类型分类（与 Rust 端 DownloadFileType 对应） */
export type DownloadFileType =
    | "document"   // 普通文件
    | "photo"      // 图片
    | "video"      // 视频
    | "audio"      // 音乐
    | "voice"      // 语音
    | "animation"  // GIF
    | "sticker"    // 贴纸
    | "avatar"     // 用户/群组头像
    | "other";     // 其他（缩略图缓存等）

/** Rust 端 DownloadItem 的序列化结构 */
export interface DownloadItem {
    file_id: number;
    file_name: string;
    /** 来源对话标题 */
    chat_title: string;
    /** 来源对话 ID */
    chat_id?: number;
    message_id?: number;
    total_size: number;
    downloaded_size: number;
    progress: number; // 0~1
    is_paused: boolean;
    is_completed: boolean;
    local_path?: string;
    /** 缩略图 base64（minithumbnail 或缩略图文件） */
    thumbnail_data_url?: string;
    /** 文件类型分类 */
    file_type: DownloadFileType;
    /** 通用资源标记（贴纸/emoji/头像等），默认隐藏且不计入红点 */
    is_generic: boolean;
    /** 通用资源的细分类别（仅当 is_generic 为 true 时有意义）：
     * - "emoji"        自定义表情（缩略图/完整贴纸）
     * - "video_cover"  视频封面（缩略图）
     * - "avatar"       用户/群组头像、个人资料大图等
     * - "story_cover"  动态封面
     * - "sticker"      贴纸
     * - "gift"         礼物贴纸
     * - "music_cover"  音乐封面
     * - "other"        其他 */
    hidden_category?: string;
    /** 自动下载图片标记（频道/群组中自动下载的图片），默认隐藏，由独立开关控制 */
    is_auto_photo: boolean;
    /** 视频是否为流式传输（边下边播，tdstream://）来源，用于展示「流式传输」标签 */
    is_streaming: boolean;
    /** 在下载管理器中已手动关闭/移除 */
    dismissed: boolean;
    /** 是否为上传任务（发送中的文件/图片/音乐/视频），在下载管理器「上传」区展示 */
    is_upload?: boolean;
    /** 下载记录时间戳（Unix 毫秒）：注册时记录创建时间，完成时刷新为完成时间，
     * 用于「最近下载排前」的排序（file_id 不能反映下载时间） */
    created_at?: number;
}

/** 通用资源分类标识类型 */
export type HiddenCategory =
    | "emoji"
    | "video_cover"
    | "avatar"
    | "story_cover"
    | "sticker"
    | "gift"
    | "music_cover"
    | "other";

/**
 * 根据 fileType 推断隐藏资源的默认分类（供 registerDownload 未显式指定分类时使用）。
 */
function inferHiddenCategory(fileType: DownloadFileType): HiddenCategory {
    switch (fileType) {
        case "avatar": return "avatar";
        case "sticker": return "sticker";
        default: return "other";
    }
}

/** 各隐藏分类对应的中文显示标签 */
const HIDDEN_CATEGORY_LABELS: Record<HiddenCategory, string> = {
    emoji: "表情",
    video_cover: "视频封面",
    avatar: "头像",
    story_cover: "动态封面",
    sticker: "贴纸",
    gift: "礼物",
    music_cover: "音乐封面",
    other: "通用",
};

/**
 * 获取下载项的隐藏分类标签文本。仅对 is_generic 的项有意义，
 * 未匹配到已知分类时回退为"通用"。
 */
export function hiddenCategoryLabel(item: Pick<DownloadItem, "is_generic" | "hidden_category">): string {
    const cat = item.hidden_category as HiddenCategory | undefined;
    if (cat && HIDDEN_CATEGORY_LABELS[cat]) return HIDDEN_CATEGORY_LABELS[cat];
    return HIDDEN_CATEGORY_LABELS.other;
}

export const useDownloadStore = defineStore("downloads", () => {
    const items = ref<Record<number, DownloadItem>>({});
    const showHidden = ref(false);
    /** 是否显示自动下载图片（独立开关） */
    const showAutoPhotos = ref(false);

    /** 非通用资源且非自动下载图片的活跃（进行中/暂停 + 未完成 + 未关闭）下载项 */
    const activeItems = computed(() =>
        Object.values(items.value).filter(
            (item) => !item.is_generic && !item.is_auto_photo && !item.is_completed && !item.dismissed
        )
    );

    /** 活跃下载数量（排除通用资源与自动下载图片） */
    const activeCount = computed(() => activeItems.value.length);

    /** 正在下载（未暂停）的活跃下载数量（排除通用资源、自动下载图片与暂停项） */
    const activeDownloadingCount = computed(() =>
        activeItems.value.filter((item) => !item.is_paused).length
    );

    /** 可见的下载项（根据 showHidden / showAutoPhotos 开关过滤） */
    const visibleItems = computed(() =>
        Object.values(items.value)
            .filter((item) => !item.dismissed
                && (showHidden.value || !item.is_generic)
                && (showAutoPhotos.value || !item.is_auto_photo))
            .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.file_id - a.file_id)
    );

    /** 已完成且可见的项 */
    const completedItems = computed(() =>
        visibleItems.value.filter((item) => item.is_completed)
    );

    /** 进行中或暂停的可见项 */
    const pendingItems = computed(() =>
        visibleItems.value.filter((item) => !item.is_completed)
    );

    /** 正在下载（未暂停、未完成）的可见项 */
    const downloadingItems = computed(() =>
        visibleItems.value.filter((item) => !item.is_completed && !item.is_paused)
    );

    /** 已暂停（未完成）的可见项 */
    const pausedItems = computed(() =>
        visibleItems.value.filter((item) => !item.is_completed && item.is_paused)
    );

    /** 是否有隐藏（通用资源或自动下载图片）的未完成下载 */
    const hasHiddenActive = computed(() =>
        Object.values(items.value).some(
            (item) => (item.is_generic || item.is_auto_photo) && !item.is_completed && !item.dismissed
        )
    );

    /** 是否有自动下载图片的未完成下载 */
    const hasHiddenAutoPhotos = computed(() =>
        Object.values(items.value).some(
            (item) => item.is_auto_photo && !item.is_completed && !item.dismissed
        )
    );

    /** 初始化：从 Rust 加载历史记录 + 监听实时更新 */
    let unlistenProgress: (() => void) | null = null;

    /**
     * 进度更新节流缓冲。
     *
     * Rust 端在下载期间会按 TDLib updateFile 事件高频推送进度，若每个事件都
     * 直接写回响应式 items（replacing 整个对象），会触发所有依赖 items 的
     * computed（activeItems/visibleItems/pendingItems/...）全量重算 + 全量重渲染，
     * 多个文件并行下载时每 tick 都触发一轮，导致 UI 卡顿。
     *
     * 解决：将高频更新先合并到一个普通 Map（非响应式）缓冲，用 rAF / 定时
     * 批量地把缓存的最新对象一次性写回 items。每个节拍内即使收到 N 个进度
     * 事件，也只触发一轮响应式更新；且多个文件合并进同一轮。
     */
    let pendingUpdates = new Map<number, DownloadItem>();
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * 就地合并一个进度更新到现有响应式条目（不替换对象引用）。
     *
     * 相比「整体替换 `items.value[fileId] = item`」，这样做的好处是 Vue 的依赖追踪
     * 是属性级的：列表型 computed（activeItems/visibleItems/pendingItems）只读取
     * `is_generic`/`is_completed`/`dismissed` 这些低频字段，并不读取高频变化的
     * `progress`/`downloaded_size`。就地 patch 时，纯进度变化不会触发这些 key 的
     * setter，也就不会牵连列表 computed 重算 —— 即使下载管理页面未打开，只要
     * 不替换引用，活跃/列表 computed 也不会被高频进度牵扯。
     */
    function applyItem(fileId: number, item: DownloadItem) {
        const existing = items.value[fileId];
        if (!existing) {
            items.value[fileId] = item;
            return;
        }
        // 就地覆盖字段。同值赋值不会触发 setter 副作用（Vue 会跳过相同值）。
        existing.downloaded_size = item.downloaded_size;
        existing.total_size = item.total_size;
        existing.progress = item.progress;
        existing.is_paused = item.is_paused;
        existing.is_completed = item.is_completed;
        if (item.local_path !== undefined) existing.local_path = item.local_path;
        if (item.file_name !== undefined && item.file_name !== existing.file_name) {
            existing.file_name = item.file_name;
        }
        if (item.chat_title !== undefined && item.chat_title !== existing.chat_title) {
            existing.chat_title = item.chat_title;
        }
        if (typeof item.file_type === "string") existing.file_type = item.file_type;
        if (typeof item.chat_id === "number") existing.chat_id = item.chat_id;
        if (typeof item.message_id === "number") existing.message_id = item.message_id;
        if (item.thumbnail_data_url !== undefined) existing.thumbnail_data_url = item.thumbnail_data_url;
        if (item.is_generic !== undefined) existing.is_generic = item.is_generic;
        if (typeof item.hidden_category === "string" && item.hidden_category !== existing.hidden_category) {
            existing.hidden_category = item.hidden_category;
        }
        if (item.is_auto_photo !== undefined) existing.is_auto_photo = item.is_auto_photo;
        if (item.is_streaming !== undefined) existing.is_streaming = item.is_streaming;
        if (item.dismissed !== undefined) existing.dismissed = item.dismissed;
        // 完成时 Rust 端会刷新 created_at，这里同步以让已完成列表按最近下载完成时间重排
        if (typeof item.created_at === "number" && item.created_at !== existing.created_at) {
            existing.created_at = item.created_at;
        }
    }

    function flushPendingUpdates() {
        throttleTimer = null;
        if (pendingUpdates.size > 0) {
            const batch = pendingUpdates;
            pendingUpdates = new Map();
            for (const [fileId, item] of batch) {
                applyItem(fileId, item);
            }
        }
    }

    /** 将进度更新写入缓冲区，并在下一个刷新帧统一批量写回（节流） */
    function scheduleUpdate(item: DownloadItem) {
        pendingUpdates.set(item.file_id, item);
        if (throttleTimer === null) {
            // 用 setTimeout(0) 把同一宏任务/微任务批次内的多次更新合并为一次 flush，
            // 即「每帧至多一次响应式写入」。进度条本身带 transition，视觉上平滑无感。
            throttleTimer = setTimeout(flushPendingUpdates, 0);
        }
    }

    async function init() {
        // 1. 从 Rust 加载持久化的下载记录
        await refreshFromRust();
        // 同步显示自动下载图片开关
        try {
            showAutoPhotos.value = await invoke("get_show_auto_photos_downloads");
        } catch (e) {
            console.warn("Failed to get show_auto_photos from Rust:", e);
        }
        // 2. 监听 Rust 发来的实时进度更新
        if (!unlistenProgress) {
            unlistenProgress = await listen<DownloadItem>("download-progress-update", (event) => {
                const item = event.payload;
                if (item && item.file_id) {
                    scheduleUpdate(item);
                }
            });
        }
    }

    /** 从 Rust 端重新拉取全量下载记录 */
    async function refreshFromRust() {
        try {
            const rustItems: DownloadItem[] = await invoke("get_downloads");
            const map: Record<number, DownloadItem> = {};
            for (const item of rustItems) {
                map[item.file_id] = item;
            }
            items.value = map;

            // 同步 showHidden 状态
            try {
                showHidden.value = await invoke("get_show_hidden_downloads");
            } catch (e) {
                console.warn("Failed to get show_hidden from Rust:", e);
            }
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
     * 注册一个下载项（由组件在发起下载前调用）
     * @param hiddenCategory 通用资源的细分类别（仅当 isGeneric 为 true 时有意义）：
     *   "emoji" / "video_cover" / "avatar" / "story_cover" / "sticker" / "other"，
     *   用于在下载管理器中区分展示具体隐藏资源类型。缺省时按 fileType 推断。
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
        /** 显式指定是否为隐藏/通用资源（头像、贴纸、表情等），默认按文件类型推断 */
        isGeneric?: boolean,
        /** 是否为自动下载图片（频道/群组中自动下载的图片，默认隐藏、独立开关控制） */
        isAutoPhoto?: boolean,
        /** 通用资源的细分类别（见函数注释） */
        hiddenCategory?: string,
        /** 是否为流式传输（边下边播，tdstream://）的视频 */
        isStreaming?: boolean,
    ) {
        const generic = isGeneric ?? (fileType === "sticker" || fileType === "avatar" || fileType === "other");
        // 若未显式指定分类，则按 fileType 推断一个合理的默认值
        const category = hiddenCategory ?? (generic ? inferHiddenCategory(fileType) : undefined);
        try {
            await invoke("register_download", {
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
            });
            // 注册成功后，立即将本地状态置为进行中
            items.value[fileId] = {
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
                dismissed: false,
                chat_id: chatId,
                message_id: messageId,
                local_path: undefined,
                created_at: Date.now(),
            };
        } catch (e) {
            console.error("registerDownload failed:", e);
        }
    }

    /** 获取指定文件的最新下载进度（0~1），-1 表示未找到 */
    function getProgress(fileId: number): number {
        const item = items.value[fileId];
        if (!item) return -1;
        if (item.is_completed) return 1;
        return item.progress;
    }

    /** 将本地已完成下载的文件标记为完成 */
    function markCompleted(fileId: number, localPath: string) {
        const item = items.value[fileId];
        if (!item) return;
        item.local_path = localPath;
        item.is_completed = true;
        item.progress = 1;
        item.downloaded_size = item.total_size;
        item.created_at = Date.now();
    }

    /** 获取指定文件的下载状态 */
    function getDownloadInfo(fileId: number): DownloadItem | undefined {
        return items.value[fileId];
    }

    /** 暂停/恢复下载 */
    async function togglePause(fileId: number) {
        const item = items.value[fileId];
        if (!item) return;
        try {
            if (!item.is_paused) {
                // 暂停
                await invoke("tdlib_send", {
                    request: { _: "toggleDownloadIsPaused", file_id: fileId, is_paused: true },
                });
                items.value[fileId] = { ...items.value[fileId], is_paused: true };
            } else {
                // 恢复：清除暂停态 + 主动重新发起 downloadFile，
                // 让 TDLib 真正恢复下载并持续发出 updateFile 进度事件，
                // 否则列表会一直停留在「暂停/原封不动」的状态。
                await invoke("tdlib_send", {
                    request: { _: "toggleDownloadIsPaused", file_id: fileId, is_paused: false },
                });
                await invoke("tdlib_send", {
                    request: { _: "downloadFile", file_id: fileId, priority: DL_PRIORITY.USER_ACTIVE, offset: 0, limit: 0, synchronous: false },
                });
                items.value[fileId] = { ...items.value[fileId], is_paused: false };
            }
        } catch (e) {
            console.error("toggleDownloadIsPaused failed:", e);
        }
    }

    /** 取消下载 */
    async function cancelDownload(fileId: number) {
        try {
            await invoke("tdlib_send", {
                request: { _: "cancelDownloadFile", file_id: fileId },
            });
            await dismissItem(fileId);
        } catch (e) {
            console.error("cancelDownloadFile failed:", e);
        }
    }

    /** 取消所有进行中/暂停的下载（含隐藏的通用资源与自动下载图片） */
    async function cancelAllDownloads() {
        const pending = Object.values(items.value).filter(
            (item) => !item.is_completed && !item.dismissed
        );
        // 逐个取消并非发 dismiss，避免并发写入 items 时出现竞态与顺序问题
        for (const item of pending) {
            try {
                await invoke("tdlib_send", {
                    request: { _: "cancelDownloadFile", file_id: item.file_id },
                });
                await dismissItem(item.file_id);
            } catch (e) {
                console.error("cancelDownloadFile failed for", item.file_id, e);
            }
        }
    }

    /** 标记已关闭（从下载管理器中移除） */
    async function dismissItem(fileId: number) {
        try {
            await invoke("dismiss_download", { fileId });
            if (items.value[fileId]) {
                items.value[fileId] = { ...items.value[fileId], dismissed: true };
            }
        } catch (e) {
            console.error("dismiss_download failed:", e);
        }
    }

    /** 清除所有已完成/已关闭的项 */
    async function clearCompleted() {
        try {
            await invoke("clear_completed_downloads");
            for (const key of Object.keys(items.value)) {
                const id = Number(key);
                if (items.value[id]?.is_completed || items.value[id]?.dismissed) {
                    delete items.value[id];
                }
            }
        } catch (e) {
            console.error("clear_completed_downloads failed:", e);
        }
    }

    /** 切换显示隐藏资源 */
    async function toggleShowHidden() {
        const newValue = !showHidden.value;
        try {
            await invoke("set_show_hidden_downloads", { value: newValue });
            showHidden.value = newValue;
        } catch (e) {
            console.error("set_show_hidden_downloads failed:", e);
        }
    }

    /** 切换显示自动下载图片 */
    async function toggleShowAutoPhotos() {
        const newValue = !showAutoPhotos.value;
        try {
            await invoke("set_show_auto_photos_downloads", { value: newValue });
            showAutoPhotos.value = newValue;
        } catch (e) {
            console.error("set_show_auto_photos_downloads failed:", e);
        }
    }

    // ─── 下载面板（左下角悬浮窗）开关 ─────────────────────────────
    const isPanelOpen = ref(false);
    function openPanel() { isPanelOpen.value = true; }
    function closePanel() { isPanelOpen.value = false; }
    function togglePanel() { isPanelOpen.value = !isPanelOpen.value; }

    return {
        items,
        activeItems,
        activeCount,
        activeDownloadingCount,
        visibleItems,
        completedItems,
        pendingItems,
        downloadingItems,
        pausedItems,
        showHidden,
        showAutoPhotos,
        hasHiddenActive,
        hasHiddenAutoPhotos,
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
        togglePause,
        cancelDownload,
        cancelAllDownloads,
        dismissItem,
        clearCompleted,
        toggleShowHidden,
        toggleShowAutoPhotos,
    };
});
