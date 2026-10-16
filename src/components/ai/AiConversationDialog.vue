<script setup lang="ts">
/**
 * 会话管理弹窗：管理「当前聊天」下的 AI 对话（新建 / 打开 / 重命名 / 删除）。
 *
 * 归属维度是 chat_id：同一个 Telegram 聊天共享一组对话，切聊天换一组。
 * 纯管理，不提供消息查看 —— 只显示标题、时间、请求次数与上下文占用。
 *
 * 打开 / 删除 / 新建都直接落到 Rust 后端（store/aiConversations），弹窗自己不持有列表状态。
 */
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    Check as CheckIcon,
    MessageSquarePlus as NewChatIcon,
    Pencil as PencilIcon,
    Trash2 as TrashIcon,
    X as XIcon,
} from 'lucide-vue-next';
import { fmtTokens } from '../../store/aiConversations';
import type { AiConversation } from '../../store/aiConversations';

const props = defineProps<{
    modelValue: boolean;
    /** 归属的聊天 id；0 = 还没进聊天，不拉列表 */
    chatId: number;
    /** 对话列表（由调用方从 store 传入，保证和输入框底部状态同一份数据） */
    items: AiConversation[];
    loading?: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [v: boolean];
    create: [];
    open: [id: string];
    rename: [id: string, title: string];
    remove: [id: string];
}>();

const { t } = useI18n();

/** 正在重命名的对话 id；'' = 没有 */
const editingId = ref('');
const draftTitle = ref('');
const titleInput = ref<HTMLInputElement | null>(null);

const close = () => emit('update:modelValue', false);

watch(
    () => props.modelValue,
    (open) => {
        if (!open) {
            editingId.value = '';
            draftTitle.value = '';
        }
    },
);

function startRename(c: AiConversation) {
    editingId.value = c.id;
    draftTitle.value = c.title;
    void nextTick(() => titleInput.value?.select());
}

function commitRename(c: AiConversation) {
    const title = draftTitle.value.trim();
    editingId.value = '';
    if (title && title !== c.title) emit('rename', c.id, title);
}

/** 删除前确认一次（与设置页其它删除一致，不给「删了才发现」的机会） */
function confirmRemove(c: AiConversation) {
    if (!window.confirm(t('aiConversations.deleteConfirm', [c.title]))) return;
    emit('remove', c.id);
}

/** 已用上下文比例；窗口未知就不显示 */
const ctxPercent = (c: AiConversation): number | null => {
    const limit = c.usage.contextLength;
    return limit > 0 ? Math.min(100, Math.round((c.usage.lastInputTokens * 100) / limit)) : null;
};

/** 每行副标题：请求次数 + 上下文占用 + 最近更新时间 */
function metaOf(c: AiConversation): string {
    const parts: string[] = [];
    parts.push(t('aiConversations.requests', { n: c.usage.requests }));
    const pct = ctxPercent(c);
    if (pct !== null) {
        parts.push(t('aiConversations.ctxUsed', { used: fmtTokens(c.usage.lastInputTokens), limit: fmtTokens(c.usage.contextLength) }));
    }
    return parts.join(' · ');
}

const when = (ms: number) => (ms ? new Date(ms).toLocaleString() : '');
</script>

<template>
    <Teleport to="body">
        <Transition name="conv-dialog">
            <div v-if="modelValue"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="ai-conv-title" @mousedown.self="close">
                <div @keydown.esc.stop="close"
                    class="w-120 max-w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-800">
                    <!-- 头部：标题 + 新建 -->
                    <div class="relative px-6 pt-5 pb-3">
                        <button type="button" :aria-label="t('lng_close')"
                            class="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="close">
                            <XIcon class="h-5 w-5" />
                        </button>
                        <h2 id="ai-conv-title" class="text-lg font-semibold text-gray-900 dark:text-white">
                            {{ t('aiConversations.title') }}
                        </h2>
                        <p class="mt-1 text-xs text-gray-400">{{ t('aiConversations.subtitle') }}</p>
                        <button type="button"
                            class="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--app-brand)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                            @click="emit('create')">
                            <NewChatIcon class="h-4 w-4" :stroke-width="2" />
                            {{ t('aiConversations.new') }}
                        </button>
                    </div>

                    <!-- 列表：标题 + 用量，右侧 打开 / 重命名 / 删除 -->
                    <div class="custom-scrollbar max-h-90 overflow-y-auto border-t border-gray-200 dark:border-gray-700">
                        <p v-if="loading" class="px-6 py-6 text-center text-sm text-gray-400">
                            {{ t('aiConversations.loading') }}</p>
                        <p v-else-if="!items.length" class="px-6 py-8 text-center text-sm text-gray-400">
                            {{ t('aiConversations.empty') }}</p>
                        <ul v-else class="divide-y divide-gray-100 dark:divide-gray-700/60">
                            <li v-for="c in items" :key="c.id" class="group flex items-center gap-3 px-4 py-2.5"
                                :class="c.active ? 'bg-[color-mix(in_srgb,var(--app-brand)_8%,transparent)]' : ''">
                                <!-- 当前选中标记 -->
                                <span class="grid h-4 w-4 shrink-0 place-items-center text-[var(--app-brand)]"
                                    :title="c.active ? t('aiConversations.current') : ''">
                                    <CheckIcon v-if="c.active" class="h-4 w-4" :stroke-width="2.6" />
                                </span>

                                <div class="min-w-0 flex-1">
                                    <input v-if="editingId === c.id" ref="titleInput" v-model="draftTitle" type="text"
                                        :aria-label="t('aiConversations.rename')"
                                        class="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-[var(--app-brand)] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                        @keydown.enter.prevent="commitRename(c)"
                                        @keydown.esc.prevent="editingId = ''" @blur="commitRename(c)" />
                                    <template v-else>
                                        <p class="truncate text-sm text-gray-900 dark:text-gray-100">{{ c.title }}</p>
                                        <p class="mt-0.5 truncate text-[11px] text-gray-400">
                                            {{ metaOf(c) }}
                                            <span v-if="c.updatedAt">· {{ when(c.updatedAt) }}</span>
                                        </p>
                                    </template>
                                </div>

                                <!-- 操作：打开 / 重命名 / 删除 -->
                                <div class="flex shrink-0 items-center gap-1">
                                    <button v-if="!c.active" type="button"
                                        class="cursor-pointer rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5"
                                        @click="emit('open', c.id)">
                                        {{ t('aiConversations.open') }}
                                    </button>
                                    <span v-else class="px-2 py-1 text-xs text-[var(--app-brand)]">
                                        {{ t('aiConversations.current') }}
                                    </span>
                                    <button type="button" :aria-label="t('aiConversations.rename')"
                                        :title="t('aiConversations.rename')"
                                        class="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
                                        @click="startRename(c)">
                                        <PencilIcon class="h-3.5 w-3.5" :stroke-width="2" />
                                    </button>
                                    <button type="button" :aria-label="t('aiConversations.remove')"
                                        :title="t('aiConversations.remove')"
                                        class="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                                        @click="confirmRemove(c)">
                                        <TrashIcon class="h-3.5 w-3.5" :stroke-width="2" />
                                    </button>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.conv-dialog-enter-active,
.conv-dialog-leave-active {
    transition: opacity 160ms ease;
}

.conv-dialog-enter-from,
.conv-dialog-leave-to {
    opacity: 0;
}
</style>
