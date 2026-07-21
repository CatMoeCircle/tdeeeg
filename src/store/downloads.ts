import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "tdlib-types";

/** 文件类型分类 */
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

export interface DownloadItem {
    fileId: number;
    fileName: string;
    /** 来源对话标题 */
    chatTitle: string;
    /** 来源对话 ID */
    chatId?: number;
    messageId?: number;
    totalSize: number;
    downloadedSize: number;
    progress: number; // 0~1
    isPaused: boolean;
    isCompleted: boolean;
    localPath?: string;
    /** 缩略图 base64（minithumbnail 或缩略图文件） */
    thumbnailDataUrl?: string;
    /** 文件类型分类 */
    fileType: DownloadFileType;
    /** 通用资源标记（贴纸/emoji/头像等），默认隐藏且不计入红点 */
    isGeneric: boolean;
    /** 在下载管理器中已手动关闭/移除 */
    dismissed: boolean;
}

export const useDownloadStore = defineStore("downloads", () => {
    const items = ref<Record<number, DownloadItem>>({});
    const showHidden = ref(false);

    /** 非通用资源的活跃（进行中/暂停 + 未完成 + 未关闭）下载项 */
    const activeItems = computed(() =>
        Object.values(items.value).filter(
            (item) => !item.isGeneric && !item.isCompleted && !item.dismissed
        )
    );

    /** 活跃下载数量（排除通用资源） */
    const activeCount = computed(() => activeItems.value.length);

    /** 可见的下载项（根据 showHidden 开关过滤） */
    const visibleItems = computed(() =>
        Object.values(items.value)
            .filter((item) => !item.dismissed && (showHidden.value || !item.isGeneric))
            .sort((a, b) => b.fileId - a.fileId)
    );

    /** 已完成且可见的项 */
    const completedItems = computed(() =>
        visibleItems.value.filter((item) => item.isCompleted)
    );

    /** 进行中或暂停的可见项 */
    const pendingItems = computed(() =>
        visibleItems.value.filter((item) => !item.isCompleted)
    );

    /** 是否有隐藏的未完成下载 */
    const hasHiddenActive = computed(() =>
        Object.values(items.value).some(
            (item) => item.isGeneric && !item.isCompleted && !item.dismissed
        )
    );

    /** 初始化：监听 updateFile 事件 */
    let unlisten: (() => void) | null = null;

    async function init() {
        if (unlisten) return;
        unlisten = await listen<Update>("tdlib-update", (event) => {
            const update = event.payload;
            if (update._ === "updateFile") {
                handleUpdateFile(update.file);
            }
        });
    }

    function destroy() {
        if (unlisten) {
            unlisten();
            unlisten = null;
        }
    }

    function handleUpdateFile(file: any) {
        if (!file || !file.id) return;
        const existing = items.value[file.id];
        if (!existing) return; // 只处理已注册的下载

        const totalSize = file.size || file.expected_size || existing.totalSize;
        const downloadedSize = file.local?.downloaded_size || 0;
        const isDlActive = file.local?.is_downloading_active === true;
        const isDlCompleted = file.local?.is_downloading_completed === true;
        const progress = totalSize > 0 ? downloadedSize / totalSize : 0;

        items.value[file.id] = {
            ...existing,
            downloadedSize,
            totalSize,
            progress,
            isPaused: !isDlActive && !isDlCompleted,
            isCompleted: isDlCompleted,
            localPath: isDlCompleted ? (file.local?.path || existing.localPath) : existing.localPath,
        };
    }

    /**
     * 注册一个下载项（由组件在发起下载前调用）
     */
    function registerDownload(
        fileId: number,
        fileName: string,
        chatTitle: string,
        totalSize: number,
        fileType: DownloadFileType,
        thumbnailDataUrl?: string,
        chatId?: number,
        messageId?: number
    ) {
        const existing = items.value[fileId];
        if (existing && !existing.dismissed) {
            // 更新已有记录中可能缺失的信息
            items.value[fileId] = {
                ...existing,
                fileName: existing.fileName.startsWith("文件 #") ? fileName : existing.fileName,
                chatTitle: existing.chatTitle || chatTitle,
                thumbnailDataUrl: existing.thumbnailDataUrl || thumbnailDataUrl,
                fileType: existing.fileType === "other" ? fileType : existing.fileType,
            };
            return;
        }

        const isGeneric = fileType === "sticker" || fileType === "avatar" || fileType === "other";

        items.value[fileId] = {
            fileId,
            fileName,
            chatTitle,
            totalSize,
            downloadedSize: 0,
            progress: 0,
            isPaused: false,
            isCompleted: false,
            fileType,
            thumbnailDataUrl,
            isGeneric,
            dismissed: false,
            chatId,
            messageId,
        };
    }

    /** 获取指定文件的最新下载进度（0~1），-1 表示未找到 */
    function getProgress(fileId: number): number {
        const item = items.value[fileId];
        if (!item) return -1;
        if (item.isCompleted) return 1;
        return item.progress;
    }

    /** 获取指定文件的下载状态 */
    function getDownloadInfo(fileId: number) {
        return items.value[fileId];
    }

    /** 暂停/恢复下载 */
    async function togglePause(fileId: number) {
        const item = items.value[fileId];
        if (!item) return;
        try {
            await invoke("tdlib_send", {
                request: { _: "toggleDownloadIsPaused", file_id: fileId, is_paused: !item.isPaused },
            });
            items.value[fileId] = { ...items.value[fileId], isPaused: !item.isPaused };
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
            dismissItem(fileId);
        } catch (e) {
            console.error("cancelDownloadFile failed:", e);
        }
    }

    /** 标记已关闭（从下载管理器中移除） */
    function dismissItem(fileId: number) {
        if (items.value[fileId]) {
            items.value[fileId].dismissed = true;
        }
    }

    /** 清除所有已完成/已关闭的项 */
    function clearCompleted() {
        for (const key of Object.keys(items.value)) {
            const id = Number(key);
            const item = items.value[id];
            if (item.isCompleted || item.dismissed) {
                delete items.value[id];
            }
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
        registerDownload,
        getProgress,
        getDownloadInfo,
        togglePause,
        cancelDownload,
        dismissItem,
        clearCompleted,
    };
});
