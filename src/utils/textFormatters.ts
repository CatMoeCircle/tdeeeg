import type { textEntity, TextEntityType } from "tdlib-types";
import { splitTextByEmoji, emojiImageSrc } from "./emoji";

/**
 * 输入框富文本实体工具。
 *
 * 输入框本身不保存实体列表之外的状态——文本由 <textarea> 维护（纯文本），
 * 实体列表由本模块维护。用户在选中文本后通过右键菜单添加/移除实体，
 * 发送时把 text + entities 组装成 formattedText 交给 TDLib。
 *
 * 所有 offset/length 均按 UTF-16 code units 计（与 TDLib 一致）。
 * JS 的 string.length 天然就是 UTF-16 码元数，因此可直接使用。
 */

/** 可赋予输入框的格式种类（链接是带 url 的特例） */
export type FormatKind =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'spoiler'
    | 'code'
    | 'quote'
    | 'link';

/** 每个 kind 对应的 TDLib 实体类型构造器 */
export function entityOf(kind: FormatKind, value?: string): TextEntityType {
    switch (kind) {
        case 'bold': return { _: 'textEntityTypeBold' };
        case 'italic': return { _: 'textEntityTypeItalic' };
        case 'underline': return { _: 'textEntityTypeUnderline' };
        case 'strikethrough': return { _: 'textEntityTypeStrikethrough' };
        case 'spoiler': return { _: 'textEntityTypeSpoiler' };
        case 'code': return { _: 'textEntityTypeCode' };
        case 'quote': return { _: 'textEntityTypeBlockQuote' };
        case 'link':
            return { _: 'textEntityTypeTextUrl', url: value || '' };
    }
}

/** 判断一个实体类型是否是给定 kind（同 kind 判定，TextUrl link 特例） */
function isKindOf(type: TextEntityType, kind: FormatKind): boolean {
    switch (kind) {
        case 'link': return type._ === 'textEntityTypeTextUrl';
        case 'bold': return type._ === 'textEntityTypeBold';
        case 'italic': return type._ === 'textEntityTypeItalic';
        case 'underline': return type._ === 'textEntityTypeUnderline';
        case 'strikethrough': return type._ === 'textEntityTypeStrikethrough';
        case 'spoiler': return type._ === 'textEntityTypeSpoiler';
        case 'code': return type._ === 'textEntityTypeCode' || type._ === 'textEntityTypePre' || type._ === 'textEntityTypePreCode';
        case 'quote': return type._ === 'textEntityTypeBlockQuote' || type._ === 'textEntityTypeExpandableBlockQuote';
    }
}

/** 两个区间 [a,b) 与 [c,d) 是否相交 */
function rangesOverlap(a: number, b: number, c: number, d: number): boolean {
    return a < d && c < b;
}

/** 判断一个实体是否完全包含 [start, end) */
function fullyContains(e: textEntity, start: number, end: number): boolean {
    return e.offset <= start && e.offset + e.length >= end;
}

/**
 * 在 [start, end) 选区上切换（toggle）给定 kind 实体。
 *
 * 行为：
 * - 若存在一个完全覆盖该选区的同 kind 实体 → 移除之（取消格式）。
 * - 否则将其视为“应用格式”：移除所有与选区相交的同 kind 实体（相交部分重切），
 *   再插入一个覆盖选区的实体。
 */
export function toggleFormat(
    entities: textEntity[],
    text: string,
    start: number,
    end: number,
    kind: FormatKind,
    value?: string,
): textEntity[] {
    const list = entities;
    // 选区归一化
    const s = Math.max(0, Math.min(start, end));
    const e = Math.max(0, Math.max(start, end));
    if (e - s <= 0) return list;

    // 归一化范围内所有实体（截断越界、丢弃空实体）
    const clamped = clampEntities(list, text.length);

    const type = entityOf(kind, value);

    // 情况 1：完全被一个同 kind 实体覆盖 → 取消格式
    const covering = clamped.find(en => isKindOf(en.type, kind) && fullyContains(en, s, e));
    if (covering) {
        return removeEntity(clamped, covering, s, e);
    }

    // 情况 2：应用格式——移除所有与选区相交的同 kind 实体
    // 相交但不被完全包含的实体需在相交处拆分（只保留不与选区重叠的片段）
    const kept: textEntity[] = [];
    for (const en of clamped) {
        if (isKindOf(en.type, kind) && rangesOverlap(en.offset, en.offset + en.length, s, e)) {
            const enStart = en.offset;
            const enEnd = en.offset + en.length;
            // 左片段 [enStart, s)
            if (enStart < s) {
                kept.push({ _: 'textEntity', offset: enStart, length: s - enStart, type: en.type });
            }
            // 右片段 [e, enEnd)
            if (e < enEnd) {
                kept.push({ _: 'textEntity', offset: e, length: enEnd - e, type: en.type });
            }
        } else {
            kept.push(en);
        }
    }
    // 插入新实体
    kept.push({ _: 'textEntity', offset: s, length: e - s, type });
    return normalizeEntities(kept);
}

/**
 * 显式移除覆盖 [s, e) 的指定实体（在相交处拆分，保留不相交片段）。
 * 用于“纯文本”菜单：把选区内所有可移除格式清掉。
 */
function removeEntity(list: textEntity[], target: textEntity, s: number, e: number): textEntity[] {
    const kept: textEntity[] = [];
    for (const en of list) {
        if (en !== target) {
            kept.push(en);
            continue;
        }
        const enStart = en.offset;
        const enEnd = en.offset + en.length;
        if (enStart < s) {
            kept.push({ _: 'textEntity', offset: enStart, length: s - enStart, type: en.type });
        }
        if (e < enEnd) {
            kept.push({ _: 'textEntity', offset: e, length: enEnd - e, type: en.type });
        }
    }
    return normalizeEntities(kept);
}

/**
 * “纯文本”效果：移除选区内所有可选格式实体（粗/斜/下划/删除/剧透/代码/引用/链接）。
 * 在边界处拆分，只清掉与选区重叠的部分。
 */
export function clearFormats(
    entities: textEntity[],
    text: string,
    start: number,
    end: number,
): textEntity[] {
    const list = clampEntities(entities, text.length);
    const s = Math.max(0, Math.min(start, end));
    const e = Math.max(0, Math.max(start, end));
    if (e - s <= 0) return list;

    const owned = new Set(['textEntityTypeBold', 'textEntityTypeItalic', 'textEntityTypeUnderline',
        'textEntityTypeStrikethrough', 'textEntityTypeSpoiler', 'textEntityTypeCode', 'textEntityTypePre',
        'textEntityTypePreCode', 'textEntityTypeBlockQuote', 'textEntityTypeExpandableBlockQuote',
        'textEntityTypeTextUrl', 'textEntityTypeMentionName']);

    const kept: textEntity[] = [];
    for (const en of list) {
        if (owned.has(en.type._) && rangesOverlap(en.offset, en.offset + en.length, s, e)) {
            const enStart = en.offset;
            const enEnd = en.offset + en.length;
            if (enStart < s) {
                kept.push({ _: 'textEntity', offset: enStart, length: s - enStart, type: en.type });
            }
            if (e < enEnd) {
                kept.push({ _: 'textEntity', offset: e, length: enEnd - e, type: en.type });
            }
        } else {
            kept.push(en);
        }
    }
    return normalizeEntities(kept);
}

/** 某个范围 [s,e) 上是否已应用了给定 kind（用于菜单打勾 / 禁用态） */
export function hasFormat(
    entities: textEntity[],
    start: number,
    end: number,
    kind: FormatKind,
): boolean {
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    return entities.some(en =>
        isKindOf(en.type, kind) && en.offset + en.length > s && en.offset < e);
}

/** 把实体列表限制在文本长度内，丢弃越界/空实体 */
function clampEntities(list: textEntity[], textLen: number): textEntity[] {
    const out: textEntity[] = [];
    for (const en of list) {
        const offset = Math.max(0, Math.min(en.offset, textLen));
        const end = Math.max(offset, Math.min(en.offset + en.length, textLen));
        if (end - offset <= 0) continue;
        out.push({ ...en, offset, length: end - offset });
    }
    return out;
}

/**
 * 规范化实体列表：
 * - 按 offset 排序；
 * - 合并相邻或重叠的同类型实体（TDLib 规范：相邻同类型合并为一个）;
 * - 合并仅与自身相同的实体（如粗体叠粗体）。
 */
export function normalizeEntities(list: textEntity[]): textEntity[] {
    const sorted = [...list].sort((a, b) => (a.offset - b.offset) || (a.length - b.length));
    const out: textEntity[] = [];
    for (const en of sorted) {
        const last = out[out.length - 1];
        if (last && sameEntityType(last.type, en.type) && last.offset + last.length >= en.offset) {
            // 合并：取并集范围
            const newEnd = Math.max(last.offset + last.length, en.offset + en.length);
            out[out.length - 1] = { ...last, length: newEnd - last.offset };
        } else {
            out.push(en);
        }
    }
    return out;
}

/** 两个实体类型是否相同（含 link url 一致才合并） */
function sameEntityType(a: TextEntityType, b: TextEntityType): boolean {
    if (a._ !== b._) return false;
    if (a._ === 'textEntityTypeTextUrl' && b._ === 'textEntityTypeTextUrl') {
        return a.url === b.url;
    }
    return true;
}

/**
 * 文本编辑后平移实体偏移。
 *
 * @param entities 旧实体列表
 * @param oldText  编辑前文本
 * @param newText  编辑后文本
 *
 * 通过 diff 找到文本变化的起点；起点之后的所有实体按长度差平移；
 * 被删除区间内的实体移除。这是保守策略——用于 textarea 手动编辑时让实体大致跟随。
 */
export function shiftEntitiesAfterTextChange(
    entities: textEntity[],
    oldText: string,
    newText: string,
): textEntity[] {
    // 找到首个不同字符位置（公共前缀长度）
    let prefix = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
        prefix++;
    }
    // 公共后缀长度
    let suffix = 0;
    while (
        suffix < maxPrefix - prefix &&
        oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
    ) {
        suffix++;
    }

    const oldEnd = oldText.length - suffix; // 旧文本中被删除/替换区域的结尾
    const newEnd = newText.length - suffix; // 新文本中替换区域的结尾
    const delta = newEnd - prefix - (oldEnd - prefix); // 长度变化量

    const out: textEntity[] = [];
    for (const en of entities) {
        const enStart = en.offset;
        const enEnd = en.offset + en.length;
        // 实体完全在被删除区域内 → 移除
        if (enStart >= prefix && enEnd <= oldEnd) continue;
        // 实体起点在被删除区域内 → 左边界吸附到删除起点
        let start = enStart;
        if (enStart >= prefix && enStart < oldEnd) start = prefix;
        // 实体终点在被删除区域内 → 右边界吸附到删除起点
        let end = enEnd;
        if (enEnd > prefix && enEnd <= oldEnd) end = prefix;
        // 实体起点在删除区域之后 → 平移
        if (start >= oldEnd) start += delta;
        if (end > oldEnd) end += delta;
        if (start < prefix && end > prefix) {
            // 跨删区域：保持不变，但右端吸收 delta
            end = start + en.length + delta;
        }
        const length = end - start;
        if (length <= 0) continue;
        out.push({ ...en, offset: Math.max(0, start), length });
    }
    return clampEntities(normalizeEntities(out), newText.length);
}

/**
 * 在指定插入点插入文本，并平移其后的实体偏移（用于粘贴/emoji 插入等编程式改动）。
 */
export function insertTextShiftEntities(
    entities: textEntity[],
    textLen: number,
    insertAt: number,
    insertLen: number,
): textEntity[] {
    const at = Math.max(0, Math.min(insertAt, textLen));
    return entities.map(en => {
        if (en.offset >= at) {
            return { ...en, offset: en.offset + insertLen };
        }
        // 实体起点在插入点之前但终点跨过插入点 → 仅终点平移
        if (en.offset + en.length > at) {
            return { ...en, length: en.length + insertLen };
        }
        return en;
    });
}

/* =========================================================================
 * 可视化：把 text + entities 渲染成 HTML（用于输入框叠加预览层）
 *
 * 输入框用 <textarea> 承载编辑（保持 v-model / 光标 / 输入法 / 拖放等全部现有
 * 逻辑），在其上方叠加一个 pointer-events:none 的透明层。该层以相同的字体、
 * 行高、padding 渲染真实文字 + 实体样式，让用户能直观看到已应用的格式。
 * 叠加层按“字符格式边界”切分文本，每段累加覆盖它的全部样式，与 RichEditBox
 * 的“字符格式是独立属性位、可任意组合”语义一致。
 * ========================================================================= */

/** HTML 转义（防注入，同时保留换行） */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 由实体类型累加出内联 CSS 片段 */
function styleForType(type: TextEntityType): string {
    const st: string[] = [];
    switch (type._) {
        case 'textEntityTypeBold': st.push('font-weight:700'); break;
        case 'textEntityTypeItalic': st.push('font-style:italic'); break;
        case 'textEntityTypeUnderline': st.push('text-decoration:underline'); break;
        case 'textEntityTypeStrikethrough': st.push('text-decoration:line-through'); break;
        case 'textEntityTypeSpoiler': st.push('background-color:rgba(128,128,128,.45);border-radius:3px'); break;
        case 'textEntityTypeCode': st.push('font-family:Consolas,Monaco,monospace;background:rgba(128,128,128,.15);border-radius:4px;padding:0 2px'); break;
        case 'textEntityTypePre':
        case 'textEntityTypePreCode': st.push('font-family:Consolas,Monaco,monospace;display:block;padding:4px 6px;background:rgba(128,128,128,.12);border-radius:6px'); break;
        case 'textEntityTypeBlockQuote':
        case 'textEntityTypeExpandableBlockQuote': st.push('display:block;border-left:3px solid rgba(128,128,128,.5);padding-left:8px;margin:2px 0'); break;
        case 'textEntityTypeTextUrl': st.push('color:var(--tc-link,#4f9cf9);text-decoration:underline'); break;
        case 'textEntityTypeMentionName': st.push('color:var(--tc-link,#4f9cf9)'); break;
        default: break;
    }
    return st.join(';');
}

/**
 * 把 text + entities 渲染为可安全插入的 HTML 字符串。
 * 会转义全部文本、按实体边界切分并叠加样式；无实体时退化为纯文本。
 *
 * @param opts.customEmojis 输入框内已添加的自定义 emoji（id + 占位 alt），按插入顺序。
 *                          渲染时会把占位 alt 替换为对应的自定义 emoji 图片/动画。
 * @param opts.customEmojiSrc 自定义 emoji 解析器：给定 id 返回 { src, kind }；
 *                            kind 为 'video'（webm）用 <video>，'img'（webp）用 <img>；无可用媒体返回 null（保留占位文本）。
 */
export function renderEntitiesHTML(
    text: string,
    entities: textEntity[],
    opts?: {
        customEmojis?: { id: string; alt: string }[];
        customEmojiSrc?: (id: string) => { src: string; kind: 'img' | 'video' } | null;
    },
): string {
    if (!text) return '';
    // 归一化：仅关注有效范围实体，按 offset 排序并去除越界
    const list = clampEntities(entities, text.length)
        .filter(en => en.length > 0)
        .sort((a, b) => (a.offset - b.offset) || (a.length - b.length));

    // 预先计算自定义 emoji 占位在 text 中的精确区间（与发送时 buildCustomEmojiEntities 同源逻辑）
    const customRanges = buildCustomEmojiRanges(text, opts?.customEmojis ?? []);

    if (list.length === 0 && customRanges.length === 0) {
        return renderSegmentWithEmoji(text, [], 0);
    }

    // 收集所有切分边界点（实体边界 + 自定义 emoji 区间边界）
    const points = new Set<number>([0, text.length]);
    for (const en of list) {
        points.add(en.offset);
        points.add(en.offset + en.length);
    }
    for (const r of customRanges) {
        points.add(r.start);
        points.add(r.end);
    }
    const bounds = Array.from(points).sort((a, b) => a - b);

    let html = '';
    for (let i = 0; i < bounds.length - 1; i++) {
        const start = bounds[i];
        const end = bounds[i + 1];
        if (end <= start) continue;
        // 收集覆盖该段的所有实体样式
        const styles: string[] = [];
        for (const en of list) {
            if (en.offset <= start && en.offset + en.length >= end) {
                const s = styleForType(en.type);
                if (s) styles.push(s);
            }
        }
        // 找到与段重叠的自定义 emoji 区间（段被边界精确切分，通常整段命中一个区间）
        const segCustom = customRanges.find(r => r.start === start && r.end === end);
        const seg = text.slice(start, end);
        const inner = segCustom
            ? renderCustomEmojiHtml(segCustom, opts?.customEmojiSrc)
            : renderSegmentWithEmoji(seg, customRanges, start);
        html += styles.length
            ? `<span style="${styles.join(';')}">${inner}</span>`
            : inner;
    }
    // 转为换行保留
    return html;
}

/** 自定义 emoji 占位的一处出现（与发送定位逻辑一致） */
interface CustomEmojiRange { start: number; end: number; id: string; alt: string; }

/** 按插入顺序用 indexOf 定位每个自定义 emoji 占位在 text 中的区间 */
function buildCustomEmojiRanges(text: string, customEmojis: { id: string; alt: string }[]): CustomEmojiRange[] {
    const ranges: CustomEmojiRange[] = [];
    let searchFrom = 0;
    for (const ce of customEmojis) {
        const idx = text.indexOf(ce.alt, searchFrom);
        if (idx === -1) continue;
        ranges.push({ start: idx, end: idx + ce.alt.length, id: ce.id, alt: ce.alt });
        searchFrom = idx + ce.alt.length;
    }
    return ranges;
}

/** 把自定义 emoji 区间渲染成 <img 或 <video>（webm 用 video）；无可用媒体时回退占位文本 */
function renderCustomEmojiHtml(
    r: CustomEmojiRange,
    customEmojiSrc?: (id: string) => { src: string; kind: 'img' | 'video' } | null,
): string {
    const med = customEmojiSrc ? customEmojiSrc(r.id) : null;
    if (med) {
        if (med.kind === 'video') {
            return `<video class="mi-emoji mi-ce" src="${escapeHtml(med.src)}" autoplay loop muted playsinline></video>`;
        }
        return `<img class="mi-emoji mi-ce" draggable="false" alt="${escapeHtml(r.alt)}" src="${escapeHtml(med.src)}">`;
    }
    return escapeHtml(r.alt);
}

/**
 * 渲染一段普通文本（未被自定义 emoji 区间完全覆盖），把其中的普通 emoji 换成 Apple 图片。
 * 若该段与某些自定义 emoji 区间部分重叠（理论上不应发生，因为边界已切好），额外跳过其覆盖部分，避免二次替换。
 */
function renderSegmentWithEmoji(
    seg: string,
    customRanges: CustomEmojiRange[],
    segStart: number,
): string {
    if (!seg) return '';
    const parts = splitTextByEmoji(seg);
    let out = '';
    let cursor = 0;
    for (const p of parts) {
        const relStart = cursor;
        cursor += p.text.length;
        if (!p.isEmoji) {
            out += escapeHtml(p.text);
            continue;
        }
        // 若该 emoji 恰好落在某个自定义 emoji 区间内（说明被自定义 emoji 占用），不当作普通 emoji 渲染
        const absStart = segStart + relStart;
        const absEnd = absStart + p.text.length;
        const isCustom = customRanges.some(r =>
            r.start >= absStart && r.end <= absEnd);
        if (isCustom) {
            out += escapeHtml(p.text);
            continue;
        }
        const src = emojiImageSrc(p.text);
        if (src) {
            out += `<img class="mi-emoji" draggable="false" alt="${escapeHtml(p.text)}" src="${escapeHtml(src)}">`;
        } else {
            out += escapeHtml(p.text);
        }
    }
    return out;
}

