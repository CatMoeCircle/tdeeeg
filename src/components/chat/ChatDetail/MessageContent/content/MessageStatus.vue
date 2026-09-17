<template>
    <span class="inline-flex items-center gap-0.5" :class="containerClass">
        <!-- Author signature -->
        <span v-if="authorSignature" class="truncate max-w-20" :title="authorSignature">
            {{ authorSignature }}
        </span>

        <!-- View count -->
        <span v-if="viewCount !== undefined && viewCount > 0" class="flex items-center gap-0.5">
            <span>{{ viewCount }}</span>
            <EyeIcon :class="eyeIconClass" />
        </span>

        <!-- Time -->
        <span>{{ formatTime(date) }}</span>

        <!-- Sending status for outgoing messages -->
        <span v-if="isOutgoing" class="flex items-center">
            <!-- Pending (sending) -->
            <ClockFadingIcon v-if="sendingState?._ === 'messageSendingStatePending'"
                :class="statusIconClass" class="animate-pulse text-blue-200" />

            <!-- Failed -->
            <InfoIcon v-else-if="sendingState?._ === 'messageSendingStateFailed'"
                :class="statusIconClass" class="text-red-400" />

            <!-- Read by the recipient -->
            <CheckCheckIcon v-else-if="isRead" :class="statusIconClass" />

            <!-- Sent to the server, but not read yet -->
            <CheckIcon v-else :class="statusIconClass" />
        </span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageSendingState } from 'tdlib-types';
import formatTime from '../../../../../utils/formatTime';
import {
    EyeIcon,
    ClockFading as ClockFadingIcon,
    Info as InfoIcon,
    CheckCheck as CheckCheckIcon,
    Check as CheckIcon,
} from 'lucide-vue-next';

const props = defineProps<{
    /** Unix timestamp */
    date: number;
    /** Whether the message is outgoing */
    isOutgoing: boolean;
    /** Sending state (pending/failed) */
    sendingState?: MessageSendingState;
    /** Whether TDLib reports this outgoing message as read */
    isRead?: boolean;
    /** View count (from interaction_info) */
    viewCount?: number;
    /** Author signature (for channel posts) */
    authorSignature?: string;
    /** Whether this is rendered over media (lighter background capsule) */
    overMedia?: boolean;
}>();

const containerClass = computed(() => {
    if (props.overMedia) {
        return 'text-[10px] leading-none select-none pointer-events-none text-white';
    }
    // 时间 / 观看数 / 已读状态等属于装饰信息，始终不可选中复制（避免与消息正文选择混淆）
    return 'text-[10px] leading-none select-none';
});

// overMedia 时与 10px 时间文字对齐，避免对勾把胶囊撑高
const statusIconClass = computed(() => (props.overMedia ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'));
const eyeIconClass = computed(() => (props.overMedia ? 'w-2.5 h-2.5' : 'w-3 h-3'));
</script>
