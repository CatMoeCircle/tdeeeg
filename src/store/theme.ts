import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { settings } from "./settings";

/**
 * 主题系统：明暗模式 + 主题色 + 圆角/阴影/密度。
 *
 * 与两套样式体系对齐：
 * - Tailwind：html.dark 切换 dark: 变体；@theme inline 将 blue-* 映射到 brand 色阶
 * - TDesign：:root[theme-mode='dark'] + --td-brand-color-* / --td-radius-* / --td-shadow-* / --td-size-*
 *
 * 启动时尽早调用 initTheme()（main.ts 中 import 即应用），避免闪白/闪黑。
 */

export type ThemeMode = "light" | "dark" | "system";
export type ThemeRadius = "sharp" | "soft" | "round" | "extra";
export type ThemeShadow = "none" | "subtle" | "normal" | "strong";
export type ThemeDensity = "compact" | "default" | "large";

/** 圆角风格 → TDesign 五档半径（small/default/medium/large/extraLarge），单位 px */
const RADIUS_PRESETS: Record<ThemeRadius, [number, number, number, number, number]> = {
  sharp: [2, 3, 6, 9, 12],
  soft: [4, 6, 10, 14, 18],
  round: [6, 8, 12, 16, 22],
  extra: [8, 12, 16, 22, 28],
};

/** 密度 → TDesign 基础尺寸缩放 */
const DENSITY_SCALE: Record<ThemeDensity, number> = {
  compact: 0.875,
  default: 1,
  large: 1.125,
};

/** 阴影强度 → 透明度倍数 */
const SHADOW_ALPHA: Record<ThemeShadow, number> = {
  none: 0,
  subtle: 0.55,
  normal: 1,
  strong: 1.35,
};

/** 语义色默认值（TDesign 主色） */
const DEFAULT_SUCCESS = "#2ba471";
const DEFAULT_WARNING = "#e37318";
const DEFAULT_ERROR = "#d54941";

// ─── 颜色工具 ─────────────────────────────────────────────────

function clamp(n: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0x2a, 0xab, 0xee];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb: [number, number, number] | number[]): string {
  const [r = 0, g = 0, b = 0] = rgb as number[];
  return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`;
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * 由基础色生成 10 档色阶（对齐 TDesign brand-color-1..10）。
 * 1 最浅、7≈主色、10 最深；深色模式整体向亮端偏移，主色略提亮。
 */
export function generateColorScale(hex: string, dark: boolean): string[] {
  // 默认 Telegram 蓝：直接返回手工调校色阶，保证默认外观稳定
  const normalized = (hex || "").toLowerCase();
  if (normalized === "#3390ec" || normalized === "3390ec") {
    return dark
      ? [
          "#184774",
          "#1f5a96",
          "#2570b8",
          "#2b7fd4",
          "#3390ec",
          "#5aabea",
          "#5aabea",
          "#86c3f3",
          "#b8dcf8",
          "#dceefc",
        ]
      : [
          "#f0f7ff", // 1
          "#dceefc", // 2
          "#b8dcf8", // 3
          "#86c3f3", // 4
          "#5aabea", // 5
          "#3390ec", // 6 主色
          "#2b7fd4", // 7
          "#2570b8", // 8
          "#1f5a96", // 9
          "#184774", // 10
        ];
  }
  // 旧默认 Tailwind blue-500：保留原色阶
  if (normalized === "#3b82f6" || normalized === "3b82f6") {
    return dark
      ? [
          "#1e3a8a",
          "#1e40af",
          "#1d4ed8",
          "#2563eb",
          "#3b82f6",
          "#60a5fa",
          "#60a5fa",
          "#93c5fd",
          "#bfdbfe",
          "#dbeafe",
        ]
      : [
          "#eff6ff",
          "#dbeafe",
          "#bfdbfe",
          "#93c5fd",
          "#60a5fa",
          "#3b82f6",
          "#2563eb",
          "#1d4ed8",
          "#1e40af",
          "#1e3a8a",
        ];
  }

  const base = hexToRgb(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const scale: string[] = [];

  // 深色模式下把基础色往亮/饱和方向推一点，保证深底可读
  const root = dark ? mixRgb(base, white, 0.12) : base;

  for (let i = 0; i < 10; i++) {
    // i = 0..5 → 从近白混到 root；i = 6 → root；i = 7..9 → root 压暗
    if (i <= 5) {
      const t = 0.12 + (i / 5) * 0.88; // 12% → 100% root
      scale.push(rgbToHex(mixRgb(white, root, t)));
    } else if (i === 6) {
      scale.push(rgbToHex(root));
    } else {
      const t = (i - 6) / 4; // 0.25 / 0.5 / 0.75
      // 深色模式少压暗，避免与深底粘连
      const k = dark ? t * 0.45 : t * 0.72;
      scale.push(rgbToHex(mixRgb(root, black, k)));
    }
  }
  return scale;
}

/**
 * Tailwind blue-* 用色阶（50=最浅 tint，500=主色，950=最深）。
 * 深色模式下 50–200 变成「深底上的浅色 tint」（混入深灰），避免出现整块纯白。
 */
export function generateTailwindScale(hex: string, dark: boolean): string[] {
  const base = hexToRgb(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const bg: [number, number, number] = dark ? [30, 41, 59] : white;
  const scale: string[] = [];

  // 50..400：向 bg / 白混合的 tint；500=主色；600..950=压暗
  // 50
  scale.push(rgbToHex(mixRgb(bg, base, dark ? 0.12 : 0.08)));
  // 100
  scale.push(rgbToHex(mixRgb(bg, base, dark ? 0.2 : 0.16)));
  // 200
  scale.push(rgbToHex(mixRgb(bg, base, dark ? 0.32 : 0.32)));
  // 300
  scale.push(rgbToHex(mixRgb(bg, base, dark ? 0.48 : 0.52)));
  // 400
  scale.push(rgbToHex(mixRgb(base, dark ? white : white, dark ? 0.18 : 0.12)));
  // 500 主色（深色略提亮）
  const main = dark ? mixRgb(base, white, 0.1) : base;
  scale.push(rgbToHex(main));
  // 600
  scale.push(rgbToHex(mixRgb(main, black, 0.12)));
  // 700
  scale.push(rgbToHex(mixRgb(main, black, 0.28)));
  // 800
  scale.push(rgbToHex(mixRgb(main, black, 0.44)));
  // 900
  scale.push(rgbToHex(mixRgb(main, black, 0.6)));
  // 950
  scale.push(rgbToHex(mixRgb(main, black, 0.75)));
  return scale;
}

/** 某档颜色变透明度 */
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── 明暗解析 ─────────────────────────────────────────────────

const systemDark =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

let mediaQuery: MediaQueryList | null = null;
let systemListener: ((e: MediaQueryListEvent) => void) | null = null;

/** 系统偏好深浅（仅 system 模式下参与决策） */
const systemDarkRef = ref(systemDark);

/** 当前生效的深色模式（解析 system 后） */
export const isDark = computed(() => {
  const mode = settings.theme.mode;
  if (mode === "system") return systemDarkRef.value;
  return mode === "dark";
});

// ─── 应用主题 ─────────────────────────────────────────────────

function applyTdesignScale(root: HTMLElement, prefix: string, scale: string[]) {
  for (let i = 0; i < 10; i++) {
    root.style.setProperty(`--td-${prefix}-color-${i + 1}`, scale[i]);
  }
}

function applySemantic(
  root: HTMLElement,
  name: "success" | "warning" | "error",
  hex: string,
  dark: boolean,
) {
  const scale = generateColorScale(hex, dark);
  applyTdesignScale(root, name, scale);
  // TDesign 语义主色槽位：与品牌色一致，主色=用户设定值
  const primary = hex.toLowerCase();
  root.style.setProperty(`--td-${name}-color`, primary);
  root.style.setProperty(`--td-${name}-color-hover`, dark ? scale[4] : scale[6]);
  root.style.setProperty(`--td-${name}-color-focus`, scale[1]);
  root.style.setProperty(`--td-${name}-color-active`, dark ? scale[3] : scale[7]);
  root.style.setProperty(`--td-${name}-color-disabled`, scale[2]);
  root.style.setProperty(`--td-${name}-color-light`, scale[0]);
  root.style.setProperty(`--td-${name}-color-light-hover`, scale[1]);
  // 应用侧语义变量（自定义组件可直接用）
  root.style.setProperty(`--app-${name}`, primary);
  root.style.setProperty(`--app-${name}-hover`, dark ? scale[4] : scale[6]);
  root.style.setProperty(`--app-${name}-soft`, withAlpha(primary, 0.16));
}

export function applyTheme(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const t = settings.theme;
  const dark = isDark.value;
  // 浅/深各用一套主题色与背景色
  const brandHex = (dark ? t.brandColorDark : t.brandColorLight) || "#2aabee";
  const bgHex = dark
    ? t.bgColorDark || "#1e293b"
    : t.bgColorLight || "#f5f5f5";

  // 明暗：Tailwind class + TDesign theme-mode + color-scheme
  root.classList.toggle("dark", dark);
  root.setAttribute("theme-mode", dark ? "dark" : "light");
  root.style.colorScheme = dark ? "dark" : "light";

  // ── 界面背景色 ──
  root.style.setProperty("--app-bg-page", bgHex);
  // 比背景略亮/略暗的卡片底，便于层次
  const bgRgb = hexToRgb(bgHex);
  const container = dark
    ? rgbToHex(mixRgb(bgRgb, [255, 255, 255], 0.06))
    : rgbToHex(mixRgb(bgRgb, [255, 255, 255], 0.85));
  root.style.setProperty("--app-bg-container", container);
  // 主面板（对话列表 / 内容区 / 标题栏）铺的就是这一层：浅色直接等于用户选的主背景色，
  // 深色略微提亮以免与弹层底色糊在一起（原浅色写死 #ffffff，导致浅色下改背景色无效果）
  root.style.setProperty("--app-bg-elevated", dark
    ? rgbToHex(mixRgb(bgRgb, [255, 255, 255], 0.1))
    : rgbToHex(bgRgb));
  root.style.setProperty("--app-bg-muted", dark
    ? rgbToHex(mixRgb(bgRgb, [255, 255, 255], 0.04))
    : rgbToHex(mixRgb(bgRgb, [0, 0, 0], 0.04)));
  // 不把 html/body 涂实：侧栏/顶栏保持半透明以露出 acrylic

  // ── 品牌色 → TDesign brand 色阶 + Tailwind blue-* ──
  const brand = generateColorScale(brandHex, dark);
  applyTdesignScale(root, "brand", brand);
  // 主色始终等于当前模式的主题色；hover/active 按明暗向深/浅偏移
  const brandMain = brandHex.toLowerCase();
  const brandHover = dark ? brand[4] : brand[6];
  const brandActive = dark ? brand[3] : brand[7];
  root.style.setProperty("--td-brand-color", brandMain);
  root.style.setProperty("--td-brand-color-hover", brandHover);
  root.style.setProperty("--td-brand-color-focus", brand[1]);
  root.style.setProperty("--td-brand-color-active", brandActive);
  root.style.setProperty("--td-brand-color-disabled", brand[2]);
  root.style.setProperty("--td-brand-color-light", brand[0]);
  root.style.setProperty("--td-brand-color-light-hover", brand[1]);
  root.style.setProperty("--td-text-color-brand", brandMain);
  root.style.setProperty("--td-text-color-link", brandMain);

  // 应用侧品牌变量（自定义 UI / 预览用）：按 Tailwind 顺序 1=浅 tint … 10=深
  const displayScale = generateTailwindScale(brandHex, dark);
  for (let i = 0; i < 10; i++) {
    root.style.setProperty(`--app-brand-${i + 1}`, displayScale[i]);
  }
  root.style.setProperty("--app-brand", brandMain);
  root.style.setProperty("--app-brand-hover", brandHover);
  root.style.setProperty("--app-brand-active", brandActive);
  root.style.setProperty("--app-brand-soft", withAlpha(brandMain, dark ? 0.2 : 0.14));
  root.style.setProperty("--app-brand-softer", withAlpha(brandMain, dark ? 0.12 : 0.08));

  // Tailwind 语义重映射（@theme inline 引用这些变量）：
  // 50=浅 tint … 500=主色 … 950=深色；深色模式下 tint 混入深底，不出现纯白
  const twScale = generateTailwindScale(brandHex, dark);
  const twSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  twSteps.forEach((step, idx) => {
    root.style.setProperty(`--app-tw-blue-${step}`, twScale[idx] || brandMain);
  });

  // ── 语义色 ──
  applySemantic(root, "success", t.successColor || DEFAULT_SUCCESS, dark);
  applySemantic(root, "warning", t.warningColor || DEFAULT_WARNING, dark);
  applySemantic(root, "error", t.errorColor || DEFAULT_ERROR, dark);

  // ── 圆角 ──
  const [rs, rd, rm, rl, rxl] = RADIUS_PRESETS[t.radius] || RADIUS_PRESETS.soft;
  const k = Math.max(0.5, Math.min(2, t.radiusScale || 1));
  const r = (n: number) => `${Math.round(n * k * 10) / 10}px`;
  root.style.setProperty("--td-radius-small", r(rs));
  root.style.setProperty("--td-radius-default", r(rd));
  root.style.setProperty("--td-radius-medium", r(rm));
  root.style.setProperty("--td-radius-large", r(rl));
  root.style.setProperty("--td-radius-extraLarge", r(rxl));
  root.style.setProperty("--app-radius-xs", r(rs));
  root.style.setProperty("--app-radius-sm", r(rd));
  root.style.setProperty("--app-radius-md", r(rm));
  root.style.setProperty("--app-radius-lg", r(rl));
  root.style.setProperty("--app-radius-xl", r(rxl));

  // ── 阴影 ──
  const sa = SHADOW_ALPHA[t.shadow] ?? 1;
  if (t.shadow === "none") {
    root.style.setProperty("--td-shadow-1", "none");
    root.style.setProperty("--td-shadow-2", "none");
    root.style.setProperty("--td-shadow-3", "none");
    root.style.setProperty("--app-shadow-1", "none");
    root.style.setProperty("--app-shadow-2", "none");
    root.style.setProperty("--app-shadow-3", "none");
    root.style.setProperty("--box-shadow", "none");
  } else if (dark) {
    root.style.setProperty(
      "--td-shadow-1",
      `0 4px 6px rgba(0,0,0,${0.2 * sa}), 0 1px 10px rgba(0,0,0,${0.24 * sa}), 0 2px 4px rgba(0,0,0,${0.28 * sa})`,
    );
    root.style.setProperty(
      "--td-shadow-2",
      `0 8px 10px rgba(0,0,0,${0.28 * sa}), 0 3px 14px rgba(0,0,0,${0.24 * sa}), 0 5px 5px rgba(0,0,0,${0.32 * sa})`,
    );
    root.style.setProperty(
      "--td-shadow-3",
      `0 16px 24px rgba(0,0,0,${0.32 * sa}), 0 6px 30px rgba(0,0,0,${0.28 * sa}), 0 8px 10px rgba(0,0,0,${0.36 * sa})`,
    );
    root.style.setProperty("--app-shadow-1", `0 1px 10px rgba(0,0,0,${0.22 * sa})`);
    root.style.setProperty("--app-shadow-2", `0 3px 14px rgba(0,0,0,${0.28 * sa})`);
    root.style.setProperty("--app-shadow-3", `0 6px 30px rgba(0,0,0,${0.34 * sa})`);
    root.style.setProperty("--box-shadow", `0 0 3px rgba(0,0,0,${0.45 * sa})`);
  } else {
    root.style.setProperty(
      "--td-shadow-1",
      `0 1px 10px rgba(0,0,0,${0.05 * sa}), 0 4px 5px rgba(0,0,0,${0.08 * sa}), 0 2px 4px -1px rgba(0,0,0,${0.12 * sa})`,
    );
    root.style.setProperty(
      "--td-shadow-2",
      `0 3px 14px 2px rgba(0,0,0,${0.05 * sa}), 0 8px 10px 1px rgba(0,0,0,${0.06 * sa}), 0 5px 5px -3px rgba(0,0,0,${0.1 * sa})`,
    );
    root.style.setProperty(
      "--td-shadow-3",
      `0 6px 30px 5px rgba(0,0,0,${0.05 * sa}), 0 16px 24px 2px rgba(0,0,0,${0.04 * sa}), 0 8px 10px -5px rgba(0,0,0,${0.08 * sa})`,
    );
    root.style.setProperty("--app-shadow-1", `0 0 3px rgba(0,0,0,${0.22 * sa})`);
    root.style.setProperty("--app-shadow-2", `0 1px 10px rgba(0,0,0,${0.12 * sa})`);
    root.style.setProperty("--app-shadow-3", `0 4px 16px rgba(0,0,0,${0.14 * sa})`);
    root.style.setProperty("--box-shadow", `0 0 3px rgba(0,0,0,${0.25 * sa})`);
  }

  // ── 密度 / 尺寸（对齐 TDesign size 阶梯）──
  const ds = DENSITY_SCALE[t.density] ?? 1;
  // TDesign 基础刻度 1..16 = 2,4,6,8,12,16,20,24,28,32,36,40,48,56,64,72
  const sizes = [2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];
  sizes.forEach((px, i) => {
    root.style.setProperty(`--td-size-${i + 1}`, `${Math.round(px * ds * 2) / 2}px`);
  });
  // 组件常用高度
  root.style.setProperty("--app-control-height", `${Math.round(32 * ds)}px`);
  root.style.setProperty("--app-control-height-s", `${Math.round(28 * ds)}px`);
  root.style.setProperty("--app-control-height-l", `${Math.round(40 * ds)}px`);

  // Win11：切换明暗时同步 acrylic 窗口效果与 Theme
  void syncWindowEffect(dark);
}

/** 主题切换时重设 acrylic / 窗口明暗（Windows 11） */
let lastSyncedDark: boolean | null = null;
async function syncWindowEffect(dark: boolean): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await invoke("set_window_effect", { effect: "acrylic", dark });
    lastSyncedDark = dark;
  } catch (e) {
    // 非 Windows 或命令失败不阻塞主题切换
    console.warn("[theme] set_window_effect acrylic failed:", e);
  }
}

/** 当前是否已同步过的明暗（供调试） */
export function getSyncedWindowDark(): boolean | null {
  return lastSyncedDark;
}

// ─── 初始化 / 订阅 ────────────────────────────────────────────

let inited = false;

/** 尽早调用：应用当前主题并监听设置 / 系统明暗变化 */
export function initTheme(): void {
  if (inited) return;
  inited = true;

  // 首帧前应用，避免主题闪烁
  applyTheme();

  // 设置变更 → 重算（sync，避免切深色后色阶慢一拍）
  watch(
    () => settings.theme,
    () => applyTheme(),
    { deep: true, flush: "sync" },
  );

  // 系统明暗变化（仅 system 模式下生效）
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemListener = (e: MediaQueryListEvent) => {
      systemDarkRef.value = e.matches;
      if (settings.theme.mode === "system") applyTheme();
    };
    mediaQuery.addEventListener("change", systemListener);
  }
}

/** 便捷 API */
export const themeApi = {
  setMode(mode: ThemeMode) {
    settings.theme.mode = mode;
  },
  /** 写入当前明暗对应的主题色 */
  setBrandColor(hex: string) {
    if (isDark.value) settings.theme.brandColorDark = hex;
    else settings.theme.brandColorLight = hex;
  },
  setSuccessColor(hex: string) {
    settings.theme.successColor = hex;
  },
  setWarningColor(hex: string) {
    settings.theme.warningColor = hex;
  },
  setErrorColor(hex: string) {
    settings.theme.errorColor = hex;
  },
  reset() {
    settings.theme.mode = "system";
    // 默认使用 Telegram 蓝
    settings.theme.brandColorLight = "#2aabee";
    settings.theme.brandColorDark = "#2aabee";
    settings.theme.bgColorLight = "";
    settings.theme.bgColorDark = "";
    settings.theme.successColor = "";
    settings.theme.warningColor = "";
    settings.theme.errorColor = "";
    settings.theme.radius = "soft";
    settings.theme.radiusScale = 1;
    settings.theme.shadow = "normal";
    settings.theme.density = "default";
  },

  /** 当前模式下的主题色（浅/深各一套） */
  getActiveBrandColor(): string {
    return isDark.value
      ? settings.theme.brandColorDark || "#2aabee"
      : settings.theme.brandColorLight || "#2aabee";
  },
  setActiveBrandColor(hex: string) {
    if (isDark.value) settings.theme.brandColorDark = hex;
    else settings.theme.brandColorLight = hex;
  },
  getActiveBgColor(): string {
    return isDark.value
      ? settings.theme.bgColorDark || "#1e293b"
      : settings.theme.bgColorLight || "#f5f5f5";
  },
  setActiveBgColor(hex: string) {
    if (isDark.value) settings.theme.bgColorDark = hex;
    else settings.theme.bgColorLight = hex;
  },
  clearActiveBgColor() {
    if (isDark.value) settings.theme.bgColorDark = "";
    else settings.theme.bgColorLight = "";
  },
};
