<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('dev.title') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-8">

                <!-- 发送 TDLib 方法 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        {{ t('dev.sendTdlib') }}</h3>
                    <p class="text-xs text-gray-500 mb-2">
                        {{ t('dev.sendTdlibDesc') }}
                    </p>
                    <div class="flex items-center gap-2">
                        <input v-model="debugTdlibInput" type="text" placeholder='{"_":"getMe"}' spellcheck="false"
                            class="flex-1 min-w-0 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 ring-blue-500"
                            @keyup.enter="sendDebugTdlib" />
                        <button type="button"
                            class="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                            :disabled="debugTdlibSending" @click="sendDebugTdlib">
                            {{ debugTdlibSending ? t('dev.sending') : t('lng_forward_send') }}
                        </button>
                    </div>
                    <pre v-if="debugTdlibResult"
                        class="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-mono text-green-600 dark:text-green-400 overflow-auto max-h-60 whitespace-pre-wrap break-all">{{ debugTdlibResult }}</pre>
                    <p v-if="debugTdlibError"
                        class="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-mono text-red-500 dark:text-red-400 whitespace-pre-wrap break-all">
                        {{ debugTdlibError }}
                    </p>
                </section>

                <!-- 开关控制台打印 update -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        {{ t('dev.logs') }}</h3>
                    <button type="button"
                        class="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        @click="setLogUpdates(!logUpdates)">
                        <div class="text-left">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('dev.logUpdates') }}</p>
                            <p class="text-xs text-gray-500 mt-0.5">{{ t('dev.logUpdatesDesc') }}</p>
                        </div>
                        <div class="w-9 h-5 rounded-full transition-colors relative"
                            :class="logUpdates ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                            <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                                :class="logUpdates ? 'translate-x-4' : ''" />
                        </div>
                    </button>

                    <!-- 最近 Update 列表 -->
                    <div v-if="logUpdates" class="mt-4">
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-xs text-gray-500">{{ t('dev.recentCount', { count: recentUpdates.length })
                            }}</p>
                            <button type="button"
                                class="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                                @click="clearRecentUpdates()">
                                {{ t('dev.clear') }}
                            </button>
                        </div>
                        <div v-if="recentUpdates.length === 0"
                            class="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-6 text-center text-xs text-gray-400">
                            {{ t('dev.waitingUpdate') }}
                        </div>
                        <div v-else
                            class="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto custom-scrollbar">
                            <div v-for="u in recentUpdates" :key="u.seq"
                                class="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-baseline gap-2 flex-wrap">
                                        <span
                                            class="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">{{ u.type }}</span>
                                        <span class="text-[10px] text-gray-400 tabular-nums">{{ formatUpdateTime(u.t) }}</span>
                                    </div>
                                    <p class="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate font-mono"
                                        :title="u.preview">
                                        {{ u.preview || '—' }}
                                    </p>
                                </div>
                                <button type="button"
                                    class="shrink-0 px-2 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                                    :title="t('dev.copyFullJson')"
                                    @click="copyUpdate(u)">
                                    {{ t('dev.copy') }}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 右键菜单调试项 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        {{ t('dev.contextMenu') }}</h3>
                    <button type="button"
                        class="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        @click="setShowCopyJsonInMenus(!showCopyJsonInMenus)">
                        <div class="text-left">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('dev.showCopyJson')
                            }}</p>
                            <p class="text-xs text-gray-500 mt-0.5">{{ t('dev.showCopyJsonDesc') }}</p>
                        </div>
                        <div class="w-9 h-5 rounded-full transition-colors relative"
                            :class="showCopyJsonInMenus ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                            <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                                :class="showCopyJsonInMenus ? 'translate-x-4' : ''" />
                        </div>
                    </button>
                </section>

                <!-- 崩溃/白屏日志 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        {{ t('dev.crashLog') }}</h3>
                    <p class="text-xs text-gray-500 mb-3">
                        {{ t('dev.crashLogDesc') }}
                    </p>
                    <div class="flex gap-2">
                        <button type="button"
                            class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            @click="loadCrashLog">
                            {{ t('dev.refreshLog') }}
                        </button>
                        <button type="button"
                            class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-red-500"
                            @click="clearCrashLogAndReload">
                            {{ t('dev.clear') }}
                        </button>
                    </div>
                    <pre v-if="crashLogText"
                        class="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-auto max-h-80 whitespace-pre-wrap break-all">{{ crashLogText }}</pre>
                    <p v-else class="mt-3 text-xs text-gray-400">{{ t('dev.noCrashLog') }}</p>
                </section>

                <!-- 打开开发者工具 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        {{ t('dev.debugTools') }}</h3>
                    <button type="button"
                        class="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        @click="openDevTools">
                        <div class="text-left">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('dev.openDevtools')
                            }}</p>
                            <p class="text-xs text-gray-500 mt-0.5">{{ t('dev.openDevtoolsDesc') }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 翻译门控 / 语言识别测试 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        {{ t('dev.langTest') }}</h3>
                    <p class="text-xs text-gray-500 mb-3">{{ t('dev.langTestDesc') }}</p>

                    <textarea v-model="langTestInput" rows="3" spellcheck="false"
                        :placeholder="t('dev.langTestPh')"
                        class="w-full bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-blue-500 resize-y"></textarea>

                    <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span class="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            {{ t('dev.langTestTarget') }}：<span class="font-mono text-gray-700 dark:text-gray-300">{{ langTestTarget }}</span>
                        </span>
                        <span class="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            {{ t('dev.langTestDoNot') }}：<span class="font-mono text-gray-700 dark:text-gray-300">{{ langTestDoNotLabel }}</span>
                        </span>
                    </div>

                    <div class="mt-3 flex items-center gap-2">
                        <button type="button"
                            class="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                            :disabled="langTesting || !langTestInput.trim()" @click="runLangTest">
                            {{ langTesting ? t('dev.loading') : t('dev.langTestRun') }}
                        </button>
                        <button type="button"
                            class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            @click="clearLangTest">
                            {{ t('dev.clear') }}
                        </button>
                    </div>

                    <!-- 检查结果 -->
                    <div v-if="langTestResult" class="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div class="px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700"
                            :class="langTestResult.shouldTranslate
                                ? 'bg-green-50/80 dark:bg-green-900/20'
                                : 'bg-amber-50/80 dark:bg-amber-900/20'">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold"
                                    :class="langTestResult.shouldTranslate
                                        ? 'text-green-700 dark:text-green-300'
                                        : 'text-amber-700 dark:text-amber-300'">
                                    {{ langTestResult.shouldTranslate ? t('dev.langTestPass') : t('dev.langTestSkip') }}
                                </p>
                                <p class="text-[11px] text-gray-500 mt-0.5 font-mono">
                                    reason={{ langTestResult.reason }}
                                </p>
                            </div>
                            <span class="shrink-0 px-2 py-1 rounded-md text-[11px] font-mono font-semibold"
                                :class="langTestResult.shouldTranslate
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'">
                                shouldTranslate={{ langTestResult.shouldTranslate }}
                            </span>
                        </div>

                        <div class="px-4 py-3 space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <p class="text-[11px] text-gray-400 mb-0.5">{{ t('dev.langTestDetected') }}</p>
                                    <p class="text-sm font-mono text-gray-800 dark:text-gray-200">
                                        {{ langTestResult.detectedLanguage || '—' }}
                                    </p>
                                </div>
                                <div>
                                    <p class="text-[11px] text-gray-400 mb-0.5">{{ t('dev.langTestConfidence') }}</p>
                                    <p class="text-sm font-mono text-gray-800 dark:text-gray-200">
                                        {{ formatConfidence(langTestResult.confidence) }}
                                    </p>
                                </div>
                            </div>

                            <div v-if="langTestCandidates.length">
                                <p class="text-[11px] text-gray-400 mb-1">{{ t('dev.langTestCandidates') }}</p>
                                <div class="rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                    <div v-for="(c, i) in langTestCandidates" :key="c.language + i"
                                        class="flex items-center justify-between px-3 py-1.5 text-xs">
                                        <span class="font-mono text-gray-700 dark:text-gray-300">{{ c.language }}</span>
                                        <span class="font-mono tabular-nums text-gray-500">{{ formatConfidence(c.confidence) }}</span>
                                    </div>
                                </div>
                            </div>

                            <p v-if="langTestError" class="text-xs font-mono text-red-500 dark:text-red-400 whitespace-pre-wrap break-all">
                                {{ langTestError }}
                            </p>
                        </div>
                    </div>
                </section>

                <!-- 显示当前所有 Option 状态 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        {{ t('dev.optionStatus') }}</h3>
                    <button type="button"
                        class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 text-sm text-gray-900 dark:text-gray-100"
                        :disabled="debugOptionsLoading" @click="loadDebugOptions">
                        <RefreshCwIcon class="w-4 h-4 text-gray-400"
                            :class="debugOptionsLoading ? 'animate-spin' : ''" />
                        <span>{{ debugOptionsLoading ? t('dev.loading') : t('dev.refreshOptions') }}</span>
                    </button>
                    <div v-if="debugOptions && debugOptions.length"
                        class="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                        <div v-for="opt in debugOptions" :key="opt.name" class="px-3 py-2">
                            <p class="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                                <span class="text-gray-400">{{ opt.name }}</span> = {{ opt.value }}
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, RefreshCw as RefreshCwIcon } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { MessagePlugin } from 'tdesign-vue-next';
import {
    logUpdates, setLogUpdates, openDevTools, rawTdlibSend,
    showCopyJsonInMenus, setShowCopyJsonInMenus,
    recentUpdates, clearRecentUpdates, type CachedUpdate,
} from '../../store/debug';
import { readCrashLog, clearCrashLog } from '../../utils/crashGuard';
import { settings } from '../../store/settings';
import { getTranslateTargetLang } from '../../store/translate';
import { getTranslateLanguageLabel } from '../../utils/translateLanguages';
import {
    detectLanguage,
    detectLanguages,
    shouldTranslateText,
    type LanguageDetection,
    type ShouldTranslateDecision,
} from '../../utils/languageDetect';

function formatUpdateTime(t: number): string {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

async function copyUpdate(u: CachedUpdate) {
    try {
        await navigator.clipboard.writeText(JSON.stringify(u.payload, null, 2));
        MessagePlugin.success({ content: t('dev.copied', { type: u.type }), placement: 'top-right' });
    } catch (e) {
        MessagePlugin.error({ content: t('dev.copyFailed'), placement: 'top-right' });
        console.warn('copy update failed', e);
    }
}

const crashLogText = ref('');
function loadCrashLog() {
    const entries = readCrashLog();
    crashLogText.value = entries.length
        ? entries
            .map((e) => {
                const extra = e.extra ? `\n${JSON.stringify(e.extra, null, 2)}` : '';
                return `[${new Date(e.t).toLocaleString()}] ${e.type}: ${e.message}${extra}`;
            })
            .join('\n\n')
        : '';
}
function clearCrashLogAndReload() {
    clearCrashLog();
    crashLogText.value = '';
}
loadCrashLog();

const router = useRouter();

/** 返回设置列表 */
function goBack() {
    router.push('/home/settings');
}

// ─── 发送 TDLib 方法 ─────────────────────────

const debugTdlibInput = ref('');
const debugTdlibSending = ref(false);
const debugTdlibResult = ref('');
const debugTdlibError = ref('');

/** 发送用户输入的 TDLib 方法，并把结果打印/显示到控制台 */
async function sendDebugTdlib() {
    const raw = debugTdlibInput.value.trim();
    if (!raw) return;
    debugTdlibSending.value = true;
    debugTdlibResult.value = '';
    debugTdlibError.value = '';
    try {
        let request: Record<string, unknown>;
        // 兼容只输入方法名（如 "getMe"）与输入 JSON 两种形式
        if (raw.startsWith('{')) {
            request = JSON.parse(raw) as Record<string, unknown>;
        } else {
            request = { _: raw };
        }
        const result = await rawTdlibSend(request);
        console.log('[tdlibSend]', request, '=>', result);
        debugTdlibResult.value = JSON.stringify(result, null, 2);
    } catch (e) {
        const msg = e && typeof e === 'object' ? JSON.stringify(e) : String(e);
        console.error('[tdlibSend]', raw, '=> 错误:', e);
        debugTdlibError.value = msg;
    } finally {
        debugTdlibSending.value = false;
    }
}

// ─── 显示当前 Option 状态 ─────────────────────

const debugOptions = ref<{ name: string; value: string }[]>([]);
const debugOptionsLoading = ref(false);

/** 把 TDLib OptionValue 对象转成可读字符串 */
function optionValueToString(value: unknown): string {
    if (!value || typeof value !== 'object') return String(value ?? 'null');
    const v = value as Record<string, unknown>;
    switch (v._) {
        case 'optionValueBoolean':
            return String(v.value);
        case 'optionValueEmpty':
            return '(empty)';
        case 'optionValueInteger':
            return String(v.value);
        case 'optionValueString':
            return String(v.value);
        case 'optionValueChatList': {
            const cl = v.chat_list as Record<string, unknown> | undefined;
            return cl?._ === 'chatListMain' ? 'main' : (cl?._ === 'chatListArchive' ? 'archive' : String(cl?._ ?? ''));
        }
        default:
            return JSON.stringify(value);
    }
}

/** 从 Rust 缓存的 updateOption 读取所有已缓存的 Option 状态（不发起 getOption 请求） */
async function loadDebugOptions() {
    debugOptionsLoading.value = true;
    debugOptions.value = [];
    try {
        // get_cached_options 返回 { name: OptionValue }（name → JSON Value）
        const cached = (await invoke<Record<string, unknown>>('get_cached_options')) ?? {};
        debugOptions.value = Object.entries(cached)
            .map(([name, value]) => ({ name, value: optionValueToString(value) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.warn('[DeveloperSettings] get_cached_options failed:', e);
    } finally {
        debugOptionsLoading.value = false;
    }
}

// ─── 翻译门控 / 语言识别测试 ─────────────────

const langTestInput = ref('');
const langTesting = ref(false);
const langTestResult = ref<ShouldTranslateDecision | null>(null);
const langTestCandidates = ref<LanguageDetection[]>([]);
const langTestError = ref('');

/** 当前生效目标语言（与全部翻译一致） */
const langTestTarget = computed(() => {
    const code = getTranslateTargetLang();
    return `${getTranslateLanguageLabel(code)} (${code})`;
});

const langTestDoNotLabel = computed(() => {
    const list = settings.translate.doNotTranslate || [];
    if (!list.length) return '—';
    return list.map((c) => getTranslateLanguageLabel(c) || c).join('、');
});

function formatConfidence(v: number): string {
    return `${(v * 100).toFixed(2)}%`;
}

/** 输入文本 → 语言识别 + 翻译门控检查 */
async function runLangTest() {
    const text = langTestInput.value.trim();
    if (!text) return;
    langTesting.value = true;
    langTestResult.value = null;
    langTestCandidates.value = [];
    langTestError.value = '';
    const targetLang = getTranslateTargetLang();
    const doNot = settings.translate.doNotTranslate || [];
    try {
        const [decision, top, candidates] = await Promise.all([
            shouldTranslateText(text, targetLang, doNot),
            detectLanguage(text).catch(() => null),
            detectLanguages(text, 5).catch(() => [] as LanguageDetection[]),
        ]);
        langTestResult.value = decision;
        langTestCandidates.value = candidates.length
            ? candidates
            : (top ? [top] : []);
        console.log('[langTest]', { text, targetLang, doNot, decision, candidates });
    } catch (e) {
        langTestError.value = e && typeof e === 'object' ? JSON.stringify(e) : String(e);
        console.warn('[langTest] failed:', e);
    } finally {
        langTesting.value = false;
    }
}

function clearLangTest() {
    langTestInput.value = '';
    langTestResult.value = null;
    langTestCandidates.value = [];
    langTestError.value = '';
}
</script>
