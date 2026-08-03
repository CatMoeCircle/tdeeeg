<template>
    <div class="h-full relative bg-[#f5f5f5] dark:bg-[#1c1c1c] overflow-hidden">
        <!-- ===== Messages Area (底层，穿透 header/footer) ===== -->
        <!-- Skeleton -->
        <div v-if="showSkeleton"
            class="absolute inset-0 overflow-y-auto px-4 custom-scrollbar flex flex-col messages-scroll"
            :class="topPaddingClass">
            <div class="flex-1"></div>
            <div v-for="n in 8" :key="n" class="flex mb-4" :class="n % 3 === 0 ? 'justify-end' : 'justify-start'">
                <div v-if="n % 3 !== 0" class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 mr-2 shrink-0"></div>
                <div class="p-3 rounded-lg"
                    :class="n % 3 === 0 ? 'bg-blue-200 dark:bg-blue-900' : 'bg-gray-200 dark:bg-gray-700'"
                    :style="{ width: (120 + Math.random() * 180) + 'px', height: '48px' }">
                </div>
            </div>
        </div>

        <!-- Messages -->
        <div v-else ref="messagesContainer"
            class="absolute inset-0 overflow-y-auto px-4 custom-scrollbar flex flex-col messages-scroll pb-15"
            :class="topPaddingClass" :style="messagesStyle" @scroll.passive="onScroll">

            <!-- 顶部加载更多指示器 -->
            <div v-if="isLoadingMore" class="text-center text-gray-400 text-sm py-3 shrink-0">
                加载中...
            </div>

            <!-- 消息列表容器：mt-auto 将消息推到底部 -->
            <div class="mt-auto flex flex-col">
                <template v-for="item in messageItems" :key="item.key">
                    <!-- Date separator -->
                    <div v-if="item.type === 'date'" class="flex justify-center my-2">
                        <span
                            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full leading-none select-none">
                            {{ item.text }}
                        </span>
                    </div>

                    <!-- Unread separator -->
                    <div v-else-if="item.type === 'unread'" class="flex items-center gap-3 my-3" aria-label="新消息">
                        <div class="h-px flex-1 bg-blue-400/70 dark:bg-blue-500/70"></div>
                        <span class="text-xs font-medium text-blue-500 dark:text-blue-400 select-none">新消息</span>
                        <div class="h-px flex-1 bg-blue-400/70 dark:bg-blue-500/70"></div>
                    </div>

                    <!-- Album group -->
                    <template v-else-if="item.type === 'album'">
                        <div :data-msg-id="item.messages[0].id" :class="{
                            'animate-message-in': isNewMessage(item.messages[0].id),
                            'animate-flash-highlight': highlightedMessageId === item.messages[0].id,
                            'relative': selectionMode
                        }" :style="selectionMode ? { border: '2px solid ' + (isMsgSelected(item.messages[0].id) ? '#3b82f6' : 'transparent'), borderRadius: '0.5rem' } : {}"
                            v-context-menu="selectionMode ? null : makeMsgMenu(item.messages[0])"
                            @click="selectionMode && toggleSelectMsg(item.messages[0].id)"
                            @animationend="onMessageAnimEnd($event, item.messages[0].id)">
                            <div v-if="selectionMode"
                                class="absolute left-1 top-1 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center pointer-events-none select-none"
                                :class="isMsgSelected(item.messages[0].id) ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'">
                                <CheckIcon v-if="isMsgSelected(item.messages[0].id)" class="w-3.5 h-3.5 text-white" />
                            </div>
                            <div class="flex mb-2" :class="isSelfAlbum(item) ? 'justify-end' : 'justify-start'">
                                <div v-if="shouldReserveAvatarColumn(item.messages[0])"
                                    class="w-9 shrink-0 mr-2 self-end">
                                    <div class="w-9 h-9">
                                        <Avatar :photo="getDisplaySenderPhoto(item.messages[0])"
                                            :title="getDisplaySenderName(item.messages[0])"
                                            :accentColorId="getDisplaySenderProfileAccentId(item.messages[0])"
                                            :deletedAccount="getDisplaySenderDeleted(item.messages[0])" />
                                    </div>
                                </div>
                                <div class="w-min max-w-[70%] overflow-hidden shadow-sm"
                                    :class="isSelfAlbum(item) ? 'text-gray-900 dark:text-white' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'"
                                    :style="albumStyle(item)">
                                    <p v-if="showSenderDisplayName(item.messages[0])"
                                        class="text-xs font-semibold px-2 pt-2 pb-0.5 flex items-center gap-1.5"
                                        :style="senderNameColor(item.messages[0])">
                                        <span class="min-w-0 flex-1 truncate">{{ getDisplaySenderName(item.messages[0])
                                        }}</span>
                                        <span v-if="getMessageLabel(item.messages[0])"
                                            class="shrink-0 font-normal text-[10px] leading-none px-1.5 py-0.5 rounded-full select-none"
                                            :class="getMessageLabelClass(item.messages[0])">{{
                                                getMessageLabel(item.messages[0]) }}</span>
                                    </p>
                                    <button
                                        v-if="item.messages[0].forward_info && !isLinkedChannelMessage(item.messages[0])"
                                        type="button" :disabled="!canNavigateForward(item.messages[0].forward_info)"
                                        class="flex min-w-0 w-full max-w-full items-center gap-1 overflow-hidden px-2 pt-2 pb-1 text-left text-xs font-semibold disabled:cursor-default"
                                        :class="[
                                            isSelfAlbum(item) ? 'text-gray-600/70 dark:text-white/70' : '',
                                            canNavigateForward(item.messages[0].forward_info)
                                                ? 'cursor-pointer hover:underline active:opacity-70'
                                                : ''
                                        ]" :style="forwardColor(item, true)"
                                        :title="canNavigateForward(item.messages[0].forward_info) ? '跳转到来源' : undefined"
                                        @click.stop="openForwardSource(item.messages[0].forward_info)">
                                        <CornerUpRightIcon class="w-3.5 h-3.5 shrink-0" />
                                        <span class="min-w-0 flex-1 truncate">{{
                                            getForwardName(item.messages[0].forward_info) }}</span>
                                    </button>
                                    <MessageAlbum :messages="item.messages" :isSelf="isSelfAlbum(item)" :chatId="chatId"
                                        :isRead="isMessageRead(item.messages[item.messages.length - 1])"
                                        :authorSignature="item.messages[0].author_signature || undefined" />
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- Single message -->
                    <template v-else-if="item.type === 'single'">
                        <div :data-msg-id="item.msg.id" :class="{
                            'animate-message-in': isNewMessage(item.msg.id),
                            'animate-flash-highlight': highlightedMessageId === item.msg.id,
                            'relative': selectionMode
                        }" :style="selectionMode ? { border: '2px solid ' + (isMsgSelected(item.msg.id) ? '#3b82f6' : 'transparent'), borderRadius: '0.5rem' } : {}"
                            v-context-menu="selectionMode ? null : makeMsgMenu(item.msg)"
                            @click="selectionMode && toggleSelectMsg(item.msg.id)"
                            @animationend="onMessageAnimEnd($event, item.msg.id)">
                            <div v-if="selectionMode"
                                class="absolute left-1 top-1 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center pointer-events-none select-none"
                                :class="isMsgSelected(item.msg.id) ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'">
                                <CheckIcon v-if="isMsgSelected(item.msg.id)" class="w-3.5 h-3.5 text-white" />
                            </div>
                            <div v-if="isServiceMessage(item.msg)" class="flex justify-center my-1">
                                <MessageContent :content="item.msg.content" />
                            </div>
                            <div v-else class="flex" :class="[
                                isSelf(item.msg) ? 'justify-end' : 'justify-start',
                                item.isLastInGroup ? 'mb-2' : 'mb-0.5'
                            ]">
                                <div v-if="shouldReserveAvatarColumn(item.msg)" class="w-9 shrink-0 mr-2 self-end"
                                    :class="{ 'invisible': !item.showAvatar }">
                                    <div class="w-9 h-9">
                                        <Avatar :photo="getDisplaySenderPhoto(item.msg)"
                                            :title="getDisplaySenderName(item.msg)"
                                            :accentColorId="getDisplaySenderProfileAccentId(item.msg)"
                                            :deletedAccount="getDisplaySenderDeleted(item.msg)" />
                                    </div>
                                </div>
                                <div :data-bubble-msg-id="item.msg.id" :class="[
                                    isMediaMessage(item.msg)
                                        ? 'w-fit max-w-[70%] min-w-0 overflow-hidden shadow-sm'
                                        : isStandaloneMessage(item.msg)
                                            ? 'relative max-w-[70%]'
                                            : 'px-2.5 py-1.5 shadow-sm max-w-[70%] min-w-30',
                                    !isStandaloneMessage(item.msg) && isSelf(item.msg)
                                        ? 'text-gray-900 dark:text-white'
                                        : !isStandaloneMessage(item.msg)
                                            ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                                            : ''
                                ]" :style="bubbleStyle(item)">
                                    <p v-if="showSenderDisplayName(item.msg) && item.isFirstInGroup"
                                        class="text-xs font-semibold mx-1 m-0.5 flex items-center gap-1.5"
                                        :style="senderNameColor(item.msg)">
                                        <span class="min-w-0 flex-1 truncate">{{ getDisplaySenderName(item.msg)
                                        }}</span>
                                        <span v-if="getMessageLabel(item.msg)"
                                            class="shrink-0 font-normal text-[10px] leading-none px-1.5 py-0.5 rounded-full select-none"
                                            :class="getMessageLabelClass(item.msg)">{{
                                                getMessageLabel(item.msg) }}</span>
                                    </p>
                                    <button
                                        v-if="item.msg.forward_info && !isMediaMessage(item.msg) && !isLinkedChannelMessage(item.msg)"
                                        type="button" :disabled="!canNavigateForward(item.msg.forward_info)"
                                        class="flex min-w-0 max-w-full items-center gap-1 overflow-hidden mb-0.5 -mt-0.5 text-left text-xs font-semibold disabled:cursor-default"
                                        :class="[
                                            isSelf(item.msg) ? 'text-gray-600/70 dark:text-white/70' : '',
                                            canNavigateForward(item.msg.forward_info)
                                                ? 'cursor-pointer hover:underline active:opacity-70'
                                                : ''
                                        ]" :style="forwardColor(item, false)"
                                        :title="canNavigateForward(item.msg.forward_info) ? '跳转到来源' : undefined"
                                        @click.stop="openForwardSource(item.msg.forward_info)">
                                        <CornerUpRightIcon class="w-3.5 h-3.5 shrink-0" />
                                        <span class="min-w-0 flex-1 truncate">{{ getForwardName(item.msg.forward_info)
                                            }}</span>
                                    </button>
                                    <MessageContent :content="item.msg.content" :isSelf="isSelf(item.msg)"
                                        :date="item.msg.date" :forwardInfo="getDisplayForwardInfo(item.msg)"
                                        :forwardName="getDisplayForwardInfo(item.msg) ? getForwardName(getDisplayForwardInfo(item.msg)!) : undefined"
                                        :forwardNavigable="getDisplayForwardInfo(item.msg) ? canNavigateForward(getDisplayForwardInfo(item.msg)!) : false"
                                        :isFirstInGroup="item.isFirstInGroup" :isLastInGroup="item.isLastInGroup"
                                        :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                        :viewCount="item.msg.interaction_info?.view_count"
                                        :authorSignature="item.msg.author_signature || undefined" :chatId="chatId"
                                        :messageId="item.msg.id"
                                        :replyTo="item.msg.reply_to?._ === 'messageReplyToMessage' ? item.msg.reply_to : undefined"
                                        :messageList="messages" :accentColorId="getSenderAccentId(item.msg)"
                                        @jumpToMessage="handleReplyJumpToMessage"
                                        @openForwardSource="item.msg.forward_info && openForwardSource(item.msg.forward_info)" />
                                    <span
                                        v-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && !isSelf(item.msg)"
                                        class="block text-right text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-none">
                                        <MessageStatus :date="item.msg.date" :isOutgoing="false"
                                            :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                            :viewCount="item.msg.interaction_info?.view_count"
                                            :authorSignature="item.msg.author_signature || undefined" />
                                    </span>
                                    <span
                                        v-else-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && isSelf(item.msg)"
                                        class="block text-right text-[11px] text-gray-600/70 dark:text-white/70 mt-0.5 leading-none">
                                        <MessageStatus :date="item.msg.date" :isOutgoing="true"
                                            :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                            :viewCount="item.msg.interaction_info?.view_count"
                                            :authorSignature="item.msg.author_signature || undefined" />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </template>
                </template>

                <div class="shrink-0 h-4"></div>
            </div>
        </div>
        <!-- ===== 底部渐变淡出遮罩 ===== -->
        <div aria-hidden="true"
            class="absolute bottom-0 left-0 right-0 h-24 z-3 pointer-events-none bg-linear-to-t from-[#f5f5f5] dark:from-[#1c1c1c] via-[#f5f5f5]/60 dark:via-[#1c1c1c]/60 to-transparent">
        </div>
        <!-- ===== Header（顶层，磨砂玻璃） ===== -->
        <div
            class="absolute top-0 left-0 right-0 z-10 bg-white/80 dark:bg-[#1c1c1c]/70 backdrop-blur-lg border-b border-gray-200/60 dark:border-gray-800/60">
            <ChatDetailHeader :chat="chat" :topic="topic" :showBack="showBackBtn" @back="handleBack"
                @openInfo="openOverlay" />
        </div>

        <!-- ===== 多选操作栏（多选模式时替换 Header） ===== -->
        <Transition name="multi-bar">
            <div v-if="selectionMode"
                class="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 h-13 bg-white/80 dark:bg-[#1c1c1c]/70 backdrop-blur-lg border-b border-gray-200/60 dark:border-gray-800/60">
                <button type="button" aria-label="退出多选" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                    @click="exitSelectionMode">
                    <XIcon class="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
                    已选 {{ selectedMsgIds.length }} 条
                </span>
                <button type="button" aria-label="回复选中消息" title="回复"
                    class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                    :disabled="selectedMsgIds.length !== 1" @click="onReplySelected">
                    <CornerUpLeftIcon class="w-5 h-5" />
                </button>
                <button type="button" aria-label="转发选中消息" title="转发"
                    class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                    :disabled="selectedMsgIds.length === 0" @click="openForwardPicker">
                    <ShareIcon class="w-5 h-5" />
                </button>
                <button type="button" aria-label="删除选中消息" title="删除"
                    class="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 disabled:opacity-40"
                    :disabled="selectedMsgIds.length === 0" @click="onDeleteSelected">
                    <TrashIcon class="w-5 h-5" />
                </button>
            </div>
        </Transition>

        <!-- ===== 转发选择器 ===== -->
        <ForwardPicker :visible="forwardPickerVisible" :from-chat-id="chatId ?? 0" :message-ids="forwardMessageIds"
            @update:visible="forwardPickerVisible = $event" @done="onForwardDone" />

        <!-- ===== 顶置消息栏 + 音乐播放器（合并同一卡片） ===== -->
        <div class="absolute inset-x-0 z-10 flex justify-center pointer-events-none"
            :class="showTopCard ? 'top-17.5' : 'hidden'">
            <div class="w-full px-1 pointer-events-auto">
                <PinnedMessageBar :chatId="chatId" @jumpToMessage="jumpToPinnedMessage"
                    @visibleChange="onPinnedVisibleChange" />
            </div>
        </div>

        <!-- ===== 叠层面板 ===== -->
        <Transition name="overlay-slide">
            <div v-if="showOverlay && chat"
                class="absolute inset-0 z-20 bg-white dark:bg-gray-900 overflow-y-auto custom-scrollbar">
                <div class="p-4 pt-20">
                    <!-- 对话信息 -->
                    <div class="flex flex-col items-center mb-6">
                        <div class="w-20 h-20 mb-3">
                            <Avatar :photo="chat.photo" :title="chat.title" sizeClass="!w-20 !h-20"
                                :accentColorId="getChatProfileAccentColorId(chat as any)" />
                        </div>
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ overlayChatTitle }}</h2>
                        <p class="text-sm text-gray-500 mt-1">{{ getChatSubtitle() }}</p>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="space-y-2 px-4">
                        <button type="button" @click="openInNewChat"
                            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
                            <MessageCircleIcon class="w-5 h-5 text-blue-500" />
                            <span class="text-sm font-medium">跳转到对话</span>
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- ===== Input Area（顶层，磨砂玻璃） ===== -->
        <div v-if="canSend"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-white/80 dark:from-gray-900/80 via-white/60 dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <MessageInput class="relative z-10" v-model="messageInput" :reply-target="replyTargetInfo"
                @clear-reply="replyTargetMsg = null" @send="handleSend" @attach="handleAttach" />
        </div>

        <!-- ===== 成员操作 ===== -->
        <div v-else-if="showMembershipAction"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-white/80 dark:from-gray-900/80 via-white/60 dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <div class="relative z-10 flex items-center justify-center p-5">
                <button type="button" :disabled="!canJoinCurrentChat || isJoinPending || joinRequestSent"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/60 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-default transition-colors"
                    @click="joinCurrentChat">
                    {{ membershipActionLabel }}
                </button>
            </div>
        </div>

        <!-- ===== 只读 ===== -->
        <div v-else-if="showChannelActions"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-white/80 dark:from-gray-900/80 via-white/60 dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <div class="relative z-10 flex items-center justify-center gap-3 p-5">
                <button type="button" :disabled="isNotificationTogglePending"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/60 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-wait transition-colors"
                    @click="toggleNotifications">
                    {{ notificationsMuted ? '开启通知' : '关闭通知' }}
                </button>
                <button v-if="linkedChatId" type="button" title="打开讨论组" aria-label="打开讨论组"
                    class="w-12 h-12 rounded-full bg-white/60 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg flex items-center justify-center text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 transition-colors"
                    @click="openLinkedChat">
                    <MessageCircleIcon class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- ===== Floating scroll-to-bottom button ===== -->
        <Transition name="fade">
            <button v-if="showScrollButton"
                class="absolute bottom-28 right-4 z-20 w-10 h-10 bg-white dark:bg-gray-700 rounded-full shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                @click="handleScrollToBottom" title="跳到底部">
                <span v-if="newMessageCount > 0"
                    class="absolute -top-1 -right-1 min-w-4.5 h-4.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
                    {{ newMessageCount > 99 ? '99+' : newMessageCount }}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clip-rule="evenodd" />
                </svg>
            </button>
        </Transition>

        <!-- ===== 全局媒体查看器 ===== -->
        <MediaViewer :visible="viewerVisible" :items="viewerItems" :initial-index="viewerIndex"
            :initial-time="viewerInitialTime" @close="onViewerClose" />

        <!-- ===== 删除消息确认弹窗 ===== -->
        <DeleteMessageConfirm />
    </div>
</template>
<script setup lang="ts">
import MessageInput from './MessageInput.vue';
import Avatar from '../avatar.vue';
import MessageContent from './MessageContent/index.vue';
import MessageStatus from './MessageContent/MessageStatus.vue';
import MessageAlbum from './MessageContent/MessageAlbum.vue';
import ChatDetailHeader from './Header.vue';
import MediaViewer from './MessageContent/MediaViewer.vue';
import type { MediaViewerItem } from './MessageContent/MediaViewer.vue';
import DeleteMessageConfirm from '../../contextMenu/DeleteMessageConfirm.vue';
import PinnedMessageBar from './PinnedMessageBar.vue';

import { tdlibSend } from '../../../utils/tdlib';
import { isOutgoingMessageForDisplay } from '../../../utils/savedMessages';
import { getForwardNavigationTarget } from '../../../utils/forwardedMessages';

import { CornerUpRightIcon, MessageCircleIcon, ClipboardCopy as ClipboardCopyIcon, XIcon, ShareIcon, TrashIcon, CornerUpLeftIcon, ReplyIcon, PinIcon, LinkIcon, CheckSquareIcon, CopyPlusIcon, CheckIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { computed, watch, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useUserStore } from '../../../store/user';
import { useAudioPlayerStore } from '../../../store/audioPlayer';
import { storeToRefs } from 'pinia';
import { listen } from "@tauri-apps/api/event";
import { settings } from '../../../store/settings';
import { useCommandInsert, clearPendingCommand } from '../../../store/commandInsert';
import type { ContextMenuItem } from '../../contextMenu/types';
import { getMessagePlainText } from '../../../utils/messageText';
import {
    copyMessageText, copyMessageJson, copyMessageLink,
    toggleMessagePinned, getMessageProperties,
    getCachedMessageProperties, executeDeleteActions,
    canCopyMessage, canGetMessageLink, canPinMessage, canDeleteMessage,
    canReplyMessage,
} from '../../contextMenu/messageActions';
import { confirmDeleteMessage } from '../../../store/deleteMessage';
import type { DeleteMessageRequest } from '../../../store/deleteMessage';
import { openContextMenu, x as ctxX, y as ctxY, target as ctxTarget } from '../../../store/contextMenu';

import type { chat, message, user, chatPhotoInfo, profilePhoto, Update, supergroup, basicGroup, messageForwardInfo, ChatMemberStatus, forumTopic, MessageSender } from 'tdlib-types';
import { getViewerState, closeMediaViewer, registerMediaItem, unregisterMediaItem, isMediaViewerActive } from '../../../store/mediaViewer';
import { isFileReady } from '../../../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getSenderAccentColorId, getSenderProfileAccentColorId, getChatProfileAccentColorId, isDeletedChat, DELETED_ACCOUNT_LABEL } from '../../../utils/senderInfo';
import { useColors } from '../../../store/colors';
import { isMediaMessage, isStandaloneMessage, isServiceMessage } from './composables/messageType';
import { buildDisplayItems } from './composables/messageItems';
import type { DisplayItem, AlbumDisplayItem } from './composables/messageItems';
import {
    bubbleStyle as computeBubbleStyle, albumStyle as computeAlbumStyle,
    messagesStyleCss,
} from './composables/bubbleStyle';
import type { BubbleStyleDeps, BubbleBackgroundDeps } from './composables/bubbleStyle';
import {
    getDisplaySenderName as computeDisplaySenderName,
    getDisplaySenderPhoto as computeDisplaySenderPhoto,
    getDisplaySenderProfileAccentId as computeDisplaySenderProfileAccentId,
    getDisplaySenderDeleted as computeDisplaySenderDeleted,
    getForwardName as computeForwardName,
    isSavedForwardedMessage as computeIsSavedForwardedMessage,
    senderNameColor as computeSenderNameColor, forwardColor as computeForwardColor,
    showSenderDisplayName as computeShowSenderDisplayName,
} from './composables/senderDisplay';
import type { SenderDisplayDeps } from './composables/senderDisplay';
import {
    canSend as canSendChat, getCurrentMemberStatus,
    showMembershipAction as showMembershipActionOf, canJoinCurrentChat as canJoinCurrentChatOf,
    isChannelWithSenderDisplay as isChannelWithSenderDisplayOf, showSenderName as showSenderNameOf,
    showAvatarColumn as showAvatarColumnOf, showChannelActions as showChannelActionsOf,
} from './composables/permissions';

// ==================== Route ====================
const route = useRoute();
const router = useRouter();
const emit = defineEmits<{
    close: [];
}>();
const props = defineProps<{
    chatId?: number | null;
    topicId?: number | null;
}>();

const chatId = computed(() => {
    const id = props.chatId ?? route.params.id;
    return id !== undefined && id !== null && id !== '' ? Number(id) : undefined;
});

/** 话题 ID（论坛群组话题模式时存在） */
const topicId = computed(() => {
    const tid = props.topicId ?? route.params.topicId;
    return tid !== undefined && tid !== null && tid !== '' ? Number(tid) : undefined;
});

// ==================== Overlay State ====================
const showOverlay = ref(false);

function openOverlay() {
    showOverlay.value = true;
}

function closeOverlay() {
    showOverlay.value = false;
}

/** 话题模式时显示返回按钮 */
const showBackBtn = computed(() => true);

/** 返回按钮处理：叠层模式先关闭叠层；话题/普通聊天模式返回聊天列表（无选中对话 = 为空状态） */
function handleBack() {
    if (showOverlay.value) {
        closeOverlay();
    } else {
        emit('close');
        router.push('/home/chats');
    }
}

function getChatSubtitle(): string {
    if (!chat.value) return '';
    const c = chat.value;
    if (c.type._ === 'chatTypePrivate' || c.type._ === 'chatTypeSecret') {
        return '私聊';
    }
    if (c.type._ === 'chatTypeBasicGroup') {
        return '群组';
    }
    if (c.type._ === 'chatTypeSupergroup') {
        return c.type.is_channel ? '频道' : '超级群组';
    }
    return '';
}

function openInNewChat() {
    showOverlay.value = false;
    // 用户点击"跳转到对话"时的处理，这里只是关闭叠层
}

// ==================== State ====================
const chat = ref<chat | undefined>(undefined);
/** 叠层对话信息面板显示的对话标题（已注销账户对话显示「已注销账户」） */
const overlayChatTitle = computed(() => {
    if (!chat.value) return '';
    return isDeletedChat(chat.value) ? DELETED_ACCOUNT_LABEL : chat.value.title || '';
});
/** 当前话题信息（话题模式时存在） */
const topic = ref<forumTopic | undefined>(undefined);
const messageInput = ref('');
const messages = ref<message[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);

// ===== 回复模式 =====
/** 当前回复目标消息（null 表示无回复） */
const replyTargetMsg = ref<message | null>(null);

/** 回复目标摘要（发送者名 + 文本），供 MessageInput 显示 */
const replyTargetInfo = computed<{ title: string; text: string } | null>(() => {
    const m = replyTargetMsg.value;
    if (!m) return null;
    const title = isSelf(m) ? '你' : getDisplaySenderName(m) || '成员';
    const text = getMessagePlainText(m);
    return { title, text };
});

/** 设置回复目标；传入消息 id 对应消息或 null 以清除 */
function startReply(msg: message | null) {
    replyTargetMsg.value = msg;
}

// ===== 多选模式 =====
/** 是否处于多选模式 */
const selectionMode = ref(false);
/** 多选中选中的消息 id 集合（按加入顺序用数组保持稳定） */
const selectedMsgIds = ref<number[]>([]);

/** 切换到多选模式 */
function enterSelectionMode(msg: message) {
    selectionMode.value = true;
    if (!selectedMsgIds.value.includes(msg.id)) {
        selectedMsgIds.value.push(msg.id);
    }
}

/** 退出多选模式 */
function exitSelectionMode() {
    selectionMode.value = false;
    selectedMsgIds.value = [];
}

/** 切换单条消息的选中状态 */
function toggleSelectMsg(msgId: number) {
    const idx = selectedMsgIds.value.indexOf(msgId);
    if (idx >= 0) {
        selectedMsgIds.value.splice(idx, 1);
    } else {
        selectedMsgIds.value.push(msgId);
    }
}

/** 消息是否被选中 */
function isMsgSelected(msgId: number): boolean {
    return selectedMsgIds.value.includes(msgId);
}

// ===== 多选模式：操作 =====
const forwardPickerVisible = ref(false);
const forwardMessageIds = ref<number[]>([]);

/** 打开转发选择器（用当前选中消息） */
function openForwardPicker() {
    if (selectedMsgIds.value.length === 0) return;
    forwardMessageIds.value = [...selectedMsgIds.value];
    forwardPickerVisible.value = true;
}

/** 转发完成后退出多选 */
function onForwardDone() {
    exitSelectionMode();
}

/** 多选模式下对单条选中消息发起回复 */
function onReplySelected() {
    if (selectedMsgIds.value.length !== 1) return;
    const msg = messages.value.find((m) => m.id === selectedMsgIds.value[0]) || null;
    if (!msg) return;
    exitSelectionMode();
    startReply(msg);
}

/** 删除所有选中消息 */
async function onDeleteSelected() {
    const ids = [...selectedMsgIds.value];
    if (ids.length === 0) return;
    const ok = window.confirm(`确定要删除选中的 ${ids.length} 条消息吗？\n\n（此操作将尝试为所有人删除）`);
    if (!ok) return;
    try {
        await tdlibSend({
            _: 'deleteMessages',
            chat_id: chatId.value,
            message_ids: ids,
            revoke: true,
        });
        MessagePlugin.success('已删除');
        exitSelectionMode();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '删除失败');
    }
}

// 点击 bot 命令（/start 等）→ 插入输入框最前面（空格分隔）
const { pendingCommand } = useCommandInsert();
watch(pendingCommand, (cmd) => {
    if (!cmd) return;
    // 命令添加在最前面；输入框已有文本时用空格分隔
    messageInput.value = messageInput.value
        ? `${cmd} ${messageInput.value}`
        : cmd;
    clearPendingCommand();
});

const isLoadingMore = ref(false);
const isHistoryExhausted = ref(false);
const isReady = ref(false);           // 标记初始加载和定位已完成
const unreadBoundaryMessageId = ref<number | null>(null);

const newMessageIds = ref<Set<number>>(new Set());
const showScrollButton = ref(false);
const newMessageCount = ref(0);
const notificationsMuted = ref(false);
const isNotificationTogglePending = ref(false);
const linkedChatId = ref(0);
const isJoinPending = ref(false);
const joinRequestSent = ref(false);

// 缓存
const users = ref<Record<number, user>>({});
const chats = ref<Record<number, chat>>({});
const supergroups = ref<Record<number, supergroup>>({});
const basicGroups = ref<Record<number, basicGroup>>({});
/** 群组成员信息缓存（user_id → member），用于在消息右上角显示角色/标签（创建者/管理员/自定义 tag） */
interface MemberInfo {
    status?: ChatMemberStatus;
    /** 成员自定义标签（管理员的 custom title，或个人资料标签） */
    tag?: string;
}
const memberStatus = ref<Record<number, MemberInfo>>({});
/** 进行中的 getChatMember 请求去重 */
const pendingMemberStatus = new Set<number>();
let unlisten: (() => void) | null = null;

/** 单调递增的加载代数，用于防止异步返回时的竞态条件 */
let loadGeneration = 0;

/** 消息数据版本号，用于 computed 依赖追踪，避免多余重算 */
const messagesVersion = ref(0);

// User Store
const userStore = useUserStore();
const player = useAudioPlayerStore();
const { userProfile } = storeToRefs(userStore);
const myId = computed(() => userProfile.value?.id || 0);

// ==================== 全局媒体查看器状态 ====================
const { viewerVisible, viewerIndex, viewerInitialTime, viewerItems, viewerCurrentMsgId } = getViewerState();

// ==================== 主题色彩 ====================
const { accentTextColor, accentColorStyle, isDark } = useColors();

// 当消息列表变化时，将已有媒体消息注册到全局查看器
const previousMsgIds = ref<Set<number>>(new Set());
watch(messages, (msgs) => {
    const newIds = new Set<number>();
    for (const msg of msgs) {
        newIds.add(msg.id);
        if (previousMsgIds.value.has(msg.id)) continue;
        const c = msg.content;
        const capt = 'caption' in c && c.caption?.text ? c.caption.text : '';
        let item: MediaViewerItem | null = null;
        if (c._ === 'messagePhoto') {
            const sizes = c.photo.sizes;
            if (sizes.length > 0) {
                const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
                const f = largest.photo;
                if (f && isFileReady(f)) {
                    item = { type: 'photo', src: convertFileSrc(f.local.path), caption: capt };
                }
            }
        } else if (c._ === 'messageVideo') {
            const file = c.video.video;
            if (isFileReady(file)) {
                item = { type: 'video', src: convertFileSrc(file.local.path), caption: capt };
            } else if (c.video.supports_streaming && file.size > 0) {
                item = { type: 'video', src: `${convertFileSrc(String(file.id), 'tdstream')}?mime=${c.video.mime_type}`, caption: capt };
            }
        } else if (c._ === 'messageAnimation') {
            const file = c.animation.animation;
            if (isFileReady(file)) {
                item = { type: 'animation', src: convertFileSrc(file.local.path), caption: capt };
            }
        }
        if (item) registerMediaItem(msg.id, item);
    }
    // 清理已删除消息的注册
    for (const oldId of previousMsgIds.value) {
        if (!newIds.has(oldId)) unregisterMediaItem(oldId);
    }
    previousMsgIds.value = newIds;
}, { immediate: true, deep: true });

// ==================== 气泡宽度测量（同宽消息右侧连接） ====================
/** 记录每条消息气泡的实际渲染宽度（msgId → px），用于判断相邻消息是否同宽 */
const bubbleWidths = ref<Record<number, number>>({});

/** 重新测量所有消息气泡的宽度 */
function measureBubbleWidths() {
    const container = messagesContainer.value;
    if (!container) return;
    const next: Record<number, number> = {};
    container.querySelectorAll<HTMLElement>('[data-bubble-msg-id]').forEach((el) => {
        const id = Number(el.dataset.bubbleMsgId || '0');
        if (id > 0) next[id] = Math.round(el.getBoundingClientRect().width);
    });
    // 仅在实际变化时更新，避免触发不必要的重渲染
    const cur = bubbleWidths.value;
    let changed = Object.keys(cur).length !== Object.keys(next).length;
    if (!changed) {
        for (const k in next) {
            if (cur[k] !== next[k]) { changed = true; break; }
        }
    }
    if (changed) bubbleWidths.value = next;
}

// 消息变化（新增/删除/内容编辑等）后重新测量宽度
watch(
    messages,
    async () => {
        await nextTick();
        measureBubbleWidths();
    },
    { immediate: true, deep: true }
);

// 容器尺寸变化（窗口缩放/布局变化）时重新测量
let bubbleWidthObserver: ResizeObserver | null = null;
watch(messagesContainer, (el) => {
    if (bubbleWidthObserver) bubbleWidthObserver.disconnect();
    bubbleWidthObserver = null;
    if (el) {
        bubbleWidthObserver = new ResizeObserver(() => measureBubbleWidths());
        bubbleWidthObserver.observe(el);
    }
});

function onViewerClose(currentTime?: number) {
    // 同步全屏查看器关闭时的视频进度到内联视频
    if (currentTime !== undefined && viewerCurrentMsgId.value) {
        const videoEl = document.querySelector(
            `[data-video-msg-id="${viewerCurrentMsgId.value}"]`
        ) as HTMLVideoElement | null;
        if (videoEl) {
            videoEl.currentTime = currentTime;
        }
    }
    closeMediaViewer();
}

// 查看器打开时阻止滚动
watch(isMediaViewerActive, (active) => {
    const container = messagesContainer.value;
    if (container) {
        container.style.overflow = active ? 'hidden' : '';
    }
});

// ==================== Lifecycle ====================
onMounted(async () => {
    if (!userProfile.value) {
        await userStore.fetchUser();
    }
    unlisten = await listen<Update>("tdlib-update", (event) => {
        handleUpdate(event.payload);
    });
});

onUnmounted(() => {
    if (unlisten) unlisten();
    if (bubbleWidthObserver) bubbleWidthObserver.disconnect();
    if (readVisibilityTimer !== null) window.clearTimeout(readVisibilityTimer);
    if (chatLoadRetryTimer !== null) window.clearTimeout(chatLoadRetryTimer);
});

const forwardedTargetMessageId = computed(() => {
    const id = Number(route.query.message);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
});

// ==================== TDLib Updates ====================
const handleUpdate = async (update: Update) => {
    switch (update._) {
        case 'updateNewMessage': {
            if (!isReady.value) return;
            const msg = update.message;
            if (msg.chat_id !== chatId.value) return;
            if (messages.value.find(m => m.id === msg.id)) return;

            // 话题模式下只显示属于当前话题的消息
            if (topicId.value) {
                const msgTopicId = msg.topic_id?._ === 'messageTopicForum' ? msg.topic_id.forum_topic_id : 0;
                if (msgTopicId !== topicId.value) return;
            }

            const senderIsMe =
                msg.sender_id._ === 'messageSenderUser' &&
                msg.sender_id.user_id === myId.value;

            const atBottom = isAtBottom();
            newMessageIds.value.add(msg.id);

            // 追加到末尾（最新消息）
            messages.value.push(msg);
            await fetchSenders([msg]);
            void fetchMemberStatuses([msg]);

            if (senderIsMe || atBottom) {
                showScrollButton.value = false;
                newMessageCount.value = 0;
                scrollToBottom();
            } else {
                showScrollButton.value = true;
                newMessageCount.value++;
            }
            break;
        }

        case 'updateMessageContent': {
            if (!isReady.value) return;
            if (update.chat_id !== chatId.value) return;
            const msg = messages.value.find(m => m.id === update.message_id);
            if (msg) {
                // 内容变化（如编辑文本变长）会改变气泡高度，
                // 若用户停在底部附近则保持贴底，避免底部内容被顶出视口
                const atBottom = isAtBottom();
                msg.content = update.new_content;
                if (atBottom) scrollToBottom();
            }
            break;
        }

        case 'updateMessageSendSucceeded':
        case 'updateMessageSendFailed': {
            if (!isReady.value) return;
            if (update.message.chat_id !== chatId.value) return;
            const oldIndex = messages.value.findIndex(m => m.id === update.old_message_id);
            const currentIndex = messages.value.findIndex(m => m.id === update.message.id);

            if (oldIndex >= 0) {
                if (currentIndex >= 0 && currentIndex !== oldIndex) {
                    messages.value.splice(oldIndex, 1);
                } else {
                    messages.value.splice(oldIndex, 1, update.message);
                }
            } else if (currentIndex >= 0) {
                messages.value.splice(currentIndex, 1, update.message);
            } else {
                messages.value.push(update.message);
            }

            if (newMessageIds.value.delete(update.old_message_id)) {
                newMessageIds.value.add(update.message.id);
            }
            // 为新消息获取发送者信息
            await fetchSenders([update.message]);
            break;
        }

        case 'updateChatReadOutbox': {
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.last_read_outbox_message_id = update.last_read_outbox_message_id;
            break;
        }

        case 'updateDeleteMessages': {
            if (!isReady.value) return;
            if (update.chat_id !== chatId.value) return;
            // from_cache=true 的删除是本地缓存的过时标记，不是真实的删除，忽略
            if (update.from_cache) break;
            const beforeCount = messages.value.length;
            messages.value = messages.value.filter(m => !update.message_ids.includes(m.id));
            if (messages.value.length !== beforeCount) {
                messagesVersion.value++;
            }
            break;
        }

        case 'updateChatNotificationSettings': {
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.notification_settings = update.notification_settings;
            void syncNotificationMuteState(chat.value, update.chat_id);
            break;
        }

        case 'updateSupergroupFullInfo': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeSupergroup') return;
            if (update.supergroup_id !== currentChat.type.supergroup_id) return;
            linkedChatId.value = update.supergroup_full_info.linked_chat_id;
            break;
        }

        case 'updateSupergroup': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeSupergroup') return;
            if (update.supergroup.id !== currentChat.type.supergroup_id) return;
            supergroups.value[update.supergroup.id] = update.supergroup;
            break;
        }

        case 'updateBasicGroup': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeBasicGroup') return;
            if (update.basic_group.id !== currentChat.type.basic_group_id) return;
            basicGroups.value[update.basic_group.id] = update.basic_group;
            break;
        }

        case 'updateMessageEdited': {
            if (update.chat_id !== chatId.value) return;
            const msg = messages.value.find(m => m.id === update.message_id);
            if (msg) {
                msg.edit_date = update.edit_date;
                if (update.reply_markup) {
                    (msg as any).reply_markup = update.reply_markup;
                }
            }
            break;
        }

        default:
            break;
    }
};

// ==================== Chat Loading ====================
const chatLoadRetryToken = ref(0);
let chatLoadRetryId: number | null = null;
let chatLoadRetryCount = 0;
let chatLoadRetryTimer: number | null = null;

/** 滚动管理状态 — 必须声明在 watch 之前，因为 resetState 被 immediate watch 调用 */
let readVisibilityTimer: number | null = null;
let lastReportedReadMessageId = 0;

// ==================== Pinned Messages ====================
const pinnedBarVisible = ref(false);

function onPinnedVisibleChange(visible: boolean) {
    pinnedBarVisible.value = visible;
}

type HistoryMode = 'normal' | 'jump';

/** 当前历史加载模式：普通模式只从顶部向更旧方向扩展，跳转模式允许两端扩展 */
const historyMode = ref<HistoryMode>('normal');
const jumpOlderExhausted = ref(false);
const jumpNewerExhausted = ref(false);

/** 高亮闪烁的消息 ID，用于顶置消息跳转动画 */
const highlightedMessageId = ref<number | null>(null);
let highlightTimer: number | null = null;

function flashMessage(messageId: number) {
    if (highlightTimer !== null) {
        window.clearTimeout(highlightTimer);
    }
    highlightedMessageId.value = messageId;
    highlightTimer = window.setTimeout(() => {
        highlightedMessageId.value = null;
        highlightTimer = null;
    }, 2000);
}

/** 检查加载代数是否已过期（聊天已切换），过期则中止后续操作 */
function isGenerationValid(gen: number): boolean {
    return gen === loadGeneration;
}

// 监听 chatId 变化，加载聊天信息和消息
watch([chatId, topicId, chatLoadRetryToken, forwardedTargetMessageId], async ([newChatId, , , requestedMessageId]) => {
    if (newChatId === undefined) return;
    if (chatLoadRetryId !== newChatId) {
        chatLoadRetryId = newChatId;
        chatLoadRetryCount = 0;
        if (chatLoadRetryTimer !== null) {
            window.clearTimeout(chatLoadRetryTimer);
            chatLoadRetryTimer = null;
        }
    }
    const currentId = newChatId;
    const gen = ++loadGeneration;

    // 重置全部状态
    resetState();

    try {
        // 1. 获取 chat 基础信息
        const chatData = await tdlibSend({ _: 'getChat', chat_id: currentId }) as chat;
        if (!isGenerationValid(gen)) return;
        chat.value = chatData;

        // 话题模式：加载当前话题信息（用于头部显示话题名称/图标）
        if (topicId.value) {
            topic.value = undefined;
            try {
                const t = await tdlibSend({
                    _: 'getForumTopic',
                    chat_id: currentId,
                    forum_topic_id: topicId.value,
                }) as forumTopic;
                if (!isGenerationValid(gen)) return;
                topic.value = t;
            } catch (e) {
                console.error('Failed to load forum topic:', e);
            }
        } else {
            topic.value = undefined;
        }

        // 获取 supergroup / basicGroup 补充信息
        await Promise.all([
            fetchGroupInfo(chatData, gen),
            syncNotificationMuteState(chatData, currentId)
        ]);
        if (!isGenerationValid(gen)) return;

        // 2. 有未读消息时，以最后一条已读收件箱消息作为历史定位锚点
        const lastReadId = chatData.unread_count > 0
            ? chatData.last_read_inbox_message_id
            : 0;
        lastReportedReadMessageId = chatData.last_read_inbox_message_id;

        if (requestedMessageId) {
            const jumped = await jumpToMessageInternal(requestedMessageId, gen);
            if (!isGenerationValid(gen)) return;
            if (jumped) {
                unreadBoundaryMessageId.value = null;
                isReady.value = true;
                chatLoadRetryCount = 0;
                scheduleVisibleMessagesRead();
                return;
            }
        }

        // 3. 普通进入：围绕读点加载历史
        const historyAnchorId = lastReadId;
        let allMsgs = await fetchMessages(
            currentId,
            historyAnchorId,
            historyAnchorId > 0 ? 60 : 30,
            historyAnchorId > 0 ? -30 : 0,
            gen
        );
        if (!isGenerationValid(gen)) return;
        if (allMsgs.length === 0 && chatData.last_message) {
            throw new Error(`Chat ${currentId} returned empty history despite having a last message`);
        }

        // 如果消息太少，多加载几页填充以确保可滚动
        if (allMsgs.length > 0 && allMsgs.length < 80) {
            for (let i = 0; i < 3; i++) {
                if (!isGenerationValid(gen)) return;
                const oldest = allMsgs[0];
                const more = await fetchMessages(currentId, oldest.id, 50, 0, gen);
                if (more.length === 0) break;
                const existingIds = new Set(allMsgs.map(m => m.id));
                const unique = more.filter(m => !existingIds.has(m.id));
                if (unique.length === 0) break;
                allMsgs = [...unique, ...allMsgs];
            }
        }

        const firstUnreadMessage = chatData.unread_count > 0
            ? allMsgs.find(message => !message.is_outgoing && (lastReadId === 0 || message.id > lastReadId))
            : undefined;
        const unreadAlbumId = firstUnreadMessage?.media_album_id;
        unreadBoundaryMessageId.value = unreadAlbumId && unreadAlbumId !== '0'
            ? allMsgs.find(message => message.media_album_id === unreadAlbumId)?.id || firstUnreadMessage.id
            : firstUnreadMessage?.id || null;

        messages.value = allMsgs;
        messagesVersion.value++;
        await nextTick();

        // 4. 定位到新消息分界线后的第一条未读消息
        const scrollTargetId = unreadBoundaryMessageId.value || lastReadId;
        if (scrollTargetId > 0) {
            await scrollToTargetOrBottom(scrollTargetId, currentId, gen);
        } else {
            await scrollToBottomAsync();
        }

        // 5. 标记完成
        isReady.value = true;
        chatLoadRetryCount = 0;

        // 6. 确保加载后消息容器可滚动（至少撑满视口）
        await nextTick();
        const container = messagesContainer.value;
        if (container && container.scrollHeight <= container.clientHeight + 2) {
            if (messages.value.length > 0 && !isHistoryExhausted.value) {
                const oldest = messages.value[0];
                const more = await fetchMessages(currentId, oldest.id, 50, 0, gen);
                if (more.length > 0) {
                    messages.value = mergeMessages(messages.value, more);
                    messagesVersion.value++;
                }
            }
        }
        scheduleVisibleMessagesRead();
    } catch (e) {
        console.error("Error loading chat:", e);
        if (chatId.value === currentId && chatLoadRetryCount < 2) {
            chatLoadRetryCount++;
            isReady.value = false;
            chatLoadRetryTimer = window.setTimeout(() => {
                chatLoadRetryTimer = null;
                if (chatId.value === currentId) chatLoadRetryToken.value++;
            }, chatLoadRetryCount * 300);
        } else {
            isReady.value = true;
        }
    }
}, { immediate: true });

// ==================== Data Fetching ====================
/**
 * 从 TDLib 加载消息，返回 旧→新 顺序。
 * 注意：fromMessageId 会被 TDLib 包含在返回结果中，调用方需自行去重。
 */
async function fetchMessages(chatIdNum: number, fromMessageId: number, limit: number, offset = 0, generation?: number): Promise<message[]> {
    try {
        // 话题模式使用 getForumTopicHistory
        const tid = topicId.value;
        const result = await tdlibSend(tid ? {
            _: 'getForumTopicHistory',
            chat_id: chatIdNum,
            forum_topic_id: tid,
            from_message_id: fromMessageId,
            offset,
            limit,
        } : {
            _: 'getChatHistory',
            chat_id: chatIdNum,
            from_message_id: fromMessageId,
            offset,
            limit,
            only_local: false
        });
        // 如果生成代数已过期（聊天已切换），丢弃结果
        if (generation !== undefined && !isGenerationValid(generation)) return [];
        const msgs: message[] = (result.messages || []).filter((m: any): m is message => !!m);
        if (msgs.length > 0) {
            await fetchSenders(msgs);
            void fetchMemberStatuses(msgs);
            // TDLib 返回 newest-first，反转成 oldest-first
            msgs.reverse();
            return msgs;
        }
        return [];
    } catch (e) {
        console.error("fetchMessages error:", e);
        return [];
    }
}

/** 合并消息并去重（oldest-first 顺序），返回新数组 */
function mergeMessages(existing: message[], incoming: message[]): message[] {
    if (existing.length === 0) return incoming;
    if (incoming.length === 0) return existing;
    const existingIds = new Set(existing.map(m => m.id));
    const unique = incoming.filter(m => !existingIds.has(m.id));
    if (unique.length === 0) return existing;
    // incoming 已是最旧→最新，incoming 比 existing 更旧，prepend
    return [...unique, ...existing];
}

/**
 * 跳转时只加载目标附近的一个窗口，不补齐与当前列表之间的 gap。
 */
async function loadJumpWindow(chatIdNum: number, targetMessageId: number, gen: number): Promise<message[]> {
    const LIMIT = 30;
    const [olderBatch, newerBatch] = await Promise.all([
        fetchMessages(chatIdNum, targetMessageId, LIMIT, 0, gen),
        fetchMessages(chatIdNum, targetMessageId, LIMIT, -LIMIT, gen),
    ]);

    if (!isGenerationValid(gen)) return [];

    const seen = new Set<number>();
    const combined: message[] = [];
    for (const msg of [...olderBatch, ...newerBatch]) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        combined.push(msg);
    }
    combined.sort((a, b) => a.id - b.id);
    return combined;
}

/**
 * 普通历史加载：只向更旧方向扩展当前列表顶部。
 * 跳转模式下仍然复用同一套边缘加载，但不再引入任何额外上下文。
 */
async function loadHistoryOlder(loadChatId: number, gen: number): Promise<boolean> {
    if (isLoadingMore.value) return false;

    const oldestId = messages.value[0]?.id;
    if (!oldestId) {
        if (historyMode.value === 'normal') {
            isHistoryExhausted.value = true;
        } else {
            jumpOlderExhausted.value = true;
        }
        return false;
    }

    isLoadingMore.value = true;
    try {
        const older = await fetchMessages(loadChatId, oldestId, 30, 0, gen);
        if (!isGenerationValid(gen) || chatId.value !== loadChatId) return false;
        if (older.length === 0) {
            if (historyMode.value === 'normal') {
                isHistoryExhausted.value = true;
            } else {
                jumpOlderExhausted.value = true;
            }
            return false;
        }

        const existingIds = new Set(messages.value.map(m => m.id));
        const unique = older.filter(m => !existingIds.has(m.id));
        if (unique.length === 0) {
            if (historyMode.value === 'normal') {
                isHistoryExhausted.value = true;
            } else {
                jumpOlderExhausted.value = true;
            }
            return false;
        }

        const el = messagesContainer.value;
        const prevHeight = el?.scrollHeight ?? 0;
        const prevTop = el?.scrollTop ?? 0;

        messages.value = [...unique, ...messages.value];
        messagesVersion.value++;
        await nextTick();

        if (el) {
            el.scrollTop = el.scrollHeight - prevHeight + prevTop;
        }
        return true;
    } finally {
        isLoadingMore.value = false;
    }
}

/**
 * 跳转模式下向更“新”的方向扩展当前列表底部。
 * 普通模式不主动拉取更新消息，新增消息依赖 TDLib 更新事件。
 */
async function loadHistoryNewer(loadChatId: number, gen: number): Promise<boolean> {
    if (isLoadingMore.value) return false;

    const newestId = messages.value[messages.value.length - 1]?.id;
    if (!newestId) {
        jumpNewerExhausted.value = true;
        return false;
    }

    isLoadingMore.value = true;
    try {
        const newer = await fetchMessages(loadChatId, newestId, 30, -30, gen);
        if (!isGenerationValid(gen) || chatId.value !== loadChatId) return false;

        const filtered = newer.filter(m => m.id !== newestId);
        if (filtered.length === 0) {
            jumpNewerExhausted.value = true;
            return false;
        }

        const existingIds = new Set(messages.value.map(m => m.id));
        const unique = filtered.filter(m => !existingIds.has(m.id));
        if (unique.length === 0) {
            jumpNewerExhausted.value = true;
            return false;
        }

        messages.value = [...messages.value, ...unique];
        messagesVersion.value++;
        await nextTick();
        return true;
    } finally {
        isLoadingMore.value = false;
    }
}

/** 并发获取消息中涉及的用户/频道信息 */
const fetchSenders = async (msgs: message[]) => {
    const userIds = new Set<number>();
    const chatIds = new Set<number>();

    msgs.forEach(m => {
        if (m.sender_id._ === 'messageSenderUser' && !users.value[m.sender_id.user_id]) {
            userIds.add(m.sender_id.user_id);
        } else if (m.sender_id._ === 'messageSenderChat' && !chats.value[m.sender_id.chat_id]) {
            chatIds.add(m.sender_id.chat_id);
        }

        const forwardInfo = m.forward_info;
        if (!forwardInfo) return;

        const origin = forwardInfo.origin;
        if (origin._ === 'messageOriginUser' && !users.value[origin.sender_user_id]) {
            userIds.add(origin.sender_user_id);
        } else if (origin._ === 'messageOriginChat' && !chats.value[origin.sender_chat_id]) {
            chatIds.add(origin.sender_chat_id);
        } else if (origin._ === 'messageOriginChannel' && !chats.value[origin.chat_id]) {
            chatIds.add(origin.chat_id);
        }

        const sourceSender = forwardInfo.source?.sender_id;
        if (sourceSender?._ === 'messageSenderUser' && !users.value[sourceSender.user_id]) {
            userIds.add(sourceSender.user_id);
        } else if (sourceSender?._ === 'messageSenderChat' && !chats.value[sourceSender.chat_id]) {
            chatIds.add(sourceSender.chat_id);
        }
    });

    await Promise.all([
        ...Array.from(userIds).map(uid =>
            tdlibSend({ _: 'getUser', user_id: uid })
                .then(u => { users.value[uid] = u; })
                .catch(() => { })
        ),
        ...Array.from(chatIds).map(cid =>
            tdlibSend({ _: 'getChat', chat_id: cid })
                .then(c => { chats.value[cid] = c; })
                .catch(() => { })
        )
    ]);
};

/**
 * 为消息发送者批量拉取群成员信息（角色/标签），用于消息右上角标签。
 * 仅当当前聊天为超级群组/基础群组时有效；私聊/频道发送者不做处理。
 * 每个 user_id 只请求一次（去重）。
 */
const fetchMemberStatuses = async (msgs: message[]) => {
    const c = chat.value;
    if (!c || (c.type._ !== 'chatTypeSupergroup' && c.type._ !== 'chatTypeBasicGroup')) return;
    const cid = chatId.value;
    if (!cid) return;

    const userIds = new Set<number>();
    msgs.forEach(m => {
        if (m.sender_id?._ === 'messageSenderUser') {
            userIds.add(m.sender_id.user_id);
        }
    });

    await Promise.all(
        Array.from(userIds).map(async uid => {
            if (pendingMemberStatus.has(uid)) return;
            if (memberStatus.value[uid] !== undefined) return;
            pendingMemberStatus.add(uid);
            try {
                const member = await tdlibSend({
                    _: 'getChatMember',
                    chat_id: cid,
                    member_id: { _: 'messageSenderUser', user_id: uid },
                }) as any;
                if (member) {
                    memberStatus.value[uid] = {
                        status: member.status,
                        tag: typeof member.tag === 'string' && member.tag ? member.tag : undefined,
                    };
                }
            } catch (e) {
                /* 忽略：非成员/无权限等 */
            } finally {
                pendingMemberStatus.delete(uid);
            }
        })
    );
};

/**
 * 根据发送者 id 计算其在当前群聊中的角色标签。
 * 返回 'creator' | 'admin' | 'member'；私聊/频道/未知时返回 undefined（不显示标签）。
 */
const getSenderRole = (sender: MessageSender | undefined): 'creator' | 'admin' | 'member' | undefined => {
    if (!chat.value) return undefined;
    const ct = chat.value.type;
    if (ct._ === 'chatTypeBasicGroup') {
        // 基础群组：正常显示
    } else if (ct._ === 'chatTypeSupergroup') {
        // 超级群组：仅普通群组显示成员角色标签，频道不显示
        if (ct.is_channel) return undefined;
    } else {
        return undefined;
    }
    if (!sender || sender._ !== 'messageSenderUser') return undefined;
    const member = memberStatus.value[sender.user_id];
    if (!member?.status) return undefined;
    switch (member.status._) {
        case 'chatMemberStatusCreator':
            // 匿名创建者不显示个人标签
            return member.status.is_anonymous ? undefined : 'creator';
        case 'chatMemberStatusAdministrator':
            return 'admin';
        default:
            return 'member';
    }
};

/**
 * 消息右上角标签文本：
 * - 创建者 → 「群主」
 * - 管理员 → 「管理员」
 * - 普通成员 → 若 TDLib 提供了自定义 tag 则显示该 tag，否则返回空串（什么都不显示）
 */
const getSenderRoleText = (sender: MessageSender | undefined): string => {
    if (!sender || sender._ !== 'messageSenderUser') return '';
    const member = memberStatus.value[sender.user_id];
    const role = getSenderRole(sender);
    if (role === 'creator') return '群主';
    if (role === 'admin') return '管理员';
    // 普通成员：仅有自定义 tag 时才显示
    if (role === 'member') return member?.tag || '';
    return '';
};

/**
 * 消息右上角标签样式 class（胶囊 + 文字色）：
 * - 创建者 → 浅紫色胶囊 + 浅色文字
 * - 管理员 → 浅绿色胶囊 + 绿色文字
 * - 普通成员 → 无胶囊，纯灰色文字
 */
const getSenderRoleClass = (sender: MessageSender | undefined): string => {
    const role = getSenderRole(sender);
    if (role === 'creator') {
        return 'bg-purple-200/70 text-purple-500 dark:bg-purple-500/20 dark:text-purple-300';
    }
    if (role === 'admin') {
        return 'bg-green-200/70 text-green-600 dark:bg-green-500/20 dark:text-green-300';
    }
    if (role === 'member') {
        return 'text-gray-500 dark:text-gray-400';
    }
    return '';
};

/**
 * 判断消息是否为「群组关联频道」自动转到群组的消息。
 * 这类消息的 sender 是频道（messageSenderChat），且 forward_info 指向同一个频道
 * （即频道把帖子同步推送到其讨论群组），不作为普通转发显示，也不显示转发标记。
 */
const isLinkedChannelMessage = (msg: message): boolean => {
    if (msg.sender_id?._ !== 'messageSenderChat') return false;
    if (!msg.forward_info) return false;
    const origin = msg.forward_info.origin;
    return origin._ === 'messageOriginChannel' && origin.chat_id === msg.sender_id.chat_id;
};

/**
 * 消息右上角标签文本（整条消息维度）：
 * - 群组关联频道的消息 → 「频道」
 * - 否则回退到按发送者角色判断（创建者/管理员/成员 tag）
 */
const getMessageLabel = (msg: message): string => {
    if (isLinkedChannelMessage(msg)) return '频道';
    return getSenderRoleText(msg.sender_id);
};

/** 消息右上角标签样式 class（整条消息维度） */
const getMessageLabelClass = (msg: message): string => {
    if (isLinkedChannelMessage(msg)) {
        return 'bg-gray-200/70 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300';
    }
    return getSenderRoleClass(msg.sender_id);
};

/**
 * 取应传给内容/转发组件的 forwardInfo：
 * 群组关联频道的消息不显示转发标记，返回 undefined；否则返回原始 forward_info。
 */
const getDisplayForwardInfo = (msg: message): messageForwardInfo | undefined =>
    isLinkedChannelMessage(msg) ? undefined : msg.forward_info;

/** 获取 supergroup / basicGroup 信息 */
async function fetchGroupInfo(chatData: chat, gen: number) {
    if (chatData.type._ === 'chatTypeSupergroup') {
        const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: chatData.type.supergroup_id });
        if (!isGenerationValid(gen)) return;
        supergroups.value[chatData.type.supergroup_id] = sg;
        if (chatData.type.is_channel || sg.is_broadcast_group) {
            try {
                const fullInfo = await tdlibSend({
                    _: 'getSupergroupFullInfo',
                    supergroup_id: chatData.type.supergroup_id
                });
                if (!isGenerationValid(gen)) return;
                linkedChatId.value = fullInfo.linked_chat_id;
            } catch (e) {
                console.error('Failed to load linked chat:', e);
            }
        }
    } else if (chatData.type._ === 'chatTypeBasicGroup') {
        const bg = await tdlibSend({ _: 'getBasicGroup', basic_group_id: chatData.type.basic_group_id });
        if (!isGenerationValid(gen)) return;
        basicGroups.value[chatData.type.basic_group_id] = bg;
    }
}

// ==================== Scroll Management ====================
/** 滚动稳定后，将当前视口中的未读消息批量标记为已读 */
function scheduleVisibleMessagesRead() {
    if (!isReady.value) return;
    if (readVisibilityTimer !== null) window.clearTimeout(readVisibilityTimer);
    readVisibilityTimer = window.setTimeout(() => {
        readVisibilityTimer = null;
        void markVisibleMessagesAsRead();
    }, 120);
}

async function markVisibleMessagesAsRead() {
    const currentChatId = chatId.value;
    const container = messagesContainer.value;
    if (!currentChatId || !container) return;

    const containerRect = container.getBoundingClientRect();
    const visibleUnreadIds = new Set<number>();
    const renderedMessages = container.querySelectorAll<HTMLElement>('[data-msg-id]');

    for (const element of renderedMessages) {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) continue;

        const messageId = Number(element.dataset.msgId);
        const renderedMessage = messages.value.find(message => message.id === messageId);
        if (!renderedMessage) continue;

        const visibleMessages = renderedMessage.media_album_id && renderedMessage.media_album_id !== '0'
            ? messages.value.filter(message => message.media_album_id === renderedMessage.media_album_id)
            : [renderedMessage];
        for (const message of visibleMessages) {
            if (!message.is_outgoing && message.id > lastReportedReadMessageId) {
                visibleUnreadIds.add(message.id);
            }
        }
    }

    if (visibleUnreadIds.size === 0) return;
    const messageIds = [...visibleUnreadIds].sort((a, b) => a - b);
    const previousReportedId = lastReportedReadMessageId;
    const latestVisibleId = messageIds[messageIds.length - 1];
    lastReportedReadMessageId = latestVisibleId;

    try {
        await tdlibSend({
            _: 'viewMessages',
            chat_id: currentChatId,
            message_ids: messageIds,
            force_read: true,
            source: topicId.value ? { _: 'messageSourceForumTopicHistory' } : undefined,
        } as any);
    } catch (e) {
        if (chatId.value === currentChatId && lastReportedReadMessageId === latestVisibleId) {
            lastReportedReadMessageId = previousReportedId;
        }
        console.error('Failed to mark visible messages as read:', e);
    }
}

/** 检测是否在底部附近 */
const isAtBottom = (threshold = 150): boolean => {
    const el = messagesContainer.value;
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
};

/** 滚动到底部（标准 flex-col：scrollTop = scrollHeight） */
const scrollToBottom = () => {
    showScrollButton.value = false;
    newMessageCount.value = 0;
    nextTick(() => {
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
    });
};

/** 异步等待后滚动到底部 */
const scrollToBottomAsync = async () => {
    await nextTick();
    scrollToBottom();
    // 媒体加载后二次校准
    setTimeout(scrollToBottom, 200);
};

/** 滚动到指定消息元素，将其放在视口约 45% 位置 */
const scrollToMessage = (messageId: number) => {
    nextTick(() => {
        const el = messagesContainer.value;
        if (!el) return;
        const target = messages.value.find(message => message.id === messageId);
        const renderedMessageId = target?.media_album_id && target.media_album_id !== '0'
            ? messages.value.find(message => message.media_album_id === target.media_album_id)?.id || messageId
            : messageId;
        const msgEl = el.querySelector(`[data-msg-id="${renderedMessageId}"]`) as HTMLElement | null;
        if (!msgEl) return;

        const containerHeight = el.clientHeight;
        const targetOffset = msgEl.offsetTop;
        const targetHeight = msgEl.clientHeight;
        let desired = Math.round(targetOffset - containerHeight * 0.45 + targetHeight / 2);
        desired = Math.max(0, Math.min(desired, el.scrollHeight - containerHeight));
        el.scrollTop = desired;
    });
};

/**
 * 按 id 范围从 TDLib 加载消息（oldest-first）。
 * 从 toId 方向下探，自动跨多页直至覆盖到 fromId 或到达历史边界，用于填补跳转断层。
 */
/**
 * 统一跳转函数：只加载目标附近窗口并定位，不补齐中间 gap。
 */
async function jumpToMessageInternal(messageId: number, gen: number): Promise<boolean> {
    const currentChatId = chatId.value;
    if (!currentChatId) return false;

    const windowMessages = await loadJumpWindow(currentChatId, messageId, gen);
    if (!isGenerationValid(gen) || chatId.value !== currentChatId || windowMessages.length === 0) {
        return false;
    }

    messages.value = windowMessages;
    messagesVersion.value++;
    historyMode.value = 'jump';
    jumpOlderExhausted.value = false;
    jumpNewerExhausted.value = false;
    isHistoryExhausted.value = false;

    await nextTick();
    scrollToMessage(messageId);
    flashMessage(messageId);

    setTimeout(() => {
        if (isGenerationValid(gen) && chatId.value === currentChatId) {
            scrollToMessage(messageId);
        }
    }, 200);

    return true;
}

async function jumpToMessage(messageId: number) {
    await jumpToMessageInternal(messageId, loadGeneration);
}

/** 滚动到指定消息并触发高亮闪烁（用于回复跳转，目标不在列表时也会先加载） */
const handleReplyJumpToMessage = (messageId: number) => {
    void jumpToMessage(messageId);
};

/** 尝试定位到目标消息，找不到则到底部 */
async function scrollToTargetOrBottom(targetId: number, chatIdNum: number, gen: number) {
    for (let attempt = 0; attempt < 10; attempt++) {
        if (!isGenerationValid(gen)) return;
        const exists = messages.value.some(m => m.id === targetId);
        if (exists) {
            scrollToMessage(targetId);
            setTimeout(() => {
                if (isGenerationValid(gen)) scrollToMessage(targetId);
            }, 200);
            return;
        }
        if (isHistoryExhausted.value || messages.value.length === 0) break;
        const oldest = messages.value[0];
        const more = await fetchMessages(chatIdNum, oldest.id, 30, 0, gen);
        if (more.length === 0) break;
        const previousCount = messages.value.length;
        messages.value = mergeMessages(messages.value, more);
        await nextTick();
        if (messages.value.length === previousCount) {
            break;
        }
    }
    scrollToBottom();
}

// ==================== Scroll Events ====================
const onScroll = async (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    const H = el.scrollHeight;
    const C = el.clientHeight;
    const T = el.scrollTop;

    // 底部检测
    const atBottom = T + C >= H - 100;
    showScrollButton.value = !atBottom;
    if (atBottom && newMessageCount.value > 0) {
        newMessageCount.value = 0;
    }
    scheduleVisibleMessagesRead();

    // 内容未溢出时忽略
    if (H <= C + 2) return;

    if (isLoadingMore.value || !chatId.value || !isReady.value) return;
    const scrollGen = loadGeneration;
    const loadChat = chatId.value;

    const atTop = T <= 30;
    const nearBottom = T + C >= H - 100;

    if (historyMode.value === 'jump') {
        if (!jumpOlderExhausted.value && atTop) {
            await loadHistoryOlder(loadChat, scrollGen);
            return;
        }
        if (!jumpNewerExhausted.value && nearBottom) {
            await loadHistoryNewer(loadChat, scrollGen);
            return;
        }
        return;
    }

    if (!atTop || isHistoryExhausted.value || messages.value.length === 0) return;
    await loadHistoryOlder(loadChat, scrollGen);
};

// ==================== Send Message ====================
const handleSend = async (text: string) => {
    if (!chatId.value || !text.trim()) return;
    try {
        const params: any = {
            _: 'sendMessage',
            chat_id: chatId.value,
            input_message_content: {
                _: 'inputMessageText',
                text: { _: 'formattedText', text, entities: [] },
                disable_web_page_preview: false,
                clear_draft: true
            }
        };
        // 回复模式：附加回复目标
        if (replyTargetMsg.value) {
            params.reply_to = {
                _: 'inputMessageReplyToMessage',
                message_id: replyTargetMsg.value.id,
                quote: null,
                checklist_task_id: 0,
            };
        }
        // 话题模式时指定 topic_id
        if (topicId.value) {
            params.topic_id = { _: 'messageTopicForum', forum_topic_id: topicId.value };
        }
        await tdlibSend(params);
        messageInput.value = '';
        // 发送成功后清除回复状态
        replyTargetMsg.value = null;
    } catch (e) {
        console.error("Failed to send message:", e);
    }
};

const handleAttach = (files: FileList) => {
    console.log("Attach files:", files);
};

// ==================== State Reset ====================
function resetState() {
    if (readVisibilityTimer !== null) {
        window.clearTimeout(readVisibilityTimer);
        readVisibilityTimer = null;
    }
    lastReportedReadMessageId = 0;
    messages.value = [];
    chat.value = undefined;
    topic.value = undefined;
    memberStatus.value = {};
    isHistoryExhausted.value = false;
    isReady.value = false;
    unreadBoundaryMessageId.value = null;
    showScrollButton.value = false;
    newMessageCount.value = 0;
    newMessageIds.value = new Set();
    notificationsMuted.value = false;
    isNotificationTogglePending.value = false;
    linkedChatId.value = 0;
    isJoinPending.value = false;
    joinRequestSent.value = false;
    pinnedBarVisible.value = false;
    historyMode.value = 'normal';
    jumpOlderExhausted.value = false;
    jumpNewerExhausted.value = false;
    // 清空回复与多选状态
    replyTargetMsg.value = null;
    selectionMode.value = false;
    selectedMsgIds.value = [];
    if (highlightTimer !== null) {
        window.clearTimeout(highlightTimer);
        highlightTimer = null;
    }
    highlightedMessageId.value = null;
}

// ==================== Helpers ====================

/** 判断当前频道是否开启了显示发送者信息（个人资料显示），
 *  此时即使是自己发的消息也应和其他消息一样靠左显示 */
const isChannelWithSenderDisplay = computed(() =>
    isChannelWithSenderDisplayOf(chat.value, { supergroups: supergroups.value, basicGroups: basicGroups.value })
);

const isSelf = (msg: message) => {
    // 在开启了发送者显示的频道中，所有消息统一靠左，不区分颜色
    if (isChannelWithSenderDisplay.value) return false;
    return isOutgoingMessageForDisplay(msg, chat.value, myId.value);
};

const isMessageRead = (msg: message) =>
    msg.is_outgoing
    && !msg.sending_state
    && !!chat.value
    && msg.id <= chat.value.last_read_outbox_message_id;

/** 当前右键菜单对应的消息（供权限预取完成后刷新菜单） */
let currentMenuMsg: message | null = null;

/**
 * 返回消息右键菜单构建函数（指令函数形式受支持）。
 * 用闭包绑定消息，避免在模板内联箭头导致参数无类型/未使用告警。
 */
function makeMsgMenu(msg: message): (e: MouseEvent, data?: any) => ContextMenuItem[] {
    return (e: MouseEvent, data?: any): ContextMenuItem[] => {
        void e;
        void data;
        return buildMessageContextMenu(msg);
    };
}

/**
 * 构建消息右键菜单项（开发环境附带“复制消息原始 JSON”）。
 * 打开时触发 getMessageProperties 离线预取精确权限；预取完成后若菜单仍对应
 * 这条消息则用新权限重建菜单项。
 */
function buildMessageContextMenu(msg: message): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    const isService = isServiceMessage(msg);
    const cid = chatId.value;

    // 记录当前菜单对应消息，并触发属性预取（离线方法，很快）。
    // 仅当缓存未命中才预取 + 刷新，避免 rebuild 后缓存命中造成无限递归。
    currentMenuMsg = msg;
    if (cid !== undefined && !getCachedMessageProperties(cid, msg.id)) {
        void getMessageProperties(cid, msg.id).then(() => {
            if (currentMenuMsg === msg) {
                rebuildOpenMessageMenu(msg);
            }
        });
    }

    // —— 回复 ——
    if (!isService && canReplyMessage(msg, cid)) {
        items.push({
            key: 'reply',
            label: '回复',
            icon: ReplyIcon,
            onClick: () => startReply(msg),
        });
    }

    // —— 多选 ——
    if (!isService) {
        items.push({
            key: 'multi-select',
            label: '多选',
            icon: CheckSquareIcon,
            onClick: () => enterSelectionMode(msg),
        });
    }

    // —— 复制文本 / 媒体描述 ——
    items.push({
        key: 'copy-text',
        label: isMediaMessage(msg) ? '复制描述' : '复制文本',
        icon: CopyPlusIcon,
        disabled: !canCopyMessage(msg, cid),
        onClick: () => copyMessageText(msg),
    });

    // —— 复制链接 ——
    items.push({
        key: 'copy-link',
        label: '复制链接',
        icon: LinkIcon,
        disabled: !canGetMessageLink(msg, cid),
        onClick: () => copyMessageLink(cid!, msg),
    });

    // 分隔线
    if (!isService) {
        items.push({ key: 'divider-1', label: '', divider: true });

        // —— 置顶 / 取消置顶 ——
        if (canPinMessage(msg, cid)) {
            items.push({
                key: 'pin',
                label: msg.is_pinned ? '取消置顶' : '置顶',
                icon: PinIcon,
                onClick: async () => {
                    await toggleMessagePinned(cid!, msg);
                },
            });
        }

        // —— 删除（打开精确权限确认弹窗） ——
        if (cid !== undefined && canDeleteMessage(msg, cid)) {
            items.push({
                key: 'delete',
                label: '删除',
                icon: TrashIcon,
                danger: true,
                onClick: async () => {
                    await openDeleteConfirm(msg);
                },
            });
        }
    }

    // 开发环境：复制消息原始 JSON
    if (import.meta.env.DEV) {
        items.push({
            key: 'divider-json',
            label: '',
            divider: true,
        });
        items.push({
            key: 'copy-json',
            label: '复制消息原始 JSON',
            icon: ClipboardCopyIcon,
            onClick: () => copyMessageJson(msg),
        });
    }

    return items;
}

/** 权限预取完成后，若同一消息的右键菜单仍打开，则用最新权限重建菜单项 */
function rebuildOpenMessageMenu(msg: message) {
    // 仅当菜单仍可见且仍对应这条消息（通常 currentMenuMsg 未变）才刷新
    if (currentMenuMsg !== msg) return;
    const menuItems = buildMessageContextMenu(msg);
    openContextMenu(ctxX.value, ctxY.value, menuItems, ctxTarget.value);
}

// ==================== 删除确认弹窗 ====================

/**
 * 计算当前用户对消息发送者可执行的额外管理操作（删除全部消息 / 封禁）。
 * - 删除该发送者所有消息（deleteChatMessagesBySender）：仅超级群组，需 can_delete_messages 权限；
 * - 封禁（banChatMember）：超级群组/基础群组，需 can_restrict_members 权限；
 * 创建者拥有全部权限；自己发送的消息不可封禁/删除自己全部。
 */
function getSenderModeration(msg: message): { canDeleteAll: boolean; canBan: boolean } {
    const c = chat.value;
    if (!c) return { canDeleteAll: false, canBan: false };
    const sender = msg.sender_id;
    if (!sender) return { canDeleteAll: false, canBan: false };

    // 自己发的消息不可封禁/删除自己全部
    if (sender._ === 'messageSenderUser' && sender.user_id === myId.value) {
        return { canDeleteAll: false, canBan: false };
    }

    let canDeleteAll = false;
    let canBan = false;

    if (c.type._ === 'chatTypeSupergroup') {
        const sg = supergroups.value[c.type.supergroup_id];
        const status = sg?.status;
        if (!status) return { canDeleteAll: false, canBan: false };
        if (status._ === 'chatMemberStatusCreator') {
            canDeleteAll = true;
            canBan = true;
        } else if (status._ === 'chatMemberStatusAdministrator') {
            canDeleteAll = status.rights.can_delete_messages;
            canBan = status.rights.can_restrict_members;
        }
    } else if (c.type._ === 'chatTypeBasicGroup') {
        const bg = basicGroups.value[c.type.basic_group_id];
        const status = bg?.status;
        if (!status) return { canDeleteAll: false, canBan: false };
        // 基础群组管理员拥有全部适用权限；但 deleteChatMessagesBySender 仅超级群组支持
        if (status._ === 'chatMemberStatusCreator' || status._ === 'chatMemberStatusAdministrator') {
            canDeleteAll = false;
            canBan = true;
        }
    }

    return { canDeleteAll, canBan };
}

/**
 * 打开「删除消息」确认弹窗，并根据用户选择执行删除/删除全部/封禁。
 * 点击删除菜单项时调用。
 */
async function openDeleteConfirm(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;
    const sender = msg.sender_id;
    const { canDeleteAll, canBan } = getSenderModeration(msg);

    const req: DeleteMessageRequest = {
        chatId: cid,
        msg,
        senderId: sender,
        senderName: sender ? getDisplaySenderName(msg) || undefined : undefined,
        canDeleteAllFromSender: canDeleteAll,
        canBanSender: canBan,
        canDeleteMessage: canDeleteMessage(msg, cid),
    };

    try {
        const result = await confirmDeleteMessage(req);
        await executeDeleteActions(cid, msg, sender, result);
    } catch {
        // 用户取消，忽略
    }
}

// ==================== 发送者 / 气泡样式（薄封装，逻辑见 composables） ====================

/** 发送者 accent_color_id（用于名称/头像/回复/引用配色） */
const getSenderAccentId = (msg: message): number | undefined =>
    getSenderAccentColorId(msg.sender_id);

/** 发送者头像渐变 profile_accent_color_id（用于无头像时的头像背景） */
const getSenderProfileAccentId = (msg: message): number | undefined =>
    getSenderProfileAccentColorId(msg.sender_id);

/** 读取当前用户/聊天缓存（调用时求值以保持响应式） */
const senderCaches = () => ({ users: users.value, chats: chats.value });

/** 发送者显示计算的完整动态依赖（调用时求值以保持响应式） */
const senderDeps = (): SenderDisplayDeps => ({
    ...senderCaches(),
    chat: chat.value,
    myId: myId.value,
    getSenderAccentId,
    getSenderProfileAccentId,
    accentTextColor,
    showSenderName: showSenderName.value,
    isSelf,
});

/** 气泡背景计算的动态依赖 */
const bubbleBackgroundDeps = (): BubbleBackgroundDeps => ({
    getSenderAccentId,
    accentColorStyle,
    isDark: isDark.value,
});

/** 气泡完整样式计算的动态依赖 */
const bubbleDeps = (): BubbleStyleDeps => ({
    ...bubbleBackgroundDeps(),
    messages: messages.value,
    bubbleWidths: bubbleWidths.value,
    isSelf,
    settings: settings.message,
});

/** 转发来源名颜色：自己消息保持浅色类（不设内联色），他人用发送者 accent 色 */
const forwardColor = (
    item: { msg: message } | { messages: message[] },
    isAlbum: boolean,
): Record<string, string> | undefined =>
    computeForwardColor(item, isAlbum, isSelf, senderDeps());

/** 发送者名称内联样式；无 accent 时回退蓝色 */
const senderNameColor = (msg: message): Record<string, string> =>
    computeSenderNameColor(msg, senderDeps());

/** 消息显示设置：随 settings 变化，作为消息区 CSS 变量供文本组件继承 */
const messagesStyle = computed<Record<string, string>>(() =>
    messagesStyleCss(settings.message));

/** 气泡内联样式：合并本体 scale（zoom）与圆角。 */
const bubbleStyle = (item: { msg: message; isFirstInGroup: boolean; isLastInGroup: boolean; index: number }): Record<string, string> =>
    computeBubbleStyle(item, bubbleDeps());

/** 相册气泡样式：scale + 圆角 + self 背景 */
const albumStyle = (item: { messages: message[] }): Record<string, string> =>
    computeAlbumStyle(item, bubbleDeps());

/** 展示发送者（转发 origin / 发送者）的 profile accent 色（头像背景用） */
const getDisplaySenderProfileAccentId = (msg: message): number | undefined =>
    computeDisplaySenderProfileAccentId(msg, senderDeps());

const getForwardName = (forwardInfo: messageForwardInfo): string =>
    computeForwardName(forwardInfo, senderCaches());

const isSavedForwardedMessage = (msg: message): boolean =>
    computeIsSavedForwardedMessage(msg, { chat: chat.value, myId: myId.value, users: users.value, chats: chats.value });

const getDisplaySenderName = (msg: message): string =>
    computeDisplaySenderName(msg, senderDeps());

const showSenderDisplayName = (msg: message): boolean =>
    computeShowSenderDisplayName(msg, senderDeps());

const getDisplaySenderPhoto = (msg: message): chatPhotoInfo | profilePhoto | undefined =>
    computeDisplaySenderPhoto(msg, senderDeps());

/** 展示发送者是否已删除账户（用于头像显示删除图标） */
const getDisplaySenderDeleted = (msg: message): boolean =>
    computeDisplaySenderDeleted(msg);

const canNavigateForward = (forwardInfo: messageForwardInfo) =>
    !!getForwardNavigationTarget(forwardInfo);

async function openForwardSource(forwardInfo: messageForwardInfo) {
    const target = getForwardNavigationTarget(forwardInfo);
    if (!target) return;

    try {
        if (target.type === 'user') {
            const privateChat = await tdlibSend({
                _: 'createPrivateChat',
                user_id: target.userId,
                force: false
            }) as chat;
            await router.push(`/home/chat/${privateChat.id}`);
            return;
        }

        await router.push({
            name: 'chat-detail',
            params: { id: String(target.chatId) },
            query: target.messageId ? { message: String(target.messageId) } : {}
        });
    } catch (error) {
        console.error('Failed to open forwarded message source:', error);
    }
}

// ==================== Computed ====================
/** 会话类型缓存（供权限模块使用） */
const groupCaches = () => ({ supergroups: supergroups.value, basicGroups: basicGroups.value });

const showSenderName = computed(() => showSenderNameOf(chat.value));

/** 是否显示左侧头像列（群组和开启了显示发送者的频道） */
const showAvatarColumn = computed(() => showAvatarColumnOf(chat.value, groupCaches()));

/**
 * 群聊头像属于实际发送者；收藏中的转发消息改用原始来源头像。
 * 普通私聊仍不额外占用头像列。
 */
const shouldReserveAvatarColumn = (msg: message) => {
    if (isSelf(msg)) return false;
    return isSavedForwardedMessage(msg) || showAvatarColumn.value;
};

const showSkeleton = computed(() => messages.value.length === 0 && !isReady.value);

/** 动态顶部间距：同时考虑顶置栏和音乐播放器入口 */
const showTopCard = computed(() => pinnedBarVisible.value || player.showEntry);

const topPaddingClass = computed(() => {
    if (showTopCard.value) return 'pt-33';
    return 'pt-16';
});

/**
 * 顶置消息跳转：复用统一的 jumpToMessage，
 * 保证目标消息加载进列表、填补与当前列表的断层，再定位 + 高亮。
 */
async function jumpToPinnedMessage(messageId: number) {
    await jumpToMessage(messageId);
}

// ==================== Display Items ====================
/**
 * 构建消息展示条目（日期分隔 + 单条消息分组 + 相册分组 + 未读分隔）。
 * 纯数据构建逻辑已下沉到 `composables/messageItems.ts`，此处仅注入
 * 依赖组件 ref 的判断回调。
 */
const messageItems = computed<DisplayItem[]>(() =>
    buildDisplayItems(messages.value, unreadBoundaryMessageId.value, {
        isSelf,
        isSavedForwardedMessage,
        shouldReserveAvatarColumn,
    })
);

// ==================== Album Helpers ====================
const isSelfAlbum = (item: AlbumDisplayItem) => isSelf(item.messages[0]);

// ==================== 权限 ====================
const currentMemberStatus = computed<ChatMemberStatus | undefined>(() =>
    getCurrentMemberStatus(chat.value, groupCaches())
);

const canSend = computed(() =>
    canSendChat(chat.value, currentMemberStatus.value, groupCaches())
);

const showMembershipAction = computed(() =>
    showMembershipActionOf(chat.value, currentMemberStatus.value)
);

const canJoinCurrentChat = computed(() =>
    canJoinCurrentChatOf(currentMemberStatus.value)
);

const membershipActionLabel = computed(() => {
    const currentChat = chat.value;
    const noun = currentChat?.type._ === 'chatTypeSupergroup' && currentChat.type.is_channel ? '频道' : '群组';
    if (isJoinPending.value) return '处理中...';
    if (joinRequestSent.value) return '已发送加入申请';
    if (!canJoinCurrentChat.value) return `无法加入${noun}`;

    const needsRequest = currentChat?.type._ === 'chatTypeSupergroup'
        && !!supergroups.value[currentChat.type.supergroup_id]?.join_by_request;
    return needsRequest ? `申请加入${noun}` : `加入${noun}`;
});

async function joinCurrentChat() {
    const currentChat = chat.value;
    if (!currentChat || !canJoinCurrentChat.value || isJoinPending.value || joinRequestSent.value) return;

    const currentChatId = currentChat.id;
    isJoinPending.value = true;
    try {
        await tdlibSend({ _: 'joinChat', chat_id: currentChatId });
        if (chat.value?.id !== currentChatId) return;

        if (currentChat.type._ === 'chatTypeSupergroup') {
            const group = await tdlibSend({ _: 'getSupergroup', supergroup_id: currentChat.type.supergroup_id });
            if (chat.value?.id === currentChatId) supergroups.value[group.id] = group;
        } else if (currentChat.type._ === 'chatTypeBasicGroup') {
            const group = await tdlibSend({ _: 'getBasicGroup', basic_group_id: currentChat.type.basic_group_id });
            if (chat.value?.id === currentChatId) basicGroups.value[group.id] = group;
        }
    } catch (e) {
        if (typeof e === 'object' && e !== null && 'message' in e && e.message === 'INVITE_REQUEST_SENT') {
            if (chat.value?.id === currentChatId) joinRequestSent.value = true;
        } else {
            console.error('Failed to join chat:', e);
        }
    } finally {
        if (chat.value?.id === currentChatId) isJoinPending.value = false;
    }
}

const showChannelActions = computed(() =>
    showChannelActionsOf(chat.value, canSend.value, groupCaches())
);

async function syncNotificationMuteState(chatData: chat, guardId?: number) {
    const settings = chatData.notification_settings;
    if (!settings.use_default_mute_for) {
        if (guardId !== undefined && chat.value?.id !== guardId) return;
        notificationsMuted.value = settings.mute_for > 0;
        return;
    }

    const scope = chatData.type._ === 'chatTypeSupergroup' && chatData.type.is_channel
        ? { _: 'notificationSettingsScopeChannelChats' as const }
        : { _: 'notificationSettingsScopeGroupChats' as const };
    try {
        const scopeSettings = await tdlibSend({ _: 'getScopeNotificationSettings', scope });
        if (guardId !== undefined && chat.value?.id !== guardId) return;
        notificationsMuted.value = scopeSettings.mute_for > 0;
    } catch (e) {
        if (guardId !== undefined && chat.value?.id !== guardId) return;
        notificationsMuted.value = settings.mute_for > 0;
        console.error('Failed to load notification scope settings:', e);
    }
}

async function toggleNotifications() {
    const currentChat = chat.value;
    if (!currentChat || isNotificationTogglePending.value) return;

    isNotificationTogglePending.value = true;
    const nextMuted = !notificationsMuted.value;
    const currentChatId = currentChat.id;
    try {
        await tdlibSend({
            _: 'setChatNotificationSettings',
            chat_id: currentChat.id,
            notification_settings: {
                ...currentChat.notification_settings,
                _: 'chatNotificationSettings',
                use_default_mute_for: false,
                mute_for: nextMuted ? 2147483647 : 0
            }
        });
        if (chat.value?.id !== currentChatId) return;
        currentChat.notification_settings.use_default_mute_for = false;
        currentChat.notification_settings.mute_for = nextMuted ? 2147483647 : 0;
        notificationsMuted.value = nextMuted;
    } catch (e) {
        console.error('Failed to update chat notification settings:', e);
    } finally {
        if (chat.value?.id === currentChatId) isNotificationTogglePending.value = false;
    }
}

const openLinkedChat = () => {
    if (linkedChatId.value) router.push(`/home/chat/${linkedChatId.value}`);
};

// ==================== New Message Animation ====================
const isNewMessage = (id: number) => newMessageIds.value.has(id);
const removeNewMessageId = (id: number) => newMessageIds.value.delete(id);

/** 消息动画结束处理：区分新消息弹出和高亮闪烁 */
function onMessageAnimEnd(event: AnimationEvent, messageId: number) {
    const name = event.animationName;
    if (name === 'flash-highlight') {
        if (highlightedMessageId.value === messageId) {
            highlightedMessageId.value = null;
        }
    } else {
        removeNewMessageId(messageId);
    }
}

const handleScrollToBottom = () => {
    showScrollButton.value = false;
    newMessageCount.value = 0;
    scrollToBottom();
};
</script>
<style scoped>
/* 新消息淡入上弹动画 */
@keyframes message-pop-in {
    from {
        opacity: 0;
        transform: translateY(16px) scale(0.97);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.animate-message-in {
    animation: message-pop-in 0.25s ease-out;
}

/* 消息跳转闪烁高亮动画（回复跳转 / 顶置跳转共用）：
   整行背景色 + 边缘光晕，逐步淡出，提供明显的定位提示 */
@keyframes flash-highlight {
    0% {
        box-shadow: 0 0 0 0 transparent;
        background-color: transparent;
    }

    12% {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
        background-color: rgba(59, 130, 246, 0.18);
    }

    40% {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28);
        background-color: rgba(59, 130, 246, 0.15);
    }

    100% {
        box-shadow: 0 0 0 0 transparent;
        background-color: transparent;
    }
}

.animate-flash-highlight {
    animation: flash-highlight 1.4s ease-in-out 0.15s;
    border-radius: 10px;
}

/* 叠层面板滑动动画 */
.overlay-slide-enter-active,
.overlay-slide-leave-active {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.overlay-slide-enter-from,
.overlay-slide-leave-to {
    transform: translateX(100%);
}

/* 跳到底部按钮淡入淡出 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* 多选操作栏滑入动画 */
.multi-bar-enter-active,
.multi-bar-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.multi-bar-enter-from,
.multi-bar-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}
</style>
<style>
.messages-scroll {
    min-height: 0;
}

/* Telegram-like bubble style: text should wrap nicely */
.messages-scroll>div>div>div>.max-w-\[70\%\] {
    word-break: break-word;
    line-height: 1.4;
}
</style>
