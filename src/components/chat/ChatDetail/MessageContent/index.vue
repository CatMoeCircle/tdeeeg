<template>
    <!-- Service messages -->
    <MessageServiceContent v-if="isServiceType" :content="content" />

    <template v-else>
        <!-- Reply preview -->
        <MessageReply v-if="replyTo && !isStickerLikeContent" :replyTo="replyTo" :isSelf="isSelf ?? false"
            :chatId="chatId" :messageList="messageList" :accentColorId="accentColorId" @jump="onJumpToMessage" />

        <!-- Text messages -->
        <MessageTextContent v-if="content._ === 'messageText'" :formattedText="content.text"
            :accentColorId="accentColorId" />

        <!-- Rich messages -->
        <MessageRichMessage v-else-if="content._ === 'messageRichMessage'" :blocks="content.message.blocks"
            :is-rtl="content.message.is_rtl" />

        <!-- Media messages -->
        <MessageMediaContent v-else-if="isMediaType" :content="content as any" :isSelf="isSelf ?? false" :date="date"
            :forwardInfo="forwardInfo" :forwardName="forwardName" :forwardNavigable="forwardNavigable"
            :isFirstInGroup="isFirstInGroup" :isLastInGroup="isLastInGroup" :sendingState="sendingState"
            :isRead="isRead" :viewCount="viewCount" :authorSignature="authorSignature" :chatId="chatId"
            :messageId="messageId" @openForwardSource="onOpenForwardSource" />

        <!-- Stickers / animated emoji are rendered without a message bubble.
             回复预览显示在贴纸旁边（小宽度），而非贴纸上方 -->
        <div v-else-if="isStickerLikeContent" class="flex items-end gap-1.5 pb-2">
            <!-- 自己消息：贴纸在右，回复在左 -->
            <template v-if="isSelf">
                <div v-if="replyTo" class="w-40 shrink-0">
                    <MessageReply :replyTo="replyTo" :isSelf="true" :chatId="chatId" :messageList="messageList"
                        :accentColorId="accentColorId" @jump="onJumpToMessage" />
                </div>
                <div class="relative inline-block align-bottom">
                    <MessageStickerContent :content="stickerContent" />
                    <span v-if="date && !settings.sticker.hideTimestamp"
                        class="absolute right-1 bottom-3 translate-y-1/2 rounded-md bg-black/55 px-1.5 py-0.4 text-white shadow-sm">
                        <MessageStatus :date="date" :isOutgoing="true" :sendingState="sendingState" :isRead="isRead"
                            :viewCount="viewCount" :authorSignature="authorSignature" overMedia />
                    </span>
                </div>
            </template>
            <!-- 他人消息：贴纸在左，回复在右 -->
            <template v-else>
                <div class="relative inline-block align-bottom">
                    <MessageStickerContent :content="stickerContent" />
                    <span v-if="date && !settings.sticker.hideTimestamp"
                        class="absolute right-1 bottom-3 translate-y-1/2 rounded-md bg-black/55 px-1.5 py-0.4 text-white shadow-sm">
                        <MessageStatus :date="date" :isOutgoing="false" :sendingState="sendingState" :isRead="isRead"
                            :viewCount="viewCount" :authorSignature="authorSignature" overMedia />
                    </span>
                </div>
                <div v-if="replyTo" class="w-40 shrink-0">
                    <MessageReply :replyTo="replyTo" :isSelf="false" :chatId="chatId" :messageList="messageList"
                        :accentColorId="accentColorId" @jump="onJumpToMessage" />
                </div>
            </template>
        </div>

        <!-- Voice / Video notes -->
        <MessageVoiceContent v-else-if="content._ === 'messageVoiceNote' || content._ === 'messageVideoNote'"
            :content="content" :chatId="chatId" :messageId="messageId" />

        <!-- Document / Audio -->
        <MessageFileContent v-else-if="content._ === 'messageDocument' || content._ === 'messageAudio'"
            :content="content" :chatId="chatId" :messageId="messageId" />

        <!-- Other types -->
        <MessageOtherContent v-else :content="content" />
    </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageContent, messageForwardInfo, messageReplyToMessage, MessageSendingState, message, messageSticker, messageAnimatedEmoji } from 'tdlib-types';
import MessageReply from './MessageReply.vue';

import MessageTextContent from './MessageTextContent.vue';
import MessageRichMessage from './MessageRichMessage.vue';
import MessageMediaContent from './MessageMediaContent.vue';
import MessageStickerContent from './MessageStickerContent.vue';
import MessageVoiceContent from './MessageVoiceContent.vue';
import MessageFileContent from './MessageFileContent.vue';
import MessageServiceContent from './MessageServiceContent.vue';
import MessageOtherContent from './MessageOtherContent.vue';
import MessageStatus from './MessageStatus.vue';
import { settings } from '../../../../store/settings';

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
    /** 发送者 accent_color_id（用于回复栏/引用标记配色） */
    accentColorId?: number;
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
/** 贴纸 / 动画表情：无气泡渲染，回复显示在贴纸旁边（小宽度） */
const isStickerLikeContent = computed(
    () => props.content._ === 'messageSticker' || props.content._ === 'messageAnimatedEmoji',
);
/** 贴纸 / 动画表情的窄化内容（供 MessageStickerContent 使用） */
const stickerContent = computed<messageSticker | messageAnimatedEmoji>(
    () => props.content as messageSticker | messageAnimatedEmoji,
);
</script>
