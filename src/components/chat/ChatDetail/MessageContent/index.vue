<template>
    <!-- Service messages -->
    <MessageServiceContent v-if="isServiceType" :content="content" />

    <template v-else>
        <!-- Reply preview -->
        <MessageReply v-if="replyTo" :replyTo="replyTo" :isSelf="isSelf ?? false" :chatId="chatId"
            :messageList="messageList" @jump="onJumpToMessage" />

        <!-- Text messages -->
        <MessageTextContent v-if="content._ === 'messageText'" :formattedText="content.text" />

        <!-- Media messages -->
        <MessageMediaContent v-else-if="isMediaType" :content="content as any" :isSelf="isSelf ?? false" :date="date"
            :forwardInfo="forwardInfo" :forwardName="forwardName" :forwardNavigable="forwardNavigable"
            :isFirstInGroup="isFirstInGroup" :isLastInGroup="isLastInGroup" :sendingState="sendingState"
            :isRead="isRead" :viewCount="viewCount" :authorSignature="authorSignature" :chatId="chatId"
            :messageId="messageId" @openForwardSource="onOpenForwardSource" />

        <!-- Stickers / animated emoji are rendered without a message bubble -->
        <div v-else-if="content._ === 'messageSticker' || content._ === 'messageAnimatedEmoji'"
            class="relative inline-block pb-3 align-bottom">
            <MessageStickerContent :content="content" />
            <span v-if="date"
                class="absolute right-1 bottom-3 translate-y-1/2 rounded-md bg-black/55 px-1.5 py-0.4 text-white shadow-sm">
                <MessageStatus :date="date" :isOutgoing="isSelf ?? false" :sendingState="sendingState" :isRead="isRead"
                    :viewCount="viewCount" :authorSignature="authorSignature" overMedia />
            </span>
        </div>

        <!-- Voice / Video notes -->
        <MessageVoiceContent v-else-if="content._ === 'messageVoiceNote' || content._ === 'messageVideoNote'"
            :content="content" />

        <!-- Document / Audio -->
        <MessageFileContent v-else-if="content._ === 'messageDocument' || content._ === 'messageAudio'"
            :content="content" :chatId="chatId" :messageId="messageId" />

        <!-- Other types -->
        <MessageOtherContent v-else :content="content" />
    </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageContent, messageForwardInfo, messageReplyToMessage, MessageSendingState, message } from 'tdlib-types';
import MessageReply from './MessageReply.vue';

import MessageTextContent from './MessageTextContent.vue';
import MessageMediaContent from './MessageMediaContent.vue';
import MessageStickerContent from './MessageStickerContent.vue';
import MessageVoiceContent from './MessageVoiceContent.vue';
import MessageFileContent from './MessageFileContent.vue';
import MessageServiceContent from './MessageServiceContent.vue';
import MessageOtherContent from './MessageOtherContent.vue';
import MessageStatus from './MessageStatus.vue';

const MEDIA_TYPES = new Set([
    'messagePhoto',
    'messageVideo',
    'messageAnimation',
]);

const SERVICE_TYPES = new Set([
    'messageBasicGroupChatCreate',
    'messageSupergroupChatCreate',
    'messageChatChangeTitle',
    'messageChatChangePhoto',
    'messageChatDeletePhoto',
    'messageChatAddMembers',
    'messageChatJoinByLink',
    'messageChatJoinByRequest',
    'messageChatDeleteMember',
    'messageChatUpgradeTo',
    'messageChatUpgradeFrom',
    'messagePinMessage',
    'messageScreenshotTaken',
    'messageChatSetBackground',
    'messageChatSetTheme',
    'messageChatSetMessageAutoDeleteTime',
    'messageChatBoost',
    'messageForumTopicCreated',
    'messageForumTopicEdited',
    'messageForumTopicIsClosedToggled',
    'messageForumTopicIsHiddenToggled',
    'messageSuggestProfilePhoto',
    'messageCustomServiceAction',
    'messageGameScore',
    'messagePaymentSuccessful',
    'messagePaymentSuccessfulBot',
    'messagePaymentRefunded',
    'messageGiftedPremium',
    'messagePremiumGiftCode',
    'messageGiveawayCreated',
    'messageGiveaway',
    'messageGiveawayCompleted',
    'messageGiveawayWinners',
    'messageGiftedStars',
    'messageGiftedTon',
    'messageGiveawayPrizeStars',
    'messageGift',
    'messageUpgradedGift',
    'messageRefundedUpgradedGift',
    'messageContactRegistered',
    'messageUsersShared',
    'messageChatShared',
    'messageBotWriteAccessAllowed',
    'messageWebAppDataSent',
    'messageWebAppDataReceived',
    'messagePassportDataSent',
    'messagePassportDataReceived',
    'messageProximityAlertTriggered',
    'messagePaidMedia',
    'messageChecklist',
    'messageChecklistTasksDone',
    'messageChecklistTasksAdded',
    'messageSuggestedPostApprovalFailed',
    'messageSuggestedPostApproved',
    'messageSuggestedPostDeclined',
    'messageSuggestedPostPaid',
    'messageSuggestedPostRefunded',
    'messageCall',
]);

const props = defineProps<{
    content: MessageContent;
    isSelf?: boolean;
    date?: number;
    forwardInfo?: messageForwardInfo;
    forwardName?: string;
    forwardNavigable?: boolean;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
    sendingState?: MessageSendingState;
    isRead?: boolean;
    viewCount?: number;
    authorSignature?: string;
    chatId?: number;
    messageId?: number;
    replyTo?: messageReplyToMessage;
    messageList?: message[];
}>();

const emit = defineEmits<{
    jumpToMessage: [messageId: number];
    openForwardSource: [];
}>();

function onJumpToMessage(messageId: number) {
    emit('jumpToMessage', messageId);
}

function onOpenForwardSource() {
    emit('openForwardSource');
}

const isServiceType = computed(() => SERVICE_TYPES.has(props.content._));
const isMediaType = computed(() => MEDIA_TYPES.has(props.content._));
</script>
