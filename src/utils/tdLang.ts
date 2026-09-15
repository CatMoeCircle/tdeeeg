import i18n, { ensurePluralRule } from "../i18n";
import bundledTdEn from "../locales/td-en.json";
import { type TDPluralForms } from "./languagePacks";
import { parseTdMarkdown } from "./tdMarkdown";

/**
 * TDLib 官方文案与 vue-i18n 统一：
 *
 * - 官方词条注入到 locale **根级** key（如 `lng_settings_language`），
 *   用法与普通 i18n 一致：`t('lng_settings_language')` / `t('lng_cancel')`
 * - 应用自有文案仍在嵌套命名空间：`t('login.title')`、`t('language.desc')`
 * - 应用文案可关联官方 key：`"title": "@:lng_settings_language"`
 * - 复数：注入 vue-i18n 管道格式（按 CLDR 形态顺序），请用 `tdPlural(key, n)`
 *   错误：`t(key, { count: '123' })`（字符串只做插值，不会选复数）
 *
 * 优先级（vue-i18n fallback + 注入顺序）：
 * 当前语言官方包 → en 官方包 → 打包内置 en → fallbackLocale
 */

const BUNDLED = bundledTdEn as unknown as {
    strings: Record<string, string>;
    plurals: Record<string, TDPluralForms>;
};
const BUNDLED_STRINGS = BUNDLED.strings || {};
const BUNDLED_PLURALS = BUNDLED.plurals || {};

/** TDPluralForms → vue-i18n 管道复数（按 CLDR 形态顺序，不用精确数字匹配） */
export function pluralFormsToVueI18n(
    forms: TDPluralForms,
    pluralCode = "en"
): string {
    const code = (pluralCode || "en").toLowerCase();
    const pick = (...keys: (keyof TDPluralForms)[]) => {
        for (const k of keys) {
            if (forms[k]) return forms[k];
        }
        return "";
    };

    // 只有 other（中日韩等）
    if (
        code === "zh" || code === "ja" || code === "ko" ||
        code === "vi" || code === "th" || code === "id" || code === "ms"
    ) {
        return forms.other || forms.one || "";
    }

    // 俄语等斯拉夫：one | few | many | other
    // 例：1 день / 2-4 дня / 5-20 дней / 21 день / 22 дня / 123 дня
    if (code === "ru" || code === "uk" || code === "be" || code === "sr" || code === "hr" || code === "bs") {
        return [
            pick("one", "other"),
            pick("few", "other"),
            pick("many", "other"),
            pick("other", "many", "few", "one"),
        ].join(" | ");
    }

    // 法语：0/1 都是 one → one | other 即可（CLDR 会按 fr 规则选）
    if (code === "fr" || code === "pt" || code === "it" || code === "es" || code === "ca") {
        return [pick("one", "other"), pick("other")].join(" | ");
    }

    // 阿拉伯语六形态：zero | one | two | few | many | other
    if (code === "ar") {
        return [
            pick("zero", "other"),
            pick("one", "other"),
            pick("two", "other"),
            pick("few", "other"),
            pick("many", "other"),
            pick("other", "many", "few", "one"),
        ].join(" | ");
    }

    // 默认 one | other（英德西等）
    return [pick("one", "other"), pick("other")].join(" | ");
}

/**
 * TDLib 复数词条：必须传数字 choice，vue-i18n 才会按当前 locale 的 CLDR 规则选形态。
 * 错误写法：t(key, { count: '123' }) —— 只做命名插值，不会正确选复数。
 */
export function tdPlural(key: string, count: number | string): string {
    const n = Number(count);
    const safe = Number.isFinite(n) ? n : 0;
    return i18n.global.t(key, safe, { count: safe } as any);
}

/** 把官方包合并进 locale 根级（覆盖同名官方 key） */
export function mergeTdPackIntoLocale(
    locale: string,
    strings: Record<string, string>,
    plurals: Record<string, TDPluralForms> = {},
    pluralCode = "en"
): void {
    ensurePluralRule(locale, pluralCode);
    const existing = (i18n.global.getLocaleMessage(locale as any) as any) || {};
    const next: Record<string, unknown> = { ...existing };

    for (const [k, v] of Object.entries(strings)) {
        // 官方 key 一律以 lng_/cloud_lng_ 开头，不会与 login/language 等碰撞
        next[k] = v;
    }
    for (const [k, forms] of Object.entries(plurals)) {
        const vuePlural = pluralFormsToVueI18n(forms, pluralCode);
        if (vuePlural) next[k] = vuePlural;
    }

    i18n.global.setLocaleMessage(locale as any, next as any);
}

/** 预加载内置官方英文到 en */
export function ensureBuiltinTdEnglish(): void {
    mergeTdPackIntoLocale("en", BUNDLED_STRINGS, BUNDLED_PLURALS, "en");
}

/**
 * 读取官方词条并解析 Markdown（**bold** / *italic* / `code` / [text](url) / 换行）。
 * 返回受控 HTML，配合 v-html 使用。
 */
export function tdHtml(key: string): string {
    return parseTdMarkdown(i18n.global.t(key));
}
