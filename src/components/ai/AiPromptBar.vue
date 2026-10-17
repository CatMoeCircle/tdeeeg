<script setup lang="ts">
/**
 * 聊天内 AI 输入框（Vue Bits PromptBar 的逐段本地移植版）。
 *
 * 主要在下面几处做了本地化，其余（@ 来源菜单 / / 命令菜单 / 附件芯片 / 语音等化条 /
 * 思考等级滑杆 / 画布粒子 / 箭头↔方块形变 / 行高亮滑条 / 各 prop 与事件）与原版一致：
 * - 图标：本地 lucide-vue-next（原版的 @hugeicons 不引入）；行内图标是组件，不再是 icon data。
 * - 模型选择器：改成「供应商头像 + 名称 → 下方列出该供应商的模型」两级结构，
 *   只列出已配置（名称 + URL + Key）且至少添加过一个模型的供应商。
 * - 颜色：默认值改成主题变量（--app-*），画布粒子取当前明暗对应的主题主色；
 *   输入框底色与普通消息输入框（MessageInput）一致：半透明表面色 + backdrop-blur；
 *   所有颜色 prop 仍可外部覆盖，传实色即可（canvas 不认 CSS var）。
 * - 数据源 / 命令 / 思考等级的名称走 i18n；命令名保持 ASCII（与机器人命令一致）。
 * - 思考等级比原版多一档「关闭」（发给 llmsdk 的 none，关掉思考）；档位点改成压在滑块上的小柱子，
 *   档位越高柱子越高，每一档都看得见；拉满时整排淡出，把主角让给粒子。
 * - 数据源：原版那组占位来源（网页搜索 / 销售 / 文档 / 邮件 / 日历）背后没有真东西，已删；
 *   只留本机图片上传，图片随请求发给模型（Rust 侧 ai_chat::to_prompt 读盘转多模态）。
 */
import { computed, onMounted, onUnmounted, ref, watch, type Component, type CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    Check as CheckIcon,
    ChevronDown as ChevronDownIcon,
    CircleQuestionMark as HelpIcon,
    CornerUpLeft as CornerUpLeftIcon,
    File as FileIcon,
    Archive as ArchiveIcon,
    Mic as MicIcon,
    MessageCircle as MessageCircleIcon,
    Paperclip as PaperclipIcon,
    Plus as PlusIcon,
    Sparkles as SparklesIcon,
    X as XIcon,
} from 'lucide-vue-next';
import { animate, motionValue, useReducedMotion, type AnimationPlaybackControls } from 'motion-v';
import { settings } from '../../store/settings';
import { isDark } from '../../store/theme';
import { aiModelGroups, aiModelThinks, aiProviders, loadAiProviders, type AiModelGroup } from '../../store/aiConfig';
import AiContextInfo from './AiContextInfo.vue';
import type { ConversationUsage } from '../../store/aiConversations';

export interface PromptBarSource {
    key: string;
    name: string;
    description?: string;
    icon?: Component;
    /** 附件行：点了走 onAttach */
    attach?: boolean;
}

export interface PromptBarCommand {
    key: string;
    name: string;
    description?: string;
}

/** 模型选择器的一档：供应商（图标 + 名称）+ 它下面的模型；字段与 store 的 AiModelGroup 一致（不另建同名结构） */
export type PromptBarGroup = AiModelGroup;

export interface PromptBarSendDetail {
    attachments: string[];
    model?: { key: string; name: string; tag?: string };
    effort?: string;
    /** 句首的 /命令 key（/菜单插入的裸命令名）；调用方据此给模型追加一段 prompt */
    command?: string;
}

type AttachResult = string | string[] | void | Promise<string | string[] | void>;
type DictateResult = string | void | Promise<string | void>;

interface PromptBarProps {
    placeholder?: string;
    sources?: PromptBarSource[];
    commands?: PromptBarCommand[];
    /** 供应商分组；不传 = 读真实配置（已配置且有模型的供应商） */
    groups?: PromptBarGroup[];
    /** 预览模板的选中项；传了就是纯展示（预览容器 inert），不写设置 */
    selected?: { providerId: string | null; model: string };
    efforts?: string[];
    defaultEffort?: string;
    busy?: boolean;
    /**
     * 归属的聊天 id。传了才在发送键旁边出现「会话管理」按钮（模板预览不传 = 不显示）。
     * 对话跟随这个 chat：同一个聊天共享一组对话。
     */
    chatId?: number;
    /** 会话管理弹窗开关（v-model）；按钮只负责切换 */
    conversationsOpen?: boolean;
    /**
     * AI 模式的引用回复：非空时在输入框顶部显示蓝字占位（点击跳原消息 / × 取消引用）。
     * 只带 chat_id / message_id，正文由调用方交给模型自己用 get_message 取（见 ChatDetail 的 onAiPromptSend）。
     */
    quote?: { name: string } | null;
    /**
     * 当前对话的用量。传了就展示 + 记进对话账目；空 = 还没用过 AI，底部状态行整个不显示。
     */
    usage?: ConversationUsage | null;
    onAttach?: () => AttachResult;
    onDictate?: () => DictateResult;
    background?: string;
    color?: string;
    menuBackground?: string;
    /** 粒子 / 最高档高亮色；空 = 跟随主题主色（canvas 需要实色，这里会自动取当前明暗的主色） */
    sparkColor?: string;
    sparkBoost?: number;
    width?: number;
    radius?: number;
    maxRows?: number;
    morphDuration?: number;
    squash?: number;
    tilt?: number;
    pressScale?: number;
    className?: string;
}

type Row = {
    key: string;
    name: string;
    /** 供应商标题行：不可选 */
    header?: boolean;
    description?: string;
    tag?: string;
    /** 供应商头像地址 */
    avatar?: string;
    /** 行内图标（数据源） */
    icon?: Component;
    attach?: boolean;
    /** 模型行：缩进 */
    nested?: boolean;
};
type Token = { kind: 'at' | 'slash'; query: string; start: number };
type Spark = {
    x: number;
    y: number;
    r: number;
    vy: number;
    sway: number;
    phase: number;
    life: number;
    span: number;
};

const ARROW_UP = [12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
const LINE = 22;
const EDGE = 11;

const MUTED = '[color:color-mix(in_srgb,var(--pb-ink)_55%,transparent)]';
const TOOL_BTN =
    'inline-flex h-7 flex-none cursor-pointer touch-manipulation items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-[12px] font-medium outline-none select-none [color:color-mix(in_srgb,var(--pb-ink)_70%,transparent)] [font:inherit] [-webkit-tap-highlight-color:transparent] [transition:background-color_150ms_ease,color_150ms_ease] data-[on]:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] data-[on]:[color:var(--pb-ink)] data-[max]:[color:var(--pb-spark)]! [@media(hover:hover)_and_(pointer:fine)]:hover:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] [@media(hover:hover)_and_(pointer:fine)]:hover:[color:var(--pb-ink)]';
const ICON_BTN =
    'inline-grid h-7 w-7 flex-none cursor-pointer touch-manipulation place-items-center rounded-lg border-0 bg-transparent p-0 outline-none select-none [color:color-mix(in_srgb,var(--pb-ink)_60%,transparent)] [font:inherit] [-webkit-tap-highlight-color:transparent] [transition:background-color_150ms_ease,color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:[transform:scale(0.94)] data-[on]:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] data-[on]:[color:var(--pb-ink)] motion-reduce:active:[transform:none] [@media(hover:hover)_and_(pointer:fine)]:hover:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] [@media(hover:hover)_and_(pointer:fine)]:hover:[color:var(--pb-ink)]';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pathAt = (a: number[], b: number[], t: number) => {
    let d = '';
    for (let i = 0; i < a.length; i += 2) {
        d += `${i ? 'L' : 'M'}${mix(a[i], b[i], t).toFixed(2)} ${mix(a[i + 1], b[i + 1], t).toFixed(2)}`;
    }
    return `${d}Z`;
};

/**
 * 输入中的 @ / 触发词：原版用 [\w-]*，只认 ASCII——这里放宽到非空白，
 * 否则中文来源名（@文档）打不出来菜单。
 */
const parseToken = (text: string): Token | null => {
    const m = /(^|\s)([@/])([^\s@/]*)$/.exec(text);
    if (!m) return null;
    return { kind: m[2] === '@' ? 'at' : 'slash', query: m[3].toLowerCase(), start: m.index + m[1].length };
};

const props = withDefaults(defineProps<PromptBarProps>(), {
    placeholder: '',
    sources: undefined,
    commands: undefined,
    groups: undefined,
    selected: undefined,
    efforts: undefined,
    defaultEffort: '',
    busy: false,
    chatId: 0,
    conversationsOpen: false,
    usage: null,
    onAttach: undefined,
    onDictate: undefined,
    // 默认值即主题变量：浅色 / 深色随 theme.css 那套 --app-* 自动切换
    // 输入框底色 = 普通输入框那套「表面色 70% + 模糊」，浮层用不透明的抬升色
    background: 'color-mix(in srgb, var(--app-bg-container) 70%, transparent)',
    color: 'var(--app-text-primary)',
    menuBackground: 'var(--app-bg-elevated)',
    sparkColor: '',
    sparkBoost: 1,
    width: 0,
    radius: 0,
    maxRows: 5,
    morphDuration: 240,
    squash: 0.12,
    tilt: 8,
    pressScale: 0.96,
    className: '',
});

const emit = defineEmits<{
    send: [text: string, detail: PromptBarSendDetail];
    stop: [];
    effortChange: [effort: string];
    'update:conversationsOpen': [open: boolean];
    switchMessage: [];
    /** 点击引用占位：跳转到被引用的消息 */
    jumpQuote: [];
    /** 取消引用 */
    removeQuote: [];
}>();

const { t } = useI18n();

/** 数据源（+ 号与 @ 菜单的清单）：只留本机图片上传（其余占位来源没有后端，已删） */
const sourceList = computed<PromptBarSource[]>(() =>
    props.sources ?? [
        { key: 'files', name: t('aiInput.sourceFiles'), description: t('aiInput.sourceFilesDesc'), icon: PaperclipIcon, attach: true },
    ],
);
/** 命令（/ 菜单）：命令名保持 ASCII（机器人命令语义），说明走 i18n */
const commandList = computed<PromptBarCommand[]>(() =>
    props.commands ?? [
        { key: 'summarize', name: '/summarize', description: t('aiInput.commandSummarize') },
        { key: 'compare', name: '/compare', description: t('aiInput.commandCompare') },
        { key: 'draft', name: '/draft', description: t('aiInput.commandDraft') },
        { key: 'explain', name: '/explain', description: t('aiInput.commandExplain') },
        { key: 'tasks', name: '/tasks', description: t('aiInput.commandTasks') },
    ],
);
/** 可选的供应商分组：模板模式用父组件给的示例数据，否则读真实配置 */
const groupList = computed<PromptBarGroup[]>(() => props.groups ?? aiModelGroups());

const reduce = useReducedMotion();
const rootRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const glowRef = ref<HTMLSpanElement | null>(null);
const sparkRef = ref<HTMLCanvasElement | null>(null);
/** 思考等级滑杆的粒子画布（拉满时从左往右飘） */
const effortSparkRef = ref<HTMLCanvasElement | null>(null);
const sendSvg = ref<SVGSVGElement | null>(null);
const sendPath = ref<SVGPathElement | null>(null);
const typing = { energy: 0, strokes: 0 };
/** 行元素表（行高亮滑条按 key 定位；原版按数组下标，这里按 key 以便插入供应商标题行） */
const rowEls = new Map<string, HTMLElement>();
let lastOpen: string | null = null;
let dictation = 0;

/** 当前选中项：模板模式以 props 为准，否则读设置 */
const picked = computed(() => props.selected ?? { providerId: settings.ai.providerId, model: settings.ai.model });
/** 当前选中的供应商 + 模型；供应商 / 模型被删或没选过时为 null（显示「未配置」） */
const current = computed(() => {
    const g = groupList.value.find((x) => x.id === picked.value.providerId);
    const m = g?.models.find((x) => x.id === picked.value.model);
    return g && m ? { group: g, model: m } : null;
});
/**
 * 当前模型会不会思考（判定见 store 的 aiModelThinks）：不会则思考等级整个控件不出现。
 * 拿不到当前模型（没选 / 被删）时不拦。
 */
const canThink = computed(() => !current.value || aiModelThinks(current.value.model.id));
/** 思考等级：关闭（不思考）→ 低 → 最高（最高档用主色 + 粒子）；不会思考的模型没有档位 */
const effortList = computed(() =>
    !canThink.value
        ? []
        : props.efforts ?? [
            t('aiInput.effortOff'),
            t('aiInput.effortLow'),
            t('aiInput.effortMedium'),
            t('aiInput.effortHigh'),
            t('aiInput.effortExtra'),
            t('aiInput.effortMax'),
        ],
);
/** 对外报告 / 发送详情里的模型：供应商 id + 模型 id 组成唯一 key */
const model = computed(() =>
    current.value
        ? {
            key: `${current.value.group.id}/${current.value.model.id}`,
            name: current.value.model.name,
            tag: current.value.group.name,
        }
        : undefined,
);

const draft = ref('');
const attachments = ref<string[]>([]);
const plusOpen = ref(false);
const modelOpen = ref(false);
const effortOpen = ref(false);
const effortIndex = ref(
    (() => {
        const i = effortList.value.indexOf(props.defaultEffort);
        // 没指定档位就用正中间那档：档位表加不加「关闭」都不动默认档（六档 → 高）
        return i >= 0 ? i : Math.floor(effortList.value.length / 2);
    })(),
);
// 换模型会改档位表（不会思考的模型档位表为空）：跟着重挑默认档，免得留在旧下标上
watch(effortList, (list) => {
    const i = list.indexOf(props.defaultEffort);
    effortIndex.value = i >= 0 ? i : Math.floor(list.length / 2);
});
// 换到不会思考的模型时档位表清空：把还开着的档位浮层收掉，别留一个没有按钮的浮层
watch(canThink, (ok) => {
    if (!ok) effortOpen.value = false;
});
const dismissed = ref(false);
const activeKey = ref('');
const listening = ref(false);
const pressed = ref(false);

const token = computed(() => (dismissed.value ? null : parseToken(draft.value)));
const open = computed(() =>
    plusOpen.value ? 'at' : (token.value?.kind ?? (modelOpen.value ? 'model' : effortOpen.value ? 'effort' : null)),
);
const query = computed(() => (plusOpen.value ? '' : (token.value?.query ?? '')));

/** 菜单行：数据源（@ / +）、命令（/）、模型（供应商标题 + 模型） */
const list = computed<Row[]>(() => {
    if (open.value === 'at') {
        return sourceList.value
            .filter((s) => s.name.toLowerCase().includes(query.value))
            .map((s) => ({ key: `s:${s.key}`, name: s.name, description: s.description, icon: s.icon, attach: s.attach }));
    }
    if (open.value === 'slash') {
        return commandList.value
            .filter((c) => c.name.replace(/^\//, '').toLowerCase().startsWith(query.value))
            .map((c) => ({ key: `c:${c.key}`, name: c.name, description: c.description }));
    }
    if (open.value === 'model') {
        const rows: Row[] = [];
        for (const g of groupList.value) {
            rows.push({ key: `g:${g.id}`, name: g.name, header: true, avatar: g.icon, tag: String(g.models.length) });
            for (const m of g.models) {
                rows.push({ key: `m:${g.id}/${m.id}`, name: m.name, nested: true });
            }
        }
        return rows;
    }
    return [];
});
/** 可选行（供应商标题行不参与键盘导航） */
const pickable = computed(() => list.value.filter((r) => !r.header));
const cursor = computed(() => {
    const i = pickable.value.findIndex((r) => r.key === activeKey.value);
    return i < 0 ? 0 : i;
});
const canSend = computed(
    () => draft.value.trim().length > 0 || attachments.value.length > 0 || !!props.quote,
);
const armed = computed(() => props.busy || canSend.value);
const level = computed(() => effortList.value[effortIndex.value] ?? '');
const maxed = computed(() => effortList.value.length > 1 && effortIndex.value === effortList.value.length - 1);
const hasDictate = computed(() => typeof props.onDictate === 'function');
const menuLabel = computed(() =>
    open.value === 'at'
        ? t('aiInput.sourcesTitle')
        : open.value === 'slash'
            ? t('aiInput.commandsTitle')
            : open.value === 'model'
                ? t('aiInput.modelPicker')
                : t('aiInput.effort'),
);

const focusInput = () => inputRef.value?.focus({ preventScroll: true });
const closeMenus = () => {
    plusOpen.value = false;
    modelOpen.value = false;
    effortOpen.value = false;
};

/** 行高亮滑条：跟随 activeKey 对应的行（原版按行下标，逻辑一致） */
watch(
    [open, activeKey, list],
    () => {
        const glow = glowRef.value;
        if (!glow || !open.value) return;
        const row = rowEls.get(activeKey.value);
        if (!row) {
            glow.style.opacity = '0';
            return;
        }
        const fresh = lastOpen !== open.value;
        lastOpen = open.value;
        if (fresh) glow.style.transition = 'none';
        glow.style.top = `${row.offsetTop}px`;
        glow.style.height = `${row.offsetHeight}px`;
        glow.style.opacity = '1';
        if (fresh) {
            void glow.offsetHeight;
            glow.style.transition = '';
        }
    },
    { flush: 'post' },
);
watch(open, (o) => {
    if (!o) lastOpen = null;
});

watch([plusOpen, modelOpen, effortOpen], (_next, _prev, onCleanup) => {
    if (!plusOpen.value && !modelOpen.value && !effortOpen.value) return;
    const onDown = (e: PointerEvent) => {
        if (!rootRef.value?.contains(e.target as Node)) closeMenus();
    };
    document.addEventListener('pointerdown', onDown);
    onCleanup(() => document.removeEventListener('pointerdown', onDown));
});

const fitInput = () => {
    const el = inputRef.value;
    if (!el) return;
    el.style.height = '0px';
    const max = LINE * props.maxRows;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
};
watch([draft, () => props.maxRows], fitInput, { flush: 'post' });

// 发送键形状：motion 值直接写进 svg path（原版一致）
const sendT = motionValue(props.busy ? 1 : 0);
let sendDir = props.busy ? 1 : -1;
let sendControls: AnimationPlaybackControls | null = null;
const sendStart = pathAt(ARROW_UP, SQUARE, sendT.get());
let offSend: (() => void) | undefined;

const syncSend = () => {
    const target = props.busy ? 1 : 0;
    sendDir = props.busy ? 1 : -1;
    if (sendT.get() === target) return;
    sendControls?.stop();
    sendControls = animate(
        sendT,
        target,
        reduce.value ? { duration: 0 } : { duration: props.morphDuration / 1000, ease: EASE_IN_OUT },
    );
};
watch([() => props.busy, () => props.morphDuration, reduce], syncSend);

/** 粒子颜色：canvas 不认 CSS 变量，按当前明暗取主题主色（可用 sparkColor 覆盖） */
const resolvedSparkColor = () =>
    props.sparkColor || (isDark.value ? settings.theme.brandColorDark : settings.theme.brandColorLight) || '#2aabee';

/** 画布粒子：最高档时启动（原版逐段一致；颜色取实色——canvas 不认 CSS 变量） */
let stopSpark: (() => void) | null = null;
const startSpark = () => {
    const canvas = sparkRef.value;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const color = resolvedSparkColor();
    typing.strokes = 0;
    let raf = 0;
    let last = performance.now();
    let w = 0;
    let h = 0;
    let due = 0;
    let speed = 1;
    let pulse = 0;
    const parts: Spark[] = [];
    const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        w = rect.width;
        h = rect.height;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (burst: boolean) => {
        parts.push({
            x: Math.random() * w,
            y: burst ? h * (0.2 + Math.random() * 0.8) : h + 3,
            r: 0.9 + Math.random() * 1.1,
            vy: -(7 + Math.random() * 9),
            sway: (Math.random() - 0.5) * 10,
            phase: Math.random() * Math.PI * 2,
            life: burst ? Math.random() * 1.2 : 0,
            span: 2.4 + Math.random() * 2.4,
        });
    };
    const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const gain = props.sparkBoost;
        typing.energy *= Math.exp(-dt / 0.8);
        pulse *= Math.exp(-dt / 0.16);
        if (typing.strokes > 0) {
            typing.strokes = 0;
            if (gain > 0) pulse = 1;
        }
        const energy = typing.energy * gain;
        speed += (1 + energy * 6 - speed) * (1 - Math.exp(-dt / 0.15));
        due += dt;
        while (due > 0.09) {
            due -= 0.09;
            if (parts.length < 60) spawn(false);
        }
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6 + energy * 10 + pulse * 6;
        for (let i = parts.length - 1; i >= 0; i -= 1) {
            const p = parts[i];
            p.life += dt;
            if (p.life > p.span) {
                parts.splice(i, 1);
                continue;
            }
            const k = p.life / p.span;
            const twinkle = 0.7 + 0.3 * Math.sin((now / 160) * (1 + energy) + p.phase);
            p.y += p.vy * dt * speed;
            if (p.y < -4) {
                p.y = h + 3;
                p.x = Math.random() * w;
            }
            const edge = Math.min(1, Math.max(0, p.y / 14), Math.max(0, (h - p.y) / 14));
            ctx.globalAlpha = Math.min(1, Math.sin(k * Math.PI) * (0.9 + energy * 0.25) * twinkle) * edge;
            ctx.beginPath();
            ctx.arc(
                p.x + Math.sin((now / 900) * (1 + energy * 0.8) + p.phase) * p.sway,
                p.y,
                p.r * twinkle * (1 + energy * 0.35),
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
        raf = requestAnimationFrame(tick);
    };
    resize();
    for (let i = 0; i < 44; i += 1) spawn(true);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(tick);
    return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        ctx.clearRect(0, 0, w, h);
    };
};
const syncSpark = () => {
    stopSpark?.();
    stopSpark = null;
    if (!maxed.value || reduce.value) return;
    stopSpark = startSpark();
};
watch([maxed, reduce, () => props.sparkColor], syncSpark, { flush: 'post' });

/**
 * 思考等级滑杆的粒子：拉满时在进度条上从左往右飘（与输入框那套同一配色，方向改成水平）。
 * 画布只在浮层展开时存在，所以也要跟着 open === 'effort' 重启。
 */
type DriftSpark = { x: number; y: number; r: number; vx: number; phase: number };
let stopEffortSpark: (() => void) | null = null;
const startEffortSpark = () => {
    const canvas = effortSparkRef.value;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const color = resolvedSparkColor();
    let raf = 0;
    let last = performance.now();
    let w = 0;
    let h = 0;
    let due = 0;
    const parts: DriftSpark[] = [];
    const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        w = rect.width;
        h = rect.height;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    /** 出生点：spread = 初次铺满整条（否则从最左进场） */
    const spawn = (spread: boolean) => {
        parts.push({
            x: spread ? Math.random() * w : -2,
            y: 2 + Math.random() * Math.max(1, h - 4),
            r: 0.8 + Math.random() * 1.1,
            vx: 40 + Math.random() * 45,
            phase: Math.random() * Math.PI * 2,
        });
    };
    const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        due += dt;
        while (due > 0.07) {
            due -= 0.07;
            if (parts.length < 46) spawn(false);
        }
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        for (const p of parts) {
            p.x += p.vx * dt;
            if (p.x > w + 4) {
                // 飘出右端 → 从左侧重新进场，形成连续流
                p.x = -2;
                p.y = 2 + Math.random() * Math.max(1, h - 4);
            }
            // 位置决定明暗：两端淡入淡出，中间最亮
            const k = Math.min(1, Math.max(0, (p.x + 2) / (w + 4)));
            const twinkle = 0.7 + 0.3 * Math.sin(now / 150 + p.phase);
            // 上下边缘淡出，避免粒子贴着描边硬切
            const edge = Math.min(1, Math.max(0, p.y / 5), Math.max(0, (h - p.y) / 5));
            ctx.globalAlpha = Math.min(1, Math.sin(k * Math.PI) * twinkle) * edge;
            ctx.beginPath();
            ctx.arc(p.x, p.y + Math.sin(now / 700 + p.phase) * 1.2, p.r * twinkle, 0, Math.PI * 2);
            ctx.fill();
        }
        raf = requestAnimationFrame(tick);
    };
    resize();
    for (let i = 0; i < 18; i += 1) spawn(true);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(tick);
    return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        ctx.clearRect(0, 0, w, h);
    };
};
const syncEffortSpark = () => {
    stopEffortSpark?.();
    stopEffortSpark = null;
    if (!maxed.value || reduce.value || open.value !== 'effort') return;
    stopEffortSpark = startEffortSpark();
};
watch([maxed, reduce, open, () => props.sparkColor], syncEffortSpark, { flush: 'post' });

onMounted(() => {
    // 模板模式（groups 由父组件给）不读真实配置，也就没必要拉供应商列表
    if (!props.groups && !aiProviders.loaded) void loadAiProviders();
    offSend = sendT.on('change', (v) => {
        sendPath.value?.setAttribute('d', pathAt(ARROW_UP, SQUARE, v));
        const goo = reduce.value ? 0 : Math.sin(v * Math.PI);
        const sx = 1 - props.squash * goo;
        if (sendSvg.value) {
            sendSvg.value.style.transform = goo ? `rotate(${sendDir * props.tilt * goo}deg) scale(${sx}, ${1 / sx})` : '';
        }
    });
    fitInput();
    syncSpark();
    syncEffortSpark();
});
onUnmounted(() => {
    dictation += 1;
    stopSpark?.();
    stopEffortSpark?.();
    offSend?.();
    sendControls?.stop();
});

/* ===== 思考等级滑杆 ===== */

const setEffort = (i: number) => {
    const next = Math.max(0, Math.min(effortList.value.length - 1, i));
    if (next === effortIndex.value) return;
    effortIndex.value = next;
    emit('effortChange', effortList.value[next]);
};
const effortFromPointer = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const k = (e.clientX - rect.left - EDGE) / Math.max(1, rect.width - 2 * EDGE);
    setEffort(Math.round(k * (effortList.value.length - 1)));
};
const onEffortDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    try {
        el.setPointerCapture(e.pointerId);
    } catch {
        // 捕获不可用（触屏等）：忽略，仍按坐标定位
    }
    el.focus({ preventScroll: true });
    effortFromPointer(e);
};
const onEffortMove = (e: PointerEvent) => {
    if (e.buttons & 1) effortFromPointer(e);
};
const onEffortKey = (e: KeyboardEvent) => {
    const step =
        e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (step) {
        e.preventDefault();
        setEffort(effortIndex.value + step);
    } else if (e.key === 'Home') {
        e.preventDefault();
        setEffort(0);
    } else if (e.key === 'End') {
        e.preventDefault();
        setEffort(effortList.value.length - 1);
    } else if (e.key === 'Escape') {
        effortOpen.value = false;
        focusInput();
    }
};
const stepAt = (i: number) =>
    `calc(${EDGE}px + (100% - ${EDGE * 2}px) * ${i / Math.max(1, effortList.value.length - 1)})`;
const fillAt = (i: number) => (i === effortList.value.length - 1 ? '100%' : `calc(${stepAt(i)} + 7px)`);
const effortStyle = computed(
    () =>
        ({
            '--pb-effort-x': stepAt(effortIndex.value),
            '--pb-effort-fill': fillAt(effortIndex.value),
        }) as CSSProperties,
);

/* ===== 选择行 ===== */

const setRowRef = (key: string, el: unknown) => {
    if (el) rowEls.set(key, el as HTMLElement);
    else rowEls.delete(key);
};

/** 当前选中的模型行 key（模板模式看 props，否则看设置） */
const currentRowKey = computed(() => (current.value ? `m:${current.value.group.id}/${current.value.model.id}` : ''));

const pick = (row: Row) => {
    if (open.value === 'model') {
        if (props.selected) return; // 模板模式：纯展示，不写设置
        const [groupId, modelId] = row.key.slice(2).split('/');
        settings.ai.providerId = groupId;
        settings.ai.model = modelId;
        modelOpen.value = false;
        focusInput();
        return;
    }
    const head = token.value ? draft.value.slice(0, token.value.start) : draft.value;
    if (row.attach) {
        draft.value = head;
        Promise.resolve(props.onAttach?.()).then((files) => {
            if (!files) return;
            attachments.value = [...attachments.value, ...(Array.isArray(files) ? files : [files])];
        });
    } else if (open.value === 'at') {
        draft.value = `${head}@${row.name} `;
    } else {
        draft.value = `${head}${row.name} `;
    }
    plusOpen.value = false;
    dismissed.value = false;
    focusInput();
};

const send = () => {
    if (!canSend.value || props.busy) return;
    // 句首的 /菜单命令只当 key 传出去，正文仍原样发：怎么理解由 aiChat 的 COMMAND_PROMPTS 决定
    const head = draft.value.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const command = commandList.value.find((c) => c.name.toLowerCase() === head)?.key;
    emit('send', draft.value.trim(), {
        attachments: attachments.value,
        model: model.value,
        effort: level.value,
        command,
    });
    draft.value = '';
    attachments.value = [];
    dismissed.value = false;
    closeMenus();
    focusInput();
};

const toggleListen = () => {
    if (listening.value) {
        dictation += 1;
        listening.value = false;
        return;
    }
    const seq = ++dictation;
    listening.value = true;
    Promise.resolve(props.onDictate?.()).then(
        (text) => {
            if (seq !== dictation) return;
            listening.value = false;
            if (text) draft.value = draft.value.trim() ? `${draft.value.trimEnd()} ${text}` : text;
            focusInput();
        },
        () => {
            if (seq === dictation) listening.value = false;
        },
    );
};

const onInput = (e: Event) => {
    draft.value = (e.target as HTMLTextAreaElement).value;
    typing.energy = Math.min(1.6, typing.energy + 0.22);
    typing.strokes = Math.min(4, typing.strokes + 1);
    dismissed.value = false;
    closeMenus();
    activeKey.value = pickable.value[0]?.key ?? '';
};

const onKeyDown = (e: KeyboardEvent) => {
    if (open.value && list.value.length && pickable.value.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const rows = pickable.value;
            const i = cursor.value;
            const next = (i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
            activeKey.value = rows[next].key;
            return;
        }
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
            e.preventDefault();
            pick(pickable.value[cursor.value]);
            return;
        }
    }
    if (e.key === 'Escape') {
        if (open.value) {
            e.preventDefault();
            dismissed.value = true;
            closeMenus();
        }
        return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
    }
};

/** 芯片 / aria-label 只显示文件名（完整路径会把芯片撑满） */
const baseName = (path: string) => path.replace(/\\/g, '/').split('/').pop() || path;

const toggleSources = () => {
    modelOpen.value = false;
    effortOpen.value = false;
    activeKey.value = pickable.value[0]?.key ?? '';
    plusOpen.value = !plusOpen.value;
    if (plusOpen.value) activeKey.value = `s:${sourceList.value[0]?.key ?? ''}`;
    focusInput();
};
const toggleModels = () => {
    plusOpen.value = false;
    effortOpen.value = false;
    activeKey.value = currentRowKey.value || list.value.find((r) => !r.header)?.key || '';
    modelOpen.value = !modelOpen.value;
    focusInput();
};
const toggleEffort = () => {
    if (!canThink.value) return;
    plusOpen.value = false;
    modelOpen.value = false;
    effortOpen.value = !effortOpen.value;
    focusInput();
};
const onSendClick = () => {
    if (props.busy) emit('stop');
    else send();
};
const onBoxDown = (e: PointerEvent) => {
    if (e.target === e.currentTarget || e.target === inputRef.value) closeMenus();
};
const down = (e: PointerEvent) => {
    if (e.button !== 0 || !armed.value) return;
    pressed.value = true;
};
const up = () => (pressed.value = false);

const rootStyle = computed(
    () =>
        ({
            '--pb-bg': props.background,
            '--pb-ink': props.color,
            '--pb-menu': props.menuBackground,
            // 宽度 / 圆角沿用原版语义：0 = 跟随容器（聊天里占满、设置页预览自适应）
            '--pb-w': props.width > 0 ? `${props.width}px` : '100%',
            '--pb-radius': props.radius > 0 ? `${props.radius}px` : 'var(--app-radius-xl)',
            '--pb-spark': props.sparkColor || 'var(--app-brand)',
            '--pb-press': props.pressScale,
        }) as CSSProperties,
);

defineExpose({ focusInput });
</script>

<template>
    <div ref="rootRef" class="group relative [color:var(--pb-ink)] [width:min(var(--pb-w),100%)] text-[14px] leading-[22px]"
        :class="className" :data-busy="busy ? '' : undefined" :data-max="maxed ? '' : undefined" :style="rootStyle">
        <!-- ===== 浮层：数据源/命令/模型 与 思考等级 ===== -->
        <div v-if="open"
            class="data-[kind=effort]:right-auto data-[kind=model]:right-auto bottom-[calc(100%+8px)] z-[2] absolute inset-x-0 max-h-72 overflow-y-auto custom-scrollbar shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.08)] p-1 border border-black/5 dark:border-white/10 data-[kind=effort]:px-3.5 data-[kind=effort]:pt-3 [background:var(--pb-menu)] data-[kind=effort]:pb-3.5 rounded-xl data-[kind=effort]:w-[248px] data-[kind=effort]:max-h-none data-[kind=effort]:overflow-visible data-[kind=model]:w-[280px] origin-bottom data-[kind=effort]:origin-bottom-left data-[kind=model]:origin-bottom-left [animation:prompt-bar-pop_180ms_cubic-bezier(0.23,1,0.32,1)_both] motion-reduce:[animation:none]"
            :role="open === 'effort' ? 'dialog' : 'listbox'" :aria-label="menuLabel" :data-kind="open">
            <!-- 思考等级：更快 ←→ 更聪明 + 档位滑杆 -->
            <template v-if="open === 'effort'">
                <div class="flex items-center gap-2 text-[13px] leading-[18px]">
                    <span :class="MUTED">{{ t('aiInput.effort') }}</span>
                    <!-- 当前档位：小胶囊；最高档跟粒子一个主色 -->
                    <span
                        class="inline-flex h-5 items-center px-1.5 rounded-md text-[12px] font-medium [transition:background-color_220ms_ease,color_220ms_ease]"
                        :class="maxed
                            ? '[background:color-mix(in_srgb,var(--pb-spark)_18%,transparent)] [color:var(--pb-spark)]'
                            : '[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)]'">{{ level }}</span>
                    <span class="inline-flex ml-auto" :class="MUTED" :title="t('aiInput.effortHint')">
                        <HelpIcon class="w-3.5 h-3.5" :stroke-width="1.8" />
                    </span>
                </div>
                <div class="flex justify-between mt-3 text-[12px] leading-4" :class="MUTED">
                    <span>{{ t('aiInput.effortFaster') }}</span>
                    <span>{{ t('aiInput.effortSmarter') }}</span>
                </div>
                <div class="relative mt-2 [background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] rounded-[11px] outline-none h-[22px] touch-none cursor-pointer select-none focus-visible:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--pb-spark)_40%,transparent)]"
                    role="slider" tabindex="0" :aria-label="t('aiInput.effort')" :aria-valuemin="0"
                    :aria-valuemax="effortList.length - 1" :aria-valuenow="effortIndex" :aria-valuetext="level"
                    :style="effortStyle" @pointerdown="onEffortDown" @pointermove="onEffortMove"
                    @keydown="onEffortKey">
                    <span
                        class="left-0 absolute inset-y-0 [background:color-mix(in_srgb,var(--pb-ink)_18%,transparent)] [width:var(--pb-effort-fill)] group-data-[max]:[background:color-mix(in_srgb,var(--pb-spark)_35%,transparent)] rounded-[11px] motion-reduce:[transition:background-color_300ms_ease] [transition:width_220ms_cubic-bezier(0.23,1,0.32,1),background-color_300ms_ease]" />
                    <!-- 拉满时进度条上的左→右粒子 -->
                    <canvas ref="effortSparkRef"
                        class="absolute inset-0 pointer-events-none rounded-[11px] w-full h-full"
                        aria-hidden="true" />
                    <span
                        class="-top-[3px] absolute shadow-[0_2px_6px_rgba(0,0,0,0.25)] -ml-[7px] [background:var(--pb-ink)] [left:var(--pb-effort-x)] group-data-[max]:[background:var(--pb-spark)] rounded-[7px] w-3.5 h-7 motion-reduce:[transition:background-color_300ms_ease] [transition:left_220ms_cubic-bezier(0.23,1,0.32,1),background-color_300ms_ease]" />
                    <!-- 挡位点：一档一根小柱子（档位越高越高），画在滑块之上，所以每一档都看得见；
                         拉满时整排淡出，把主角让给粒子 -->
                    <div class="inset-0 absolute pointer-events-none [transition:opacity_260ms_ease] group-data-[max]:opacity-0"
                        aria-hidden="true">
                        <i v-for="(name, i) in effortList" :key="name"
                            class="top-1/2 absolute -translate-x-1/2 -translate-y-1/2 rounded-full w-[3px] [transition:height_220ms_cubic-bezier(0.23,1,0.32,1),background-color_220ms_ease]"
                            :class="i === effortIndex
                                ? '[background:var(--pb-menu)]'
                                : '[background:color-mix(in_srgb,var(--pb-ink)_30%,transparent)]'"
                            :style="{ left: stepAt(i), height: `${6 + i * 2}px` }" />
                    </div>
                </div>
            </template>

            <!-- 数据源 / 命令 / 模型 -->
            <template v-else>
                <span ref="glowRef"
                    class="absolute inset-x-1 opacity-0 [background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] rounded-lg pointer-events-none motion-reduce:[transition:opacity_150ms_ease] [transition:top_220ms_cubic-bezier(0.23,1,0.32,1),height_220ms_cubic-bezier(0.23,1,0.32,1),opacity_150ms_ease]"
                    aria-hidden="true" />
                <template v-for="row in list" :key="row.key">
                    <!-- 供应商标题行：头像 + 名称 + 模型数（不可选） -->
                    <div v-if="row.header" role="presentation"
                        class="flex items-center gap-2 px-2 pt-2 pb-1 text-[11px] [color:color-mix(in_srgb,var(--pb-ink)_55%,transparent)]">
                        <img v-if="row.avatar" :src="row.avatar" alt="" class="w-4 h-4 rounded-full shrink-0" />
                        <span v-else
                            class="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold [background:color-mix(in_srgb,var(--pb-ink)_12%,transparent)]">{{
                                row.name[0]?.toUpperCase() }}</span>
                        <span class="truncate font-medium">{{ row.name }}</span>
                        <span class="ml-auto shrink-0">{{ t('aiSettings.modelCount', { count: Number(row.tag) }) }}</span>
                    </div>
                    <button v-else type="button" role="option" :ref="(el) => setRowRef(row.key, el)"
                        :aria-selected="row.key === activeKey"
                        class="z-[1] relative flex items-center gap-2.5 bg-transparent px-2 border-0 rounded-lg outline-none w-full h-9 text-inherit text-left cursor-pointer [font:inherit] [-webkit-tap-highlight-color:transparent]"
                        :class="row.nested ? 'pl-8' : ''" @mousedown.prevent @pointerenter="activeKey = row.key"
                        @click="pick(row)">
                        <img v-if="row.avatar" :src="row.avatar" alt="" class="w-5 h-5 rounded-full shrink-0" />
                        <span v-else-if="row.icon"
                            class="inline-flex flex-none justify-center [color:color-mix(in_srgb,var(--pb-ink)_70%,transparent)] w-5">
                            <component :is="row.icon" class="w-[15px] h-[15px]" :stroke-width="1.8" />
                        </span>
                        <span class="flex-none font-medium text-[13px]">{{ row.name }}</span>
                        <span v-if="row.description" class="flex-auto min-w-0 text-[12px] truncate" :class="MUTED">
                            {{ row.description }}
                        </span>
                        <span v-if="open === 'model' && !row.nested"
                            class="flex-none ml-auto text-[11px]" :class="MUTED">{{ row.tag }}</span>
                        <span v-if="row.key === currentRowKey"
                            class="inline-flex flex-none justify-center w-4">
                            <CheckIcon class="w-3.5 h-3.5" :stroke-width="2.5" />
                        </span>
                    </button>
                </template>
                <div v-if="list.length === 0 || pickable.length === 0"
                    class="flex items-center px-2 h-9 text-[12px]" :class="MUTED">
                    {{ open === 'model' ? t('aiInput.noModels') : t('aiInput.noMatches', { query }) }}
                </div>
            </template>
        </div>

        <div class="before:-z-10 isolate before:absolute relative before:inset-0 flex flex-col gap-2 px-3 pt-3 pb-2 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50 data-[max]:before:opacity-100 before:opacity-0 [background:var(--pb-bg)] [border-radius:var(--pb-radius)] before:[background:linear-gradient(to_top,color-mix(in_srgb,var(--pb-spark)_14%,transparent),transparent_62%)] before:rounded-[inherit] before:content-[''] cursor-text before:pointer-events-none before:[transition:opacity_500ms_ease]"
            role="presentation" :data-max="maxed ? '' : undefined" @pointerdown="onBoxDown" @click="focusInput">
            <canvas ref="sparkRef" class="-z-10 absolute inset-0 rounded-[inherit] w-full h-full pointer-events-none"
                aria-hidden="true" />
            <!-- 引用回复占位：蓝字，点击跳原消息 / × 取消引用 -->
            <div v-if="quote || attachments.length > 0" class="flex flex-wrap gap-1.5">
                <span v-if="quote"
                    class="inline-flex items-center gap-1.5 pr-1 [background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] pl-2 rounded-lg h-[26px] text-[12px] motion-reduce:[animation:none] [animation:prompt-bar-pop_200ms_cubic-bezier(0.23,1,0.32,1)_both]">
                    <CornerUpLeftIcon class="w-3 h-3 shrink-0 text-blue-500 dark:text-blue-400" :stroke-width="2" />
                    <button type="button"
                        class="bg-transparent max-w-[200px] truncate border-0 cursor-pointer p-0 text-left text-[12px] font-medium text-blue-500 dark:text-blue-400 [font:inherit] hover:underline"
                        :title="t('content.jumpToSource')" :aria-label="t('content.jumpToSource')"
                        @click.stop="emit('jumpQuote')">
                        {{ t('aiInput.replyToken') }} {{ quote.name }}
                    </button>
                    <button type="button"
                        class="inline-grid place-items-center bg-transparent opacity-60 hover:opacity-100 p-0 hover:[background:color-mix(in_srgb,var(--pb-ink)_10%,transparent)] border-0 rounded-[5px] outline-none w-[18px] h-[18px] text-inherit cursor-pointer [transition:opacity_120ms_ease,background-color_120ms_ease]"
                        :aria-label="t('aiInput.removeAttachment', { file: t('aiInput.replyToken') })"
                        @click.stop="emit('removeQuote')">
                        <XIcon class="w-2.5 h-2.5" :stroke-width="2.5" />
                    </button>
                </span>
                <!-- 附件芯片 -->
                <span v-for="(file, i) in attachments" :key="`${file}-${i}`"
                    class="inline-flex items-center gap-1.5 pr-1 [background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] pl-2 rounded-lg h-[26px] text-[12px] motion-reduce:[animation:none] [animation:prompt-bar-pop_200ms_cubic-bezier(0.23,1,0.32,1)_both]">
                    <FileIcon class="w-3 h-3 shrink-0" :stroke-width="2" />
                    <span class="max-w-[144px] truncate">{{ baseName(file) }}</span>
                    <button type="button"
                        class="inline-grid place-items-center bg-transparent opacity-60 hover:opacity-100 p-0 hover:[background:color-mix(in_srgb,var(--pb-ink)_10%,transparent)] border-0 rounded-[5px] outline-none w-[18px] h-[18px] text-inherit cursor-pointer [transition:opacity_120ms_ease,background-color_120ms_ease]"
                        :aria-label="t('aiInput.removeAttachment', { file: baseName(file) })"
                        @click="attachments = attachments.filter((_, j) => j !== i)">
                        <XIcon class="w-2.5 h-2.5" :stroke-width="2.5" />
                    </button>
                </span>
            </div>

            <textarea ref="inputRef"
                class="block bg-transparent p-0 placeholder:[color:color-mix(in_srgb,var(--pb-ink)_45%,transparent)] border-0 outline-none w-full text-[14px] text-inherit [@media(pointer:coarse)]:text-[16px] leading-[22px] resize-none [font:inherit] [overflow-wrap:anywhere]"
                rows="1" :value="draft" :placeholder="listening ? t('aiInput.listening') : (placeholder || t('aiInput.placeholder'))"
                :aria-label="t('aiInput.placeholder')" @input="onInput" @focus="closeMenus" @keydown="onKeyDown" />

            <div class="flex items-center gap-1">
                <button type="button" :class="ICON_BTN" :aria-label="t('aiInput.addFiles')"
                    :aria-expanded="plusOpen" :data-on="plusOpen ? '' : undefined" @mousedown.prevent
                    @click="toggleSources">
                    <PlusIcon class="w-4 h-4" :stroke-width="2" />
                </button>
                <!-- 模型：供应商头像 + 名称；没有任何可用供应商时只说明未配置 -->
                <button v-if="groupList.length" type="button" :class="TOOL_BTN" :aria-label="t('aiInput.modelPicker')"
                    :aria-expanded="modelOpen" :data-on="modelOpen ? '' : undefined" @mousedown.prevent
                    @click="toggleModels">
                    <img v-if="current?.group.icon" :src="current.group.icon" alt=""
                        class="w-4 h-4 rounded-full shrink-0" />
                    <span v-else-if="current"
                        class="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold [background:color-mix(in_srgb,var(--pb-ink)_12%,transparent)]">{{
                            current.group.name[0]?.toUpperCase() }}</span>
                    <span class="max-w-40 truncate">{{ current ? current.model.name : t('aiSettings.unconfigured') }}</span>
                    <ChevronDownIcon class="w-3 h-3 shrink-0" :stroke-width="2.4" />
                </button>
                <span v-else class="inline-flex h-7 items-center px-1.5 text-[12px]" :class="MUTED"
                    :title="t('aiInput.noModels')">{{ t('aiSettings.unconfigured') }}</span>
                <!-- 思考等级：只在选中的模型会思考时出现（不会思考的模型连档位都不发，见 aiModelThinks） -->
                <button v-if="canThink" type="button" :class="TOOL_BTN" :aria-label="t('aiInput.effort')" :aria-expanded="effortOpen"
                    :data-on="effortOpen ? '' : undefined" :data-max="maxed ? '' : undefined" @mousedown.prevent
                    @click="toggleEffort">
                    <SparklesIcon class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
                    <span>{{ level }}</span>
                    <ChevronDownIcon class="w-3 h-3 shrink-0" :stroke-width="2.4" />
                </button>
                <span class="flex-auto" />
                <!-- 切回普通消息输入框（首次切到 AI 输入框后才会出现，见 settings.ai.switchButton） -->
                <button v-if="settings.ai.switchButton" type="button" :class="ICON_BTN"
                    :aria-label="t('aiInput.switchToMessage')"
                    :title="t('aiInput.switchToMessage')" @mousedown.prevent @click="emit('switchMessage')">
                    <MessageCircleIcon class="w-4 h-4 shrink-0" :stroke-width="2" />
                </button>
                <!-- 会话管理：只在聊天里出现（模板预览没传 chatId）；对话跟随当前聊天 -->
                <button v-if="chatId" type="button" :class="TOOL_BTN" :aria-expanded="conversationsOpen"
                    :data-on="conversationsOpen ? '' : undefined" :title="t('aiConversations.title')"
                    @mousedown.prevent @click="emit('update:conversationsOpen', !conversationsOpen)">
                    <ArchiveIcon class="w-4 h-4 shrink-0" :stroke-width="2" />
                </button>
                <!-- 语音（未接 onDictate 时与原版一致：不显示） -->
                <button v-if="hasDictate" type="button" :class="ICON_BTN"
                    :aria-label="listening ? t('aiInput.stopDictate') : t('aiInput.dictate')"
                    :aria-pressed="listening" :data-on="listening ? '' : undefined" @mousedown.prevent
                    @click="toggleListen">
                    <span v-if="listening"
                        class="[&>i]:block flex items-center gap-[2.5px] [&>i]:bg-current [&>i]:rounded-full [&>i]:w-[2.5px] h-3.5 [&>i]:h-full [&>i]:origin-center [&>i]:[animation:prompt-bar-eq_900ms_ease-in-out_infinite] [&>i:nth-child(2)]:[animation-delay:150ms] [&>i:nth-child(3)]:[animation-delay:300ms]"
                        aria-hidden="true">
                        <i />
                        <i />
                        <i />
                    </span>
                    <MicIcon v-else class="w-[15px] h-[15px]" :stroke-width="2" />
                </button>
                <button type="button"
                    class="inline-grid relative flex-none place-items-center p-0 border-0 rounded-full outline-none w-7 h-7 touch-manipulation cursor-pointer disabled:[opacity:0.55] disabled:cursor-default select-none [background:var(--app-brand)] [color:#fff] [box-shadow:0_1px_6px_color-mix(in_srgb,var(--app-brand)_45%,transparent)] data-[pressed]:[transform:scale(var(--pb-press))] motion-reduce:data-[pressed]:[transform:none] [font:inherit] [-webkit-tap-highlight-color:transparent] [transition:background-color_200ms_ease,color_200ms_ease,box-shadow_200ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)]"
                    :disabled="!armed" :aria-label="busy ? t('aiInput.stop') : t('aiInput.send')"
                    :data-armed="armed ? '' : undefined" :data-pressed="pressed ? '' : undefined"
                    @mousedown.prevent @pointerdown="down" @pointerup="up" @pointercancel="up" @pointerleave="up"
                    @click="onSendClick">
                    <svg ref="sendSvg" class="block w-4 h-4 origin-center" viewBox="0 0 24 24" aria-hidden="true"
                        fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                        <path ref="sendPath" :d="sendStart" />
                    </svg>
                </button>
            </div>
        </div>

        <!-- 底部状态：上下文占用 + 输入 / 输出 / 缓存命中率 + 请求次数。
             放在**输入框外面**（卡片下方的状态行，跟 DSH 一样）；有会话就渲染（一次都没发就先显示 0） -->
        <AiContextInfo v-if="usage" :usage="usage" muted />
    </div>
</template>

<style>
@keyframes prompt-bar-pop {
    from {
        opacity: 0;
        transform: translateY(4px) scale(0.98);
    }
}

@keyframes prompt-bar-eq {

    0%,
    100% {
        transform: scaleY(0.35);
    }

    50% {
        transform: scaleY(1);
    }
}
</style>
