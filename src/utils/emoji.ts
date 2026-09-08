/**
 * 全局 Apple 风格 emoji 引擎。
 *
 * 使用 Apple Color Emoji 字体（apple.ttf）渲染 emoji，
 * 替代旧的 PNG 图片方案，减少网络请求并提升渲染性能。
 *
 * 实现方式：
 *   1. 检测：用 twemoji-parser 的官方正则精确识别文本里的
 *      所有合法 emoji 序列（含 ZWJ、肤色、旗帜），拿到每个 emoji 的位置。
 *   2. 渲染：emoji 段用 apple-emoji CSS class 渲染，由字体直接绘制。
 */

import { parse as twemojiParse } from "twemoji-parser";

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
  // 使用 twemoji-parser 检测是否为合法 emoji 序列
  const entities = twemojiParse(text, { assetType: "png" });
  return entities.length === 1 && entities[0].text === text;
}
