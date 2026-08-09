import { invoke } from "@tauri-apps/api/core";
import type { $Function, $FunctionResultByName } from "tdlib-types";
import { ref } from 'vue';
import { DL_PRIORITY } from './downloadPriority';

/**
 * Sends a request to TDLib.
 * Wraps the request object in the structure expected by the Tauri command.
 */
export async function tdlibSend<T extends $Function>(
  request: T
): Promise<$FunctionResultByName[T["_"]]> {
  const response = await invoke("tdlib_send", { request });
  if (response._ === "error") {
    throw response;
  }
  return response;
}

/** 检查 TDLib 文件是否已下载且本地路径存在（非空且可用） */
export function isFileReady(file: { local: { is_downloading_completed: boolean; path?: string } } | undefined): boolean {
  if (!file) return false;
  return file.local.is_downloading_completed && !!file.local.path;
}

/**
 * 全局文件下载去重集合。
 * 所有组件在发起 downloadFile 前先检查此集合，避免对同一文件发起重复下载。
 */
export const downloadingFiles = new Set<number>();

/**
 * 响应式的正在下载文件 ID 集合，供组件渲染下载状态时使用。
 * 与 downloadingFiles Set 同步更新。
 */
export const reactiveDownloadingFiles = ref<Set<number>>(new Set());

function addDownloading(fileId: number) {
  downloadingFiles.add(fileId);
  reactiveDownloadingFiles.value = new Set(downloadingFiles);
}

function deleteDownloading(fileId: number) {
  downloadingFiles.delete(fileId);
  reactiveDownloadingFiles.value = new Set(downloadingFiles);
}

/** 检查指定 file_id 是否正在下载中（响应式） */
export function isFileDownloading(fileId: number): boolean {
  return reactiveDownloadingFiles.value.has(fileId);
}

/**
 * 安全发起文件下载，自动去重。
 *
 * ⚠️ 语义：`downloadFile` 仅用于「用户不手动点击主动下载」的文件（自动下载、
 * 缩略图/头像/封面等隐藏/辅助资源，以及需要流式传输的文件）。用户手动点击
 * 触发的下载应改用 `safeAddFileToDownloads`。
 *
 * 返回 true 表示已发起下载，false 表示已在下载中或文件已就绪。
 *
 * @param priority 下载优先级（见 downloadPriority.ts），默认 DEFAULT(16)
 */
export async function safeDownloadFile(
  fileId: number,
  synchronous = true,
  priority: number = DL_PRIORITY.DEFAULT,
): Promise<boolean> {
  if (downloadingFiles.has(fileId)) return false;
  addDownloading(fileId);
  try {
    await tdlibSend({
      _: 'downloadFile',
      file_id: fileId,
      priority,
      offset: 0,
      limit: 0,
      synchronous,
    });
    return true;
  } finally {
    deleteDownloading(fileId);
  }
}

/**
 * 安全地将一个消息文件加入下载列表（用户手动点击下载时触发），自动去重。
 *
 * 与 `downloadFile` 的区别：`addFileToDownloads` 会把该文件加入 TDLib 的
 * 持久化下载列表（配合消息数据库可跨重启续传），适用于用户主动下载的内容。
 *
 * 返回 true 表示已发起下载，false 表示已在下载中或文件已就绪。
 *
 * @param priority 下载优先级（见 downloadPriority.ts），用户主动操作默认为 USER_ACTIVE(30)
 */
export async function safeAddFileToDownloads(
  fileId: number,
  chatId?: number,
  messageId?: number,
  priority: number = DL_PRIORITY.USER_ACTIVE,
): Promise<boolean> {
  if (downloadingFiles.has(fileId)) return false;
  addDownloading(fileId);
  try {
    await tdlibSend({
      _: 'addFileToDownloads',
      file_id: fileId,
      chat_id: chatId,
      message_id: messageId,
      priority,
    });
    return true;
  } finally {
    deleteDownloading(fileId);
  }
}
