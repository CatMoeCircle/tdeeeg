<template>
    <div class="relative">
        <!-- 触发器：外形与设置页的输入框一致，右侧箭头（打开时翻转） -->
        <button ref="triggerEl" type="button" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="open"
            :class="triggerClass" @click="toggle" @keydown.enter.prevent="toggle"
            @keydown.space.prevent="toggle" @keydown.down.prevent="openPanel">
            <span class="min-w-0 flex-1 flex items-center gap-2 truncate">
                <img v-if="current?.icon" :src="current.icon" alt="" class="w-4 h-4 rounded-full shrink-0" />
                <span class="min-w-0 truncate" :class="current ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'">
                    {{ current?.label ?? placeholder }}
                </span>
            </span>
            <span v-if="current?.hint" class="shrink-0 text-[11px] text-gray-400">{{ current.hint }}</span>
            <ChevronDownIcon class="w-4 h-4 shrink-0 text-gray-400 transition-transform duration-150"
                :class="open ? 'rotate-180' : ''" />
        </button>

        <!-- 选项面板：Teleport 到 body + fixed 定位，避免被卡片的 overflow / 滚动容器裁掉 -->
        <Teleport to="body">
            <Transition name="select-menu">
                <div v-if="open" ref="panelEl" class="fixed z-[9999] p-1 overflow-y-auto custom-scrollbar rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-xl shadow-black/10 dark:shadow-black/40"
                    role="listbox" :style="panelStyle" @keydown="onPanelKeydown">
                    <!-- 可搜索：输入即过滤（原 TDesign filterable 的替代） -->
                    <div v-if="filterable" class="sticky top-0 z-1 -m-1 mb-1 p-1 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl">
                        <input ref="searchEl" v-model="query" type="text" spellcheck="false" :placeholder="placeholder"
                            class="w-full px-2 py-1 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400"
                            @keydown.enter.prevent="pickHighlighted" @keydown.esc.prevent="closePanel"
                            @keydown.down.prevent="focusFirstOption" />
                    </div>
                    <button v-for="opt in visibleOptions" :key="opt.value" type="button" role="option" data-option
                        :aria-selected="opt.value === modelValue"
                        class="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors focus:outline-none"
                        :class="opt.value === modelValue
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400 font-medium'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 focus:bg-gray-100 dark:focus:bg-gray-700/60'"
                        @click="pick(opt.value)">
                        <span class="min-w-0 flex-1 flex items-center gap-2">
                            <img v-if="opt.icon" :src="opt.icon" alt="" class="w-4 h-4 rounded-full shrink-0" />
                            <span class="min-w-0 truncate">{{ opt.label }}</span>
                        </span>
                        <span v-if="opt.hint" class="shrink-0 text-[11px] text-gray-400">{{ opt.hint }}</span>
                        <CheckIcon v-if="opt.value === modelValue" class="w-4 h-4 shrink-0" />
                    </button>
                    <p v-if="!visibleOptions.length" class="px-2.5 py-1.5 text-xs text-gray-400">{{ placeholder }}</p>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
/**
 * 设置页的下拉选择框（替代原生 <select>：原生列表样式由系统决定，跟这套毛玻璃 UI 不搭）。
 *
 * - 外观与设置页输入框一致：圆角 + 半透明底 + 聚焦蓝边；
 * - 选项面板 Teleport 到 body 并 fixed 定位：聊天卡片有 overflow-hidden、外层还有滚动容器，
 *   绝对定位的面板会被裁掉；
 * - 键盘可用：Enter / Space / ↓ 打开，↑↓ 移动，Enter 选中，Esc 关闭并回到触发器。
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { Check as CheckIcon, ChevronDown as ChevronDownIcon } from 'lucide-vue-next';

export interface SelectOption {
    value: string;
    label: string;
    /** 右侧小字（如条数 / 模型 id），可空 */
    hint?: string;
    /** 左侧小图标（供应商头像），可空 */
    icon?: string;
}

const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: readonly SelectOption[];
        placeholder?: string;
        disabled?: boolean;
        /** sm = 卡片里的小号控件；md = 主设置区 */
        size?: 'sm' | 'md';
        /** 面板顶部带搜索框，输入即过滤（语言 / 供应商这类长列表用） */
        filterable?: boolean;
    }>(),
    { placeholder: '—', disabled: false, size: 'md', filterable: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref(false);
const triggerEl = ref<HTMLButtonElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
/** 面板位置（打开时按触发器实测位置算一次） */
const anchor = ref({ top: 0, left: 0, width: 0, height: 320 });

const current = computed(() => props.options.find((o) => o.value === props.modelValue));

/** 搜索框：只在 filterable 时渲染 */
const query = ref('');
const searchEl = ref<HTMLInputElement | null>(null);
/** 搜索命中项：按标签 / hint 模糊匹配，忽略大小写 */
const visibleOptions = computed(() => {
    const kw = query.value.trim().toLowerCase();
    if (!kw) return props.options;
    return props.options.filter((o) =>
        o.label.toLowerCase().includes(kw) ||
        o.value.toLowerCase().includes(kw) ||
        (o.hint ? o.hint.toLowerCase().includes(kw) : false),
    );
});

const triggerClass = computed(() => {
    const base =
        'w-full flex items-center gap-2 text-left bg-white/80 dark:bg-gray-900/60 border transition-colors ' +
        'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500/50 ' +
        'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ' +
        'disabled:opacity-50 disabled:cursor-default';
    return props.size === 'sm'
        ? `${base} px-2.5 py-1 rounded-lg text-xs`
        : `${base} px-3 py-2 rounded-xl text-sm`;
});

const panelStyle = computed(() => ({
    top: `${anchor.value.top}px`,
    left: `${anchor.value.left}px`,
    width: `${anchor.value.width}px`,
    maxHeight: `${anchor.value.height}px`,
}));

/** 下拉面板高度上限：可搜索时过滤后条目变少，面板跟着收（但保留一行空提示的空间） */
function measure(): void {
    const el = triggerEl.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    // 下面放不下就翻到上面；两边都不够时取宽松的一侧，面板自身滚动
    const flip = below < 180 && above > below;
    const height = Math.min(320, Math.max(120, flip ? above : below));
    anchor.value = {
        top: flip ? Math.max(8, r.top - 4 - height) : r.bottom + 4,
        left: Math.min(r.left, Math.max(8, window.innerWidth - r.width - 8)),
        width: r.width,
        height,
    };
}

function items(): HTMLButtonElement[] {
    return Array.from(panelEl.value?.querySelectorAll<HTMLButtonElement>('[data-option]') ?? []);
}

function focusSelected(): void {
    const list = items();
    const index = props.options.findIndex((o) => o.value === props.modelValue);
    (list[index >= 0 ? index : 0] ?? list[0])?.focus();
}

async function openPanel(): Promise<void> {
    if (props.disabled || open.value) return;
    // 先量位置再显示：否则首帧会闪一下在左上角
    measure();
    open.value = true;
    query.value = '';
    await nextTick();
    if (props.filterable) searchEl.value?.focus();
    else focusSelected();
    document.addEventListener('mousedown', onDocMouseDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onWindowScroll, true);
}

function detach(): void {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', onWindowScroll, true);
}

function close(): void {
    if (!open.value) return;
    open.value = false;
    detach();
}

function toggle(): void {
    if (open.value) close();
    else void openPanel();
}

function pick(value: string): void {
    emit('update:modelValue', value);
    close();
    triggerEl.value?.focus();
}

/** 搜索框里按 Enter：选中第一个命中项 */
function pickHighlighted(): void {
    const first = visibleOptions.value[0];
    if (first) pick(first.value);
}

/** 搜索框里按 ↓：把焦点交给第一个命中项（之后由面板的方向键接管） */
function focusFirstOption(): void {
    items()[0]?.focus();
}

/** Esc：关面板并把焦点还给触发器 */
function closePanel(): void {
    close();
    triggerEl.value?.focus();
}

function onDocMouseDown(e: MouseEvent): void {
    const target = e.target as Node;
    if (panelEl.value?.contains(target) || triggerEl.value?.contains(target)) return;
    close();
}

/** 页面滚动时关掉：面板是 fixed 定位，跟着滚动会脱离触发器。面板自身滚选项不算 */
function onWindowScroll(e: Event): void {
    const target = e.target;
    if (target instanceof Node && panelEl.value?.contains(target)) return;
    close();
}

function onPanelKeydown(e: KeyboardEvent): void {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        list[Math.min(list.length - 1, index + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        list[Math.max(0, index - 1)]?.focus();
    } else if (e.key === 'Tab') {
        close();
    }
}

onBeforeUnmount(detach);
</script>

<style scoped>
.select-menu-enter-active,
.select-menu-leave-active {
    transition: opacity 0.12s ease, transform 0.12s ease;
}

.select-menu-enter-from,
.select-menu-leave-to {
    opacity: 0;
    transform: translateY(-2px);
}
</style>
