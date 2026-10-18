/**
 * AI 回复的 Markdown 渲染（活动条里的输出文本）。
 *
 * 行内规则直接复用 tdMarkdown 的 parseTdMarkdown（粗体 / 斜体 / 行内代码 / 链接，
 * 外面包一层反斜杠转义处理，见 renderInline；
 * 先整体转义再插受控标签），在它之上补块级：标题、无序 / 有序列表、围栏代码块、空行分段。
 * 不做完整 CommonMark —— 模型回复用不到，多写的每条规则都是要维护的坑。
 *
 * **输出直接进 v-html**：每一条路径（普通行 / 标题 / 列表项 / 代码块）都先转义，
 * 代码块内不做行内解析（里面的 `**` 是代码，不是格式）。
 */
import { escapeHtml, parseTdMarkdown } from "./tdMarkdown.ts";

/** 代码块样式（与 AiActivityStrip 里工具输入 / 输出那块保持一致） */
const PRE_CLASS =
  "custom-scrollbar my-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/5 p-1.5 font-mono text-[11px] leading-4 text-gray-600 dark:bg-white/5 dark:text-gray-300";

/** CommonMark 里可以用反斜杠转义的字符：`\*` `\_` `` \` `` `\#` … */
const ESCAPE_SEQ = /\\([\\`*_{}\[\]()#+\-.!|~>])/g;

/**
 * 行内渲染：反斜杠转义先换成占位符躲过 parseTdMarkdown（否则 `\*` 照样被吃成斜体，
 * 反斜杠还留在字面上），解析完再把占位符还原成字面字符。占位符不含任何 markdown 字符，
 * 也不会被 HTML 转义动到。
 */
function renderInline(text: string): string {
  const literals: string[] = [];
  const shielded = text.replace(ESCAPE_SEQ, (_m, ch: string) => `\u0000${literals.push(ch) - 1}\u0000`);
  return parseTdMarkdown(shielded).replace(/\u0000(\d+)\u0000/g, (_m, i: string) => escapeHtml(literals[Number(i)]));
}

/**
 * Markdown → 受控 HTML。空输入返回空串（调用方不用判断）。
 */
export function renderAiMarkdown(text: string): string {
  if (!text) return "";

  const out: string[] = [];
  /** 待拼的普通行（连续几行拼成一段，行间用 <br>） */
  const inline: string[] = [];
  /** 待拼的列表项；非空时 ordered 表示当前列表类型 */
  const items: string[] = [];
  let ordered = false;
  /** 围栏代码块的内容行；null = 不在代码块里 */
  let fence: string[] | null = null;
  /** 连续的表格行（`| a | b |`）；空 = 不在表格里 */
  let table: string[] = [];

  const flushTable = () => {
    if (!table.length) return;
    const cells = (row: string) =>
      row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => renderInline(c.trim()));
    const isSep = table.length >= 2 && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(table[1]);
    // 没有分隔行（| --- |）就不是表格，当普通行输出
    if (!isSep) {
      for (const row of table) inline.push(renderInline(row));
      table.length = 0;
      return;
    }
    // ponytail: 不解析对齐、不处理转义的 \| ，表格只给模型常见的简单形式
    const head = cells(table[0]).map((c) => `<th class="border border-gray-300 px-1.5 py-0.5 text-left font-semibold dark:border-gray-600">${c}</th>`).join("");
    const body = table.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td class="border border-gray-300 px-1.5 py-0.5 dark:border-gray-600">${c}</td>`).join("")}</tr>`).join("");
    out.push(`<div class="custom-scrollbar my-1 overflow-x-auto"><table class="border-collapse text-[12px] leading-4"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
    table.length = 0;
  };
  const flushInline = () => {
    if (inline.length) {
      out.push(inline.join("<br>"));
      inline.length = 0;
    }
  };
  const flushList = () => {
    if (!items.length) return;
    const tag = ordered ? "ol" : "ul";
    const cls = ordered ? "my-1 list-decimal pl-5" : "my-1 list-disc pl-4";
    out.push(`<${tag} class="${cls}">${items.join("")}</${tag}>`);
    items.length = 0;
  };
  const flushFence = () => {
    if (fence) {
      out.push(`<pre class="${PRE_CLASS}">${escapeHtml(fence.join("\n"))}</pre>`);
      fence = null;
    }
  };

  for (const line of text.split(/\r?\n/)) {
    // 围栏：``` 开 / ``` 关，语言标记忽略（不做高亮）
    if (/^\s*```/.test(line)) {
      if (fence) flushFence();
      else {
        flushTable();
        flushInline();
        flushList();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }

    // 表格行：先攒着，遇到非表格行再一次性输出（需要看到分隔行才判定是表格）
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushInline();
      flushList();
      table.push(line);
      continue;
    }
    flushTable();

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);

    if (heading) {
      flushInline();
      flushList();
      const big = heading[1].length <= 2 ? " text-[14px]" : "";
      out.push(`<div class="mt-1.5 font-semibold${big}">${renderInline(heading[2])}</div>`);
      continue;
    }
    if (bullet || numbered) {
      flushInline();
      const wantOrdered = Boolean(numbered);
      // 列表类型变了（无序接有序）要断开，否则会并进上一个列表
      if (items.length && wantOrdered !== ordered) flushList();
      ordered = wantOrdered;
      items.push(`<li>${renderInline((bullet ?? numbered)![1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      // 列表项之间的空行不结束列表：模型常写「1. 甲 / 空行 / 2. 乙」，
      // 断开会让每项各起一个 <ol>，编号全渲染成 1（CommonMark 里空行也不拆列表）
      if (items.length) continue;
      flushInline();
      out.push('<div class="h-1.5"></div>');
      continue;
    }
    flushList();
    inline.push(renderInline(line));
  }

  flushTable();
  flushInline();
  flushList();
  flushFence();
  return out.join("");
}

/**
 * 折叠那一行的一行预览：取第一段有内容的行，去掉标记，**纯文本**（不生成 HTML）。
 * 折叠状态下这条是唯一可见的文字，留 `**` 之类的源码等于没渲染。
 */
export function plainPreview(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return line
    .replace(ESCAPE_SEQ, "$1")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}
