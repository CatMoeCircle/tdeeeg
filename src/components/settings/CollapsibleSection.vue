<template>
    <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button type="button"
            class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            @click="$emit('toggle')">
            <div>
                <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ title }}</h3>
                <p v-if="description" class="text-xs text-gray-400 mt-0.5">{{ description }}</p>
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform duration-200" :class="open ? 'rotate-180' : ''"
                viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clip-rule="evenodd" />
            </svg>
        </button>
        <div ref="bodyRef" class="collapsible-body" :class="{ 'no-anim': initializing }">
            <div class="px-4 pb-3 space-y-1">
                <slot />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';

const props = defineProps<{
    open: boolean;
    title: string;
    description?: string;
}>();
defineEmits<{
    toggle: [];
}>();

const bodyRef = ref<HTMLElement | null>(null);
const initializing = ref(true);

function setHeight(el: HTMLElement, h: string) {
    el.style.height = h;
}

function forceReflow(el: HTMLElement) {
    // 强制浏览器 reflow，使上一个 height 变更生效，transition 才能触发
    void el.offsetHeight;
}

async function animate(open: boolean) {
    const el = bodyRef.value;
    if (!el) return;
    // 先清除固定高度获得自然 scrollHeight
    setHeight(el, '');
    await nextTick();
    const h = el.scrollHeight;
    if (open) {
        // 展开：从 0 → h
        setHeight(el, '0px');
        forceReflow(el);
        setHeight(el, h + 'px');
    } else {
        // 收起：从 h → 0
        setHeight(el, h + 'px');
        forceReflow(el);
        setHeight(el, '0px');
    }
}

onMounted(async () => {
    const el = bodyRef.value;
    if (el) {
        if (props.open) {
            setHeight(el, '');
            await nextTick();
            setHeight(el, el.scrollHeight + 'px');
        } else {
            setHeight(el, '0px');
        }
    }
    initializing.value = false;
});

watch(() => props.open, (val) => {
    animate(val);
}, { flush: 'post' });
</script>

<style scoped>
.collapsible-body {
    overflow: hidden;
    transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.collapsible-body.no-anim {
    transition: none;
}
</style>
