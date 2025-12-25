<template>
    <div class="flex flex-1 h-full overflow-hidden" ref="containerRef">
        <div class="shrink-0 h-full border-r border-gray-200 dark:border-gray-800 relative group"
            :style="{ width: sidebarWidth + 'px' }">
            <slot name="sidebar"></slot>

            <!-- Resizer Handle -->
            <div class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors z-10 opacity-0 group-hover:opacity-100 active:opacity-100 active:bg-blue-600"
                @mousedown.prevent="startResize"></div>
        </div>
        <div class="flex-1 h-full min-w-0 bg-gray-50 dark:bg-gray-900">
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
const isResizing = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const startResize = () => {
    isResizing.value = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
};

const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return;

    if (containerRef.value) {
        const containerRect = containerRef.value.getBoundingClientRect();
        let newWidth = e.clientX - containerRect.left;

        if (newWidth < props.minWidth) newWidth = props.minWidth;
        if (newWidth > props.maxWidth) newWidth = props.maxWidth;

        sidebarWidth.value = newWidth;
    }
};

const stopResize = () => {
    isResizing.value = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
};

onUnmounted(() => {
    stopResize();
});
</script>
