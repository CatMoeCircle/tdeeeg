<template>
    <Teleport to="body">
        <div v-if="modelValue" class="fixed inset-0 z-200" @mousedown="close">
            <div class="fixed flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden"
                :style="panelStyle" @mousedown.stop>
                <slot />
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * 悬浮选择器面板：贴在触发按钮下方（放不下时翻到上方），点击遮罩关闭。
 * 与「更换自定义 emoji 状态」用的是同一套悬浮弹窗形态。
 */
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
    modelValue: boolean;
    /** 触发按钮元素，面板贴在它下方 */
    anchor?: HTMLElement | null;
    width?: number;
    height?: number;
}>(), {
    anchor: null,
    width: 320,
    height: 360,
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const pos = ref({ top: 0, left: 0 });

function place() {
    const margin = 8;
    const rect = props.anchor?.getBoundingClientRect();
    if (!rect) {
        pos.value = { top: margin, left: margin };
        return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, vw - props.width - margin));
    let top = rect.bottom + 6;
    if (top + props.height + margin > vh) {
        top = Math.max(margin, rect.top - props.height - 6);
    }
    pos.value = { top, left };
}

watch(() => props.modelValue, (open) => {
    if (open) place();
});

const panelStyle = computed(() => ({
    top: `${pos.value.top}px`,
    left: `${pos.value.left}px`,
    width: `${props.width}px`,
    height: `${props.height}px`,
}));

function close() {
    emit('update:modelValue', false);
}
</script>
