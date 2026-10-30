import type { themeParameters$Input, webAppOpenParameters$Input } from "tdlib-types";

/**
 * Mini App 主题参数：把 tdgram 当前主题（CSS 变量）转成 TDLib themeParameters
 * 的 0xRRGGBB 整数，随 openWebApp 下发；同一份再传给 Rust 载体缓存，
 * 供 web_app_request_theme 应答（theme_changed）。
 */

/** "rgba(0, 0, 0, 0.9)" / "#3390ec" / "#3b82f6" → 0xRRGGBB */
function cssColorToInt(value: string | null | undefined, fallback: number): number {
  const v = (value ?? "").trim();
  if (!v) return fallback;
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return parseInt(h, 16);
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(v);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((n) => Math.round(parseFloat(n)));
    return (r << 16) | (g << 8) | b;
  }
  return fallback;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** 当前生效的主题参数（浅色/深色随文档 class 自动切换） */
export function buildMiniAppThemeParameters(): themeParameters$Input {
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const bg = cssVar("--app-bg-page", dark ? "#1e293b" : "#f5f5f5");
  const bgMuted = cssVar("--app-bg-muted", dark ? "#16202f" : "#eaeaea");
  const bgElevated = cssVar("--app-bg-elevated", dark ? "#26324a" : "#f5f5f5");
  const bgContainer = cssVar("--app-bg-container", dark ? "#1e293b" : "#ffffff");
  const text = cssVar("--app-text-primary", dark ? "#ffffff" : "#000000");
  const textSecondary = cssVar("--app-text-secondary", dark ? "#b3b3b3" : "#666666");
  const textPlaceholder = cssVar("--app-text-placeholder", dark ? "#8a8a8a" : "#999999");
  const brand = cssVar("--app-brand", "#2aabee");
  const error = cssVar("--app-error", "#d54941");

  return {
    _: "themeParameters",
    background_color: cssColorToInt(bg, dark ? 0x1e293b : 0xf5f5f5),
    secondary_background_color: cssColorToInt(bgMuted, dark ? 0x16202f : 0xeaeaea),
    header_background_color: cssColorToInt(bgElevated, dark ? 0x26324a : 0xf5f5f5),
    bottom_bar_background_color: cssColorToInt(bgElevated, dark ? 0x26324a : 0xf5f5f5),
    section_background_color: cssColorToInt(bgContainer, dark ? 0x1e293b : 0xffffff),
    section_separator_color: cssColorToInt(bgMuted, dark ? 0x16202f : 0xeaeaea),
    text_color: cssColorToInt(text, dark ? 0xffffff : 0x000000),
    accent_text_color: cssColorToInt(brand, 0x2aabee),
    section_header_text_color: cssColorToInt(textSecondary, dark ? 0xb3b3b3 : 0x666666),
    subtitle_text_color: cssColorToInt(textSecondary, dark ? 0xb3b3b3 : 0x666666),
    destructive_text_color: cssColorToInt(error, 0xd54941),
    hint_color: cssColorToInt(textPlaceholder, dark ? 0x8a8a8a : 0x999999),
    link_color: cssColorToInt(brand, 0x2aabee),
    button_color: cssColorToInt(brand, 0x2aabee),
    button_text_color: 0xffffff,
  };
}

/** 构建 openWebApp / getWebAppUrl 的 parameters（桌面端跟随 Unigram 用 fullsize） */
export function buildWebAppOpenParameters(
  mode?: webAppOpenParameters$Input["mode"],
): webAppOpenParameters$Input {
  return {
    _: "webAppOpenParameters",
    theme: buildMiniAppThemeParameters(),
    application_name: "tdgram",
    mode: mode ?? { _: "webAppOpenModeFullSize" },
  };
}
