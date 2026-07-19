<template>
    <!-- Service messages -->
    <MessageServiceContent v-if="isServiceType" :content="content" />

    <template v-else>
        <!-- Reply preview -->
        <MessageReply v-if="replyTo" :replyTo="replyTo" :isSelf="isSelf ?? false" :chatId="chatId"
            :messageList="messageList" @jump="onJumpToMessage" />

        <!-- Text messages -->
        <MessageTextContent v-if="content._ === 'messageText'" :text="content.text.text" />

        <!-- Media messages -->
        <MessageMediaContent v-else-if="isMediaType" :content="content as any" :isSelf="isSelf ?? false" :date="date"
            :forwardInfo="forwardInfo" :isFirstInGroup="isFirstInGroup" :isLastInGroup="isLastInGroup"
            :sendingState="sendingState" :viewCount="viewCount" :authorSignature="authorSignature" :chatId="chatId"
            :messageId="messageId" />

        <!-- Stickers -->
        <MessageStickerContent v-else-if="content._ === 'messageSticker'" :content="content" />

        <!-- Voice / Video notes -->
        <MessageVoiceContent v-else-if="content._ === 'messageVoiceNote' || content._ === 'messageVideoNote'"
            :content="content as any" />

        <!-- Document / Audio -->
        <MessageFileContent v-else-if="content._ === 'messageDocument' || content._ === 'messageAudio'"
            :content="content as any" :chatId="chatId" :messageId="messageId" />

        <!-- Other types -->
        <MessageOtherContent v-else :content="content" />
    </template>
</template>

<script setup lang="ts">
import type { MessageContent, messageForwardInfo, messageReplyToMessage, MessageSendingState, message } from 'tdlib-types';
import MessageReply from './MessageReply.vue';

import MessageTextContent from './MessageTextContent.vue';
import MessageMediaContent from './MessageMediaContent.vue';
import MessageStickerContent from './MessageStickerContent.vue';
import MessageVoiceContent from './MessageVoiceContent.vue';
import MessageFileContent from './MessageFileContent.vue';
import MessageServiceContent from './MessageServiceContent.vue';
import MessageOtherContent from './MessageOtherContent.vue';

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
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
    sendingState?: MessageSendingState;
    viewCount?: number;
    authorSignature?: string;
    chatId?: number;
    messageId?: number;
    replyTo?: messageReplyToMessage;
    messageList?: message[];
}>();

const emit = defineEmits<{
    jumpToMessage: [messageId: number];
}>();

function onJumpToMessage(messageId: number) {
    emit('jumpToMessage', messageId);
}

const isServiceType = SERVICE_TYPES.has(props.content._);
const isMediaType = MEDIA_TYPES.has(props.content._);
</script>
