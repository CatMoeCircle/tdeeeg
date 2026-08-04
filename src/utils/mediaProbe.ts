import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';

/**
 * 探测本地媒体文件的分辨率/时长/GIF 多帧等信息。
 * 所有函数返回空对象或 undefined 表示「无法解码」，调用方需按文档发送兜底。
 */

export interface ProbedImage {
    width: number;
    height: number;
    /** 是否多帧 GIF（动图） */
    gif: boolean;
    /** 是否能解码出有效尺寸（width/height 均 > 0） */
    ok: boolean;
}

export interface ProbedVideo {
    width: number;
    height: number;
    /** 时长（秒） */
    duration: number;
    ok: boolean;
}

function toUrl(path: string): string {
    return convertFileSrc(path);
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load error'));
        img.src = url;
    });
}

/** 判断文件是否为 GIF 且是否为多帧（动图）。读取文件需要完整读一次，仅在图片较小时使用。 */
async function isMultiFrameGif(path: string, maxBytes = 10 * 1024 * 1024): Promise<boolean> {
    let buf: Uint8Array;
    try {
        const data = (await readFile(path)) as Uint8Array;
        buf = data;
    } catch {
        return false;
    }
    // 仅对小于上限的文件做完整帧扫描，避免大文件读入内存
    if (buf.length > maxBytes) return false;
    if (buf[0] !== 0x47 || buf[1] !== 0x49 || buf[2] !== 0x46) return false; // "GIF"
    // 逐块解析 GIF 块找出 graphic control extension / 帧
    // GIF 头部 13 字节，之后是全局色彩表，再到 image descriptors
    let offset = 13;
    const gctFlag = (buf[10] & 0x80) !== 0;
    const gctSize = gctFlag ? 2 << (buf[10] & 0x07) : 0;
    offset += gctSize * 3;
    let frameCount = 0;
    while (offset < buf.length) {
        const b = buf[offset];
        if (b === 0x3b) break; // 0x3B = trailer end
        if (b === 0x2c) {
            // image descriptor (0x2C)
            frameCount++;
            offset += 10;
            const lctFlag = (buf[offset] & 0x80) !== 0;
            const lctSize = lctFlag ? 2 << (buf[offset] & 0x07) : 0;
            offset += 1 + lctSize * 3;
            // LZW min code size
            if (offset >= buf.length) break;
            const minCode = buf[offset];
            offset += 1;
            if (minCode < 2 || minCode > 12) break;
            let dataSize = buf[offset];
            offset += 1;
            while (dataSize > 0 && offset < buf.length) {
                offset += dataSize;
                if (offset >= buf.length) break;
                dataSize = buf[offset];
                offset += 1;
            }
        } else if (b === 0x21) {
            // extension block
            offset += 1; // label
            if (offset >= buf.length) break;
            let size = buf[offset];
            offset += 1;
            while (size > 0 && offset < buf.length) {
                offset += size;
                if (offset >= buf.length) break;
                size = buf[offset];
                offset += 1;
            }
        } else {
            break;
        }
        if (frameCount > 1) break;
    }
    return frameCount > 1;
}

/**
 * 探测图片：返回分辨率与是否为多帧 GIF。
 * 无法解码尺寸时返回 { ok:false }。
 */
export async function probeImage(path: string): Promise<ProbedImage> {
    try {
        const img = await loadImage(toUrl(path));
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (!width || !height) return { width: 0, height: 0, gif: false, ok: false };
        // isMultiFrameGif 内部会先判断文件是否为 GIF，非 GIF 直接返回 false；
        // 只对小于上限的小文件做完整帧扫描，避免大图片读入内存
        const gif = await isMultiFrameGif(path);
        return { width, height, gif, ok: true };
    } catch {
        return { width: 0, height: 0, gif: false, ok: false };
    }
}

/**
 * 探测视频：返回分辨率与时长。
 * 无法解码时返回 { ok:false }。
 */
export async function probeVideo(path: string, timeoutMs = 8000): Promise<ProbedVideo> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        let settled = false;
        let timer = 0;
        const finish = (w: number, h: number, d: number) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            video.onloadedmetadata = null;
            video.onerror = null;
            video.src = '';
            resolve({ width: w, height: h, duration: isFinite(d) ? d : 0, ok: w > 0 && h > 0 });
        };
        video.onloadedmetadata = () => {
            finish(video.videoWidth, video.videoHeight, video.duration);
        };
        video.onerror = () => {
            finish(0, 0, 0);
        };
        timer = window.setTimeout(() => {
            finish(0, 0, 0);
        }, timeoutMs);
        video.src = toUrl(path);
    });
}
