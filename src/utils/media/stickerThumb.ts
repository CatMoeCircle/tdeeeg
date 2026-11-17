/**
 * 贴纸缩略图优先下载。
 *
 * TDLib 给每个 sticker 带一张 thumbnail（静态 webp 小图）。之前只有它"恰好已经
 * 下载完"时才会显示，否则贴纸进入视口后的整段等待都是灰块——即使 TGS 只差
 * 几十毫秒，用户看到的也是"没加载"。这里在贴纸开始加载时先用缩略图优先级
 * 拉那张几 KB 的小图（TDLib 有缓存），TGS 首帧到达后再覆盖，观感与图片贴纸一致。
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import type { thumbnail } from 'tdlib-types';
import { isFileReady, tdlibSend } from '../session/tdlib';
import { DL_PRIORITY } from './downloadPriority';
import { isThumbnailImgRenderable } from './thumbnail';

/** fileId → asset URL（字符串很小，只做有界缓存） */
const urls = new Map<number, string>();
/** 同一 file 的并发请求合并 */
const inflight = new Map<number, Promise<string | undefined>>();
/** 缓存条目上限：缩略图 URL 很小，256 条足够覆盖一屏面板与聊天 */
const MAX_CACHE = 256;
/** 同时在飞的缩略图下载上限：面板一次进入视口的项可能很多，别把 TDLib 请求打爆 */
const MAX_CONCURRENT = 6;
let active = 0;
const waiting: (() => void)[] = [];

/** 拿一个下载槽位（超出上限就排队，按 FIFO 唤醒） */
async function acquireSlot(): Promise<void> {
    if (active < MAX_CONCURRENT) {
        active += 1;
        return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
}

function releaseSlot(): void {
    active = Math.max(0, active - 1);
    const next = waiting.shift();
    if (next) next();
}

function remember(fileId: number, url: string): void {
    if (urls.size >= MAX_CACHE) {
        const oldest = urls.keys().next().value;
        if (oldest !== undefined) urls.delete(oldest);
    }
    urls.set(fileId, url);
}

/**
 * 已就绪的缩略图 URL（同步，模板可直接用）。
 * 本地没下载完或者格式不可当图显示（mpeg4/webm/tgs 缩略图）时返回 undefined。
 */
export function readyStickerThumb(thumb: thumbnail | null | undefined): string | undefined {
    const file = thumb?.file;
    if (!file) return undefined;
    const cached = urls.get(file.id);
    if (cached) return cached;
    if (file.local?.is_downloading_completed && file.local.path) {
        const url = convertFileSrc(file.local.path);
        remember(file.id, url);
        return url;
    }
    return undefined;
}

/**
 * 确保缩略图本地可用并返回 asset URL。
 *
 * 用 THUMBNAIL 优先级（高于正文媒体）下载，几 KB 通常一次往返就回来；
 * 失败/不可显示一律返回 undefined，调用方保持既有占位（灰块）即可。
 */
export function ensureStickerThumb(thumb: thumbnail | null | undefined): Promise<string | undefined> {
    const file = thumb?.file;
    if (!file) return Promise.resolve(undefined);
    if (!isThumbnailImgRenderable(thumb?.format)) return Promise.resolve(undefined);

    const ready = readyStickerThumb(thumb);
    if (ready) return Promise.resolve(ready);

    const running = inflight.get(file.id);
    if (running) return running;

    const job = (async () => {
        await acquireSlot();
        try {
            const result: any = await tdlibSend({
                _: 'downloadFile',
                file_id: file.id,
                priority: DL_PRIORITY.THUMBNAIL,
                offset: 0,
                limit: 0,
                synchronous: true,
            });
            if (!isFileReady(result)) return undefined;
            const url = convertFileSrc(result.local.path);
            remember(file.id, url);
            return url;
        } catch {
            return undefined;
        } finally {
            releaseSlot();
            inflight.delete(file.id);
        }
    })();
    inflight.set(file.id, job);
    return job;
}
