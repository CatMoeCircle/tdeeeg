import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

const messages = {
  en,
  "zh-CN": zhCN,
  // keep generic `zh` to avoid breaking existing imports
  zh: zhCN,
  "zh-TW": zhTW,
};

/** vue-i18n 复数选择器：choice 为数量，返回管道消息下标 */
type PluralRule = (choice: number, choicesLength: number) => number;

/**
 * 斯拉夫（ru/uk/be…）CLDR：
 * one  1, 21, 31…（n%10=1 且 n%100≠11）
 * few  2–4, 22–24…（n%10=2–4 且 n%100∉12–14）
 * many 0, 5–20, 25–30, 11–14…
 * 其余（分数等）→ other，整数场景 many 已覆盖
 */
const slavicPlural: PluralRule = (choice) => {
  const n = Math.abs(Math.trunc(choice));
  if (n % 10 === 1 && n % 100 !== 11) return 0;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 1;
  return 2;
};

/** 法语等：0/1 → one，其余 → other */
const frenchLikePlural: PluralRule = (choice) =>
  Math.abs(Math.trunc(choice)) <= 1 ? 0 : 1;

/** 阿拉伯语 CLDR 六形态 */
const arabicPlural: PluralRule = (choice) => {
  const n = Math.abs(Math.trunc(choice));
  if (n === 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return 3;
  if (mod100 >= 11 && mod100 <= 99) return 4;
  return 5;
};

/** 语言码 → 复数规则（vue-i18n 默认只有 en 两形态，不含 ru 等） */
const PLURAL_RULES: Record<string, PluralRule> = {
  ru: slavicPlural,
  uk: slavicPlural,
  be: slavicPlural,
  sr: slavicPlural,
  hr: slavicPlural,
  bs: slavicPlural,
  mk: slavicPlural,
  fr: frenchLikePlural,
  ar: arabicPlural,
};

/** 从 plural_code / locale 推断规则（兼容 ru-RU 等） */
export function resolvePluralRule(code: string): PluralRule | undefined {
  const c = (code || "").toLowerCase();
  return (
    PLURAL_RULES[c] ||
    PLURAL_RULES[c.split("-")[0]] ||
    undefined
  );
}

/**
 * 为 vue-i18n locale 注册复数规则。
 * TDLib pack id（如 tdesktop）可能与 plural_code（如 ru）不同，合并语言包时需按实际 locale 再挂一份。
 * composer.pluralRules 只读，必须走内部 __setPluralRules。
 */
export function ensurePluralRule(locale: string, pluralCode: string): void {
  const rule = resolvePluralRule(pluralCode) || resolvePluralRule(locale);
  if (!rule) return;
  const global = i18n.global as any;
  const current = global.pluralRules || {};
  if (current[locale] === rule) return;
  const setterSym = Object.getOwnPropertySymbols(global).find((s) =>
    String(s).includes("__setPluralRules")
  );
  if (setterSym && typeof global[setterSym] === "function") {
    global[setterSym]({ ...current, [locale]: rule });
  }
}

/** 启动前从 localStorage 恢复语言，避免首屏闪默认语言 */
function restoreLocale(): string {
  try {
    const raw = localStorage.getItem("tdgram-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const code = parsed?.language?.code;
      if (typeof code === "string" && code) return code;
    }
  } catch {
    // ignore
  }
  // 兜底：跟随系统
  const nav = (navigator.language || "zh-CN").toLowerCase();
  if (nav.startsWith("zh-tw") || nav.startsWith("zh-hant")) return "zh-TW";
  if (nav.startsWith("zh")) return "zh-CN";
  if (nav.startsWith("en")) return "en";
  return "zh-CN";
}

const i18n = createI18n({
  legacy: false,
  locale: restoreLocale(),
  fallbackLocale: "en",
  messages,
  // 允许运行时注入 TDLib 语言包生成的 locale
  missingWarn: false,
  fallbackWarn: false,
  // 注意：composer 读的是 pluralRules（不是 pluralizationRules）
  pluralRules: PLURAL_RULES,
});

export default i18n;
