<template>
    <div v-bind="$attrs" class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="router.back()">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('aiSettings.title') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">

                <!-- ===== 聊天输入框：通用模板预览 + 二选一（设置导航列表同款条目，横向两张） ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('aiSettings.inputSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <!-- 预览：通用模板（示例数据），纯展示、不可点击 -->
                    <PreviewCard
                        :subtitle="settings.ai.input === 'ai' ? t('aiSettings.inputAi') : t('aiSettings.inputMessage')"
                        body-class="p-4 bg-gray-50 dark:bg-[#1c1c1c]">
                        <div inert aria-hidden="true" class="pointer-events-none">
                            <AiPromptBar v-if="settings.ai.input === 'ai'" :groups="templateGroups"
                                :selected="templatePick" :default-effort="t('aiInput.effortMax')" :on-attach="() => []"
                                :on-dictate="() => ''" />
                            <div v-else
                                class="flex items-center gap-2 px-2 rounded-4xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                                <span class="w-10 h-10 grid place-items-center text-gray-500">
                                    <PlusIcon class="w-5 h-5" />
                                </span>
                                <span
                                    class="flex-1 min-w-0 my-2 px-2 py-2 text-sm text-gray-400 dark:text-gray-500 truncate">{{
                                        t('lng_message_ph') }}</span>
                                <span v-if="settings.ai.switchButton" class="w-10 h-10 grid place-items-center text-gray-500">
                                    <SparklesIcon class="w-5 h-5" />
                                </span>
                                <span class="w-10 h-10 grid place-items-center text-gray-500">
                                    <SmileIcon class="w-5 h-5" />
                                </span>
                                <span class="w-10 h-10 grid place-items-center text-gray-500">
                                    <SendIcon class="w-5 h-5" />
                                </span>
                            </div>
                        </div>
                    </PreviewCard>

                    <!-- 二选一：横向两张条目卡片，选中整张浅蓝底 + 图标瓷片变蓝 -->
                    <div class="mt-3 grid grid-cols-2 gap-3">
                        <button v-for="opt in INPUT_MODES" :key="opt.id" type="button"
                            class="flex items-center gap-3 px-3 py-2.5 text-left rounded-2xl bg-white/55 dark:bg-gray-800/45 backdrop-blur-md border transition-colors"
                            :class="settings.ai.input === opt.id
                                ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-500/10'
                                : 'border-white/50 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-800/80'"
                            @click="settings.ai.input = opt.id">
                            <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                                :class="settings.ai.input === opt.id
                                    ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                                    : opt.tile">
                                <component :is="opt.icon" class="w-[18px] h-[18px]" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {{ t(opt.labelKey) }}</h3>
                                <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {{ t(opt.descKey) }}</p>
                            </div>
                            <CheckIcon v-if="settings.ai.input === opt.id"
                                class="w-4 h-4 text-blue-500 shrink-0" />
                        </button>
                    </div>

                    <p class="mt-2 text-xs text-gray-400">{{ t('aiSettings.inputModeDesc') }}</p>

                    <!-- 底部：输入框里是否显示「普通 ⇄ AI」互切按钮（关掉后只能在本页切换） -->
                    <div class="mt-3 flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md">
                        <div>
                            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {{ t('aiSettings.showSwitchButton') }}</h4>
                            <p class="text-xs text-gray-500 mt-0.5">{{ t('aiSettings.showSwitchButtonDesc') }}</p>
                        </div>
                        <ToggleSwitch v-model="settings.ai.switchButton" />
                    </div>
                </section>

                <!-- ===== 会话总管理：跨聊天管理全部对话（新建 / 打开 / 重命名 / 删除） ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('aiSettings.conversationsSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <button type="button"
                        class="flex w-full items-center gap-3 px-3 py-2.5 text-left rounded-2xl bg-white/55 dark:bg-gray-800/45 backdrop-blur-md border border-white/50 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                        @click="router.push({ name: 'settings-ai-conversations' })">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400">
                            <MessagesSquareIcon class="w-[18px] h-[18px]" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {{ t('aiSettings.conversationsManage') }}</h3>
                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {{ t('aiSettings.conversationsDesc') }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                    </button>
                </section>

                <!-- ===== 供应商与模型 ===== -->
                <div class="flex items-center gap-3 mb-3">
                    <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {{ t('aiSettings.listSubtitle') }}</h3>
                    <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                </div>
                <p class="mb-3 text-xs text-gray-400">{{ t('aiSettings.listDesc') }}</p>

                <!-- ===== 供应商胶囊：点选后就地编辑（单页，无二级） ===== -->
                <div class="flex flex-wrap gap-2 mb-6">
                    <button v-for="p in cards" :key="p.id" type="button"
                        v-context-menu="() => cardMenu(p)"
                        class="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg border text-sm transition-colors"
                        :class="p.id === selectedId
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-gray-900 dark:text-gray-100'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'"
                        @click="select(p)">
                        <img v-if="iconSrc(p.icon)" :src="iconSrc(p.icon)" alt=""
                            class="w-6 h-6 rounded-full shrink-0" />
                        <span v-else class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold"
                            :class="avatarClass(p)">{{ initial(p) }}</span>
                        <span class="max-w-40 truncate">{{ p.name.trim() || t('aiSettings.newProvider') }}</span>
                        <span v-if="!p.hasApiKey" class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                            :title="t('aiSettings.unconfigured')"></span>
                    </button>
                    <button type="button"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
                        @click="addProvider">
                        <PlusIcon class="w-4 h-4" />
                        {{ t('aiSettings.add') }}
                    </button>
                </div>

                <!-- ===== 供应商编辑（当前选中） ===== -->
                <div v-if="selectedId"
                    class="p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md space-y-5">
                    <label class="block">
                        <span class="text-xs text-gray-500">{{ t('aiSettings.name') }}</span>
                        <input v-model="draft.name" type="text" :placeholder="t('aiSettings.namePh')" :class="inputClass" />
                    </label>
                    <label class="block">
                        <span class="text-xs text-gray-500">{{ t('aiSettings.apiKey') }}</span>
                        <input v-model="apiKeyInput" type="password"
                            :placeholder="draft.hasApiKey ? t('aiSettings.keySaved') : t('aiSettings.keyPh')"
                            :class="inputClass" />
                    </label>
                    <label class="block">
                        <span class="text-xs text-gray-500">{{ t('aiSettings.url') }}</span>
                        <input v-model="draft.endpoint" type="text" :placeholder="t('aiSettings.urlPh')" :class="inputClass" />
                    </label>

                    <!-- 连接测试：左侧标题，右侧「模型数 + 状态点 + 测试连接」；失败时下方红字显示错误（含 HTTP 状态码） -->
                    <div class="py-1">
                        <div class="flex items-center justify-between gap-4">
                            <span class="text-sm text-gray-900 dark:text-gray-100">{{ t('aiSettings.testSection') }}</span>
                            <div class="flex items-center gap-3 shrink-0">
                                <span class="text-xs text-gray-400">{{ t('aiSettings.modelCount', { count: modelTotal }) }}</span>
                                <span class="w-2 h-2 rounded-full transition-colors"
                                    :class="testState === 'ok' ? 'bg-green-500'
                                        : testState === 'error' ? 'bg-red-500'
                                        : 'bg-gray-300 dark:bg-gray-600'"></span>
                                <button type="button"
                                    class="px-3 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
                                    :disabled="testing" @click="testConnection">
                                    {{ testing ? t('aiSettings.testing') : t('aiSettings.test') }}
                                </button>
                            </div>
                        </div>
                        <p v-if="testState === 'error'" class="mt-2 text-xs text-red-500 break-all">{{ testError }}</p>
                    </div>

                    <!-- 自定义（可展开）：图标 / 协议 -->
                    <div class="rounded-xl border border-gray-200 dark:border-gray-700">
                        <button type="button" class="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 dark:text-gray-200"
                            @click="customOpen = !customOpen">
                            {{ t('aiSettings.custom') }}
                            <ChevronDownIcon class="w-4 h-4 transition-transform" :class="customOpen ? 'rotate-180' : ''" />
                        </button>

                        <div v-if="customOpen" class="px-4 pb-4 pt-3 space-y-4 border-t border-gray-100 dark:border-gray-700">
                            <!-- 图标：预览 + 展开图标库（任一预置图标 / 自定义上传 / 默认首字母） -->
                            <div>
                                <div class="flex items-center gap-3">
                                    <img v-if="iconSrc(draft.icon)" :src="iconSrc(draft.icon)" alt=""
                                        class="w-9 h-9 rounded-full shrink-0" />
                                    <span v-else
                                        class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold"
                                        :class="avatarClass(draft)">{{ initial(draft) }}</span>
                                    <span class="text-xs text-gray-500">{{ t('aiSettings.icon') }}</span>
                                    <button type="button"
                                        class="px-2.5 py-1 rounded-lg text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                        :aria-expanded="iconOpen" @click="iconOpen = !iconOpen">
                                        {{ t('aiSettings.iconPick') }}
                                    </button>
                                </div>
                                <div v-if="iconOpen" class="mt-2 flex flex-wrap items-center gap-1.5">
                                    <button v-for="i in AI_ICONS" :key="i.key" type="button" class="w-8 h-8 p-0.5 rounded-full border transition-colors"
                                        :class="draft.icon === i.key
                                            ? 'border-blue-500'
                                            : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'"
                                        :title="i.key" @click="draft.icon = i.key">
                                        <img :src="i.src" alt="" class="w-full h-full rounded-full" />
                                    </button>
                                    <button type="button"
                                        class="px-2.5 py-1 rounded-lg text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                        @click="iconFile?.click()">
                                        {{ t('aiSettings.iconCustom') }}
                                    </button>
                                    <button type="button"
                                        class="px-2.5 py-1 rounded-lg text-xs text-gray-500 border border-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                        @click="draft.icon = ''">
                                        {{ t('aiSettings.iconNone') }}
                                    </button>
                                </div>
                                <input ref="iconFile" type="file" accept="image/*" class="hidden" @change="onIconFile" />
                            </div>

                            <label class="block">
                                <span class="text-xs text-gray-500">{{ t('aiSettings.protocol') }}</span>
                                <t-select v-model="draft.format" :options="formatOptions" size="small" class="mt-1 w-full" />
                            </label>
                        </div>
                    </div>

                    <!-- 模型列表：标签与搜索框同一排；聚焦搜索框即展开下拉并首次拉取 -->
                    <div>
                        <div class="flex items-center justify-between gap-3">
                            <span class="text-xs text-gray-500">{{ t('aiSettings.modelList') }}</span>
                            <div class="relative w-56 shrink-0">
                                <input v-model="modelQuery" type="text" :placeholder="t('aiSettings.modelSearchPh')"
                                    :class="searchInputClass" @focus="openPicker" @click="openPicker"
                                    @keydown.enter.prevent="addTyped" @keydown.esc="pickerOpen = false" />
                                <div v-if="pickerOpen"
                                    class="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg divide-y divide-gray-100 dark:divide-gray-700/60">
                                    <p v-if="fetching" class="px-3 py-2 text-xs text-gray-400">
                                        {{ t('aiSettings.fetching') }}</p>
                                    <p v-else-if="!filteredModels.length" class="px-3 py-2 text-xs text-gray-400">
                                        {{ t('aiSettings.modelNoMatch') }}</p>
                                    <button v-for="m in filteredModels" :key="m.id" type="button"
                                        class="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                                        @mousedown.prevent @click="addModel(m)">
                                        <span class="min-w-0">
                                            <span class="block truncate text-gray-700 dark:text-gray-200">{{ m.name || m.id }}</span>
                                            <span v-if="m.name" class="block truncate text-[11px] text-gray-400">{{ m.id }}</span>
                                            <span v-if="metaLabel(m)" class="block truncate text-[11px] text-gray-400">{{ metaLabel(m) }}</span>
                                        </span>
                                        <CheckIcon v-if="draft.models.some((x) => x.id === m.id)" class="w-4 h-4 shrink-0 text-blue-500" />
                                        <PlusIcon v-else class="w-4 h-4 shrink-0 text-gray-400" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 已添加的模型：首行 = 模型 ID + 名称 + 更多选项 + 删除；展开后改 上下文 / 输出 / 模态 -->
                        <div v-if="draft.models.length" class="mt-2 space-y-2">
                            <div v-for="(m, i) in draft.models" :key="i"
                                class="rounded-lg border border-gray-200 dark:border-gray-700 p-1.5">
                                <div class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] items-center gap-1.5">
                                    <input v-model="m.id" type="text" :placeholder="t('aiSettings.modelIdPh')"
                                        :aria-label="t('aiSettings.modelId')" :class="rowInputClass" />
                                    <input v-model="m.name" type="text" :placeholder="t('aiSettings.modelNamePh')"
                                        :aria-label="t('aiSettings.modelName')" :class="rowInputClass" />
                                    <button type="button" :class="iconButtonClass"
                                        :title="t('aiSettings.metaAdvanced')" :aria-label="t('aiSettings.metaAdvanced')"
                                        :aria-expanded="m.open" @click="m.open = !m.open">
                                        <ChevronDownIcon class="w-4 h-4 transition-transform"
                                            :class="m.open ? 'rotate-180' : ''" />
                                    </button>
                                    <button type="button" :class="dangerIconButtonClass"
                                        :title="t('aiSettings.removeModel')" :aria-label="t('aiSettings.removeModel')"
                                        @click="removeModel(m.id)">
                                        <Trash2Icon class="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div v-if="m.open" class="grid grid-cols-2 gap-2 px-1 pt-2 pb-0.5">
                                    <label class="flex flex-col gap-1 min-w-0">
                                        <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('aiSettings.metaContextLabel') }}</span>
                                        <t-select v-model="m.contextLength" :options="contextOptions" size="small"
                                            class="w-full" filterable creatable
                                            :placeholder="t('aiSettings.metaUnset')" />
                                    </label>
                                    <label class="flex flex-col gap-1 min-w-0">
                                        <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('aiSettings.metaOutputLabel') }}</span>
                                        <t-select v-model="m.maxOutput" :options="outputOptions" size="small"
                                            class="w-full" filterable creatable
                                            :placeholder="t('aiSettings.metaUnset')" />
                                    </label>
                                    <fieldset class="col-span-2 min-w-0 m-0 border-0 p-0">
                                        <legend class="mb-1 text-xs text-gray-500 dark:text-gray-400">{{ t('aiSettings.metaModality') }}</legend>
                                        <div class="flex flex-wrap items-center gap-4">
                                            <t-checkbox v-for="v in MODALITY_PRESETS" :key="v" :label="v"
                                                :checked="modalitySelected(m).includes(v)"
                                                :disabled="modalitySelected(m).length === 1 && modalitySelected(m).includes(v)"
                                                @change="(checked: boolean) => toggleModality(m, v, checked)" />
                                        </div>
                                    </fieldset>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between pt-2">
                        <button v-if="isSaved(draft.id)" type="button"
                            class="px-3 py-1.5 rounded-lg text-xs border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                            @click="draftPreset ? removePreset(draftPreset) : removeProvider(draft)">
                            {{ draftPreset ? t('aiSettings.deletePreset') : t('aiSettings.delete') }}
                        </button>
                        <span v-else></span>
                        <button type="button"
                            class="px-4 py-1.5 rounded-lg text-xs bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
                            :disabled="saving" @click="save">
                            {{ t('aiSettings.save') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * AI 设置页（全局，单页）：顶部供应商胶囊 + 下方就地编辑当前选中项；末尾「+」新增一个「未配置」供应商。
 * 顶部自带内置预设（DeepSeek / OpenAI / Xiaomi MiMo / Claude / Kimi / 智谱 GLM / MiniMax，含国内站 -cn 版本，
 * 非中文语言包隐藏），预设无 Key，填入 Key 保存后才可用（见 store/aiConfig 的 AI_PRESETS）。
 * 供应商：名称 + API Key + URL 必填；图标与协议在「自定义」中，模型列表独立在「自定义」下方（默认 OpenAI Completions）。
 * 翻译页通过 settings.translate.ai 选择使用的供应商与模型。
 */
import { computed, onMounted, reactive, ref, type Component, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from '../../utils/toast';
import {
    Check as CheckIcon,
    ChevronLeft as ChevronLeftIcon,
    ChevronDown as ChevronDownIcon,
    ChevronRight as ChevronRightIcon,
    Copy as CopyIcon,
    MessagesSquare as MessagesSquareIcon,
    Plus as PlusIcon,
    RotateCcw as RotateCcwIcon,
    Send as SendIcon,
    Smile as SmileIcon,
    Sparkles as SparklesIcon,
    MessageSquare as MessageSquareIcon,
    Trash2 as Trash2Icon,
    X as XIcon,
} from 'lucide-vue-next';
import { settings } from '../../store/settings';
import AiPromptBar from '../../components/ai/AiPromptBar.vue';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import PreviewCard from '../../components/settings/PreviewCard.vue';
import {
    AI_ICONS,
    AI_PRESETS,
    aiProviders,
    loadAiProviders,
    newAiProvider,
    iconSrc,
    isPresetDefault,
    isPresetDeleted,
    presetForName,
    presetProvider,
    providerNameTaken,
    uniqueProviderName,
    saveAiProvider,
    deleteAiProvider,
    deleteAiPreset,
    listAiModels,
    type AiModel,
    type AiModelGroup,
    type AiPreset,
    type AiProvider,
} from '../../store/aiConfig';
import type { ContextMenuItem } from '../../components/contextMenu/types';
const router = useRouter();
const { t, locale } = useI18n();

const inputClass = 'mt-1 w-full px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400';

/** 模型搜索框：与「模型列表」标签同排，比设置项输入框矮一档 */
const searchInputClass = 'w-full px-2.5 py-1 rounded-lg text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400';

/** 模型行内的输入框：一行一个模型卡片，比设置项输入框矮一档 */
const rowInputClass = 'w-full h-8 px-2.5 rounded-md text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400';

const iconButtonClass = 'w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200';
const dangerIconButtonClass = 'w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10';

const AVATAR_CLASSES = [
    'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
    'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400',
    'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
    'bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400',
];

const formatOptions = computed(() => [
    { label: 'OpenAI Completions', value: 'openai-compatible' },
    { label: 'OpenAI Responses', value: 'openai-responses' },
    { label: 'Anthropic', value: 'anthropic' },
]);

// ─── 聊天输入框：切换 + 通用模板预览 ─────────────────────────

/** 二选一：聊天底部用普通消息输入框，还是 AI 输入框（条目样式与设置导航列表一致） */
const INPUT_MODES: { id: 'message' | 'ai'; labelKey: string; descKey: string; icon: Component; tile: string }[] = [
    {
        id: 'message',
        labelKey: 'aiSettings.inputMessage',
        descKey: 'aiSettings.inputMessageDesc',
        icon: MessageSquareIcon,
        tile: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    },
    {
        id: 'ai',
        labelKey: 'aiSettings.inputAi',
        descKey: 'aiSettings.inputAiDesc',
        icon: SparklesIcon,
        tile: 'bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
    },
];

/** 预览用的通用模板数据：示例供应商 + 示例模型，不读真实配置（没配供应商也能看到完整样子） */
const templateGroups = computed<AiModelGroup[]>(() => [
    {
        id: 'template',
        name: t('aiInput.sampleProvider'),
        icon: AI_ICONS[0]?.src,
        models: ['A', 'B', 'C'].map((n) => ({ id: `template-${n}`, name: t('aiInput.sampleModel', { n }) })),
    },
]);
/** 模板预览里显示的选中项：预览不可点击，固定展示示例模型 A */
const templatePick = { providerId: 'template', model: 'template-A' };

// ─── 供应商胶囊 ───────────────────────────────────────────────

/** 未保存的新供应商：列表中显示为「新供应商」胶囊，直到保存或被删除 */
const pending = ref<AiProvider | null>(null);

/** 中文语言包才显示预设里的国内站（-cn）版本；被删过的预设不再显示 */
const presets = computed(() => {
    const zh = String(locale.value).toLowerCase().startsWith('zh');
    return AI_PRESETS.filter((p) => (zh || !p.cnOnly) && !isPresetDeleted(p.name));
});

/**
 * 顶部胶囊：内置预设在前（已保存的预设用保存后的数据，仍在原位），用户自建供应商在后，未保存的新供应商垫底。
 */
const cards = computed<AiProvider[]>(() => {
    const rows = presets.value.map((p) => aiProviders.list.find((x) => x.id === p.id) ?? presetProvider(p));
    const rest = aiProviders.list.filter((x) => !presets.value.some((p) => p.id === x.id));
    return pending.value ? [...rows, ...rest, pending.value] : [...rows, ...rest];
});
const selectedId = ref('');

function isSaved(id: string) {
    return aiProviders.list.some((p) => p.id === id);
}

function avatarClass(p: { name: string }) {
    const code = p.name.trim().charCodeAt(0) || 0;
    return AVATAR_CLASSES[code % AVATAR_CLASSES.length];
}

function initial(p: { name: string }) {
    return p.name.trim()[0]?.toUpperCase() ?? '?';
}

// ─── 名称唯一 + 右键菜单（克隆 / 恢复默认 / 删除） ─────────────

/** 名称是否已被其它供应商占用 */
function nameTaken(name: string, exceptId?: string) {
    return providerNameTaken(aiProviders.list, name, exceptId);
}

/** 当前编辑项对应的预设（名称或 id 命中），用于把删除动作走预设语义 */
const draftPreset = computed(() => presetForName(draft.name, draft.id));

/** 供应商胶囊右键菜单：克隆必有；预设改过才有「恢复默认」；已保存的项可删（预设删 = 清空设置） */
function cardMenu(p: AiProvider): ContextMenuItem[] {
    // 未配置（无 Key）的供应商不能克隆：克隆出来的草稿没有可用的 Key，没意义
    const items: ContextMenuItem[] = [
        { label: t('aiSettings.clone'), icon: CopyIcon, disabled: !p.hasApiKey, onClick: () => cloneProvider(p) },
    ];
    const preset = presetForName(p.name, p.id);
    if (preset && !isPresetDefault(p, preset)) {
        items.push({ label: t('aiSettings.restore'), icon: RotateCcwIcon, onClick: () => restorePreset(p, preset) });
    }
    if (pending.value?.id === p.id) {
        items.push({ label: t('aiSettings.cancelConfig'), icon: XIcon, danger: true, divider: true, onClick: () => cancelPending(p) });
    } else if (preset) {
        // 预设无论是否配置过都可删：删除 = 从 UI 隐藏（见 removePreset）
        items.push({ label: t('aiSettings.deletePreset'), icon: Trash2Icon, danger: true, divider: true, onClick: () => removePreset(preset) });
    } else if (isSaved(p.id)) {
        items.push({ label: t('aiSettings.delete'), icon: Trash2Icon, danger: true, divider: true, onClick: () => removeProvider(p) });
    }
    return items;
}

/** 取消未保存的新供应商：直接丢弃草稿，选中项若是它则改选列表第一个 */
function cancelPending(p: AiProvider) {
    if (pending.value?.id !== p.id) return;
    pending.value = null;
    if (selectedId.value === p.id) {
        selectedId.value = '';
        const next = cards.value[0];
        if (next) select(next);
    }
}

/** 克隆：复制名称 + 地址 + 协议 + 图标 + 模型列表，名称自动去重；不复用预设 id（克隆出来是自定义项），API Key 需重填后再保存 */
function cloneProvider(p: AiProvider) {
    select({ ...p, id: crypto.randomUUID(), name: uniqueProviderName(aiProviders.list, p.name), hasApiKey: false });
    void toast.success(`${t('aiSettings.clone')}：${draft.name}`);
}

/** 恢复预设默认（自定义项同名保存也走这里）：名称 / 地址 / 协议 / 图标回到预设，模型列表保留 */
function restorePreset(p: AiProvider, preset: AiPreset) {
    if (p.id !== selectedId.value) select(p);
    Object.assign(draft, { ...presetProvider(preset), models: draft.models });
    apiKeyInput.value = '';
    testState.value = 'idle';
    testError.value = '';
    void toast.success(t('aiSettings.restoreOk'));
}

// ─── 编辑（当前选中项的就地编辑副本） ─────────────────────────

/** 编辑态模型：0 / '' / 空数组表示未设置（t-select 不接受 null）；长度允许预设之外手输，故可为字符串 */
interface ModelDraft {
    id: string;
    /** 展示名，空 = 显示 id */
    name: string;
    contextLength: number | string;
    maxOutput: number | string;
    modality: string[];
    /** 「更多选项」是否展开（仅界面状态，不持久化） */
    open: boolean;
}

const draft = reactive<Omit<AiProvider, 'models'> & { models: ModelDraft[] }>({
    id: '',
    name: '',
    endpoint: '',
    format: 'openai-compatible',
    icon: '',
    models: [],
    hasApiKey: false,
});
/** 输入中的 Key：仅内存，保存后清空 */
const apiKeyInput = ref('');
const customOpen = ref(false);
/** 图标库是否展开（仅界面状态，不持久化） */
const iconOpen = ref(false);
const iconFile = ref<HTMLInputElement | null>(null);
/** 自定义图标大小上限：图标只显示 24–36px，data URL 存进配置 JSON，别让它撑爆 */
const MAX_ICON_BYTES = 128 * 1024;
/** 最近一次拉取到的模型（候选，点击添加到模型列表） */
const fetched = ref<AiModel[]>([]);
/** 最近一次「测试连接 / 获取模型列表」结果：状态点颜色 + 错误文案（后端已带 HTTP 状态码） */
const testState = ref<'idle' | 'ok' | 'error'>('idle');
const testError = ref('');
const testing = ref(false);
const fetching = ref(false);
const saving = ref(false);

/** 模型总数 = 已添加 + 拉取到的候选（与下方「模型列表」展示的内容一致，避免出现 0 却有模型） */
const modelTotal = computed(
    () => new Set([...draft.models.map((m) => m.id), ...fetched.value.map((m) => m.id)]).size,
);
/** 模型搜索框：输入过滤候选；聚焦展开面板并首次拉取 */
const modelQuery = ref('');
const pickerOpen = ref(false);
const filteredModels = computed(() => {
    const q = modelQuery.value.trim().toLowerCase();
    return q ? fetched.value.filter((m) => m.id.toLowerCase().includes(q)) : fetched.value;
});

/** 上下文 / 最大输出 / 模态，接口没返回就不显示这段 */
function metaLabel(m?: { contextLength: number | string | null; maxOutput: number | string | null; modality: string | string[] | null }) {
    if (!m) return '';
    const ctx = toTokens(m.contextLength);
    const out = toTokens(m.maxOutput);
    const parts = [
        ctx ? t('aiSettings.metaContext', { n: fmtTokens(ctx) }) : '',
        out ? t('aiSettings.metaOutput', { n: fmtTokens(out) }) : '',
        modalityText(m.modality),
    ];
    return parts.filter(Boolean).join(' · ');
}

/** 预设之外手输的档位：接受 30000 / "30K" / "1M"，认不出算未设置 */
function toTokens(v: number | string | null | undefined): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const m = /^([\d.]+)\s*([kKmM])?$/.exec(String(v ?? '').trim());
    if (!m) return 0;
    const scale = m[2] ? (m[2].toLowerCase() === 'm' ? 1_000_000 : 1000) : 1;
    const n = Math.round(parseFloat(m[1]) * scale);
    return Number.isFinite(n) ? n : 0;
}

function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
}

// ─── 上下文 / 最大输出 / 模态：选项由预设决定（0 / '' = 未设置） ───

const CONTEXT_PRESETS = [256_000, 512_000, 1_000_000];
const OUTPUT_PRESETS = [32_000, 64_000, 128_000];
/** 输入模态：多选，持久化时用 '+' 连起来 */
const MODALITY_PRESETS = ['text', 'image', 'audio', 'video', 'file'];

const withUnset = (opts: { label: string; value: string | number }[]) => [
    { label: t('aiSettings.metaUnset'), value: 0 as string | number },
    ...opts,
];
const contextOptions = computed(() =>
    withUnset(CONTEXT_PRESETS.map((n) => ({ label: fmtTokens(n), value: n as string | number }))),
);
const outputOptions = computed(() =>
    withUnset(OUTPUT_PRESETS.map((n) => ({ label: fmtTokens(n), value: n as string | number }))),
);

/** 接口返回的模态写法（如 "text+image->text"）拆成多选值；认不出的原样留着，保存不丢 */
function parseModality(v: string | null | undefined): string[] {
    return [...new Set((v ?? '').split('->')[0].split('+').filter(Boolean))];
}

function modalityText(v: string | string[] | null | undefined): string {
    return (Array.isArray(v) ? v : parseModality(v)).join('+');
}

/** 展示态：接口没声明模态时按「文本」显示（没动过就不写回，值仍是未设置） */
function modalitySelected(m: ModelDraft): string[] {
    return m.modality.length ? m.modality : ['text'];
}

/** 勾选 / 取消一个模态：按预设顺序重排；最后一个不允许取消 */
function toggleModality(m: ModelDraft, value: string, checked: boolean) {
    const current = modalitySelected(m);
    m.modality = MODALITY_PRESETS.filter((v) => (v === value ? checked : current.includes(v)));
}

/** 接口 / 持久化态 → 编辑态：模态拆成多选，容量缺省算未设置 */
function toDrafts(list: AiModel[]): ModelDraft[] {
    return list.map((m) => ({
        id: m.id,
        name: m.name ?? '',
        contextLength: m.contextLength ?? 0,
        maxOutput: m.maxOutput ?? 0,
        modality: parseModality(m.modality),
        open: false,
    }));
}

function openPicker() {
    pickerOpen.value = true;
    if (!fetched.value.length) fetchModels();
}

/** 自定义图标：读成 data URL 存进供应商（超过上限就拒绝，免得配置 JSON 被图片撑大） */
function onIconFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';  // 允许重复选同一个文件
    if (!file) return;
    if (file.size > MAX_ICON_BYTES) {
        toast.warning(t('aiSettings.iconTooLarge'));
        return;
    }
    const reader = new FileReader();
    reader.onload = () => { draft.icon = String(reader.result ?? ''); };
    reader.onerror = () => void toast.error(String(reader.error));
    reader.readAsDataURL(file);
}

/** 搜索框回车：把输入的模型 ID 直接加入（接口不返回时手动填写） */
function addTyped() {
    const m = modelQuery.value.trim();
    if (m) addModel({ id: m, name: null, contextLength: null, maxOutput: null, modality: null });
}

/** 点选胶囊：切到已有的另一个供应商才重新载入，避免清掉当前未保存的输入 */
function select(p: AiProvider) {
    if (p.id === selectedId.value) return;
    Object.assign(draft, { ...p, models: toDrafts(p.models) });
    apiKeyInput.value = '';
    fetched.value = [];
    modelQuery.value = '';
    pickerOpen.value = false;
    testState.value = 'idle';
    testError.value = '';
    customOpen.value = false;
    iconOpen.value = false;
    selectedId.value = p.id;
}

function addProvider() {
    if (!pending.value) pending.value = newAiProvider();
    select(pending.value);
}

function addModel(m: AiModel) {
    if (!draft.models.some((x) => x.id === m.id)) draft.models.push(...toDrafts([m]));
    modelQuery.value = '';
    pickerOpen.value = false;
}

function removeModel(id: string) {
    draft.models = draft.models.filter((m) => m.id !== id);
}

/** 拉取到候选后，给还空着的字段补上（不覆盖用户手改的值） */
function fillMeta() {
    for (const m of draft.models) {
        const f = fetched.value.find((x) => x.id === m.id);
        if (!f) continue;
        if (!m.name) m.name = f.name ?? '';
        if (!toTokens(m.contextLength)) m.contextLength = f.contextLength ?? 0;
        if (!toTokens(m.maxOutput)) m.maxOutput = f.maxOutput ?? 0;
        if (!m.modality.length) m.modality = parseModality(f.modality);
    }
}

/** 编辑态 → 接口 / 持久化态：'' / 空数组统一归一化成 null */
function toAiModels(list: ModelDraft[]): AiModel[] {
    return list.map((m) => ({
        id: m.id.trim(),
        name: m.name.trim() || null,
        contextLength: toTokens(m.contextLength) || null,
        maxOutput: toTokens(m.maxOutput) || null,
        modality: m.modality.join('+') || null,
    }));
}

/** 测试连接 / 获取模型列表：同一个请求，结果作为候选模型；错误只就地显示在「连接测试」行 */
async function pullModels(busy: Ref<boolean>, okMsg?: string, onDone?: (err: string | null) => void) {
    const providerId = draft.id;
    busy.value = true;
    let err: string | null = null;
    try {
        const list = await listAiModels({ ...draft, models: toAiModels(draft.models) }, apiKeyInput.value);
        // 请求期间切走了供应商：这是上一个供应商的返回，丢掉（别把它的模型/状态/提示写到当前这个身上）
        if (draft.id !== providerId) return;
        fetched.value = list;
        fillMeta();
        if (okMsg) await toast.success(okMsg);
    } catch (e) {
        err = String(e);
    } finally {
        busy.value = false;
        if (draft.id === providerId) onDone?.(err);
    }
}

/** 结果落到状态点 + 错误行 */
function showResult(err: string | null) {
    testState.value = err ? 'error' : 'ok';
    testError.value = err ?? '';
}

const testConnection = () => pullModels(testing, t('aiSettings.testOk'), showResult);
const fetchModels = () => pullModels(fetching, undefined, showResult);

async function save() {
    const name = draft.name.trim();
    const endpoint = draft.endpoint.trim();
    if (!name || !endpoint || (!apiKeyInput.value.trim() && !draft.hasApiKey)) {
        toast.warning(t('aiSettings.requiredHint'));
        return;
    }
    // 名称唯一：自定义项填成还没保存过的预设名 = 恢复该预设，占用它的位置（重名判定见下）
    const preset = presetForName(name, draft.id);
    const restore = preset && !isSaved(preset.id) ? preset : null;
    if (nameTaken(name, restore?.id ?? draft.id)) {
        toast.warning(t('aiSettings.nameTaken'));
        return;
    }
    saving.value = true;
    try {
        // 0 / '' / 空数组 = 未设置，落到后端 Option 前归一化成 null
        const models = toAiModels(draft.models);
        // 恢复预设：名称 / 地址 / 协议 / 图标回到预设原值（大小写也统一成预设写法）
        const target = { ...(restore ? presetProvider(restore) : draft), name: restore?.name ?? name, endpoint, models };
        const saved = await saveAiProvider(target, apiKeyInput.value);
        if (pending.value?.id === draft.id) pending.value = null;
        selectedId.value = saved.id;
        // 不回写 models：行内保留用户刚输入的文字（含 K/M 写法），下次保存再归一化
        Object.assign(draft, { id: saved.id, name: target.name, endpoint, hasApiKey: true });
        apiKeyInput.value = '';
        await toast.success(t('aiSettings.saveOk'));
    } catch (e) {
        await toast.error(String(e));
    } finally {
        saving.value = false;
    }
}

/** 删除供应商：右键菜单里针对某个胶囊，也用于编辑区底部的删除按钮 */
async function removeProvider(p: { id: string }) {
    if (!window.confirm(t('aiSettings.deleteConfirm'))) return;
    try {
        if (isSaved(p.id)) await deleteAiProvider(p.id);
        if (pending.value?.id === p.id) pending.value = null;
        // 被删除的供应商若是翻译所用，清空翻译目标
        if (settings.translate.ai?.providerId === p.id) {
            settings.translate.ai = { providerId: null, model: '' };
        }
        if (selectedId.value === p.id) selectedId.value = '';
    } catch (e) {
        await toast.error(String(e));
    }
}

/** 删除预设：只清掉它已保存的设置（配置 + Key）并记住被删过 —— UI 上不再显示，填同名新建保存即恢复 */
async function removePreset(preset: AiPreset) {
    if (!window.confirm(t('aiSettings.deletePresetConfirm'))) return;
    try {
        await deleteAiPreset(preset);
        if (settings.translate.ai?.providerId === preset.id) {
            settings.translate.ai = { providerId: null, model: '' };
        }
        // 删掉的正是当前编辑项：该胶囊已经不再显示，改选列表里第一个
        if (selectedId.value === preset.id) {
            selectedId.value = '';
            const next = cards.value[0];
            if (next) select(next);
        }
    } catch (e) {
        await toast.error(String(e));
    }
}

// 进入页面时默认勾选一个供应商：翻译在用的优先，否则第一个（含未配置的预设）
onMounted(async () => {
    if (!aiProviders.loaded) await loadAiProviders();
    const p = aiProviders.list.find((x) => x.id === settings.translate.ai?.providerId) ?? cards.value[0];
    if (p) select(p);
});
</script>
