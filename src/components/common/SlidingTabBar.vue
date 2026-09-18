<script setup lang="ts">
/**
 * SlidingTabBar —— 通用分组/标签栏组件
 *
 * 可复用于「对话列表分组栏」「设置-分组文件夹样式预览」「个人资料页标签栏」。
 * 它统一处理：
 *   - 标签的横向滚动布局
 *   - 激活标签的追踪（v 选中态）
 *   - tabs 样式下滑动小蓝条（先移动后定宽的自然过渡，避免宽度抖动）
 *   - soft 样式下滑动浅蓝胶囊底（同 left/width 过渡）
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
    /** 样式变体：tabs=底部滑动条，pills=胶囊，text=纯文本，soft=完全圆角浮层内滑动浅蓝胶囊 */
    variant?: 'tabs' | 'pills' | 'text' | 'soft';
    /** 每个标签按钮的类（需根据 active 决定），由调用方传入以复用现有样式 */
    tabClass?: (id: string, active: boolean) => string;
    /** 容器额外类（覆盖默认的变体布局类） */
    containerClass?: string;
    /** 是否显示滑动指示器（tabs 小蓝条 / soft 浅蓝胶囊底） */
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
const isSoft = computed(() => props.variant === 'soft');
/** 需要滑动指示器的变体 */
const hasSlidingIndicator = computed(() => isTabs.value || isSoft.value);

/** 容器布局类：变体基础布局 + 调用方附加类 */
const containerClass = computed(() => {
    const base = props.variant === 'text'
        ? 'flex gap-3'
        // soft：宽度随内容；左右外边距与完全圆角浮层由 containerClass 附加
        : props.variant === 'soft' ? 'flex gap-0.5 items-center w-fit max-w-[calc(100%-1rem)]' : 'flex gap-2';
    return props.containerClass ? `${base} ${props.containerClass}` : base;
});

// ---- 滑动指示器（tabs 小蓝条 / soft 浅蓝胶囊底） ----
const tabRefs = ref<HTMLElement[]>([]);
const indicatorStyle = ref<Record<string, string>>({});

const container = ref<HTMLElement | null>(null);

function setTabRef(el: any) {
    if (el) tabRefs.value.push(el as HTMLElement);
}

/** 计算滑动指示器位置/宽度（先移动后定宽，避免宽度抖动） */
function updateIndicator() {
    if (!hasSlidingIndicator.value) return;
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

/** 将激活标签横向滚入本容器可视区。
 *  不用 scrollIntoView：它会连带滚动所有可滚动祖先，把外层纵向列表/设置页一起拖走。 */
function scrollActiveIntoView() {
    const el = tabRefs.value?.find(t => t.dataset.tabId === props.activeId);
    const cont = container.value;
    if (!el || !cont) return;
    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;
    const viewLeft = cont.scrollLeft;
    const viewRight = viewLeft + cont.clientWidth;
    if (elLeft < viewLeft) {
        cont.scrollLeft = elLeft;
    } else if (elRight > viewRight) {
        cont.scrollLeft = elRight - cont.clientWidth;
    }
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

// 样式变体变化：重算指示器（soft ↔ tabs）
watch(() => props.variant, () => {
    nextTick(updateIndicator);
});
</script>

<template>
    <div ref="container" v-smooth-wheel="'horizontal'"
        class="sliding-tabbar relative overflow-x-auto no-scrollbar scrollbar-none shrink-0"
        :class="containerClass">
        <!-- 滑动指示器：tabs=底部小蓝条；soft=浅蓝胶囊底（文字浮在其上） -->
        <span v-if="hasSlidingIndicator && showIndicator && tabs.length > 1" ref="indicator"
            class="pointer-events-none absolute rounded-full" :class="isSoft
                ? 'inset-y-1 bg-blue-50 dark:bg-blue-500/20'
                : 'bottom-0 h-0.5 bg-blue-500'"
            :style="indicatorStyle"></span>

        <button v-for="tab in tabs" :key="tab.id" type="button" :ref="setTabRef" :data-tab-id="tab.id"
            @click="onTabClick(tab.id)" class="whitespace-nowrap inline-flex items-center transition-colors shrink-0"
            :class="props.tabClass ? props.tabClass(tab.id, tab.id === props.activeId) : ''">
            <slot :tab="tab" :active="tab.id === props.activeId" />
        </button>
    </div>
</template>
