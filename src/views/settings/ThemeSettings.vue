<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('themeSettings.title') }}</h2>
            <div class="flex-1"></div>
            <button type="button"
                class="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-500/40 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                @click="resetTheme">
                {{ t('themeSettings.reset') }}
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">

                <!-- ===== 明暗模式 ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('themeSettings.modeSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-3">
                        <button v-for="opt in modeOptions" :key="opt.value" type="button"
                            class="flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors"
                            :class="settings.theme.mode === opt.value
                                ? 'border-blue-500 bg-blue-100/60 dark:bg-blue-900/40 backdrop-blur-md'
                                : 'border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md hover:bg-black/5 dark:hover:bg-white/5'"
                            @click="themeApi.setMode(opt.value)">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="opt.iconClass">
                                <component :is="opt.icon" class="w-5 h-5" />
                            </div>
                            <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ opt.label }}</span>
                        </button>
                    </div>
                    <p class="mt-2 text-xs text-gray-400">{{ t('themeSettings.modeDesc') }}</p>
                </section>

                <!-- ===== 主题色 + 语义色预览 ===== -->
                <PreviewCard class="mb-8" :subtitle="t('themeSettings.previewAccent')"
                    body-class="p-4 bg-gray-50 dark:bg-gray-800/60">
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="px-4 py-2 rounded-full text-white text-sm font-medium shadow-sm bg-blue-500">
                            {{ t('themeSettings.previewPrimaryBtn') }}
                        </div>
                        <div
                            class="px-4 py-2 rounded-full text-sm font-medium border border-blue-500 text-blue-600 dark:text-blue-400">
                            {{ t('themeSettings.previewSecondaryBtn') }}
                        </div>
                        <div class="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                            <CheckCircleIcon class="w-4 h-4" />
                            <span>{{ t('themeSettings.previewLink') }}</span>
                        </div>
                        <div
                            class="w-9 h-5 rounded-full bg-blue-500 relative after:content-[''] after:absolute after:top-0.5 after:right-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full">
                        </div>
                    </div>
                    <div class="mt-4">
                        <p class="text-xs text-gray-400 mb-1.5">{{ t('themeSettings.brandSection') }}</p>
                        <div class="flex items-center gap-2">
                            <span v-for="step in 10" :key="step" class="flex-1 h-8 rounded-md"
                                :style="{ background: `var(--app-brand-${step})` }"></span>
                        </div>
                    </div>
                    <div class="mt-4 space-y-2.5">
                        <p class="text-xs text-gray-400">{{ t('themeSettings.semanticSection') }}</p>
                        <div v-for="item in semanticPreviewRows" :key="item.key" class="flex items-center gap-2.5">
                            <div class="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ item.label }}</div>
                            <div class="flex-1 flex items-center gap-1">
                                <span v-for="(c, i) in item.scale" :key="i" class="flex-1 h-6 rounded"
                                    :style="{ background: c }"></span>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0">
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                                    :style="{ background: item.primary }">Aa</span>
                                <span class="w-4 h-4 rounded-full border-2"
                                    :style="{ borderColor: item.primary, background: item.soft }"></span>
                            </div>
                        </div>
                    </div>
                </PreviewCard>

                <!-- ===== 主题主色 ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('themeSettings.brandSection') }}
                            <span class="ml-2 normal-case tracking-normal text-xs px-2 py-0.5 rounded-full"
                                :class="themeIsDark ? 'bg-indigo-500/15 text-indigo-400' : 'bg-amber-500/15 text-amber-600'">
                                {{ themeIsDark ? t('themeSettings.modeDark') : t('themeSettings.modeLight') }}
                            </span>
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <div class="flex flex-wrap gap-2.5 mb-4">
                        <button v-for="p in brandPresets" :key="p.hex" type="button"
                            class="w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
                            :class="isBrandSelected(p.hex) ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'"
                            :style="{ background: p.hex }" :title="p.label" @click="themeApi.setBrandColor(p.hex)">
                            <CheckIcon v-if="isBrandSelected(p.hex)" class="w-4 h-4 text-white drop-shadow" />
                        </button>
                        <label
                            class="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors relative overflow-hidden">
                            <PaletteIcon class="w-4 h-4 text-gray-400 pointer-events-none" />
                            <input type="color" class="absolute inset-0 opacity-0 cursor-pointer"
                                :value="activeBrandColor" @input="onCustomBrand($event)" />
                        </label>
                    </div>

                    <div class="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md">
                        <div class="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 shrink-0"
                            :style="{ background: activeBrandColor }"></div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-gray-900 dark:text-gray-100">{{ t('themeSettings.brandCurrent') }}</p>
                            <p class="text-xs text-gray-400 font-mono">{{ activeBrandColor }}</p>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                            <span class="flex items-center gap-1">
                                <i class="w-3 h-3 rounded-full inline-block"
                                    :style="{ background: settings.theme.brandColorLight }"></i>
                                {{ t('themeSettings.modeLight') }}
                            </span>
                            <span class="flex items-center gap-1">
                                <i class="w-3 h-3 rounded-full inline-block"
                                    :style="{ background: settings.theme.brandColorDark }"></i>
                                {{ t('themeSettings.modeDark') }}
                            </span>
                        </div>
                    </div>
                    <p class="mt-2 text-xs text-gray-400">{{ t('themeSettings.brandDesc') }}</p>
                    <p class="mt-1 text-xs text-gray-400">{{ t('themeSettings.brandDualHint') }}</p>
                </section>

                <!-- ===== 背景色 ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('themeSettings.bgSection') }}
                            <span class="ml-2 normal-case tracking-normal text-xs px-2 py-0.5 rounded-full"
                                :class="themeIsDark ? 'bg-indigo-500/15 text-indigo-400' : 'bg-amber-500/15 text-amber-600'">
                                {{ themeIsDark ? t('themeSettings.modeDark') : t('themeSettings.modeLight') }}
                            </span>
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <div class="flex flex-wrap gap-2.5 mb-4">
                        <button v-for="p in bgPresets" :key="p.key" type="button"
                            class="w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
                            :class="isBgSelected(p) ? 'border-gray-900 dark:border-white scale-110' : 'border-gray-200 dark:border-gray-700'"
                            :style="{ background: p.css }" :title="p.label" @click="applyBgPreset(p)">
                            <CheckIcon v-if="isBgSelected(p)" class="w-4 h-4 drop-shadow"
                                :style="{ color: p.check || '#2aabee' }" />
                        </button>
                        <label
                            class="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors relative overflow-hidden">
                            <PaletteIcon class="w-4 h-4 text-gray-400 pointer-events-none" />
                            <input type="color" class="absolute inset-0 opacity-0 cursor-pointer"
                                :value="activeBgColor" @input="onCustomBg($event)" />
                        </label>
                    </div>

                    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden">
                        <div class="p-4" :style="{ background: activeBgColor }">
                            <div class="rounded-lg p-3 shadow-sm border" :style="{
                                background: bgPreviewContainer,
                                borderColor: themeIsDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            }">
                                <div class="flex items-center gap-2">
                                    <div class="w-2 h-2 rounded-full" :style="{ background: activeBrandColor }"></div>
                                    <div class="h-2 flex-1 rounded"
                                        :style="{ background: themeIsDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }">
                                    </div>
                                </div>
                                <div class="mt-2 h-2 w-2/3 rounded"
                                    :style="{ background: themeIsDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }">
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60">
                            <div class="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 shrink-0"
                                :style="{ background: activeBgColor }"></div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm text-gray-900 dark:text-gray-100">{{ t('themeSettings.bgCurrent') }}</p>
                                <p class="text-xs text-gray-400 font-mono">{{ activeBgColor }}{{ activeBgIsDefault ?
                                    ` (${t('themeSettings.bgDefault')})` : '' }}</p>
                            </div>
                            <button v-if="!activeBgIsDefault" type="button"
                                class="text-xs text-blue-500 hover:text-blue-600 shrink-0"
                                @click="themeApi.clearActiveBgColor()">
                                {{ t('themeSettings.restore') }}
                            </button>
                        </div>
                    </div>
                    <p class="mt-2 text-xs text-gray-400">{{ t('themeSettings.bgDesc') }}</p>
                </section>

                <!-- ===== 语义色 ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('themeSettings.semanticSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div
                        class="border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                        <div v-for="item in semanticItems" :key="item.key" class="px-4 py-3 flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 shrink-0"
                                :style="{ background: item.current }"></div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm text-gray-900 dark:text-gray-100">{{ item.label }}</p>
                                <p class="text-xs text-gray-400 truncate">{{ item.hint }}</p>
                            </div>
                            <input type="color" class="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                                :value="item.hex" @input="item.set(($event.target as HTMLInputElement).value)" />
                            <button v-if="item.customized" type="button"
                                class="text-xs text-blue-500 hover:text-blue-600 shrink-0" @click="item.clear()">
                                {{ t('themeSettings.restore') }}
                            </button>
                        </div>
                    </div>
                    <p class="mt-2 text-xs text-gray-400">{{ t('themeSettings.semanticDesc') }}</p>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
    ChevronLeft as ChevronLeftIcon,
    Check as CheckIcon,
    CheckCircle as CheckCircleIcon,
    Sun as SunIcon,
    Moon as MoonIcon,
    Monitor as MonitorIcon,
    Palette as PaletteIcon,
} from 'lucide-vue-next';
import { settings } from '../../store/settings';
import {
    themeApi, generateTailwindScale, isDark as themeIsDark, type ThemeMode,
} from '../../store/theme';
import PreviewCard from '../../components/settings/PreviewCard.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const router = useRouter();

function goBack() {
    router.push('/home/settings/appearance');
}

function resetTheme() {
    themeApi.reset();
}

const modeOptions = computed(() => [
    {
        value: 'light' as ThemeMode,
        label: t('themeSettings.modeLight'),
        icon: SunIcon,
        iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    },
    {
        value: 'dark' as ThemeMode,
        label: t('themeSettings.modeDark'),
        icon: MoonIcon,
        iconClass: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
    },
    {
        value: 'system' as ThemeMode,
        label: t('themeSettings.modeSystem'),
        icon: MonitorIcon,
        iconClass: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400',
    },
]);

// ─── 主题色 / 背景色（浅深各一套） ──────────────────────────
const activeBrandColor = computed(() =>
    themeIsDark.value
        ? (settings.theme.brandColorDark || '#2aabee')
        : (settings.theme.brandColorLight || '#2aabee'),
);

const activeBgColor = computed(() =>
    themeIsDark.value
        ? (settings.theme.bgColorDark || '#1e293b')
        : (settings.theme.bgColorLight || '#f5f5f5'),
);

const activeBgIsDefault = computed(() =>
    themeIsDark.value
        ? !settings.theme.bgColorDark
        : !settings.theme.bgColorLight,
);

const bgPreviewContainer = computed(() =>
    themeIsDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.92)',
);

const brandPresets = computed(() => [
    { hex: '#2aabee', label: t('themeSettings.presetTelegram') },
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#2563eb', label: 'Blue Dark' },
    { hex: '#4f46e5', label: 'Indigo' },
    { hex: '#7c3aed', label: 'Violet' },
    { hex: '#db2777', label: 'Pink' },
    { hex: '#e11d48', label: 'Rose' },
    { hex: '#ea580c', label: 'Orange' },
    { hex: '#16a34a', label: 'Green' },
    { hex: '#0d9488', label: 'Teal' },
    { hex: '#0891b2', label: 'Cyan' },
    { hex: '#111827', label: 'Gray' },
]);

function isBrandSelected(hex: string) {
    return activeBrandColor.value.toLowerCase() === hex.toLowerCase();
}

function onCustomBrand(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (v) themeApi.setBrandColor(v);
}

interface BgPreset {
    key: string;
    label: string;
    hex: string | null;
    css: string;
    check?: string;
}

const bgPresets = computed<BgPreset[]>(() => {
    const dark = themeIsDark.value;
    return [
        { key: 'default', label: t('themeSettings.bgDefault'), hex: null, css: dark ? '#1e293b' : '#f5f5f5', check: dark ? '#fff' : '#2aabee' },
        { key: 'pure', label: dark ? '#111' : '#fff', hex: dark ? '#111111' : '#ffffff', css: dark ? '#111111' : '#ffffff', check: dark ? '#fff' : '#2aabee' },
        { key: 'slate', label: dark ? '#1e293b' : '#f1f5f9', hex: dark ? '#1e293b' : '#f1f5f9', css: dark ? '#1e293b' : '#f1f5f9', check: dark ? '#fff' : '#2aabee' },
        { key: 'bluegray', label: dark ? '#0f172a' : '#f0f7ff', hex: dark ? '#0f172a' : '#f0f7ff', css: dark ? '#0f172a' : '#f0f7ff', check: '#fff' },
        { key: 'warm', label: dark ? '#1c1917' : '#fafaf9', hex: dark ? '#1c1917' : '#fafaf9', css: dark ? '#1c1917' : '#fafaf9', check: dark ? '#fff' : '#2aabee' },
        { key: 'zinc', label: dark ? '#27272a' : '#fafafa', hex: dark ? '#27272a' : '#fafafa', css: dark ? '#27272a' : '#fafafa', check: dark ? '#fff' : '#2aabee' },
        // 深色下 slate 与「默认」同色，重复项隐掉
    ].filter((p) => !(dark && p.key === 'slate'));
});

function isBgSelected(p: BgPreset) {
    if (p.hex === null) return activeBgIsDefault.value;
    return activeBgColor.value.toLowerCase() === p.hex.toLowerCase();
}

function applyBgPreset(p: BgPreset) {
    if (p.hex === null) themeApi.clearActiveBgColor();
    else themeApi.setActiveBgColor(p.hex);
}

function onCustomBg(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (v) themeApi.setActiveBgColor(v);
}

// ─── 语义色 ─────────────────────────────────────────────────
const SEMANTIC_DEFAULTS: Record<string, string> = {
    success: '#2ba471',
    warning: '#e37318',
    error: '#d54941',
};

const semanticItems = computed(() => {
    return (['success', 'warning', 'error'] as const).map((key) => {
        const custom = settings.theme[`${key}Color`];
        const current = custom || SEMANTIC_DEFAULTS[key];
        return {
            key,
            label: t(`themeSettings.semantic.${key}`),
            hint: custom ? t('themeSettings.semanticCustom') : t('themeSettings.semanticDefault'),
            hex: current,
            current,
            customized: !!custom,
            set: (v: string) => {
                (settings.theme as Record<string, unknown>)[`${key}Color`] = v;
            },
            clear: () => {
                (settings.theme as Record<string, unknown>)[`${key}Color`] = '';
            },
        };
    });
});

const semanticPreviewRows = computed(() => {
    const dark = themeIsDark.value;
    return (['success', 'warning', 'error'] as const).map((key) => {
        const custom = settings.theme[`${key}Color`];
        const primary = custom || SEMANTIC_DEFAULTS[key];
        const scale = generateTailwindScale(primary, dark);
        return {
            key,
            label: t(`themeSettings.semantic.${key}`),
            primary: dark ? generateTailwindScale(primary, true)[5] : primary,
            scale,
            soft: `color-mix(in srgb, ${primary} ${dark ? 22 : 16}%, transparent)`,
        };
    });
});
</script>
