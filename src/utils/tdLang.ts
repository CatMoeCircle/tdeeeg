import i18n from "../i18n";
import bundledTdEn from "../locales/td-en.json";
import {
    loadCachedPack,
    type TDPluralForms,
} from "./languagePacks";
import { parseTdMarkdown } from "./tdMarkdown";

/**
 * TDLib 官方文案与 vue-i18n 统一：
 *
 * - 官方词条注入到 locale **根级** key（如 `lng_settings_language`），
 *   用法与普通 i18n 一致：`t('lng_settings_language')` / `t('lng_cancel')`
 * - 应用自有文案仍在嵌套命名空间：`t('login.title')`、`t('language.desc')`
 * - 应用文案可关联官方 key：`"title": "@:lng_settings_language"`
 * - 复数：注入 vue-i18n 管道格式，`t('lng_seconds', n)`；复杂 CLDR 可用 `tdPlural`
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

/** TDPluralForms → vue-i18n 管道复数（按 CLDR 生成有序形态） */
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

    // one | other（英德西等）
    if (
        code === "en" || code === "de" || code === "nl" || code === "sv" ||
        code === "da" || code === "no" || code === "fi" || code === "es" ||
        code === "it" || code === "tr" || code === "pt"
    ) {
        return [pick("one", "other"), pick("other")].filter(Boolean).join(" | ");
    }

    // 法语：0/1 都是 one → vue-i18n: 0 = a | 1 = b | c
    if (code === "fr") {
        return [
            `0 = ${pick("one", "other")}`,
            `1 = ${pick("one", "other")}`,
            pick("other"),
        ]
            .filter(Boolean)
            .join(" | ");
    }

    // 俄语等：one/few/many/other
    if (code === "ru" || code === "uk" || code === "be") {
        return [
            `0 = ${pick("many", "other")}`,
            `1 = ${pick("one", "other")}`,
            `2 = ${pick("few", "other")}`,
            `3 = ${pick("few", "other")}`,
            `4 = ${pick("few", "other")}`,
            pick("other"),
        ]
            .filter(Boolean)
            .join(" | ");
    }

    // 阿拉伯语六形态
    if (code === "ar") {
        return [
            `0 = ${pick("zero", "other")}`,
            `1 = ${pick("one", "other")}`,
            `2 = ${pick("two", "other")}`,
            pick("other"),
        ]
            .filter(Boolean)
            .join(" | ");
    }

    // 默认 one | other
    return [pick("one", "other"), pick("other")].filter(Boolean).join(" | ");
}

/** 把官方包合并进 locale 根级（不覆盖已存在的非 lng_ 应用 key） */
export function mergeTdPackIntoLocale(
    locale: string,
    strings: Record<string, string>,
    plurals: Record<string, TDPluralForms> = {},
    pluralCode = "en"
): void {
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

    // 保留 tdPlural 原始形态，供 tdPlural() 精确 CLDR 选择
    const existingPlural =
        existing.tdPlural && typeof existing.tdPlural === "object" ? existing.tdPlural : {};
    next.tdPlural = { ...existingPlural, ...plurals };

    i18n.global.setLocaleMessage(locale as any, next as any);
}

/** 预加载内置官方英文到 en（根级 + tdPlural） */
export function ensureBuiltinTdEnglish(): void {
    mergeTdPackIntoLocale("en", BUNDLED_STRINGS, BUNDLED_PLURALS, "en");
}

/** 读取 locale 根级官方字符串 */
function readRootKey(locale: string, name: string): string {
    const msg = i18n.global.getLocaleMessage(locale as any) as any;
    const v = msg?.[name];
    return typeof v === "string" ? v : "";
}

/** 读取复数形态 */
function readPluralsFromLocale(locale: string, name: string): TDPluralForms | null {
    const msg = i18n.global.getLocaleMessage(locale as any) as any;
    const p = msg?.tdPlural;
    if (p && typeof p === "object") {
        const v = p[name];
        if (v && typeof v === "object" && typeof v.other === "string") {
            return v as TDPluralForms;
        }
    }
    return null;
}

export function resolvePluralCode(packOrLocale: string): string {
    const cached = loadCachedPack(packOrLocale);
    if (cached?.info?.plural_code) return cached.info.plural_code;
    const raw = String(packOrLocale).toLowerCase();
    if (raw.startsWith("zh")) return "zh";
    if (raw.startsWith("en")) return "en";
    if (raw.startsWith("ru") || raw.startsWith("uk") || raw.startsWith("be")) return "ru";
    if (raw.startsWith("pl")) return "pl";
    if (raw.startsWith("cs") || raw.startsWith("sk")) return "cs";
    if (raw.startsWith("ar")) return "ar";
    if (raw.startsWith("fr")) return "fr";
    if (raw.startsWith("ja") || raw.startsWith("ko") || raw.startsWith("vi") || raw.startsWith("th")) return "zh";
    return "en";
}

export function selectPluralCategory(pluralCode: string, n: number): keyof TDPluralForms {
    const code = (pluralCode || "en").toLowerCase();
    const i = Math.abs(Math.trunc(n));

    if (
        code === "zh" || code === "ja" || code === "ko" ||
        code === "vi" || code === "th" || code === "id" || code === "ms"
    ) {
        return "other";
    }

    if (
        code === "en" || code === "de" || code === "nl" || code === "sv" ||
        code === "da" || code === "no" || code === "fi" || code === "et" ||
        code === "el" || code === "es" || code === "it" || code === "pt" || code === "tr"
    ) {
        return i === 1 ? "one" : "other";
    }

    if (code === "fr" || code === "fil") {
        return i === 0 || i === 1 ? "one" : "other";
    }

    if (code === "ru" || code === "uk" || code === "be") {
        const mod10 = i % 10;
        const mod100 = i % 100;
        if (mod10 === 1 && mod100 !== 11) return "one";
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
        if (mod10 === 0 || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 11 && mod100 <= 14)) return "many";
        return "other";
    }

    if (code === "pl") {
        if (i === 1) return "one";
        const mod10 = i % 10;
        const mod100 = i % 100;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
        return "many";
    }

    if (code === "cs" || code === "sk") {
        if (i === 1) return "one";
        if (i >= 2 && i <= 4) return "few";
        return "other";
    }

    if (code === "ar") {
        if (i === 0) return "zero";
        if (i === 1) return "one";
        if (i === 2) return "two";
        const mod100 = i % 100;
        if (mod100 >= 3 && mod100 <= 10) return "few";
        if (mod100 >= 11 && mod100 <= 99) return "many";
        return "other";
    }

    return i === 1 ? "one" : "other";
}

export function pickPluralForm(forms: TDPluralForms, category: keyof TDPluralForms): string {
    const chain: (keyof TDPluralForms)[] =
        category === "zero" ? ["zero", "other"]
            : category === "one" ? ["one", "other"]
                : category === "two" ? ["two", "other"]
                    : category === "few" ? ["few", "many", "other"]
                        : category === "many" ? ["many", "other"]
                            : ["other"];
    for (const k of chain) {
        const v = forms[k];
        if (v) return v;
    }
    return forms.other || "";
}

function resolvePluralForms(name: string): { forms: TDPluralForms; pluralCode: string } | null {
    const locale = String(i18n.global.locale.value);
    const cur = readPluralsFromLocale(locale, name);
    if (cur) return { forms: cur, pluralCode: resolvePluralCode(locale) };

    const enForms = readPluralsFromLocale("en", name);
    if (enForms) return { forms: enForms, pluralCode: resolvePluralCode("en") };

    const bundled = BUNDLED_PLURALS[name];
    if (bundled) return { forms: bundled, pluralCode: "en" };

    const fromPack = loadCachedPack(locale)?.plurals?.[name];
    if (fromPack) return { forms: fromPack, pluralCode: resolvePluralCode(locale) };

    const fromEnPack = loadCachedPack("en")?.plurals?.[name];
    if (fromEnPack) return { forms: fromEnPack, pluralCode: resolvePluralCode("en") };
    return null;
}

export function formatTdPlaceholders(
    template: string,
    params: Record<string, string | number>
): string {
    return template.replace(/\{(\w+)\}/g, (m, k: string) => {
        const v = params[k];
        return v === undefined || v === null ? m : String(v);
    });
}

/**
 * 与 `t()` 等价的官方词条读取（推荐直接用 `t('lng_xxx')`）。
 * 保留 `td()` 作为兼容别名，支持可选 fallback。
 */
export function td(key: string, fallback = ""): string {
    if (!key) return fallback;
    const name = key.startsWith("td.") ? key.slice(3) : key;

    // 优先走 vue-i18n（根级注入 + fallbackLocale=en）
    const viaI18n = i18n.global.t(name);
    if (viaI18n && viaI18n !== name) return viaI18n;

    // 内置 en
    const bundled = BUNDLED_STRINGS[name];
    if (bundled) return bundled;

    // 当前 locale 根级
    const cur = readRootKey(String(i18n.global.locale.value), name);
    if (cur) return cur;

    return fallback || name;
}

/**
 * 复数：优先 `t(key, count)`（已注入 vue-i18n 管道）；
 * 需要精确 CLDR 时用本函数。
 */
export function tdPlural(
    key: string,
    count: number,
    fallback = "",
    extraParams: Record<string, string | number> = {}
): string {
    if (!key) return fallback;
    const name = key.startsWith("td.") ? key.slice(3) : key;
    const n = Number.isFinite(count) ? count : 0;

    // 1) vue-i18n 复数（注入时已按 CLDR 生成管道）
    try {
        const viaI18n = i18n.global.t(name, n);
        if (viaI18n && viaI18n !== name) {
            return formatTdPlaceholders(viaI18n, { count: n, ...extraParams });
        }
    } catch {
        /* fallthrough */
    }

    // 2) 原始形态 + CLDR 精确选择
    const resolved = resolvePluralForms(name);
    if (resolved) {
        const cat = selectPluralCategory(resolved.pluralCode, n);
        const template = pickPluralForm(resolved.forms, cat);
        if (template) {
            return formatTdPlaceholders(template, { count: n, ...extraParams });
        }
    }

    const ordinary = td(name, fallback);
    if (ordinary && ordinary !== name) {
        return formatTdPlaceholders(ordinary, { count: n, ...extraParams });
    }
    if (fallback) return formatTdPlaceholders(fallback, { count: n, ...extraParams });
    return name;
}

export function hasBundledTdEnglish(name: string): boolean {
    const key = name.startsWith("td.") ? name.slice(3) : name;
    return (
        Object.prototype.hasOwnProperty.call(BUNDLED_STRINGS, key) ||
        Object.prototype.hasOwnProperty.call(BUNDLED_PLURALS, key)
    );
}

/**
 * 读取官方词条并解析 Markdown（**bold** / *italic* / `code` / [text](url) / 换行）。
 * 返回受控 HTML，配合 v-html 使用。
 */
export function tdHtml(key: string, fallback = ""): string {
    return parseTdMarkdown(td(key, fallback));
}

export function bundledTdEnglishStats(): { strings: number; plurals: number } {
    return {
        strings: Object.keys(BUNDLED_STRINGS).length,
        plurals: Object.keys(BUNDLED_PLURALS).length,
    };
}

/** 常用官方 key（可直接 t(TDK.xxx)） */
export const TDK = {
    cancel: "lng_cancel",
    ok: "lng_box_ok",
    close: "lng_close",
    cont: "lng_continue",
    back: "lng_menu_back",
    online: "lng_status_online",
    language: "lng_settings_language",
    privacy: "lng_settings_privacy_title",
    contacts: "lng_contacts_header",
    file: "lng_in_dlg_file",
    photo: "lng_in_dlg_photo",
    video: "lng_in_dlg_video",
    sticker: "lng_in_dlg_sticker",
    music: "lng_all_music",
    poll: "lng_in_dlg_poll",
    forward: "lng_mediaview_forward",
    reply: "lng_in_reply_to",
    copy: "lng_mac_menu_copy",
    deleteMsg: "lng_context_delete_msg",
    pin: "lng_context_pin_to_top",
    unpin: "lng_context_unpin_from_top",
    search: "lng_dlg_filter",
    username: "lng_settings_username_label",
    bio: "lng_info_bio_label",
    phone: "lng_contact_phone",
    proxyAdd: "lng_proxy_add",
    reportMessage: "lng_report_message_title",
    translate: "lng_ai_compose_tab_translate",
    loading: "lng_context_seen_loading",
    mute: "lng_channel_mute",
    unmute: "lng_enable_notifications_from_tray",
    typing: "lng_typing",
    archived: "lng_filters_type_no_archived",
    saved: "lng_saved_messages",
    send: "lng_forward_send",
    share: "lng_proxy_share",
    open: "lng_profile_open_app_short",
    pause: "lng_mac_menu_player_pause",
    add: "lng_stickers_featured_add",
    remove: "lng_settings_channel_remove",
    edit: "lng_theme_edit",
    save: "lng_connection_save",
    settings: "lng_bot_settings",
    notifications: "lng_profile_enable_notifications",
    devices: "lng_url_auth_device_label",
    seconds: "lng_seconds",
    minutes: "lng_minutes",
    hours: "lng_hours",
    days: "lng_days",
} as const;

export type TdKey = (typeof TDK)[keyof typeof TDK];
