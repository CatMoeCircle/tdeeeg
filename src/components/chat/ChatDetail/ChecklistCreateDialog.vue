<template>
    <!-- 新建待办清单：标题 + 任务行 + 权限设置；只负责组装 payload，发送交给父组件 -->
    <ModalDialog :model-value="modelValue" :title="t('lng_todo_create_title')" @update:model-value="close">
        <div class="space-y-4" @input="touched = true">
            <!-- 非 Premium 兜底：父组件正常不会打开，这里只提示并禁用创建，表单照常可见 -->
            <p v-if="premiumBlocked"
                class="rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                {{ t('lng_todo_create_premium', { link: t('lng_todo_premium_link') }) }}
            </p>

            <!-- 清单标题：与投票问题同款富文本输入，只额外支持自定义 emoji -->
            <div>
                <PollRichInput ref="titleRef" v-model="title" v-model:custom-emojis="titleEmojis"
                    :maxlength="titleMax" :placeholder="t('lng_todo_create_title_placeholder')" trailing
                    @update:model-value="touched = true" @keydown.enter.prevent="submit">
                    <template #trailing>
                        <button type="button" :aria-label="t('lng_article_insert_emoji')" :title="t('lng_article_insert_emoji')"
                            class="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                            @mousedown.prevent @click="openEmojiPicker({ kind: 'title' }, $event)">
                            <SmileIcon class="h-4 w-4" />
                        </button>
                    </template>
                </PollRichInput>
                <!-- 字符上限放在输入框外右下角 -->
                <div class="mt-0.5 flex justify-end">
                    <span class="text-[11px] leading-none tabular-nums text-gray-400">{{ title.length }}/{{ titleMax }}</span>
                </div>
                <p v-if="touched && !title.trim()" class="mt-1 text-xs text-red-500">
                    {{ t('lng_todo_choose_title') }}
                </p>
            </div>

            <!-- 任务行：与投票选项同一套 Android 列表样式（拖动排序 + 分隔线 + 当前行 emoji） -->
            <div>
                <p class="mb-1 text-sm font-medium text-blue-500">
                    {{ t('lng_todo_create_list') }}
                </p>
                <VueDraggable v-model="tasks" :animation="150" handle=".checklist-task-handle"
                    class="divide-y divide-gray-200 dark:divide-gray-700">
                    <div v-for="(row, i) in tasks" :key="row.id" class="flex items-center gap-2 py-2"
                        @focusin="activeTaskId = row.id" @click="activeTaskId = row.id">
                        <!-- 拖动排序手柄 -->
                        <button type="button" :aria-label="t('poll.reorder')" :title="t('poll.reorder')"
                            class="checklist-task-handle flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 active:cursor-grabbing">
                            <MenuIcon class="h-4 w-4" />
                        </button>

                        <PollRichInput :ref="(el) => registerTaskInput(row.id, el)" v-model="row.text"
                            v-model:custom-emojis="row.emojis" :maxlength="taskTextMax" plain
                            :trailing="activeTaskId === row.id" :placeholder="t('lng_todo_create_list_add')"
                            @update:model-value="touched = true"
                            @keydown.enter.prevent="onTaskEnter(i)" @keydown.backspace="onTaskBackspace(i, $event)">
                            <!-- emoji 按钮内嵌在当前行输入框右侧，与投票选项一致 -->
                            <template #trailing>
                                <button v-if="activeTaskId === row.id" type="button"
                                    :aria-label="t('lng_article_insert_emoji')" :title="t('lng_article_insert_emoji')"
                                    class="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                    @mousedown.prevent
                                    @click.stop="openEmojiPicker({ kind: 'task', id: row.id }, $event)">
                                    <SmileIcon class="h-4 w-4" />
                                </button>
                            </template>
                        </PollRichInput>

                        <button type="button" :disabled="tasks.length <= 1" :aria-label="t('lng_box_remove')"
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400 dark:disabled:hover:bg-transparent"
                            @click.stop="removeTask(i)">
                            <XIcon class="h-4 w-4" />
                        </button>
                    </div>
                </VueDraggable>

                <button type="button" :disabled="atMaxTasks" @click="addTask()"
                    class="flex w-full items-center gap-2 py-2 text-left text-blue-500 transition-opacity disabled:cursor-not-allowed disabled:opacity-50">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                        <PlusIcon class="h-3.5 w-3.5" />
                    </span>
                    <span class="text-[13px] font-medium">{{ t('lng_todo_add_title') }}</span>
                </button>

                <p v-if="atMaxTasks" class="text-xs text-amber-600 dark:text-amber-400">
                    {{ t('lng_todo_create_maximum') }}
                </p>
                <p v-else-if="remainingTasks <= 5" class="text-xs text-gray-400">
                    {{ t('lng_todo_create_limit', { count: remainingTasks }) }}
                </p>
                <p v-if="touched && validTaskCount === 0" class="text-xs text-red-500">
                    {{ t('lng_todo_choose_tasks') }}
                </p>
            </div>

            <!-- 权限设置：只有群组清单才有「其他人」可授权，私聊不显示 -->
            <div v-if="isGroupTarget" class="space-y-1 border-t border-gray-200 pt-3 dark:border-gray-700">
                <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {{ t('lng_todo_create_settings') }}
                </p>
                <label class="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 select-none">
                    <input v-model="allowAdd" type="checkbox"
                        class="h-4 w-4 rounded border-gray-300 text-sky-500 focus:ring-sky-400 dark:border-gray-600 dark:bg-gray-900" />
                    <span class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_todo_create_allow_add') }}</span>
                </label>
                <label class="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 select-none">
                    <input v-model="allowMark" type="checkbox"
                        class="h-4 w-4 rounded border-gray-300 text-sky-500 focus:ring-sky-400 dark:border-gray-600 dark:bg-gray-900" />
                    <span class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_todo_create_allow_mark') }}</span>
                </label>
            </div>
        </div>

        <!-- 自定义 emoji 选择器：Teleport 到 body，避免被弹窗滚动区裁切 -->
        <Teleport to="body">
            <div v-if="emojiOpen" ref="emojiPanelRef"
                class="fixed z-[10050] flex h-96 w-80 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900"
                :style="emojiStyle" @pointerdown.stop>
                <EmojiDrawer :is-premium="isPremium" @pick-emoji="onPickEmoji"
                    @pick-custom-emoji="onPickCustomEmoji" />
            </div>
        </Teleport>

        <template #footer>
            <BaseButton type="button" variant="ghost" size="sm" @click="close">{{ t('lng_cancel') }}</BaseButton>
            <BaseButton type="button" variant="primary" size="sm" :disabled="!canSubmit" @click="submit">
                {{ t('lng_todo_create_button') }}
            </BaseButton>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus as PlusIcon, Menu as MenuIcon, Smile as SmileIcon, X as XIcon } from 'lucide-vue-next';
import { VueDraggable } from 'vue-draggable-plus';
import ModalDialog from '../../ui/modal/ModalDialog.vue';
import BaseButton from '../../ui/button/BaseButton.vue';
import PollRichInput from './PollRichInput.vue';
import EmojiDrawer from './stickerPanel/EmojiDrawer.vue';
import { tdlibSend } from '../../../utils/session/tdlib';
import { buildPollFormattedText, type PollEmoji } from '../../../utils/chat/pollFormatting';
import type { chat, inputChecklistTask, inputMessageChecklist } from 'tdlib-types';

const props = defineProps<{
    modelValue: boolean;
    chat?: chat;
    isPremium?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    /** 已组装好的清单消息，由父组件负责发送 */
    (e: 'submit', checklist: inputMessageChecklist): void;
}>();

const { t } = useI18n();

/** getOption 读取失败时的兜底，与 TDLib 默认值一致 */
const DEFAULT_TITLE_MAX = 255;
const DEFAULT_TASK_TEXT_MAX = 100;
const DEFAULT_TASK_COUNT_MAX = 30;

const titleMax = ref(DEFAULT_TITLE_MAX);
const taskTextMax = ref(DEFAULT_TASK_TEXT_MAX);
const taskCountMax = ref(DEFAULT_TASK_COUNT_MAX);

const title = ref('');
const titleEmojis = ref<PollEmoji[]>([]);

interface TaskRow {
    id: number;
    text: string;
    /** 与文字中的占位字符一一对应，发送时转成 textEntityTypeCustomEmoji */
    emojis: PollEmoji[];
}

let rowSeq = 0;
const tasks = ref<TaskRow[]>([{ id: ++rowSeq, text: '', emojis: [] }]);

const allowAdd = ref(false);
const allowMark = ref(false);

/** 校验提示只在用户动过表单后出现：一打开就满屏红字太吵 */
const touched = ref(false);

/** 当前聚焦的任务行：只有这一行显示 emoji 按钮（与投票选项一致） */
const activeTaskId = ref<number | null>(null);

/** PollRichInput 暴露的 API（模板 ref 用） */
interface RichFieldApi {
    insertEmoji(emoji: string): void;
    insertCustomEmoji(id: string, alt: string): void;
    focus(): void;
    focusAtEnd(): void;
}

const titleRef = ref<RichFieldApi | null>(null);
/** 任务输入框按行 id 登记，供聚焦/删除后回焦使用（DOM 引用不必响应式） */
const taskInputs = new Map<number, RichFieldApi>();

const emojiOpen = ref(false);
const emojiTarget = ref<EmojiTarget | null>(null);
const emojiStyle = ref<Record<string, string>>({});
const emojiPanelRef = ref<HTMLElement | null>(null);

const premiumBlocked = computed(() => props.isPremium === false);

/** 群组（基本群 / 非频道超级群）；频道本身不能发清单，按私聊处理 */
const isGroupTarget = computed(() => {
    const type = props.chat?.type;
    if (!type) return false;
    return type._ === 'chatTypeBasicGroup'
        || (type._ === 'chatTypeSupergroup' && !type.is_channel);
});

/** 过滤空白行后的任务文本，既用于校验也用于构造 payload */
const validTasks = computed(() =>
    tasks.value
        .map((row) => ({ row, text: row.text.trim() }))
        .filter((item) => item.text.length > 0),
);
const validTaskCount = computed(() => validTasks.value.length);
const atMaxTasks = computed(() => tasks.value.length >= taskCountMax.value);
const remainingTasks = computed(() => Math.max(taskCountMax.value - tasks.value.length, 0));

const canSubmit = computed(() =>
    !premiumBlocked.value
    && !!title.value.trim()
    && validTaskCount.value > 0
    && tasks.value.length <= taskCountMax.value,
);

/** 打开时重置成新表单；关闭由 close() 统一回传 */
watch(
    () => props.modelValue,
    (open) => {
        if (open) reset();
    },
    { immediate: true },
);

function reset() {
    title.value = '';
    titleEmojis.value = [];
    tasks.value = [{ id: ++rowSeq, text: '', emojis: [] }];
    activeTaskId.value = tasks.value[0]?.id ?? null;
    allowAdd.value = false;
    // 群组默认放开「他人勾选完成」，私聊默认关闭
    allowMark.value = isGroupTarget.value;
    touched.value = false;
    taskInputs.clear();
    closeEmojiPicker();
    void loadLimits();
    void focusTask(0);
}

/** 读取 TDLib 限制值；单个 key 失败只回退该值的默认值 */
async function loadLimits() {
    const [titleLimit, textLimit, countLimit] = await Promise.all([
        readIntOption('checklist_title_length_max', DEFAULT_TITLE_MAX),
        readIntOption('checklist_task_text_length_max', DEFAULT_TASK_TEXT_MAX),
        readIntOption('checklist_task_count_max', DEFAULT_TASK_COUNT_MAX),
    ]);
    titleMax.value = titleLimit;
    taskTextMax.value = textLimit;
    taskCountMax.value = countLimit;
    // 服务端上限可能比本地默认更小：裁掉超出的行
    if (tasks.value.length > countLimit) tasks.value.splice(countLimit);
}

async function readIntOption(name: string, fallback: number): Promise<number> {
    try {
        const res = await tdlibSend({ _: 'getOption', name });
        if (res._ === 'optionValueInteger') {
            const n = Number(res.value);
            if (Number.isFinite(n) && n > 0) return n;
        }
    } catch {
        // 读取失败静默走默认值
    }
    return fallback;
}

function registerTaskInput(id: number, el: unknown) {
    if (el && typeof (el as RichFieldApi).focus === 'function') taskInputs.set(id, el as RichFieldApi);
    else taskInputs.delete(id);
}

/** 聚焦指定行；caretToEnd 用于删除后把光标放到上一行末尾 */
async function focusTask(index: number, caretToEnd = false) {
    await nextTick();
    const row = tasks.value[index];
    if (!row) return;
    const field = taskInputs.get(row.id);
    if (!field) return;
    if (caretToEnd) field.focusAtEnd();
    else field.focus();
}

function addTask(afterIndex = tasks.value.length - 1) {
    if (atMaxTasks.value) return;
    const insertAt = Math.min(afterIndex + 1, tasks.value.length);
    const row: TaskRow = { id: ++rowSeq, text: '', emojis: [] };
    tasks.value.splice(insertAt, 0, row);
    activeTaskId.value = row.id;
    void focusTask(insertAt);
}

/** Enter：在当前行后插入新行并聚焦（到上限时保持原样） */
function onTaskEnter(index: number) {
    addTask(index);
}

/** 空行 Backspace 删行；输入法组词期间的 Backspace 属于候选词操作，不能删行 */
function onTaskBackspace(index: number, e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    const row = tasks.value[index];
    if (!row || row.text) return;
    if (tasks.value.length <= 1) return;
    e.preventDefault();
    removeTask(index);
    void focusTask(Math.max(index - 1, 0), true);
}

function removeTask(index: number) {
    if (tasks.value.length <= 1) return;
    const [row] = tasks.value.splice(index, 1);
    if (!row) return;
    taskInputs.delete(row.id);
    if (activeTaskId.value === row.id) {
        activeTaskId.value = tasks.value[Math.min(index, tasks.value.length - 1)]?.id ?? null;
    }
}

/** 清单 payload：任务 id 从 1 连续编号，空白行不发送；标题 / 任务都带自定义 emoji 实体 */
function buildChecklist(): inputMessageChecklist {
    return {
        _: 'inputMessageChecklist',
        checklist: {
            _: 'inputChecklist',
            title: buildPollFormattedText(title.value.trim(), titleEmojis.value),
            tasks: validTasks.value.map(({ row, text }, i): inputChecklistTask => ({
                _: 'inputChecklistTask',
                id: i + 1,
                text: buildPollFormattedText(text, row.emojis),
            })),
            others_can_add_tasks: allowAdd.value,
            others_can_mark_tasks_as_done: allowMark.value,
        },
    };
}

// ==================== 自定义 emoji 选择器 ====================

type EmojiTarget = { kind: 'title' } | { kind: 'task'; id: number };

function getField(target: EmojiTarget): RichFieldApi | null {
    return target.kind === 'title' ? titleRef.value : taskInputs.get(target.id) ?? null;
}

function openEmojiPicker(target: EmojiTarget, event: MouseEvent) {
    const button = event.currentTarget as HTMLElement | null;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 320;
    const height = 384;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - height - 6);
    }
    emojiStyle.value = { left: `${left}px`, top: `${top}px` };
    emojiTarget.value = target;
    emojiOpen.value = true;
    void nextTick(() => window.addEventListener('pointerdown', onEmojiOutside, true));
}

function closeEmojiPicker() {
    emojiOpen.value = false;
    emojiTarget.value = null;
    window.removeEventListener('pointerdown', onEmojiOutside, true);
}

function onEmojiOutside(event: PointerEvent) {
    if (emojiPanelRef.value?.contains(event.target as Node)) return;
    closeEmojiPicker();
}

function onPickEmoji(emoji: string) {
    const target = emojiTarget.value;
    if (target) getField(target)?.insertEmoji(emoji);
    closeEmojiPicker();
}

function onPickCustomEmoji(id: string, alt: string) {
    const target = emojiTarget.value;
    if (target) getField(target)?.insertCustomEmoji(id, alt);
    closeEmojiPicker();
}

onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onEmojiOutside, true);
});

function submit() {
    touched.value = true;
    if (!canSubmit.value) return;
    emit('submit', buildChecklist());
    close();
}

function close() {
    closeEmojiPicker();
    emit('update:modelValue', false);
}
</script>
