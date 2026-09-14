import type {
    languagePackInfo,
    languagePackString,
    LanguagePackStringValue,
} from "tdlib-types";
import { tdlibSend } from "./tdlib";
import bundledTdEn from "../locales/td-en.json";

/** TDLib 本地化目标，与 Telegram Desktop 保持一致 */
export const LOCALIZATION_TARGET = "tdesktop";

/**
 * 复数形态（CLDR zero/one/two/few/many/other）。
 * 对应 languagePackStringValuePluralized 的六个字段。
 */
export interface TDPluralForms {
    zero: string;
    one: string;
    two: string;
    few: string;
    many: string;
    other: string;
}

/** 打包的 en 语言包结构：strings（ordinary + plural other 回退）+ plurals */
interface BundledTdEn {
    strings: Record<string, string>;
    plurals: Record<string, TDPluralForms>;
}

/** 应用内置语言（始终可用，不依赖网络） */
export interface BuiltinLanguage {
    /** vue-i18n locale，也是设置里保存的 code */
    code: string;
    /** 展示名称（该语言自身） */
    nativeName: string;
    /** 英文名 */
    englishName: string;
    /** 对应的 TDLib tdesktop 语言包 ID */
    tdlibPackId: string;
}

export const BUILTIN_LANGUAGES: BuiltinLanguage[] = [
    {
        code: "zh-CN",
        nativeName: "简体中文",
        englishName: "Simplified Chinese",
        tdlibPackId: "zh-hans-raw",
    },
    {
        code: "zh-TW",
        nativeName: "繁體中文",
        englishName: "Traditional Chinese",
        tdlibPackId: "zh-hant-raw",
    },
    {
        code: "en",
        nativeName: "English",
        englishName: "English",
        tdlibPackId: "en",
    },
];

/** 内置语言 code → TDLib pack id */
export function builtinPackId(code: string): string | null {
    const found = BUILTIN_LANGUAGES.find((l) => l.code === code);
    return found?.tdlibPackId ?? null;
}

/** TDLib pack id → 内置语言 code（若存在） */
export function packIdToBuiltinCode(packId: string): string | null {
    const found = BUILTIN_LANGUAGES.find((l) => l.tdlibPackId === packId);
    return found?.code ?? null;
}

/** 语言列表缓存（TDLib pack 元数据） */
const TARGET_LIST_CACHE_KEY = "tdgram-lang-target-list";
/** 单个语言包字符串缓存前缀 */
const PACK_CACHE_PREFIX = "tdgram-langpack-";
/** 缓存版本，结构变更时递增以丢弃旧缓存 */
const CACHE_VERSION = 2;

export interface CachedLanguagePack {
    version: number;
    packId: string;
    info: languagePackInfo | null;
    /** key → 字符串值（ordinary 原文；pluralized 存 other 作无复数参数时的回退） */
    strings: Record<string, string>;
    /** languagePackStringValuePluralized → 完整 CLDR 形态 */
    plurals: Record<string, TDPluralForms>;
    cachedAt: number;
}

export interface CachedTargetList {
    version: number;
    packs: languagePackInfo[];
    cachedAt: number;
}

function readJson<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.version === CACHE_VERSION) {
            return parsed as T;
        }
        return null;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn("[languagePacks] localStorage write failed:", key, e);
    }
}

/** 解析 LanguagePackStringValue → 普通字符串（复数取 other_value） */
export function packStringValueToString(value: LanguagePackStringValue): string {
    switch (value._) {
        case "languagePackStringValueOrdinary":
            return value.value;
        case "languagePackStringValuePluralized":
            return (
                value.other_value ||
                value.one_value ||
                value.many_value ||
                value.few_value ||
                value.two_value ||
                value.zero_value ||
                ""
            );
        case "languagePackStringValueDeleted":
            return "";
        default:
            return "";
    }
}

/** languagePackStringValuePluralized → TDPluralForms */
export function pluralValueToForms(
    value: Extract<LanguagePackStringValue, { _: "languagePackStringValuePluralized" }>
): TDPluralForms {
    return {
        zero: value.zero_value || "",
        one: value.one_value || "",
        two: value.two_value || "",
        few: value.few_value || "",
        many: value.many_value || "",
        other: value.other_value || "",
    };
}

/** TDPluralForms → languagePackStringValuePluralized（导出/回传 TDLib 用） */
export function formsToPluralValue(forms: TDPluralForms): LanguagePackStringValue {
    return {
        _: "languagePackStringValuePluralized",
        zero_value: forms.zero,
        one_value: forms.one,
        two_value: forms.two,
        few_value: forms.few,
        many_value: forms.many,
        other_value: forms.other,
    };
}

/**
 * 将 TDLib 字符串列表转为扁平 map。
 * - Ordinary → strings[key] = value
 * - Pluralized → strings[key] = other 回退；plurals[key] = 完整六形态
 * - Deleted → 跳过
 */
export function flattenPackStrings(strings: languagePackString[]): {
    flat: Record<string, string>;
    plurals: Record<string, TDPluralForms>;
} {
    const flat: Record<string, string> = {};
    const plurals: Record<string, TDPluralForms> = {};
    for (const s of strings) {
        if (!s?.key || !s.value) continue;
        const v = s.value;
        if (v._ === "languagePackStringValueOrdinary") {
            flat[s.key] = v.value || "";
        } else if (v._ === "languagePackStringValuePluralized") {
            const forms = pluralValueToForms(v);
            plurals[s.key] = forms;
            flat[s.key] = packStringValueToString(v);
        }
        // Deleted：不写入，由 en / fallback 兜底
    }
    return { flat, plurals };
}

/**
 * 拉取本地化目标下的语言包列表。
 * @param onlyLocal true 时走离线（TDLib 本地库），否则会请求网络。
 */
export async function fetchLocalizationTargetInfo(
    onlyLocal = false
): Promise<languagePackInfo[]> {
    const res = await tdlibSend({
        _: "getLocalizationTargetInfo",
        only_local: onlyLocal,
    });
    return res.language_packs ?? [];
}

/** 读取本地缓存的语言包列表 */
export function loadCachedTargetList(): languagePackInfo[] | null {
    const cached = readJson<CachedTargetList>(TARGET_LIST_CACHE_KEY);
    return cached?.packs ?? null;
}

/** 写入语言包列表缓存 */
export function saveTargetListCache(packs: languagePackInfo[]): void {
    writeJson(TARGET_LIST_CACHE_KEY, {
        version: CACHE_VERSION,
        packs,
        cachedAt: Date.now(),
    } satisfies CachedTargetList);
}

/** 读取本地缓存的某个语言包 */
export function loadCachedPack(packId: string): CachedLanguagePack | null {
    return readJson<CachedLanguagePack>(PACK_CACHE_PREFIX + packId);
}

/** 写入语言包缓存（离线可用的关键） */
export function savePackCache(
    packId: string,
    info: languagePackInfo | null,
    strings: languagePackString[]
): CachedLanguagePack {
    const { flat, plurals } = flattenPackStrings(strings);
    const payload: CachedLanguagePack = {
        version: CACHE_VERSION,
        packId,
        info,
        strings: flat,
        plurals,
        cachedAt: Date.now(),
    };
    writeJson(PACK_CACHE_PREFIX + packId, payload);
    return payload;
}

/**
 * 用打包的官方英文预填 en 包缓存（离线首启可用，含 ordinary + pluralized）。
 * 已有 en 缓存时不覆盖；在线同步后会被真实包替换。
 */
export function seedEnPackFromBundle(): boolean {
    if (loadCachedPack("en")) return false;
    const bundle = bundledTdEn as unknown as BundledTdEn;
    const strings = bundle?.strings ?? {};
    const plurals = bundle?.plurals ?? {};
    const info: languagePackInfo = {
        _: "languagePackInfo",
        id: "en",
        base_language_pack_id: "",
        name: "English",
        native_name: "English",
        plural_code: "en",
        is_official: true,
        is_rtl: false,
        is_beta: false,
        is_installed: false,
        total_string_count: Object.keys(strings).length,
        translated_string_count: Object.keys(strings).length,
        local_string_count: Object.keys(strings).length,
        translation_url: "https://translations.telegram.org/en/",
    };
    writeJson(PACK_CACHE_PREFIX + "en", {
        version: CACHE_VERSION,
        packId: "en",
        info,
        strings,
        plurals,
        cachedAt: 0, // 0 = 来自内置打包
    } satisfies CachedLanguagePack);
    return true;
}

/**
 * 合并增量字符串到已有缓存（处理 updateLanguagePackStrings）。
 * strings 为空表示全量变更，应重新拉取。
 */
export function mergePackCache(
    packId: string,
    changed: languagePackString[]
): CachedLanguagePack | null {
    const existing = loadCachedPack(packId);
    if (!existing) return null;
    const { flat, plurals } = flattenPackStrings(changed);
    // TDLib 约定：deleted 字符串应回退到英语；此处标记为空，应用层用 en 兜底
    for (const [k, v] of Object.entries(flat)) {
        existing.strings[k] = v;
    }
    for (const [k, v] of Object.entries(plurals)) {
        existing.plurals[k] = v;
    }
    existing.cachedAt = Date.now();
    writeJson(PACK_CACHE_PREFIX + packId, existing);
    return existing;
}

/**
 * 下载/同步语言包并缓存到本地。
 * 1. 优先读缓存（offline）
 * 2. 在线时 synchronizeLanguagePack + getLanguagePackStrings 全量拉取并写缓存
 */
export async function ensureLanguagePack(
    packId: string,
    opts: { forceSync?: boolean; offline?: boolean } = {}
): Promise<CachedLanguagePack | null> {
    const cached = loadCachedPack(packId);
    if (opts.offline) {
        return cached;
    }

    try {
        if (opts.forceSync) {
            await tdlibSend({ _: "synchronizeLanguagePack", language_pack_id: packId });
        }

        let info: languagePackInfo | null = cached?.info ?? null;
        try {
            info = await tdlibSend({ _: "getLanguagePackInfo", language_pack_id: packId });
        } catch (e) {
            console.warn("[languagePacks] getLanguagePackInfo failed:", packId, e);
        }

        const stringsRes = await tdlibSend({
            _: "getLanguagePackStrings",
            language_pack_id: packId,
            keys: [],
        });
        const strings = stringsRes.strings ?? [];
        return savePackCache(packId, info, strings);
    } catch (e) {
        console.warn("[languagePacks] ensureLanguagePack failed, using cache:", packId, e);
        return cached;
    }
}

/** 设置 TDLib 当前语言包（会同步影响 Telegram 服务端返回的本地化文案） */
export async function setTdlibLanguagePackId(packId: string): Promise<void> {
    await tdlibSend({
        _: "setOption",
        name: "language_pack_id",
        value: { _: "optionValueString", value: packId },
    });
}

/** 设置 TDLib 本地化目标（固定 tdesktop） */
export async function setTdlibLocalizationTarget(target = LOCALIZATION_TARGET): Promise<void> {
    await tdlibSend({
        _: "setOption",
        name: "localization_target",
        value: { _: "optionValueString", value: target },
    });
}

/** 读取 TDLib 当前 language_pack_id */
export async function getTdlibLanguagePackId(): Promise<string | null> {
    try {
        const res = await tdlibSend({ _: "getOption", name: "language_pack_id" });
        if (res._ === "optionValueString") return res.value;
        return null;
    } catch {
        return null;
    }
}

/**
 * 将 TDLib 语言包字符串映射为 vue-i18n 可用的嵌套消息。
 * 放在 `td` 命名空间，避免与应用自定义 key 冲突。
 */
export function packStringsToI18nMessages(
    strings: Record<string, string>
): Record<string, unknown> {
    return { td: { ...strings } };
}

/**
 * 常见 TDLib key → 应用 UI key 的映射。
 * 仅用于「非内置语言」时尽量复用 Telegram 官方文案；
 * 内置语言优先使用 locales/*.json。
 */
const TDLIB_KEY_TO_APP: Record<string, string> = {
    OK: "link.openExternalConfirm",
    Cancel: "link.openExternalCancel",
    Next: "login.next",
    Loading: "connection.updating",
};

/** 从 TDLib 字符串生成应用 UI 兜底消息（扁平 → 嵌套） */
export function packStringsToAppMessages(
    strings: Record<string, string>
): Record<string, unknown> {
    const nested: Record<string, Record<string, string>> = {};
    for (const [tdKey, appKey] of Object.entries(TDLIB_KEY_TO_APP)) {
        const value = strings[tdKey];
        if (!value) continue;
        const [ns, key] = appKey.split(".");
        if (!ns || !key) continue;
        if (!nested[ns]) nested[ns] = {};
        nested[ns][key] = value;
    }
    return nested;
}

/** 系统语言 → 推荐内置语言 code */
export function detectPreferredBuiltinCode(): string {
    const candidates = [
        navigator.language,
        ...(navigator.languages || []),
    ].filter(Boolean);

    for (const raw of candidates) {
        const lang = raw.toLowerCase();
        if (lang.startsWith("zh-tw") || lang.startsWith("zh-hant") || lang === "zh-hk" || lang === "zh-mo") {
            return "zh-TW";
        }
        if (lang.startsWith("zh")) {
            return "zh-CN";
        }
        if (lang.startsWith("en")) {
            return "en";
        }
    }
    return "zh-CN";
}

/** 可选语言条目（设置/登录页共用） */
export interface LanguageOption {
    /** 设置保存的 code：内置用 locale，TDLib-only 用 pack id */
    code: string;
    nativeName: string;
    englishName?: string;
    /** true = 内置资源，可完全离线 */
    builtin: boolean;
    tdlibPackId: string;
    /** 翻译进度（0-100），TDLib-only 语言展示用 */
    translatedPercent?: number;
}

/** 由语言包列表 + 内置表构建可选语言列表 */
export function buildLanguageOptions(
    packs: languagePackInfo[]
): LanguageOption[] {
    const seen = new Set<string>();
    const options: LanguageOption[] = [];

    for (const b of BUILTIN_LANGUAGES) {
        seen.add(b.tdlibPackId);
        options.push({
            code: b.code,
            nativeName: b.nativeName,
            englishName: b.englishName,
            builtin: true,
            tdlibPackId: b.tdlibPackId,
        });
    }

    for (const p of packs) {
        if (!p?.id || seen.has(p.id)) continue;
        // 跳过明显未完成的 beta 且翻译率极低的包，避免列表噪音
        const percent =
            p.total_string_count > 0
                ? Math.round((p.translated_string_count / p.total_string_count) * 100)
                : 0;
        options.push({
            code: p.id,
            nativeName: p.native_name || p.name || p.id,
            englishName: p.name,
            builtin: false,
            tdlibPackId: p.id,
            translatedPercent: percent,
        });
    }

    // 内置在前，其余按 nativeName 排序
    const builtinCount = BUILTIN_LANGUAGES.length;
    options.sort((a, b) => {
        if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
        if (a.builtin && b.builtin) {
            return (
                BUILTIN_LANGUAGES.findIndex((x) => x.code === a.code) -
                BUILTIN_LANGUAGES.findIndex((x) => x.code === b.code)
            );
        }
        return a.nativeName.localeCompare(b.nativeName);
    });
    void builtinCount;
    return options;
}

// ─── 缓存管理 ────────────────────────────────────────────────

/** localStorage 中与语言相关的全部 key 前缀/固定 key */
export const LANG_CACHE_KEYS = {
    targetList: TARGET_LIST_CACHE_KEY,
    packPrefix: PACK_CACHE_PREFIX,
    /** 当前语言 code 所在的设置键（整份 settings JSON 内的 language.code） */
    settings: "tdgram-settings",
} as const;

export interface CachedPackSummary {
    packId: string;
    nativeName: string;
    englishName?: string;
    /** 条目数（strings + plurals 去重后大致 key 数） */
    stringCount: number;
    /** localStorage 序列化后大致字节数 */
    bytes: number;
    cachedAt: number;
    /** 是否为当前内置语言对应的包 */
    builtin: boolean;
}

export interface LanguageCacheOverview {
    /** 语言列表缓存是否存在 */
    hasTargetList: boolean;
    targetListCount: number;
    targetListBytes: number;
    targetListCachedAt: number | null;
    /** 前端已缓存的语言包摘要 */
    packs: CachedPackSummary[];
    /** 前端语言缓存总字节（列表 + 各 pack） */
    totalBytes: number;
    /** localStorage 中语言相关 key 的完整列表 */
    keys: string[];
    /** WebView localStorage 标识说明（用户可见路径提示） */
    storageKind: "localStorage";
}

function approxBytes(value: string): number {
    // UTF-16 近似：2 字节/字符；足够做占用展示
    return value.length * 2;
}

/** 列举 localStorage 中所有已缓存的语言包 */
export function listCachedPacks(): CachedPackSummary[] {
    const summaries: CachedPackSummary[] = [];
    const builtinPackIds = new Set(BUILTIN_LANGUAGES.map((b) => b.tdlibPackId));

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PACK_CACHE_PREFIX)) continue;
        const packId = key.slice(PACK_CACHE_PREFIX.length);
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const cached = loadCachedPack(packId);
        if (!cached) continue;

        const nativeName =
            cached.info?.native_name ||
            BUILTIN_LANGUAGES.find((b) => b.tdlibPackId === packId)?.nativeName ||
            packId;

        summaries.push({
            packId,
            nativeName,
            englishName: cached.info?.name,
            stringCount: Object.keys(cached.strings).length,
            bytes: approxBytes(raw),
            cachedAt: cached.cachedAt,
            builtin: builtinPackIds.has(packId),
        });
    }

    summaries.sort((a, b) => b.cachedAt - a.cachedAt);
    return summaries;
}

/** 语言缓存总览（设置页展示用） */
export function getLanguageCacheOverview(): LanguageCacheOverview {
    const packs = listCachedPacks();
    const targetListRaw = localStorage.getItem(TARGET_LIST_CACHE_KEY);
    const targetList = loadCachedTargetList();
    const targetListBytes = targetListRaw ? approxBytes(targetListRaw) : 0;
    const packsBytes = packs.reduce((s, p) => s + p.bytes, 0);

    const keys: string[] = [TARGET_LIST_CACHE_KEY];
    for (const p of packs) keys.push(PACK_CACHE_PREFIX + p.packId);

    return {
        hasTargetList: !!targetListRaw,
        targetListCount: targetList?.length ?? 0,
        targetListBytes,
        targetListCachedAt: readJson<CachedTargetList>(TARGET_LIST_CACHE_KEY)?.cachedAt ?? null,
        packs,
        totalBytes: targetListBytes + packsBytes,
        keys,
        storageKind: "localStorage",
    };
}

/** 删除单个语言包的前端缓存 */
export function removePackCache(packId: string): void {
    localStorage.removeItem(PACK_CACHE_PREFIX + packId);
}

/** 删除语言列表缓存 */
export function removeTargetListCache(): void {
    localStorage.removeItem(TARGET_LIST_CACHE_KEY);
}

/**
 * 清空全部前端语言缓存（列表 + 所有 pack）。
 * 不影响内置 locales/*.json，也不影响 TDLib 自身数据库中的语言包。
 */
export function clearAllLanguageCaches(): number {
    const overview = getLanguageCacheOverview();
    for (const key of overview.keys) {
        localStorage.removeItem(key);
    }
    return overview.keys.length;
}

/** 格式化字节为可读文本 */
export function formatCacheBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** 格式化缓存时间 */
export function formatCachedAt(ts: number | null | undefined): string {
    if (!ts) return "—";
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return "—";
    }
}

// ─── 导出 ────────────────────────────────────────────────────

/** 导出结构：保留 TDLib 原始 languagePackString（含复数形态） */
export interface LanguagePackExport {
    exportedAt: string;
    localizationTarget: string;
    languagePackId: string;
    info: languagePackInfo | null;
    /** getLanguagePackStrings 返回的全部字符串（keys 留空 = 全量） */
    strings: languagePackString[];
    /** 方便直接阅读的扁平 map（复数取 other_value） */
    flat: Record<string, string>;
    stringCount: number;
}

/**
 * 拉取语言包全部字符串（getLanguagePackStrings，keys 留空）。
 * 离线/失败时回退到 localStorage 缓存（若无缓存则抛错）。
 */
export async function fetchLanguagePackAllStrings(
    packId: string,
    opts: { onlyLocal?: boolean } = {}
): Promise<{ info: languagePackInfo | null; strings: languagePackString[] }> {
    if (!opts.onlyLocal) {
        try {
            let info: languagePackInfo | null = loadCachedPack(packId)?.info ?? null;
            try {
                info = await tdlibSend({ _: "getLanguagePackInfo", language_pack_id: packId });
            } catch {
                // keep previous / null
            }
            // keys 留空 → 返回该语言包当前本地化目标下的全部字符串
            const res = await tdlibSend({
                _: "getLanguagePackStrings",
                language_pack_id: packId,
                keys: [],
            });
            const strings = res.strings ?? [];
            if (strings.length) {
                return { info, strings };
            }
        } catch (e) {
            console.warn("[languagePacks] fetchLanguagePackAllStrings online failed:", packId, e);
        }
    }

    // 回退：本地缓存（把 flat + plurals 还原为 languagePackString[]）
    const cached = loadCachedPack(packId);
    if (!cached) {
        throw new Error(`language pack not available: ${packId}`);
    }
    const strings: languagePackString[] = Object.entries(cached.strings).map(([key, value]) => {
        const plural = cached.plurals[key];
        return {
            _: "languagePackString",
            key,
            value: plural ? formsToPluralValue(plural) : { _: "languagePackStringValueOrdinary", value },
        };
    });
    return { info: cached.info, strings };
}

/** 构造导出 JSON（不含落盘） */
export async function buildLanguagePackExport(
    packId: string,
    opts: { onlyLocal?: boolean } = {}
): Promise<LanguagePackExport> {
    const { info, strings } = await fetchLanguagePackAllStrings(packId, opts);
    const { flat } = flattenPackStrings(strings);
    return {
        exportedAt: new Date().toISOString(),
        localizationTarget: LOCALIZATION_TARGET,
        languagePackId: packId,
        info,
        strings,
        flat,
        stringCount: strings.length,
    };
}

/** 生成建议文件名：tdgram-tdesktop-<packId>-<yyyyMMdd-HHmmss>.json */
export function languagePackExportFileName(packId: string): string {
    const safeId = packId.replace(/[^\w.-]+/g, "_") || "pack";
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `tdgram-${LOCALIZATION_TARGET}-${safeId}-${stamp}.json`;
}
