<template>
    <div v-bind="$attrs" class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
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
                        <ModeCard :selected="settings.translate.displayMode === 'replace'" :icon="ArrowLeftRightIcon"
                            icon-class="bg-purple-100 dark:bg-purple-900/30 text-purple-600"
                            :title="t('appearance.translateReplace')" :desc="t('appearance.translateReplaceDesc')"
                            @click="settings.translate.displayMode = 'replace'" />
                    </div>
                </section>

                <!-- ===== 基础行为 ===== -->
                <section>
                    <SectionHeader :title="t('translateSettings.behaviorSection')"
                        :desc="t('translateSettings.behaviorDesc')" />

                    <!-- 目标语言：空 = 跟随语言包 -->
                    <div
                        class="mb-3 flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md">
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {{ t('translateSettings.targetLang') }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">
                                {{ t('translateSettings.targetLangDesc') }}
                                <span class="text-blue-500">{{ t('translateSettings.currentFollow') }} {{
                                    effectiveLangLabel }}</span>
                            </p>
                        </div>
                        <SelectMenu class="w-55 shrink-0" size="sm" filterable
                            :model-value="settings.translate.to" :options="targetLangOptions"
                            @update:model-value="(v: string) => (settings.translate.to = v)" />
                    </div>

                    <ToggleRow v-model="settings.translate.showTranslateButton"
                        :title="t('translateSettings.showMsgButton')"
                        :desc="t('translateSettings.showMsgButtonDesc')" />

                    <div
                        class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md text-xs text-gray-500 dark:text-gray-400 leading-5">
                        {{ t('translateSettings.barHint') }}
                    </div>
                </section>

                <!-- ===== 不翻译的语言 ===== -->
                <section>
                        <SectionHeader :title="t('translateSettings.doNotSection')"
                            :desc="t('translateSettings.doNotDesc')" />
                    <div
                        class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md flex flex-wrap items-center gap-2">
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
                        <SelectMenu class="w-45 ml-auto" size="sm" filterable
                            :model-value="doNotPick" :options="langOnlyOptions"
                            :placeholder="t('translateSettings.doNotAdd')"
                            @update:model-value="(v: string) => (doNotPick = v)" />
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

                    <!-- 场景覆盖：右键翻译 / 全部翻译（默认固定 Telegram，不提供默认项选择） -->
                    <div
                        class="mb-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md space-y-3">
                        <div class="flex items-center justify-between gap-4">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('translateSettings.providerMessage') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('translateSettings.providerMessageDesc') }}</p>
                            </div>
                            <SelectMenu class="w-50 shrink-0" size="sm" :model-value="providerMessage"
                                :options="providerOptions"
                                @update:model-value="(v: string) => (providerMessage = v as TranslateProviderId)" />
                        </div>
                        <div class="h-px bg-gray-100 dark:bg-gray-700"></div>
                        <div class="flex items-center justify-between gap-4">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('translateSettings.providerChat') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('translateSettings.providerChatDesc') }}</p>
                            </div>
                            <SelectMenu class="w-50 shrink-0" size="sm" :model-value="providerChat"
                                :options="providerOptions"
                                @update:model-value="(v: string) => (providerChat = v as TranslateProviderId)" />
                        </div>
                    </div>

                    <!-- 提供方说明与接口配置（AI） -->
                    <div class="space-y-3">
                        <div v-for="p in providerCards" :key="p.id"
                            class="rounded-xl border transition-colors"
                            :class="isActiveProvider(p.id)
                                ? 'border-blue-500 bg-blue-100/60 dark:bg-blue-900/40 backdrop-blur-md'
                                : 'border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md'">
                            <div class="flex items-center justify-between p-4">
                                <div class="flex items-center min-w-0">
                                    <div class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center mr-3"
                                        :class="p.iconClass">
                                        <component :is="p.icon" class="w-4 h-4" />
                                    </div>
                                    <div class="min-w-0">
                                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {{ p.title }}
                                            <span v-if="!p.available"
                                                class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                {{ t('translateSettings.unconfigured') }}
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

                            <!-- AI 翻译目标：供应商 + 模型（供应商在「AI 设置」中配置） -->
                            <div v-if="p.id === 'ai'"
                                class="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                                <div class="grid grid-cols-2 gap-3">
                                    <label class="block">
                                        <span class="text-xs text-gray-500">{{ t('aiSettings.providerLabel') }}</span>
                                        <SelectMenu class="mt-1 w-full" size="sm" filterable
                                            :model-value="aiProviderId" :options="aiProviderOptions"
                                            :placeholder="t('aiSettings.providerPh')"
                                            @update:model-value="(v: string) => (aiProviderId = v)" />
                                    </label>
                                    <label class="block">
                                        <span class="text-xs text-gray-500">{{ t('aiSettings.modelLabel') }}</span>
                                        <SelectMenu class="mt-1 w-full" size="sm" filterable
                                            :model-value="aiModel" :options="aiModelOptions"
                                            :disabled="!aiModelOptions.length" :placeholder="t('aiSettings.modelPh')"
                                            @update:model-value="(v: string) => (aiModel = v)" />
                                    </label>
                                </div>
                                <div class="flex items-center justify-between gap-3">
                                    <p class="text-[11px] text-gray-400 leading-4">{{ t('aiSettings.targetHint') }}</p>
                                    <button type="button" class="text-xs text-blue-500 hover:text-blue-600 shrink-0"
                                        @click="goAiSettings">
                                        {{ t('aiSettings.goConfig') }}
                                    </button>
                                </div>
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
 * - 提供方：默认官方 TDLib；场景（右键 / 全部翻译）可切换 Telegram / AI（配置完整时）
 * - AI：选择「供应商 + 模型」，供应商在 AI 设置页配置（见 store/aiConfig）
 */
import { computed, defineComponent, h, onMounted, ref, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    ChevronLeft as ChevronLeftIcon,
    Languages as LanguageIcon,
    MessageSquareText as MessageSquareTextIcon,
    ArrowLeftRight as ArrowLeftRightIcon,
    Send as SendIcon,
    Sparkles as SparklesIcon,
    X as XIcon,
} from 'lucide-vue-next';
import SelectMenu from '../../components/ui/dropdown/SelectMenu.vue';
import { settings } from '../../store/settings';
import {
    aiProviders,
    aiProviderReady,
    loadAiProviders,
    resolveAiTarget,
} from '../../store/aiConfig';
import { getTranslateTargetLang, clearShouldTranslateCache } from '../../store/translate';
import {
    getTranslateLanguageLabel,
    getTranslateLanguageOptions,
} from '../../utils/translateLanguages';
import type { TranslateProviderId } from '../../utils/translateProvider';

const router = useRouter();
const { t } = useI18n();

const langOnlyOptions = computed(() =>
    getTranslateLanguageOptions().map((l) => ({ label: `${l.label} (${l.code})`, value: l.code })),
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
    const p = anyP.provider as {
        default: TranslateProviderId;
        message: TranslateProviderId | null;
        chat: TranslateProviderId | null;
    };
    // 默认提供方已不提供选择（TG 翻译始终可用），历史配置若指向其它接口则归位
    if (p.default !== 'tdlib') p.default = 'tdlib';
    return p;
}

const providerMessage = computed({
    // 未单独配置时显示为 Telegram（默认即 Telegram，不再提供「跟随默认」项）
    get: () => ensureProviderObj().message || 'tdlib',
    set: (v: string) => { ensureProviderObj().message = v as TranslateProviderId; },
});
const providerChat = computed({
    get: () => ensureProviderObj().chat || 'tdlib',
    set: (v: string) => { ensureProviderObj().chat = v as TranslateProviderId; },
});

// TG 翻译始终可用，不标注状态；AI 配置完整后才可选，未配置时标注「未配置」
const providerOptions = computed(() => {
    const aiReady = resolveAiTarget() !== null;
    return [
        { label: t('translateSettings.providerTdlib'), value: 'tdlib' },
        {
            label: aiReady
                ? t('translateSettings.providerAi')
                : `${t('translateSettings.providerAi')} (${t('translateSettings.unconfigured')})`,
            value: 'ai',
            disabled: !aiReady,
        },
    ];
});

function isActiveProvider(id: TranslateProviderId): boolean {
    const cfg = ensureProviderObj();
    // 用于展示「当前实际会用到该提供方」的场景
    return cfg.default === id
        || (cfg.message ?? cfg.default) === id
        || (cfg.chat ?? cfg.default) === id;
}

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
        id: 'ai' as const,
        title: t('translateSettings.providerAi'),
        desc: t('translateSettings.providerAiDesc'),
        available: resolveAiTarget() !== null,
        icon: SparklesIcon as Component,
        iconClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
    },
]);

// ─── AI 翻译目标（供应商 + 模型；供应商在「AI 设置」中配置） ─────

function aiTarget() {
    if (!settings.translate.ai) settings.translate.ai = { providerId: null, model: '' };
    return settings.translate.ai;
}

/** 换供应商时清空模型（模型须属于所选供应商） */
const aiProviderId = computed({
    get: () => aiTarget().providerId ?? '',
    set: (v: string) => {
        const a = aiTarget();
        a.providerId = v || null;
        a.model = '';
    },
});

const aiModel = computed({
    get: () => aiTarget().model,
    set: (v: string) => { aiTarget().model = v; },
});

const aiProviderOptions = computed(() =>
    aiProviders.list.filter(aiProviderReady).map((p) => ({ label: p.name, value: p.id })),
);

const aiModelOptions = computed(() =>
    (aiProviders.list.find((p) => p.id === aiProviderId.value)?.models ?? [])
        .map((m) => ({ label: m.name || m.id, value: m.id })),
);

function goAiSettings() {
    router.push('/home/settings/ai');
}

onMounted(() => {
    if (!aiProviders.loaded) void loadAiProviders();
});

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
                    ? 'border-blue-500 bg-blue-100/60 dark:bg-blue-900/40 backdrop-blur-md'
                    : 'border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md hover:bg-black/5 dark:hover:bg-white/5'),
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
            class: 'mb-3 flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md',
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
