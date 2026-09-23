<template>
    <div v-bind="$attrs" class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('translateSettings.title') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-8">

                <!-- ===== 显示方式 ===== -->
                <section>
                    <SectionHeader :title="t('translateSettings.displaySection')"
                        :desc="t('translateSettings.displayDesc')" />
                    <div class="space-y-3">
                        <ModeCard :selected="settings.translate.displayMode === 'popup'" :icon="LanguageIcon"
                            icon-class="bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                            :title="t('appearance.translatePopup')" :desc="t('appearance.translatePopupDesc')"
                            @click="settings.translate.displayMode = 'popup'" />
                        <ModeCard :selected="settings.translate.displayMode === 'inline'" :icon="MessageSquareTextIcon"
                            icon-class="bg-green-100 dark:bg-green-900/30 text-green-600"
                            :title="t('appearance.translateInline')" :desc="t('appearance.translateInlineDesc')"
                            @click="settings.translate.displayMode = 'inline'" />
                    </div>
                </section>

                <!-- ===== 基础行为 ===== -->
                <section>
                    <SectionHeader :title="t('translateSettings.behaviorSection')"
                        :desc="t('translateSettings.behaviorDesc')" />

                    <!-- 目标语言：空 = 跟随语言包 -->
                    <div
                        class="mb-3 flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {{ t('translateSettings.targetLang') }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">
                                {{ t('translateSettings.targetLangDesc') }}
                                <span class="text-blue-500">{{ t('translateSettings.currentFollow') }} {{
                                    effectiveLangLabel }}</span>
                            </p>
                        </div>
                        <t-select v-model="settings.translate.to" :options="targetLangOptions" filterable size="small"
                            style="width: 220px" class="shrink-0" />
                    </div>

                    <ToggleRow v-model="settings.translate.showTranslateButton"
                        :title="t('translateSettings.showMsgButton')"
                        :desc="t('translateSettings.showMsgButtonDesc')" />

                    <div
                        class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 leading-5">
                        {{ t('translateSettings.barHint') }}
                    </div>
                </section>

                <!-- ===== 不翻译的语言 ===== -->
                <section>
                        <SectionHeader :title="t('translateSettings.doNotSection')"
                            :desc="t('translateSettings.doNotDesc')" />
                    <div
                        class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2">
                        <span v-for="code in settings.translate.doNotTranslate" :key="code"
                            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                            {{ languageLabel(code) }}
                            <button type="button" class="text-gray-400 hover:text-red-500" @click="removeDoNot(code)">
                                <XIcon class="w-3 h-3" />
                            </button>
                        </span>
                        <span v-if="!settings.translate.doNotTranslate.length" class="text-xs text-gray-400">
                            {{ t('translateSettings.doNotEmpty') }}
                        </span>
                        <t-select v-model="doNotPick" :options="langOnlyOptions" filterable size="small"
                            style="width: 180px" :placeholder="t('translateSettings.doNotAdd')" class="ml-auto" />
                        <button type="button"
                            class="px-3 py-1.5 rounded-lg text-xs bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
                            :disabled="!doNotPick" @click="addDoNot">
                            {{ t('translateSettings.doNotAddBtn') }}
                        </button>
                    </div>
                </section>

                <!-- ===== 翻译提供方（整套翻译；可分别覆盖场景） ===== -->
                <section>
                    <SectionHeader :title="t('translateSettings.providerSection')"
                        :desc="t('translateSettings.providerDesc')" />

                    <!-- 全局默认提供方 -->
                    <div
                        class="mb-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {{ t('translateSettings.providerDefault') }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ t('translateSettings.providerDefaultDesc') }}</p>
                        </div>
                        <t-select v-model="providerDefault" :options="providerOptions" size="small" style="width: 200px"
                            class="shrink-0 select-none" />
                    </div>

                    <!-- 场景覆盖：右键翻译 / 全部翻译 -->
                    <div
                        class="mb-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                        <div class="flex items-center justify-between gap-4">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('translateSettings.providerMessage') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('translateSettings.providerMessageDesc') }}</p>
                            </div>
                            <t-select v-model="providerMessage" :options="providerOverrideOptions" size="small"
                                style="width: 200px" class="shrink-0 select-none" />
                        </div>
                        <div class="h-px bg-gray-100 dark:bg-gray-700"></div>
                        <div class="flex items-center justify-between gap-4">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('translateSettings.providerChat') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('translateSettings.providerChatDesc') }}</p>
                            </div>
                            <t-select v-model="providerChat" :options="providerOverrideOptions" size="small"
                                style="width: 200px" class="shrink-0 select-none" />
                        </div>
                    </div>

                    <!-- 提供方说明与接口配置（第三方 / AI 预留） -->
                    <div class="space-y-3">
                        <div v-for="p in providerCards" :key="p.id"
                            class="rounded-xl border transition-colors"
                            :class="isActiveProvider(p.id)
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700'">
                            <div class="flex items-center justify-between p-4">
                                <div class="flex items-center min-w-0">
                                    <div class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center mr-3"
                                        :class="p.iconClass">
                                        <component :is="p.icon" class="w-4 h-4" />
                                    </div>
                                    <div class="min-w-0">
                                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {{ p.title }}
                                            <span class="ml-1 text-[10px] px-1.5 py-0.5 rounded"
                                                :class="p.available
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'">
                                                {{ p.available ? t('translateSettings.available') :
                                                    t('translateSettings.reserved') }}
                                            </span>
                                        </p>
                                        <p class="text-xs text-gray-400 mt-0.5">{{ p.desc }}</p>
                                    </div>
                                </div>
                                <span v-if="isActiveProvider(p.id)"
                                    class="text-[11px] text-blue-600 dark:text-blue-400 shrink-0">
                                    {{ t('translateSettings.inUse') }}
                                </span>
                            </div>

                            <!-- 第三方 API 配置（整套翻译共用；功能未实现） -->
                            <div v-if="p.id === 'third-party' && showThirdPartyConfig"
                                class="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                                <p class="text-xs text-amber-600 dark:text-amber-400">
                                    {{ t('translateSettings.notImplementedHint') }}
                                </p>
                                <label class="block">
                                    <span class="text-xs text-gray-500">{{ t('translateSettings.endpoint') }}</span>
                                    <input v-model="settings.translate.thirdParty.endpoint" type="text"
                                        :placeholder="t('translateSettings.endpointPh')" disabled
                                        class="mt-1 w-full px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 cursor-not-allowed" />
                                </label>
                                <label class="block">
                                    <span class="text-xs text-gray-500">{{ t('translateSettings.apiKey') }}</span>
                                    <input v-model="settings.translate.thirdParty.apiKey" type="password"
                                        :placeholder="t('translateSettings.apiKeyPh')" disabled
                                        class="mt-1 w-full px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 cursor-not-allowed" />
                                </label>
                                <p class="text-[11px] text-gray-400">{{ t('translateSettings.configSharedHint') }}</p>
                            </div>

                            <!-- AI 配置（整套翻译共用；功能未实现） -->
                            <div v-if="p.id === 'ai' && showAiConfig"
                                class="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                                <p class="text-xs text-amber-600 dark:text-amber-400">
                                    {{ t('translateSettings.notImplementedHint') }}
                                </p>
                                <label class="block">
                                    <span class="text-xs text-gray-500">{{ t('translateSettings.endpoint') }}</span>
                                    <input v-model="settings.translate.ai.endpoint" type="text"
                                        :placeholder="t('translateSettings.aiEndpointPh')" disabled
                                        class="mt-1 w-full px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 cursor-not-allowed" />
                                </label>
                                <div class="grid grid-cols-2 gap-3">
                                    <label class="block">
                                        <span class="text-xs text-gray-500">{{ t('translateSettings.apiKey') }}</span>
                                        <input v-model="settings.translate.ai.apiKey" type="password"
                                            :placeholder="t('translateSettings.apiKeyPh')" disabled
                                            class="mt-1 w-full px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 cursor-not-allowed" />
                                    </label>
                                    <label class="block">
                                        <span class="text-xs text-gray-500">{{ t('translateSettings.model') }}</span>
                                        <input v-model="settings.translate.ai.model" type="text"
                                            :placeholder="t('translateSettings.modelPh')" disabled
                                            class="mt-1 w-full px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 cursor-not-allowed" />
                                    </label>
                                </div>
                                <p class="text-[11px] text-gray-400">{{ t('translateSettings.configSharedHint') }}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <p class="text-xs text-gray-400 leading-5 pb-4">
                    {{ t('translateSettings.viewportHint') }}
                </p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 翻译设置页。
 * - 已实现：显示方式、目标语言（空=跟语言包）、消息翻译按钮、不翻译语言
 * - 全部翻译栏：不是设置项，跟随 chat.is_translatable
 * - 提供方：整套翻译共用配置；可分别覆盖右键翻译 / 全部翻译；默认官方 TDLib
 * - 第三方 API / AI：接口预留，功能未实现
 */
import { computed, defineComponent, h, ref, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    ChevronLeft as ChevronLeftIcon,
    Languages as LanguageIcon,
    MessageSquareText as MessageSquareTextIcon,
    Send as SendIcon,
    Plug as PlugIcon,
    Sparkles as SparklesIcon,
    X as XIcon,
} from 'lucide-vue-next';
import { settings } from '../../store/settings';
import { getTranslateTargetLang, clearShouldTranslateCache } from '../../store/translate';
import {
    TRANSLATE_TARGET_LANGUAGES,
    getTranslateLanguageLabel,
} from '../../utils/translateLanguages';
import type { TranslateProviderId } from '../../utils/translateProvider';

const router = useRouter();
const { t } = useI18n();

const langOnlyOptions = computed(() =>
    TRANSLATE_TARGET_LANGUAGES.map((l) => ({ label: `${l.label} (${l.code})`, value: l.code })),
);

/** 目标语言下拉：首项「跟随语言包」 */
const targetLangOptions = computed(() => [
    { label: t('translateSettings.followLangPack'), value: '' },
    ...langOnlyOptions.value,
]);

const effectiveLangLabel = computed(() => {
    const code = getTranslateTargetLang();
    return `${getTranslateLanguageLabel(code)} (${code})`;
});

function languageLabel(code: string) {
    return getTranslateLanguageLabel(code);
}

// ─── 提供方设置（兼容对象结构） ───────────────────────────────

function ensureProviderObj() {
    const anyP = settings.translate as any;
    if (!anyP.provider || typeof anyP.provider !== 'object') {
        anyP.provider = { default: 'tdlib', message: null, chat: null };
    }
    return anyP.provider as {
        default: TranslateProviderId;
        message: TranslateProviderId | null;
        chat: TranslateProviderId | null;
    };
}

const providerDefault = computed({
    get: () => ensureProviderObj().default || 'tdlib',
    set: (v: TranslateProviderId) => { ensureProviderObj().default = v; },
});
const providerMessage = computed({
    get: () => ensureProviderObj().message as string,
    set: (v: string) => { ensureProviderObj().message = (v === '' ? null : v) as TranslateProviderId | null; },
});
const providerChat = computed({
    get: () => ensureProviderObj().chat as string,
    set: (v: string) => { ensureProviderObj().chat = (v === '' ? null : v) as TranslateProviderId | null; },
});

const providerOptions = computed(() => [
    { label: `${t('translateSettings.providerTdlib')} (${t('translateSettings.available')})`, value: 'tdlib' },
    { label: `${t('translateSettings.providerThirdParty')} (${t('translateSettings.reserved')})`, value: 'third-party' },
    { label: `${t('translateSettings.providerAi')} (${t('translateSettings.reserved')})`, value: 'ai' },
]);

const providerOverrideOptions = computed(() => [
    { label: t('translateSettings.followDefault'), value: '' },
    ...providerOptions.value,
]);

function isActiveProvider(id: TranslateProviderId): boolean {
    const cfg = ensureProviderObj();
    // 用于展示「当前实际会用到该提供方」的场景
    return cfg.default === id
        || (cfg.message ?? cfg.default) === id
        || (cfg.chat ?? cfg.default) === id;
}

const showThirdPartyConfig = computed(() =>
    ensureProviderObj().default === 'third-party'
    || ensureProviderObj().message === 'third-party'
    || ensureProviderObj().chat === 'third-party',
);
const showAiConfig = computed(() =>
    ensureProviderObj().default === 'ai'
    || ensureProviderObj().message === 'ai'
    || ensureProviderObj().chat === 'ai',
);

const providerCards = computed(() => [
    {
        id: 'tdlib' as const,
        title: t('translateSettings.providerTdlib'),
        desc: t('translateSettings.providerTdlibDesc'),
        available: true,
        icon: SendIcon as Component,
        iconClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    },
    {
        id: 'third-party' as const,
        title: t('translateSettings.providerThirdParty'),
        desc: t('translateSettings.providerThirdPartyDesc'),
        available: false,
        icon: PlugIcon as Component,
        iconClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    },
    {
        id: 'ai' as const,
        title: t('translateSettings.providerAi'),
        desc: t('translateSettings.providerAiDesc'),
        available: false,
        icon: SparklesIcon as Component,
        iconClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
    },
]);

// ─── 不翻译语言 ───────────────────────────────────────────────

const doNotPick = ref('');

function addDoNot() {
    const code = doNotPick.value;
    if (!code) return;
    const list = new Set(settings.translate.doNotTranslate || []);
    list.add(code);
    settings.translate.doNotTranslate = [...list];
    clearShouldTranslateCache();
    doNotPick.value = '';
}

function removeDoNot(code: string) {
    settings.translate.doNotTranslate = (settings.translate.doNotTranslate || []).filter((c) => c !== code);
    clearShouldTranslateCache();
}

// 目标语言变更后清空语言门控缓存，避免仍按旧目标跳过
watch(() => settings.translate.to, () => clearShouldTranslateCache());

function goBack() {
    router.back();
}

// ─── 内联子组件 ───────────────────────────────────────────────

const SectionHeader = defineComponent({
    props: { title: String, desc: String },
    setup(props) {
        return () => h('div', { class: 'mb-3' }, [
            h('div', { class: 'flex items-center gap-3 mb-1' }, [
                h('h3', { class: 'text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider' }, props.title),
                h('div', { class: 'h-px flex-1 bg-gray-200 dark:bg-gray-700' }),
            ]),
            props.desc ? h('p', { class: 'text-xs text-gray-400' }, props.desc) : null,
        ]);
    },
});

const ModeCard = defineComponent({
    props: {
        selected: Boolean,
        icon: { type: [Object, Function] as any, required: true },
        iconClass: String,
        title: String,
        desc: String,
    },
    emits: ['click'],
    setup(props, { emit }) {
        return () => h('div', {
            class: 'flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ' +
                (props.selected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'),
            onClick: () => emit('click'),
        }, [
            h('div', { class: 'flex items-center' }, [
                h('div', { class: `w-9 h-9 rounded-full flex items-center justify-center mr-3 ${props.iconClass || ''}` }, [
                    h(props.icon, { class: 'w-5 h-5' }),
                ]),
                h('div', {}, [
                    h('h4', { class: 'text-sm font-medium text-gray-900 dark:text-gray-100' }, props.title),
                    h('p', { class: 'text-xs text-gray-400 mt-0.5' }, props.desc),
                ]),
            ]),
            h('div', {
                class: 'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ' +
                    (props.selected ? 'border-blue-500' : 'border-gray-300'),
            }, props.selected ? [h('div', { class: 'w-2 h-2 rounded-full bg-blue-500' })] : []),
        ]);
    },
});

const ToggleRow = defineComponent({
    props: {
        modelValue: { type: Boolean, default: false },
        title: String,
        desc: String,
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
        return () => h('div', {
            class: 'mb-3 flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700',
        }, [
            h('div', { class: 'min-w-0' }, [
                h('p', { class: 'text-sm font-medium text-gray-900 dark:text-gray-100' }, props.title),
                h('p', { class: 'text-xs text-gray-400 mt-0.5' }, props.desc),
            ]),
            h('button', {
                type: 'button',
                class: 'relative w-10 h-6 rounded-full transition-colors shrink-0 ' +
                    (props.modelValue ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'),
                onClick: () => emit('update:modelValue', !props.modelValue),
            }, [
                h('span', {
                    class: 'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ' +
                        (props.modelValue ? 'left-[18px]' : 'left-0.5'),
                }),
            ]),
        ]);
    },
});
</script>
