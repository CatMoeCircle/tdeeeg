<template>
    <div class="min-w-[200px] max-w-[340px] select-text">
        <!-- 标题 -->
        <div class="mb-2 flex items-start gap-1.5">
            <ListIcon class="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
            <h3 class="min-w-0 break-words text-sm font-semibold leading-5">
                <template v-for="(seg, si) in splitFormattedText(list.title)" :key="si">
                    <CustomEmojiInline v-if="seg.customEmojiId" :emoji-id="seg.customEmojiId" :size="18"
                        :fallback-text="seg.text" />
                    <SpoilerSpan v-else-if="seg.isSpoiler">{{ seg.text }}</SpoilerSpan>
                    <span v-else :class="seg.className">{{ seg.text }}</span>
                </template>
            </h3>
        </div>

        <!-- 任务列表 -->
        <div class="space-y-0.5">
            <div v-for="task in list.tasks" :key="task.id"
                class="group -mx-1 flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 transition-colors"
                :class="canMarkDone ? 'hover:bg-black/5 dark:hover:bg-white/10' : 'cursor-default'" role="checkbox"
                :aria-checked="isTaskDone(task)" :aria-disabled="!canMarkDone" @click="onToggleTask(task)">
                <!-- 复选框 -->
                <span class="mt-0.5 shrink-0"
                    :class="{ 'pointer-events-none': !canMarkDone || pendingTasks.has(task.id) }">
                    <span v-if="isTaskDone(task)"
                        class="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-blue-500 text-white transition-colors">
                        <CheckIcon class="h-3 w-3" :stroke-width="3" />
                    </span>
                    <span v-else
                        class="block h-[18px] w-[18px] rounded-[5px] border-2 border-gray-300 transition-colors dark:border-gray-600 group-hover:border-blue-400 dark:group-hover:border-blue-400" />
                </span>
                <!-- 任务文本 -->
                <span class="min-w-0 flex-1 text-sm leading-5 break-words" :class="isTaskDone(task)
                    ? 'line-through text-gray-400 dark:text-gray-500'
                    : 'text-gray-800 dark:text-gray-200'">
                    <template v-for="(seg, si) in splitFormattedText(task.text)" :key="si">
                        <CustomEmojiInline v-if="seg.customEmojiId" :emoji-id="seg.customEmojiId" :size="18"
                            :fallback-text="seg.text" />
                        <SpoilerSpan v-else-if="seg.isSpoiler">{{ seg.text }}</SpoilerSpan>
                        <span v-else :class="seg.className">{{ seg.text }}</span>
                    </template>
                </span>
            </div>
        </div>

        <!-- 进度条 + 统计 -->
        <div class="mt-2.5">
            <div class="h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div class="h-full rounded-full bg-blue-500 transition-all duration-300"
                    :style="{ width: progressPct + '%' }" />
            </div>
            <div class="mt-1.5 text-[11px] leading-none text-gray-400 dark:text-gray-500">
                <span>{{ doneCount }}/{{ totalCount }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { checklistTask, formattedText, messageChecklist, textEntity } from 'tdlib-types';
import { MessagePlugin } from 'tdesign-vue-next';
import { CheckIcon, ListIcon } from 'lucide-vue-next';
import CustomEmojiInline from './CustomEmojiInline.vue';
import SpoilerSpan from './SpoilerSpan.vue';
import { tdlibSend } from '../../../../utils/tdlib';

const props = defineProps<{
    content: messageChecklist;
    chatId?: number;
    messageId?: number;
    /** 是否为当前用户发送（影响完成态文字配色） */
    isSelf?: boolean;
}>();

const list = computed(() => props.content.list);
const totalCount = computed(() => list.value.tasks.length);
const doneCount = computed(() => list.value.tasks.filter(t => isTaskDone(t)).length);
const progressPct = computed(() => {
    if (totalCount.value === 0) return 0;
    return Math.round((doneCount.value / totalCount.value) * 100);
});

/** 当前用户是否有权限勾选任务（受 Premium 限制，见 TDLib checklist.can_mark_tasks_as_done） */
const canMarkDone = computed(
    () => !!props.content.list.can_mark_tasks_as_done && !!props.chatId && !!props.messageId,
);

// ==================== 富文本分段渲染 ====================

type Seg = {
    text: string;
    className: string;
    customEmojiId?: string;
    /** 是否为剧透（点击后揭示显示） */
    isSpoiler?: boolean;
};

/** 将 formattedText 按实体边界切分（支持加粗/斜体/下划线/删除线/剧透/自定义 emoji） */
function splitFormattedText(ft?: formattedText | null): Seg[] {
    if (!ft || !ft.text) return [];
    const text = ft.text;
    const clamp = (v: number) => Math.max(0, Math.min(text.length, v));
    const entities = (ft.entities ?? [])
        .map(e => ({ start: clamp(e.offset), end: clamp(e.offset + e.length), entity: e }))
        .filter(i => i.end > i.start);

    const boundaries = new Set<number>([0, text.length]);
    for (const e of entities) {
        boundaries.add(e.start);
        boundaries.add(e.end);
    }
    const offsets = [...boundaries].sort((a, b) => a - b);

    return offsets.slice(0, -1).map((start, index) => {
        const end = offsets[index + 1];
        const segText = text.slice(start, end);
        const active = entities
            .filter(e => e.start <= start && e.end >= end)
            .map(e => e.entity);

        const emoji = active.find(e => e.type._ === 'textEntityTypeCustomEmoji');
        if (emoji) {
            return {
                text: segText,
                className: '',
                customEmojiId: String((emoji.type as any).custom_emoji_id),
            };
        }
        const isSpoiler = active.some(e => e.type._ === 'textEntityTypeSpoiler');
        return { text: segText, className: active.map(entityClass).filter(Boolean).join(' '), customEmojiId: undefined, isSpoiler };
    });
}

function entityClass(e: textEntity): string {
    switch (e.type._) {
        case 'textEntityTypeBold': return 'font-semibold';
        case 'textEntityTypeItalic': return 'italic';
        case 'textEntityTypeUnderline': return 'underline';
        case 'textEntityTypeStrikethrough': return 'line-through';
        // 剧透由独立组件（SpoilerSpan）处理，此处不附加样式
        case 'textEntityTypeSpoiler': return '';
        default: return '';
    }
}

// ==================== 勾选任务 ====================

/** 乐观更新：task.id -> 完成态，服务端回包后清空 */
const optimisticDone = ref<Map<number, boolean>>(new Map());
/** 正在请求中的任务（防重复点击） */
const pendingTasks = ref<Set<number>>(new Set());

function isTaskDone(task: checklistTask): boolean {
    if (optimisticDone.value.has(task.id)) return optimisticDone.value.get(task.id)!;
    return task.completion_date > 0;
}

// 服务端 updateMessageContent 推来新内容后清空乐观状态，以服务端为准
watch(
    () => props.content,
    () => {
        optimisticDone.value = new Map();
    },
    { deep: true },
);

async function onToggleTask(task: checklistTask) {
    if (!canMarkDone.value || pendingTasks.value.has(task.id)) return;
    const next = !isTaskDone(task);
    // 乐观更新，立即反馈 UI
    optimisticDone.value = new Map(optimisticDone.value).set(task.id, next);
    pendingTasks.value.add(task.id);
    try {
        // 注：src/types/tdlib-types.d.ts 中该函数签名有误（误用了更新事件的字段），
        // 真实 TDLib API 为 task_ids + is_done，故此处断言规避类型错误
        await tdlibSend({
            _: 'markChecklistTasksAsDone',
            chat_id: props.chatId,
            message_id: props.messageId,
            task_ids: [task.id],
            is_done: next,
        } as any);
    } catch {
        optimisticDone.value.delete(task.id);
        MessagePlugin.error('标记任务失败，请重试');
    } finally {
        pendingTasks.value.delete(task.id);
    }
}
</script>
