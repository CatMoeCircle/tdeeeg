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

const i18n = createI18n({
  legacy: false,
  // default to Simplified Chinese (China)
  locale: "zh-CN",
  fallbackLocale: "en",
  messages,
});

export default i18n;
