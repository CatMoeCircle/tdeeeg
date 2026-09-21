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

/** 本地已就绪则返回 path，否则 null。就绪时调用方必须直接使用该路径，不要再发 downloadFile。 */
export function localPathIfReady(
  file: { local?: { is_downloading_completed?: boolean; path?: string } } | undefined | null,
): string | null {
  if (!file?.local) return null;
  const { is_downloading_completed, path } = file.local;
  return is_downloading_completed && path ? path : null;
}

/**
 * 确保文件落在本地：
 * - 已就绪 → 直接返回 path，**不**发起 downloadFile
 * - 下载中 / 不可下载 / 无 id → 返回 null
 * - 否则按需 downloadFile，完成后返回 path
 */
export async function ensureLocalFilePath(
  file: { id?: number; local?: { is_downloading_completed?: boolean; path?: string; can_be_downloaded?: boolean } } | undefined | null,
  opts?: {
    priority?: number;
    synchronous?: boolean;
    /** 真正下载前执行（如 registerDownload）；本地已就绪时不会调用 */
    beforeDownload?: () => Promise<void> | void;
  },
): Promise<string | null> {
  const ready = localPathIfReady(file);
  if (ready) return ready;
  const id = file?.id;
  if (!id || !file?.local?.can_be_downloaded) return null;
  if (downloadingFiles.has(id)) return null;
  downloadingFiles.add(id);
  try {
    if (opts?.beforeDownload) await opts.beforeDownload();
    const res = await tdlibSend({
      _: 'downloadFile',
      file_id: id,
      priority: opts?.priority ?? DL_PRIORITY.DEFAULT,
      offset: 0,
      limit: 0,
      synchronous: opts?.synchronous ?? true,
    } as never) as { local?: { is_downloading_completed?: boolean; path?: string } };
    return localPathIfReady(res) ?? localPathIfReady(file);
  } catch {
    return null;
  } finally {
    downloadingFiles.delete(id);
  }
}

/**
 * 全局文件下载去重集合：已向 TDLib 发起下载（active）。
 * 组件卸载时**不要**因卸载而移除——TDLib 下载继续，由完成事件/快照回写收尾。
 */
export const downloadingFiles = new Set<number>();

/**
 * 响应式的正在下载文件 ID 集合，供组件渲染下载状态时使用。
 * 与 downloadingFiles Set 同步更新。
 */
export const reactiveDownloadingFiles = ref<Set<number>>(new Set());

/**
 * 待下载队列（pending）：已请求、尚未向 TDLib 发起。
 * 组件卸载 / 不再需要时按 owner 释放；无 owner 时整项取消，不发起下载。
 */
export const pendingDownloadFiles = new Set<number>();
export const reactivePendingDownloadFiles = ref<Set<number>>(new Set());

/** fileId → 仍需要该下载的 owner 集合 */
const pendingDownloadOwners = new Map<number, Set<symbol>>();

function syncDownloadingReactive() {
  reactiveDownloadingFiles.value = new Set(downloadingFiles);
}

function syncPendingReactive() {
  reactivePendingDownloadFiles.value = new Set(pendingDownloadFiles);
}

function addDownloading(fileId: number) {
  downloadingFiles.add(fileId);
  syncDownloadingReactive();
}

function deleteDownloading(fileId: number) {
  downloadingFiles.delete(fileId);
  syncDownloadingReactive();
}

/** 检查指定 file_id 是否正在下载中（响应式） */
export function isFileDownloading(fileId: number): boolean {
  return reactiveDownloadingFiles.value.has(fileId);
}

/** 是否仍在待下载队列中 */
export function isPendingDownload(fileId: number): boolean {
  return pendingDownloadFiles.has(fileId);
}

/** 是否处于下载中或排队中（UI 忙碌态） */
export function isFileBusy(fileId: number): boolean {
  return downloadingFiles.has(fileId) || pendingDownloadFiles.has(fileId);
}

/**
 * 将 fileId 登记到待下载队列。
 * @returns true 表示本 owner 新登记；false 表示已在队列或本 owner 已登记过
 */
export function enqueuePendingDownload(fileId: number, owner: symbol): boolean {
  if (downloadingFiles.has(fileId)) return false;
  let owners = pendingDownloadOwners.get(fileId);
  if (!owners) {
    owners = new Set();
    pendingDownloadOwners.set(fileId, owners);
  }
  if (owners.has(owner)) return false;
  owners.add(owner);
  pendingDownloadFiles.add(fileId);
  syncPendingReactive();
  return true;
}

/**
 * 释放某 owner 的全部待下载意图。
 * - 仍有其他 owner：保留排队
 * - 已无 owner：从等待列表移除（取消，不发起 TDLib 下载）
 * - 已进入 active 的下载：**不**取消、不暂停
 * @returns 被完全取消的 fileId 列表
 */
export function releasePendingDownloadOwner(owner: symbol): number[] {
  const cancelled: number[] = [];
  for (const [fileId, owners] of pendingDownloadOwners) {
    if (!owners.delete(owner)) continue;
    if (owners.size === 0) {
      pendingDownloadOwners.delete(fileId);
      pendingDownloadFiles.delete(fileId);
      cancelled.push(fileId);
    }
  }
  syncPendingReactive();
  return cancelled;
}

/**
 * 领取 pending 并准备真正发起下载。
 * @returns false 表示排队已被取消（组件卸载等），不应再发起
 */
export function takePendingDownload(fileId: number, owner?: symbol): boolean {
  const owners = pendingDownloadOwners.get(fileId);
  if (!pendingDownloadFiles.has(fileId) && !owners) return false;
  if (owners && owner && !owners.has(owner)) {
    // 其他 owner 仍需要时，不能被无关调用偷走
    if (owners.size > 0) return false;
  }
  pendingDownloadOwners.delete(fileId);
  pendingDownloadFiles.delete(fileId);
  syncPendingReactive();
  return true;
}

/** 供调试：当前 active / pending 数量 */
export function getDownloadQueueStats() {
  return {
    active: downloadingFiles.size,
    pending: pendingDownloadFiles.size,
  };
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
