/**
 * 全局 Apple 风格 emoji 引擎（Telegram 网页版同款方案）。
 *
 * 用 Apple 风格的 PNG（public/emoji/*.png，来自 emoji-datasource-apple，Unicode 16）
 * 替代系统字体渲染的 emoji，保证跨平台外观一致。
 *
 * 实现方式（与 telegram-tt 的 util/emoji 一致）：
 *   1. 检测：用 twemoji-parser 的官方正则（Telegram Web 同款）精确识别文本里的
 *      所有合法 emoji 序列（含 ZWJ、肤色、旗帜），拿到每个 emoji 的位置( indices )。
 *   2. 映射：用 src/utils/emojiUnified.ts（由 emoji-datasource-apple 的 emoji.json 生成）
 *      把 emoji 的 native 字符串映射到 Apple 风格图片文件名。
 *   3. 渲染：emoji 段替换成 <img src="/emoji/{file}">。
 */

import { parse as twemojiParse } from "twemoji-parser";
import { EMOJI_TO_IMAGE } from "./emojiUnified";

/** 图片 URL 前缀（public/emoji/ 在构建后位于应用根目录，属 'self'，CSP img-src 允许） */
export const EMOJI_BASE = "/emoji";

/** 缓存 Map：native emoji 字符串 → 图片文件名 */
const emojiMap = new Map<string, string>();
for (const [native, image] of EMOJI_TO_IMAGE) {
  if (!emojiMap.has(native)) {
    emojiMap.set(native, image);
  }
}

export interface EmojiToken {
  text: string;
  isEmoji: boolean;
}

/**
 * 将文本按「纯文本 / emoji」切分。
 * 使用 twemoji-parser 的正则匹配所有合法 emoji，再按其索引切段。
 */
export function splitTextByEmoji(text: string): EmojiToken[] {
  if (!text) return [];
  const parts: EmojiToken[] = [];

  const entities = twemojiParse(text, { assetType: "png" });
  // twemojiParse 返回实体按位置排序；按索引顺序切分
  let cursor = 0;
  for (const entity of entities) {
    const [start, end] = entity.indices;
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), isEmoji: false });
    }
    parts.push({ text: entity.text, isEmoji: true });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), isEmoji: false });
  }

  return parts;
}

/** 判断某个字符串是否为已知可渲染的 emoji */
export function isEmoji(text: string): boolean {
  return emojiMap.has(text);
}

/** 取某个 emoji 对应的 Apple 图片文件名；未知返回 null */
export function emojiToImage(native: string): string | null {
  return emojiMap.get(native) ?? null;
}

/** emoji 图片完整 URL（未知 emoji 返回 null） */
export function emojiImageSrc(native: string): string | null {
  const file = emojiMap.get(native);
  return file ? `${EMOJI_BASE}/${file}` : null;
}

/** 供调试：确认映射规模 */
export function emojiMapSize(): number {
  return emojiMap.size;
}
