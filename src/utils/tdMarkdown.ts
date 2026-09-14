/**
 * TDLib / Telegram 语言包里的轻量 Markdown 适配。
 *
 * 官方文案常见样式：
 *   **加粗**  *斜体*  `code`  [文本](url)  换行
 *
 * 用法：
 *   <p v-html="tdHtml('lng_xxx')" />
 *   <p v-html="tdHtmlText(t('lng_xxx'))" />
 *   <p v-html="tdHtml('lng_xxx', { link: linkHtml })" />  // 配合 vue-i18n 占位符时用 i18n-t 更合适
 *
 * 安全：先 HTML 转义，再只把受控标签插入，避免注入。
 */

/** HTML 转义 */
export function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * 解析 Telegram 语言包 Markdown 子集 → 受控 HTML。
 *
 * 支持：
 * - **bold** → <strong>
 * - *italic* / _italic_ → <em>
 * - `code` → <code>
 * - [text](https://…) → <a>（仅 http/https）
 * - \n → <br>
 *
 * 不支持完整 CommonMark（语言包也不需要）。
 */
export function parseTdMarkdown(input: string): string {
    if (!input) return "";

    // 1) 先整体转义，保证原文中的 < > 无害
    let html = escapeHtml(input);

    // 2) 换行
    html = html.replace(/\r\n|\r|\n/g, "<br>");

    // 3) 代码 `...`（优先，避免内部被 bold 规则误伤）
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    // 4) 链接 [text](url) —— 仅允许 http(s)
    html = html.replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
        (_m, text: string, url: string) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="td-md-link">${text}</a>`;
        }
    );

    // 5) 粗体 **...**
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

    // 6) 斜体 *...* 或 _..._（避免匹配 **）
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
    html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");

    return html;
}

/**
 * 解析已翻译字符串中的 Markdown（等价 parseTdMarkdown 别名，语义更清晰）。
 */
export function tdHtmlText(text: string): string {
    return parseTdMarkdown(text);
}

/** 可选：包一层 span，方便统一 class / 换行样式 */
export function wrapTdHtml(text: string, className = "td-md"): string {
    return `<span class="${className}">${parseTdMarkdown(text)}</span>`;
}
