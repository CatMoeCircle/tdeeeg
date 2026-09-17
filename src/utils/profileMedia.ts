import { convertFileSrc } from "@tauri-apps/api/core";
import type { audio, file, thumbnail } from "tdlib-types";
import { tdlibSend, isFileReady, downloadingFiles } from "./tdlib";
import { DL_PRIORITY } from "./downloadPriority";
import { useDownloadStore, remoteIdOf } from "../store/downloads";
import { DL_TAG } from "./downloadTags";
import { isThumbnailImgRenderable } from "./thumbnail";

/**
 * 收集可渲染的专辑封面文件：仅使用内嵌 album_cover_thumbnail。
 * 不再下载 external_album_covers；封面为空时由调用方走 iTunes Search 兜底。
 * 供资料音乐卡片与共享音乐列表共用。
 */
export function listAlbumCoverFiles(a: audio | undefined): file[] {
  if (!a) return [];
  const imgOk = (t: thumbnail | undefined): t is thumbnail =>
    !!t && isThumbnailImgRenderable(t.format);
  return imgOk(a.album_cover_thumbnail) && a.album_cover_thumbnail.file?.id
    ? [a.album_cover_thumbnail.file]
    : [];
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
 * @param hiddenCategory 隐藏资源的细分类别（"avatar" / "story_cover" 等）
 * @param extra 额外标签 / 来源展示
 */
export async function downloadFileUrl(
  f: file | undefined,
  fileName?: string,
  hiddenCategory?: string,
  extra?: { tags?: string[]; sourceLabel?: string; chatTitle?: string },
): Promise<string | undefined> {
  if (!f || !f.id) return undefined;
  if (isFileReady(f)) return convertFileSrc(f.local.path);
  const fileId = f.id;

  if (downloadingFiles.has(fileId)) {
    return waitForFileReady(fileId);
  }

  try {
    const ext = f.expected_size ? ".jpg" : ".bin";
    const name = fileName || `profile_${fileId}${ext}`;
    const tags = [...(extra?.tags ?? [])];
    // 大图头像：高清头像
    if (hiddenCategory === "avatar" && f.id && !tags.includes(DL_TAG.HD_AVATAR) && fileName?.includes("big")) {
      tags.push(DL_TAG.HD_AVATAR);
    }
    await useDownloadStore().registerDownload(
      fileId, name,
      extra?.chatTitle || extra?.sourceLabel || "",
      0,
      hiddenCategory === "music_cover" || hiddenCategory === "story_cover" ? "photo" : "avatar",
      undefined, undefined, undefined, true, false,
      hiddenCategory ?? "avatar",
      false,
      tags.length ? tags : undefined,
      extra?.sourceLabel,
      remoteIdOf(f),
    );
    const res = await tdlibSend({
      _: "downloadFile",
      file_id: fileId,
      priority: DL_PRIORITY.THUMBNAIL,
      offset: 0,
      limit: 0,
      synchronous: true,
    });
    if (isFileReady(res)) return convertFileSrc(res.local.path);
    const info = (await tdlibSend({ _: "getFile", file_id: fileId })) as file;
    if (isFileReady(info)) return convertFileSrc(info.local.path!);
  } catch (e) {
    console.error("Failed to download file", e);
  }
  return undefined;
}
