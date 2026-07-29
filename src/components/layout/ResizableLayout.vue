<template>
    <div class="flex flex-1 h-full overflow-hidden" ref="containerRef">
        <div class="shrink-0 h-full border-r border-gray-200 dark:border-gray-800 relative group"
            :style="{ width: sidebarWidth + 'px' }" ref="sidebarRef"
            style="will-change: width; contain: layout style paint">
            <slot name="sidebar"></slot>

            <!-- Resizer Handle: 点击区域上延至标题栏 + 向右偏移 + 视觉不变 -->
            <div class="absolute -top-1 bottom-0 -right-1.5 w-px cursor-col-resize z-10
                        hover:bg-blue-500 transition-color
                        opacity-0 group-hover:opacity-100 hover:opacity-100 active:opacity-100 active:bg-blue-600
                        px-[3.5px] pt-8 bg-clip-content" @mousedown="startResize"></div>
        </div>
        <div class="flex-1 h-full min-w-0  dark:bg-gray-900">
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
    }
});

const sidebarWidth = ref(props.initialWidth);
const containerRef = ref<HTMLElement | null>(null);
const sidebarRef = ref<HTMLElement | null>(null);

/** 当前是否正在拖拽 */
let isDragging = false;

const startResize = (e: MouseEvent) => {
    // 检测是否在滚动条上点击：如果鼠标在侧边栏右侧的滚动条区域内则不触发
    if (sidebarRef.value) {
        const sidebarRect = sidebarRef.value.getBoundingClientRect();
        const distFromSidebarRight = sidebarRect.right - e.clientX;
        // 手柄已右移至边框处，判断宽度收窄至 4px
        if (distFromSidebarRight > 4) return;
    }

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
