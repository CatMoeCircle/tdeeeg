/**
 * AI 工具层：文本格式与回复引用的**纯逻辑**（不 import Tauri / vue / i18n，可单独跑自检）。
 *
 * 单独一个文件是因为这两件事都有「悄悄做错」的余地：
 * - 格式解析默认勾上，模型随手写的 snake_case_name 会被 Markdown 当成斜体；
 * - 引用位置猜错，会在原消息里高亮一段不相干的文字。
 * 都由 scripts/checkAiTools.ts 断言。
 */

/** 文本解析模式：plain = 原样纯文本（默认），markdown = Telegram Bot API MarkdownV2 */
export type AiParseMode = "plain" | "markdown";

/**
 * 发给模型的 MarkdownV2 用法说明。
 *
 * 今天模型只能从 tools schema 拿提示，所以这段挂在三个工具的 `parse_mode` 参数说明上；
 * 接入聊天管线后**同一段文本也要进 system prompt**（别再手写第二份，两边会漂）。
 */
export const MARKDOWN_V2_GUIDE =
  '按 Telegram Bot API MarkdownV2 解析（不是普通 Markdown）：粗体 *文字*、斜体 _文字_、下划线 __文字__、' +
  '删除线 ~文字~、剧透 ||文字||、行内代码 `文字`、预格式 ```文字```、链接 [文字](https://…)、引用 > 文字。' +
  '正文里 _ * [ ] ( ) ~ ` > # + - = | { } . ! 这些字符必须转义（写法：\\. \\- \\( \\! 等）。' +
  '解析失败会直接报错、消息不会发出，所以发出前先确认标记成对、特殊字符已转义。';

/**
 * parse_mode 入参 → 解析模式。认 "markdown" / "markdownv2"（大小写不敏感、允许首尾空白），
 * 其余（不传 / 乱传 / 非字符串）一律纯文本 —— **绝不默认开解析**：
 * 模型随手写的 snake_case_name 会被 Markdown 当成斜体，而且 MarkdownV2 对未转义字符是直接报错。
 */
export function parseModeOf(raw: unknown): AiParseMode {
  if (typeof raw !== "string") return "plain";
  const v = raw.trim().toLowerCase();
  return v === "markdown" || v === "markdownv2" ? "markdown" : "plain";
}

/**
 * 引用片段在原消息纯文本里的起始位置（UTF-16 码元，TDLib `inputTextQuote.position` 就是这个单位）。
 * 找不到返回 -1：调用方必须**丢掉 quote 按整条回复**，不能退化成 0（那会高亮原消息开头）。
 */
export function quotePosition(plainText: string, quote: string): number {
  if (!quote) return -1;
  return plainText.indexOf(quote);
}
