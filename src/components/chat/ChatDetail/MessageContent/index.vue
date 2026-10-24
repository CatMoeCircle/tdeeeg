<template>
    <!-- Service messages -->
    <MessageGiveawayContent v-if="content._ === 'messageGiveaway'" :content="content" :date="date" />

    <MessageGiveawayWinnersContent v-else-if="content._ === 'messageGiveawayWinners'" :content="content"
        :messageList="messageList" />

    <MessageGiftContent v-else-if="content._ === 'messageGift' || content._ === 'messageUpgradedGift'"
        :content="content" :date="date" :is-self="isSelf" />

    <MessageServiceContent v-else-if="isServiceContent(content)" :content="content" :senderName="senderName"
        :senderUserId="senderUserId" :isSelf="isSelf ?? false" :messageList="messageList" :chatId="chatId"
        :messageId="messageId" :message="message" @jump="onServiceJump" />

    <template v-else>
        <!-- Reply preview（媒体消息的回复预览由 MessageMediaContent 在媒体宽度容器内渲染，避免撑宽 w-fit 气泡） -->
        <MessageReply v-if="replyTo && !isStickerLikeContent && !isMediaContent(content)" :replyTo="replyTo"
            :isSelf="isSelf ?? false" :chatId="chatId" :messageList="messageList" :accentColorId="accentColorId"
            @jump="onJumpToMessage" />

        <!-- Text messages -->
        <MessageTextContent v-if="content._ === 'messageText'" :formattedText="content.text"
            :messageId="messageId" :linkPreview="content.link_preview" :chatId="chatId" :accentColorId="accentColorId"
            :showInlineTime="inlineTime" :timeDate="date" :timeIsOutgoing="isSelf" :timeSendingState="sendingState"
            :timeIsRead="isRead" :timeViewCount="viewCount" :timeAuthorSignature="authorSignature"
            :timeColorClass="isSelf ? 'text-gray-600/70 dark:text-gray-400/70' : 'text-gray-400 dark:text-gray-500'"
            :summarizable="canSummarize" :summaryOutgoing="!!isSelf">
            <slot />
        </MessageTextContent>

        <!-- Rich messages -->
        <MessageRichMessage v-else-if="content._ === 'messageRichMessage'" :blocks="content.message.blocks"
            :is-rtl="content.message.is_rtl" :chat-id="chatId" :message-id="messageId">
            <slot />
        </MessageRichMessage>

        <!-- Checklist messages -->
        <MessageChecklistContent v-else-if="content._ === 'messageChecklist'" :content="content" :chat-id="chatId"
            :message-id="messageId" :is-self="isSelf ?? false" />

        <!-- 转发的动态（story）：按带文案的视频消息排布，封面点击打开动态播放器 -->
        <MessageStoryContent v-else-if="content._ === 'messageStory'" :content="content" :isSelf="isSelf ?? false"
            :date="date" :sendingState="sendingState" :isRead="isRead" :viewCount="viewCount"
            :authorSignature="authorSignature" :chatId="chatId" :replyTo="replyTo" :messageList="messageList"
            :accentColorId="accentColorId" @jumpToMessage="onJumpToMessage">
            <template #reactions>
                <slot name="reactions" />
            </template>
            <template #translation>
                <slot name="translation" />
            </template>
        </MessageStoryContent>

        <!-- Media messages -->
        <MessageMediaContent v-else-if="isMediaContent(content)" :content="content" :isSelf="isSelf ?? false"
            :date="date" :forwardInfo="forwardInfo" :forwardName="forwardName" :forwardNavigable="forwardNavigable"
            :forwardPhoto="forwardPhoto" :forwardAccentId="forwardAccentId" :forwardOriginalName="forwardOriginalName"
            :forwardMessageId="forwardMessageId"
            :forwardFirstName="forwardFirstName" :forwardLastName="forwardLastName"
            :forwardTextColor="forwardTextColor" :isFirstInGroup="isFirstInGroup" :isLastInGroup="isLastInGroup"
            :sendingState="sendingState" :isRead="isRead" :viewCount="viewCount" :authorSignature="authorSignature"
            :chatId="chatId" :messageId="messageId" :message="message" :topicId="topicId" :senderName="senderName"
            :replyTo="replyTo" :messageList="messageList" :accentColorId="accentColorId"
            :commentsBar="commentsBar"
            @openForwardSource="onOpenForwardSource" @jumpToMessage="onJumpToMessage">
            <template #reactions>
                <slot name="reactions" />
            </template>
            <template #translation>
                <slot name="translation" />
            </template>
        </MessageMediaContent>

        <!-- Stickers / animated emoji / dice are rendered without a message bubble.
             回复预览显示在贴纸旁边（小宽度），而非贴纸上方。
             ReactionsBar 贴纸下方：自己靠右、他人靠左 -->
        <div v-else-if="isStickerLikeContent" class="flex items-end gap-1.5 pb-2">
            <!-- 贴纸 + 回应：自己消息在右，他人在左 -->
            <div class="flex flex-col gap-0.5 min-w-0" :class="isSelf ? 'items-end order-2' : 'items-start order-1'">
                <div class="relative inline-block align-bottom">
                    <MessageDiceContent v-if="content._ === 'messageDice'" :content="content" :chat-id="chatId"
                        :message-id="messageId" />
                    <MessageStickerContent v-else :content="stickerContent" clickable />
                    <span v-if="date && !settings.sticker.hideTimestamp"
                        class="absolute right-1.5 bottom-1.5 z-10 bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none flex items-center">
                        <MessageStatus :date="date" :isOutgoing="!!isSelf" :sendingState="sendingState" :isRead="isRead"
                            :viewCount="viewCount" :authorSignature="authorSignature" overMedia />
                    </span>
                </div>
                <!-- ReactionsBar：贴纸下方，自己靠右、他人靠左 -->
                <ReactionsBar v-if="hasReactions && onToggleReaction" class="w-full" :msg="message!" :isSelf="!!isSelf"
                    @toggle-reaction="onToggleReaction" />
            </div>
            <!-- 回复预览：自己消息在左，他人在右 -->
            <div v-if="replyTo" class="w-40 shrink-0 self-end" :class="isSelf ? 'order-1' : 'order-2'">
                <MessageReply :replyTo="replyTo" :isSelf="!!isSelf" :chatId="chatId" :messageList="messageList"
                    :accentColorId="accentColorId" @jump="onJumpToMessage" />
            </div>
        </div>

        <!-- Voice / Video notes -->
        <MessageVoiceContent v-else-if="content._ === 'messageVoiceNote' || content._ === 'messageVideoNote'"
            :content="content" :chatId="chatId" :messageId="messageId" :message="message">
            <slot />
        </MessageVoiceContent>

        <!-- Document / Audio -->
        <MessageFileContent v-else-if="content._ === 'messageDocument' || content._ === 'messageAudio'"
            :content="content" :chatId="chatId" :messageId="messageId">
            <slot />
        </MessageFileContent>

        <!-- Contact card -->
        <MessageContactContent v-else-if="content._ === 'messageContact'" :content="content">
            <slot />
        </MessageContactContent>

        <!-- Other types -->
        <MessageOtherContent v-else :content="content" :chat-id="chatId" :message-id="messageId" :message="message"
            :topic-id="topicId" :sender-name="senderName">
            <slot />
        </MessageOtherContent>
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
import MessageDiceContent from './content/MessageDiceContent.vue';
import MessageVoiceContent from './content/MessageVoiceContent.vue';
import MessageFileContent from './content/MessageFileContent.vue';
import MessageServiceContent from './content/MessageServiceContent.vue';
import MessageGiftContent from './content/MessageGiftContent.vue';
import MessageGiveawayContent from './content/MessageGiveawayContent.vue';
import MessageGiveawayWinnersContent from './content/MessageGiveawayWinnersContent.vue';
import MessageOtherContent from './content/MessageOtherContent.vue';
import MessageContactContent from './content/MessageContactContent.vue';
import MessageStoryContent from './content/MessageStoryContent.vue';
import MessageStatus from './content/MessageStatus.vue';
import ReactionsBar from '../ReactionsBar.vue';
import { settings } from '../../../../store/settings';
import { canSummarizeMessage } from '../../../../store/summary';

const MEDIA_TYPES = new Set([
    'messagePhoto',
    'messageVideo',
    'messageAnimation',
    // 动态消息按媒体风格排版：回复预览由 MessageStoryContent 自己在媒体容器内渲染
    'messageStory',
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
    'messageChatJoinFromCommunity',
    'messageChatDeleteMember',
    'messageChatAddedToCommunity',
    'messageChatRemovedFromCommunity',
    'messageChatUpgradeTo',
    'messageChatUpgradeFrom',
    'messageChatHasProtectedContentToggled',
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
    'messageGiftedGrams',
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
    /** 转发源消息 id（频道帖 / source 转发才有，无则不显示） */
    forwardMessageId?: number;
    /** 转发来源为用户时的姓名拆分（头像文字用） */
    forwardFirstName?: string;
    forwardLastName?: string;
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
    /** 完整 tdlib 消息对象（传递给媒体查看器） */
    message?: message;
    /** 话题 ID（论坛话题，传递给媒体查看器） */
    topicId?: number;
    replyTo?: messageReplyToMessage;
    messageList?: message[];
    /** 发送者 accent_color_id（用于回复栏/引用标记配色） */
    accentColorId?: number;
    /** 发送人显示名称（用于查看器底部信息展示） */
    senderName?: string;
    /** 消息发送者（操作者）的用户 id（服务消息区分“自行退出/被移出”需要） */
    senderUserId?: number;
    /** 是否将时间内嵌到普通文本消息末尾（float 同行，参考网页版），由 ChatDetail 决策 */
    inlineTime?: boolean;
    /** 气泡底部是否显示频道评论条（媒体下缘需要压平以承接评论条，仅媒体内容使用） */
    commentsBar?: boolean;
    /** 是否有回应（用于贴纸/动画表情气泡外渲染 ReactionsBar） */
    hasReactions?: boolean;
    /** 回应切换回调（贴纸场景使用） */
    onToggleReaction?: (type: import('tdlib-types').ReactionType) => void;
    /** 消息是否为自己发送（贴纸场景使用） */
    isSelfReaction?: boolean;
}>();

const emit = defineEmits<{
    /** chatId：目标消息不在当前会话时由被回复/被引用方带出，供父级跨会话跳转 */
    jumpToMessage: [messageId: number, chatId?: number];
    openForwardSource: [];
}>();

function onJumpToMessage(messageId: number, chatId?: number) {
    emit('jumpToMessage', messageId, chatId);
}

function onServiceJump(messageId: number) {
    emit('jumpToMessage', messageId);
}

function onOpenForwardSource() {
    emit('openForwardSource');
}

/** 媒体消息类型收窄（v-if 类型守卫） */
type MediaContent = Extract<MessageContent, { _: 'messagePhoto' | 'messageVideo' | 'messageAnimation' }>;
function isMediaContent(content: MessageContent): content is MediaContent {
    return MEDIA_TYPES.has(content._);
}

/** 服务消息类型守卫 */
function isServiceContent(content: MessageContent): boolean {
    return SERVICE_TYPES.has(content._);
}

/** 贴纸 / 动画表情 / 骰子：无气泡渲染，回复显示在旁边（小宽度） */
const isStickerLikeContent = computed(
    () => props.content._ === 'messageSticker'
        || props.content._ === 'messageAnimatedEmoji'
        || props.content._ === 'messageDice',
);
/** 文本消息是否显示 AI 摘要入口（非自己消息且服务端给出 summary_language_code） */
const canSummarize = computed(
    () => props.content._ === 'messageText' && canSummarizeMessage(props.message, props.isSelf),
);
/** 贴纸 / 动画表情的窄化内容（供 MessageStickerContent 使用） */
const stickerContent = computed<messageSticker | messageAnimatedEmoji>(
    () => props.content as messageSticker | messageAnimatedEmoji,
);
</script>
