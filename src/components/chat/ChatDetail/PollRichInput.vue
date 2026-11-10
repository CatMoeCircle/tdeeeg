<template>
    <!-- 投票表单的富文本输入：真实 input/textarea 文字透明，由预览层绘制；
         自定义 emoji 以图片形式显示，光标仍落在真实输入框上。 -->
    <div class="poll-rich-field relative min-w-0 flex-1 rounded-lg transition-colors"
        :class="[
            plain
                ? 'bg-transparent'
                : 'border border-gray-300 bg-white focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-400/40 dark:border-gray-600 dark:bg-gray-900',
            multiline ? 'poll-rich-field--multiline' : '',
        ]">
        <div class="poll-rich-main relative">
            <div ref="previewEl" aria-hidden="true"
                class="poll-rich-preview pointer-events-none absolute inset-0 overflow-hidden">
                <div class="poll-rich-preview-inner" :style="trailing ? { paddingRight: '2.5rem' } : undefined"
                    v-html="previewHTML"></div>
            </div>

            <textarea v-if="multiline" ref="inputEl" :value="modelValue" :placeholder="placeholder"
                :maxlength="maxlength" :rows="rows" :aria-label="placeholder"
                :style="trailing ? { paddingRight: '2.5rem' } : undefined"
                class="poll-rich-input relative z-10 block w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 text-transparent outline-none placeholder:text-gray-400"
                @input="onInput" @scroll="syncScroll" />

            <input v-else ref="inputEl" :value="modelValue" type="text" :placeholder="placeholder"
                :maxlength="maxlength" :aria-label="placeholder"
                :style="trailing ? { paddingRight: '2.5rem' } : undefined"
                class="poll-rich-input relative z-10 block h-9 w-full bg-transparent px-3 py-2 text-sm leading-5 text-transparent outline-none placeholder:text-gray-400"
                @input="onInput" @scroll="syncScroll" />

            <!-- 内嵌在输入框右侧的操作位（emoji 按钮等） -->
            <div v-if="$slots.trailing" class="poll-rich-trailing">
                <slot name="trailing" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { renderEntitiesHTML } from '../../../utils/message/textFormatters';
import { resolveCustomEmojiSrc } from '../../../utils/message/customEmojiPreview';

export interface PollRichEmoji {
    id: string;
    /** 贴纸自带的 unicode emoji，作为文本占位与无 Premium 时的回退 */
    alt: string;
}

const props = withDefaults(defineProps<{
    modelValue: string;
    customEmojis?: PollRichEmoji[];
    placeholder?: string;
    maxlength?: number;
    /** 多行输入时最多允许的换行数（例如投票解析最多 2 个换行） */
    maxLines?: number;
    multiline?: boolean;
    rows?: number;
    /** 无边框样式：用于投票选项行（Android 风格） */
    plain?: boolean;
    /** 输入框右侧是否预留内嵌操作位（emoji 按钮等），避免文字压到按钮 */
    trailing?: boolean;
}>(), {
    customEmojis: () => [],
    placeholder: '',
    maxlength: undefined,
    maxLines: undefined,
    multiline: false,
    rows: 2,
    plain: false,
    trailing: false,
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'update:customEmojis', value: PollRichEmoji[]): void;
}>();

const inputEl = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const previewEl = ref<HTMLElement | null>(null);

/** 只渲染自定义 emoji；普通文字由透明输入框下面的预览层绘制 */
const previewHTML = computed(() => renderEntitiesHTML(props.modelValue, [], {
    customEmojis: props.customEmojis,
    customEmojiSrc: (id) => resolveCustomEmojiSrc(id),
}));

function syncScroll() {
    const input = inputEl.value;
    const preview = previewEl.value;
    if (!input || !preview) return;
    preview.scrollTop = input.scrollTop;
    preview.scrollLeft = input.scrollLeft;
}

function onInput(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    let value = target.value.replace(/\r/g, '');
    if (props.maxLines && value.split('\n').length > props.maxLines) {
        value = value.split('\n').slice(0, props.maxLines).join('\n');
        target.value = value;
    }
    emit('update:modelValue', value);
    syncScroll();
}

/** 在光标 / 选区处插入文本；customEmoji 非空时同时登记一条自定义 emoji 实体。 */
function insertAtCaret(text: string, customEmoji?: PollRichEmoji) {
    const input = inputEl.value;
    const value = props.modelValue;
    // 输入框没有焦点时（例如直接点标题旁的 emoji 按钮）插到末尾，避免误插到开头
    const focused = !!input && document.activeElement === input;
    const start = focused ? (input!.selectionStart ?? value.length) : value.length;
    const end = focused ? (input!.selectionEnd ?? start) : start;
    const room = props.maxlength === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, props.maxlength - (value.length - (end - start)));
    const insert = text.slice(0, room);
    if (!insert && !customEmoji) return;

    emit('update:modelValue', value.slice(0, start) + insert + value.slice(end));
    if (customEmoji) {
        emit('update:customEmojis', [...props.customEmojis, customEmoji]);
    }
    void nextTick(() => {
        const el = inputEl.value;
        if (!el) return;
        el.focus();
        const caret = start + insert.length;
        el.setSelectionRange(caret, caret);
        syncScroll();
    });
}

/** 插入普通 unicode emoji */
function insertEmoji(emoji: string) {
    insertAtCaret(emoji);
}

/** 插入自定义 emoji（id 用于发送实体，alt 作为文本占位） */
function insertCustomEmoji(id: string, alt: string) {
    insertAtCaret(alt || '🙂', { id, alt: alt || '🙂' });
}

function focus() {
    inputEl.value?.focus();
}

/** 聚焦并把光标放到末尾（清单新增任务行 / 删除空行后回焦用） */
function focusAtEnd() {
    const el = inputEl.value;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    syncScroll();
}

defineExpose({ insertEmoji, insertCustomEmoji, focus, focusAtEnd, syncScroll });
</script>

<style scoped>
.poll-rich-preview-inner {
    box-sizing: border-box;
    width: max-content;
    min-width: 100%;
    height: 100%;
    padding: 0.5rem 0.75rem;
    /* 与 input 的 px-3 py-2 text-sm leading-5 一致 */
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #1f2937;
    white-space: pre;
    overflow-wrap: normal;
}

.poll-rich-field--multiline .poll-rich-preview-inner {
    width: 100%;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: break-word;
}

.poll-rich-input {
    -webkit-text-fill-color: transparent;
    caret-color: #1f2937;
}

.poll-rich-input::placeholder {
    color: rgb(156 163 175 / 0.9);
    -webkit-text-fill-color: rgb(156 163 175 / 0.9);
}

/* 输入框右侧内嵌操作位：按钮浮在透明输入框之上 */
.poll-rich-trailing {
    position: absolute;
    top: 50%;
    right: 0.25rem;
    z-index: 20;
    display: flex;
    align-items: center;
    transform: translateY(-50%);
}

:global(html.dark .poll-rich-preview-inner) {
    color: #e5e7eb;
}

:global(html.dark .poll-rich-input) {
    caret-color: #e5e7eb;
}

/* v-html 注入的节点不带 scoped 属性，必须 :deep() */
.poll-rich-preview :deep(.mi-emoji) {
    display: inline-block;
    width: 1.2em;
    height: 1.2em;
    margin: 0 0.05em;
    vertical-align: -0.1em;
    object-fit: contain;
    pointer-events: none;
}

.poll-rich-preview :deep(video.mi-emoji) {
    background: transparent;
    border: none;
}

.poll-rich-preview :deep(.mi-ce-loading) {
    display: inline-block;
    width: 1.2em;
    height: 1.2em;
    margin: 0 0.05em;
    border-radius: 0.25rem;
    background: rgba(128, 128, 128, 0.25);
    animation: poll-ce-pulse 1.2s ease-in-out infinite;
    pointer-events: none;
}

@keyframes poll-ce-pulse {
    0%, 100% { opacity: 0.45; }
    50% { opacity: 0.9; }
}
</style>
