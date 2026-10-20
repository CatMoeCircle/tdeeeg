/**
 * 下载列表的缩略图解析：不再用 base64 data URL（体积大、每条都进 IPC/DB）。
 *
 * 优先级：
 * 1. 已下载的本体就能当图的（图片、贴纸/emoji、tgs 动画贴纸）→ 直接用本地文件。
 * 2. 音视频/文件本体不能当缩略图（视频首帧要解码、音频没有画面）→ 溯源到源消息
 *    （chat_id + message_id），取那条消息的封面/缩略图 file（`thumbnail` /
 *    `album_cover_thumbnail` / photo.sizes 最小档），本地没有就按缩略图优先级下载。
 * 3. 都没有 → undefined，由行组件回退到类型图标。
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import { ref, watch, type Ref } from "vue";
import type { DownloadItem } from "../store/downloads";
import { DL_PRIORITY } from "./downloadPriority";
import { isFileReady, tdlibSend } from "./tdlib";
import { getThumbnailMeta } from "./thumbnail";

export type MediaKind = "img" | "tgs" | "video";

export interface LocalMedia {
    kind: MediaKind;
    src: string;
}

const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv"]);

const extOf = (path: string) => (path.split(".").pop() ?? "").toLowerCase();

/** 已下载的本体能不能直接当缩略图 */
export function localMediaOf(item: DownloadItem | undefined): LocalMedia | undefined {
    const path = item?.local_path;
    if (!item || !path) return undefined;
    const ext = extOf(path);
    if (IMG_EXTS.has(ext)) return { kind: "img", src: convertFileSrc(path) };
    if (ext === "tgs") return { kind: "tgs", src: convertFileSrc(path) };
    // 动态贴纸/动画的本体是视频，可当缩略图；普通视频/音乐/文件的本体不行（要封面）
    if (VIDEO_EXTS.has(ext) && (item.file_type === "animation" || item.file_type === "sticker")) {
        return { kind: "video", src: convertFileSrc(path) };
    }
    return undefined;
}

/** 从消息内容里找"能当封面的那个 file"（最小档位图优先） */
function coverFileOfMessage(msg: unknown): { id: number; kind: MediaKind } | undefined {
    const content = (msg as { content?: Record<string, any> })?.content;
    if (!content) return undefined;

    const fromThumb = (thumb: any): { id: number; kind: MediaKind } | undefined => {
        if (!thumb?.file?.id) return undefined;
        const kind = getThumbnailMeta(thumb.format).kind;
        if (kind === "image") return { id: thumb.file.id, kind: "img" };
        if (kind === "video") return { id: thumb.file.id, kind: "video" };
        return undefined; // tgs 缩略图没法直接显示，交给图标
    };

    switch (content._) {
        case "messagePhoto": {
            const sizes: any[] = content.photo?.sizes ?? [];
            const smallest = sizes
                .filter((s) => s?.photo?.id)
                .sort((a, b) => (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0))[0];
            return smallest ? { id: smallest.photo.id, kind: "img" } : undefined;
        }
        case "messageVideo":
            return fromThumb(content.video?.thumbnail);
        case "messageAnimation":
            return fromThumb(content.animation?.thumbnail);
        case "messageDocument":
            return fromThumb(content.document?.thumbnail);
        case "messageAudio":
            return fromThumb(content.audio?.album_cover_thumbnail);
        case "messageVideoNote":
            return fromThumb(content.video_note?.thumbnail);
        default:
            return undefined;
    }
}

/** 确保缩略图文件本地可用：顺带按缩略图优先级拉一次（体积很小） */
async function ensureThumbFile(fileId: number): Promise<string | undefined> {
    try {
        const result: any = await tdlibSend({
            _: "downloadFile",
            file_id: fileId,
            priority: DL_PRIORITY.THUMBNAIL,
            offset: 0,
            limit: 0,
            synchronous: true,
        });
        if (isFileReady(result)) return result.local.path;
    } catch {
        // 退到 getFile 看一眼（并发下载中/瞬时失败）
    }
    try {
        const info: any = await tdlibSend({ _: "getFile", file_id: fileId });
        return isFileReady(info) ? info.local.path : undefined;
    } catch {
        return undefined;
    }
}

const cache = new Map<string, LocalMedia>();
const inflight = new Map<string, Promise<LocalMedia | undefined>>();

function itemKey(item: DownloadItem): string {
    return item.remote_id || `session:${item.session_file_id ?? item.file_id}`;
}

/** 溯源到源消息，取它的封面/缩略图 */
export async function resolveItemMedia(item: DownloadItem | undefined): Promise<LocalMedia | undefined> {
    if (!item) return undefined;
    const local = localMediaOf(item);
    if (local) return local;
    if (!item.chat_id || !item.message_id) return undefined;

    const key = itemKey(item);
    const hit = cache.get(key);
    if (hit) return hit;
    const running = inflight.get(key);
    if (running) return running;

    const job = (async () => {
        try {
            const msg = await tdlibSend({
                _: "getMessage",
                chat_id: item.chat_id!,
                message_id: item.message_id!,
            });
            const cover = coverFileOfMessage(msg);
            if (!cover) return undefined;
            const path = await ensureThumbFile(cover.id);
            return path ? { kind: cover.kind, src: convertFileSrc(path) } : undefined;
        } catch {
            // 消息已删除 / 未同步：回退图标
            return undefined;
        }
    })();
    inflight.set(key, job);
    try {
        const media = await job;
        if (media) cache.set(key, media);
        return media;
    } finally {
        inflight.delete(key);
    }
}

/** 行组件用：本体优先，其次源消息封面，都没有返回 undefined */
export function useItemMedia(getItem: () => DownloadItem | undefined): Ref<LocalMedia | undefined> {
    const media = ref<LocalMedia | undefined>(localMediaOf(getItem()));
    let seq = 0;
    watch(
        () => {
            const item = getItem();
            return [item?.remote_id, item?.local_path, item?.is_completed, item?.message_id] as const;
        },
        async () => {
            const item = getItem();
            const mine = ++seq;
            const local = localMediaOf(item);
            if (local) {
                media.value = local;
                return;
            }
            const resolved = await resolveItemMedia(item);
            if (mine === seq) media.value = resolved;
        },
        { immediate: true },
    );
    return media;
}
