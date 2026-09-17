import { tempDir } from '@tauri-apps/api/path';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { tdlibSend, isFileReady, safeDownloadFile } from './tdlib';
import { settings, type ChatWallpaperVisual } from '../store/settings';
import { DL_PRIORITY } from './downloadPriority';
import type { background, file } from 'tdlib-types';

/** RGB 整数转 CSS 颜色（Telegram 为 0xRRGGBB） */
export function telegramColorToCss(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, '0')}`;
}

function guessImageMime(path: string): string {
  const ext = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/**
 * 将任意本地图片转为 TDLib 壁纸要求的 JPEG。
 * 必须走 Tauri readFile + Blob URL：convertFileSrc 的 asset URL 画到 canvas 会污染画布，toBlob 抛 SecurityError。
 */
export async function ensureJpegWallpaper(path: string): Promise<string> {
  const ext = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return path;

  const bytes = await readFile(path);
  const blob = new Blob([bytes], { type: guessImageMime(path) });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('图片加载失败'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法处理图片');
    ctx.drawImage(img, 0, 0);

    const jpegBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!jpegBlob) throw new Error('图片转换为 JPEG 失败');

    const dir = await tempDir();
    const outPath = `${dir.replace(/[\\/]+$/, '')}\\tdgram_wallpaper_${Date.now()}.jpg`;
    await writeFile(outPath, new Uint8Array(await jpegBlob.arrayBuffer()));
    return outPath;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 轮询等待 TDLib 文件进入可用状态。
 * 本地壁纸上传时：等 is_uploading_active 结束且拿到本地路径。
 */
export async function waitForFileSettled(fileId: number, timeoutMs = 90_000): Promise<file> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const f = await tdlibSend({ _: 'getFile', file_id: fileId }) as file;
    const uploading = f.remote?.is_uploading_active === true;
    const hasLocalPath = !!f.local?.path;
    if (!uploading && hasLocalPath) return f;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('壁纸上传超时，请检查网络后重试');
}

/** 解析 background 的高清本地路径；必要时先下载 */
export async function resolveBackgroundPath(bg: background): Promise<string | undefined> {
  const docFile = bg.document?.document;
  if (!docFile) return undefined;
  if (isFileReady(docFile) && docFile.local.path) return docFile.local.path;
  await safeDownloadFile(docFile.id, true, DL_PRIORITY.DEFAULT);
  const refreshed = await tdlibSend({ _: 'getFile', file_id: docFile.id }) as file;
  if (isFileReady(refreshed) && refreshed.local.path) return refreshed.local.path;
  return undefined;
}

/** 将 TDLib background 写入本地 settings.chatWallpaper（默认壁纸视觉） */
export async function applyBackgroundToSettings(bg: background | null | undefined): Promise<void> {
  if (!bg) {
    settings.chatWallpaper = null;
    window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed'));
    return;
  }

  const type = bg.type;
  if (type._ === 'backgroundTypeFill' && type.fill?._ === 'backgroundFillSolid') {
    settings.chatWallpaper = {
      kind: 'color',
      color: telegramColorToCss(type.fill.color),
    };
    window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed'));
    return;
  }

  const path = await resolveBackgroundPath(bg);
  const visual: ChatWallpaperVisual | null = path
    ? { kind: 'image', path }
    : null;
  settings.chatWallpaper = visual;
  window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed'));
}

/**
 * 从 TDLib 已安装壁纸中恢复默认壁纸视觉（is_default）。
 * 启动时调用，避免只依赖 localStorage 里可能失效的本地路径。
 */
export async function restoreDefaultWallpaperFromTdlib(forDarkTheme = false): Promise<void> {
  try {
    const result = await tdlibSend({
      _: 'getInstalledBackgrounds',
      for_dark_theme: forDarkTheme,
    }) as { backgrounds?: background[] };
    const list = result.backgrounds ?? [];
    const def = list.find((b) => b.is_default);
    if (def) {
      await applyBackgroundToSettings(def);
    }
  } catch (e) {
    console.warn('[wallpaper] restore default from TDLib failed:', e);
  }
}

let syncListenerInstalled = false;

/**
 * 监听 updateDefaultBackground，保持 settings.chatWallpaper 与 TDLib 同步
 * （含其他设备改默认壁纸、本端 setDefaultBackground 后的远端回写）。
 */
export async function initDefaultBackgroundSync(): Promise<void> {
  if (syncListenerInstalled) return;
  syncListenerInstalled = true;

  const { onTdlibUpdate } = await import('../store/tdlibBus');
  onTdlibUpdate('other', async (update) => {
    if (update._ !== 'updateDefaultBackground') return;
    if ((update as any).for_dark_theme) return;
    await applyBackgroundToSettings(((update as any).background as background | null) ?? null);
  });
}
