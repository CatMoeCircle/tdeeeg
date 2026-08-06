import { reactive, ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
import type { accentColor, profileAccentColor, Update, Updates } from 'tdlib-types';
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
 * （取自 Telegram 官方客户端的精确色值）。
 *
 * 用法：
 *   - 组件的 `<script setup>` 里调用 `useColors()` 拿到响应式状态与工具函数
 *   - 或用模块级函数（内部自动使用响应式状态）
 */

// ============================================================================
// 内置色板 — 取自官方客户端精确色值
// 0=红 1=橙 2=紫罗兰 3=绿 4=青 5=蓝 6=粉
// ============================================================================

/** 把颜色加深（乘系数），用于单色时构造渐变端点 */
function darkenColor(rgb: number[], factor = 0.78): number[] {
    return rgb.map((c) => Math.max(0, Math.round(c * factor)));
}

/**
 * 内置 accent 色板（accent_color_id 0-6）—— 从官方客户端提取的色值。
 * 用于名称文字、回复栏、引用标记等 accent 主色。
 */
const BUILT_IN_ACCENTS: number[][] = [
    [0xEC, 0x5F, 0x6D], // 0 red     #EC5F6D
    [0xF2, 0xAC, 0x6A], // 1 orange  #F2AC6A
    [0x65, 0x60, 0xF6], // 2 violet  #6560F6
    [0x75, 0xC8, 0x73], // 3 green   #75C873
    [0x62, 0xC6, 0xB7], // 4 cyan    #62C6B7
    [0x51, 0x9D, 0xEA], // 5 blue    #519DEA
    [0xF2, 0x74, 0x9A], // 6 pink    #F2749A
];

/**
 * Telegram Web K 内置头像渐变色（[top, bottom] 顺序，垂直渐变）。
 * 取自官方 CSS 变量 --peer-avatar-{color}-top / -bottom。
 */
const AVATAR_GRADIENTS: number[][][] = [
    [[0xff, 0x84, 0x5e], [0xd4, 0x52, 0x46]], // 0 red
    [[0xfe, 0xbb, 0x5b], [0xf6, 0x81, 0x36]], // 1 orange
    [[0xb6, 0x94, 0xf9], [0x6c, 0x61, 0xdf]], // 2 violet
    [[0x9a, 0xd1, 0x64], [0x46, 0xba, 0x43]], // 3 green
    [[0x53, 0xed, 0xd6], [0x28, 0xc9, 0xb7]], // 4 cyan
    [[0x5c, 0xaf, 0xfa], [0x40, 0x8a, 0xcf]], // 5 blue
    [[0xff, 0x8a, 0xac], [0xd9, 0x55, 0x74]], // 6 pink
];

/** 取内置色（0-6）的头像渐变对 [top, bottom]，明暗主题共用同色板 */
function builtInGradient(id: number, _useDark: boolean): number[][] {
    return AVATAR_GRADIENTS[id] || AVATAR_GRADIENTS[5];
}

/** 内置色（0-6）的文本色（名称文字用主色调） */
function builtInTextRgb(id: number, _useDark: boolean): number[] {
    return BUILT_IN_ACCENTS[id] || BUILT_IN_ACCENTS[5];
}

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
    await listen<Update>('tdlib-update', (event) => {
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
function seedUpdate(update: Update) {
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
        try {
            const r = (await tdlibSend({ _: 'getAccentColors' } as unknown as Parameters<typeof tdlibSend>[0])) as { colors?: accentColor[]; available_accent_color_ids?: number[] };
            if (r?.colors) {
                for (const c of r.colors) accentColors.set(c.id, c);
            }
            if (r?.available_accent_color_ids) {
                availableIds.value = r.available_accent_color_ids;
            }
        } catch (_) { }
        try {
            const r = (await tdlibSend({ _: 'getProfileAccentColors' } as unknown as Parameters<typeof tdlibSend>[0])) as { colors?: profileAccentColor[]; available_accent_color_ids?: number[] };
            if (r?.colors) {
                for (const c of r.colors) profileAccentColors.set(c.id, c);
            }
            if (r?.available_accent_color_ids) {
                profileAvailableIds.value = r.available_accent_color_ids;
            }
        } catch (_) { }
        if (accentColors.size === 0 && profileAccentColors.size === 0) {
            try {
                const st = await tdlibSend({ _: 'getCurrentState' }) as Updates;
                if (Array.isArray(st?.updates)) {
                    for (const u of st.updates) seedUpdate(u as Update);
                }
            } catch (_) { }
        }
    })();
    return fetchPromise;
}

// ============================================================================
// 颜色工具函数
// ============================================================================

export function intToCss(value: number): string {
    const s = (value & 0xffffff).toString(16).padStart(6, '0');
    return `#${s}`;
}

export function rgbToCss(rgb: number[], alpha = 1): string {
    const [r = 0, g = 0, b = 0] = rgb;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbToHex(rgb: number[]): string {
    const [r = 0, g = 0, b = 0] = rgb;
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function intToRgb(value: number): number[] {
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function parseColorInts(list: number[] | undefined): number[][] {
    if (!Array.isArray(list)) return [];
    return list.filter((v) => typeof v === 'number').map((v) => intToRgb(v));
}

/** 主色 RGB（始终返回第一个颜色） */
function getAccentRgb(id: number, list: Map<number, accentColor>, useDark: boolean): number[] {
    if (id >= 0 && id <= 6) {
        return [...(BUILT_IN_ACCENTS[id] || BUILT_IN_ACCENTS[5])];
    }
    const entry = list.get(id);
    if (entry) {
        const arr = parseColorInts(useDark ? entry.dark_theme_colors : entry.light_theme_colors);
        if (arr.length > 0) return [...arr[0]];
    }
    return [...BUILT_IN_ACCENTS[5]];
}

/** 全部 accent 颜色（1-3 色，用于回复栏多色条） */
function getAccentAllColors(id: number, list: Map<number, accentColor>, useDark: boolean): number[][] {
    if (id >= 0 && id <= 6) {
        return [[...(BUILT_IN_ACCENTS[id] || BUILT_IN_ACCENTS[5])]];
    }
    const entry = list.get(id);
    if (entry) {
        const arr = parseColorInts(useDark ? entry.dark_theme_colors : entry.light_theme_colors);
        if (arr.length > 0) return arr.map((a) => [...a]);
    }
    return [[...BUILT_IN_ACCENTS[5]]];
}

function getAccentTextRgb(id: number, useDark: boolean): number[] {
    if (id >= 0 && id <= 6) return builtInTextRgb(id, useDark);
    return getAccentRgb(id, accentColors, useDark);
}

function getAccentGradient(id: number, useDark: boolean): number[][] {
    if (id >= 0 && id <= 6) return builtInGradient(id, useDark);
    const entry = accentColors.get(id);
    if (entry) {
        const arr = parseColorInts(useDark ? entry.dark_theme_colors : entry.light_theme_colors);
        if (arr.length > 0) {
            const from = [...arr[0]];
            const to = arr.length >= 2 ? [...arr[arr.length - 1]] : darkenColor(from);
            return [from, to];
        }
    }
    return builtInGradient(5, useDark);
}

// ============================================================================
// 对外 API
// ============================================================================

export interface AccentColorStyle {
    main: number[];
    secondary: number[];
    /** 全部 accent 颜色（1-3 色，用于回复栏多色条） */
    allColors: number[][];
    color: string;
    text: string;
    soft: string;
}

export function accentColorStyle(id: number): AccentColorStyle {
    const useDark = isDark.value;
    const main = getAccentRgb(id, accentColors, useDark);
    const grad = getAccentGradient(id, useDark);
    const secondary = grad.length > 0 ? [...grad[grad.length - 1]] : [];
    const all = getAccentAllColors(id, accentColors, useDark);
    return {
        main, secondary, allColors: all,
        color: rgbToHex(main),
        text: rgbToHex(getAccentTextRgb(id, useDark)),
        soft: rgbToCss(main, 0.18),
    };
}

export function accentTextColor(id: number): string {
    return accentColorStyle(id).text;
}

export function accentAvatarBackground(profileAccentColorId: number): string {
    const useDark = isDark.value;
    if (profileAccentColorId >= 0 && profileAccentColorId <= 6) {
        const [from, to] = builtInGradient(profileAccentColorId, useDark);
        return `linear-gradient(${rgbToCss(from)}, ${rgbToCss(to)})`;
    }
    const entry = profileAccentColors.get(profileAccentColorId);
    if (entry) {
        const theme = useDark ? entry.dark_theme_colors : entry.light_theme_colors;
        const bg = parseColorInts(theme?.background_colors);
        if (bg.length === 1) return rgbToCss(bg[0]);
        if (bg.length >= 2) return `linear-gradient(${rgbToCss(bg[0])}, ${rgbToCss(bg[1])})`;
    }
    const [from, to] = builtInGradient(5, useDark);
    return `linear-gradient(${rgbToCss(from)}, ${rgbToCss(to)})`;
}

export const isDark = ref<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
);

let mediaListener: MediaQueryList | null = null;

export function watchSystemColorScheme(): () => void {
    if (mediaListener) return () => { };
    mediaListener = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => { isDark.value = e.matches; };
    mediaListener.addEventListener('change', handler);
    return () => mediaListener?.removeEventListener('change', handler);
}

export function useColors() {
    return {
        isDark, accentColors, profileAccentColors,
        availableIds, profileAvailableIds,
        accentColorStyle, accentAvatarBackground, accentTextColor,
        intToCss, rgbToCss, rgbToHex,
    };
}
