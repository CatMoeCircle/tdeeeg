import { tdlibSend } from './tdlib';

/**
 * 视频解码器（codec）识别。
 *
 * TDLib 只在 alternative_videos 上给出 codec，主文件（原画）没有该字段。
 * 这里从 TDLib 已缓存的字节里扫描容器头：MP4 的 stsd sample entry fourcc、
 * WebM/MKV 的 EBML CodecID，得到真实编码名补齐这个缺口。
 *
 * 只读已缓存字节，不发起下载：读不到（还没下到 / moov 在文件尾部且未缓存）
 * 就返回 null，UI 不显示解码器气泡，绝不为了一个标签去额外拉数据。
 */

/** 头/尾扫描窗口：faststart 的 moov 在头部；非 faststart 的 moov 在尾部 */
const HEAD_BYTES = 512 * 1024;
const TAIL_BYTES = 1024 * 1024;

/** MP4 sample entry fourcc → 展示用解码器名 */
const MP4_CODECS: Record<string, string> = {
    avc1: 'H.264',
    avc3: 'H.264',
    hvc1: 'H.265',
    hev1: 'H.265',
    av01: 'AV1',
    vp09: 'VP9',
    vp08: 'VP8',
    mp4v: 'MPEG-4',
};

/** WebM / MKV 的 EBML CodecID 明文 → 展示用解码器名 */
const WEBM_CODECS: Array<[string, string]> = [
    ['V_AV1', 'AV1'],
    ['V_VP9', 'VP9'],
    ['V_VP8', 'VP8'],
    ['V_MPEGH/ISO/HEVC', 'H.265'],
    ['V_MPEG4/ISO/AVC', 'H.264'],
];

/** TDLib alternative video 的 codec / 容器 fourcc → 展示用解码器名 */
export function formatVideoCodec(codec: string): string {
    const c = (codec || '').trim().toLowerCase();
    if (!c) return '';
    if (c.includes('av1') || c.includes('av01')) return 'AV1';
    if (c.includes('h265') || c.includes('h.265') || c.includes('hevc')) return 'H.265';
    if (c.includes('vp9')) return 'VP9';
    if (c.includes('vp8')) return 'VP8';
    if (c.includes('h264') || c.includes('h.264') || c.includes('avc')) return 'H.264';
    if (c.includes('mpeg4') || c.includes('mp4v')) return 'MPEG-4';
    return c.toUpperCase();
}

function toBytes(base64: string): Uint8Array {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/** 逐块转 latin1 字符串（用于在二进制里找 ASCII 标识） */
function toAscii(bytes: Uint8Array): string {
    const CHUNK = 8192;
    let out = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        out += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }
    return out;
}

/**
 * 在字节窗口里嗅探解码器：
 * - MP4：stsd 后第一个 sample entry 的 fourcc 位于 'stsd' 标识 +16 处
 *   （8 字节 box 头 + 4 字节 version/flags + 4 字节 entry_count + 4 字节 entry size）
 * - WebM / MKV：CodecID 元素里直接是明文
 */
function sniffCodec(bytes: Uint8Array): string | null {
    for (let i = 0; i + 20 <= bytes.length; i++) {
        if (bytes[i] !== 0x73 || bytes[i + 1] !== 0x74 || bytes[i + 2] !== 0x73 || bytes[i + 3] !== 0x64) continue;
        const fourcc = String.fromCharCode(bytes[i + 16], bytes[i + 17], bytes[i + 18], bytes[i + 19]);
        const hit = MP4_CODECS[fourcc];
        // 音频轨 stsd（mp4a 等）不在表里，继续往后找视频轨
        if (hit) return hit;
    }
    const ascii = toAscii(bytes);
    for (const [marker, name] of WEBM_CODECS) {
        if (ascii.includes(marker)) return name;
    }
    return null;
}

/** 读取 TDLib 缓存中指定范围的字节；范围未缓存或读取失败返回 null */
async function readCachedBytes(fileId: number, offset: number, count: number): Promise<Uint8Array | null> {
    if (count <= 0) return null;
    try {
        const res = await tdlibSend({ _: 'readFilePart', file_id: fileId, offset, count });
        const data = (res as { data?: string } | null | undefined)?.data;
        return data ? toBytes(data) : null;
    } catch {
        return null;
    }
}

/** 同一文件的探测结果缓存（含进行中的请求）；失败不缓存，稍后仍可重试。
 *  key 用「fileId:大小」：会话内 file id 可能被复用，单靠 id 会串到别的视频上。 */
const codecCache = new Map<string, Promise<string | null>>();

/**
 * 探测本地缓存视频文件的解码器名（H.264 / H.265 / AV1 …）。
 * 只做缓存读取，不触发下载；失败返回 null，调用方按「未知」处理。
 */
export function probeVideoCodec(fileId: number, fileSize: number): Promise<string | null> {
    if (!fileId) return Promise.resolve(null);
    const cacheKey = `${fileId}:${fileSize}`;
    const cached = codecCache.get(cacheKey);
    if (cached) return cached;

    const task = (async (): Promise<string | null> => {
        // 头部窗口：faststart MP4 的 moov/stsd、WebM 的 EBML CodecID 都在这里
        const headLength = fileSize > 0 ? Math.min(HEAD_BYTES, fileSize) : HEAD_BYTES;
        const head = await readCachedBytes(fileId, 0, headLength);
        const fromHead = head ? sniffCodec(head) : null;
        if (fromHead) return fromHead;
        // 尾部窗口：非 faststart 的 MP4 把 moov 放在文件末尾（只有整文件已缓存才读得到）
        if (fileSize > HEAD_BYTES) {
            const tailOffset = Math.max(0, fileSize - TAIL_BYTES);
            const tail = await readCachedBytes(fileId, tailOffset, fileSize - tailOffset);
            const fromTail = tail ? sniffCodec(tail) : null;
            if (fromTail) return fromTail;
        }
        return null;
    })();

    codecCache.set(cacheKey, task);
    void task.then((codec) => {
        if (!codec) codecCache.delete(cacheKey);
    });
    return task;
}
