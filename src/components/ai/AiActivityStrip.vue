<script setup lang="ts">
/**
 * AI 活动条：贴着聊天输入框顶部冒出来的一个小框，比输入框窄一点。
 * 顶部两角是圆的，底部直接贴在输入框上（不圆、不画下边框），跟输入框连成一体。
 * 先在开发者设置里用示例数据预览 UI。
 *
 * 固定形态（不随展开状态变化）：
 * - 折叠：**永远只有一行** —— 头像 + 最新一条内容 + 最右侧展开标记；
 * - 展开：同一行留在顶部，下方列出完整输出 / 工具调用链（超高 240px 后内部滚动，
 *   并自动跟着最新一条走；用户自己往上翻看旧内容时不抢滚动位置）；
 * - 列表里每条：AI 输出整段换行直接看（**markdown 已渲染**，可复制，见 utils/aiMarkdown）；
 *   **用户自己的提问靠右显示、气泡包裹**（跟聊天里自己发的消息一个意思）；
 *   **思考与工具调用是折叠条目**，点一下展开 —— 思考看完整内容，工具调用看输入（参数）和输出（结果）；
 * - 有待审核的工具调用：最下方再冒出一行「确认工具审核」，所以折叠时是两行，
 *   上面是原来的内容（头部行），下面是审核确认。审核行在滚动区外面，长上下文也一直看得见。
 *
 * 只渲染 props、不读 store —— 真实接入时由聊天输入框喂 entries / approval，
 * 审核结果用 approve / reject 事件回给调用方（对应 utils/aiTools 的 ApprovalGate）。
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { plainPreview, renderAiMarkdown } from '../../utils/aiMarkdown';
import {
    Brain as BrainIcon,
    ChevronDown as ChevronDownIcon,
    ChevronUp as ChevronUpIcon,
    Copy as CopyIcon,
    Sparkles as SparklesIcon,
    User as UserIcon,
    Wrench as WrenchIcon,
    X as XIcon,
} from 'lucide-vue-next';
import { toast } from '../../utils/toast';

export interface AiActivityEntry {
    id: string | number;
    /** user=用户自己发的话；thinking=思考过程；output=模型输出文本；tool=工具调用 */
    kind: 'user' | 'thinking' | 'output' | 'tool';
    /** 折叠那一行：思考 / 输出是正文，工具是「工具名 + 参数摘要」 */
    text: string;
    /** 工具调用的完整入参（展开后看） */
    input?: string;
    /** 工具调用的返回结果（展开后看） */
    output?: string;
    status?: 'running' | 'ok' | 'error';
}

/** 待确认的工具调用（utils/aiTools 的 ApprovalRequest 摘要） */
export interface AiApprovalLine {
    /** 工具名 + 参数摘要 */
    title: string;
    /** 模型给出的理由 */
    reason?: string;
}

const props = defineProps<{
    entries: AiActivityEntry[];
    approval?: AiApprovalLine | null;
}>();
const emit = defineEmits<{ approve: []; reject: [] }>();

const { t } = useI18n();
/**
 * 展开状态交给调用方（v-model:expanded）：聊天页要据此**钉住消息区底部留白** ——
 * 展开只是临时盖住消息，不该把消息顶走；不传就是纯本地状态（开发者预览）。
 */
const expanded = defineModel<boolean>('expanded', { default: false });
const listRef = ref<HTMLDivElement | null>(null);
/** 逐条展开的条目（思考看完整内容、工具调用看输入/输出） */
const openIds = reactive(new Set<string | number>());
/** 折叠时展示的最新一条；空列表退回占位文案 */
const latest = computed(() => props.entries[props.entries.length - 1] ?? null);

/**
 * 折叠那一行的文字：模型输出去掉 markdown 标记（只留一行纯文本，源码里的 `**` 不该露在外面），
 * 其余（用户提问 / 思考 / 工具调用）本来就是纯文本。
 */
const latestText = computed(() => (latest.value && latest.value.kind === 'output' ? plainPreview(latest.value.text) : latest.value?.text ?? ''));

/** 这条能不能展开：思考有完整内容，工具调用有输入 / 输出 */
const canOpen = (e: AiActivityEntry) =>
    e.kind === 'thinking' ? true : e.kind === 'tool' && Boolean(e.input || e.output);

const isOpen = (id: string | number) => openIds.has(id);
function toggleEntry(id: string | number) {
    if (openIds.has(id)) openIds.delete(id);
    else openIds.add(id);
}

/** 头部头像：模型输出用主色星标；用户提问 / 思考 / 工具用中性色 */
const headerNeutral = computed(() => (latest.value ? latest.value.kind !== 'output' : true));
const headerIcon = computed(() =>
    latest.value?.kind === 'tool'
        ? WrenchIcon
        : latest.value?.kind === 'thinking'
            ? BrainIcon
            : latest.value?.kind === 'user'
                ? UserIcon
                : SparklesIcon,
);

/**
 * 可展开条目的原图标：鼠标移上来时淡出，让位给展开箭头（移开恢复）；
 * 已经展开的常藏，箭头一直显示，方便收起。
 */
const iconFade = (e: AiActivityEntry) =>
    canOpen(e) ? (isOpen(e.id) ? 'opacity-0' : 'group-hover:opacity-0') : '';

/**
 * 正文颜色：失败红字；用户提问与模型输出用正文色（都要读）；思考 / 工具调用保持弱化的灰
 */
const entryTextClass = (e: AiActivityEntry) =>
    e.status === 'error'
        ? 'text-red-500 dark:text-red-400'
        : e.kind === 'output' || e.kind === 'user'
            ? 'text-gray-900 dark:text-gray-100'
            : '';

/** 整段读的正文类（用户提问 / 模型输出）：两者之间不留边距，读起来是连续的一段对话 */
const isProse = (e: AiActivityEntry) => e.kind === 'output' || e.kind === 'user';

/**
 * 每条的上下边距：
 * - 正文之间不留边距（连续读下来是一整段）；
 * - 正文的上 / 下紧挨着思考或工具调用时，那一侧留边距；
 * - 思考 / 工具调用本身固定留边距。
 */
const rowPadClass = (e: AiActivityEntry, i: number) => {
    // 用户气泡之间要留缝（换行的正文可以贴在一起，气泡贴一起就糊成一团）
    if (e.kind === 'user') return 'py-1';
    if (!isProse(e)) return 'py-1.5';
    const prev = props.entries[i - 1];
    const next = props.entries[i + 1];
    return [
        prev && !isProse(prev) ? 'pt-1.5' : '',
        next && !isProse(next) ? 'pb-1.5' : '',
    ]
        .filter(Boolean)
        .join(' ');
};

/** 复制一条正文（AI 输出）：模型回答经常要拿去用，没有复制只能手选 */
async function copyEntry(e: AiActivityEntry) {
    try {
        await navigator.clipboard.writeText(e.text);
        await toast.success(t('aiActivity.copied'));
    } catch {
        await toast.error(t('aiActivity.copyFailed'));
    }
}

/** 贴底：只有原本就在底部（或强制）才滚到底，用户往上翻的时候不抢滚动位置 */
function stickToBottom(force = false) {
    const el = listRef.value;
    if (!el) return;
    if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
        el.scrollTop = el.scrollHeight;
    }
}

function toggleExpanded() {
    expanded.value = !expanded.value;
    // 展开就先落在最新一条上（长上下文打开时不从头看）
    if (expanded.value) void nextTick(() => stickToBottom(true));
}

// 新条目进来（流式追加）时跟着往下走
watch(
    () => props.entries.length,
    () => {
        if (expanded.value) void nextTick(() => stickToBottom());
    },
);
</script>

<template>
    <div
        class="ai-strip select-text mx-auto -mb-px w-[calc(100%-1rem)] overflow-hidden rounded-t-2xl border border-b-0 border-gray-200/50 backdrop-blur-md dark:border-gray-700/50 [background:color-mix(in_srgb,var(--app-bg-container)_70%,transparent)]">
        <!-- 头部行：任何情况下都占一行；展开后仍停在顶部 -->
        <div class="flex h-9 items-center gap-2 px-3 text-[13px] text-gray-700 dark:text-gray-200">
            <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                :class="headerNeutral
                    ? 'bg-gray-200/80 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    : 'bg-[var(--app-brand)] text-white'">
                <component :is="headerIcon" class="h-3 w-3" :stroke-width="2" />
            </span>
            <!-- 失败不提图标，直接把字变红 -->
            <span class="min-w-0 flex-1 truncate"
                :class="latest?.status === 'error' ? 'text-red-500 dark:text-red-400' : ''">{{ latest ? latestText
                    : t('aiActivity.idle') }}</span>
            <button type="button"
                class="-mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200"
                :aria-expanded="expanded" :aria-label="expanded ? t('aiActivity.collapse') : t('aiActivity.expand')"
                @click="toggleExpanded">
                <ChevronDownIcon v-if="expanded" class="h-4 w-4" :stroke-width="2" />
                <ChevronUpIcon v-else class="h-4 w-4" :stroke-width="2" />
            </button>
        </div>

        <!-- 展开：完整输出 / 工具调用链。普通输出文本整段换行；思考与工具调用是折叠条目，点开看详情。
             上下文长了在这一块内部滚动（贴底跟最新一条），审核行留在滚动区外面 -->
        <div v-if="expanded" ref="listRef"
            class="custom-scrollbar max-h-60 overflow-y-auto overscroll-contain border-t border-gray-200/50 py-1 dark:border-gray-700/50">
            <template v-for="(e, i) in entries" :key="e.id">
                <component :is="canOpen(e) ? 'button' : 'div'" :type="canOpen(e) ? 'button' : undefined"
                    class="group flex w-full gap-2 px-3 text-left text-[13px] text-gray-500 dark:text-gray-400"
                    :class="[
                        e.kind === 'tool' ? 'items-center' : 'items-start',
                        rowPadClass(e, i),
                        canOpen(e) ? 'cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5' : '',
                    ]"
                    :aria-expanded="canOpen(e) ? isOpen(e.id) : undefined"
                    @click="canOpen(e) && toggleEntry(e.id)">
                    <!-- 图标位：模型输出与用户气泡都不带图标（正文 / 气泡直接占满那行）；
                         可展开的条目鼠标移上来时，原图标换成展开 / 收起箭头 -->
                    <span v-if="e.kind === 'thinking' || e.kind === 'tool'"
                        class="relative grid h-3.5 w-3.5 shrink-0 place-items-center"
                        :class="e.kind === 'tool' ? '' : 'mt-1'">
                        <BrainIcon v-if="e.kind === 'thinking'" class="h-3.5 w-3.5" :class="iconFade(e)"
                            :stroke-width="2" />
                        <WrenchIcon v-else class="h-3.5 w-3.5" :class="iconFade(e)" :stroke-width="2" />
                        <template v-if="canOpen(e)">
                            <ChevronUpIcon v-if="isOpen(e.id)" class="absolute inset-0 h-3.5 w-3.5"
                                :stroke-width="2" />
                            <ChevronDownIcon v-else
                                class="absolute inset-0 h-3.5 w-3.5 opacity-0 group-hover:opacity-100"
                                :stroke-width="2" />
                        </template>
                    </span>
                    <!-- 用户提问：靠右的气泡（跟聊天里自己发的消息一个意思） -->
                    <span v-if="e.kind === 'user'"
                        class="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-2.5 py-1.5 text-gray-900 [background:color-mix(in_srgb,var(--app-brand)_14%,transparent)] dark:text-gray-100">{{ e.text }}</span>
                    <!-- 模型输出渲染 markdown（**粗体** / `代码` / 列表要看得见格式）；思考与工具调用是纯文本 / JSON -->
                    <template v-else-if="e.kind === 'output'">
                        <span class="min-w-0 flex-1 break-words" :class="entryTextClass(e)"
                            v-html="renderAiMarkdown(e.text)" />
                        <button type="button"
                            class="-mr-1 mt-0.5 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md text-gray-400 opacity-0 transition-opacity hover:bg-black/5 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-white/5 dark:hover:text-gray-200"
                            :aria-label="t('aiActivity.copy')" :title="t('aiActivity.copy')"
                            @click.stop="copyEntry(e)">
                            <CopyIcon class="h-3.5 w-3.5" :stroke-width="2" />
                        </button>
                    </template>
                    <span v-else class="min-w-0 flex-1 truncate" :class="entryTextClass(e)">{{ e.text }}</span>
                    <span v-if="e.status === 'running'" class="mt-1 shrink-0 text-[11px]">…</span>
                </component>

                <!-- 条目详情：思考=完整内容；工具调用=输入（参数）+ 输出（结果） -->
                <div v-if="canOpen(e) && isOpen(e.id)" class="px-3 pb-1.5 pl-[34px] text-[12px]">
                    <div v-if="e.kind === 'thinking'"
                        class="whitespace-pre-wrap break-words border-l-2 border-gray-200 pl-2 leading-5 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        {{ e.text }}
                    </div>
                    <template v-else>
                        <div v-if="e.input" class="mb-1">
                            <p class="text-[11px] text-gray-400">{{ t('aiActivity.input') }}</p>
                            <pre
                                class="custom-scrollbar mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/5 p-1.5 font-mono text-[11px] leading-4 text-gray-600 dark:bg-white/5 dark:text-gray-300">{{ e.input }}</pre>
                        </div>
                        <div v-if="e.output">
                            <p class="text-[11px] text-gray-400">{{ t('aiActivity.output') }}</p>
                            <pre
                                class="custom-scrollbar mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/5 p-1.5 font-mono text-[11px] leading-4 text-gray-600 dark:bg-white/5 dark:text-gray-300">{{ e.output }}</pre>
                        </div>
                    </template>
                </div>
            </template>
        </div>

        <!-- 待审核：折叠时下面多出这一行（共两行），上面那行内容不动 -->
        <div v-if="approval"
            class="flex h-9 items-center gap-2 border-t border-amber-200/70 bg-amber-50/80 px-3 text-[13px] dark:border-amber-500/20 dark:bg-amber-500/10">
            <span class="shrink-0 font-medium text-amber-600 dark:text-amber-400">{{ t('aiActivity.approval')
                }}</span>
            <span class="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200" :title="approval.reason">
                {{ approval.title }}
            </span>
            <button type="button"
                class="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
                :aria-label="t('aiActivity.reject')" @click="emit('reject')">
                <XIcon class="h-3.5 w-3.5" :stroke-width="2.5" />
            </button>
            <button type="button"
                class="h-6 shrink-0 cursor-pointer rounded-md bg-[var(--app-brand)] px-2 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                :aria-label="t('aiActivity.approve')" @click="emit('approve')">
                {{ t('aiActivity.approve') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
/* 全局 `* { user-select: none }` 是**直接命中每个元素**（不是靠继承），
   所以只放开根节点没用：AI 输出（v-html 出来的 markdown 子节点）、用户提问气泡、
   思考详情都得连子元素一起显式放开，否则框选到粗体 / 代码就断。
   `.select-text` 同时让 main.ts 的全局 mousedown 清选区逻辑放过这一块。 */
.ai-strip,
.ai-strip :deep(*) {
    -webkit-user-select: text;
    user-select: text;
}
</style>
