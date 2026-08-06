<script setup lang="ts">
/**
 * SlidingTabBar —— 通用分组/标签栏组件
 *
 * 可复用于「对话列表分组栏」与「设置-分组文件夹样式预览」。
 * 它统一处理：
 *   - 标签的横向滚动布局
 *   - 激活标签的追踪（v 选中态）
 *   - tabs 样式下滑动小蓝条（先移动后定宽的自然过渡，避免宽度抖动）
 *   - 激活标签滚动进可视区
 *   - 容器尺寸变化时重算滑动条
 *
 * 使用方式（内容用默认插槽自定义，作用域参数 { tab, active }）：
 *   <SlidingTabBar v-model:active-id="activeTab" :tabs="tabs"
 *       :variant="settings.folderStyle" :tab-class="tabClassFn"
 *       :container-class="containerClassFn" @select="onSelect">
 *     <template #default="{ tab, active }">
 *       ...标签内容...
 *     </template>
 *   </SlidingTabBar>
 */
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue';

// ---- 类型 ----
interface TabItem {
    /** 标签唯一标识 */
    id: string;
    /** 允许携带额外的业务字段（如 name、formattedName 等），由插槽消费 */
    [key: string]: any;
}

const props = withDefaults(defineProps<{
    /** 标签列表 */
    tabs: TabItem[];
    /** 当前激活标签 id（v-model:active-id） */
    activeId: string;
    /** 样式变体：tabs=底部滑动条，pills=胶囊，text=纯文本 */
    variant?: 'tabs' | 'pills' | 'text';
    /** 每个标签按钮的类（需根据 active 决定），由调用方传入以复用现有样式 */
    tabClass?: (id: string, active: boolean) => string;
    /** 容器额外类（覆盖默认的变体布局类） */
    containerClass?: string;
    /** 是否显示 tabs 样式的滑动小蓝条 */
    showIndicator?: boolean;
}>(), {
    variant: 'tabs',
    tabClass: undefined,
    containerClass: undefined,
    showIndicator: true,
});

const emit = defineEmits<{
    (e: 'select', id: string): void;
    (e: 'update:activeId', id: string): void;
}>();

const isTabs = computed(() => props.variant === 'tabs');

/** 容器布局类：变体基础布局 + 调用方附加类 */
const containerClass = computed(() => {
    const base = props.variant === 'pills' ? 'flex gap-2' : (props.variant === 'text' ? 'flex gap-3' : 'flex gap-2');
    return props.containerClass ? `${base} ${props.containerClass}` : base;
});

// ---- 滑动小蓝条 ----
const tabRefs = ref<HTMLElement[]>([]);
const indicatorStyle = ref<Record<string, string>>({});

const container = ref<HTMLElement | null>(null);

function setTabRef(el: any) {
    if (el) tabRefs.value.push(el as HTMLElement);
}

/** 计算滑动条位置/宽度 */
function updateIndicator() {
    if (!isTabs.value) return;
    const el = tabRefs.value?.find(t => t.dataset.tabId === props.activeId)
        || tabRefs.value?.[0];
    if (!el || !container.value) return;
    indicatorStyle.value = {
        left: `${el.offsetLeft}px`,
        width: `${el.offsetWidth}px`,
        // left 先滑动，width 延迟展开 → 移动动画更自然、不抖动
        transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.22s cubic-bezier(0.4, 0, 0.2, 1) 0.12s',
    };
}

/** 将激活标签滚动进可视区（横向） */
function scrollActiveIntoView() {
    const el = tabRefs.value?.find(t => t.dataset.tabId === props.activeId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

/** 点击标签 */
function onTabClick(id: string) {
    emit('select', id);
    emit('update:activeId', id);
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
    nextTick(updateIndicator);
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => nextTick(updateIndicator));
        if (container.value) resizeObserver.observe(container.value);
    }
});

onUnmounted(() => {
    resizeObserver?.disconnect();
});

// 激活标签变化：仅重算滑动条位置（DOM 不重建，引用仍有效）
watch(() => props.activeId, () => {
    nextTick(() => {
        updateIndicator();
        scrollActiveIntoView();
    });
}, { immediate: true });

// 标签列表变化：v-for 会重建按钮 → 先清空旧引用再重算
watch(() => props.tabs, () => {
    tabRefs.value = [];
    nextTick(() => {
        updateIndicator();
        scrollActiveIntoView();
    });
});
</script>

<template>
    <div ref="container" v-smooth-wheel="'horizontal'" class="relative overflow-x-auto no-scrollbar shrink-0"
        :class="containerClass">
        <!-- tabs 样式的滑动小蓝条：left 先滑动，width 延迟展开 -->
        <span v-if="isTabs && showIndicator && tabs.length > 1" ref="indicator"
            class="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-blue-500" :style="indicatorStyle"></span>

        <button v-for="tab in tabs" :key="tab.id" type="button" :ref="setTabRef" :data-tab-id="tab.id"
            @click="onTabClick(tab.id)" class="whitespace-nowrap inline-flex items-center transition-colors shrink-0"
            :class="props.tabClass ? props.tabClass(tab.id, tab.id === props.activeId) : ''">
            <slot :tab="tab" :active="tab.id === props.activeId" />
        </button>
    </div>
</template>