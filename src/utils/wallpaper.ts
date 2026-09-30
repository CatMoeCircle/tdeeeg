import { appDataDir, tempDir } from '@tauri-apps/api/path';
import { copyFile, mkdir, readFile, stat, writeFile } from '@tauri-apps/plugin-fs';
import { settings, type ChatWallpaperVisual } from '../store/settings';
import i18n from '../i18n';

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

function normalizePath(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

function joinPath(...parts: string[]): string {
  return parts
    .map((p, i) => (i === 0 ? normalizePath(p) : p.replace(/^[\\/]+|[\\/]+$/g, '')))
    .filter(Boolean)
    .join('\\');
}

async function fileExists(path: string | undefined | null): Promise<boolean> {
  if (!path) return false;
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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
      img.onerror = () => reject(new Error(i18n.global.t('lng_stickers_create_open_failed')));
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(i18n.global.t('wallpaper.processImageFailed'));
    ctx.drawImage(img, 0, 0);

    const jpegBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!jpegBlob) throw new Error(i18n.global.t('wallpaper.jpegConvertFailed'));

    const dir = await tempDir();
    const outPath = `${dir.replace(/[\\/]+$/, '')}\\tdgram_wallpaper_${Date.now()}.jpg`;
    await writeFile(outPath, new Uint8Array(await jpegBlob.arrayBuffer()));
    return outPath;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ─── 按账户本地缓存（选择后写入；重启 / 切换账户直接读） ───

const ACCOUNT_WP_KEY = 'tdgram-wallpaper-by-account';

interface WallpaperCacheEntry {
  visual: ChatWallpaperVisual | null;
  /** TDLib background.id，仅作记录 */
  backgroundId?: string;
}

let activeAccountId: number | null = null;

/** 由 init / 账户切换写入当前活动账户 id */
export function bindWallpaperAccount(accountId: number | null | undefined): void {
  activeAccountId = accountId ?? null;
}

export function getWallpaperAccountId(): number | null {
  return activeAccountId;
}

function loadAllAccountWallpapers(): Record<string, WallpaperCacheEntry> {
  try {
    const raw = localStorage.getItem(ACCOUNT_WP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, WallpaperCacheEntry>;
  } catch {
    return {};
  }
}

function writeAllAccountWallpapers(all: Record<string, WallpaperCacheEntry>): void {
  try {
    localStorage.setItem(ACCOUNT_WP_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('[wallpaper] write account cache failed:', e);
  }
}

/** 读取指定账户（默认当前）的本地缓存壁纸 */
export function loadAccountWallpaper(
  accountId: number | string | null | undefined = activeAccountId,
): ChatWallpaperVisual | null {
  if (accountId == null) return null;
  return loadAllAccountWallpapers()[String(accountId)]?.visual ?? null;
}

/** 写入指定账户（默认当前）的本地缓存 */
export function saveAccountWallpaper(
  visual: ChatWallpaperVisual | null,
  backgroundId?: string,
  accountId: number | string | null | undefined = activeAccountId,
): void {
  if (accountId == null) return;
  const all = loadAllAccountWallpapers();
  all[String(accountId)] = { visual, backgroundId };
  writeAllAccountWallpapers(all);
}

/**
 * 选择壁纸后的统一落点：
 * 1. 图片复制到应用数据目录（临时/源文件可能被清理）
 * 2. 写入当前账户本地缓存
 * 3. 应用到 settings 立即生效
 */
export async function applySelectedWallpaper(
  visual: ChatWallpaperVisual | null,
  backgroundId?: string,
  sourcePathForCopy?: string,
): Promise<void> {
  let next = visual;

  // 图片壁纸：先落一份稳定副本，缓存里存副本路径
  if (visual?.kind === 'image') {
    const src = sourcePathForCopy || visual.path;
    if (src && (await fileExists(src))) {
      const copied = await copyToWallpaperDir(src, backgroundId);
      if (copied) next = { kind: 'image', path: copied };
    }
  }

  settings.chatWallpaper = next;
  saveAccountWallpaper(next, backgroundId);
  window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed'));
}

/** 把图片复制到 appData/wallpapers/<accountId>/ */
async function copyToWallpaperDir(
  sourcePath: string,
  backgroundId?: string,
): Promise<string | undefined> {
  try {
    const base = await appDataDir();
    const acct = activeAccountId == null ? 'shared' : String(activeAccountId);
    const dir = joinPath(base, 'wallpapers', acct);
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // 已存在
    }
    const ext = (sourcePath.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const name = backgroundId
      ? `bg_${String(backgroundId).replace(/[^\w-]/g, '_')}.${ext}`
      : `bg_${Date.now()}.${ext}`;
    const dest = joinPath(dir, name);
    if (normalizePath(dest) === normalizePath(sourcePath)) return dest;
    await copyFile(sourcePath, dest);
    return dest;
  } catch (e) {
    console.warn('[wallpaper] copy to wallpaper dir failed:', e);
    return undefined;
  }
}

/**
 * 启动 / 切换账户后恢复：只读本地缓存。
 * 选择时已写入缓存，这里直接灌回 settings。
 */
export function restoreWallpaperFromLocalCache(
  accountId: number | string | null | undefined = activeAccountId,
): void {
  if (accountId == null) return;
  activeAccountId = typeof accountId === 'string' ? Number(accountId) : accountId;

  const all = loadAllAccountWallpapers();
  const key = String(accountId);
  if (key in all) {
    settings.chatWallpaper = all[key].visual ?? null;
    window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed'));
    return;
  }

  if (Object.keys(all).length === 0) {
    // 旧版全局单槽迁移：首次升级时把当前 settings 视为本账户已选壁纸
    saveAccountWallpaper(settings.chatWallpaper, undefined, accountId);
    return;
  }

  // 该账户尚未选择过壁纸：无自定义壁纸
  settings.chatWallpaper = null;
  window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed'));
}

/** 切换账户 / 重载前：当前 visual 再写一次缓存 */
export function persistWallpaperBeforeReload(): void {
  if (activeAccountId == null) return;
  saveAccountWallpaper(settings.chatWallpaper);
}
