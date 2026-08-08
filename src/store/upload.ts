import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { DownloadItem } from "./downloads";

/**
 * 上传任务 Store：跟踪「发送中的文件/图片/音乐/视频」的上传进度。
 *
 * 数据流：
 * - Rust 端在 TDLib updateFile 事件中检测到正在上传（file.remote.is_uploading_active /
 *   is_uploading_completed / uploaded_size）时，更新内存中的上传任务，
 *   并经 `upload-progress-update` 事件（DownloadItem 载荷）推送到前端。
 * - 前端无需主动注册：上传任务完全由 TDLib 的 updateFile 驱动，Rust 端按
 *   本地路径去重（同一源文件即使有多个 file_id 也只出现一条）。
 * - 上传记录保留在内存，直到用户手动关闭（dismissUpload）。
 */
export const useUploadStore = defineStore("uploads", () => {
    /** 全部上传任务：file_id -> DownloadItem（is_upload=true） */
    const items = ref<Record<number, DownloadItem>>({});

    /** 进行中（未完成）的上传任务 */
    const activeItems = computed(() =>
        Object.values(items.value).filter((item) => !item.is_completed)
    );

    /** 已完成的（保留展示，待手动关闭）上传任务 */
    const completedItems = computed(() =>
        Object.values(items.value).filter((item) => item.is_completed)
    );

    /** 进行中上传数量 */
    const activeCount = computed(() => activeItems.value.length);

    /** 是否有进行中的上传 */
    const hasActiveUploads = computed(() => activeItems.value.length > 0);

    /** 获取某个文件的上传信息（供消息气泡查询），未上传则返回 undefined */
    function getUploadInfo(fileId: number): DownloadItem | undefined {
        return items.value[fileId];
    }

    /** 节流缓冲（与 downloads store 相同的思路，避免高频进度触发全量重渲染） */
    let pendingUpdates = new Map<number, DownloadItem>();
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    function applyItem(fileId: number, item: DownloadItem) {
        const existing = items.value[fileId];
        if (!existing) {
            items.value[fileId] = item;
            return;
        }
        existing.downloaded_size = item.downloaded_size;
        existing.total_size = item.total_size;
        existing.progress = item.progress;
        existing.is_paused = item.is_paused;
        existing.is_completed = item.is_completed;
        if (item.file_name !== undefined && item.file_name !== existing.file_name) {
            existing.file_name = item.file_name;
        }
        if (item.chat_title !== undefined && item.chat_title !== existing.chat_title) {
            existing.chat_title = item.chat_title;
        }
        if (typeof item.file_type === "string") existing.file_type = item.file_type;
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

    function scheduleUpdate(item: DownloadItem) {
        pendingUpdates.set(item.file_id, item);
        if (throttleTimer === null) {
            throttleTimer = setTimeout(flushPendingUpdates, 0);
        }
    }

    let unlisten: (() => void) | null = null;

    async function init() {
        // 1. 从 Rust 拉取已存在的上传记录（重新打开面板时恢复）
        await refreshFromRust();
        // 2. 监听实时上传进度
        if (!unlisten) {
            unlisten = await listen<DownloadItem>("upload-progress-update", (event) => {
                const item = event.payload;
                if (item && item.file_id) {
                    scheduleUpdate(item);
                }
            });
        }
    }

    /** 从 Rust 拉取全量上传记录 */
    async function refreshFromRust() {
        try {
            const rustItems: DownloadItem[] = await invoke("get_uploads");
            const map: Record<number, DownloadItem> = {};
            for (const item of rustItems) {
                map[item.file_id] = item;
            }
            items.value = map;
        } catch (e) {
            console.error("Failed to load uploads from Rust:", e);
        }
    }

    function destroy() {
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        pendingUpdates.clear();
        if (unlisten) {
            unlisten();
            unlisten = null;
        }
    }

    /** 手动关闭一个上传任务记录 */
    async function dismiss(fileId: number) {
        delete items.value[fileId];
        try {
            await invoke("dismiss_upload", { fileId });
        } catch (e) {
            console.warn("Failed to dismiss upload:", e);
        }
    }

    return {
        items,
        activeItems,
        completedItems,
        activeCount,
        hasActiveUploads,
        getUploadInfo,
        init,
        destroy,
        refreshFromRust,
        dismiss,
    };
});
