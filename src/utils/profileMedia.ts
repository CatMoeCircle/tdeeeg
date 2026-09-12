import { convertFileSrc } from "@tauri-apps/api/core";
import type { audio, file, thumbnail } from "tdlib-types";
import { tdlibSend, isFileReady, downloadingFiles } from "./tdlib";
import { DL_PRIORITY } from "./downloadPriority";
import { useDownloadStore } from "../store/downloads";
import { isThumbnailImgRenderable } from "./thumbnail";

/**
 * 收集可渲染的专辑封面文件：内嵌封面优先，外部备选按清晰度从高到低。
 * 供资料音乐卡片与共享音乐列表共用。
 */
export function listAlbumCoverFiles(a: audio | undefined): file[] {
  if (!a) return [];
  const imgOk = (t: thumbnail | undefined): t is thumbnail =>
    !!t && isThumbnailImgRenderable(t.format);
  const primaries: thumbnail[] = imgOk(a.album_cover_thumbnail) ? [a.album_cover_thumbnail] : [];
  const externals = (Array.isArray(a.external_album_covers) ? a.external_album_covers : [])
    .filter(imgOk)
    .sort((x, y) => (y.width * y.height) - (x.width * x.height));
  return [...primaries, ...externals]
    .map((t) => t.file)
    .filter((f): f is file => !!f?.id);
}

/** 轮询 getFile 等待文件就绪（用于并发下载或 downloadFile 返回对象未写回路径时） */
async function waitForFileReady(
  fileId: number,
  timeoutMs = 15000,
): Promise<string | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const info = (await tdlibSend({ _: "getFile", file_id: fileId })) as file;
      if (isFileReady(info)) return convertFileSrc(info.local.path!);
    } catch {
      // getFile 瞬时失败（文件信息未同步）时继续重试
    }
    if (!downloadingFiles.has(fileId)) {
      // 下载已结束仍未就绪：视为失败
      return undefined;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}

/**
 * 下载一个文件并返回其本地 asset URL（用于个人资料页的大图 / 照片墙 / 礼物贴纸等）。
 *
 * 已下载则直接返回；否则同步触发下载后返回。下载失败或不可下载时返回 undefined。
 *
 * @param hiddenCategory 隐藏资源的细分类别（"avatar" / "story_cover" 等），
 *   用于在下载管理器中区分展示具体隐藏资源类型。调用方按用途显式传入。
 */
export async function downloadFileUrl(
  f: file | undefined,
  fileName?: string,
  hiddenCategory?: string
): Promise<string | undefined> {
  if (!f || !f.id) return undefined;
  if (isFileReady(f)) return convertFileSrc(f.local.path);
  const fileId = f.id;

  // 已在下载中：等待完成，而不是直接放弃（此前会导致高清封面永远升不上去）
  if (downloadingFiles.has(fileId)) {
    return waitForFileReady(fileId);
  }

  try {
    const ext = f.expected_size ? ".jpg" : ".bin";
    const name = fileName || `profile_${fileId}${ext}`;
    await useDownloadStore().registerDownload(fileId, name, "", 0, "avatar", undefined, undefined, undefined, true, false, hiddenCategory ?? "avatar");
    const res = await tdlibSend({
      _: "downloadFile",
      file_id: fileId,
      priority: DL_PRIORITY.THUMBNAIL,
      offset: 0,
      limit: 0,
      synchronous: true,
    });
    if (isFileReady(res)) return convertFileSrc(res.local.path);
    // 原 file / download 返回对象可能未写回 local.path，再 getFile 兜底
    const info = (await tdlibSend({ _: "getFile", file_id: fileId })) as file;
    if (isFileReady(info)) return convertFileSrc(info.local.path!);
  } catch (e) {
    console.error("Failed to download file", e);
  }
  return undefined;
}
