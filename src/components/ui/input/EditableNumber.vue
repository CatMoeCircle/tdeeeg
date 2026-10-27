<template>
    <input v-if="editing" ref="inputEl" type="number" :min="min" :max="max" :step="step" :value="draft" @input="onInput"
        @keydown.enter.prevent="commit" @keydown.esc.prevent="cancel" @blur="commit"
        class="w-16 rounded-md border border-blue-500 bg-transparent px-1.5 py-0.5 text-right text-sm font-medium text-blue-600 focus:outline-none" />
    <button v-else type="button" @click="start"
        class="cursor-pointer rounded-md px-1.5 py-0.5 text-sm font-medium text-blue-600 tabular-nums hover:bg-blue-50 dark:hover:bg-blue-900/20 min-w-14 text-right">
        {{ value }}<span v-if="unit" class="text-xs font-normal text-gray-400 ml-0.5">{{ unit }}</span>
    </button>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

const props = withDefaults(defineProps<{
    value: number;
    /** 显示在数值后的单位（如 px、%、MB），不传则不显示 */
    unit?: string;
    min?: number;
    max?: number;
    step?: number;
}>(), {
    unit: '',
    min: -Infinity,
    max: Infinity,
    step: 1,
});

const emit = defineEmits<{
    (e: 'update:value', value: number): void;
}>();

const editing = ref(false);
const draft = ref('');
const inputEl = ref<HTMLInputElement | null>(null);

function start(): void {
    // 初始草稿使用整数形式（去掉可能的小数尾零）
    draft.value = String(Math.round(props.value * 100) / 100);
    editing.value = true;
    nextTick(() => {
        inputEl.value?.focus();
        inputEl.value?.select();
    });
}

function onInput(e: Event): void {
    draft.value = (e.target as HTMLInputElement).value;
}

/** 将输入值 clamp 到 [min, max] 并处理 step 对齐 */
function normalized(): number {
    const raw = Number(draft.value);
    if (Number.isNaN(raw)) return props.value;
    let v = Math.min(Math.max(raw, props.min), props.max);
    // 按 step 对齐（仅当 step 为正且为有限值）
    if (props.step > 0 && Number.isFinite(props.step)) {
        const steps = Math.round((v - props.min) / props.step);
        v = props.min + steps * props.step;
    }
    // 消除浮点误差
    return Math.round(v * 100) / 100;
}

function commit(): void {
    if (!editing.value) return;
    editing.value = false;
    const v = normalized();
    if (v !== props.value) {
        emit('update:value', v);
    }
}

function cancel(): void {
    editing.value = false;
    draft.value = '';
}
</script>
