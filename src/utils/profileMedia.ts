import { convertFileSrc } from "@tauri-apps/api/core";
import type { file } from "tdlib-types";
import { tdlibSend, isFileReady, downloadingFiles } from "./tdlib";
import { useDownloadStore } from "../store/downloads";

/**
 * 下载一个文件并返回其本地 asset URL（用于个人资料页的大图 / 照片墙 / 礼物贴纸等）。
 *
 * 已下载则直接返回；否则同步触发下载后返回。下载失败或不可下载时返回 undefined。
 */
export async function downloadFileUrl(
  f: file | undefined,
  fileName?: string
): Promise<string | undefined> {
  if (!f || !f.id) return undefined;
  if (isFileReady(f)) return convertFileSrc(f.local.path);

  if (!downloadingFiles.has(f.id)) {
    try {
      const ext = f.expected_size ? ".jpg" : ".bin";
      const name = fileName || `profile_${f.id}${ext}`;
      await useDownloadStore().registerDownload(f.id, name, "", 0, "avatar", undefined, undefined, undefined, true);
      const res = await tdlibSend({
        _: "downloadFile",
        file_id: f.id,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });
      if (isFileReady(res)) return convertFileSrc(res.local.path);
    } catch (e) {
      console.error("Failed to download file", e);
    }
  }
  return undefined;
}
