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
});

export default i18n;
