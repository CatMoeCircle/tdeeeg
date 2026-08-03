import { reactive, ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
import type { accentColor, profileAccentColor } from 'tdlib-types';
import { tdlibSend } from '../utils/tdlib';

/**
 * Telegram 色彩主题系统
 *
 * Telegram 的主题色彩由「色彩编号」（accent_color_id）驱动，颜色数据由 TDLib 通过
 * `updateAccentColors` / `updateProfileAccentColors` 下发。不同用户/群聊可拥有各自的
 * accent_color_id，用于：名称文字、无头像时的名称头像背景、回复栏、引用标记、链接预览等。
 *
 * 特殊说明：编号 0-6（红/橙/紫/violet/绿/青/蓝/粉）是「内置色」，TDLib 不会把它们放进
 * `updateAccentColors` 列表，而是要求从应用自身主题读取。因此这里为 0-6 提供了内置色表
 * （取自 Telegram Default 主题的 accent 值）。
 *
 * 用法：
 *   - 组件的 `<script setup>` 里调用 `useColors()` 拿到响应式状态与工具函数
 *   - 或用模块级函数（内部自动使用响应式状态）
 */

// ============================================================================
// 内置头像渐变色板（accent_color_id 0-6）— 取自 Telegram Web K 官方 CSS
// `--peer-avatar-{color}-top/bottom`，[顶色, 底色]，用于无照片头像的垂直渐变背景。
// 0=红 1=橙 2=紫罗兰 3=绿 4=青 5=蓝 6=粉
// ============================================================================

/** 把颜色加深（乘系数），用于单色时构造渐变端点 */
function darkenColor(rgb: number[], factor = 0.78): number[] {
    return rgb.map((c) => Math.max(0, Math.round(c * factor)));
}

/**
 * Telegram Web K 内置头像渐变色（[top, bottom] 顺序，垂直渐变）。
 * 取自官方 CSS 变量 --peer-avatar-{color}-top / -bottom。
 */
const AVATAR_GRADIENTS: number[][][] = [
    [[0xff, 0x84, 0x5e], [0xd4, 0x52, 0x46]], // 0 red     #FF845E → #D45246
    [[0xfe, 0xbb, 0x5b], [0xf6, 0x81, 0x36]], // 1 orange  #FEBB5B → #F68136
    [[0xb6, 0x94, 0xf9], [0x6c, 0x61, 0xdf]], // 2 violet  #B694F9 → #6C61DF
    [[0x9a, 0xd1, 0x64], [0x46, 0xba, 0x43]], // 3 green   #9AD164 → #46BA43
    [[0x53, 0xed, 0xd6], [0x28, 0xc9, 0xb7]], // 4 cyan    #53EDD6 → #28C9B7
    [[0x5c, 0xaf, 0xfa], [0x40, 0x8a, 0xcf]], // 5 blue    #5CAFFA → #408ACF
    [[0xff, 0x8a, 0xac], [0xd9, 0x55, 0x74]], // 6 pink    #FF8AAC → #D95574
];

/** 取内置色（0-6）的头像渐变对 [top, bottom]，明暗主题共用同色板 */
function builtInGradient(id: number, _useDark: boolean): number[][] {
    return AVATAR_GRADIENTS[id] || AVATAR_GRADIENTS[5];
}

/** 内置色（0-6）的文本色（名称文字用主色调；这里取渐变顶色） */
function builtInTextRgb(id: number, _useDark: boolean): number[] {
    return builtInGradient(id, false)[0];
}

/**
 * 官方 peer 色板兜底（Telegram Web K `--peer-{n}-color-rgb`）。
 * 当 `updateAccentColors` 缓存尚未填充时，用于自定义 accent id(≥7) 的主色回退。
 * 仅作兜底——正常情况下应优先使用 TDLib 下发到 accentColors 缓存的真实数据。
 */
const PEER_COLORS_FALLBACK: Record<number, number[]> = {
    0: [204, 80, 73],
    1: [214, 119, 34],
    2: [149, 92, 219],
    3: [64, 169, 32],
    4: [48, 158, 186],
    5: [54, 138, 209],
    6: [199, 80, 139],
    7: [255, 147, 128],
    8: [236, 176, 78],
    9: [198, 151, 255],
    10: [167, 235, 110],
    11: [64, 216, 208],
    12: [82, 191, 255],
    13: [255, 134, 166],
    14: [63, 162, 254],
    15: [255, 144, 94],
    16: [102, 211, 100],
    17: [34, 188, 226],
    18: [34, 188, 226],
    19: [151, 145, 255],
    20: [61, 166, 235],
};

// ============================================================================
// 响应式状态
// ============================================================================
const accentColors = reactive(new Map<number, accentColor>());
const profileAccentColors = reactive(new Map<number, profileAccentColor>());
const availableIds = ref<number[]>([]);
const profileAvailableIds = ref<number[]>([]);

/** 是否已初始化（防止重复注册监听） */
let initialized = false;

/** 请求中的去重标识 */
let fetchPromise: Promise<void> | null = null;

/**
 * 初始化：注册 updateAccentColors / updateProfileAccentColors 监听，
 * 并主动调用 getAccentColors / getProfileAccentColors 拉取一次以播种缓存。
 */
export async function initColors(): Promise<void> {
    if (initialized) return;
    initialized = true;

    // 监听主题色彩更新
    await listen('tdlib-update', (event: any) => {
        const update = event.payload;
        if (!update || typeof update !== 'object') return;
        if (update._ === 'updateAccentColors') {
            if (Array.isArray(update.colors)) {
                for (const c of update.colors) accentColors.set(c.id, c);
            }
            if (Array.isArray(update.available_accent_color_ids)) {
                availableIds.value = update.available_accent_color_ids;
            }
        } else if (update._ === 'updateProfileAccentColors') {
            if (Array.isArray(update.colors)) {
                for (const c of update.colors) profileAccentColors.set(c.id, c);
            }
            if (Array.isArray(update.available_accent_color_ids)) {
                profileAvailableIds.value = update.available_accent_color_ids;
            }
        }
    });

    // 主动播种（若 update 未到达或启动时未触发）
    void fetchAccentColors();
}

/** 播种某个 update 到对应缓存（updateAccentColors / updateProfileAccentColors） */
function seedUpdate(update: any) {
    if (!update || typeof update !== "object") return;
    if (update._ === "updateAccentColors") {
        if (Array.isArray(update.colors)) {
            for (const c of update.colors) accentColors.set(c.id, c);
        }
        if (Array.isArray(update.available_accent_color_ids)) {
            availableIds.value = update.available_accent_color_ids;
        }
    } else if (update._ === "updateProfileAccentColors") {
        if (Array.isArray(update.colors)) {
            for (const c of update.colors) profileAccentColors.set(c.id, c);
        }
        if (Array.isArray(update.available_accent_color_ids)) {
            profileAvailableIds.value = update.available_accent_color_ids;
        }
    }
}

/** 主动请求一次 accent colors（幂等去重） */
async function fetchAccentColors(): Promise<void> {
    if (fetchPromise) return fetchPromise;
    fetchPromise = (async () => {
        // getAccentColors / getProfileAccentColors 在部分 TDLib 版本可能不可用，静默失败
        try {
            const r = (await tdlibSend({ _: 'getAccentColors' } as any)) as any;
            if (r?.colors) {
                for (const c of r.colors) accentColors.set(c.id, c);
            }
            if (r?.available_accent_color_ids) {
                availableIds.value = r.available_accent_color_ids;
            }
        } catch (_) {
            /* 忽略 */
        }
        try {
            const r = (await tdlibSend({ _: 'getProfileAccentColors' } as any)) as any;
            if (r?.colors) {
                for (const c of r.colors) profileAccentColors.set(c.id, c);
            }
            if (r?.available_accent_color_ids) {
                profileAvailableIds.value = r.available_accent_color_ids;
            }
        } catch (_) {
            /* 忽略 */
        }
        // 若上面两个方法不可用（types 里没有，部分版本无此方法），
        // 用 getCurrentState 拿到初始 update（含 updateAccentColors / updateProfileAccentColors）补种。
        if (accentColors.size === 0 && profileAccentColors.size === 0) {
            try {
                const st = (await tdlibSend({ _: 'getCurrentState' } as any)) as any;
                if (Array.isArray(st?.updates)) {
                    for (const u of st.updates) seedUpdate(u);
                }
            } catch (_) {
                /* 忽略 */
            }
        }
    })();
    return fetchPromise;
}

// ============================================================================
// 颜色工具函数
// ============================================================================

/** 把 0xFF0000 数值转成 CSS hex */
export function intToCss(value: number): string {
    const s = (value & 0xffffff).toString(16).padStart(6, '0');
    return `#${s}`;
}

/** 把 RGB 三色转成 CSS rgba（alpha 可选） */
export function rgbToCss(rgb: number[], alpha = 1): string {
    const [r = 0, g = 0, b = 0] = rgb;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 把 RGB 数组转成 CSS hex */
export function rgbToHex(rgb: number[]): string {
    const [r = 0, g = 0, b = 0] = rgb;
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 把 0xRRGGBB 整数转为 [r,g,b] 三元组 */
export function intToRgb(value: number): number[] {
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * 解析 lib 返回的 accent 颜色数组。
 * 注意：light_theme_colors / dark_theme_colors 是「整数 RGB 色」的扁平数组
 * （每个元素是一个 0xRRGGBB 整数，如 [0xDF2020, 0xDFA520]），不是 [r,g,b] 三元组数组。
 */
function parseColorInts(list: number[] | undefined): number[][] {
    if (!Array.isArray(list)) return [];
    return list.filter((v) => typeof v === 'number').map((v) => intToRgb(v));
}

/** 取主题对应的主色 RGB 数组（单色） */
function getAccentRgb(
    id: number,
    list: Map<number, accentColor>,
    useDark: boolean,
): number[] {
    // 0-6 为内置色
    if (id >= 0 && id <= 6) {
        return builtInGradient(id, useDark)[0];
    }
    const entry = list.get(id);
    if (entry) {
        const arr = parseColorInts(useDark ? entry.dark_theme_colors : entry.light_theme_colors);
        if (arr.length > 0) return [...arr[0]];
    }
    // 兜底：官方 peer 色板；没有则回退到蓝色（5）
    return PEER_COLORS_FALLBACK[id] || builtInGradient(5, useDark)[0];
}

/** 取文本主题色对应的 RGB 数组 */
function getAccentTextRgb(id: number, useDark: boolean): number[] {
    if (id >= 0 && id <= 6) {
        return builtInTextRgb(id, useDark);
    }
    // 非内置色：用主题主色作为文字色
    return getAccentRgb(id, accentColors, useDark);
}

/** 生成该 accent 的完整渐变对 [from, to]，供头像背景使用 */
function getAccentGradient(id: number, useDark: boolean): number[][] {
    // 内置色：直接用官方 base 色渐变对
    if (id >= 0 && id <= 6) {
        return builtInGradient(id, useDark);
    }
    const entry = accentColors.get(id);
    if (entry) {
        const arr = parseColorInts(useDark ? entry.dark_theme_colors : entry.light_theme_colors);
        if (arr.length > 0) {
            const from = [...arr[0]];
            // 有次色则用次色，否则加深主色作为渐变终点
            const to = arr.length >= 2 ? [...arr[arr.length - 1]] : darkenColor(from);
            return [from, to];
        }
    }
    // 兜底：官方 peer 色主色 + 加深，保证自定义色在缓存未到时有正确渐变
    const fallback = PEER_COLORS_FALLBACK[id];
    if (fallback) {
        return [[...fallback], darkenColor(fallback, 0.8)];
    }
    // 回退：内置蓝
    return builtInGradient(5, useDark);
}

// ============================================================================
// 对外 API
// ============================================================================

export interface AccentColorStyle {
    /** 主要 RGB 颜色 */
    main: number[];
    /** 次色 RGB（可能为空） */
    secondary: number[];
    /** 主要颜色 CSS（hex），用于文字/描边 */
    color: string;
    /** 单色 CSS（hex/id 0-6 的文本色） */
    text: string;
    /** 主色半透明（用于回复栏背景等） */
    soft: string;
}

/** 计算某个 accent_color_id 在当前主题下的样式集 */
export function accentColorStyle(id: number): AccentColorStyle {
    const useDark = isDark.value;
    const main = getAccentRgb(id, accentColors, useDark);
    const grad = getAccentGradient(id, useDark);
    const secondary = grad.length > 0 ? [...grad[grad.length - 1]] : [];
    return {
        main,
        secondary,
        color: rgbToHex(main),
        text: rgbToHex(getAccentTextRgb(id, useDark)),
        soft: rgbToCss(main, 0.18),
    };
}

/**
 * 名称文字颜色（群聊中发送者名称、回复发送者名、forward 来源名等）。
 * Telegram 中名称文字色=该发送者的 accent 主色（文字用 `text`）。
 */
export function accentTextColor(id: number): string {
    return accentColorStyle(id).text;
}

/**
 * 生成无头像的「头像背景渐变」，使用 TDLib 的 profile accent 数据。
 *
 * Telegram 的头像渐变色来自 `updateProfileAccentColors` 中每个 profileAccentColor 的
 * `background_colors`（整数 RGB 数组：1 个=纯色背景，2 个=渐变）。对应的字段是
 * user/chat 的 `profile_accent_color_id`（-1 表示无特殊头像色）。
 *
 * 要点（避免渐变色"不对"）：
 * - 内置色 0-6：Telegram 各端（Web K / 移动端）对这些内置头像色固定渲染为
 *   「双色垂直渐变」（Web K 的 --peer-avatar-{color}-top/bottom），而不是 TDLib
 *   background_colors 里给出的单色。因此 0-6 **始终**使用内置渐变色板
 *   （AVATAR_GRADIENTS），保证与官方一致、永不变为扁平单色或错误色。
 * - 自定义色 ≥7：优先用 TDLib background_colors 的渐变；缓存未填充/缺失时
 *   回退到同 id 的强化 peer 色渐变，而非一律蓝色。
 */
export function accentAvatarBackground(profileAccentColorId: number): string {
    const useDark = isDark.value;

    // 内置色 0-6：始终使用 Web K 官方头像渐变色板（双色垂直渐变）
    if (profileAccentColorId >= 0 && profileAccentColorId <= 6) {
        const [from, to] = builtInGradient(profileAccentColorId, useDark);
        return `linear-gradient(${rgbToCss(from)}, ${rgbToCss(to)})`;
    }

    // 自定义色 ≥7：优先用 TDLib 下发的真实 background_colors
    const entry = profileAccentColors.get(profileAccentColorId);
    if (entry) {
        const theme = useDark ? entry.dark_theme_colors : entry.light_theme_colors;
        const bg = parseColorInts(theme?.background_colors);
        if (bg.length === 1) {
            return rgbToCss(bg[0]);
        }
        if (bg.length >= 2) {
            return `linear-gradient(${rgbToCss(bg[0])}, ${rgbToCss(bg[1])})`;
        }
    }

    // 回退：同 id 的 peer 色渐变（主色 + 加深），避免缓存未到时的"全蓝/全错"
    const fallback = PEER_COLORS_FALLBACK[profileAccentColorId];
    if (fallback) {
        return `linear-gradient(${rgbToCss(fallback)}, ${rgbToCss(darkenColor(fallback, 0.8))})`;
    }
    // 再兜底：内置蓝色（5）
    const [from, to] = builtInGradient(5, useDark);
    return `linear-gradient(${rgbToCss(from)}, ${rgbToCss(to)})`;
}

/** 判断当前是否暗色模式（跟随系统，与 Tailwind dark: 一致） */
export const isDark = ref<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
);

let mediaListener: MediaQueryList | null = null;

/** 订阅系统明暗模式变化 */
export function watchSystemColorScheme(): () => void {
    if (mediaListener) return () => { };
    mediaListener = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
        isDark.value = e.matches;
    };
    mediaListener.addEventListener('change', handler);
    return () => mediaListener?.removeEventListener('change', handler);
}

/** 便捷组合式 API：组件里调用 useColors() 使用 */
export function useColors() {
    return {
        isDark,
        accentColors,
        profileAccentColors,
        availableIds,
        profileAvailableIds,
        accentColorStyle,
        accentAvatarBackground,
        accentTextColor,
        intToCss,
        rgbToCss,
        rgbToHex,
    };
}
