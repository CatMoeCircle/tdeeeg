<template>
    <div class="min-w-50 max-w-85 select-text">
        <!-- 标题 -->
        <div class="mb-2 flex items-start gap-1.5">
            <h3 class="min-w-0 wrap-break-word text-sm font-semibold leading-5">
                <template v-for="(seg, si) in splitFormattedText(poll.question)" :key="si">
                    <CustomEmojiInline v-if="seg.customEmojiId" :emoji-id="seg.customEmojiId" :size="18"
                        :fallback-text="seg.text" />
                    <span v-else :class="seg.className">{{ seg.text }}</span>
                </template>
            </h3>
        </div>

        <!-- 描述 -->
        <p v-if="content.description?.text"
            class="mb-2 -mt-1 text-xs leading-4 wrap-break-word text-gray-500 dark:text-gray-400">
            <template v-for="(seg, si) in splitFormattedText(content.description)" :key="si">
                <CustomEmojiInline v-if="seg.customEmojiId" :emoji-id="seg.customEmojiId" :size="14"
                    :fallback-text="seg.text" />
                <span v-else :class="seg.className">{{ seg.text }}</span>
            </template>
        </p>

        <!-- 未投票：选择界面 -->
        <div v-if="!showResults" class="space-y-0.5">
            <div v-for="(option, index) in poll.options" :key="option.id"
                class="group -mx-1 flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 transition-colors"
                :class="canVote ? 'hover:bg-black/5 dark:hover:bg-white/10' : 'cursor-default'" role="checkbox"
                :aria-checked="isSelected(index)" :aria-disabled="!canVote" @click="onToggleOption(index)">
                <!-- 选择框：单选圆形 / 多选方形 -->
                <span class="mt-0.5 shrink-0" :class="{ 'pointer-events-none': !canVote }">
                    <span v-if="isSelected(index)"
                        class="flex h-4.5 w-4.5 items-center justify-center bg-blue-500 text-white transition-colors"
                        :class="poll.allows_multiple_answers ? 'rounded-[5px]' : 'rounded-full'">
                        <CheckIcon class="h-3 w-3" :stroke-width="3" />
                    </span>
                    <span v-else
                        class="block h-4.5 w-4.5 border-2 border-gray-300 transition-colors dark:border-gray-600"
                        :class="[
                            poll.allows_multiple_answers ? 'rounded-[5px]' : 'rounded-full',
                            canVote ? 'group-hover:border-blue-400 dark:group-hover:border-blue-400' : '',
                        ]" />
                </span>
                <!-- 选项文本 -->
                <span class="min-w-0 flex-1 text-sm leading-5 wrap-break-word text-gray-800 dark:text-gray-200">
                    <template v-for="(seg, si) in splitFormattedText(option.text)" :key="si">
                        <CustomEmojiInline v-if="seg.customEmojiId" :emoji-id="seg.customEmojiId" :size="18"
                            :fallback-text="seg.text" />
                        <span v-else :class="seg.className">{{ seg.text }}</span>
                    </template>
                </span>
            </div>

            <!-- 投票按钮 -->
            <button v-if="canVote" type="button" :disabled="!canSubmitVote"
                class="mt-2 w-full rounded-lg bg-blue-500 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 active:opacity-80 disabled:cursor-default disabled:opacity-40"
                @click="onVote">
                {{ voting || beingChosen ? '投票中…' : '投票' }}
            </button>
            <!-- 不可投票原因 -->
            <p v-else-if="restrictionText" class="mt-1.5 text-xs leading-4 text-gray-400 dark:text-gray-500">
                {{ restrictionText }}
            </p>
        </div>

        <!-- 已投票：结果界面（百分比在最前；✓ 在进度条前面；进度条与上方选项文字左对齐） -->
        <div v-else class="space-y-1.5">
            <div v-for="option in poll.options" :key="option.id">
                <div class="flex items-start gap-2">
                    <!-- 百分比 + ✓：同一列，自然宽度左对齐，无前置空白 -->
                    <div class="flex shrink-0 flex-col items-start pt-0.5">
                        <span class="text-xs leading-5 text-gray-400 dark:text-gray-500">
                            {{ option.vote_percentage }}%
                        </span>
                        <CheckCircleIcon v-if="option.is_chosen" class="-mt-0.5 h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <!-- 选项文字 + 投该选项的最近投票者头像 -->
                        <div class="flex items-start justify-between gap-2 text-sm leading-5">
                            <span class="min-w-0 wrap-break-word text-gray-800 dark:text-gray-200">
                                <template v-for="(seg, si) in splitFormattedText(option.text)" :key="si">
                                    <CustomEmojiInline v-if="seg.customEmojiId" :emoji-id="seg.customEmojiId" :size="18"
                                        :fallback-text="seg.text" />
                                    <span v-else :class="seg.className">{{ seg.text }}</span>
                                </template>
                            </span>
                            <!-- 头像：非匿名且有结果时才有数据 -->
                            <span v-if="optionVoters(option).length" class="mt-0.5 flex shrink-0 -space-x-1.5">
                                <span v-for="v in optionVoters(option)" :key="senderKey(v)"
                                    class="inline-flex h-4 w-4 overflow-hidden rounded-full ring-2 ring-white dark:ring-gray-800">
                                    <Avatar :photo="getSenderPhoto(v)" :title="getSenderName(v)"
                                        :accentColorId="getSenderProfileAccentColorId(v)"
                                        :deletedAccount="isDeletedSender(v)" />
                                </span>
                            </span>
                        </div>
                        <!-- 进度条：与上方选项文字左对齐（✓ 在左侧列、进度条正前方） -->
                        <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div class="h-full rounded-full bg-blue-500 transition-all duration-500"
                                :style="{ width: option.vote_percentage + '%' }" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- 底部：总票数 + 重新投票 -->
        <div
            class="mt-2.5 flex items-center justify-between gap-2 text-[11px] leading-none text-gray-400 dark:text-gray-500">
            <span class="truncate">{{ totalVotesText }}</span>
            <button v-if="hasVoted && poll.allows_revoting && canVote && showResults" type="button"
                class="shrink-0 font-medium text-blue-500 hover:underline" @click="startRevote">
                重新投票
            </button>
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { formattedText, messagePoll, MessageSender, pollOption, textEntity } from 'tdlib-types';
import { MessagePlugin } from 'tdesign-vue-next';
import { CheckCircleIcon, CheckIcon } from 'lucide-vue-next';
import CustomEmojiInline from '../../../../common/CustomEmojiInline.vue';
import { tdlibSend } from '../../../../../utils/tdlib';
import {
    ensureSenderLoaded,
    getSenderName,
    getSenderPhoto,
    getSenderProfileAccentColorId,
    isDeletedSender,
} from '../../../../../utils/senderInfo';

const props = defineProps<{
    content: messagePoll;
    chatId?: number;
    messageId?: number;
}>();

const poll = computed(() => props.content.poll);
const isMultiple = computed(() => poll.value.allows_multiple_answers);

// ==================== 富文本分段渲染 ====================

type Seg = {
    text: string;
    className: string;
    customEmojiId?: string;
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
        return { text: segText, className: active.map(entityClass).filter(Boolean).join(' '), customEmojiId: undefined };
    });
}

function entityClass(e: textEntity): string {
    switch (e.type._) {
        case 'textEntityTypeBold': return 'font-semibold';
        case 'textEntityTypeItalic': return 'italic';
        case 'textEntityTypeUnderline': return 'underline';
        case 'textEntityTypeStrikethrough': return 'line-through';
        case 'textEntityTypeSpoiler': return 'rounded bg-black/20 px-0.5 dark:bg-white/20';
        default: return '';
    }
}

// ==================== 投票状态 ====================

/** 本地已勾选的选项下标（0-based） */
const selectedIds = ref<Set<number>>(new Set());
/** 是否处于“重新投票”状态 */
const isRevoting = ref(false);
/** 是否有投票请求进行中 */
const voting = ref(false);

/** 当前用户是否已投票 */
const hasVoted = computed(() => poll.value.options.some(o => o.is_chosen));
/** 是否有选项正在被服务端处理（pending setPollAnswer） */
const beingChosen = computed(() => poll.value.options.some(o => o.is_being_chosen));

/** 是否展示结果（进度条）：已关闭或已投票时展示；重新投票时回到选择界面 */
const showResults = computed(() => {
    if (poll.value.is_closed) return true;
    if (isRevoting.value) return false;
    return hasVoted.value;
});

/** 当前用户是否可投票（需要 chat/message 上下文且无投票限制） */
const canVote = computed(() => {
    if (!props.chatId || !props.messageId) return false;
    if (poll.value.is_closed) return false;
    if (poll.value.vote_restriction_reason) return false;
    return true;
});

const canSubmitVote = computed(() => canVote.value && !voting.value && !beingChosen.value && selectedIds.value.size > 0);

/** 不可投票原因文案 */
const restrictionText = computed(() => {
    switch (poll.value.vote_restriction_reason?._) {
        case 'pollVoteRestrictionReasonClosed': return '投票已结束';
        case 'pollVoteRestrictionReasonCountryRestricted': return '你所在的国家/地区无法参与该投票';
        case 'pollVoteRestrictionReasonMembershipRequired': return '加入该群组/频道满一天后才能投票';
        case 'pollVoteRestrictionReasonScheduled': return '定时消息发送后才能投票';
        case 'pollVoteRestrictionReasonYetUnsent': return '消息发送后才能投票';
        default: return '';
    }
});

const totalVotesText = computed(() => {
    const n = poll.value.total_voter_count;
    return n === 0 ? '暂无投票' : `${n} 人投票`;
});

// ==================== 头像数据（pollOption.recent_voter_ids） ====================

/**
 * 投了某选项的最近投票者（最多 5 个）。
 * 仅非匿名投票且结果可见时才有数据（见 TDLib pollOption.recent_voter_ids）；
 * 匿名投票 / 结果不可见时为空数组，自然不显示头像。
 */
function optionVoters(option: pollOption): MessageSender[] {
    if (poll.value.is_anonymous) return [];
    return option.recent_voter_ids.slice(0, 5);
}

function senderKey(s: MessageSender): string {
    return s._ === 'messageSenderUser' ? `u${s.user_id}` : `c${s.chat_id}`;
}

/** 收集所有需要加载头像/名称的发送者：每个选项的最近投票者 */
const avatarSenders = computed<MessageSender[]>(() => {
    const list: MessageSender[] = [];
    for (const o of poll.value.options) {
        list.push(...o.recent_voter_ids);
    }
    return list;
});

watch(
    avatarSenders,
    (senders) => {
        for (const s of senders) void ensureSenderLoaded(s);
    },
    { immediate: true, deep: true },
);

// ==================== 勾选与投票 ====================

function isSelected(index: number): boolean {
    return selectedIds.value.has(index);
}

function onToggleOption(index: number) {
    if (!canVote.value) return;
    const next = new Set(selectedIds.value);
    if (next.has(index)) {
        next.delete(index);
    } else {
        if (!isMultiple.value) next.clear();
        next.add(index);
    }
    selectedIds.value = next;
}

async function onVote() {
    if (!canSubmitVote.value) return;
    const optionIds = [...selectedIds.value].sort((a, b) => a - b);
    voting.value = true;
    try {
        await tdlibSend({
            _: 'setPollAnswer',
            chat_id: props.chatId,
            message_id: props.messageId,
            option_ids: optionIds,
        });
        // 服务端会通过 updateMessageContent 推送最新结果，等待其更新即可
        isRevoting.value = false;
    } catch {
        MessagePlugin.error('投票失败，请重试');
    } finally {
        voting.value = false;
    }
}

function startRevote() {
    // 以当前已选中的选项作为初始勾选状态
    const chosen = new Set<number>();
    poll.value.options.forEach((o, i) => {
        if (o.is_chosen) chosen.add(i);
    });
    selectedIds.value = chosen;
    isRevoting.value = true;
}

// 服务端 updateMessageContent 推送新内容后，重置本地临时状态，以服务端为准
watch(
    () => props.content,
    () => {
        selectedIds.value = new Set();
        isRevoting.value = false;
        voting.value = false;
    },
    { deep: true },
);
</script>
