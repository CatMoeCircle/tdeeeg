<template>
    <div class="flex flex-1 h-full overflow-hidden relative" ref="containerRef">
        <div class="shrink-0 h-full relative group"
            :class="{ 'border-r border-gray-200 dark:border-gray-800': sidebarDivider }"
            :style="{ width: sidebarWidth + 'px' }" ref="sidebarRef"
            style="will-change: width; contain: layout style paint">
            <slot name="sidebar"></slot>
        </div>

        <!-- Resizer Handle：命中区整体落在侧栏右缘外侧（内容区一侧），绝不压住侧栏的滚动条。
             分隔线有两种 1px 落位：展开对话时由内容区卡片的 border-l 承担（占 [右缘, 右缘+1]）；
             不展开时侧栏自己画 border-r（占 [右缘-1, 右缘]）。
             命中区取 [右缘, 右缘+10]：侧栏最右侧那 4px 滚动条完全留给鼠标，随时能点选/拖动；
             若把命中区跨在右缘上（旧实现居中 12px），滚动条会被整条吃掉，变成只能拖分栏。
             hover 指示线 2px，画在 [右缘-1, 右缘+1]，把两种落位一起盖住，视觉上正好替换掉分隔线；
             它 pointer-events-none，往侧栏里伸出的 1px 只负责显示，不参与命中。
             拖拽判定见 startResize：命中手柄即拖拽，不再按固定像素距离二次过滤。 -->
        <div class="absolute -top-1 bottom-0 z-20 w-2.5 cursor-col-resize group/resizer"
            :style="{ left: sidebarWidth + 'px' }" @mousedown="startResize">
            <!-- 视觉指示线：hover / 拖拽时高亮，平时透明，不遮分隔线 -->
            <div class="pointer-events-none absolute inset-y-0 -left-px w-0.5 pt-8 bg-clip-content
                        transition-colors bg-transparent group-hover/resizer:bg-blue-500"></div>
        </div>
        <div class="flex-1 h-full min-w-0">
            <slot name="content"></slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

const props = defineProps({
    initialWidth: {
        type: Number,
        default: 320
    },
    minWidth: {
        type: Number,
        default: 220
    },
    maxWidth: {
        type: Number,
        default: 400
    },
    /** 侧栏右侧分隔线：对话详情展开时由其左侧边框接管，避免分界线落在列表滚动条一侧 */
    sidebarDivider: {
        type: Boolean,
        default: true
    }
});

const sidebarWidth = ref(props.initialWidth);
const containerRef = ref<HTMLElement | null>(null);
const sidebarRef = ref<HTMLElement | null>(null);

/** 当前是否正在拖拽 */
let isDragging = false;

const startResize = (e: MouseEvent) => {
    // 手柄只覆盖侧栏右缘右侧（内容区 10px），侧栏内的滚动条不会被它拦住，
    // 因此命中手柄即代表用户要拖拽，无需再按「距侧栏右缘多少像素」二次过滤。
    e.preventDefault();
    isDragging = true;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // 拖拽时添加标记类，禁用内部组件的 CSS 过渡动画，防止抽搐
    document.body.classList.add('is-resizing');
};

const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.value || !sidebarRef.value) return;

    const containerRect = containerRef.value.getBoundingClientRect();
    let newWidth = e.clientX - containerRect.left;

    if (newWidth < props.minWidth) newWidth = props.minWidth;
    if (newWidth > props.maxWidth) newWidth = props.maxWidth;

    // 更新响应式状态，通过 :style 绑定驱动 DOM 更新
    // 这样可以确保 Vue 重渲染时宽度不会回弹（之前直接操作 DOM 绕过了响应式系统，
    // 导致其他数据更新触发组件重渲染时会用旧的 sidebarWidth 覆盖 DOM 宽度，产生抽搐）
    sidebarWidth.value = newWidth;
};

const stopResize = () => {
    if (!isDragging) return;
    isDragging = false;

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.classList.remove('is-resizing');

    // 拖拽结束后，将最终宽度同步回 Vue 响应式状态
    // 确保后续操作（如持久化）能获取到正确的值
    if (sidebarRef.value) {
        sidebarWidth.value = parseInt(sidebarRef.value.style.width, 10);
    }
};

onUnmounted(() => {
    stopResize();
});
</script>
