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
 * - **工具调用过程折叠（对齐 DSH）**：这一轮还在跑时每次调用一条、实时冒出来；回答完
 *   （busy=false）且设置开关打开时，相邻的几次调用收成一行「工具调用 ×N · 工具名…」，
 *   点一下展开成一条条、每条仍可再点开看参数 / 结果。关掉开关就退回老样子（每次一行）。
 * - 有待审核的工具调用：最下方再冒出一行「确认工具审核」，所以折叠时是两行，
 *   上面是原来的内容（头部行），下面是审核确认。审核行在滚动区外面，长上下文也一直看得见。
 *
 * 只渲染 props、不读 store —— 真实接入时由聊天输入框喂 entries / approval，
 * 审核结果用 approve / reject 事件回给调用方（对应 utils/aiTools 的 ApprovalGate）。
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { plainPreview, renderAiMarkdown } from '../../utils/ai/aiMarkdown';
import ThoughtLine from './ThoughtLine.vue';
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
import { toast } from '../../utils/ui/toast';

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
    /** 思考条目的耗时（毫秒）：跑完一直显示「已思考 1.2s」，落盘后重进对话也还在 */
    thoughtMs?: number;
}

/** 待确认的工具调用（utils/aiTools 的 ApprovalRequest 摘要） */
export interface AiApprovalLine {
    /** 工具名 + 参数摘要 */
    title: string;
    /** 模型给出的理由 */
    reason?: string;
}

const props = withDefaults(
    defineProps<{
        entries: AiActivityEntry[];
        approval?: AiApprovalLine | null;
        /** AI 正在跑这一轮（与输入框的 busy 同一个状态源）：顶部换成「正在思考」 */
        busy?: boolean;
        /**
         * 回答完后把相邻的工具调用收成一行（设置项 settings.ai.collapseToolCalls）。
         * 跑的时候不分组：过程要实时看得见；收起来的只是已经结束的那一段。
         */
        collapseToolCalls?: boolean;
    }>(),
    { collapseToolCalls: true },
);
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

/**
 * 「正在思考」这一行分两段摆：
 * - 跑这一轮时就在**标题行**那个位置（图标呼吸 + 实时计时）；
 * - 响应结束、标题行回到最新一条之后，它**下放**到标题下面那一行，
 *   收成「已思考 1.2s」并且一直留着（不能跑完就消失）。
 *
 * 耗时在这里计（busy 变 true 起算）：下放那一行用 elapsed 受控显示，
 * 不另外起一个时钟，数字与刚才顶部一秒秒跳的是同一个。
 */
const thoughtStartedAt = ref(0);
const thoughtSeconds = ref(0);
const thoughtDone = ref(false);
watch(
    () => props.busy,
    (busy) => {
        if (busy) {
            thoughtStartedAt.value = performance.now();
            thoughtDone.value = false;
            return;
        }
        if (!thoughtStartedAt.value) return;
        thoughtSeconds.value = (performance.now() - thoughtStartedAt.value) / 1000;
        thoughtStartedAt.value = 0;
        thoughtDone.value = true;
    },
    { immediate: true },
);
// 换聊天 / 换会话会清空条目：下放的那一行跟着收，别留着上一段对话的耗时
watch(
    () => props.entries.length,
    (n) => {
        if (!props.busy && n === 0) {
            thoughtDone.value = false;
            thoughtSeconds.value = 0;
        }
    },
);

/** 这条能不能展开：思考有完整内容，工具调用有输入 / 输出 */
const canOpen = (e: AiActivityEntry) =>
    e.kind === 'thinking' ? true : e.kind === 'tool' && Boolean(e.input || e.output);

const isOpen = (id: string | number) => openIds.has(id);
function toggleEntry(id: string | number) {
    if (openIds.has(id)) openIds.delete(id);
    else openIds.add(id);
}

/* ===== 工具调用过程折叠（对齐 DSH） ===== */

/**
 * 什么时候「收成一组」：**这一轮已经结束**且开关打开。
 * 跑的时候不分组 —— 用户要看它此刻在调什么工具，收起来等于把过程藏了。
 */
const groupTools = computed(() => props.collapseToolCalls && !props.busy);
/** 展开着的工具调用组（key = 组里第一条的 id）：默认全收起，这正是「回答完把过程收起来」 */
const openGroups = reactive(new Set<string>());

/** 列表实际画什么：普通条目一条；一组工具 = 一个组头 +（展开时）组内每条 */
type StripRow =
    | { type: 'entry'; key: string | number; entry: AiActivityEntry; index: number; nested: boolean }
    | { type: 'group'; key: string; items: AiActivityEntry[]; index: number };

const rows = computed<StripRow[]>(() => {
    const out: StripRow[] = [];
    const list = props.entries;
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (groupTools.value && e.kind === 'tool') {
            // 相邻的几次工具调用算一段（中间夹了输出 / 思考就断组）
            const items = [e];
            let j = i + 1;
            while (j < list.length && list[j].kind === 'tool') items.push(list[j++]);
            const key = `g:${String(e.id)}`;
            out.push({ type: 'group', key, items, index: i });
            if (openGroups.has(key)) {
                for (const item of items) {
                    out.push({ type: 'entry', key: item.id, entry: item, index: list.indexOf(item), nested: true });
                }
            }
            i = j - 1;
            continue;
        }
        out.push({ type: 'entry', key: e.id, entry: e, index: i, nested: false });
    }
    return out;
});

const isGroupOpen = (key: string) => openGroups.has(key);
function toggleGroup(key: string) {
    if (openGroups.has(key)) openGroups.delete(key);
    else openGroups.add(key);
}

/** 组头摘要：工具名去重（最多三个）—— 只写「3 次调用」看不出干了什么 */
function groupNames(items: AiActivityEntry[]): string {
    const names: string[] = [];
    for (const it of items) {
        const name = it.text.trim();
        if (name && !names.includes(name)) names.push(name);
    }
    return names.slice(0, 3).join(' · ') + (names.length > 3 ? ' …' : '');
}

/** 组里失败的调用数：有失败直接在组头红字点出来，不用展开才发现 */
const failureCount = (items: AiActivityEntry[]) => items.filter((it) => it.status === 'error').length;

// 一轮开始 / 结束：组状态清空 —— 新一轮从实时视图开始，结束则一律收起。
// 顺手把点开过的工具详情收掉，免得下次展开组时冒出上一轮的参数 / 结果。
watch(
    () => props.busy,
    (busy) => {
        openGroups.clear();
        if (busy) return;
        for (const id of [...openIds]) {
            const e = props.entries.find((x) => x.id === id);
            if (!e || e.kind === 'tool') openIds.delete(id);
        }
    },
);

// 换聊天 / 换会话：整份条目被替换（不是流式 push），展开状态全部作废，别让旧 key 碰巧命中新组
watch(
    () => props.entries,
    () => {
        openGroups.clear();
        openIds.clear();
    },
);

/** 组内条目缩进一级（组头下面要能看出从属关系） */
const rowIndentClass = (nested: boolean) => (nested ? 'pl-6' : 'pl-3');
/** 详情块跟着条目一起缩进（工具参数 / 结果那块） */
const detailIndentClass = (nested: boolean) => (nested ? 'pl-[46px]' : 'pl-[34px]');

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

/**
 * markdown 渲染缓存：正文越长，renderAiMarkdown 越贵（整段重新扫描）。
 * 活动条里同一条输出在一次流式响应中会被更新几十上百次，等到终态才渲染一次 markdown，
 * 中途一律按纯文本画（见模板），这样每帧只做一次字符串插值。
 *
 * 完成后的条目也不会变，所以按 text 缓存住：切回聊天重铺历史、展开 / 收起都不重算。
 */
const mdCache = new Map<string, string>();
const MD_CACHE_MAX = 200;

/**
 * 一条输出该不该现在渲染 markdown：
 * - running：不渲染。半截 markdown（未闭合的 ``` / ** ）渲染出来会闪，且每帧都要重算整段；
 * - 完成 / 报错：渲染并缓存，之后只读缓存。
 */
function htmlOf(e: AiActivityEntry): string {
  if (e.status === 'running') return '';
  const hit = mdCache.get(e.text);
  if (hit !== undefined) return hit;
  const html = renderAiMarkdown(e.text);
  if (mdCache.size >= MD_CACHE_MAX) mdCache.delete(mdCache.keys().next().value as string);
  mdCache.set(e.text, html);
  return html;
}

function fmtThought(ms: number): string {
    // 至少 0.1s：思考一闪而过时也别显示「0.0s」
    const ds = Math.max(1, Math.round(ms / 100));
    return ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`;
}

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
            <!-- 跑这一轮：标题行先让给「正在思考」（图标呼吸 + 右侧计时），
                 工具调用不往这里冒，等响应结束标题行再回最新一条 -->
            <ThoughtLine v-if="busy" class="min-w-0 flex-1" :working="true" :label="t('aiActivity.thinking')"
                :done-label="t('aiActivity.thoughtDone')" :font-size="13" :collapsible="false" />
            <template v-else>
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
            </template>
            <button type="button"
                class="-mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200"
                :aria-expanded="expanded" :aria-label="expanded ? t('aiActivity.collapse') : t('aiActivity.expand')"
                @click="toggleExpanded">
                <ChevronDownIcon v-if="expanded" class="h-4 w-4" :stroke-width="2" />
                <ChevronUpIcon v-else class="h-4 w-4" :stroke-width="2" />
            </button>
        </div>

        <!-- 响应结束：思考那一行从标题行**下放**到标题下面这一行（对话记录区最上面），
             收成「已思考 1.2s」并一直留着，不随响应完成消失 -->
        <div v-if="!busy && thoughtDone"
            class="flex items-center gap-2 px-3 pb-1.5 text-[13px] text-gray-700 [transition:opacity_300ms_ease,transform_300ms_ease] starting:-translate-y-1 starting:opacity-0 dark:text-gray-200">
            <ThoughtLine :working="false" :elapsed="thoughtSeconds" :label="t('aiActivity.thinking')"
                :done-label="t('aiActivity.thoughtDone')" :font-size="13" :collapsible="false" />
        </div>

        <!-- 展开：完整输出 / 工具调用链。普通输出文本整段换行；思考与工具调用是折叠条目，点开看详情。
             上下文长了在这一块内部滚动（贴底跟最新一条），审核行留在滚动区外面 -->
        <div v-if="expanded" ref="listRef"
            class="custom-scrollbar max-h-60 overflow-y-auto overscroll-contain border-t border-gray-200/50 py-1 dark:border-gray-700/50">
            <template v-for="row in rows" :key="row.key">
                <!-- 工具调用组头（回答完后收起来的「过程」）：次数 + 工具名摘要 + 失败数，
                     点一下展开成一条条调用；跑的时候不会走到这里（见 groupTools） -->
                <button v-if="row.type === 'group'" type="button"
                    class="group flex w-full cursor-pointer items-center gap-2 py-1.5 pl-3 pr-3 text-left text-[13px] text-gray-500 transition-colors hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5"
                    :aria-expanded="isGroupOpen(row.key)" @click="toggleGroup(row.key)">
                    <span class="grid h-3.5 w-3.5 shrink-0 place-items-center">
                        <WrenchIcon class="h-3.5 w-3.5" :stroke-width="2" />
                    </span>
                    <span class="shrink-0">{{ t('aiActivity.toolGroup', { n: row.items.length }) }}</span>
                    <span class="min-w-0 flex-1 truncate text-[12px] text-gray-400 dark:text-gray-500">
                        {{ groupNames(row.items) }}</span>
                    <span v-if="failureCount(row.items)" class="shrink-0 text-[11px] text-red-500 dark:text-red-400">
                        {{ t('aiActivity.toolGroupFailed', { n: failureCount(row.items) }) }}</span>
                    <ChevronUpIcon v-if="isGroupOpen(row.key)" class="h-3.5 w-3.5 shrink-0" :stroke-width="2" />
                    <ChevronDownIcon v-else class="h-3.5 w-3.5 shrink-0" :stroke-width="2" />
                </button>

                <template v-else>
                    <component :is="canOpen(row.entry) ? 'button' : 'div'" :type="canOpen(row.entry) ? 'button' : undefined"
                        class="group flex w-full gap-2 pr-3 text-left text-[13px] text-gray-500 dark:text-gray-400"
                        :class="[
                            row.entry.kind === 'tool' ? 'items-center' : 'items-start',
                            rowIndentClass(row.nested),
                            rowPadClass(row.entry, row.index),
                            canOpen(row.entry) ? 'cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5' : '',
                        ]"
                        :aria-expanded="canOpen(row.entry) ? isOpen(row.entry.id) : undefined"
                        @click="canOpen(row.entry) && toggleEntry(row.entry.id)">
                        <!-- 图标位：模型输出与用户气泡都不带图标（正文 / 气泡直接占满那行）；
                             可展开的条目鼠标移上来时，原图标换成展开 / 收起箭头 -->
                        <span v-if="row.entry.kind === 'thinking' || row.entry.kind === 'tool'"
                            class="relative grid h-3.5 w-3.5 shrink-0 place-items-center"
                            :class="row.entry.kind === 'tool' ? '' : 'mt-1'">
                            <BrainIcon v-if="row.entry.kind === 'thinking'" class="h-3.5 w-3.5"
                                :class="iconFade(row.entry)" :stroke-width="2" />
                            <WrenchIcon v-else class="h-3.5 w-3.5" :class="iconFade(row.entry)" :stroke-width="2" />
                            <template v-if="canOpen(row.entry)">
                                <ChevronUpIcon v-if="isOpen(row.entry.id)" class="absolute inset-0 h-3.5 w-3.5"
                                    :stroke-width="2" />
                                <ChevronDownIcon v-else
                                    class="absolute inset-0 h-3.5 w-3.5 opacity-0 group-hover:opacity-100"
                                    :stroke-width="2" />
                            </template>
                        </span>
                        <!-- 用户提问：靠右的气泡（跟聊天里自己发的消息一个意思） -->
                        <span v-if="row.entry.kind === 'user'"
                            class="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-2.5 py-1.5 text-gray-900 [background:color-mix(in_srgb,var(--app-brand)_14%,transparent)] dark:text-gray-100">{{ row.entry.text }}</span>
                        <!-- 模型输出：**跑着的时候按纯文本画**（半截 markdown 会闪，且每帧重算整段很贵），
                             完成后再一次性渲染并缓存（见 htmlOf）；思考与工具调用本来就是纯文本 / JSON -->
                        <template v-else-if="row.entry.kind === 'output'">
                            <span v-if="row.entry.status === 'running'"
                                class="min-w-0 flex-1 whitespace-pre-wrap break-words"
                                :class="entryTextClass(row.entry)">{{ row.entry.text }}</span>
                            <span v-else class="min-w-0 flex-1 break-words" :class="entryTextClass(row.entry)"
                                v-html="htmlOf(row.entry)" />
                            <button type="button"
                                class="-mr-1 mt-0.5 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md text-gray-400 opacity-0 transition-opacity hover:bg-black/5 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-white/5 dark:hover:text-gray-200"
                                :aria-label="t('aiActivity.copy')" :title="t('aiActivity.copy')"
                                @click.stop="copyEntry(row.entry)">
                                <CopyIcon class="h-3.5 w-3.5" :stroke-width="2" />
                            </button>
                        </template>
                        <span v-else class="min-w-0 flex-1 truncate" :class="entryTextClass(row.entry)">{{ row.entry.text }}</span>
                        <!-- 思考耗时：这条跑完就一直留着（落盘后重进对话也还在），不是只在顶部闪一下 -->
                        <span v-if="row.entry.kind === 'thinking' && row.entry.thoughtMs"
                            class="mt-1 shrink-0 text-[11px] tabular-nums text-gray-400 dark:text-gray-500">{{ t('aiActivity.thoughtDone') }}
                            {{ fmtThought(row.entry.thoughtMs) }}</span>
                        <span v-if="row.entry.status === 'running'" class="mt-1 shrink-0 text-[11px]">…</span>
                    </component>

                    <!-- 条目详情：思考=完整内容；工具调用=输入（参数）+ 输出（结果） -->
                    <div v-if="canOpen(row.entry) && isOpen(row.entry.id)"
                        class="pr-3 pb-1.5 text-[12px]" :class="detailIndentClass(row.nested)">
                        <div v-if="row.entry.kind === 'thinking'"
                            class="whitespace-pre-wrap break-words border-l-2 border-gray-200 pl-2 leading-5 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            {{ row.entry.text }}
                        </div>
                        <template v-else>
                            <div v-if="row.entry.input" class="mb-1">
                                <p class="text-[11px] text-gray-400">{{ t('aiActivity.input') }}</p>
                                <pre
                                    class="custom-scrollbar mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/5 p-1.5 font-mono text-[11px] leading-4 text-gray-600 dark:bg-white/5 dark:text-gray-300">{{ row.entry.input }}</pre>
                            </div>
                            <div v-if="row.entry.output">
                                <p class="text-[11px] text-gray-400">{{ t('aiActivity.output') }}</p>
                                <pre
                                    class="custom-scrollbar mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/5 p-1.5 font-mono text-[11px] leading-4 text-gray-600 dark:bg-white/5 dark:text-gray-300">{{ row.entry.output }}</pre>
                            </div>
                        </template>
                    </div>
                </template>
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
