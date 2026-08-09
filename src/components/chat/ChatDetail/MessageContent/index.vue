<template>
    <!-- Service messages -->
    <MessageGiveawayContent v-if="content._ === 'messageGiveaway'" :content="content" :date="date" />

    <MessageGiveawayWinnersContent v-else-if="content._ === 'messageGiveawayWinners'" :content="content"
        :messageList="messageList" />

    <MessageGiftContent v-else-if="content._ === 'messageGift'" :content="content" :date="date" />

    <MessageServiceContent v-else-if="isServiceType" :content="content" :senderName="senderName"
        :messageList="messageList" @jump="onServiceJump" />

    <template v-else>
        <!-- Reply preview（媒体消息的回复预览由 MessageMediaContent 在媒体宽度容器内渲染，避免撑宽 w-fit 气泡） -->
        <MessageReply v-if="replyTo && !isStickerLikeContent && !isMediaType" :replyTo="replyTo"
            :isSelf="isSelf ?? false" :chatId="chatId" :messageList="messageList" :accentColorId="accentColorId"
            @jump="onJumpToMessage" />

        <!-- Text messages -->
        <MessageTextContent v-if="content._ === 'messageText'" :formattedText="content.text"
            :linkPreview="content.link_preview" :accentColorId="accentColorId" :showInlineTime="inlineTime"
            :timeDate="date" :timeIsOutgoing="isSelf" :timeSendingState="sendingState" :timeIsRead="isRead"
            :timeViewCount="viewCount" :timeAuthorSignature="authorSignature"
            :timeColorClass="isSelf ? 'text-gray-600/70 dark:text-gray-400/70' : 'text-gray-400 dark:text-gray-500'" />

        <!-- Rich messages -->
        <MessageRichMessage v-else-if="content._ === 'messageRichMessage'" :blocks="content.message.blocks"
            :is-rtl="content.message.is_rtl" :chat-id="chatId" :message-id="messageId" />

        <!-- Checklist messages -->
        <MessageChecklistContent v-else-if="content._ === 'messageChecklist'" :content="content" :chat-id="chatId"
            :message-id="messageId" :is-self="isSelf ?? false" />

        <!-- Media messages -->
        <MessageMediaContent v-else-if="isMediaType" :content="content as any" :isSelf="isSelf ?? false" :date="date"
            :forwardInfo="forwardInfo" :forwardName="forwardName" :forwardNavigable="forwardNavigable"
            :forwardPhoto="forwardPhoto" :forwardAccentId="forwardAccentId" :forwardOriginalName="forwardOriginalName"
            :forwardTextColor="forwardTextColor" :isFirstInGroup="isFirstInGroup" :isLastInGroup="isLastInGroup"
            :sendingState="sendingState" :isRead="isRead" :viewCount="viewCount" :authorSignature="authorSignature"
            :chatId="chatId" :messageId="messageId" :senderName="senderName" :replyTo="replyTo"
            :messageList="messageList" :accentColorId="accentColorId" @openForwardSource="onOpenForwardSource"
            @jumpToMessage="onJumpToMessage" />

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
        <MessageOtherContent v-else :content="content" :chat-id="chatId" :message-id="messageId" />
    </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageContent, messageForwardInfo, messageReplyToMessage, MessageSendingState, message, messageSticker, messageAnimatedEmoji, chatPhotoInfo, profilePhoto } from 'tdlib-types';
import MessageReply from './content/MessageReply.vue';

import MessageTextContent from './content/MessageTextContent.vue';
import MessageRichMessage from './rich/MessageRichMessage.vue';
import MessageChecklistContent from './content/MessageChecklistContent.vue';
import MessageMediaContent from './content/MessageMediaContent.vue';
import MessageStickerContent from './content/MessageStickerContent.vue';
import MessageVoiceContent from './content/MessageVoiceContent.vue';
import MessageFileContent from './content/MessageFileContent.vue';
import MessageServiceContent from './content/MessageServiceContent.vue';
import MessageGiftContent from './content/MessageGiftContent.vue';
import MessageGiveawayContent from './content/MessageGiveawayContent.vue';
import MessageGiveawayWinnersContent from './content/MessageGiveawayWinnersContent.vue';
import MessageOtherContent from './content/MessageOtherContent.vue';
import MessageStatus from './content/MessageStatus.vue';
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
    'messageGiveawayCompleted',
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
    'messageChecklistTasksDone',
    'messageChecklistTasksAdded',
    'messagePollOptionAdded',
    'messagePollOptionDeleted',
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
    /** 转发来源头像 */
    forwardPhoto?: chatPhotoInfo | profilePhoto;
    /** 转发来源头像底色 accent id */
    forwardAccentId?: number;
    /** 转发原始作者签名（括号内） */
    forwardOriginalName?: string;
    /** 转发横幅文字色 */
    forwardTextColor?: string;
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
    /** 发送人显示名称（用于查看器底部信息展示） */
    senderName?: string;
    /** 是否将时间内嵌到普通文本消息末尾（float 同行，参考网页版），由 ChatDetail 决策 */
    inlineTime?: boolean;
}>();

const emit = defineEmits<{
    jumpToMessage: [messageId: number];
    openForwardSource: [];
}>();

function onJumpToMessage(messageId: number) {
    emit('jumpToMessage', messageId);
}

function onServiceJump(messageId: number) {
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
