import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

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
    /** 在下载管理器中已手动关闭/移除 */
    dismissed: boolean;
}

export const useDownloadStore = defineStore("downloads", () => {
    const items = ref<Record<number, DownloadItem>>({});
    const showHidden = ref(false);

    /** 非通用资源的活跃（进行中/暂停 + 未完成 + 未关闭）下载项 */
    const activeItems = computed(() =>
        Object.values(items.value).filter(
            (item) => !item.is_generic && !item.is_completed && !item.dismissed
        )
    );

    /** 活跃下载数量（排除通用资源） */
    const activeCount = computed(() => activeItems.value.length);

    /** 可见的下载项（根据 showHidden 开关过滤） */
    const visibleItems = computed(() =>
        Object.values(items.value)
            .filter((item) => !item.dismissed && (showHidden.value || !item.is_generic))
            .sort((a, b) => b.file_id - a.file_id)
    );

    /** 已完成且可见的项 */
    const completedItems = computed(() =>
        visibleItems.value.filter((item) => item.is_completed)
    );

    /** 进行中或暂停的可见项 */
    const pendingItems = computed(() =>
        visibleItems.value.filter((item) => !item.is_completed)
    );

    /** 是否有隐藏的未完成下载 */
    const hasHiddenActive = computed(() =>
        Object.values(items.value).some(
            (item) => item.is_generic && !item.is_completed && !item.dismissed
        )
    );

    /** 初始化：从 Rust 加载历史记录 + 监听实时更新 */
    let unlistenProgress: (() => void) | null = null;

    async function init() {
        // 1. 从 Rust 加载持久化的下载记录
        await refreshFromRust();

        // 2. 监听 Rust 发来的实时进度更新
        if (!unlistenProgress) {
            unlistenProgress = await listen<DownloadItem>("download-progress-update", (event) => {
                const item = event.payload;
                if (item && item.file_id) {
                    items.value[item.file_id] = item;
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
        if (unlistenProgress) {
            unlistenProgress();
            unlistenProgress = null;
        }
    }

    /**
     * 注册一个下载项（由组件在发起下载前调用）
     */
    async function registerDownload(
        fileId: number,
        fileName: string,
        chatTitle: string,
        totalSize: number,
        fileType: DownloadFileType,
        thumbnailDataUrl?: string,
        chatId?: number,
        messageId?: number
    ) {
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
                is_generic: fileType === "sticker" || fileType === "avatar" || fileType === "other",
                dismissed: false,
                chat_id: chatId,
                message_id: messageId,
                local_path: undefined,
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

    /** 获取指定文件的下载状态 */
    function getDownloadInfo(fileId: number): DownloadItem | undefined {
        return items.value[fileId];
    }

    /** 暂停/恢复下载 */
    async function togglePause(fileId: number) {
        const item = items.value[fileId];
        if (!item) return;
        try {
            await invoke("tdlib_send", {
                request: { _: "toggleDownloadIsPaused", file_id: fileId, is_paused: !item.is_paused },
            });
            // 乐观更新本地状态
            items.value[fileId] = { ...items.value[fileId], is_paused: !item.is_paused };
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

    return {
        items,
        activeItems,
        activeCount,
        visibleItems,
        completedItems,
        pendingItems,
        showHidden,
        hasHiddenActive,
        init,
        destroy,
        refreshFromRust,
        registerDownload,
        getProgress,
        getDownloadInfo,
        togglePause,
        cancelDownload,
        dismissItem,
        clearCompleted,
        toggleShowHidden,
    };
});
