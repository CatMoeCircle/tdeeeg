/**
 * TDLib translateText 目标语言（to_language_code）工具。
 *
 * 参考: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1translate_text.html
 * 文档中的 zh / zh-Hans、iw、in、ji 等别名已合并到其规范形式（zh-CN、he、id、yi），
 * 其余语言码保持原样，均为 TDLib 支持的有效值。
 *
 * 显示名用 Intl.DisplayNames（CLDR）按当前 UI 语言本地化；
 * zh-CN / zh-TW 映射到 zh-Hans / zh-Hant，以得到「简体中文 / 繁体中文」而非「中文（中国）」。
 */

import i18n from "../i18n";

export interface TranslateLanguageOption {
    /** 传给 TDLib translateText 的 to_language_code */
    code: string;
    /** 显示名（getTranslateLanguageOptions 返回时已本地化） */
    label: string;
}

/** 默认目标语言：简体中文（仅作兜底；优先跟随语言包） */
export const DEFAULT_TRANSLATE_TARGET = "zh-CN";

/**
 * DisplayNames 查询码。
 * zh-CN / zh-TW 用语言+地区会得到「中文（中国）/中文（台湾）」，
 * 用 zh-Hans / zh-Hant 才是「简体中文 / 繁体中文」。
 */
function displayCode(code: string): string {
    const lower = code.toLowerCase().replace(/_/g, "-");
    if (lower === "zh-cn" || lower === "zh-hans" || lower === "zh-sg") return "zh-Hans";
    if (lower === "zh-tw" || lower === "zh-hant" || lower === "zh-hk" || lower === "zh-mo") {
        return "zh-Hant";
    }
    return code;
}

/** vue-i18n locale → Intl 可用的 BCP-47（去掉 -raw / -tdesktop 等 pack 后缀） */
function uiLocaleForIntl(): string {
    // 读取 locale，保证 computed 内调用时语言切换会重新计算
    void i18n.global.locale.value;
    let loc = String(i18n.global.locale.value || "en");
    loc = loc.replace(/-raw$/i, "").replace(/-tdesktop$/i, "");
    if (!loc || loc === "tdesktop") return "en";
    try {
        // 无效 tag 会抛 RangeError
        new Intl.DisplayNames([loc], { type: "language" });
        return loc;
    } catch {
        return "en";
    }
}

function displayNamesOf(code: string, locale: string): string | null {
    try {
        const dn = new Intl.DisplayNames([locale], {
            type: "language",
            languageDisplay: "dialect",
        } as Intl.DisplayNamesOptions);
        const name = dn.of(displayCode(code));
        // 未知码可能原样返回 code
        if (!name || name === code || name === displayCode(code)) return null;
        return name;
    } catch {
        return null;
    }
}

/** 语言码 → 当前 UI 语言下的显示名（Intl 不可用时回退中文表，再回退 code） */
export function getTranslateLanguageLabel(code: string): string {
    if (!code) return "";
    return displayNamesOf(code, uiLocaleForIntl()) ?? fallbackLabel(code) ?? code;
}

/** 语言码 → 该语言自称（如 français / 日本語） */
export function getTranslateLanguageNativeName(code: string): string {
    if (!code) return "";
    const dc = displayCode(code);
    return displayNamesOf(code, dc) ?? fallbackLabel(code) ?? code;
}

/** 硬编码中文兜底（仅 Intl 失败时） */
function fallbackLabel(code: string): string | null {
    const hit = TRANSLATE_TARGET_LANGUAGES.find(
        (l) => l.code.toLowerCase() === code.toLowerCase()
    );
    return hit?.label ?? null;
}

/** 本地化下拉选项（label 跟随 UI 语言） */
export function getTranslateLanguageOptions(): TranslateLanguageOption[] {
    return TRANSLATE_TARGET_LANGUAGES.map((l) => ({
        code: l.code,
        label: getTranslateLanguageLabel(l.code),
    }));
}

/**
 * 将界面语言 / TDLib 语言包 code 映射为 TDLib translate 目标语言码。
 *
 * 例：
 * - zh-CN / zh / zh-Hans / zh-hans-raw → zh-CN
 * - zh-TW / zh-Hant / zh-hant-raw → zh-TW
 * - en / en-raw / tdesktop → en
 * - ja-raw → ja
 */
export function uiLanguageToTranslateCode(uiCode: string): string {
    if (!uiCode) return DEFAULT_TRANSLATE_TARGET;
    let c = uiCode.trim();
    // TDLib pack id 后缀
    c = c.replace(/-raw$/i, "").replace(/-tdesktop$/i, "");
    const lower = c.toLowerCase();
    if (lower === "zh" || lower.startsWith("zh-hans") || lower === "zh-cn" || lower === "zh_cn") return "zh-CN";
    if (lower.startsWith("zh-hant") || lower === "zh-tw" || lower === "zh_tw" || lower === "zh-hk") return "zh-TW";
    if (lower === "en" || lower.startsWith("en-")) return "en";
    // 语言包 id 可能形如 pt-BR；其余取主语言子标签
    const known = TRANSLATE_TARGET_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
    if (known) return known.code;
    const primary = lower.split(/[-_]/)[0];
    const hit = TRANSLATE_TARGET_LANGUAGES.find((l) => l.code.toLowerCase() === primary);
    return hit?.code ?? primary;
}

/**
 * TDLib translateText 支持的目标语言。
 * label 为中文兜底显示名；界面请用 getTranslateLanguageLabel / getTranslateLanguageOptions。
 */
export const TRANSLATE_TARGET_LANGUAGES: TranslateLanguageOption[] = [
    { code: "zh-CN", label: "简体中文" },
    { code: "zh-TW", label: "繁体中文" },
    { code: "af", label: "南非荷兰语" },
    { code: "sq", label: "阿尔巴尼亚语" },
    { code: "am", label: "阿姆哈拉语" },
    { code: "ar", label: "阿拉伯语" },
    { code: "hy", label: "亚美尼亚语" },
    { code: "az", label: "阿塞拜疆语" },
    { code: "eu", label: "巴斯克语" },
    { code: "be", label: "白俄罗斯语" },
    { code: "bn", label: "孟加拉语" },
    { code: "bs", label: "波斯尼亚语" },
    { code: "bg", label: "保加利亚语" },
    { code: "ca", label: "加泰罗尼亚语" },
    { code: "ceb", label: "宿务语" },
    { code: "co", label: "科西嘉语" },
    { code: "hr", label: "克罗地亚语" },
    { code: "cs", label: "捷克语" },
    { code: "da", label: "丹麦语" },
    { code: "nl", label: "荷兰语" },
    { code: "en", label: "英语" },
    { code: "eo", label: "世界语" },
    { code: "et", label: "爱沙尼亚语" },
    { code: "fi", label: "芬兰语" },
    { code: "fr", label: "法语" },
    { code: "fy", label: "弗里西亚语" },
    { code: "gl", label: "加利西亚语" },
    { code: "ka", label: "格鲁吉亚语" },
    { code: "de", label: "德语" },
    { code: "el", label: "希腊语" },
    { code: "gu", label: "古吉拉特语" },
    { code: "ht", label: "海地克里奥尔语" },
    { code: "ha", label: "豪萨语" },
    { code: "haw", label: "夏威夷语" },
    { code: "he", label: "希伯来语" },
    { code: "hi", label: "印地语" },
    { code: "hmn", label: "苗语" },
    { code: "hu", label: "匈牙利语" },
    { code: "is", label: "冰岛语" },
    { code: "ig", label: "伊博语" },
    { code: "id", label: "印度尼西亚语" },
    { code: "ga", label: "爱尔兰语" },
    { code: "it", label: "意大利语" },
    { code: "ja", label: "日语" },
    { code: "jv", label: "爪哇语" },
    { code: "kn", label: "卡纳达语" },
    { code: "kk", label: "哈萨克语" },
    { code: "km", label: "高棉语" },
    { code: "rw", label: "卢旺达语" },
    { code: "ko", label: "韩语" },
    { code: "ku", label: "库尔德语" },
    { code: "ky", label: "吉尔吉斯语" },
    { code: "lo", label: "老挝语" },
    { code: "la", label: "拉丁语" },
    { code: "lv", label: "拉脱维亚语" },
    { code: "lt", label: "立陶宛语" },
    { code: "lb", label: "卢森堡语" },
    { code: "mk", label: "马其顿语" },
    { code: "mg", label: "马达加斯加语" },
    { code: "ms", label: "马来语" },
    { code: "ml", label: "马拉雅拉姆语" },
    { code: "mt", label: "马耳他语" },
    { code: "mi", label: "毛利语" },
    { code: "mr", label: "马拉地语" },
    { code: "mn", label: "蒙古语" },
    { code: "my", label: "缅甸语" },
    { code: "ne", label: "尼泊尔语" },
    { code: "no", label: "挪威语" },
    { code: "ny", label: "齐切瓦语" },
    { code: "or", label: "奥里亚语" },
    { code: "ps", label: "普什图语" },
    { code: "fa", label: "波斯语" },
    { code: "pl", label: "波兰语" },
    { code: "pt", label: "葡萄牙语" },
    { code: "pt-BR", label: "巴西葡萄牙语" },
    { code: "pa", label: "旁遮普语" },
    { code: "ro", label: "罗马尼亚语" },
    { code: "ru", label: "俄语" },
    { code: "sm", label: "萨摩亚语" },
    { code: "gd", label: "苏格兰盖尔语" },
    { code: "sr", label: "塞尔维亚语" },
    { code: "st", label: "塞索托语" },
    { code: "sn", label: "绍纳语" },
    { code: "sd", label: "信德语" },
    { code: "si", label: "僧伽罗语" },
    { code: "sk", label: "斯洛伐克语" },
    { code: "sl", label: "斯洛文尼亚语" },
    { code: "so", label: "索马里语" },
    { code: "es", label: "西班牙语" },
    { code: "su", label: "巽他语" },
    { code: "sw", label: "斯瓦希里语" },
    { code: "sv", label: "瑞典语" },
    { code: "tl", label: "他加禄语" },
    { code: "tg", label: "塔吉克语" },
    { code: "ta", label: "泰米尔语" },
    { code: "tt", label: "鞑靼语" },
    { code: "te", label: "泰卢固语" },
    { code: "th", label: "泰语" },
    { code: "tr", label: "土耳其语" },
    { code: "tk", label: "土库曼语" },
    { code: "uk", label: "乌克兰语" },
    { code: "ur", label: "乌尔都语" },
    { code: "ug", label: "维吾尔语" },
    { code: "uz", label: "乌兹别克语" },
    { code: "vi", label: "越南语" },
    { code: "cy", label: "威尔士语" },
    { code: "xh", label: "科萨语" },
    { code: "yi", label: "意第绪语" },
    { code: "yo", label: "约鲁巴语" },
    { code: "zu", label: "祖鲁语" },
];
