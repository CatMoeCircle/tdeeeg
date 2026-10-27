<template>
    <div v-bind="$attrs" class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="router.back()">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('aiTakeover.title') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">

                <!-- ===== 总开关 + 边界说明：只接管私聊，且必须逐个授权 ===== -->
                <section class="mb-8">
                    <div
                        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('aiTakeover.enable') }}</h3>
                                <p class="text-xs text-gray-500 mt-0.5">{{ t('aiTakeover.enableDesc') }}</p>
                            </div>
                            <ToggleSwitch v-model="aiTakeover.enabled" />
                        </div>

                        <!-- 接管时机：什么情况下才真的自动回复 -->
                        <div class="mt-3 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                            <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {{ t('aiTakeover.activationLine') }}</p>
                            <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <SelectMenu size="sm" :model-value="aiTakeover.activation" :options="activationOptions"
                                    @update:model-value="onActivationChange" />
                                <SelectMenu v-if="aiTakeover.activation === 'idle'" size="sm"
                                    :model-value="String(aiTakeover.idleMinutes)" :options="idleOptions"
                                    @update:model-value="onIdleMinutesChange" />
                            </div>
                            <p class="mt-1 text-[11px] text-gray-500">{{ activationHint }}</p>
                        </div>

                        <!-- 复用会话 + 上下文压缩：回复前自动压；手动按钮在每张卡里 -->
                        <p class="mt-3 text-[11px] text-gray-400">{{ t('aiTakeover.compressHint', { n: HISTORY_KEEP }) }}</p>

                        <!-- 接管专用的供应商 / 模型：先选供应商，再选它下面的模型 -->
                        <div class="mt-3 rounded-lg px-3 py-2"
                            :class="modelReady
                                ? 'bg-gray-50 dark:bg-gray-900/40'
                                : 'bg-amber-50/70 dark:bg-amber-500/10'">
                            <div class="flex items-center justify-between gap-3">
                                <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {{ t('aiTakeover.modelLine') }}</p>
                                <button v-if="!hasAnyModel" type="button"
                                    class="shrink-0 px-2.5 py-1 rounded-lg text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                    @click="router.push({ name: 'settings-ai' })">{{ t('aiTakeover.configure') }}</button>
                            </div>
                            <div v-if="hasAnyModel" class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <label class="block min-w-0">
                                    <span class="text-[11px] text-gray-400">{{ t('aiTakeover.providerLabel') }}</span>
                                    <SelectMenu class="mt-1" :model-value="providerId" :options="providerOptions"
                                        :placeholder="t('aiTakeover.providerPh')"
                                        @update:model-value="onProviderChange" />
                                </label>
                                <label class="block min-w-0">
                                    <span class="text-[11px] text-gray-400">{{ t('aiTakeover.modelLabel') }}</span>
                                    <SelectMenu class="mt-1" :model-value="modelId" :options="modelOptions"
                                        :placeholder="t('aiTakeover.modelPh')"
                                        @update:model-value="onModelChange" />
                                </label>
                            </div>
                            <p v-else class="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                {{ t('aiTakeover.modelMissing') }}</p>
                        </div>

                        <p class="mt-2 text-xs text-gray-400">{{ t('aiTakeover.scopeHint') }}</p>
                    </div>
                </section>

                <!-- ===== 已接管：默认折叠，点开才展开模式 / 风格 / 延迟 / 压缩 ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('aiTakeover.listSection') }}（{{ aiTakeover.chats.length }}）</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <p v-if="!aiTakeover.chats.length" class="text-xs text-gray-400">{{ t('aiTakeover.listEmpty') }}</p>

                    <div class="space-y-3">
                        <div v-for="cfg in aiTakeover.chats" :key="cfg.chatId"
                            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden">
                            <!-- 折叠头：头像 + 标题 + 状态 + 开关 + 展开箭头（整行可点） -->
                            <div class="flex items-center gap-3 p-3 cursor-pointer select-none"
                                @click="toggleExpanded(cfg.chatId)">
                                <div class="w-10 h-10 rounded-full overflow-hidden shrink-0">
                                    <Avatar v-bind="avatarOf(cfg.chatId)" />
                                </div>
                                <div class="min-w-0 flex-1">
                                    <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {{ cfg.title || `#${cfg.chatId}` }}</h4>
                                    <p class="text-[11px] truncate mt-0.5"
                                        :class="cfg.lastError ? 'text-red-500' : 'text-gray-400'">
                                        {{ metaLine(cfg) }}
                                    </p>
                                </div>
                                <div class="flex items-center gap-1 shrink-0">
                                    <div @click.stop>
                                        <ToggleSwitch :model-value="cfg.enabled"
                                            @update:model-value="(v: boolean) => updateTakeover(cfg.chatId, { enabled: v })" />
                                    </div>
                                    <button type="button" :aria-label="t('aiTakeover.remove')"
                                        class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                        @click.stop="removeChat(cfg)">
                                        <Trash2Icon class="w-4 h-4" />
                                    </button>
                                    <!-- 展开箭头自己也是按钮：点它必须能展开，别被外层的 click.stop 吃掉 -->
                                    <button type="button" :aria-label="expanded.has(cfg.chatId) ? t('aiTakeover.collapse') : t('aiTakeover.expand')"
                                        :aria-expanded="expanded.has(cfg.chatId)"
                                        class="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                                        @click.stop="toggleExpanded(cfg.chatId)">
                                        <ChevronDownIcon class="w-4 h-4 transition-transform"
                                            :class="expanded.has(cfg.chatId) ? 'rotate-180' : ''" />
                                    </button>
                                </div>
                            </div>

                            <!-- 展开体 -->
                            <div v-if="expanded.has(cfg.chatId)"
                                class="px-3 pb-3 border-t border-gray-100 dark:border-gray-700/60 pt-3">
                                <!-- 接管方式：模仿我 / AI 接管（二选一） -->
                                <div class="grid grid-cols-2 gap-2">
                                    <button v-for="opt in MODES" :key="opt.id" type="button"
                                        class="flex items-start gap-2 px-3 py-2 text-left rounded-xl border transition-colors"
                                        :class="cfg.mode === opt.id
                                            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-500/10'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'"
                                        @click="updateTakeover(cfg.chatId, { mode: opt.id })">
                                        <component :is="opt.icon" class="w-4 h-4 shrink-0 mt-0.5"
                                            :class="cfg.mode === opt.id ? 'text-blue-500' : 'text-gray-400'" />
                                        <span class="min-w-0">
                                            <span class="block text-xs font-medium text-gray-900 dark:text-gray-100">
                                                {{ t(opt.labelKey) }}</span>
                                            <span class="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                {{ t(opt.descKey) }}</span>
                                        </span>
                                    </button>
                                </div>

                                <!-- 模仿模式的风格画像：选了「模仿我」之后，在下面点「总结」 -->
                                <div v-if="cfg.mode === 'imitate'"
                                    class="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 px-3 py-2">
                                    <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
                                        {{ t('aiTakeover.styleTitle') }}</p>
                                    <p class="text-[11px] text-gray-500 mt-0.5">{{ t('aiTakeover.styleHint') }}</p>
                                    <div class="mt-2 flex flex-wrap items-center gap-2">
                                        <SelectMenu size="sm" class="w-36 shrink-0" :model-value="String(cfg.styleLimit)"
                                            :options="styleLimitOptions"
                                            @update:model-value="(v: string) => updateTakeover(cfg.chatId, { styleLimit: Number(v) })" />
                                        <button type="button" :disabled="summarizing === cfg.chatId || !modelReady"
                                            class="px-2.5 py-1 rounded-lg text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-50 transition-colors"
                                            @click="summarizeStyle(cfg)">
                                            {{ summarizing === cfg.chatId
                                                ? t('aiTakeover.styleSummarizing')
                                                : cfg.style ? t('aiTakeover.styleResummarize') : t('aiTakeover.styleSummary') }}
                                        </button>
                                        <button v-if="cfg.style" type="button"
                                            class="px-2.5 py-1 rounded-lg text-xs text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                            @click="clearStyle(cfg.chatId)">{{ t('aiTakeover.styleClear') }}</button>
                                    </div>
                                    <!-- 风格画像是模型输出：走 renderAiMarkdown（先转义再渲染 markdown），不用 {{ }} 露出 ** 等源码 -->
                                    <div v-if="cfg.style" class="mt-2 break-words text-[11px] leading-5 text-gray-600 dark:text-gray-300 max-h-32 overflow-y-auto custom-scrollbar"
                                        v-html="renderAiMarkdown(cfg.style)"></div>
                                    <p v-else class="mt-2 text-[11px] text-gray-400">{{ t('aiTakeover.styleEmpty') }}</p>
                                    <p v-if="cfg.style && cfg.styleAt" class="mt-1 text-[11px] text-gray-400">
                                        {{ t('aiTakeover.styleMeta', { n: cfg.styleLimit, time: fmtTime(cfg.styleAt) }) }}</p>

                                    <!-- 本人常用贴纸 / 自定义表情：和画像同一次「总结」里一起统计 -->
                                    <div class="mt-2 border-t border-gray-200/70 dark:border-gray-700/60 pt-2">
                                        <p class="text-[11px] text-gray-500">{{ t('aiTakeover.usageHint') }}</p>
                                        <div v-if="cfg.stickers.length || cfg.customEmojis.length"
                                            class="mt-1 flex flex-wrap gap-1">
                                            <!-- 贴纸：只显示真实贴纸图 + 次数，旁边的原始 emoji 字符不显示 -->
                                            <span v-for="s in cfg.stickers" :key="`s${s.id}`"
                                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700"
                                                :title="t('aiTakeover.usageStickerTitle', { count: s.count })">
                                                <StickerThumb :file-id="s.id" :format="s.format" :size="18" />
                                                <span class="text-gray-400">×{{ s.count }}</span>
                                            </span>
                                            <!-- 自定义表情：只显示对应的自定义表情图 + 次数 -->
                                            <span v-for="e in cfg.customEmojis" :key="`e${e.id}`"
                                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700"
                                                :title="t('aiTakeover.usageEmojiTitle', { count: e.count })">
                                                <CustomEmojiInline :emoji-id="e.id" :size="18" eager />
                                                <span class="text-gray-400">×{{ e.count }}</span>
                                            </span>
                                        </div>
                                        <p v-else class="mt-1 text-[11px] text-gray-400">{{ t('aiTakeover.usageEmpty') }}</p>
                                    </div>
                                </div>

                                <div class="mt-3 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2">
                                    <label class="text-xs text-gray-500 pt-2">{{ t('aiTakeover.delay') }}</label>
                                    <div class="flex items-center gap-2">
                                        <input :value="cfg.delaySec" type="number" min="0" max="120" step="1"
                                            class="w-20 px-2 py-1.5 rounded-lg text-sm bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none"
                                            @change="onDelayChange(cfg, $event)" />
                                        <span class="text-[11px] text-gray-400">{{ t('aiTakeover.delayUnit') }}</span>
                                    </div>

                                    <label class="text-xs text-gray-500 pt-2">{{ t('aiTakeover.instructions') }}</label>
                                    <textarea v-model="cfg.instructions" rows="2" spellcheck="false"
                                        :placeholder="t('aiTakeover.instructionsPh')"
                                        class="w-full px-3 py-2 rounded-lg text-sm bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none resize-y"></textarea>
                                </div>

                                <!-- 上下文压缩：最近 n 条原样给模型，更早的压成摘要 -->
                                <div
                                    class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                                    <div class="min-w-0">
                                        <p class="text-[11px] text-gray-500">
                                            {{ t('aiTakeover.compressHint', { n: HISTORY_KEEP }) }}</p>
                                        <p class="text-[11px] text-gray-400 truncate"
                                            :title="cfg.summary">
                                            {{ t('aiTakeover.sessionSize', { n: cfg.history.length }) }} ·
                                            {{ cfg.summary
                                                ? t('aiTakeover.summarySize', { n: cfg.summary.length })
                                                : t('aiTakeover.summaryEmpty') }}</p>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0">
                                        <button type="button" :disabled="compressing === cfg.chatId || !modelReady"
                                            class="px-2.5 py-1 rounded-lg text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                                            @click="compressNow(cfg)">
                                            {{ compressing === cfg.chatId ? t('aiTakeover.compressing') : t('aiTakeover.compressNow') }}
                                        </button>
                                        <button type="button" :disabled="!cfg.summary"
                                            class="px-2.5 py-1 rounded-lg text-xs text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
                                            @click="clearSummary(cfg.chatId)">{{ t('aiTakeover.summaryClear') }}</button>
                                    </div>
                                </div>

                                <p v-if="cfg.lastError" class="mt-2 text-[11px] text-red-500 break-all">
                                    {{ t('aiTakeover.lastError', { reason: cfg.lastError }) }}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ===== 添加聊天：只列私聊，点一下就加入接管列表 ===== -->
                <section>
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('aiTakeover.addSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <input v-model="query" type="search" spellcheck="false" :placeholder="t('aiTakeover.searchPh')"
                        class="w-full mb-3 px-3 py-2 rounded-lg text-sm bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none" />

                    <p v-if="!candidates.length" class="text-xs text-gray-400">
                        {{ query ? t('aiTakeover.noMatch') : t('aiTakeover.noPrivateChats') }}</p>

                    <div class="space-y-2">
                        <button v-for="c in candidates" :key="c.id" type="button"
                            class="flex w-full items-center gap-3 px-3 py-2 text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 hover:bg-white/90 dark:hover:bg-gray-800 transition-colors"
                            @click="addChat(c)">
                            <div class="w-9 h-9 rounded-full overflow-hidden shrink-0">
                                <Avatar v-bind="avatarOf(c.id)" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm text-gray-900 dark:text-gray-100 truncate">{{ c.title }}</p>
                                <p v-if="usernameOf(c)" class="text-[11px] text-gray-400 truncate">@{{ usernameOf(c) }}</p>
                            </div>
                            <PlusIcon class="w-4 h-4 text-gray-400 shrink-0" />
                        </button>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 私聊 AI 接管设置：用户在这里**逐个**选择要接管的私聊，并决定接管方式。
 *
 * - 只列私聊（chatTypePrivate）且排除机器人 / 已注销 / 自己（收藏夹）——运行时会再挡一次；
 * - 模仿我（imitate）：点了「模仿我」之后要先「总结」一次 —— 模型读最近 N 条对话
 *   （N 由用户选：30/50/100/200），提炼出本人在这段对话里的说话风格，存成风格画像；
 * - AI 接管（assistant）：以 AI 助手身份直接和对方聊，不冒充本人；
 * - 上下文压缩：回复前自动压，最近 RECENT_LIMIT 条原样给模型（也可手动点「立即压缩」）；
 * - 每张卡片默认折叠，点开才展开设置；
 * - 接管模型就在本页选：先选供应商，再选这家下面的模型（没选过则沿用 AI 设置里那套）。
 */
import { computed, onMounted, reactive, ref, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { chatPhotoInfo, profilePhoto } from 'tdlib-types';
import {
    Bot as BotIcon,
    ChevronDown as ChevronDownIcon,
    ChevronLeft as ChevronLeftIcon,
    Plus as PlusIcon,
    Trash2 as Trash2Icon,
    UserRound as UserRoundIcon,
} from 'lucide-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import StickerThumb from '../../components/ai/StickerThumb.vue';
import CustomEmojiInline from '../../components/common/CustomEmojiInline.vue';
import SelectMenu from '../../components/ui/dropdown/SelectMenu.vue';
import ToggleSwitch from '../../components/ui/toggle/ToggleSwitch.vue';
import { useAccountsStore } from '../../store/accounts';
import { aiModelGroups, aiProviders, loadAiProviders } from '../../store/aiConfig';
import {
    aiTakeover,
    clearStyle,
    clearSummary,
    loadTakeover,
    removeTakeover,
    setTakeoverModel,
    takeoverFor,
    updateTakeover,
    upsertTakeover,
    IDLE_MINUTES,
    type TakeoverChat,
    type TakeoverMode,
} from '../../store/aiTakeover';
import { useChatStore, type Chat } from '../../store/chat';
import { useUserStore } from '../../store/user';
import { compressTakeoverNow, resolveTakeoverTarget, summarizeStyleNow } from '../../utils/aiTakeover';
import { renderAiMarkdown } from '../../utils/aiMarkdown';
import { HISTORY_KEEP, STYLE_LIMITS } from '../../utils/aiTakeoverPrompt';
import { ensureChat, ensureUser, getReactiveChat, getReactiveUser } from '../../utils/senderInfo';
import { toast } from '../../utils/toast';

const router = useRouter();
const { t } = useI18n();
const accounts = useAccountsStore();
const chatStore = useChatStore();
const userStore = useUserStore();

const query = ref('');
const compressing = ref(0);
const summarizing = ref(0);
/** 展开的卡片（默认全部折叠） */
const expanded = reactive(new Set<number>());

const MODES: { id: TakeoverMode; icon: Component; labelKey: string; descKey: string }[] = [
    { id: 'imitate', icon: UserRoundIcon, labelKey: 'aiTakeover.modeImitate', descKey: 'aiTakeover.modeImitateDesc' },
    { id: 'assistant', icon: BotIcon, labelKey: 'aiTakeover.modeAssistant', descKey: 'aiTakeover.modeAssistantDesc' },
];

/** 接管模型的可选项（供应商清单），与 AI 设置页同一个列表 */
const providerGroups = computed(() => aiModelGroups());
const hasAnyModel = computed(() => providerGroups.value.length > 0);

/** 实际生效的供应商 / 模型：和运行时同一份判定（见 utils/aiTakeover 的 resolveTakeoverTarget） */
const target = computed(() => resolveTakeoverTarget());
const modelReady = computed(() => !!target.value);
/** 下拉里显示的供应商 / 模型（没显式选过就显示跟随 AI 设置的那套，点一下才算显式选择） */
const providerId = computed(() => target.value?.provider.id ?? '');
const modelId = computed(() => target.value?.model.id ?? '');

const providerOptions = computed(() =>
    providerGroups.value.map((g) => ({ value: g.id, label: g.name, icon: g.icon })),
);

const modelOptions = computed(() => {
    const group = providerGroups.value.find((g) => g.id === providerId.value);
    return (group?.models ?? []).map((m) => ({
        value: m.id,
        label: m.name,
        // 名称就是 id 时不重复显示；否则右侧带出 id，选模型时看得准
        hint: m.name === m.id ? undefined : m.id,
    }));
});

/** 风格画像「取材条数」的档位 */
const styleLimitOptions = computed(() =>
    STYLE_LIMITS.map((n) => ({ value: String(n), label: t('aiTakeover.styleLimitOption', { n }) })),
);

/** 接管时机：始终 / 仅后台 / 闲置多久 */
const activationOptions = computed(() => [
    { value: 'always', label: t('aiTakeover.activationAlways') },
    { value: 'background', label: t('aiTakeover.activationBackground') },
    { value: 'idle', label: t('aiTakeover.activationIdle') },
]);

const idleOptions = computed(() =>
    IDLE_MINUTES.map((n) => ({ value: String(n), label: t('aiTakeover.idleMinutesOption', { n }) })),
);

const activationHint = computed(() => {
    if (aiTakeover.activation === 'background') return t('aiTakeover.activationBackgroundHint');
    if (aiTakeover.activation === 'idle') {
        return t('aiTakeover.activationIdleHint', { n: aiTakeover.idleMinutes });
    }
    return t('aiTakeover.activationAlwaysHint');
});

function onActivationChange(value: string): void {
    aiTakeover.activation = value === 'background' || value === 'idle' ? value : 'always';
}

function onIdleMinutesChange(value: string): void {
    const n = Number(value);
    if (Number.isFinite(n)) aiTakeover.idleMinutes = Math.min(1440, Math.max(1, Math.round(n)));
}

/** 先选供应商 → 模型自动落到这家第一个模型（再改模型就是第二下拉的事） */
function onProviderChange(id: string): void {
    const group = providerGroups.value.find((g) => g.id === id);
    setTakeoverModel(id || null, group?.models[0]?.id ?? '');
}

/** 模型：固定在当前供应商下选择 */
function onModelChange(id: string): void {
    setTakeoverModel(providerId.value || null, id);
}

/** 我的 user id：用来把「收藏夹 / 给自己发消息」从候选里排掉 */
const myId = computed(() => userStore.userProfile?.id ?? 0);

/** 一个私聊对象的 user id（不是私聊 = 0） */
function privateUserId(c: Chat): number {
    return c.type?._ === 'chatTypePrivate' ? c.type.user_id : 0;
}

function chatUserIdFromCache(chatId: number): number {
    const c = getReactiveChat(chatId);
    return c?.type?._ === 'chatTypePrivate' ? c.type.user_id : 0;
}

/**
 * 头像 / 首字母数据：真实头像优先取用户资料图，其次聊天图。
 * 两个列表都用它 —— 之前只画首字母，看起来像没加载。
 */
function avatarOf(chatId: number): {
    photo?: chatPhotoInfo | profilePhoto;
    title: string;
    firstName: string;
    lastName: string;
    accentColorId?: number;
} {
    const cached = chatStore.chats[chatId];
    const userId = cached?.type?._ === 'chatTypePrivate' ? cached.type.user_id : chatUserIdFromCache(chatId);
    const user = userId ? getReactiveUser(userId) : undefined;
    const photo = user?.profile_photo ?? cached?.photo ?? getReactiveChat(chatId)?.photo ?? undefined;
    return {
        photo: photo ?? undefined,
        title: cached?.title ?? takeoverFor(chatId)?.title ?? getReactiveChat(chatId)?.title ?? '',
        firstName: user?.first_name ?? '',
        lastName: user?.last_name ?? '',
        accentColorId: user?.accent_color_id,
    };
}

/** 一个私聊对象的 @用户名（没缓存就空） */
function usernameOf(c: Chat): string {
    const id = privateUserId(c);
    return id ? getReactiveUser(id)?.usernames?.active_usernames?.[0] ?? '' : '';
}

/** 候选列表补拉过资料的 user id（防 getUser 反复失败时每次重算都重发请求） */
const userFetchTried = new Set<number>();

/**
 * 候选聊天：主列表 + 归档里还没被接管的私聊。
 * 用户资料没缓存的先补拉一次，拉到之前不列出——机器人只有靠这一步才挡得住，
 * 等 userTypeBot 落进缓存再过滤，列表里就已经闪出来过了。
 */
const candidates = computed<Chat[]>(() => {
    const ids = [
        ...(chatStore.lists['chatListMain'] ?? []),
        ...(chatStore.lists['chatListArchive'] ?? []),
    ];
    const q = query.value.trim().toLowerCase();
    const out: Chat[] = [];
    for (const id of ids) {
        const c = chatStore.chats[id];
        if (!c || c.title === '…' || c.type?._ !== 'chatTypePrivate' || c.id === myId.value) continue;
        if (takeoverFor(c.id)) continue;
        const uid = c.type.user_id;
        const u = uid ? getReactiveUser(uid) : undefined;
        if (!u) {
            // 每个 id 只补拉一次；getUser 失败（如已注销拿不到资料）就不进列表
            if (uid && !userFetchTried.has(uid)) {
                userFetchTried.add(uid);
                void ensureUser(uid);
            }
            continue;
        }
        if (u.type?._ !== 'userTypeRegular' || u.is_support) continue;
        if (q && !c.title.toLowerCase().includes(q) && !usernameOf(c).toLowerCase().includes(q)) continue;
        out.push(c);
        if (out.length >= 40) break;
    }
    return out;
});

function toggleExpanded(chatId: number): void {
    if (expanded.has(chatId)) expanded.delete(chatId);
    else expanded.add(chatId);
}

/** 时间：MM-DD HH:MM */
function fmtTime(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function modeLabel(cfg: TakeoverChat): string {
    return cfg.mode === 'imitate' ? t('aiTakeover.modeImitate') : t('aiTakeover.modeAssistant');
}

/** 折叠头的一行：方式 · 风格画像状态（模仿模式）· 运行状态 */
function metaLine(cfg: TakeoverChat): string {
    const parts = [modeLabel(cfg)];
    if (cfg.mode === 'imitate' && cfg.style) parts.push(t('aiTakeover.styleReady'));
    parts.push(statusLine(cfg));
    return parts.join(' · ');
}

/** 状态行：暂停 / 正常 + 上次回复时间 */
function statusLine(cfg: TakeoverChat): string {
    if (!cfg.enabled || !aiTakeover.enabled) return t('aiTakeover.statusPaused');
    if (!cfg.lastReplyAt) return t('aiTakeover.statusNoReplyYet');
    return t('aiTakeover.statusLastReply', { time: fmtTime(cfg.lastReplyAt) });
}

function errText(e: unknown): string {
    if (e instanceof Error) return e.message;
    const msg = (e as { message?: unknown })?.message;
    return typeof msg === 'string' ? msg : String(e);
}

function onDelayChange(cfg: TakeoverChat, e: Event): void {
    const raw = Number((e.target as HTMLInputElement).value);
    const value = Number.isFinite(raw) ? Math.min(120, Math.max(0, Math.round(raw))) : 6;
    (e.target as HTMLInputElement).value = String(value);
    updateTakeover(cfg.chatId, { delaySec: value });
}

/** 加入接管：加之前校验一次，机器人 / 已注销直接拒绝（提示用户，别静默加进来） */
async function addChat(c: Chat): Promise<void> {
    const userId = privateUserId(c);
    if (userId) await ensureUser(userId);
    const u = getReactiveUser(userId);
    if (u && (u.type?._ !== 'userTypeRegular' || u.is_support)) {
        await toast.warning(t('aiTakeover.notTakeOverAble'));
        return;
    }
    upsertTakeover({ chatId: c.id, title: c.title });
    await toast.success(t('aiTakeover.added', { title: c.title }));
}

function removeChat(cfg: TakeoverChat): void {
    expanded.delete(cfg.chatId);
    removeTakeover(cfg.chatId);
}

async function compressNow(cfg: TakeoverChat): Promise<void> {
    if (compressing.value) return;
    compressing.value = cfg.chatId;
    try {
        const n = await compressTakeoverNow(cfg.chatId);
        await toast.success(n ? t('aiTakeover.compressDone', { n }) : t('aiTakeover.compressNone'));
    } catch (e) {
        await toast.error(errText(e));
    } finally {
        compressing.value = 0;
    }
}

/** 模仿模式的「总结」：模型读最近 N 条对话提炼风格，贴纸 / 自定义表情从同一批消息一起统计 */
async function summarizeStyle(cfg: TakeoverChat): Promise<void> {
    if (summarizing.value) return;
    summarizing.value = cfg.chatId;
    try {
        const r = await summarizeStyleNow(cfg.chatId, cfg.styleLimit);
        await toast.success(t('aiTakeover.styleDone', {
            n: r.messages,
            stickers: r.stickers,
            emojis: r.emojis,
        }));
    } catch (e) {
        await toast.error(errText(e));
    } finally {
        summarizing.value = 0;
    }
}

onMounted(async () => {
    loadTakeover(accounts.activeAccount?.id);
    if (!aiProviders.loaded) await loadAiProviders().catch(() => undefined);
    if (!userStore.userProfile) await userStore.fetchUser();
    // 已接管的聊天可能没在当前列表页面加载过：补拉聊天 + 对方资料，头像才出得来
    for (const cfg of aiTakeover.chats) {
        void ensureChat(cfg.chatId).then(() => {
            const uid = chatUserIdFromCache(cfg.chatId);
            if (uid) void ensureUser(uid);
        });
    }
});
</script>
