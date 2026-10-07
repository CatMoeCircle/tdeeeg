import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import type { BackgroundFill, ChatTheme, background, emojiChatTheme, file, themeSettings } from 'tdlib-types';
import type { ChatWallpaperVisual } from '../store/settings';

/**
 * 对话背景（TDLib `Background`）→ 可渲染模型。
 *
 * 对齐 Unigram 的 ChatBackgroundPresenter / ChatBackgroundBrush / ChatBackgroundFreeform：
 *
 * | TDLib 类型               | 渲染                                                        |
 * |--------------------------|-------------------------------------------------------------|
 * | backgroundTypeFill       | 纯色 / 线性渐变 / freeform 渐变                                |
 * | backgroundTypePattern    | 底层填充 + 图案平铺，intensity 控强度、is_inverted 走反色遮罩      |
 * | backgroundTypeWallpaper  | 原图 cover（is_blurred 走模糊）                                |
 * | backgroundTypeChatTheme  | 按主题名查 emoji 主题缓存，取其明/暗背景后递归解析                 |
 *
 * 渐变方向、freeform 位图、图案强度都按 Unigram 的实现搬过来，保证与官方客户端一致。
 */

/** 背景图案文档的 MIME（gzip 压缩的 SVG 子集） */
const TGWALL_PATTERN_MIME = 'application/x-tgwallpattern';

/**
 * 图案的显示缩放：图案文档按 4 倍尺寸绘制（默认背景的 pattern.tgv / pattern_01.png
 * 都是 1440×2960），客户端一律按 1/4 铺。
 * Unigram 的原生实现是 `ChatBackgroundPattern.ComputeRenderSize = size * 0.25`
 * （见 Telegram.Native/ChatBackgroundPattern.h），这里对齐同一规则。
 */
const PATTERN_SCALE = 0.25;

/** RGB 整数转 CSS 颜色（Telegram 为 0xRRGGBB） */
function telegramColorToCss(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, '0')}`;
}

// ─── fill（纯色 / 渐变 / freeform） ───

export type FillVisual =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; topColor: string; bottomColor: string; rotation: number }
  | { kind: 'freeform'; colors: string[] };

function parseBackgroundFill(fill: BackgroundFill | null | undefined): FillVisual | null {
  if (!fill) return null;
  switch (fill._) {
    case 'backgroundFillSolid':
      return { kind: 'solid', color: telegramColorToCss(fill.color) };
    case 'backgroundFillGradient':
      return {
        kind: 'gradient',
        topColor: telegramColorToCss(fill.top_color),
        bottomColor: telegramColorToCss(fill.bottom_color),
        rotation: fill.rotation_angle,
      };
    case 'backgroundFillFreeformGradient': {
      const colors = (fill.colors ?? []).map(telegramColorToCss);
      if (colors.length >= 3) return { kind: 'freeform', colors: colors.slice(0, 4) };
      if (colors.length === 1) return { kind: 'solid', color: colors[0] };
      return null;
    }
    default:
      return null;
  }
}

/** fill → CSS 背景层样式；freeform 用 canvas 生成的 50×50 位图 cover 铺开 */
export function fillToCss(fill: FillVisual | null | undefined): Record<string, string> {
  if (!fill) return {};
  if (fill.kind === 'solid') return { backgroundColor: fill.color };
  if (fill.kind === 'gradient') {
    // Telegram 的 rotation_angle：0 = 自上而下，顺时针递增；
    // CSS 的 linear-gradient 角度：0deg = 自下而上（朝上），故偏移 180。
    return {
      backgroundImage: `linear-gradient(${(fill.rotation + 180) % 360}deg, ${fill.topColor}, ${fill.bottomColor})`,
    };
  }
  const url = freeformGradientDataUrl(fill.colors);
  if (!url) return { backgroundColor: fill.colors[0] };
  return { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
}

/** fill 的主色调：图片 / 图案未就绪时的占位底色 */
export function fillBaseColor(fill: FillVisual | null | undefined): string | null {
  if (!fill) return null;
  if (fill.kind === 'solid') return fill.color;
  if (fill.kind === 'gradient') return averageColor([fill.topColor, fill.bottomColor]);
  return averageColor(fill.colors);
}

function averageColor(colors: string[]): string {
  const sum = [0, 0, 0];
  for (const color of colors) {
    const rgb = hexToRgb(color);
    sum[0] += rgb[0];
    sum[1] += rgb[1];
    sum[2] += rgb[2];
  }
  const n = colors.length || 1;
  return `rgb(${Math.round(sum[0] / n)}, ${Math.round(sum[1] / n)}, ${Math.round(sum[2] / n)})`;
}

function hexToRgb(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16) || 0,
    parseInt(hex.slice(2, 4), 16) || 0,
    parseInt(hex.slice(4, 6), 16) || 0,
  ];
}

// ─── freeform 渐变（Unigram ChatBackgroundFreeform.GenerateGradient 的移植） ───

/** 8 个锚点，按 phase 左旋后每隔一个取 4 个（3 色时只用前 3 个） */
const FREEFORM_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [0.8, 0.1], [0.6, 0.2], [0.35, 0.25], [0.25, 0.6],
  [0.2, 0.9], [0.4, 0.8], [0.65, 0.75], [0.75, 0.4],
];

/** 位图尺寸与 Unigram 一致：50×50 拉伸铺开，天然形成柔和 swirl */
const FREEFORM_SIZE = 50;

const freeformCache = new Map<string, string>();

function freeformPositions(phase: number): ReadonlyArray<readonly [number, number]> {
  const step = ((phase % 8) + 8) % 8;
  return [0, 1, 2, 3].map((i) => FREEFORM_POSITIONS[(i * 2 + step) % 8]);
}

/** freeform 渐变位图（data URL）。同一配色只算一次。 */
function freeformGradientDataUrl(colors: string[], phase = 0): string {
  const key = `${phase}|${colors.join(',')}`;
  const cached = freeformCache.get(key);
  if (cached !== undefined) return cached;

  const url = renderFreeform(colors, phase);
  freeformCache.set(key, url);
  return url;
}

function renderFreeform(colors: string[], phase: number): string {
  const size = FREEFORM_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const rgb = colors.map(hexToRgb);
  const positions = freeformPositions(phase);
  const count = Math.min(rgb.length, positions.length);
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y++) {
    const dy = y / size - 0.5;
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5;
      const centerDistance = Math.sqrt(dx * dx + dy * dy);

      // 中心向外旋转的 swirl，把 4 个锚点扭成 Telegram 那种柔和色带
      const swirl = 0.35 * centerDistance;
      const theta = swirl * swirl * 0.8 * 8;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const px = clamp01(0.5 + dx * cos - dy * sin);
      const py = clamp01(0.5 + dx * sin + dy * cos);

      let sum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < count; i++) {
        const ex = px - positions[i][0];
        const ey = py - positions[i][1];
        const d = Math.max(0, 0.9 - Math.sqrt(ex * ex + ey * ey));
        const weight = d * d * d * d;
        sum += weight;
        r += (weight * rgb[i][0]) / 255;
        g += (weight * rgb[i][1]) / 255;
        b += (weight * rgb[i][2]) / 255;
      }

      const offset = (y * size + x) * 4;
      if (sum > 0) {
        // canvas ImageData 是 RGBA；官方写的是 BGRA 位图（Unigram ChatBackgroundControl
        // .GenerateGradient），照搬字节序会把红蓝写反 → 自由渐变整片偏色
        data[offset] = clamp255((r / sum) * 255);
        data[offset + 1] = clamp255((g / sum) * 255);
        data[offset + 2] = clamp255((b / sum) * 255);
      }
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

// ─── 渲染模型 ───

export interface ChatBackgroundPattern {
  /** 可直接用于 CSS 的图案地址（asset: 或 blob:） */
  url: string;
  /** 单个图块尺寸（CSS px），取图案原始尺寸 × PATTERN_SCALE */
  tileWidth: number;
  tileHeight: number;
  /** 强度 0-1（TDLib 为 0-100） */
  intensity: number;
  /** 反色：填充只出现在图案内，其余为黑（深色主题专用） */
  inverted: boolean;
}

export interface ChatBackgroundWallpaper {
  url: string;
  /** TDLib `is_blurred` */
  blurred: boolean;
}

export interface ChatBackgroundRender {
  /** 底层填充；pattern 时作为图案的底色 */
  fill: FillVisual | null;
  pattern?: ChatBackgroundPattern;
  wallpaper?: ChatBackgroundWallpaper;
  /** 暗色主题压暗百分比 0-100（来自 chatBackground.dark_theme_dimming） */
  dimming: number;
  /** 兜底底色：内容为空、图片未就绪时的占位 */
  baseColor: string;
}

const DEFAULT_BASE_COLOR = '#f5f5f5';

export interface ResolveChatBackgroundOptions {
  /** 当前是否深色主题（决定 emoji 主题取明/暗背景） */
  dark: boolean;
  /** emoji 聊天主题缓存（backgroundTypeChatTheme 只带主题名） */
  emojiThemes?: ReadonlyMap<string, emojiChatTheme>;
  /** 对话主题：gift 主题内联携带背景，优先于按名查表 */
  theme?: ChatTheme | null;
  /**
   * 图片取哪份文件：
   * - `full`（默认）用原图，未下载完成时回落缩略图占位
   * - `thumbnail` 只用缩略图（设置页小尺寸预览用，避免拉原图）
   */
  files?: 'full' | 'thumbnail';
}

/**
 * 把 TDLib 背景解析成可渲染模型。无法解析（未知类型 / 主题缺缓存）时返回 null。
 */
export async function resolveChatBackground(
  background: background | null | undefined,
  options: ResolveChatBackgroundOptions,
  depth = 0,
): Promise<ChatBackgroundRender | null> {
  const type = background?.type;
  if (!background || !type) return null;

  if (type._ === 'backgroundTypeFill') {
    return withBaseColor({ fill: parseBackgroundFill(type.fill), dimming: 0 });
  }

  if (type._ === 'backgroundTypePattern') {
    const pattern = await resolvePattern(background);
    return withBaseColor({
      fill: parseBackgroundFill(type.fill),
      pattern: pattern
        ? { ...pattern, intensity: clamp01(type.intensity / 100), inverted: type.is_inverted }
        : undefined,
      dimming: 0,
    });
  }

  if (type._ === 'backgroundTypeWallpaper') {
    const url = resolveDocumentUrl(background, options.files ?? 'full');
    return withBaseColor({
      fill: null,
      wallpaper: url ? { url, blurred: type.is_blurred } : undefined,
      dimming: 0,
    });
  }

  if (type._ === 'backgroundTypeChatTheme') {
    // 主题背景本身是完整的 background，递归解析（深度兜底防环）
    if (depth >= 2) return null;
    const themed = resolveChatThemeBackground(type.theme_name, options);
    if (!themed) return null;
    return resolveChatBackground(themed, { ...options, theme: null }, depth + 1);
  }

  return null;
}

function withBaseColor(partial: Omit<ChatBackgroundRender, 'baseColor'>): ChatBackgroundRender {
  return { ...partial, baseColor: fillBaseColor(partial.fill) ?? DEFAULT_BASE_COLOR };
}

/** backgroundTypeChatTheme → emoji 主题（或内联 gift 主题）在当前明暗下的背景 */
function resolveChatThemeBackground(
  themeName: string,
  options: ResolveChatBackgroundOptions,
): background | null {
  const theme = options.theme;
  if (theme?._ === 'chatThemeGift') {
    return pickThemeBackground(theme.gift_theme, options.dark);
  }
  const emoji = options.emojiThemes?.get(themeName);
  if (!emoji) return null;
  return pickThemeBackground(emoji, options.dark);
}

interface ChatThemeSettings {
  light_settings?: themeSettings;
  dark_settings?: themeSettings;
}

function pickThemeBackground(settings: ChatThemeSettings, dark: boolean): background | null {
  const target = dark ? settings.dark_settings : settings.light_settings;
  return target?.background ?? null;
}

// ─── 文件解析 ───

/**
 * 壁纸图片地址。`full` 优先原图，未就绪时退回缩略图（占位），
 * 避免首帧空白；`thumbnail` 直接用缩略图。
 */
function resolveDocumentUrl(background: background, files: 'full' | 'thumbnail'): string | null {
  const document = background.document;
  if (!document) return null;

  const full = readyPath(document.document);
  const thumbnail = readyPath(document.thumbnail?.file);
  const path = files === 'thumbnail' ? thumbnail ?? full : full ?? thumbnail;
  return path ? convertFileSrc(path) : null;
}

function readyPath(file: file | null | undefined): string | null {
  const local = file?.local;
  return local?.is_downloading_completed && local.path ? local.path : null;
}

/** 背景原图文件（图案 / 壁纸需要下载的那份） */
export function backgroundDocumentFile(background: background): file | null {
  return background.document?.document ?? null;
}

const patternCache = new Map<string, Omit<ChatBackgroundPattern, 'intensity' | 'inverted'> | null>();

/**
 * 图案图块：TGV（gzip 压缩的 SVG）解压后转 blob URL，PNG 直接用 asset URL。
 * 图块尺寸 = 图案原始尺寸 × PATTERN_SCALE，与官方客户端一致。
 */
async function resolvePattern(
  background: background,
): Promise<Omit<ChatBackgroundPattern, 'intensity' | 'inverted'> | null> {
  const document = background.document;
  const path = readyPath(document?.document);
  if (!document || !path) return null;

  const mime = document.mime_type ?? '';
  const key = `${mime}|${path}`;
  const cached = patternCache.get(key);
  if (cached !== undefined) return cached;

  let resolved: Omit<ChatBackgroundPattern, 'intensity' | 'inverted'> | null = null;
  try {
    let url: string | null = null;
    let source: { width: number; height: number } | null = null;

    if (mime === TGWALL_PATTERN_MIME) {
      const svg = await decompressTgv(await readFile(path));
      if (svg) {
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        // SVG 只有 viewBox、没有 width/height，<img> 量到的是浏览器默认尺寸（73×150），
        // 必须自己按 SVG 用户单位取尺寸再缩放。
        source = svgUserSize(svg);
      }
    } else {
      url = convertFileSrc(path);
      const natural = await imageSize(url);
      if (natural) {
        source = { width: natural.width * PATTERN_SCALE, height: natural.height * PATTERN_SCALE };
      }
    }

    if (url) {
      const size = source ?? (await imageSize(url));
      resolved = {
        url,
        tileWidth: clampTile(size?.width ?? 360),
        tileHeight: clampTile(size?.height ?? 740),
      };
    }
  } catch (e) {
    console.warn('[chatBackground] resolve pattern failed:', e);
    resolved = null;
  }

  patternCache.set(key, resolved);
  return resolved;
}

/** SVG 根元素的用户单位尺寸（已按 PATTERN_SCALE 折算）：优先 width/height，其次 viewBox */
function svgUserSize(svg: string): { width: number; height: number } | null {
  const tag = svg.match(/<svg[^>]*>/i)?.[0];
  if (!tag) return null;

  const attribute = (name: string): string | null => {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return match ? match[1] : null;
  };
  const length = (value: string | null): number | null => {
    if (!value || value.includes('%')) return null;
    const match = value.match(/^\s*(-?[\d.]+)/);
    const parsed = match ? Number(match[1]) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed * PATTERN_SCALE : null;
  };

  const width = length(attribute('width'));
  const height = length(attribute('height'));
  if (width && height) return { width, height };

  const viewBox = attribute('viewBox')?.split(/[\s,]+/).map(Number);
  if (viewBox && viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2] * PATTERN_SCALE, height: viewBox[3] * PATTERN_SCALE };
  }
  return null;
}

/** TGV = gzip 流，解压后是 SVG 文本；非 gzip 则按纯文本当 SVG 用 */
async function decompressTgv(bytes: Uint8Array): Promise<string | null> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    const text = new TextDecoder().decode(bytes);
    return text.includes('<svg') ? text : null;
  }
  if (typeof DecompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function clampTile(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 360;
  return Math.max(40, Math.min(Math.round(size), 2048));
}

// ─── 本地兜底（settings.chatWallpaper） ───

/**
 * 本地缓存的默认壁纸 → 渲染模型。
 * 云端（TDLib）默认背景未到达时用它顶上，保证启动即有背景而不是白屏。
 */
export function localWallpaperRender(
  visual: ChatWallpaperVisual | null | undefined,
): ChatBackgroundRender | null {
  if (!visual) return null;
  if (visual.kind === 'image' && visual.path) {
    return {
      fill: null,
      wallpaper: { url: convertFileSrc(visual.path), blurred: false },
      dimming: 0,
      baseColor: DEFAULT_BASE_COLOR,
    };
  }
  if (visual.color) {
    return { fill: { kind: 'solid', color: visual.color }, dimming: 0, baseColor: visual.color };
  }
  return null;
}
