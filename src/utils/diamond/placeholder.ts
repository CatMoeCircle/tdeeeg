/**
 * 钻石首帧占位图。
 *
 * 钻石第一次出现的大头是驱动编译那份 37 KB 片元着色器（冷启动以秒计），
 * 这段耗时和 IO / JS 都无关，WebView 里没法提前算完。能立刻做到的是「第一眼」：
 * 把渲染好的首帧截图缓存起来（内存 + Rust 侧落盘），下次有石头要出现时先按
 * 图片贴上去，等 WebGL 就绪后的第一帧再覆盖——观感与普通图片同级。
 *
 * 只保存 3 种配色各一张：配色是唯一会改变首帧外观的输入；而自转有 0.22 s
 * 的静止期（motion.ts spinStartDelaySeconds），静态图与真实首帧天然吻合，
 * 替换时不会有姿态突跳。
 */
import { invoke } from '@tauri-apps/api/core';

/** 落盘图片的版本：改动钻石着色器 / 首帧姿态 / 配色时 +1，旧缓存自然失效 */
export const DIAMOND_PLACEHOLDER_VERSION = 2;

/** 抓帧边长上限（px）：源画布通常 84–192 px，再大只是白占内存 */
const MAX_CAPTURE_PX = 256;

type Palette = number;

/** 已可绘制的占位图（ImageBitmap 优先，退回 <img>） */
const images = new Map<Palette, CanvasImageSource>();
/** 本次运行是否已经抓过该配色的帧（抓一次就够） */
const captured = new Set<Palette>();
/** 正在从磁盘读的 Promise（去重，避免并发首挂时重复 invoke） */
const loading = new Map<Palette, Promise<void>>();
let diskRequested = false;

function isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 落盘 key：只含 [A-Za-z0-9_-]，与 Rust 侧 sanitize_key 对应 */
function keyOf(palette: Palette): string {
    return `p${palette}-v${DIAMOND_PLACEHOLDER_VERSION}`;
}

/** 是否已经有可直接贴的占位图（同步判断，给挂载路径用） */
export function hasDiamondPlaceholder(palette: Palette): boolean {
    return images.has(palette);
}

/** 把占位图贴进目标 2D 画布；没有占位图时返回 false（调用方保持空白） */
export function drawDiamondPlaceholder(
    context: CanvasRenderingContext2D | null,
    palette: Palette,
    width: number,
    height: number,
): boolean {
    const image = images.get(palette);
    if (!context || !image || width <= 0 || height <= 0) return false;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return true;
}

/**
 * 从共享 GL 画布抓一帧成为该配色的占位图（每个配色只抓一次）。
 *
 * 抓帧后异步落盘（Rust 命令），下次启动可直接读回来——冷启动第一次也能
 * 像图片一样立刻出画面。落盘失败只 warn，不影响显示。
 */
export function captureDiamondPlaceholder(palette: Palette, source: HTMLCanvasElement | null): void {
    if (!source || captured.has(palette)) return;
    if (!source.width || !source.height) return;
    captured.add(palette);

    const px = Math.max(1, Math.min(MAX_CAPTURE_PX, source.width));
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0, px, px);
    images.set(palette, canvas);
    void persist(palette, canvas);
}

/** PNG 落盘：toBlob → 原始字节 → `[u8 keyLen][key][png]` 单次 IPC（不走 JSON） */
async function persist(palette: Palette, canvas: HTMLCanvasElement): Promise<void> {
    if (!isTauri()) return;
    try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) return;
        const png = new Uint8Array(await blob.arrayBuffer());
        const key = keyOf(palette);
        const payload = new Uint8Array(1 + key.length + png.length);
        payload[0] = key.length;
        for (let i = 0; i < key.length; i++) payload[1 + i] = key.charCodeAt(i) & 0xff;
        payload.set(png, 1 + key.length);
        await invoke('save_diamond_placeholder', payload);
    } catch (error) {
        console.warn('[diamond] placeholder persist failed:', error);
    }
}

/**
 * 从磁盘读回三种配色的首帧占位图（进程内只请求一次）。
 *
 * 读不到不算失败：首次运行本来就没有缓存，等抓帧路径产出即可。
 */
export function loadDiamondPlaceholders(palettes: readonly Palette[]): void {
    if (diskRequested) return;
    diskRequested = true;
    if (!isTauri()) return;
    for (const palette of palettes) void loadOne(palette);
}

function loadOne(palette: Palette): Promise<void> {
    const running = loading.get(palette);
    if (running) return running;
    const job = (async () => {
        try {
            const buffer = await invoke<ArrayBuffer>('load_diamond_placeholder', { key: keyOf(palette) });
            if (!buffer || buffer.byteLength === 0 || images.has(palette)) return;
            const image = await decode(new Blob([buffer], { type: 'image/png' }));
            if (image) images.set(palette, image);
        } catch {
            // 缓存缺失 / invoke 不可用：保持无占位图
        } finally {
            loading.delete(palette);
        }
    })();
    loading.set(palette, job);
    return job;
}

/** PNG 字节 → 可直接 drawImage 的位图（优先 ImageBitmap，避免解码在主线程排队） */
async function decode(blob: Blob): Promise<CanvasImageSource | null> {
    try {
        if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
    } catch {
        // 退回 <img>
    }
    try {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('placeholder image decode failed'));
            image.src = url;
        });
        // 解码完成即可释放对象 URL；<img> 已持有解码后的位图
        URL.revokeObjectURL(url);
        return image;
    } catch {
        return null;
    }
}
