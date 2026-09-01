<template>
    <div class="p-5 bg-transparent" @dragover.prevent @drop.prevent="onDrop">
        <Transition name="mi-fade">
            <div v-if="replyTarget"
                class="flex items-start gap-2 mb-2 mx-1 px-3 py-2 rounded-2xl bg-white/70 dark:bg-gray-800/90 shadow-sm border border-gray-200/60 dark:border-gray-700/60">
                <CornerUpLeftIcon class="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-blue-500 truncate">
                        {{ replyTarget.quote ? `引用 ${replyTarget.title}` : replyTarget.title }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {{ replyTarget.quote || replyTarget.text || '（无文本内容）' }}
                    </p>
                </div>
                <button type="button" aria-label="取消回复"
                    class="w-6 h-6 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                    @click="emit('clearReply')">
                    <XIcon class="w-3.5 h-3.5" />
                </button>
            </div>
        </Transition>

        <AttachmentTray />

        <div
            class="flex items-end gap-3 bg-white/60 dark:bg-gray-900/80 backdrop-blur-md px-2 rounded-4xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
            <AttachmentMenu ref="attachmentMenuRef" :chat="chat" :users="users" :supergroups="supergroups"
                :basic-groups="basicGroups" :my-id="myId" :member-status="memberStatus" :is-premium="isPremium"
                :is-premium-available="isPremiumAvailable" @attach-photo="emit('attachPhoto')"
                @attach-file="emit('attachFile')" @attach-music="emit('attachMusic')"
                @attach-checklist="emit('attachChecklist')" @attach-poll="emit('attachPoll')"
                @attach-contact="emit('attachContact')" @attach-location="emit('attachLocation')" />

            <div class="flex-1 min-w-0 rounded-full dark:bg-gray-800 flex items-center my-2 relative">
                <!-- 富文本格式预览层：与 textarea 逐像素重叠，展示实体样式与 emoji 图片。
                     预览层始终显示（含输入法组合期间），textarea 文字保持透明，由预览层统一绘制
                     （含组合中的拼音）。text 的当前值（含拼音）由 onInput 实时从 DOM 读回，
                     保证预览层在组合期间也即时反映——这样自定义/全局 emoji 不会回退成原始样式。 -->
                <div v-show="previewHTML" aria-hidden="true"
                    class="input-preview absolute inset-0 pointer-events-none select-none overflow-hidden">
                    <div ref="previewInnerRef" class="input-preview-inner" v-html="previewHTML"></div>
                </div>
                <textarea ref="textareaRef" v-model="localValue" :placeholder="inputPlaceholder"
                    :class="['message-input-scrollbar input-textarea flex-1 min-w-0 bg-transparent resize-none focus:outline-none text-sm leading-5 text-gray-800 dark:text-gray-200 px-2 py-2 min-h-9 max-h-40 overflow-y-auto field-sizing-content']"
                    rows="1" @input="onInput" @keydown.enter.exact.prevent="onEnter" @keydown.enter.shift.stop
                    @keydown.escape="onEscape" @paste="onPaste" @scroll="syncPreviewScroll" @contextmenu.prevent.stop="onContextMenu"></textarea>
            </div>

            <div class="flex items-center gap-2 ml-2 mb-1.5 shrink-0">
                <button @click="$emit('sticker')" type="button" aria-label="贴纸"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                    <Smile class="w-5 h-5" />
                </button>
                <button @click="onClickSend" type="button" aria-label="发送" :disabled="sending"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-500 text-gray-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-default">
                    <SendIcon class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- 链接地址输入对话框（替代 window.prompt） -->
        <LinkInputDialog v-model="linkDialogOpen" :initial-url="linkInitialUrl" @submit="onLinkSubmit" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import type { chat, ChatMemberStatus, user, textEntity, formattedText } from 'tdlib-types';
import { CornerUpLeftIcon, SendIcon, Smile, XIcon, TypeIcon, Bold, Italic, Underline, Strikethrough, EyeOff, Code2, Quote, Link2, Eraser } from 'lucide-vue-next';
import { sending } from '../../../utils/attachmentSend';
import { useAttachmentStore } from '../../../store/attachment';
import { useCustomEmoji } from '../../../store/customEmoji';
import { openContextMenu } from '../../../store/contextMenu';
import type { ContextMenuItem } from '../../contextMenu/types';
import {
    toggleFormat, clearFormats, hasFormat, shiftEntitiesAfterTextChange, insertTextShiftEntities,
    renderEntitiesHTML,
} from '../../../utils/textFormatters';
import type { FormatKind } from '../../../utils/textFormatters';
import AttachmentMenu from './AttachmentMenu.vue';
import AttachmentTray from './AttachmentTray.vue';
import LinkInputDialog from './LinkInputDialog.vue';

export interface ReplyTarget {
    title: string;
    text: string;
    /** 引用回复时选中的原文片段（可选） */
    quote?: string;
}

const props = defineProps<{
    modelValue?: string;
    placeholder?: string;
    replyTarget?: ReplyTarget | null;
    editTarget?: { text: string } | null;
    chat?: chat;
    users?: Record<number, user>;
    supergroups?: Record<number, import('tdlib-types').supergroup>;
    basicGroups?: Record<number, import('tdlib-types').basicGroup>;
    myId?: number;
    memberStatus?: ChatMemberStatus;
    isPremium?: boolean;
    isPremiumAvailable?: boolean;
    /** 输入框内已添加的自定义 emoji（id + 占位 alt），用于在预览层渲染对应图片 */
    customEmojis?: { id: string; alt: string }[];
}>();

const emit = defineEmits([
    'update:modelValue', 'send', 'sticker', 'language', 'attach', 'clearReply', 'clearEdit',
    'attachPhoto', 'attachFile', 'attachMusic', 'attachChecklist', 'attachPoll',
    'attachContact', 'attachLocation',
]);

const attachmentStore = useAttachmentStore();
const localValue = ref(props.modelValue || '');
/**
 * 输入框富文本实体列表（text + entities 构成 formattedText）。
 * 文本由 <textarea> 维护（v-model 到 localValue），实体由本组件维护；
 * 发送时把 (localValue, entities) 一并交给父组件。
 */
const entities = ref<textEntity[]>([]);
/** 记录上一次文本值，用于 input 时 diff 出编辑位置并平移实体偏移 */
let lastText = props.modelValue || '';
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const previewInnerRef = ref<HTMLDivElement | null>(null);

/**
 * 富文本预览层 HTML：由当前文本 + 实体渲染。
 * 叠加层文字颜色需与 textarea 文字一致，才能“压”在真实文字上；为简化，
 * 叠加层只负责展示实体样式（粗/斜/下划/剧透背景等），普通文字留空不重复绘制。
 */
const previewHTML = computed(() =>
    renderEntitiesHTML(localValue.value, entities.value, {
        customEmojis: props.customEmojis,
        customEmojiSrc: (id) => resolveCustomEmojiSrc(id),
    }));

/**
 * 自定义 emoji 图片/动画源缓存（id → store 的响应式 state 引用）。
 * 惰性创建并请求自定义 emoji：首次遇到某 id 时调用 useCustomEmoji(id, true)，
 * 之后复用其引用。由于 state 是 store 里的响应式对象，computed 读取 .filePath/.thumbnailUrl
 * 会自动跟踪，下载完成后 previewHTML 会重新求值并把占位升级为图片/动画。
 */
const customEmojiCache = new Map<string, ReturnType<typeof useCustomEmoji>>();
function resolveCustomEmojiSrc(id: string): { src: string; kind: 'img' | 'video' } | null {
    let st = customEmojiCache.get(id);
    if (!st && !customEmojiCache.has(id)) {
        st = useCustomEmoji(id, true);
        customEmojiCache.set(id, st);
    }
    if (!st) return null;
    const fmt = st.sticker?.format?._;
    if (fmt === 'stickerFormatWebm') {
        // webm 动画 → <video>（img 无法播放）；完整文件未就绪时缩略图兜底
        if (st.filePath) return { src: st.filePath, kind: 'video' };
        if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
        return null;
    }
    if (fmt === 'stickerFormatWebp') {
        // webp 静态 → <img>：优先完整文件；完整体还没下好时先用缩略图兜底，
        // 避免“先显示系统 emoji → 再切成自定义图”的突兀回退。
        if (st.filePath) return { src: st.filePath, kind: 'img' };
        if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
        return null;
    }
    if (fmt === 'stickerFormatTgs') {
        // tgs 主文件是 .tgs，无法用 <img>/<video> 直接显示，只能用 (webp) 缩略图；
        // 绝不能 fallback 到 st.filePath（.tgs）当作图源，否则会渲染破图。
        if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
        return null;
    }
    // 未知格式：主文件或缩略图任意可显示源
    if (st.filePath) return { src: st.filePath, kind: 'img' };
    if (st.thumbnailUrl) return { src: st.thumbnailUrl, kind: 'img' };
    return null;
}

/** textarea 滚动时同步预览层滚动偏移，保证装饰不错位 */
function syncPreviewScroll() {
    const el = textareaRef.value;
    const inner = previewInnerRef.value;
    if (el && inner) inner.scrollTop = el.scrollTop;
}

// 初始聚焦后同步一次滚动基线
onMounted(() => nextTick(syncPreviewScroll));

watch(() => props.modelValue, (v) => {
    if (v !== localValue.value) {
        const old = localValue.value;
        // 外部整体替换文本（草稿/清空/emoji 追加/命令插入等）→
        // 尝试 diff 平移实体；若外部是整段替换（如加载草稿/清空）则无需保留实体，
        // 但纯文本追加（emoji/命令）应尽量保留已有实体，故交给 diff 判断
        if (old.length > 0 && v && v.length > old.length && v.startsWith(old)) {
            // 追加场景（emoji、bot 命令等）：保留实体
            entities.value = insertTextShiftEntities(entities.value, old.length, old.length, v.length - old.length);
        } else if (v === '') {
            // 清空
            entities.value = [];
        } else {
            // 其余情况（加载草稿等）：无可靠偏移可循，保留原实体并在发送前由 TDLib 校验
            // 保守处理：清空，避免错位实体
            entities.value = [];
        }
        localValue.value = v || '';
        lastText = v || '';
    }
});

watch(localValue, (v) => emit('update:modelValue', v));

/**
 * 文本被用户手动编辑：diff 出变化位置并平移实体偏移。
 *
 * 同时从 DOM <textarea> 实时读回当前值并强制同步 localValue：Vue 的 v-model
 * 在输入法组合（composition）期间会延迟赋值，若不强制同步，预览层会停留在
 * 组合前的旧文本，导致组合期间 emoji 回退成原始样式、拼音也不在预览层展示。
 */
function onInput(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    localValue.value = el.value;
    const next = localValue.value;
    if (next !== lastText) {
        entities.value = shiftEntitiesAfterTextChange(entities.value, lastText, next);
    }
    lastText = next;
}

const inputPlaceholder = computed(() =>
    props.editTarget ? '编辑消息...' : (attachmentStore.items.length > 0 ? '描述' : (props.placeholder || '输入消息...')));

const attachmentMenuRef = ref<InstanceType<typeof AttachmentMenu> | null>(null);

const onClickSend = () => {
    if (sending.value) return;
    if (attachmentStore.items.length === 0 && !localValue.value.trim()) return;
    const ft: formattedText = { _: 'formattedText', text: localValue.value, entities: entities.value };
    emit('send', ft);
    localValue.value = '';
    entities.value = [];
    lastText = '';
};

const onEnter = () => {
    onClickSend();
};

const onEscape = () => {
    if (props.editTarget) {
        emit('clearEdit');
    }
};

const onPaste = (e: ClipboardEvent) => {
    attachmentMenuRef.value?.onPaste(e);
};

const onDrop = (e: DragEvent) => {
    attachmentMenuRef.value?.onDrop(e);
};

/* =========================================================================
 * 文本选中 + 右键格式菜单
 * ========================================================================= */

/** 当前 textarea 选区 [start, end) */
function getRange(): [number, number] {
    const el = textareaRef.value;
    if (!el) return [0, 0];
    return [el.selectionStart, el.selectionEnd];
}

/** 选中区是否存在（非空选区） */
function hasSelection(): boolean {
    const [s, e] = getRange();
    return e > s;
}

/** 对当前选区应用/切换格式，并更新实体列表 */
function applyFormat(kind: FormatKind, value?: string) {
    const [s, e] = getRange();
    if (e <= s) return;
    entities.value = toggleFormat(entities.value, localValue.value, s, e, kind, value);
    // 应用后保持选区，便于连续操作；重新聚焦让后续右键/快捷键仍然可用
    textareaRef.value?.focus();
}

/** 清空选区所有格式（纯文本） */
function applyPlainText() {
    const [s, e] = getRange();
    if (e <= s) return;
    entities.value = clearFormats(entities.value, localValue.value, s, e);
    textareaRef.value?.focus();
}

/** 组装“格式”二级菜单子项 */
function buildFormatChildren(): ContextMenuItem[] {
    const [s, e] = getRange();
    const checked = (k: FormatKind) => e > s && hasFormat(entities.value, s, e, k);
    return [
        { key: 'fmt-bold', label: '加粗', icon: Bold, checked: checked('bold'), onClick: () => applyFormat('bold') },
        { key: 'fmt-italic', label: '斜体', icon: Italic, checked: checked('italic'), onClick: () => applyFormat('italic') },
        { key: 'fmt-underline', label: '下划线', icon: Underline, checked: checked('underline'), onClick: () => applyFormat('underline') },
        { key: 'fmt-strike', label: '删除线', icon: Strikethrough, checked: checked('strikethrough'), onClick: () => applyFormat('strikethrough') },
        { key: 'fmt-quote', label: '引用', icon: Quote, checked: checked('quote'), onClick: () => applyFormat('quote') },
        { key: 'fmt-code', label: '等宽', icon: Code2, checked: checked('code'), onClick: () => applyFormat('code') },
        { key: 'fmt-spoiler', label: '剧透', icon: EyeOff, checked: checked('spoiler'), onClick: () => applyFormat('spoiler') },
        { key: 'fmt-link', label: '链接', icon: Link2, checked: checked('link'), onClick: () => applyLink() },
        { divider: true, label: '' },
        { key: 'fmt-plain', label: '纯文本', icon: Eraser, onClick: () => applyPlainText() },
    ];
}

/** 链接对话框状态（自定义 UI，替代 window.prompt） */
const linkDialogOpen = ref(false);
/** 打开对话框时捕获的选区，对话框期间 textarea 失焦会用这里保证定位不丢 */
let linkSelection: [number, number] = [0, 0];
/** 对话框预填的初始 URL */
const linkInitialUrl = ref('');

/** 链接格式：打开自定义对话框让用户输入 URL（选中文本默认作为展示文本） */
function applyLink() {
    const [s, e] = getRange();
    if (e <= s) return;
    // 先捕获选区：打开对话框后 textarea 失焦会导致 selectionStart/End 丢失
    linkSelection = [s, e];
    const selText = localValue.value.slice(s, e).trim();
    linkInitialUrl.value = /^[a-z]+:\/\/|^tg:\/\//i.test(selText) ? selText : '';
    linkDialogOpen.value = true;
}

/** 对话框提交：对保存的选区应用链接格式，空 URL 则不应用 */
function onLinkSubmit(url: string) {
    const u = url.trim();
    if (!u) return;
    // 无协议时补全 http://，让 TDLib 识别为链接
    const full = /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `http://${u}`;
    // 恢复选区后应用格式
    const ta = textareaRef.value;
    if (ta) {
        ta.focus();
        ta.setSelectionRange(linkSelection[0], linkSelection[1]);
    }
    applyFormat('link', full);
}

/** 右键打开输入框编辑菜单（复制/剪切/粘贴/全选 + 格式二级菜单） */
function onContextMenu(e: MouseEvent) {
    const items: ContextMenuItem[] = [];
    const sel = hasSelection();
    if (sel) {
        items.push({ key: 'copy', label: '复制', onClick: () => copySelection() });
        items.push({ key: 'cut', label: '剪切', onClick: () => cutSelection() });
    }
    items.push({ key: 'paste', label: '粘贴', onClick: () => pasteFromClipboard() });
    items.push({ key: 'selectAll', label: '全选', onClick: () => selectAll() });
    if (sel) {
        items.push({ key: 'fmt-sep', divider: true, label: '' });
        items.push({
            key: 'fmt',
            label: '格式',
            icon: TypeIcon,
            children: buildFormatChildren(),
        });
    }
    openContextMenu(e.clientX, e.clientY, items);
}

/** 复制选中文本到剪贴板（复制纯文本，不携带实体） */
function copySelection() {
    const el = textareaRef.value;
    if (!el) return;
    const [s, e] = getRange();
    const text = el.value.slice(s, e);
    navigator.clipboard.writeText(text).catch(() => {
        // 兼容降级：用 execCommand 复制
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        } catch { /* 忽略 */ }
    });
}

/** 剪切选中文本（复制到剪贴板后移除，并平移实体） */
function cutSelection() {
    const el = textareaRef.value;
    if (!el) return;
    const [s, e] = getRange();
    if (e <= s) return;
    copySelection();
    const old = el.value;
    el.value = old.slice(0, s) + old.slice(e);
    el.selectionStart = el.selectionEnd = s;
    localValue.value = el.value;
    entities.value = shiftEntitiesAfterTextChange(entities.value, old, el.value);
    lastText = el.value;
    el.focus();
}

/** 从剪贴板粘贴文本到光标处（含实体平移） */
async function pasteFromClipboard() {
    const el = textareaRef.value;
    if (!el) return;
    let text = '';
    try {
        text = await navigator.clipboard.readText();
    } catch {
        try {
            text = window.prompt('粘贴内容：', '') ?? '';
        } catch { /* 忽略 */ }
    }
    if (!text) return;
    const [s, e] = getRange();
    const old = el.value;
    el.value = old.slice(0, s) + text + old.slice(e);
    const caret = s + text.length;
    el.selectionStart = el.selectionEnd = caret;
    localValue.value = el.value;
    entities.value = shiftEntitiesAfterTextChange(entities.value, old, el.value);
    lastText = el.value;
    el.focus();
}

/** 全选 */
function selectAll() {
    const el = textareaRef.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
}

</script>

<style scoped>
.message-input-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.mi-fade-enter-active,
.mi-fade-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.mi-fade-enter-from,
.mi-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

/* ---- 富文本预览层：与 textarea 逐像素重叠 ---- */
/* textarea 文字透明，仅保留光标与选区；真实文字由预览层统一绘制，避免两层重叠 */
.input-textarea {
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: #1f2937;
}
.input-textarea::placeholder {
    color: rgba(128, 128, 128, 0.6);
    -webkit-text-fill-color: rgba(128, 128, 128, 0.6);
}
@media (prefers-color-scheme: dark) {
    .input-textarea {
        caret-color: #e5e7eb;
    }
}

/* 预览层内部排版与 textarea 完全一致（font / padding / line-height / 换行） */
.input-preview-inner {
    box-sizing: border-box;
    height: 100%;
    overflow-y: auto;
    padding: 0.5rem;        /* = px-2 py-2，与 textarea 一致 */
    font-size: 0.875rem;    /* text-sm */
    line-height: 1.25rem;   /* leading-5 */
    color: #1f2937;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: break-word;
    /* 同步滚动基线：隐藏原生滚动条（滚动由 textarea 驱动） */
    scrollbar-width: none;
}
.input-preview-inner::-webkit-scrollbar {
    display: none;
}
@media (prefers-color-scheme: dark) {
    .input-preview-inner {
        color: #e5e7eb;
    }
}

/* 预览层内渲染的 emoji 图片/动画（普通 emoji → Apple PNG；自定义 emoji → 对应贴纸/动画）。
   该 HTML 经 v-html 注入，节点不带 scoped 属性 → 必须用 :deep() 才能命中。 */
.input-preview-inner :deep(.mi-emoji) {
    display: inline-block;
    width: 1.2em;
    height: 1.2em;
    margin: 0 0.05em;
    vertical-align: -0.1em;
    object-fit: contain;
    pointer-events: none;
}
.input-preview-inner :deep(video.mi-emoji) {
    background: transparent;
    border: none;
}
/* 自定义 emoji 数据未就绪时的加载占位：与 emoji 等宽，保持与 textarea 内占位字符
   同宽（1.2em）以免排版错位/光标跳动；就绪后由 <img>/<video> 平滑替换。 */
.input-preview-inner :deep(.mi-ce-loading) {
    display: inline-block;
    width: 1.2em;
    height: 1.2em;
    margin: 0 0.05em;
    vertical-align: -0.1em;
    border-radius: 0.25rem;
    background: rgba(128, 128, 128, 0.25);
    animation: mi-ce-pulse 1.2s ease-in-out infinite;
    pointer-events: none;
}
@keyframes mi-ce-pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
}

/* ---- 选中文本（选区）配色 ---- */
/* textarea 文字透明，负责提供统一的选区高亮背景 */
.input-textarea::selection {
    background-color: #3390ff;
    color: transparent;
}
/* 预览层内 v-html 注入的文字，选中时改白色（见文件底部非 scoped style 块） */
</style>

<!-- 预览层 HTML 经 v-html 注入，节点不带 scoped 属性。
     这里用非 scoped style 处理选中文本（选区）时预览层文字的颜色，
     使其在 textarea 的蓝色选区背景上显示为白色，避免“黑字蓝底”不协调。 -->
<style>
.input-preview-inner ::selection {
    color: #ffffff;
    background: transparent;
}
</style>
