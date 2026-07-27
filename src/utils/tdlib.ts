import { invoke } from "@tauri-apps/api/core";
import type { $Function, $FunctionResultByName } from "tdlib-types";
import { ref } from 'vue';

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
 * 返回 true 表示已发起下载，false 表示已在下载中或文件已就绪。
 */
export async function safeDownloadFile(fileId: number, synchronous = true): Promise<boolean> {
  if (downloadingFiles.has(fileId)) return false;
  addDownloading(fileId);
  try {
    await tdlibSend({
      _: 'downloadFile',
      file_id: fileId,
      priority: 1,
      offset: 0,
      limit: 0,
      synchronous,
    });
    return true;
  } finally {
    deleteDownloading(fileId);
  }
}
