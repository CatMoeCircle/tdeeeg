<template>
    <div>
        <!-- Location -->
        <!-- 位置地图：与富文本地图块共用同一条渲染链（地图缩略图 + 定位针 + 点击打开地图） -->
        <div v-if="content._ === 'messageLocation'" class="w-80 max-w-full">
            <RichMap :location="content.location" :zoom="14" :chat-id="chatId" />
        </div>

        <!-- Venue -->
        <div v-else-if="content._ === 'messageVenue'" class="flex flex-col gap-1 text-sm">
            <div class="flex items-center gap-2">
                <MapPinIcon class="w-4 h-4 text-red-500 shrink-0" />
                <span class="font-medium">{{ content.venue.title }}</span>
            </div>
            <span class="text-gray-500 text-xs ml-6">{{ content.venue.address }}</span>
        </div>

        <!-- Poll -->
        <MessagePollContent v-else-if="content._ === 'messagePoll'" :content="content" :chat-id="chatId"
            :message-id="messageId" />

        <!-- Game -->
        <div v-else-if="content._ === 'messageGame'" class="text-sm">
            <p class="font-medium">{{ content.game.title }}</p>
            <p class="text-xs text-gray-500">{{ content.game.description }}</p>
        </div>

        <!-- Invoice -->
        <MessageInvoiceContent v-else-if="content._ === 'messageInvoice'" :content="content" :chat-id="chatId"
            :message-id="messageId" :message="message" :topic-id="topicId" :sender-name="senderName" />

        <!-- Call -->
        <!-- 通话结束（messageCall）：主题色圆形图标（tgico U+EA17，白色字形）+ 类型 / 方向箭头 + 时间·时长 -->
        <!-- 固定宽度：所有通话气泡等宽（官方通话记录就是等宽的），右侧留白也就对齐了 -->
        <div v-else-if="content._ === 'messageCall'" class="flex w-56 max-w-full min-w-0 items-center gap-3 py-1">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--app-brand)]">
                <span class="tgico tgico-call text-[26px] leading-none text-white" aria-hidden="true" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-[15px] font-medium leading-snug">{{ callTitle }}</span>
                <span class="flex items-center gap-1 text-[13px] leading-snug">
                    <ArrowUpRight v-if="callOutgoing" class="h-3.5 w-3.5 shrink-0" :class="callArrowClass"
                        :stroke-width="3" />
                    <ArrowDownLeft v-else class="h-3.5 w-3.5 shrink-0" :class="callArrowClass" :stroke-width="3" />
                    <span :class="callTimeClass">{{ callStatus }}</span>
                </span>
            </span>
        </div>

        <!-- 未适配的消息类型：统一走卡片，不再用斜体红字兜底 -->
        <MessageUnsupportedContent v-else :content="content" />

        <!-- 回应（由 MessageContent 默认插槽传入）：放在投票等卡片内容下方 -->
        <slot />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageContent, message } from 'tdlib-types';
import { MapPinIcon, ArrowUpRight, ArrowDownLeft } from 'lucide-vue-next';
import MessagePollContent from './MessagePollContent.vue';
import MessageInvoiceContent from './MessageInvoiceContent.vue';
import MessageUnsupportedContent from './MessageUnsupportedContent.vue';
import RichMap from '../rich/RichMap.vue';
import { callStatusText, callTitleText } from '../../../../../utils/callMessage';
// GlobalEmojiInline removed - using global Apple Color Emoji font

const props = defineProps<{
    content: MessageContent;
    chatId?: number;
    messageId?: number;
    message?: message;
    topicId?: number;
    senderName?: string;
}>();

/** 通话类型文案：拨出未接通「通话已取消」、来电未接通「未接来电」、来电被拒「拒接」 */
const callTitle = computed(() =>
    props.content._ === 'messageCall'
        ? callTitleText(props.content, props.message?.is_outgoing === true)
        : '',
);

/** 通话状态行：时间（今天 / 昨天 / 日期）+ 已接通时的通话时长，画在气泡内容里 */
const callStatus = computed(() =>
    props.content._ === 'messageCall' && props.message
        ? callStatusText(props.content, props.message.date)
        : '',
);

/** 方向箭头：自己拨出朝右上，来电朝左下（与官方通话记录一致） */
const callOutgoing = computed(() => props.message?.is_outgoing === true);

/** 未接通（取消 / 未接 / 拒接）用红色箭头，接通用绿色 */
const callArrowClass = computed(() => {
    const reason = props.content._ === 'messageCall' ? props.content.discard_reason._ : '';
    const missed = reason === 'callDiscardReasonMissed' || reason === 'callDiscardReasonDeclined';
    return missed ? 'text-[#dd5849]' : 'text-[#4fa54f]';
});

/** 状态行时间 / 时长：官方绿色 */
const callTimeClass = 'text-[#6dc264]';
</script>
