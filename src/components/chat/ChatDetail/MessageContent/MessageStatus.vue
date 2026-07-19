<template>
    <span class="inline-flex items-center gap-0.5" :class="containerClass">
        <!-- Author signature -->
        <span v-if="authorSignature" class="truncate max-w-[80px]" :title="authorSignature">
            {{ authorSignature }}
        </span>

        <!-- View count -->
        <span v-if="viewCount !== undefined && viewCount > 0" class="flex items-center gap-0.5">
            <EyeIcon class="w-3 h-3" />
            {{ viewCount }}
        </span>

        <!-- Time -->
        <span>{{ formatTime(date) }}</span>

        <!-- Sending status for outgoing messages -->
        <span v-if="isOutgoing" class="flex items-center">
            <!-- Pending (sending) -->
            <ClockFadingIcon v-if="sendingState?._ === 'messageSendingStatePending'"
                class="w-3.5 h-3.5 animate-pulse text-blue-200" />

            <!-- Failed -->
            <InfoIcon v-else-if="sendingState?._ === 'messageSendingStateFailed'" class="w-3.5 h-3.5 text-red-400" />

            <!-- Sent successfully - Check or CheckCheck (TDLib doesn't distinguish, use is_outgoing) -->
            <CheckCheckIcon v-else class="w-3.5 h-3.5 text-blue-200" />
        </span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageSendingState } from 'tdlib-types';
import formatTime from '../../../../utils/formatTime';
import {
    EyeIcon,
    ClockFading as ClockFadingIcon,
    Info as InfoIcon,
    CheckCheck as CheckCheckIcon,
} from 'lucide-vue-next';

const props = defineProps<{
    /** Unix timestamp */
    date: number;
    /** Whether the message is outgoing */
    isOutgoing: boolean;
    /** Sending state (pending/failed) */
    sendingState?: MessageSendingState;
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
    return 'text-[10px] leading-none';
});
</script>
