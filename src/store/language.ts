import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Update } from "tdlib-types";
import i18n from "../i18n";
import { settings } from "./settings";
import {
    BUILTIN_LANGUAGES,
    LOCALIZATION_TARGET,
    buildLanguageOptions,
    builtinPackId,
    detectPreferredBuiltinCode,
    ensureLanguagePack,
    fetchLocalizationTargetInfo,
    loadCachedPack,
    loadCachedTargetList,
    mergePackCache,
    packIdToBuiltinCode,
    saveTargetListCache,
    seedEnPackFromBundle,
    setTdlibLanguagePackId,
    setTdlibLocalizationTarget,
    type LanguageOption,
} from "../utils/languagePacks";
import { ensureBuiltinTdEnglish, mergeTdPackIntoLocale } from "../utils/tdLang";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";
import zhTW from "../locales/zh-TW.json";

const BUILTIN_MESSAGES: Record<string, unknown> = {
    en,
    "zh-CN": zhCN,
    zh: zhCN,
    "zh-TW": zhTW,
};

function readSavedLanguageCode(): string {
    try {
        return settings.language?.code || detectPreferredBuiltinCode();
    } catch {
        return detectPreferredBuiltinCode();
    }
}

export const useLanguageStore = defineStore("language", () => {
    /** 当前语言 code（内置 locale 或 TDLib pack id） */
    const currentCode = ref(readSavedLanguageCode());
    /** 可选语言列表 */
    const languages = ref<LanguageOption[]>(
        buildLanguageOptions(loadCachedTargetList() ?? [])
    );
    /** 是否正在从网络加载语言包列表 */
    const loadingList = ref(false);
    /** 是否正在下载/同步当前语言包 */
    const loadingPack = ref(false);
    /** 列表是否仅来自本地缓存 */
    const listFromCacheOnly = ref(true);
    /** 当前语言对应的 TDLib pack id */
    const currentPackId = computed(() => {
        return (
            builtinPackId(currentCode.value) ??
            languages.value.find((l) => l.code === currentCode.value)?.tdlibPackId ??
            currentCode.value
        );
    });
    /** 当前是否为内置语言（完全离线可用） */
    const isBuiltin = computed(() =>
        BUILTIN_LANGUAGES.some((l) => l.code === currentCode.value)
    );
    /** 当前展示名 */
    const currentLabel = computed(() => {
        const opt = languages.value.find((l) => l.code === currentCode.value);
        if (opt) return opt.nativeName;
        const b = BUILTIN_LANGUAGES.find((l) => l.code === currentCode.value);
        return b?.nativeName ?? currentCode.value;
    });

    let unlisten: UnlistenFn | null = null;
    let applying = false;

    /** 将内置应用文案注册进 vue-i18n（幂等；仅应用自有 key，不含官方 lng_） */
    function ensureBuiltinMessages(): void {
        for (const [locale, messages] of Object.entries(BUILTIN_MESSAGES)) {
            if (!(i18n.global.availableLocales as string[]).includes(locale)) {
                i18n.global.setLocaleMessage(locale as any, messages as any);
            }
        }
        // 官方英文保底：来自打包的 td-en.json
        ensureBuiltinTdEnglish();
    }

    /**
     * 将 TDLib 官方语言包注入 vue-i18n 根级 key（t('lng_xxx') 可直接用）。
     * 应用自有 login.* / language.* 不受影响。
     */
    function applyPackToI18n(packId: string): void {
        const cached = loadCachedPack(packId);
        if (!cached) {
            ensureBuiltinTdEnglish();
            return;
        }

        const isEnPack = packId === "en" || packId.startsWith("en-");
        const locale = isEnPack ? "en" : packIdToBuiltinCode(packId) ?? packId;
        const pluralCode = cached.info?.plural_code || locale;

        mergeTdPackIntoLocale(locale, cached.strings, cached.plurals, pluralCode);

        if (isEnPack) {
            ensureBuiltinTdEnglish();
        }
    }

    /** 切换 vue-i18n locale */
    function applyVueLocale(code: string): void {
        ensureBuiltinMessages();
        // TDLib pack id（如 ja-raw）也可作为 locale 使用，缺失 key 由 fallbackLocale=en 兜底
        i18n.global.locale.value = code as any;
    }

    /** 同步 TDLib language_pack_id（Telegram 侧文案语言） */
    async function applyTdlibPackId(packId: string): Promise<void> {
        try {
            await setTdlibLocalizationTarget(LOCALIZATION_TARGET);
            await setTdlibLanguagePackId(packId);
        } catch (e) {
            // 登录前/离线时 setOption 可能失败，不阻塞 UI 语言切换
            console.warn("[language] setTdlibLanguagePackId failed (offline?):", packId, e);
        }
    }

    /**
     * 切换语言。
     * - 内置语言：立刻应用 UI，同时尝试同步 TDLib pack
     * - TDLib-only：先用缓存（离线），再尝试在线下载
     */
    async function setLanguage(code: string, opts: { silent?: boolean } = {}): Promise<void> {
        if (applying) return;
        applying = true;
        try {
            currentCode.value = code;
            settings.language.code = code;

            const packId =
                builtinPackId(code) ??
                languages.value.find((l) => l.code === code)?.tdlibPackId ??
                code;

            // 1. 立刻应用已有缓存 / 内置文案（保证离线也能切）
            ensureBuiltinMessages();
            applyPackToI18n("en");
            if (packId !== "en") applyPackToI18n(packId);
            applyVueLocale(code);

            // 2. 同步 TDLib 语言包 ID
            void applyTdlibPackId(packId);

            // 3. 在线则确保语言包已缓存（en 保底 + 当前语言）
            if (navigator.onLine !== false) {
                loadingPack.value = true;
                try {
                    await ensureLanguagePack("en");
                    applyPackToI18n("en");
                    if (packId !== "en") {
                        await ensureLanguagePack(packId, { forceSync: !opts.silent });
                        applyPackToI18n(packId);
                    }
                    applyVueLocale(code);
                } catch (e) {
                    console.warn("[language] ensureLanguagePack failed:", packId, e);
                } finally {
                    loadingPack.value = false;
                }
            }
        } finally {
            applying = false;
        }
    }

    /**
     * 拉取 GetLocalizationTargetInfo 语言列表。
     * 优先离线缓存，再尝试网络；网络失败时保留缓存。
     */
    async function refreshLanguageList(opts: { onlyLocal?: boolean } = {}): Promise<void> {
        const cached = loadCachedTargetList();
        if (cached) {
            languages.value = buildLanguageOptions(cached);
            listFromCacheOnly.value = true;
        }

        if (opts.onlyLocal || navigator.onLine === false) {
            // 离线：尝试 TDLib 本地库（可能比 localStorage 更新）
            try {
                const local = await fetchLocalizationTargetInfo(true);
                if (local.length) {
                    saveTargetListCache(local);
                    languages.value = buildLanguageOptions(local);
                }
            } catch (e) {
                console.warn("[language] getLocalizationTargetInfo(only_local) failed:", e);
            }
            return;
        }

        loadingList.value = true;
        try {
            const packs = await fetchLocalizationTargetInfo(false);
            if (packs.length) {
                saveTargetListCache(packs);
                languages.value = buildLanguageOptions(packs);
                listFromCacheOnly.value = false;
            }
        } catch (e) {
            console.warn("[language] getLocalizationTargetInfo failed, keep cache:", e);
        } finally {
            loadingList.value = false;
        }
    }

    /** 处理 updateLanguagePackStrings：合并增量并刷新当前 locale */
    async function handleLanguagePackStringsUpdate(
        update: Extract<Update, { _: "updateLanguagePackStrings" }>
    ): Promise<void> {
        const { language_pack_id: packId, strings } = update;
        if (!packId) return;

        // localization_target 非 tdesktop 时忽略（当前仅用 tdesktop）
        if (update.localization_target && update.localization_target !== LOCALIZATION_TARGET) {
            return;
        }

        // strings 为空表示全量变更 → 重新拉取
        if (!strings || strings.length === 0) {
            if (currentPackId.value === packId || builtinPackId(currentCode.value) === packId) {
                try {
                    await ensureLanguagePack(packId, { forceSync: true });
                    applyPackToI18n(packId);
                    applyVueLocale(currentCode.value);
                } catch (e) {
                    console.warn("[language] full pack refresh failed:", packId, e);
                }
            } else {
                // 非当前语言也更新缓存，保证之后切换可离线
                void ensureLanguagePack(packId).catch(() => {});
            }
            return;
        }

        const merged = mergePackCache(packId, strings);
        if (!merged) {
            // 无缓存则全量拉一次
            void ensureLanguagePack(packId).catch(() => {});
            return;
        }

        const isCurrent =
            currentPackId.value === packId || builtinPackId(currentCode.value) === packId;
        if (isCurrent) {
            applyPackToI18n(packId);
            applyVueLocale(currentCode.value);
        }
    }

    /**
     * 初始化语言系统：
     * 1. 应用自有文案 + 官方英文保底（离线可完成）
     * 2. 恢复已缓存语言包到 td.*
     * 3. 监听 updateLanguagePackStrings
     * 4. 异步确保 en 包与当前包
     */
    async function init(): Promise<void> {
        // 打包官方英文 → 预填 en 缓存（离线首启）
        try {
            seedEnPackFromBundle();
        } catch (e) {
            console.warn("[language] seedEnPackFromBundle failed:", e);
        }

        ensureBuiltinMessages();

        // 先注入已缓存的 en 与当前语言包（离线可用）
        applyPackToI18n("en");
        const code = currentCode.value;
        const packId = builtinPackId(code) ?? code;
        if (packId !== "en") applyPackToI18n(packId);
        applyVueLocale(code);

        // 监听 TDLib 语言包更新
        if (!unlisten) {
            unlisten = await listen<Update>("tdlib-update", (event) => {
                if (event.payload._ === "updateLanguagePackStrings") {
                    void handleLanguagePackStringsUpdate(event.payload);
                }
            });
        }

        // 列表：先本地，再网络
        await refreshLanguageList({ onlyLocal: true });
        void refreshLanguageList();

        // 同步 TDLib 语言包（失败不阻塞）
        void applyTdlibPackId(packId);

        // 官方英文包：作为全局保底，始终优先确保
        void ensureLanguagePack("en")
            .then(() => applyPackToI18n("en"))
            .catch(() => {
                ensureBuiltinTdEnglish();
            });

        if (packId !== "en") {
            void ensureLanguagePack(packId)
                .then(() => applyPackToI18n(packId))
                .catch(() => {});
        }
    }

    function destroy(): void {
        if (unlisten) {
            unlisten();
            unlisten = null;
        }
    }

    // 持久化当前语言到 settings（防 setLanguage 未走 settings 的路径）
    watch(currentCode, (v) => {
        if (settings.language.code !== v) {
            settings.language.code = v;
        }
    });

    return {
        currentCode,
        languages,
        loadingList,
        loadingPack,
        listFromCacheOnly,
        currentPackId,
        isBuiltin,
        currentLabel,
        init,
        destroy,
        setLanguage,
        refreshLanguageList,
        handleLanguagePackStringsUpdate,
    };
});
