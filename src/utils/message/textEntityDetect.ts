import type { textEntity, TextEntityType } from "tdlib-types";

/**
 * 译文内联实体补全。
 *
 * 翻译接口常常只返回纯文本——AI / 第三方提供方只给文本，官方 TDLib 接口也仅对
 * Premium 用户保留实体——于是译文里的 @用户名、#话题、链接全都退化成普通文字：
 * 没有蓝色强调，不能点击、不能右击出资料菜单。
 *
 * 这里按译文文本重新识别这些内联实体，把译文里丢失的格式补回来。
 * 提供方已给出的实体（Premium 的官方译文）优先，其覆盖区间不再重复添加。
 *
 * 所有 offset/length 均按 UTF-16 code units 计（与 TDLib 一致，即 JS 的 string 下标）。
 *
 * @param text     译文文本
 * @param existing 提供方返回的实体
 * @returns        补全后的实体列表（已按 offset 升序）
 */
export function detectInlineEntities(text: string, existing: textEntity[] = []): textEntity[] {
    if (!text) return [...existing];

    const out: textEntity[] = [...existing];
    /** 该区间是否已被某个实体完整覆盖 */
    const covered = (start: number, end: number) =>
        out.some(e => e.offset <= start && e.offset + e.length >= end);
    const push = (start: number, end: number, type: TextEntityType) => {
        if (end <= start || covered(start, end)) return;
        out.push({ _: "textEntity", offset: start, length: end - start, type });
    };
    /** 匹配起点是否处在「词的中间」（避免把邮件里的 @、URL 的片段当提及） */
    const isWordBoundary = (start: number) =>
        start === 0 || !/[\w@./+\-]/.test(text[start - 1]);

    // 链接优先：先占有区间，后面的 @ / # 识别就不会把 URL 内部当成实体
    for (const m of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi)) {
        const start = m.index ?? 0;
        if (/^www\./i.test(m[0]) && !isWordBoundary(start)) continue;
        const end = trimTrailingPunctuation(text, start, start + m[0].length);
        push(start, end, { _: "textEntityTypeUrl" });
    }
    // @用户名
    for (const m of text.matchAll(/@[a-zA-Z][a-zA-Z0-9_]{3,31}\b/g)) {
        const start = m.index ?? 0;
        if (!isWordBoundary(start)) continue;
        push(start, start + m[0].length, { _: "textEntityTypeMention" });
    }
    // #话题（允许 Unicode 字母，与 Telegram 一致）
    for (const m of text.matchAll(/#[\p{L}\p{N}_]+/gu)) {
        const start = m.index ?? 0;
        if (start > 0 && /[\p{L}\p{N}_#]/u.test(text[start - 1])) continue;
        push(start, start + m[0].length, { _: "textEntityTypeHashtag" });
    }

    return out.sort((a, b) => a.offset - b.offset);
}

/** 去掉链接尾部的句读（`看这个 https://a.com/x。` 的句号不属于链接）；括号成对出现时保留（如 .../Foo_(bar)） */
function trimTrailingPunctuation(text: string, start: number, end: number): number {
    let e = end;
    while (e > start) {
        const ch = text[e - 1];
        if (!/[.,;:!?)\]}>"'。，、！？；：）」』】》…]/.test(ch)) break;
        if ((ch === ")" || ch === "）") && /[(（]/.test(text.slice(start, e))) break;
        e--;
    }
    return e;
}
