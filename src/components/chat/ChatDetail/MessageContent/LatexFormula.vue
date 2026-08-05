<template>
    <span ref="rootEl" class="latex-formula" :class="isDisplay ? 'block' : 'inline-block align-middle'"
        v-html="html"></span>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const props = withDefaults(defineProps<{
    expression: string;
    displayMode?: boolean;
}>(), {
    displayMode: false,
});

const source = computed(() => normalizeExpression(props.expression));
const isDisplay = computed(() => props.displayMode || isDisplayDelimited(props.expression));
const rootEl = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

const html = computed(() => {
    try {
        return katex.renderToString(source.value, {
            displayMode: isDisplay.value,
            throwOnError: true,
            strict: false,
        });
    } catch {
        return escapeHtml(source.value);
    }
});

function fitFormula() {
    const el = rootEl.value;
    if (!el) return;
    const katexEl = el.querySelector<HTMLElement>('.katex');
    if (!katexEl) return;

    katexEl.style.removeProperty('font-size');
    const baseFontSize = parseFloat(getComputedStyle(katexEl).fontSize) || 14;
    const naturalWidth = el.scrollWidth;
    const availableWidth = el.clientWidth;
    const scale = naturalWidth > availableWidth && naturalWidth > 0
        ? Math.min(1, availableWidth / naturalWidth)
        : 1;
    katexEl.style.fontSize = `${baseFontSize * scale}px`;
}

watch([source, isDisplay], () => {
    void nextTick(fitFormula);
});

onMounted(() => {
    void nextTick(fitFormula);
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => fitFormula());
        if (rootEl.value) resizeObserver.observe(rootEl.value);
    }
    if (document.fonts?.ready) {
        document.fonts.ready.then(() => fitFormula());
    }
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
});

function isDisplayDelimited(value: string): boolean {
    const text = value.trim();
    return /^\\\[[\s\S]*\\\]$/.test(text) || /^\$\$[\s\S]*\$\$$/.test(text);
}

function normalizeExpression(value: string): string {
    const text = value.trim();
    const display = text.match(/^\\\[([\s\S]*)\\\]$/);
    if (display) return display[1].trim();

    const dollarDisplay = text.match(/^\$\$([\s\S]*)\$\$$/);
    if (dollarDisplay) return dollarDisplay[1].trim();

    const inline = text.match(/^\\\(([\s\S]*)\\\)$/);
    if (inline) return inline[1].trim();

    const dollarInline = text.match(/^\$([\s\S]*)\$$/);
    if (dollarInline) return dollarInline[1].trim();

    return text;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
</script>

<style scoped>
.latex-formula {
    overflow: hidden;
}

.latex-formula.inline-block {
    max-width: 100%;
}

.latex-formula :deep(.katex-display) {
    margin: 0;
}
</style>
