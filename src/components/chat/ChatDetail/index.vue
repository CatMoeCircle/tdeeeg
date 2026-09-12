<template>
    <!-- 默认壁纸由 HomeView 底层统一绘制；此处仅在聊天有专属背景时叠一层 -->
    <div class="h-full relative overflow-hidden chat-wallpaper-root" :style="hasChatSpecificBackground ? chatBackgroundStyle : undefined">
        <template v-if="hasChatSpecificBackground">
            <div class="absolute inset-0 pointer-events-none chat-wallpaper-layer" :style="chatWallpaperLayerStyle"></div>
            <div class="absolute inset-0 pointer-events-none bg-white chat-wallpaper-overlay"
                :style="{ opacity: settings.chatWallpaperOverlayOpacity / 100 }"></div>
        </template>
        <!-- ===== Messages Area (底层，穿透 header/footer) ===== -->
        <!-- Skeleton -->
        <div v-if="showSkeleton"
            class="absolute inset-0 z-10 overflow-y-auto px-4 custom-scrollbar flex flex-col messages-scroll"
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
            class="absolute inset-0 z-10 overflow-y-auto px-4 custom-scrollbar flex flex-col messages-scroll pb-15"
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
                            <div class="flex mb-2" :class="isSelfAlbum(item) ? 'justify-end' : 'justify-start'">
                                <div v-if="selectionMode"
                                    class="self-center shrink-0 mr-1 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center pointer-events-none select-none"
                                    :class="isMsgSelected(item.messages[0].id) ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'">
                                    <CheckIcon v-if="isMsgSelected(item.messages[0].id)"
                                        class="w-3.5 h-3.5 text-white" />
                                </div>
                                <div v-if="shouldReserveAvatarColumn(item.messages[0])"
                                    class="w-9 shrink-0 mr-2 self-end">
                                    <button type="button"
                                        class="block w-9 h-9 rounded-full overflow-hidden focus:outline-none"
                                        :class="{ 'cursor-pointer': true }"
                                        @click.stop="openSenderProfile(item.messages[0])"
                                        :disabled="!canOpenSenderProfile(item.messages[0])">
                                        <Avatar :photo="getDisplaySenderPhoto(item.messages[0])"
                                            :title="getDisplaySenderName(item.messages[0])"
                                            :accentColorId="getDisplaySenderProfileAccentId(item.messages[0])"
                                            :deletedAccount="getDisplaySenderDeleted(item.messages[0])" />
                                    </button>
                                </div>
                                <div class="flex min-w-0 max-w-[70%] flex-col"
                                    :class="isSelfAlbum(item) ? 'items-end' : 'items-start'">
                                    <div class="w-min max-w-full overflow-hidden shadow-sm"
                                        :class="isSelfAlbum(item) ? 'text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'"
                                        :style="getInlineKeyboard(item.messages[0]) ? { ...albumStyle(item), width: '100%' } : albumStyle(item)">
                                        <p v-if="showSenderDisplayName(item.messages[0])"
                                            class="msg-sender-name text-xs font-semibold px-2 pt-2 pb-0.5 flex items-center gap-1.5"
                                            :style="senderNameColor(item.messages[0])">
                                            <button type="button"
                                                :class="['min-w-0 flex-1 truncate text-left', canOpenSenderProfile(item.messages[0]) ? 'cursor-pointer' : 'cursor-default']"
                                                @click.stop="openSenderProfile(item.messages[0])">
                                                <GlobalEmojiText :text="getDisplaySenderName(item.messages[0])" />
                                            </button>
                                            <span v-if="getMessageLabel(item.messages[0])"
                                                class="shrink-0 font-normal text-[10px] leading-none px-1.5 py-0.5 rounded-full select-none"
                                                :class="getMessageLabelClass(item.messages[0])">{{
                                                    getMessageLabel(item.messages[0]) }}</span>
                                            <span v-if="getViaBotText(item.messages[0])"
                                                class="shrink-0 font-normal text-[10px] leading-none text-gray-400 dark:text-gray-500 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{
                                                    getViaBotText(item.messages[0]) }}</span>
                                        </p>
                                        <ForwardBanner
                                            v-if="item.messages[0].forward_info && !isLinkedChannelMessage(item.messages[0])"
                                            :name="getForwardName(item.messages[0].forward_info)"
                                            :original-name="getForwardOriginalName(item.messages[0].forward_info)"
                                            :photo="getForwardPhoto(item.messages[0].forward_info)"
                                            :accent-id="getForwardAccentId(item.messages[0].forward_info)"
                                            :navigable="canNavigateForward(item.messages[0].forward_info)"
                                            :self="isSelfAlbum(item)" :text-color="forwardTextColor(item.messages[0])"
                                            media-inline
                                            @open-source="openForwardSource(item.messages[0].forward_info)" />
                                        <MessageAlbum :messages="item.messages" :isSelf="isOutgoingAlbum(item)"
                                            :chatId="chatId" :topicId="topicId"
                                            :isRead="isMessageRead(item.messages[item.messages.length - 1])"
                                            :authorSignature="getDisplayAuthorSignature(item.messages[0])"
                                            @message-context-menu="onAlbumMessageContextMenu">
                                            <!-- 相册有 caption 时：回应放在 caption 与时间之间（气泡内 named slot） -->
                                            <template
                                                v-if="hasReactions(item.messages[0]) && hasMediaCaption(item.messages[0])"
                                                #reactions>
                                                <ReactionsBar class="pl-2" :msg="item.messages[0]"
                                                    :isSelf="isSelfAlbum(item)"
                                                    @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.messages[0], type)" />
                                            </template>
                                        </MessageAlbum>
                                        <!-- 相册无 caption 时：回应放在气泡外面 -->
                                        <ReactionsBar
                                            v-if="hasReactions(item.messages[0]) && !hasMediaCaption(item.messages[0])"
                                            :msg="item.messages[0]" :isSelf="isSelfAlbum(item)"
                                            @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.messages[0], type)" />
                                    </div>
                                    <InlineKeyboard v-if="getInlineKeyboard(item.messages[0])" class="mt-1 w-full"
                                        :ref="registerKeyboardRef(item.messages[0].id)"
                                        :rows="getInlineKeyboard(item.messages[0])!.rows" :chat-id="chatId"
                                        :message-id="item.messages[0].id" />
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
                            <div v-if="isServiceMessage(item.msg)" class="relative flex justify-center my-0.5">
                                <div v-if="selectionMode"
                                    class="absolute left-1 top-1 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center pointer-events-none select-none"
                                    :class="isMsgSelected(item.msg.id) ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'">
                                    <CheckIcon v-if="isMsgSelected(item.msg.id)" class="w-3.5 h-3.5 text-white" />
                                </div>
                                <MessageContent :content="item.msg.content" :date="item.msg.date"
                                    :senderName="getDisplaySenderName(item.msg)"
                                    :senderUserId="senderUserIdOf(item.msg)" :messageList="messages"
                                    @jumpToMessage="handleReplyJumpToMessage" />
                            </div>
                            <div v-else class="flex" :class="[
                                isSelf(item.msg) ? 'justify-end' : 'justify-start',
                                item.isLastInGroup ? 'mb-2' : 'mb-0.5'
                            ]">
                                <div v-if="selectionMode"
                                    class="self-center shrink-0 mr-1 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center pointer-events-none select-none"
                                    :class="isMsgSelected(item.msg.id) ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'">
                                    <CheckIcon v-if="isMsgSelected(item.msg.id)" class="w-3.5 h-3.5 text-white" />
                                </div>
                                <div v-if="shouldReserveAvatarColumn(item.msg)" class="w-9 shrink-0 mr-2 self-end"
                                    :class="{ 'invisible': !item.showAvatar }">
                                    <button type="button"
                                        class="block w-9 h-9 rounded-full overflow-hidden focus:outline-none"
                                        @click.stop="openSenderProfile(item.msg)"
                                        :disabled="!canOpenSenderProfile(item.msg)">
                                        <Avatar :photo="getDisplaySenderPhoto(item.msg)"
                                            :title="getDisplaySenderName(item.msg)"
                                            :accentColorId="getDisplaySenderProfileAccentId(item.msg)"
                                            :deletedAccount="getDisplaySenderDeleted(item.msg)" />
                                    </button>
                                </div>
                                <div class="flex min-w-0 max-w-[70%] flex-col"
                                    :class="isSelf(item.msg) ? 'items-end' : 'items-start'">
                                    <div :data-bubble-msg-id="item.msg.id" :class="[
                                        isMediaMessage(item.msg)
                                            ? 'w-fit max-w-full min-w-0 overflow-hidden shadow-sm'
                                            : isStandaloneMessage(item.msg)
                                                ? 'relative max-w-full'
                                                : 'px-2 py-1.5 shadow-sm max-w-full min-w-30',
                                        !isStandaloneMessage(item.msg) && isSelf(item.msg)
                                            ? 'text-gray-900'
                                            : !isStandaloneMessage(item.msg)
                                                ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                                                : ''
                                    ]"
                                        :style="getInlineKeyboard(item.msg) ? { ...bubbleStyle(item), width: '100%' } : bubbleStyle(item)">
                                        <p v-if="showSenderDisplayName(item.msg) && item.isFirstInGroup"
                                            class="msg-sender-name text-xs font-semibold flex items-center gap-1.5"
                                            :style="senderNameColor(item.msg)">
                                            <button type="button"
                                                :class="['min-w-0 flex-1 truncate text-left', canOpenSenderProfile(item.msg) ? 'cursor-pointer' : 'cursor-default']"
                                                @click.stop="openSenderProfile(item.msg)">
                                                <GlobalEmojiText :text="getDisplaySenderName(item.msg)" />
                                            </button>
                                            <span v-if="getMessageLabel(item.msg)"
                                                class="shrink-0 font-normal text-[10px] leading-none px-1.5 py-0.5 rounded-full select-none"
                                                :class="getMessageLabelClass(item.msg)">{{
                                                    getMessageLabel(item.msg) }}</span>
                                            <span v-if="getViaBotText(item.msg)"
                                                class="shrink-0 font-normal text-[10px] leading-none text-gray-400 dark:text-gray-500 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{
                                                    getViaBotText(item.msg) }}</span>
                                        </p>
                                        <ForwardBanner
                                            v-if="item.msg.forward_info && !isMediaMessage(item.msg) && !isLinkedChannelMessage(item.msg)"
                                            :name="getForwardName(item.msg.forward_info)"
                                            :original-name="getForwardOriginalName(item.msg.forward_info)"
                                            :photo="getForwardPhoto(item.msg.forward_info)"
                                            :accent-id="getForwardAccentId(item.msg.forward_info)"
                                            :navigable="canNavigateForward(item.msg.forward_info)"
                                            :self="isSelf(item.msg)" :text-color="forwardTextColor(item.msg)"
                                            @open-source="openForwardSource(item.msg.forward_info)" />
                                        <MessageContent :content="item.msg.content" :isSelf="isOutgoingMsg(item.msg)"
                                            :date="item.msg.date" :forwardInfo="getDisplayForwardInfo(item.msg)"
                                            :forwardName="getDisplayForwardInfo(item.msg) ? getForwardName(getDisplayForwardInfo(item.msg)!) : undefined"
                                            :forwardNavigable="getDisplayForwardInfo(item.msg) ? canNavigateForward(getDisplayForwardInfo(item.msg)!) : false"
                                            :forwardPhoto="getDisplayForwardInfo(item.msg) ? getForwardPhoto(getDisplayForwardInfo(item.msg)!) : undefined"
                                            :forwardAccentId="getDisplayForwardInfo(item.msg) ? getForwardAccentId(getDisplayForwardInfo(item.msg)!) : undefined"
                                            :forwardOriginalName="getDisplayForwardInfo(item.msg) ? getForwardOriginalName(getDisplayForwardInfo(item.msg)!) : undefined"
                                            :forwardTextColor="forwardTextColor(item.msg)"
                                            :isFirstInGroup="item.isFirstInGroup" :isLastInGroup="item.isLastInGroup"
                                            :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                            :viewCount="item.msg.interaction_info?.view_count"
                                            :authorSignature="getDisplayAuthorSignature(item.msg)" :chatId="chatId"
                                            :messageId="item.msg.id" :message="item.msg" :topicId="topicId"
                                            :senderName="getDisplaySenderName(item.msg)"
                                            :replyTo="item.msg.reply_to?._ === 'messageReplyToMessage' ? item.msg.reply_to : undefined"
                                            :messageList="messages" :accentColorId="getSenderAccentId(item.msg)"
                                            :inlineTime="isInlineTimeMessage(item.msg)"
                                            :hasReactions="hasReactions(item.msg)" :isSelfReaction="isSelf(item.msg)"
                                            :onToggleReaction="hasReactions(item.msg) ? (type: ReactionType) => toggleReaction(chatId!, item.msg, type) : undefined"
                                            @jumpToMessage="handleReplyJumpToMessage"
                                            @openForwardSource="item.msg.forward_info && openForwardSource(item.msg.forward_info)">
                                            <!-- 纯文本：回应放在文本与时间之间（default slot → MessageTextContent <slot/>） -->
                                            <template
                                                v-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && hasReactions(item.msg)">
                                                <ReactionsBar :msg="item.msg" :isSelf="isSelf(item.msg)"
                                                    @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.msg, type)" />
                                            </template>
                                            <!-- 媒体 caption：回应放在 caption 与时间之间（named slot → MessageMediaContent #reactions） -->
                                            <template
                                                v-if="isMediaMessage(item.msg) && hasMediaCaption(item.msg) && hasReactions(item.msg)"
                                                #reactions>
                                                <ReactionsBar class="pl-2" :msg="item.msg" :isSelf="isSelf(item.msg)"
                                                    @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.msg, type)" />
                                            </template>
                                        </MessageContent>
                                        <!-- 内联翻译：在原消息气泡中显示译文 -->
                                        <InlineTranslation v-if="getInlineTranslation(chatId ?? 0, item.msg.id)"
                                            :chat-id="chatId ?? 0" :message-id="item.msg.id"
                                            :text="getMessageFormattedText(item.msg)" />
                                        <!-- 纯媒体（无 caption）：回应放在气泡外面 -->
                                        <ReactionsBar
                                            v-if="isMediaMessage(item.msg) && !hasMediaCaption(item.msg) && hasReactions(item.msg)"
                                            :msg="item.msg" :isSelf="isSelf(item.msg)"
                                            @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.msg, type)" />
                                        <span
                                            v-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && !isInlineTimeMessage(item.msg) && !isOutgoingMsg(item.msg)"
                                            class="block text-right text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-none">
                                            <MessageStatus :date="item.msg.date" :isOutgoing="false"
                                                :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                                :viewCount="item.msg.interaction_info?.view_count"
                                                :authorSignature="getDisplayAuthorSignature(item.msg)" />
                                        </span>
                                        <span
                                            v-else-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && !isInlineTimeMessage(item.msg) && isOutgoingMsg(item.msg)"
                                            class="block text-right text-[11px] text-gray-700/70 mt-0.5 leading-none">
                                            <MessageStatus :date="item.msg.date" :isOutgoing="true"
                                                :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                                :viewCount="item.msg.interaction_info?.view_count"
                                                :authorSignature="getDisplayAuthorSignature(item.msg)" />
                                        </span>
                                    </div>
                                    <InlineKeyboard v-if="getInlineKeyboard(item.msg)" class="mt-1 w-full"
                                        :ref="registerKeyboardRef(item.msg.id)"
                                        :rows="getInlineKeyboard(item.msg)!.rows" :chat-id="chatId"
                                        :message-id="item.msg.id" />
                                </div>
                            </div>
                        </div>
                    </template>
                </template>

                <div class="shrink-0 h-4"></div>
            </div>
        </div>
        <!-- ===== Header（顶层，磨砂玻璃） ===== -->
        <div class="absolute top-0 left-0 right-0 z-10">
            <ChatDetailHeader :chat="chat" :topic="topic" :showBack="showBackBtn" @back="handleBack"
                @openInfo="handleTopClick" @search="searchActive = true" />
        </div>

        <!-- ===== 消息搜索栏（覆盖 Header） ===== -->
        <SearchBar v-if="searchActive && chatId !== undefined" :chat-id="chatId" :topic-id="topicId" :chat="chat"
            :initial-query="hashtagSearchQuery" @close="searchActive = false" @jump="handleReplyJumpToMessage" />

        <!-- ===== 胶囊回应选择器（右键菜单上方的独立浮动栏） ===== -->
        <Teleport to="body">
            <Transition name="reaction-picker-fade">
                <div v-if="reactionCapsuleVisible && reactionCapsuleData && reactionCapsuleData.reactions.length > 0"
                    ref="reactionCapsuleRef" data-context-menu-ignore
                    class="fixed z-10001 flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50"
                    :style="reactionCapsuleStyle" @mousedown.stop @click.stop>
                    <button v-for="r in reactionCapsuleData.reactions" :key="r.emoji + (r.customEmojiId ?? '')"
                        type="button"
                        class="flex items-center justify-center w-9 h-9 rounded-full text-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-100 select-none shrink-0"
                        :class="{ 'opacity-50 cursor-not-allowed': r.needsPremium && !(userProfile?.is_premium) }"
                        :disabled="r.needsPremium && !(userProfile?.is_premium)"
                        :title="r.needsPremium ? '需要 Premium' : r.type._ === 'reactionTypePaid' ? '付费回应' : r.emoji"
                        @click.stop="onCapsuleReactionClick(r)">
                        <PaidReactionIcon v-if="r.type._ === 'reactionTypePaid'" :size="28" />
                        <span v-else-if="!r.customEmojiId" class="leading-none">{{ r.emoji }}</span>
                        <CustomEmojiInline v-else :emojiId="r.customEmojiId" :size="28" :fallbackText="r.emoji" />
                    </button>
                    <!-- 更多回应按钮 -->
                    <button v-if="reactionCapsuleData.hasMore" type="button"
                        class="flex items-center justify-center w-8 h-8 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-100 select-none shrink-0"
                        @click.stop="onCapsuleMoreClick" title="更多回应">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                </div>
            </Transition>
        </Teleport>

        <!-- ===== 多选操作栏（多选模式时叠在输入框上方） ===== -->
        <Transition name="multi-bar">
            <div v-if="selectionMode"
                class="absolute left-3 right-3 bottom-3 z-20 flex items-center gap-2 px-3 h-13 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50">
                <button type="button" aria-label="退出多选"
                    class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" @click="exitSelectionMode">
                    <XIcon class="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
                    已选 {{ selectedMsgIds.length }} 条
                </span>
                <button type="button" aria-label="转发选中消息" title="转发"
                    class="p-2 rounded-full enabled:hover:bg-gray-100 dark:enabled:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                    :disabled="selectedMsgIds.length === 0" @click="openForwardPicker">
                    <ShareIcon class="w-5 h-5" />
                </button>
                <button type="button" aria-label="删除选中消息" title="删除"
                    class="p-2 rounded-full enabled:hover:bg-red-50 dark:enabled:hover:bg-red-900/30 text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="!canDeleteSelected" @click="onDeleteSelected">
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
            <div class="w-full px-3 pointer-events-auto">
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
                        <button type="button"
                            class="w-20 h-20 mb-3 rounded-full overflow-hidden focus:outline-none cursor-pointer"
                            :disabled="!overlayUserId" @click="openOverlayUserProfile">
                            <Avatar :photo="chat.photo" :title="chat.title" sizeClass="!w-20 !h-20"
                                :accentColorId="getChatProfileAccentColorId(chat)" />
                        </button>
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
                            <GlobalEmojiText :text="overlayChatTitle" />
                        </h2>
                        <p class="text-sm text-gray-500 mt-1">{{ getChatSubtitle() }}</p>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="space-y-2 px-4">
                        <button v-if="overlayUserId" type="button" @click="openOverlayUserProfile"
                            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
                            <UserIcon class="w-5 h-5 text-blue-500" />
                            <span class="text-sm font-medium">查看个人资料</span>
                        </button>
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
        <div v-if="canSend" ref="inputAnchorEl"
            class="absolute bottom-0 left-0 right-0 z-10 dark:from-gray-900/80 dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <!-- 编辑消息横幅 -->
            <Transition name="mi-fade">
                <div v-if="editTargetInfo"
                    class="relative z-10 mx-3 mt-3 px-3 py-2 rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-sm border border-gray-200/50 dark:border-gray-700/50">
                    <div class="flex items-start gap-2">
                        <PencilIcon class="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold text-orange-500">编辑</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ editTargetInfo.text || '（无文本内容）' }}</p>
                        </div>
                        <button type="button" aria-label="取消编辑"
                            class="w-6 h-6 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                            @click="cancelEdit">
                            <XIcon class="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <!-- 媒体预览：不可删除，可更换 -->
                    <div v-if="editHasMedia" class="mt-2 flex items-center gap-2">
                        <div
                            class="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                            <img v-if="editMediaDisplaySrc" :src="editMediaDisplaySrc" alt=""
                                class="w-full h-full object-cover" draggable="false" />
                            <div v-else
                                class="w-full h-full flex items-center justify-center text-[10px] text-gray-500">
                                媒体
                            </div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {{ editMediaReplacement ? editMediaReplacement.name : (editMediaPreviewSrc ? '已附带媒体' : '无媒体预览') }}
                            </p>
                            <p v-if="editMediaReplacement" class="text-[11px] text-orange-500">已选择新媒体，发送时将替换</p>
                        </div>
                        <button type="button"
                            class="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                            @click="pickEditMediaReplacement">
                            更换
                        </button>
                    </div>
                </div>
            </Transition>
            <MessageInput ref="messageInputRef" class="relative z-10" v-model="messageInput" :reply-target="replyTargetInfo"
                :edit-target="editTargetInfo" :edit-entities="editSeedEntitiesForInput" :chat="chat" :users="users" :supergroups="supergroups"
                :basic-groups="basicGroups" :my-id="myId" :member-status="currentMemberStatus" :is-premium="isMePremium"
                :custom-emojis="pendingCustomEmoji" :current-sender-id="chat?.message_sender_id"
                :available-senders="availableSenders" :senders-loading="sendersLoading" @clear-reply="clearReply"
                @clear-edit="cancelEdit" @send="handleSend" @attach="handleAttach" @attach-file="handleAttachFile"
                @attach-music="handleAttachMusic" @attach-poll="handleAttachPoll"
                @attach-checklist="handleAttachChecklist" @attach-contact="handleAttachContact"
                @change-sender="handleChangeSender" @sticker="openStickerPanel" />

            <!-- 表情包面板（emoji/GIF/贴纸 三合一） -->
            <StickerPanel :anchor="inputAnchorEl" @pick-emoji="insertEmojiIntoInput"
                @pick-custom-emoji="insertCustomEmojiIntoInput" @pick-sticker="sendSticker"
                @pick-animation="sendAnimation" />
        </div>

        <!-- ===== 成员操作 ===== -->
        <div v-else-if="showMembershipAction"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-transparent dark:from-gray-900/80 via-transparent dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <div class="relative z-10 flex items-center justify-center p-5">
                <button type="button" :disabled="!canJoinCurrentChat || isJoinPending || joinRequestSent"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-default transition-colors"
                    @click="joinCurrentChat">
                    {{ membershipActionLabel }}
                </button>
            </div>
        </div>

        <!-- ===== 只读 ===== -->
        <div v-else-if="showChannelActions"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-transparent dark:from-gray-900/80 via-transparent dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <div class="relative z-10 flex items-center justify-center gap-3 p-5">
                <button type="button" :disabled="isNotificationTogglePending"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-wait transition-colors"
                    @click="toggleNotifications">
                    {{ notificationsMuted ? '开启通知' : '关闭通知' }}
                </button>
                <button v-if="linkedChatId" type="button" title="打开讨论组" aria-label="打开讨论组"
                    class="w-12 h-12 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg flex items-center justify-center text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 transition-colors"
                    @click="openLinkedChat">
                    <MessageCircleIcon class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- ===== Floating scroll-to-bottom button ===== -->
        <Transition name="fade">
            <button v-if="showScrollButton"
                class="absolute right-4 z-20 w-10 h-10 bg-white dark:bg-gray-700 rounded-full shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                :style="{ bottom: (replyTargetInfo || editTargetInfo) ? '11.5rem' : '7rem' }"
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
            :initial-time="viewerInitialTime" @close="onViewerClose" @jump-to-message="handleViewerJump"
            @forward-message="handleViewerForward" />

        <!-- ===== 删除消息确认弹窗 ===== -->
        <DeleteMessageConfirm />
        <!-- ===== 翻译消息弹窗 ===== -->
        <TranslateMessageModal />
        <!-- ===== 置顶消息确认弹窗 ===== -->
        <PinMessageConfirm />
        <!-- ===== 举报消息确认弹窗 ===== -->
        <ReportMessageConfirm />
        <!-- ===== Reaction 选择器 ===== -->
        <ReactionPicker :visible="reactionPickerVisible" :msg="reactionPickerMsg" :anchorRect="reactionPickerAnchor"
            :isPremium="userProfile?.is_premium ?? false" :fullEmoji="reactionPickerFullEmoji"
            @select="onReactionPickerSelect" @select-emoji="onReactionPickerSelectEmoji"
            @select-custom-emoji="onReactionPickerSelectCustomEmoji" @close="closeReactionPicker" />
    </div>
</template>
<script setup lang="ts">
import MessageInput from './MessageInput.vue';
import StickerPanel from './stickerPanel/StickerPanel.vue';
import { stickerPanelState, openStickerPanel as openStickerPanelOf, closeStickerPanel as closeStickerPanelOf } from './stickerPanel/types';
import Avatar from '../avatar.vue';
import MessageContent from './MessageContent/index.vue';
import MessageStatus from './MessageContent/content/MessageStatus.vue';
import MessageAlbum from './MessageContent/content/MessageAlbum.vue';
import ForwardBanner from './MessageContent/content/ForwardBanner.vue';
import InlineKeyboard from './MessageContent/content/InlineKeyboard.vue';
import InlineTranslation from './MessageContent/content/InlineTranslation.vue';
import ChatDetailHeader from './Header.vue';
import GlobalEmojiText from '../../common/GlobalEmojiText.vue';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import PaidReactionIcon from '../../common/PaidReactionIcon.vue';
import MediaViewer from './MessageContent/MediaViewer.vue';
import DeleteMessageConfirm from '../../contextMenu/DeleteMessageConfirm.vue';
import TranslateMessageModal from '../../contextMenu/TranslateMessageModal.vue';
import PinMessageConfirm from '../../contextMenu/PinMessageConfirm.vue';
import ReportMessageConfirm from '../../contextMenu/ReportMessageConfirm.vue';
import PinnedMessageBar from './PinnedMessageBar.vue';
import SearchBar from './SearchBar.vue';
import ReactionsBar from './ReactionsBar.vue';
import ReactionPicker from './ReactionPicker.vue';

import { tdlibSend, isFileReady } from '../../../utils/tdlib';
import { sendAttachments, sending } from '../../../utils/attachmentSend';
import { useAttachmentStore } from '../../../store/attachment';
import type { AttachmentItem } from '../../../store/attachment';
import { getForwardNavigationTarget } from '../../../utils/forwardedMessages';

import { MessageCircleIcon, ClipboardCopy as ClipboardCopyIcon, XIcon, ShareIcon, TrashIcon, ReplyIcon, PinIcon, LinkIcon, CheckSquareIcon, CopyPlusIcon, CheckIcon, Quote as QuoteIcon, Languages as LanguagesIcon, User as UserIcon, Pencil as PencilIcon, FolderOpenIcon, DownloadIcon, BookmarkIcon, EyeIcon, UserCheckIcon, MessageSquareIcon, AudioLinesIcon, FlagIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { computed, watch, ref, shallowRef, markRaw, onMounted, onUnmounted, nextTick } from 'vue';
import { useUserStore } from '../../../store/user';
import { useAudioPlayerStore } from '../../../store/audioPlayer';
import { clearActiveChatTitleBar } from '../../../store/activeChatTitleBar';
import { storeToRefs } from 'pinia';
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { copyFile } from "@tauri-apps/plugin-fs";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { settings, type ChatWallpaperVisual } from '../../../store/settings';
import { convertFileSrc } from '@tauri-apps/api/core';
import { showCopyJsonInMenus } from '../../../store/debug';
import { useCommandInsert, clearPendingCommand } from '../../../store/commandInsert';
import { useHashtagSearch, clearPendingHashtag } from '../../../store/hashtagSearch';
import { useCustomEmoji } from '../../../store/customEmoji';
import type { ContextMenuItem } from '../../contextMenu/types';
import { getMessagePlainText, getMessageFormattedText } from '../../../utils/messageText';
import { applyTerminalFileToMessages, isTerminalFileUpdate } from '../../../utils/messageFileSnapshot';
import {
    copyMessageText, copyMessageJson, copyMessageLink,
    toggleMessagePinned, pinMessage, getMessageProperties,
    executeDeleteActions,
    canCopyMessage, canGetMessageLink, canPinMessage, canDeleteMessage,
    canReplyMessage, canEditMessage, editTextMessage, editCaptionMessage,
    editMessageMediaContent,
    canSaveMessage, canGetViewers, canGetReadDate, canGetAuthor,
    canGetMessageThread, canRecognizeSpeech, canReportMessage,
    toggleReaction,
} from '../../contextMenu/messageActions';
import { classifyAttachment, buildEditMediaContent } from '../../../utils/attachmentSend';
import { isSavedMessagesChat } from '../../../utils/savedMessages';
import { hasReactions } from '../../../utils/reactionHelpers';
import { confirmDeleteMessage } from '../../../store/deleteMessage';
import type { DeleteMessageRequest } from '../../../store/deleteMessage';
import { confirmPinMessage } from '../../../store/pinMessage';
import { confirmReportMessage } from '../../../store/reportMessage';
import {
    showTranslateDialog,
    translateInlineMessage,
    getInlineTranslation,
} from '../../../store/translate';
import { openContextMenu, visible as contextMenuVisible, reactionRow as contextMenuReactionRow, closeContextMenu as closeContextMenuStore } from '../../../store/contextMenu';
import type { ContextMenuReactionItem, ContextMenuReactionRow } from '../../contextMenu/types';
import { DEFAULT_TRANSLATE_TARGET } from '../../../utils/translateLanguages';

import type { chat, message, user, chatPhotoInfo, profilePhoto, Update, supergroup, basicGroup, messageForwardInfo, replyMarkupInlineKeyboard, ChatMemberStatus, ChatMember, forumTopic, inputTextQuote, sendMessage, $Function, textEntity, textEntity$Input, file as TdFile, ReactionType } from 'tdlib-types';
import { getViewerState, closeMediaViewer, isMediaViewerActive, openMediaViewer } from '../../../store/mediaViewer';

import { getSenderAccentColorId, getSenderProfileAccentColorId, getChatProfileAccentColorId, isDeletedChat, DELETED_ACCOUNT_LABEL } from '../../../utils/senderInfo';
import { useColors } from '../../../store/colors';
import { isMediaMessage, isStandaloneMessage, isServiceMessage, isInlineTimeMessage } from './composables/messageType';
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
    getForwardPhoto as computeForwardPhoto,
    getForwardProfileAccentId as computeForwardProfileAccentId,
    getForwardAuthorSignature as computeForwardAuthorSignature,
    isSavedForwardedMessage as computeIsSavedForwardedMessage,
    senderNameColor as computeSenderNameColor,
    showSenderDisplayName as computeShowSenderDisplayName,
    getViaBotText as computeViaBotText,
} from './composables/senderDisplay';
import type { SenderDisplayDeps } from './composables/senderDisplay';
import {
    canSend as canSendChat, getCurrentMemberStatus,
    showMembershipAction as showMembershipActionOf, canJoinCurrentChat as canJoinCurrentChatOf,
    isChannelWithSenderDisplay as isChannelWithSenderDisplayOf, showSenderName as showSenderNameOf,
    showAvatarColumn as showAvatarColumnOf, showChannelActions as showChannelActionsOf,
    canSendEmojiRights as canSendEmojiRightsOf, canSendStickerGifRights as canSendStickerGifRightsOf,
} from './composables/permissions';
import {
    isSelfMessage, isOutgoingMessage as isOutgoingMessageOf,
    isMessageRead as isMessageReadOf,
    isSelfAlbum as isSelfAlbumOf,
    isLinkedChannelMessage as isLinkedChannelMessageOf,
    getMessageLabel as getMessageLabelOf, getMessageLabelClass as getMessageLabelClassOf,
    getDisplayForwardInfo as getDisplayForwardInfoOf,
    getInlineKeyboard as getInlineKeyboardOf,
    getDisplayAuthorSignature as getDisplayAuthorSignatureOf,
} from './composables/messageMeta';
import type { RoleContext, SelfDeps } from './composables/messageMeta';

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

// ==================== 上次浏览位置缓存（模块级） ====================
// 每个聊天的"上次浏览位置"（顶部可见消息 id），按 chatId(+topicId) 缓存。
// 放在模块级，故跨聊天切换、甚至关闭/重开聊天面板（组件卸载重挂）后依然保留，
// 用于重新打开聊天时恢复到上次浏览的位置，而不是每次都跳到底部。
const lastBrowsePositionCache = new Map<string, number>();
const lastBrowseCacheKey = (id: number, tid?: number | null) =>
    tid ? `${id}:${tid}` : `${id}`;
/** 删除某聊天的缓存位置（重置/跳转后位置失焦时使用） */
const clearLastBrowsePosition = (id: number, tid?: number | null) => {
    lastBrowsePositionCache.delete(lastBrowseCacheKey(id, tid));
};

// ==================== 草稿缓存（模块级） ====================
// 每个聊天的输入框草稿（文本 + 自定义 emoji 队列），按 chatId(+topicId) 缓存。
// 切换聊天时用「旧 chatId」保存当前草稿，进入新聊天时恢复；组件卸载时也会保存。
// 同时同步到 TDLib setChatDraftMessage，使会话列表草稿 / 跨端草稿一致。
interface DraftEntry {
    text: string;
    customEmojis: { id: string; alt: string }[];
}
const draftCache = new Map<string, DraftEntry>();
const DRAFT_CACHE_MAX = 50;

function draftCacheKey(id: number, tid?: number | null) {
    return tid ? `${id}:${tid}` : `${id}`;
}

/** TDLib setChatDraftMessage 的防抖定时器 */
let tdlibDraftTimer: number | null = null;
/** 本地输入变更后写入草稿的防抖定时器 */
let localDraftTimer: number | null = null;
/** 切换对话加载期间为 true：抑制自动存草稿，避免清空输入误删新聊天草稿 */
let suppressDraftAutosave = false;
/** 待提交到 TDLib 的草稿（防抖窗口内切换聊天时，先冲刷旧聊天草稿，避免被新聊天覆盖丢失） */
let pendingTdlibDraft: { cid: number; tid?: number | null; text?: string } | null = null;

function draftTopicInput(tid?: number | null) {
    return tid
        ? ({ _: 'messageTopicForum', forum_topic_id: tid } as const)
        : undefined;
}

/** 立即把 pendingTdlibDraft 提交到 TDLib；无待提交则不操作 */
function flushTdlibDraftNow() {
    if (!pendingTdlibDraft) return;
    const { cid, tid, text } = pendingTdlibDraft;
    pendingTdlibDraft = null;
    const body = text?.trim()
        ? {
            _: 'draftMessage' as const,
            date: Math.floor(Date.now() / 1000),
            content: {
                _: 'draftMessageContentText' as const,
                text: { _: 'formattedText' as const, text: text!, entities: [] },
            },
        }
        : null;
    void tdlibSend({
        _: 'setChatDraftMessage',
        chat_id: cid,
        topic_id: draftTopicInput(tid),
        draft_message: body,
    } as any).catch((e) => {
        // 草稿同步失败不影响本地输入，仅记录
        console.warn('setChatDraftMessage failed:', e);
    });
}

/**
 * 把草稿同步到 TDLib（setChatDraftMessage）。
 * text 为空时传 null，等价于清除服务端草稿。
 * 防抖执行，避免输入过程中高频调用；若上一次待提交草稿属于其它聊天，先立即冲刷。
 */
function syncTdlibDraft(cid: number, tid?: number | null, text?: string) {
    if (tdlibDraftTimer !== null) {
        window.clearTimeout(tdlibDraftTimer);
        tdlibDraftTimer = null;
    }
    // 跨聊天切换：立刻提交旧聊天草稿，防止被下面的新 pending 覆盖
    if (pendingTdlibDraft && pendingTdlibDraft.cid !== cid) {
        flushTdlibDraftNow();
    }
    pendingTdlibDraft = { cid, tid, text };
    tdlibDraftTimer = window.setTimeout(() => {
        tdlibDraftTimer = null;
        flushTdlibDraftNow();
    }, 400);
}

/**
 * 保存输入框草稿到本地缓存 + TDLib。
 * @param targetChatId 目标聊天（切换时必须传「旧」chatId）；缺省用当前 chatId
 * @param targetTopicId 目标话题（配合 targetChatId）；缺省用当前 topicId
 */
function saveDraft(targetChatId?: number, targetTopicId?: number | null) {
    const cid = targetChatId ?? chatId.value;
    if (cid === undefined) return;
    const tid = targetTopicId !== undefined ? targetTopicId : topicId.value;
    const text = messageInput.value;
    const emojis = pendingCustomEmoji.value;
    const key = draftCacheKey(cid, tid);

    if (!text && emojis.length === 0) {
        draftCache.delete(key);
        syncTdlibDraft(cid, tid, '');
        return;
    }
    draftCache.set(key, { text, customEmojis: [...emojis] });
    while (draftCache.size > DRAFT_CACHE_MAX) {
        const oldest = draftCache.keys().next().value;
        if (oldest === undefined) break;
        draftCache.delete(oldest);
    }
    syncTdlibDraft(cid, tid, text);
}

/** 仅写入本地缓存（恢复远端草稿时用，避免回写 TDLib 造成无意义更新） */
function putLocalDraft(cid: number, tid: number | null | undefined, entry: DraftEntry) {
    draftCache.set(draftCacheKey(cid, tid), entry);
}

/**
 * 从缓存 / TDLib 草稿恢复到输入框。
 * 本地缓存优先；否则尝试从 chat.draft_message（TDLib）取文本草稿。
 */
function restoreDraft(
    chatIdNum: number,
    tid?: number | null,
    remoteDraft?: { content?: { _?: string; text?: { text?: string } } } | null,
) {
    const entry = draftCache.get(draftCacheKey(chatIdNum, tid));
    if (entry) {
        messageInput.value = entry.text;
        pendingCustomEmoji.value = [...entry.customEmojis];
        return;
    }
    const remoteText = remoteDraft?.content?._ === 'draftMessageContentText'
        ? (remoteDraft.content.text?.text ?? '')
        : '';
    if (remoteText) {
        messageInput.value = remoteText;
        pendingCustomEmoji.value = [];
        putLocalDraft(chatIdNum, tid, { text: remoteText, customEmojis: [] });
        return;
    }
    messageInput.value = '';
    pendingCustomEmoji.value = [];
}



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
/** 消息搜索栏是否激活（覆盖 Header） */
const searchActive = ref(false);
/** 打开搜索栏时预填的搜索词（如点击 #标签 触发的搜索） */
const hashtagSearchQuery = ref('');

function openOverlay() {
    showOverlay.value = true;
}

/**
 * 点击聊天顶部头像/标题：
 * - 私聊 / 密聊 → 直接跳转到对应用户的个人资料页
 * - 群组 / 频道 → 直接跳转到资料页（复用 UserProfile，以「频道/群组」模式展示，原叠层跳转页已移除）
 */
function handleTopClick() {
    if (overlayUserId.value !== undefined) {
        openOverlayUserProfile();
    } else if (chat.value) {
        const t = chat.value.type;
        // 话题/普通群组/频道（超级群组或基本群组）均复用资料页（chat-profile）展示
        if (t?._ === 'chatTypeSupergroup' || t?._ === 'chatTypeBasicGroup') {
            router.push({
                name: 'chat-profile',
                params: { id: String(chat.value.id) },
            });
        } else {
            openOverlay();
        }
    }
}

/** 叠层面板中当前对话对应的用户 id（仅私聊/密聊场景有值；用于打开发送者或个人资料） */
const overlayUserId = computed<number | undefined>(() => {
    const t = chat.value?.type;
    if (t?._ === 'chatTypePrivate' || t?._ === 'chatTypeSecret') {
        return t.user_id;
    }
    return undefined;
});

/** 打开叠层面板中用户的个人资料页 */
function openOverlayUserProfile() {
    const uid = overlayUserId.value;
    if (!uid) return;
    closeOverlay();
    router.push({ name: 'user-profile', params: { id: String(uid) } });
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
const hasChatSpecificBackground = computed(() => {
    const bg = chat.value?.background?.background;
    if (!bg) return false;
    if (bg.type._ === 'backgroundTypeFill') return true;
    return !!bg.document?.thumbnail?.file.local.path;
});
const chatBackgroundStyle = computed(() => {
    const visual = chatBackgroundVisual.value;
    return { backgroundColor: visual?.color || '#f5f5f5' };
});
const chatBackgroundVisual = computed<ChatWallpaperVisual | null>(() => {
    const background = chat.value?.background?.background;
    if (!background) return settings.chatWallpaper;
    if (background.type._ === 'backgroundTypeFill' && background.type.fill._ === 'backgroundFillSolid') {
        return { kind: 'color', color: `#${(background.type.fill.color & 0xffffff).toString(16).padStart(6, '0')}` };
    }
    if (background.document?.thumbnail?.file.local.path) {
        return { kind: 'image', path: background.document.thumbnail.file.local.path };
    }
    return settings.chatWallpaper;
});
const chatWallpaperLayerStyle = computed(() => {
    const visual = chatBackgroundVisual.value;
    const style: Record<string, string> = {
        backgroundColor: visual?.color || '#f5f5f5',
        filter: `blur(${settings.chatWallpaperBlur}px)`,
        transform: settings.chatWallpaperBlur > 0 ? 'scale(1.05)' : 'none',
    };
    if (visual?.kind === 'image' && visual.path) {
        style.backgroundImage = `url("${convertFileSrc(visual.path)}")`;
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
    }
    return style;
});
/** 叠层对话信息面板显示的对话标题（已注销账户对话显示「已注销账户」） */
const overlayChatTitle = computed(() => {
    if (!chat.value) return '';
    return isDeletedChat(chat.value) ? DELETED_ACCOUNT_LABEL : chat.value.title || '';
});
/** 当前话题信息（话题模式时存在） */
const topic = ref<forumTopic | undefined>(undefined);
const messageInput = ref('');
/** 面板插入的自定义 emoji 队列（按插入顺序；发送时据此生成实体） */
const pendingCustomEmoji = ref<{ id: string; alt: string }[]>([]);

// 输入过程中防抖写入草稿（本地 + TDLib）；编辑模式不写草稿
watch([messageInput, pendingCustomEmoji], () => {
    if (suppressDraftAutosave) return;
    if (editingMsg.value) return;
    if (chatId.value === undefined) return;
    if (localDraftTimer !== null) window.clearTimeout(localDraftTimer);
    localDraftTimer = window.setTimeout(() => {
        localDraftTimer = null;
        if (suppressDraftAutosave || editingMsg.value) return;
        saveDraft();
    }, 500);
});
/**
 * 消息列表使用 shallowRef + markRaw：
 * TDLib message 是深层嵌套大对象，若用 ref 做深度响应式，任意字段变更
 * （下载终态回写、编辑、回应）都会触发整表深遍历，聊天中随机白屏/卡死的主因之一。
 * 所有变更必须通过 replaceMessages/patchMessage 等入口整体替换数组并 bump 版本号。
 */
const messages = shallowRef<message[]>([]);
/** 内存中同时保留的消息上限，超出后从远离视口的一端裁剪，避免 DOM/内存无限增长 */
const MAX_MESSAGE_WINDOW = 180;
const messagesContainer = ref<HTMLElement | null>(null);

// ===== 表情包面板（StickerPanel emoji/GIF/贴纸） =====
/** 面板锚点（输入区容器元素），用于定位悬浮面板 */
const inputAnchorEl = ref<HTMLElement | null>(null);

/** 打开/切换面板（MessageInput @sticker 触发）：
 *  已打开时再次点击则关闭（toggle）；重新打开时恢复上次所在 Tab（记忆）。 */
function openStickerPanel() {
    if (stickerPanelState.value.open) {
        closeStickerPanelOf();
    } else {
        // 记住上次所在的 Tab：恢复它，而非总是切到 'sticker'
        openStickerPanelOf(stickerPanelState.value.tab);
    }
}

/** 插入普通 emoji 到输入框文本 */
function insertEmojiIntoInput(emoji: string) {
    messageInput.value += emoji;
}

/**
 * 面板点击自定义 emoji：在输入框插入其【代表 emoji 文本】作占位，
 * 并记录 id → 发送时据此生成 textEntityTypeCustomEmoji 实体（实体适配）。
 */
function insertCustomEmojiIntoInput(id: string) {
    const alt = useCustomEmoji(id).sticker?.emoji || '😀';
    messageInput.value += alt;
    pendingCustomEmoji.value.push({ id, alt });
}

/** 构建自定义 emoji 实体：按插入顺序在文本中定位占位 emoji 并生成实体 */
function buildCustomEmojiEntities(text: string): textEntity$Input[] {
    const entities: textEntity$Input[] = [];
    let searchFrom = 0;
    for (const ce of pendingCustomEmoji.value) {
        const idx = text.indexOf(ce.alt, searchFrom);
        if (idx === -1) continue;
        entities.push({
            _: 'textEntity',
            offset: idx,
            length: ce.alt.length,
            type: { _: 'textEntityTypeCustomEmoji', custom_emoji_id: ce.id },
        });
        searchFrom = idx + ce.alt.length;
    }
    return entities;
}

// ===== 回复模式 =====
/** 当前回复目标消息（null 表示无回复） */
const replyTargetMsg = ref<message | null>(null);
/** 引用回复时选中的原文片段（null 表示普通回复，不带 quote） */
const replyQuoteText = ref<string | null>(null);

/** 回复目标摘要（发送者名 + 文本 + 引用片段），供 MessageInput 显示 */
const replyTargetInfo = computed<{ title: string; text: string; quote?: string } | null>(() => {
    const m = replyTargetMsg.value;
    if (!m) return null;
    const title = isSelf(m) ? '你' : getDisplaySenderName(m) || '成员';
    const text = getMessagePlainText(m);
    return { title, text, quote: replyQuoteText.value ?? undefined };
});

/** 设置普通回复目标；传入消息 id 对应消息或 null 以清除 */
function startReply(msg: message | null) {
    replyTargetMsg.value = msg;
    replyQuoteText.value = null;
}

/**
 * 引用回复：以选中的文本片段回复该消息。
 * @param msg 被回复的目标消息
 * @param quoteText 选中的原文片段（作为引用）
 */
function startQuoteReply(msg: message, quoteText: string) {
    replyTargetMsg.value = msg;
    replyQuoteText.value = quoteText;
}

/**
 * 获取当前文档选中文本中属于「该消息气泡」的片段。
 * 仅当用户已用鼠标拖动选中了该消息内容里的一段文本时返回该片段（去除首尾空白），
 * 否则返回 null（用于在消息右键菜单中动态显示「引用回复」）。
 */
function getSelectedQuoteForMessage(msg: message): string | null {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    // 找到选区所在的最近元素节点
    let container = range.commonAncestorContainer as Node;
    if (container.nodeType !== Node.ELEMENT_NODE) {
        container = container.parentElement as Node;
    }
    const el = container as HTMLElement | null;
    const bubble = el?.closest(`[data-bubble-msg-id="${msg.id}"]`);
    if (!bubble) return null;
    const text = sel.toString();
    return text.trim() ? text.trim() : null;
}

/** 清除回复/引用状态 */
function clearReply() {
    replyTargetMsg.value = null;
    replyQuoteText.value = null;
}

// ===== 编辑模式 =====
/** 当前正在编辑的消息（null 表示非编辑状态） */
const editingMsg = ref<message | null>(null);
/** 编辑时载入输入框的原始实体（加粗/斜体/链接/自定义 emoji 等） */
const editSeedEntities = ref<textEntity$Input[] | null>(null);
/** 媒体消息编辑：原媒体预览（不可删除） */
const editMediaPreviewSrc = ref<string | null>(null);
/** 媒体消息编辑：用户选择的替换媒体（null 表示未更换） */
const editMediaReplacement = ref<AttachmentItem | null>(null);
/** MessageInput 实例（用于写入编辑实体） */
const messageInputRef = ref<InstanceType<typeof MessageInput> | null>(null);
/** 传给 MessageInput 的编辑实体（补齐必填字段） */
const editSeedEntitiesForInput = computed<textEntity[] | null>(() =>
    editSeedEntities.value ? normalizeEditEntities(editSeedEntities.value) : null
);

/** 编辑目标摘要，供 MessageInput 显示编辑横幅；统一使用「编辑」文案 */
const editTargetInfo = computed<{ text: string; label: string } | null>(() => {
    const m = editingMsg.value;
    if (!m) return null;
    const ft = getMessageFormattedText(m);
    return {
        text: ft?.text ?? getMessagePlainText(m),
        label: '编辑',
    };
});

/** 从消息内容提取媒体预览 URL（本地文件 / minithumbnail base64） */
function extractEditMediaPreview(msg: message): string | null {
    const c = msg.content;
    try {
        if (c._ === 'messagePhoto') {
            const f = c.photo.sizes?.[c.photo.sizes.length - 1]?.photo;
            if (f?.local?.is_downloading_completed && f.local.path) {
                return convertFileSrc(f.local.path);
            }
            if (c.photo.minithumbnail?.data) {
                return `data:image/jpeg;base64,${c.photo.minithumbnail.data}`;
            }
            return null;
        }
        if (c._ === 'messageVideo') {
            if (c.video.thumbnail?.file?.local?.is_downloading_completed && c.video.thumbnail.file.local.path) {
                return convertFileSrc(c.video.thumbnail.file.local.path);
            }
            if (c.video.minithumbnail?.data) {
                return `data:image/jpeg;base64,${c.video.minithumbnail.data}`;
            }
            return null;
        }
        if (c._ === 'messageAnimation') {
            if (c.animation.thumbnail?.file?.local?.is_downloading_completed && c.animation.thumbnail.file.local.path) {
                return convertFileSrc(c.animation.thumbnail.file.local.path);
            }
            if (c.animation.minithumbnail?.data) {
                return `data:image/jpeg;base64,${c.animation.minithumbnail.data}`;
            }
            return null;
        }
        if (c._ === 'messageDocument') {
            if (c.document.thumbnail?.file?.local?.is_downloading_completed && c.document.thumbnail.file.local.path) {
                return convertFileSrc(c.document.thumbnail.file.local.path);
            }
            if (c.document.minithumbnail?.data) {
                return `data:image/jpeg;base64,${c.document.minithumbnail.data}`;
            }
            return null;
        }
        if (c._ === 'messageAudio') {
            if (c.audio.album_cover_thumbnail?.file?.local?.is_downloading_completed
                && c.audio.album_cover_thumbnail.file.local.path) {
                return convertFileSrc(c.audio.album_cover_thumbnail.file.local.path);
            }
            return null;
        }
    } catch {
        // 预览失败不阻塞编辑
    }
    return null;
}

/** 当前编辑消息是否有可替换的媒体 */
const editHasMedia = computed(() => {
    const m = editingMsg.value;
    if (!m) return false;
    const t = m.content._;
    return t === 'messagePhoto' || t === 'messageVideo' || t === 'messageAnimation'
        || t === 'messageDocument' || t === 'messageAudio';
});

/** 编辑区媒体预览：更换后显示新图，否则显示原图 */
const editMediaDisplaySrc = computed(() =>
    editMediaReplacement.value
        ? convertFileSrc(editMediaReplacement.value.path)
        : editMediaPreviewSrc.value
);

/** 当前聊天是否为「收藏」（Saved Messages）——收藏内不允许进入编辑 */
const isInSavedMessages = computed(() =>
    !!chat.value && !!myId.value && isSavedMessagesChat(chat.value, myId.value)
);

/**
 * 进入编辑模式：清空回复状态，将消息文本与原始实体填入输入框。
 * 可编辑性以 TDLib 为准：收藏夹消息一律禁止；其余看 canEditMessage
 * （普通消息 MessageProperties.can_be_edited / 快捷回复 quickReplyMessage.can_be_edited）。
 */
async function startEdit(msg: message) {
    if (chatId.value === undefined) return;
    if (isInSavedMessages.value) return;
    if (!canEditMessage(msg, chatId.value)) return;

    // 进入编辑前先把当前输入存为草稿，取消编辑时可恢复
    saveDraft();

    clearReply();
    // 编辑不走附件托盘；清空附件避免误发。媒体替换单独用 editMediaReplacement。
    void useAttachmentStore().clearWithCleanup();

    editingMsg.value = msg;
    editMediaReplacement.value = null;
    editMediaPreviewSrc.value = extractEditMediaPreview(msg);

    const ft = getMessageFormattedText(msg);
    const text = ft?.text ?? getMessagePlainText(msg);
    const entities = (ft?.entities ?? []) as textEntity$Input[];
    editSeedEntities.value = entities;
    messageInput.value = text;
    pendingCustomEmoji.value = [];

    // modelValue 同步到 MessageInput 后再写入实体，避免被整体替换清空逻辑覆盖
    await nextTick();
    messageInputRef.value?.setEntities(normalizeEditEntities(entities));
}

/** textEntity$Input → textEntity：补齐必填 offset/length */
function normalizeEditEntities(ents: textEntity$Input[]): textEntity[] {
    return ents.map((e) => ({
        _: 'textEntity' as const,
        offset: e.offset ?? 0,
        length: e.length ?? 0,
        type: e.type as textEntity['type'],
    }));
}

/** 退出编辑模式：恢复进入编辑前保存的草稿（若有） */
function cancelEdit() {
    editingMsg.value = null;
    editSeedEntities.value = null;
    editMediaPreviewSrc.value = null;
    editMediaReplacement.value = null;
    if (chatId.value !== undefined) {
        restoreDraft(chatId.value, topicId.value, chat.value?.draft_message);
    } else {
        messageInput.value = '';
        pendingCustomEmoji.value = [];
    }
}

/** 更换编辑中的媒体：打开文件选择器，分类后写入 editMediaReplacement */
async function pickEditMediaReplacement() {
    if (!editingMsg.value || !editHasMedia.value) return;
    try {
        const selected = await openDialog({
            multiple: false,
            title: '选择新的媒体文件',
            filters: [{
                name: '媒体文件',
                extensions: [
                    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif',
                    'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpeg', 'mpg', 'wmv', 'flv', '3gp', 'ogv',
                    'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wav', 'wma', 'amr',
                    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', '7z', 'txt',
                ],
            }],
        });
        if (!selected) return;
        const path = Array.isArray(selected) ? selected[0] : selected;
        if (!path) return;

        const name = path.split(/[\\/]/).pop() || path;
        const { stat } = await import('@tauri-apps/plugin-fs');
        let size = 0;
        try { size = (await stat(path)).size; } catch { size = 0; }

        const result = await classifyAttachment({
            path, name, size,
            album: false,
            isPremium: isMePremium.value,
        });
        if (result.status === 'rejected') {
            MessagePlugin.warning(result.reason);
            return;
        }
        editMediaReplacement.value = {
            id: `edit-media-${Date.now()}`,
            path, name, size,
            kind: result.kind,
            width: result.width,
            height: result.height,
            duration: result.duration,
            probeFailed: result.probeFailed,
        };
        editMediaPreviewSrc.value = convertFileSrc(path);
    } catch (e) {
        console.error('pick edit media failed:', e);
        MessagePlugin.error({ content: '选择媒体失败', placement: 'center' });
    }
}

/**
 * 构建发送用的 quote 对象（inputTextQuote），并计算其在原消息文本中的位置（UTF-16）。
 * 无选中片段时返回 null。
 */
function buildReplyQuote(): inputTextQuote | null {
    const m = replyTargetMsg.value;
    const quoteText = replyQuoteText.value;
    if (!m || !quoteText) return null;
    const plain = getMessagePlainText(m);
    // 计算选中片段在原消息纯文本中的起始偏移（UTF-16 code units）
    const pos = plain.indexOf(quoteText);
    return {
        _: 'inputTextQuote',
        text: { _: 'formattedText', text: quoteText, entities: [] },
        position: pos >= 0 ? pos : 0,
    };
}

// ===== 多选模式 =====
/** 是否处于多选模式 */
const selectionMode = ref(false);
/** 多选中选中的消息 id 集合（按加入顺序用数组保持稳定） */
const selectedMsgIds = ref<number[]>([]);
/** 选中消息中「可删除」的 id 集合（异步按 messageProperties 刷新） */
const deletableSelectedIds = ref<Set<number>>(new Set());
/** 权限刷新请求令牌：避免快速切换选择时旧结果覆盖新结果 */
let selectionPermToken = 0;

/** 切换到多选模式 */
function enterSelectionMode(msg: message) {
    selectionMode.value = true;
    if (!selectedMsgIds.value.includes(msg.id)) {
        selectedMsgIds.value.push(msg.id);
    }
    void refreshSelectionPermissions();
}

/** 退出多选模式 */
function exitSelectionMode() {
    selectionMode.value = false;
    selectedMsgIds.value = [];
    deletableSelectedIds.value = new Set();
    selectionPermToken++;
}

/** 切换单条消息的选中状态 */
function toggleSelectMsg(msgId: number) {
    const idx = selectedMsgIds.value.indexOf(msgId);
    if (idx >= 0) {
        selectedMsgIds.value.splice(idx, 1);
    } else {
        selectedMsgIds.value.push(msgId);
    }
    void refreshSelectionPermissions();
}

/** 消息是否被选中 */
function isMsgSelected(msgId: number): boolean {
    return selectedMsgIds.value.includes(msgId);
}

/** 刷新选中消息的删除权限（getMessageProperties 离线预取 + 缓存判定） */
async function refreshSelectionPermissions() {
    const token = ++selectionPermToken;
    const cid = chatId.value;
    const ids = [...selectedMsgIds.value];
    const result = new Set<number>();
    if (cid === undefined) {
        deletableSelectedIds.value = result;
        return;
    }
    await Promise.all(ids.map(async (id) => {
        const msg = messages.value.find((m) => m.id === id);
        if (!msg) return;
        if (canDeleteMessage(msg, cid)) {
            result.add(id);
            return;
        }
        // 缓存未命中时预取精确权限后再判定
        await getMessageProperties(cid, id);
        if (canDeleteMessage(msg, cid)) result.add(id);
    }));
    // 期间选择已变化则丢弃过期结果
    if (token !== selectionPermToken) return;
    deletableSelectedIds.value = result;
}

/** 选中的消息是否全部可删除（多选删除按钮的启用状态） */
const canDeleteSelected = computed(() =>
    selectedMsgIds.value.length > 0 &&
    selectedMsgIds.value.every((id) => deletableSelectedIds.value.has(id))
);

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

// ===== Reaction Picker =====
/** reaction 选择器是否可见 */
const reactionPickerVisible = ref(false);
/** reaction 选择器锚定的消息 */
const reactionPickerMsg = ref<message | null>(null);
/** reaction 选择器锚定元素的位置 */
const reactionPickerAnchor = ref<{ x: number; y: number; width: number; height: number } | undefined>(undefined);
/** reaction 选择器是否为全 emoji 模式 */
const reactionPickerFullEmoji = ref(false);

/** 打开 reaction 选择器 */
function openReactionPicker(msg: message, anchorEl?: HTMLElement, fullEmoji = false, contextMenuRect?: { x: number; y: number; width: number; height: number }) {
    reactionPickerMsg.value = msg;
    reactionPickerFullEmoji.value = fullEmoji;
    if (contextMenuRect) {
        // 从右键菜单位置打开胶囊回应选择器：放在菜单原位稍偏下
        reactionPickerAnchor.value = {
            x: contextMenuRect.x,
            y: contextMenuRect.y,
            width: contextMenuRect.width,
            height: contextMenuRect.height,
        };
    } else if (anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        reactionPickerAnchor.value = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    } else {
        // 从消息气泡定位
        const bubble = document.querySelector(`[data-bubble-msg-id="${msg.id}"]`);
        if (bubble) {
            const rect = bubble.getBoundingClientRect();
            reactionPickerAnchor.value = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        } else {
            reactionPickerAnchor.value = { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2, width: 200, height: 0 };
        }
    }
    reactionPickerVisible.value = true;
}

/** 关闭 reaction 选择器 */
function closeReactionPicker() {
    reactionPickerVisible.value = false;
    reactionPickerMsg.value = null;
    reactionPickerAnchor.value = undefined;
}

/** 从选择器中选择了一个 reaction */
function onReactionPickerSelect(type: ReactionType) {
    const msg = reactionPickerMsg.value;
    if (!msg || chatId.value === undefined) return;
    void toggleReaction(chatId.value, msg, type);
    closeReactionPicker();
}

/** 从全 emoji 选择器中选择了一个 emoji（构造 reactionTypeEmoji 发送） */
function onReactionPickerSelectEmoji(emoji: string) {
    const msg = reactionPickerMsg.value;
    if (!msg || chatId.value === undefined) return;
    const type: ReactionType = { _: 'reactionTypeEmoji', emoji };
    void toggleReaction(chatId.value, msg, type);
    closeReactionPicker();
}

/** 从全 emoji 选择器中选择了一个自定义 emoji（构造 reactionTypeCustomEmoji 发送） */
function onReactionPickerSelectCustomEmoji(id: string) {
    const msg = reactionPickerMsg.value;
    if (!msg || chatId.value === undefined) return;
    const type: ReactionType = { _: 'reactionTypeCustomEmoji', custom_emoji_id: id };
    void toggleReaction(chatId.value, msg, type);
    closeReactionPicker();
}

// ===== 胶囊回应选择器（独立于右键菜单的浮动栏） =====
import { watch as vueWatch } from 'vue';
import { state as contextMenuState } from '../../../store/contextMenu';
const reactionCapsuleRef = ref<HTMLElement | null>(null);
const reactionCapsuleVisible = ref(false);
const reactionCapsuleData = ref<ContextMenuReactionRow | null>(null);
const reactionCapsuleStyle = ref<Record<string, string>>({});

/**
 * 计算胶囊位置：绑定到右键菜单的最终渲染位置，居中对齐菜单顶部，
 * 参与四边夹紧确保不超出视口。
 */
function updateCapsulePosition() {
    if (!reactionCapsuleVisible.value) return;
    nextTick(() => {
        const menuEl = document.querySelector('.cm-menu') as HTMLElement | null;
        const capsuleEl = reactionCapsuleRef.value;
        if (!menuEl || !capsuleEl) return;

        const menuRect = menuEl.getBoundingClientRect();
        const capsuleRect = capsuleEl.getBoundingClientRect();
        const margin = 8;
        const gap = 6; // 胶囊与菜单之间的间距

        // 水平居中对齐菜单，参与左右夹紧
        let left = menuRect.left + menuRect.width / 2 - capsuleRect.width / 2;
        if (left < margin) left = margin;
        if (left + capsuleRect.width > window.innerWidth - margin) {
            left = window.innerWidth - capsuleRect.width - margin;
        }

        // 垂直：优先放在菜单上方；若放不下则放在菜单下方
        let top = menuRect.top - capsuleRect.height - gap;
        if (top < margin) {
            top = menuRect.bottom + gap;
        }
        // 若下方也放不下，夹紧到顶部
        if (top < margin) top = margin;

        reactionCapsuleStyle.value = { left: `${left}px`, top: `${top}px` };
    });
}

/** 监听右键菜单的 reactionRow 状态 + 菜单位置，同步显示/隐藏胶囊 */
vueWatch([contextMenuVisible, contextMenuReactionRow, () => contextMenuState.x, () => contextMenuState.y], () => {
    if (contextMenuVisible.value && contextMenuReactionRow.value && contextMenuReactionRow.value.reactions.length > 0) {
        // 菜单打开且有回应数据：显示胶囊
        reactionCapsuleData.value = contextMenuReactionRow.value;
        reactionCapsuleVisible.value = true;
        // 菜单已经由 ContextMenu.vue 的 positionMenuInViewport 完成夹紧定位，
        // 等菜单渲染完毕后再根据菜单最终位置计算胶囊位置
        nextTick(() => {
            // 菜单的 positionMenuInViewport 在 nextTick 中执行，再等一帧确保完成
            nextTick(updateCapsulePosition);
        });
    } else {
        // 菜单关闭或无回应：隐藏胶囊
        reactionCapsuleVisible.value = false;
        reactionCapsuleData.value = null;
    }
}, { immediate: true });

/** 窗口 resize 时重新定位胶囊 */
function onCapsuleResize() {
    if (reactionCapsuleVisible.value) updateCapsulePosition();
}
onMounted(() => window.addEventListener('resize', onCapsuleResize));
onUnmounted(() => window.removeEventListener('resize', onCapsuleResize));

/** 点击胶囊中的某个回应 */
function onCapsuleReactionClick(r: ContextMenuReactionItem) {
    if (r.needsPremium && !(userProfile.value?.is_premium)) return;
    r.onClick?.();
    reactionCapsuleVisible.value = false;
    reactionCapsuleData.value = null;
    // 点击回应后同时关闭右键菜单
    closeContextMenuStore();
}

/** 点击胶囊中的更多按钮：关闭胶囊+菜单，打开完整回应选择器 */
function onCapsuleMoreClick() {
    // 先获取回调和胶囊位置，再关闭胶囊
    const onMore = reactionCapsuleData.value?.onMore;
    const capsuleRect = reactionCapsuleRef.value?.getBoundingClientRect();
    // 关闭胶囊
    reactionCapsuleVisible.value = false;
    reactionCapsuleData.value = null;
    // 关闭右键菜单（避免菜单残留）
    closeContextMenuStore();
    // 传入胶囊位置作为锚点，让选择器在胶囊原位展开
    if (capsuleRect) {
        onMore?.({ x: capsuleRect.left, y: capsuleRect.top, width: capsuleRect.width, height: capsuleRect.height });
    } else {
        onMore?.();
    }
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

// 点击 #标签 → 激活聊天内搜索并预填标签
const { pendingHashtag } = useHashtagSearch();
watch(pendingHashtag, (tag) => {
    if (!tag) return;
    hashtagSearchQuery.value = tag;
    searchActive.value = true;
    clearPendingHashtag();
});

const isLoadingMore = ref(false);
const isHistoryExhausted = ref(false);
/** 普通模式下向下滚动加载“更新”消息是否已到边界（已加载到最新消息） */
const isNewerExhausted = ref(false);
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

// --- 消息发送身份选择器 ---
/** 当前聊天可用的发送身份列表 */
const availableSenders = ref<import('tdlib-types').chatMessageSender[]>([]);
/** 是否正在加载可用发送身份 */
const sendersLoading = ref(false);

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

// 消息变化（新增/删除/内容编辑等）后重新测量宽度。
// 不用 deep watch：messages 已是 shallowRef，深监听会把每次深层字段写入
// 变成整表 O(n) 遍历 + DOM 扫描。
watch(
    messagesVersion,
    async () => {
        await nextTick();
        measureBubbleWidths();
    },
    { immediate: true }
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

/** 查看器右键「查看」：关闭查看器并跳转到对应消息 */
function handleViewerJump(messageId: number, _topicId?: number) {
    closeMediaViewer();
    void jumpToMessage(messageId);
}

/** 查看器右键「转发」：关闭查看器并打开转发选择器 */
function handleViewerForward(messageId: number) {
    closeMediaViewer();
    forwardMessageIds.value = [messageId];
    forwardPickerVisible.value = true;
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

    // 同聊天内链接跳转：resolveInternalLink 检测到目标消息在当前聊天时，
    // 分发此事件而非 router.push，避免路由变更导致 ChatDetail 重建/缓存恢复。
    window.addEventListener('tdgram:jump-to-message-in-chat', onSameChatJump);
});

onUnmounted(() => {
    window.removeEventListener('tdgram:jump-to-message-in-chat', onSameChatJump);
    if (unlisten) unlisten();
    if (bubbleWidthObserver) bubbleWidthObserver.disconnect();
    if (readVisibilityTimer !== null) window.clearTimeout(readVisibilityTimer);
    if (chatLoadRetryTimer !== null) window.clearTimeout(chatLoadRetryTimer);
    if (localDraftTimer !== null) {
        window.clearTimeout(localDraftTimer);
        localDraftTimer = null;
    }
    // 编辑中卸载：编辑文本不是草稿，不要写入；直接冲刷先前已保存的 TDLib 草稿
    if (!editingMsg.value) {
        saveDraft();
    }
    // 无论是否编辑，都把待提交草稿冲刷出队，避免组件卸载后丢草稿
    if (tdlibDraftTimer !== null) {
        window.clearTimeout(tdlibDraftTimer);
        tdlibDraftTimer = null;
    }
    flushTdlibDraftNow();
    // 通知 TDLib 该聊天已关闭（停收推送更新等）
    if (chat.value) {
        void tdlibSend({ _: 'closeChat', chat_id: chat.value.id });
    }
    clearActiveChatTitleBar();
});

const forwardedTargetMessageId = computed(() => {
    const id = Number(route.query.message);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
});

// ==================== TDLib Updates ====================

/**
 * 收集当前正在渲染的消息对象，按对象去重后返回。
 * TDLib 的 updateFile 没有 chat/message 维度，只有 file.id，因此需要全量扫描，
 * 以便把更新文件同文件 id 的内嵌 File 快照写回消息。
 */
function collectAllInMemoryMessages(): message[] {
    const seen = new Set<message>();
    const out: message[] = [];
    const live = messages.value;
    if (live) {
        for (const m of live) {
            if (m && !seen.has(m)) {
                seen.add(m);
                out.push(m);
            }
        }
    }
    return out;
}

/** 依据 updateFile 终态，把同 file.id 的消息内嵌 File 快照就地更新（用于复制 JSON/转发前后一致）。 */
function syncEmbeddedFileSnapshot(file: TdFile): void {
    if (!isTerminalFileUpdate(file)) return;
    const all = collectAllInMemoryMessages();
    if (all.length === 0) return;
    applyTerminalFileToMessages(all, file);
}

const handleUpdate = async (update: Update) => {
    switch (update._) {
        case 'updateNewMessage': {
            const msg = update.message;
            // 仅处理当前正在渲染的聊天中的消息
            if (msg.chat_id !== chatId.value || !isReady.value) return;
            if (messages.value.find(m => m.id === msg.id)) return;

            // 话题模式下只显示属于当前话题的消息
            if (topicId.value) {
                const msgTopicId = msg.topic_id?._ === 'messageTopicForum' ? msg.topic_id.forum_topic_id : 0;
                if (msgTopicId !== topicId.value) return;
            }

            const senderIsMe =
                msg.sender_id._ === 'messageSenderUser' &&
                msg.sender_id.user_id === myId.value;

            // 追加到末尾（最新消息）
            appendMessages([msg]);
            await fetchSenders([msg]);
            void fetchMemberStatuses([msg]);

            const atBottom = isAtBottom();
            newMessageIds.value.add(msg.id);
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

        case 'updateFile': {
            // 文件（下载/上传）信息更新：把「本地已下载完成并带路径」等终态写回消息内嵌的
            // File 快照，让复制消息原始 JSON / 转发引用的本地状态保持一致，而不是停留在
            // 下载完成前获取时的旧快照。纯进度 tick 由 applyTerminalFileToMessages 内部门控跳过。
            const uf = update.file;
            if (uf && typeof uf.id === 'number') {
                syncEmbeddedFileSnapshot(uf);
            }
            break;
        }

        case 'updateMessageContent': {
            if (update.chat_id !== chatId.value) break;
            const msg = messages.value.find(m => m.id === update.message_id);
            if (msg) {
                // 内容变化（如编辑文本变长）会改变气泡高度，
                // 若用户停在底部附近则保持贴底，避免底部内容被顶出视口
                const atBottom = isAtBottom();
                // 内容整体替换后旧内联键盘按钮已失效，一并清空 reply_markup
                patchMessage(update.message_id, {
                    content: update.new_content,
                    reply_markup: msg.reply_markup !== undefined ? undefined : msg.reply_markup,
                });
                // 消息更新后刷新该消息内联键盘的锁定状态
                refreshKeyboardLock(update.message_id);
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
                    removeMessagesByIds([update.old_message_id]);
                } else {
                    setMessageObject(update.old_message_id, update.message);
                }
            } else if (currentIndex >= 0) {
                setMessageObject(update.message.id, update.message);
            } else {
                appendMessages([update.message]);
            }

            if (newMessageIds.value.delete(update.old_message_id)) {
                newMessageIds.value.add(update.message.id);
            }
            // 发送成功后消息被替换为最终版本（携带真正生成的内联键盘按钮），
            // 且消息 id 由临时 id 变为正式 id。若发送前已有内联键盘，组件实例复用、
            // 内部 pendingKey 可能残留，这里刷新锁定使其与新按钮布局保持一致。
            refreshKeyboardLock(update.message.id);
            // 旧 id 对应的键盘组件若已随替换卸载，其 ref 会在卸载回调中被自动移除。
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
            // from_cache=true 的删除是本地缓存的过时标记，不是真实的删除，忽略
            if (update.from_cache) break;
            if (update.chat_id !== chatId.value || !isReady.value) break;
            removeMessagesByIds(update.message_ids);
            break;
        }

        case 'updateChatNotificationSettings': {
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.notification_settings = update.notification_settings;
            void syncNotificationMuteState(chat.value, update.chat_id);
            break;
        }

        case 'updateChatMessageSender': {
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.message_sender_id = update.message_sender_id;
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
            /** 将 reply_markup 就地应用到某个消息对象（有值更新按钮、空值清除旧键盘） */
            const applyReplyMarkup = (msg: message) => {
                const patch: Partial<message> = { edit_date: update.edit_date };
                // updateMessageEdited 携带新的 reply_markup（可能为 null，表示移除内联键盘）：
                // 有值时更新按钮；值为 null/空时清除旧按钮并刷新锁定，避免残留旧键盘
                if (update.reply_markup) {
                    patch.reply_markup = update.reply_markup;
                } else if (update.reply_markup !== undefined && msg.reply_markup !== undefined) {
                    patch.reply_markup = undefined;
                }
                patchMessage(update.message_id, patch);
                refreshKeyboardLock(update.message_id);
            };

            if (update.chat_id === chatId.value) {
                const msg = messages.value.find(m => m.id === update.message_id);
                if (msg) {
                    applyReplyMarkup(msg);
                }
            }
            break;
        }

        // ---- 发送者/频道信息实时回填：让消息气泡旁的头像/名称随 update 刷新 ----
        // 消息头像/名称读取本地 users/chats ref，若不回填，换头像/改名后气泡不会更新。
        case 'updateUser': {
            // updateUser 携带完整 user 对象（含 first_name/last_name/profile_photo）：
            // 本地已缓存该用户时整体替换，驱动消息头像/名称实时刷新
            const u = update.user;
            if (u && users.value[u.id]) {
                users.value[u.id] = u;
            }
            break;
        }
        case 'updateChatPhoto': {
            // 频道/群组换头像：updateChatPhoto 携带新的 photo，回填本地缓存
            if (typeof update.chat_id === 'number' && chats.value[update.chat_id]) {
                chats.value[update.chat_id].photo = update.photo;
            }
            break;
        }
        case 'updateChatTitle': {
            // 频道/群组改名：回填本地缓存，刷新消息来源显示名
            if (typeof update.chat_id === 'number' && chats.value[update.chat_id]) {
                chats.value[update.chat_id].title = update.title;
            }
            break;
        }

        // ---- 消息回应更新 ----
        case 'updateMessageInteractionInfo': {
            if (update.chat_id !== chatId.value) break;
            patchMessage(update.message_id, { interaction_info: update.interaction_info });
            break;
        }

        case 'updateMessageUnreadReactions': {
            if (update.chat_id !== chatId.value) break;
            patchMessage(update.message_id, { unread_reactions: update.unread_reactions });
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

/** 标记“更新方向”已到边界：跳转模式用 jumpNewerExhausted，普通模式用 isNewerExhausted */
function markNewerExhausted() {
    if (historyMode.value === 'jump') {
        jumpNewerExhausted.value = true;
    } else {
        isNewerExhausted.value = true;
    }
}

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
watch([chatId, topicId, chatLoadRetryToken, forwardedTargetMessageId], async (
    [newChatId, newTopicId, , requestedMessageId],
    oldVals,
) => {
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

    // 通知 TDLib 关闭旧聊天（停收推送更新等）
    if (chat.value) {
        void tdlibSend({ _: 'closeChat', chat_id: chat.value.id });
    }

    // 切换对话/话题：必须用「旧」chatId 存草稿。
    // watch 回调触发时 chatId.value 已是新值，若直接 saveDraft() 会把
    // 上一聊天的输入错误地写到新聊天的 key 下，导致切换后输入框残留旧内容。
    const [oldChatId, oldTopicId] = oldVals ?? [];
    const switchingChat = oldChatId !== undefined
        && (oldChatId !== newChatId || oldTopicId !== newTopicId);
    if (switchingChat) {
        // 编辑态下的输入框是被编辑消息内容，不是草稿；丢弃编辑并走本地缓存恢复，
        // 绝不能把编辑内容写成草稿，也不要把旧草稿覆盖成空。
        suppressDraftAutosave = true;
        if (editingMsg.value) {
            editingMsg.value = null;
            editSeedEntities.value = null;
            editMediaPreviewSrc.value = null;
            editMediaReplacement.value = null;
            messageInput.value = '';
            pendingCustomEmoji.value = [];
            if (localDraftTimer !== null) {
                window.clearTimeout(localDraftTimer);
                localDraftTimer = null;
            }
        } else {
            saveDraft(oldChatId!, oldTopicId);
            // 抑制自动存草稿并立刻清空输入框，避免加载期间看到旧内容、
            // 或防抖回调用新 chatId 把空输入误存成「删除新聊天草稿」。
            if (localDraftTimer !== null) {
                window.clearTimeout(localDraftTimer);
                localDraftTimer = null;
            }
            messageInput.value = '';
            pendingCustomEmoji.value = [];
        }
    } else {
        suppressDraftAutosave = false;
    }

    // 重置全部状态
    resetState();
    searchActive.value = false;

    try {
        // 读取上次浏览位置（决定首屏加载锚点）
        const cachedPos = lastBrowsePositionCache.get(lastBrowseCacheKey(currentId, topicId.value)) || 0;

        // 并行发起：chat 基础信息 + 话题信息 +（可提前确定的）首屏消息
        const chatPromise = tdlibSend({ _: 'getChat', chat_id: currentId }) as Promise<chat>;
        const topicPromise: Promise<forumTopic | undefined> = topicId.value
            ? tdlibSend({ _: 'getForumTopic', chat_id: currentId, forum_topic_id: topicId.value }) as Promise<forumTopic>
            : Promise.resolve(undefined);

        // 有上次浏览位置时，围绕该位置先拉一个小窗口（前 5 后 5），无需等待 getChat
        const earlyMessages: Promise<message[]> | null = cachedPos > 0 && !requestedMessageId
            ? fetchMessages(currentId, cachedPos, 10, -5, gen)
            : null;

        const chatData = await chatPromise;
        if (!isGenerationValid(gen)) return;
        chat.value = chatData;

        // 话题模式：加载当前话题信息（用于头部显示话题名称/图标）
        if (topicId.value) {
            topic.value = undefined;
            try {
                const t = await topicPromise;
                if (!isGenerationValid(gen)) return;
                topic.value = t;
            } catch (e) {
                console.error('Failed to load forum topic:', e);
            }
        } else {
            topic.value = undefined;
        }

        // 有未读消息时，以最后一条已读收件箱消息作为历史定位锚点
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
                restoreDraft(currentId, topicId.value, chatData.draft_message);
                void tdlibSend({ _: 'openChat', chat_id: currentId });
                void autoOpenMediaFromQuery(gen);
                return;
            }
        }

        // 首屏消息（10 条）与群组/通知信息并行加载：
        //   - 有上次位置 → 复用提前发起的 earlyMessages
        //   - 否则有未读 → 围绕最后已读位置拉未读分隔线附近窗口
        //   - 否则 → 从最新消息向历史拉
        const firstBatchPromise = earlyMessages ?? fetchMessages(
            currentId,
            lastReadId,
            10,
            lastReadId > 0 ? -5 : 0,
            gen
        );
        const [firstBatch] = await Promise.all([
            firstBatchPromise,
            fetchGroupInfo(chatData, gen),
            syncNotificationMuteState(chatData, currentId),
            fetchAvailableSenders(currentId, gen),
        ]);
        if (!isGenerationValid(gen)) return;
        if (firstBatch.length === 0 && chatData.last_message) {
            throw new Error(`Chat ${currentId} returned empty history despite having a last message`);
        }
        // earlyMessages 发起时 chat 尚未就绪，群成员状态可能被跳过，这里补拉一次
        if (earlyMessages) {
            void fetchMemberStatuses(firstBatch);
        }

        const firstUnreadMessage = chatData.unread_count > 0
            ? firstBatch.find(message => !message.is_outgoing && (lastReadId === 0 || message.id > lastReadId))
            : undefined;
        const unreadAlbumId = firstUnreadMessage?.media_album_id;
        unreadBoundaryMessageId.value = unreadAlbumId && unreadAlbumId !== '0'
            ? firstBatch.find(message => message.media_album_id === unreadAlbumId)?.id || firstUnreadMessage.id
            : firstUnreadMessage?.id || null;

        // 渲染首屏，骨架屏随即消失
        applyMessages(firstBatch);
        await nextTick();

        // 定位：上次浏览位置优先 → 未读分隔线 → 底部
        const unreadBoundary = unreadBoundaryMessageId.value;
        if (cachedPos > 0 && firstBatch.some(m => m.id === cachedPos)) {
            scrollToMessage(cachedPos);
        } else if (unreadBoundary != null && unreadBoundary > 0) {
            scrollToMessage(unreadBoundary);
        } else {
            scrollToBottom();
        }

        isReady.value = true;
        chatLoadRetryCount = 0;
        restoreDraft(currentId, topicId.value, chatData.draft_message);
        void tdlibSend({ _: 'openChat', chat_id: currentId });

        // 定位后向更旧方向补齐历史，直到足够滚动（渐进，不阻塞首屏）
        for (let i = 0; i < 4 && messages.value.length < 80 && !isHistoryExhausted.value; i++) {
            if (!isGenerationValid(gen)) return;
            const ok = await loadHistoryOlder(currentId, gen);
            if (!ok) break;
        }

        // 补齐后仍未撑满视口，继续向更旧方向拉
        await nextTick();
        const container = messagesContainer.value;
        if (container && container.scrollHeight <= container.clientHeight + 2) {
            if (messages.value.length > 0 && !isHistoryExhausted.value) {
                const oldest = messages.value[0];
                const more = await fetchMessages(currentId, oldest.id, 50, 0, gen);
                if (more.length > 0) {
                    applyMessages(mergeMessages(messages.value, more), 'older');
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
    } finally {
        // 仅当仍是当前这一代加载时解除抑制；
        // 若期间又切换了聊天（gen 已更新），交给新一代自行管理。
        if (loadGeneration === gen) {
            suppressDraftAutosave = false;
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

/** 合并消息并去重（oldest-first 顺序），返回新数组。
 *  过滤掉 chat_id 不属于当前聊天的消息，防止跨对话污染。 */
function mergeMessages(existing: message[], incoming: message[]): message[] {
    const cid = chatId.value;
    const safe = cid != null ? incoming.filter(m => m.chat_id === cid) : incoming;
    if (existing.length === 0) return safe;
    if (safe.length === 0) return existing;
    const existingIds = new Set(existing.map(m => m.id));
    const unique = safe.filter(m => !existingIds.has(m.id));
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

        applyMessages([...unique, ...messages.value], 'older');
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
 * 向更“新”的方向扩展当前列表底部。
 * 跳转模式与普通模式共用：普通模式在向下滚到底部且有更多未加载消息时也会调用；
 * 真正贴底后的新增消息仍依赖 TDLib updateNewMessage 事件追加。
 */
async function loadHistoryNewer(loadChatId: number, gen: number): Promise<boolean> {
    if (isLoadingMore.value) return false;

    const newestId = messages.value[messages.value.length - 1]?.id;
    if (!newestId) {
        markNewerExhausted();
        return false;
    }

    isLoadingMore.value = true;
    try {
        const newer = await fetchMessages(loadChatId, newestId, 30, -30, gen);
        if (!isGenerationValid(gen) || chatId.value !== loadChatId) return false;

        const filtered = newer.filter(m => m.id !== newestId);
        if (filtered.length === 0) {
            markNewerExhausted();
            return false;
        }

        const existingIds = new Set(messages.value.map(m => m.id));
        const unique = filtered.filter(m => !existingIds.has(m.id));
        if (unique.length === 0) {
            markNewerExhausted();
            return false;
        }

        appendMessages(unique);
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

        // 内联机器人（via_bot_user_id）用户信息
        if (m.via_bot_user_id && !users.value[m.via_bot_user_id]) {
            userIds.add(m.via_bot_user_id);
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
                }) as ChatMember;
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

/** 发送者角色/标签计算所需依赖（调用时求值以保持响应式） */
const roleContext = (): RoleContext => ({
    chat: chat.value,
    memberStatus: memberStatus.value,
});

/**
 * 判断消息是否为「群组关联频道」自动转到群组的消息。
 * 这类消息的 sender 是频道（messageSenderChat），且 forward_info 指向同一个频道
 * （即频道把帖子同步推送到其讨论群组），不作为普通转发显示，也不显示转发标记。
 */
const isLinkedChannelMessage = (msg: message): boolean =>
    isLinkedChannelMessageOf(msg);

/**
 * 消息右上角标签文本（整条消息维度）：
 * - 群组关联频道的消息 → 「频道」
 * - 否则回退到按发送者角色判断（创建者/管理员/成员 tag）
 */
const getMessageLabel = (msg: message): string =>
    getMessageLabelOf(msg, roleContext());

/** 消息右上角标签样式 class（整条消息维度） */
const getMessageLabelClass = (msg: message): string =>
    getMessageLabelClassOf(msg, roleContext());

/**
 * 取应传给内容/转发组件的 forwardInfo：
 * 群组关联频道的消息不显示转发标记，返回 undefined；否则返回原始 forward_info。
 */
const getDisplayForwardInfo = (msg: message): messageForwardInfo | undefined =>
    getDisplayForwardInfoOf(msg);

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

// ==================== Sender Selector ====================

/** 获取当前聊天可用的消息发送身份列表（频道/匿名群组等） */
async function fetchAvailableSenders(cid: number, gen: number) {
    sendersLoading.value = true;
    try {
        const result = await tdlibSend({ _: 'getChatAvailableMessageSenders', chat_id: cid });
        if (!isGenerationValid(gen)) return;
        availableSenders.value = result.senders || [];
    } catch {
        availableSenders.value = [];
    } finally {
        sendersLoading.value = false;
    }
}

/** 切换消息发送身份 */
async function handleChangeSender(senderId: import('tdlib-types').MessageSender) {
    if (!chatId.value) return;
    try {
        await tdlibSend({
            _: 'setChatMessageSender',
            chat_id: chatId.value,
            message_sender_id: senderId,
        });
        // updateChatMessageSender 会通过 TDLib update 自动更新 chat.value.message_sender_id
    } catch (e) {
        console.error('Failed to change sender:', e);
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
            source: topicId.value ? { _: 'messageSourceForumTopicHistory' } as const : undefined,
        });
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

    applyMessages(windowMessages);
    historyMode.value = 'jump';
    jumpOlderExhausted.value = false;
    jumpNewerExhausted.value = false;
    isHistoryExhausted.value = false;
    isNewerExhausted.value = false;

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

/**
 * 同聊天内链接跳转的事件处理器。
 * resolveInternalLink 检测到链接目标消息在当前聊天时，分发 CustomEvent，
 * 本函数接收后直接调用 jumpToMessage，避免 router.push 触发路由重建。
 */
function onSameChatJump(e: Event) {
    const detail = (e as CustomEvent).detail;
    const messageId = Number(detail?.messageId);
    if (Number.isSafeInteger(messageId) && messageId > 0) {
        void jumpToMessage(messageId);
    }
}

/**
 * 根据路由 query 中携带的 `open` 参数自动在播放器中打开目标消息的媒体：
 * - `open=photo`：打开媒体查看器（图片/视频）
 * - `open=audio`：用全局音频播放器播放音乐
 * 需配合 `message` query（跳转目标）在跳转完成后调用。
 */
async function autoOpenMediaFromQuery(gen: number) {
    const action = route.query.open as string | undefined;
    if (!action) return;
    const requestedMessageId = forwardedTargetMessageId.value;
    if (!requestedMessageId) return;

    await nextTick();
    const msg = messages.value.find((m) => m.id === requestedMessageId);
    if (!msg) return;
    if (!isGenerationValid(gen)) return;

    if (action === 'photo' && isMediaMessage(msg)) {
        if (!isGenerationValid(gen)) return;
        openMediaViewer({ messageId: msg.id, chatId: chatId.value, topicId: topicId.value, message: msg });
    } else if (action === 'audio' && msg.content._ === 'messageAudio') {
        await player.playMessageAudio(msg);
    }
}

/** 滚动到指定消息并触发高亮闪烁（用于回复跳转，目标不在列表时也会先加载） */
const handleReplyJumpToMessage = (messageId: number) => {
    void jumpToMessage(messageId);
};

// ==================== Scroll Events ====================
/** 计算当前视口顶部可见的第一条消息 id（用于记录上次浏览位置） */
function captureBrowsePosition(el: HTMLElement, id: number, tid?: number | null): number {
    if (!el) return 0;
    // 容器自身的视口位置是常数参考点：消息 rect.top 越接近它，越靠近容器顶部（scrollTop=0 处）
    const refTop = el.getBoundingClientRect().top;
    let bestId = 0;
    let bestDistance = Infinity;
    for (const node of el.querySelectorAll<HTMLElement>('[data-msg-id]')) {
        const msgId = Number(node.dataset.msgId || '0');
        if (msgId <= 0) continue;
        // 消息元素顶部所在行（元素首行可见场景很少，用整条消息顶边即可）
        const top = node.getBoundingClientRect().top;
        const distance = Math.abs(top - refTop);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestId = msgId;
        }
    }
    if (bestId > 0) lastBrowsePositionCache.set(lastBrowseCacheKey(id, tid), bestId);
    return bestId;
}

const onScroll = async (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    const H = el.scrollHeight;
    const C = el.clientHeight;
    const T = el.scrollTop;

    // 记录当前浏览位置（用户手动滚动时持续更新顶部可见消息）
    if (chatId.value !== undefined) {
        // 已贴底时清空缓存位置（下次进入直接到底部，能自动看到新消息）
        if (T + C >= H - 100) {
            clearLastBrowsePosition(chatId.value, topicId.value);
        } else {
            captureBrowsePosition(el, chatId.value, topicId.value);
        }
    }

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

    if (messages.value.length === 0) return;

    // 向上滚到顶部 → 加载更旧消息
    if (atTop && !isHistoryExhausted.value) {
        await loadHistoryOlder(loadChat, scrollGen);
        return;
    }
    // 向下滚到底部 → 加载更新消息（普通模式同样需要，否则未读较多的频道/聊天滚几十条就到头）
    if (nearBottom && !isNewerExhausted.value) {
        await loadHistoryNewer(loadChat, scrollGen);
    }
};

// ==================== Send Message ====================
/**
 * 发送文本消息。
 * @param input 发送内容。MessageInput 现在发送的是 formattedText（含实体）；
 *              为兼容旧调用，仍接受纯字符串（此时无实体）。
 */
const handleSend = async (input: string | { _: 'formattedText'; text: string; entities?: textEntity$Input[] }) => {
    if (!chatId.value) return;
    const text = typeof input === 'string' ? input : input.text;

    // —— 编辑模式：有新媒体 → editMessageMedia；仅文本 → editMessageText；仅描述 → editMessageCaption ——
    if (editingMsg.value) {
        const target = editingMsg.value;
        const isMedia = isMediaMessage(target) || editHasMedia.value;
        // 文本消息不允许空内容；媒体消息允许清空描述
        if (!text.trim() && !isMedia && !editMediaReplacement.value) return;
        try {
            const richEntities = (typeof input === 'string' ? [] : input.entities || []) as textEntity$Input[];
            const customEmojiEntities = buildCustomEmojiEntities(text);
            const entities = [...richEntities, ...customEmojiEntities];
            let ok = false;
            if (editMediaReplacement.value) {
                // 更换媒体：走 editMessageMedia（描述与新媒体一并提交）
                const content = buildEditMediaContent(editMediaReplacement.value, text, entities);
                ok = await editMessageMediaContent(chatId.value, target.id, content);
            } else if (isMedia) {
                // 仅改描述
                ok = await editCaptionMessage(chatId.value, target.id, text, entities);
            } else {
                ok = await editTextMessage(chatId.value, target.id, text, entities);
            }
            if (ok) {
                messageInput.value = '';
                pendingCustomEmoji.value = [];
                editingMsg.value = null;
                editSeedEntities.value = null;
                editMediaPreviewSrc.value = null;
                editMediaReplacement.value = null;
                if (localDraftTimer !== null) {
                    window.clearTimeout(localDraftTimer);
                    localDraftTimer = null;
                }
                // 编辑成功后恢复进入编辑前保存的草稿，避免输入框被清空丢失草稿视图
                if (chatId.value !== undefined) {
                    suppressDraftAutosave = true;
                    restoreDraft(chatId.value, topicId.value, chat.value?.draft_message);
                    // restore 触发的模型更新在 nextTick 后结束，再解除抑制
                    void nextTick(() => {
                        suppressDraftAutosave = false;
                    });
                }
            }
        } catch (e) {
            console.error('Failed to edit message:', e);
        }
        return;
    }

    const attachStore = useAttachmentStore();
    // 有附件 → 发送附件（文本作为描述）
    if (attachStore.items.length > 0) {
        sending.value = true;
        try {
            await sendAttachments(
                attachStore.items,
                {
                    chatId: chatId.value,
                    topicId: topicId.value,
                    replyTo: replyTargetMsg.value
                        ? { _: 'inputMessageReplyToMessage', message_id: replyTargetMsg.value.id, quote: buildReplyQuote(), checklist_task_id: 0, poll_option_id: '' }
                        : null,
                },
                text || '',
            );
        } finally {
            sending.value = false;
        }
        await attachStore.clearWithCleanup();
        messageInput.value = '';
        clearReply();
        return;
    }
    if (!text.trim()) return;
    try {
        // 富文本实体（来自输入框格式菜单）与自定义 emoji 实体会并
        const richEntities = (typeof input === 'string' ? [] : input.entities || []) as textEntity$Input[];
        const customEmojiEntities = buildCustomEmojiEntities(text);
        const entities = [...richEntities, ...customEmojiEntities];
        const params: sendMessage = {
            _: 'sendMessage',
            chat_id: chatId.value!,
            input_message_content: {
                _: 'inputMessageText',
                text: { _: 'formattedText', text, entities },
                clear_draft: true,
            },
            reply_to: replyTargetMsg.value
                ? {
                    _: 'inputMessageReplyToMessage',
                    message_id: replyTargetMsg.value.id,
                    quote: buildReplyQuote() ?? undefined,
                    checklist_task_id: 0,
                    poll_option_id: '',
                }
                : undefined,
            topic_id: topicId.value ? { _: 'messageTopicForum', forum_topic_id: topicId.value } : undefined,
        };
        await tdlibSend(params as $Function);
        messageInput.value = '';
        pendingCustomEmoji.value = [];
        // 发送成功后清除本地草稿与 TDLib 草稿，并清除回复状态
        if (chatId.value !== undefined) {
            draftCache.delete(draftCacheKey(chatId.value, topicId.value));
            if (localDraftTimer !== null) {
                window.clearTimeout(localDraftTimer);
                localDraftTimer = null;
            }
            syncTdlibDraft(chatId.value, topicId.value, '');
        }
        clearReply();
    } catch (e) {
        console.error("Failed to send message:", e);
    }
};

// ==================== 表情包面板发送（贴纸 / GIF） ====================
/** 发送贴纸：InputMessageSticker(InputFileId(stickerId)) */
/** 发送贴纸：inputMessageSticker(inputSticker(inputFileId(文件id))) */
async function sendSticker(fileId: number | string) {
    const fid = Number(fileId);
    if (!chatId.value || !fid) return;
    try {
        const params: sendMessage = {
            _: 'sendMessage',
            chat_id: chatId.value!,
            input_message_content: {
                _: 'inputMessageSticker',
                sticker: { _: 'inputSticker', sticker: { _: 'inputFileId', id: fid } },
                emoji: '',
            },
            reply_to: replyTargetMsg.value
                ? {
                    _: 'inputMessageReplyToMessage',
                    message_id: replyTargetMsg.value.id,
                    quote: buildReplyQuote() ?? undefined,
                    checklist_task_id: 0,
                    poll_option_id: '',
                }
                : undefined,
            topic_id: topicId.value ? { _: 'messageTopicForum', forum_topic_id: topicId.value } : undefined,
        };
        await tdlibSend(params as $Function);
        clearReply();
    } catch (e) {
        console.error("Failed to send sticker:", e);
    }
}

/** 发送动画/GIF：inputMessageAnimation(inputAnimation(inputFileId(文件id))) */
function sendAnimation(fileId: number, _stickerId: string) {
    if (!chatId.value || !fileId) return;
    void (async () => {
        try {
            const params: sendMessage = {
                _: 'sendMessage',
                chat_id: chatId.value!,
                input_message_content: {
                    _: 'inputMessageAnimation',
                    animation: { _: 'inputAnimation', animation: { _: 'inputFileId', id: fileId } },
                    caption: { _: 'formattedText', text: '', entities: [] },
                },
                reply_to: replyTargetMsg.value
                    ? {
                        _: 'inputMessageReplyToMessage',
                        message_id: replyTargetMsg.value.id,
                        quote: buildReplyQuote() ?? undefined,
                        checklist_task_id: 0,
                        poll_option_id: '',
                    }
                    : undefined,
                topic_id: topicId.value ? { _: 'messageTopicForum', forum_topic_id: topicId.value } : undefined,
            };
            await tdlibSend(params as $Function);
            clearReply();
        } catch (e) {
            console.error("Failed to send animation:", e);
        }
    })();
}

const handleAttach = (files: FileList) => {
    console.log("Attach files:", files);
};

// ==================== 附件发送 ====================
// 图片/视频选择与分类在 MessageInput 内完成（打开系统文件选择器 + 剪贴板粘贴），
// 通过附件 store 累积；handleSend 统一处理发送。
const isMePremium = computed(() => !!userProfile.value?.is_premium);

const handleAttachFile = () => {
    console.log("Attach: 文件");
};

const handleAttachMusic = () => {
    console.log("Attach: 音乐");
};

const handleAttachPoll = () => {
    console.log("Attach: 投票");
};

const handleAttachChecklist = () => {
    console.log("Attach: 清单");
};

const handleAttachContact = () => {
    console.log("Attach: 联系人");
};

// ==================== State Reset ====================
function resetState() {
    if (readVisibilityTimer !== null) {
        window.clearTimeout(readVisibilityTimer);
        readVisibilityTimer = null;
    }
    lastReportedReadMessageId = 0;
    applyMessages([]);
    chat.value = undefined;
    clearActiveChatTitleBar();
    topic.value = undefined;
    memberStatus.value = {};
    isHistoryExhausted.value = false;
    isNewerExhausted.value = false;
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
    availableSenders.value = [];
    sendersLoading.value = false;
    historyMode.value = 'normal';
    jumpOlderExhausted.value = false;
    jumpNewerExhausted.value = false;
    // 清空回复、编辑与多选状态
    clearReply();
    editingMsg.value = null;
    editSeedEntities.value = null;
    editMediaPreviewSrc.value = null;
    editMediaReplacement.value = null;
    selectionMode.value = false;
    selectedMsgIds.value = [];
    if (highlightTimer !== null) {
        window.clearTimeout(highlightTimer);
        highlightTimer = null;
    }
    highlightedMessageId.value = null;
}

/** 冻结单条消息，阻止 Vue 深层代理（TDLib 对象很大且频繁整体替换） */
function freezeMsg(m: message): message {
    return markRaw(m);
}

/**
 * 中央写入 messages 的入口：整体替换数组并累加版本号。
 * 写入前过滤不属于当前聊天的消息，并对超长列表按 keep 端裁剪。
 */
function applyMessages(next: message[], keep: 'older' | 'newer' = 'newer') {
    const cid = chatId.value;
    const safe = cid != null ? next.filter(m => m.chat_id === cid) : next;
    let list = safe.map(freezeMsg);
    if (list.length > MAX_MESSAGE_WINDOW) {
        list = keep === 'older'
            ? list.slice(0, MAX_MESSAGE_WINDOW)
            : list.slice(list.length - MAX_MESSAGE_WINDOW);
    }
    messages.value = list;
    messagesVersion.value++;
}

/** 末尾追加消息（新消息 / 向更新方向加载），超出窗口时裁掉最旧一端 */
function appendMessages(incoming: message[]) {
    if (incoming.length === 0) return;
    applyMessages([...messages.value, ...incoming], 'newer');
}

/** 按 id 补丁更新消息（浅合并后整体替换该条，驱动依赖该消息字段的子组件刷新） */
function patchMessage(id: number, patch: Partial<message>) {
    const idx = messages.value.findIndex(m => m.id === id);
    if (idx === -1) return;
    const next = messages.value.slice();
    next[idx] = freezeMsg({ ...messages.value[idx], ...patch } as message);
    messages.value = next;
    messagesVersion.value++;
}

/** 按 id 删除消息 */
function removeMessagesByIds(ids: number[]) {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    const next = messages.value.filter(m => !drop.has(m.id));
    if (next.length !== messages.value.length) applyMessages(next);
}

/** 整条替换消息对象（发送成功后的最终版本等） */
function setMessageObject(id: number, msg: message) {
    const idx = messages.value.findIndex(m => m.id === id);
    if (idx === -1) {
        appendMessages([msg]);
        return;
    }
    const next = messages.value.slice();
    next[idx] = freezeMsg(msg);
    messages.value = next;
    messagesVersion.value++;
}

// ==================== Helpers ====================

/** 判断当前频道是否开启了显示发送者信息（个人资料显示），
 *  此时即使是自己发的消息也应和其他消息一样靠左显示 */
const isChannelWithSenderDisplay = computed(() =>
    isChannelWithSenderDisplayOf(chat.value, { supergroups: supergroups.value, basicGroups: basicGroups.value })
);

const isSelf = (msg: message) => {
    // 在开启了发送者显示的频道中，所有消息统一靠左，不区分颜色
    return isSelfMessage(msg, selfDeps());
};

/** 是否为「当前账号发送」的消息（用于发送状态/失败/进度展示，与对齐无关）。
 *  频道中 own 消息靠左显示，但仍应有发送状态。 */
const isOutgoingMsg = (msg: message) => isOutgoingMessageOf(msg, selfDeps());

/** `isSelf` 所需依赖（调用时求值以保持响应式） */
const selfDeps = (): SelfDeps => ({
    chat: chat.value,
    myId: myId.value,
    isChannelWithSenderDisplay: isChannelWithSenderDisplay.value,
});

const isMessageRead = (msg: message) =>
    isMessageReadOf(msg, chat.value);

/** 媒体消息是否有标题文本（caption），用于决定 ReactionsBar 位置 */
function hasMediaCaption(msg: message): boolean {
    const c = msg.content;
    return ('caption' in c) && !!(c as any).caption?.text;
}

/** 当前右键菜单对应的消息（供获取完成后判断是否需要打开菜单） */
let currentMenuMsg: message | null = null;

/**
 * 构建消息右键菜单的回应栏数据。
 * 调用 TDLib getMessageAvailableReactions 获取该消息的可用回应，取前 6 个作为快捷行。
 */
async function buildReactionRow(msg: message): Promise<import('../../contextMenu/types').ContextMenuReactionRow | null> {
    const cid = chatId.value;
    if (cid === undefined) return null;
    try {
        const result = await tdlibSend({
            _: 'getMessageAvailableReactions',
            chat_id: cid,
            message_id: msg.id,
        });
        if (result._ !== 'availableReactions') return null;
        const avail = result;
        // 合并 top + recent + popular，去重后取前 6 个
        const seen = new Set<string>();
        const all: { type: any; emoji: string; customEmojiId?: string; needsPremium: boolean }[] = [];
        for (const r of [...avail.top_reactions, ...avail.recent_reactions, ...avail.popular_reactions]) {
            const key = r.type._ === 'reactionTypeEmoji' ? r.type.emoji
                : r.type._ === 'reactionTypeCustomEmoji' ? `c:${r.type.custom_emoji_id}`
                    : 'paid';
            if (seen.has(key)) continue;
            seen.add(key);
            const emoji = r.type._ === 'reactionTypeEmoji' ? r.type.emoji
                : r.type._ === 'reactionTypeCustomEmoji' ? '🏷'
                    : '付费回应';
            all.push({ type: r.type, emoji, customEmojiId: r.type._ === 'reactionTypeCustomEmoji' ? r.type.custom_emoji_id : undefined, needsPremium: r.needs_premium });
            if (all.length >= 6) break;
        }
        if (all.length === 0) return null;
        // 检测聊天是否允许所有 emoji 回应（chatAvailableReactionsAll）
        const currentChat = chat.value;
        const isAllReactions = currentChat?.available_reactions?._ === 'chatAvailableReactionsAll';
        const totalAvailable = avail.top_reactions.length + avail.recent_reactions.length + avail.popular_reactions.length;
        return {
            reactions: all.map(r => ({
                type: r.type,
                emoji: r.emoji,
                customEmojiId: r.customEmojiId,
                needsPremium: r.needsPremium,
                onClick: () => void toggleReaction(cid!, msg, r.type),
            })),
            hasMore: totalAvailable > 6 || isAllReactions,
            onMore: (anchorRect?: { x: number; y: number; width: number; height: number }) => openReactionPicker(msg, undefined, isAllReactions, anchorRect),
        };
    } catch (e) {
        console.warn('buildReactionRow failed:', e);
        return null;
    }
}

/** 缓存最近一次构建的回应栏（供 v-context-menu 指令读取） */
let pendingReactionRow: import('../../contextMenu/types').ContextMenuReactionRow | null = null;

/**
 * 返回消息右键菜单构建函数（指令函数形式受支持）。
 * 用闭包绑定消息，避免在模板内联箭头导致参数无类型/未使用告警。
 *
 * 用户实际右键（调用返回的函数）时先触发 getMessageProperties 离线预取，等待
 * 获取到精确权限后再渲染菜单，避免每个消息气泡渲染时都触发、以及先显示乐观值
 * 再异步重建造成的闪烁/短暂不可用。
 */
function makeMsgMenu(msg: message): { items: (e: MouseEvent, data?: any) => Promise<ContextMenuItem[]>; reactionRow: import('../../contextMenu/types').ContextMenuReactionRow | null } {
    return {
        items: async (e: MouseEvent, data?: any): Promise<ContextMenuItem[]> => {
            void e;
            void data;
            const cid = chatId.value;
            if (cid !== undefined) {
                await getMessageProperties(cid, msg.id);
            }
            pendingReadDateLabel = await fetchReadDateLabel(msg);
            // 右键时才加载可用回应列表
            pendingReactionRow = await buildReactionRow(msg);
            return buildMessageContextMenu(msg);
        },
        get reactionRow() { return pendingReactionRow; },
    };
}

/**
 * 针对指定消息在给定坐标处直接打开右键菜单。
 * 相册中右键某一块具体媒体时使用：确保菜单针对「被点击的那一条」而非相册第一条。
 * 先等待 getMessageProperties 获取精确权限，再渲染并打开菜单。
 */
async function openMessageContextMenu(msg: message, x: number, y: number) {
    if (selectionMode.value) return;
    currentMenuMsg = msg;
    const cid = chatId.value;
    if (cid !== undefined) {
        await getMessageProperties(cid, msg.id);
    }
    // 并行预取阅读状态标签和回应栏
    const [readLabel, reactionRow] = await Promise.all([
        fetchReadDateLabel(msg),
        buildReactionRow(msg),
    ]);
    pendingReadDateLabel = readLabel;
    // 获取完成后若仍对应这条消息则打开菜单，否则忽略（已被其它操作替换）
    if (currentMenuMsg !== msg) return;
    openContextMenu(x, y, buildMessageContextMenu(msg), null, null, reactionRow);
}

/** 相册中某块媒体被右键：以该条消息 + 坐标打开菜单 */
function onAlbumMessageContextMenu(msg: message, x: number, y: number) {
    if (selectionMode.value) return;
    void openMessageContextMenu(msg, x, y);
}

/** 打开消息翻译弹窗（提取富文本并交给 TranslateMessageModal） */
function openTranslateDialogFor(msg: message) {
    const ft = getMessageFormattedText(msg);
    if (!ft || !ft.text.trim()) return;
    showTranslateDialog({
        chatId: chatId.value ?? 0,
        msg,
        text: ft,
        plainText: getMessagePlainText(msg),
    });
}

/** 根据「翻译显示设置」选择弹窗或内联翻译 */
function openTranslateFor(msg: message) {
    const ft = getMessageFormattedText(msg);
    if (!ft || !ft.text.trim()) return;
    const cid = chatId.value ?? 0;
    // 相册消息不提供内联展示槽位，回退到弹窗
    const isAlbumMember = !!msg.media_album_id && msg.media_album_id !== '0';
    if (settings.translate.displayMode === 'inline' && !isAlbumMember) {
        // 内联：在原消息气泡中显示译文
        void translateInlineMessage(cid, msg.id, ft, DEFAULT_TRANSLATE_TARGET);
    } else {
        // 弹窗：默认行为
        openTranslateDialogFor(msg);
    }
}

// ==================== 媒体文件「打开目录 / 另存为」 ====================

/** 从文档/图片/视频/音乐消息中提取实际承载内容的 file 对象（无则返回 undefined） */
function getMessageFile(msg: message): TdFile | undefined {
    const c = msg.content;
    if (c._ === 'messagePhoto') {
        const sizes = c.photo.sizes;
        if (sizes.length === 0) return undefined;
        const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
        return largest.photo;
    }
    if (c._ === 'messageVideo') return c.video.video;
    if (c._ === 'messageDocument') return c.document.document;
    if (c._ === 'messageAudio') return c.audio.audio;
    return undefined;
}

/** 提取媒体文件建议名称：优先发送方提供的 file_name，图片等无名称时回退本地路径末段 */
function getMessageFileName(msg: message, file: TdFile): string {
    const c = msg.content;
    let name = '';
    if (c._ === 'messageVideo') name = c.video.file_name;
    else if (c._ === 'messageDocument') name = c.document.file_name;
    else if (c._ === 'messageAudio') name = c.audio.file_name;
    if (name) return name;
    const p = file.local.path;
    return p ? p.split(/[\\/]/).pop() || 'media' : 'media';
}

/** 打开目录：在系统文件管理器中定位到该媒体本地文件 */
async function handleRevealInDir(path: string) {
    if (!path) return;
    try {
        await revealItemInDir([path]);
    } catch (e) {
        console.error('revealItemInDir failed:', e);
        MessagePlugin.error('打开目录失败');
    }
}

/** 另存为：弹出保存对话框并把源文件复制到目标位置 */
async function handleMessageSaveAs(file: TdFile, fileName: string) {
    const src = file.local.path;
    if (!src) return;
    try {
        const dest = await save({
            title: '另存为',
            defaultPath: fileName,
        });
        if (!dest) return;
        await copyFile(src, dest);
        MessagePlugin.success('已另存为');
    } catch (e) {
        console.error('saveAs failed:', e);
        MessagePlugin.error('另存为失败');
    }
}

/** 保存消息到收藏（Saved Messages） */
async function handleSaveMessage(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;
    try {
        // Saved Messages 是与自己的私聊，chat_id = myId
        const savedChatId = myId.value;
        if (!savedChatId) {
            MessagePlugin.warning('无法获取收藏对话');
            return;
        }
        await tdlibSend({
            _: 'forwardMessages',
            from_chat_id: cid,
            message_ids: [msg.id],
            to_chat_id: savedChatId,
            as_copy: true,
            disable_notification: false,
            send_pinned: false,
        });
        MessagePlugin.success('已保存到收藏');
    } catch (e: any) {
        console.error('saveMessage failed:', e);
        MessagePlugin.error(e?.message || '保存失败');
    }
}

/** 查看消息回应者 */
async function handleGetViewers(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;
    try {
        const result = await tdlibSend({
            _: 'getMessageViewers',
            chat_id: cid,
            message_id: msg.id,
        }) as any;
        const viewers: Array<{ user_id: number; view_date: number }> = result?.viewers || [];
        if (viewers.length === 0) {
            MessagePlugin.info('暂无回应者');
            return;
        }
        // 批量获取用户信息以显示名称
        const userPromises = viewers.map(v =>
            tdlibSend({ _: 'getUser', user_id: v.user_id } as any).catch(() => null)
        );
        const users = await Promise.all(userPromises);
        const names = users
            .filter((u): u is any => u && u._ === 'user')
            .map(u => `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}`);
        const nameList = names.length > 0 ? names.join('、') : `${viewers.length} 位用户`;
        MessagePlugin.success({ content: `回应者：${nameList}`, duration: 5000 });
    } catch (e: any) {
        console.error('getMessageViewers failed:', e);
        MessagePlugin.error(e?.message || '获取回应者失败');
    }
}

/** 当前右键菜单对应的阅读状态标签（异步预取后写入） */
let pendingReadDateLabel: string | null = null;

/** 预取阅读状态，返回可显示的标签文本（null 表示不显示） */
async function fetchReadDateLabel(msg: message): Promise<string | null> {
    const cid = chatId.value;
    if (cid === undefined) return null;
    if (!canGetReadDate(msg, cid)) return null;
    try {
        const result = await tdlibSend({
            _: 'getMessageReadDate',
            chat_id: cid,
            message_id: msg.id,
        }) as any;
        switch (result?._) {
            case 'messageReadDateRead': {
                const d = new Date(result.read_date * 1000);
                const timeStr = d.toLocaleString('zh-CN', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                });
                return `对方已于 ${timeStr} 阅读`;
            }
            case 'messageReadDateUnread':
                return '对方尚未阅读';
            case 'messageReadDateTooOld':
                return '消息太旧，无法获取阅读状态';
            case 'messageReadDateUserPrivacyRestricted':
                return '对方隐私设置限制了阅读状态';
            case 'messageReadDateMyPrivacyRestricted':
                return '你的隐私设置限制了阅读状态';
            default:
                return null;
        }
    } catch {
        return null;
    }
}

/** 查看消息真实作者（频道代发消息） */
async function handleGetAuthor(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;
    try {
        const author = await tdlibSend({
            _: 'getMessageAuthor',
            chat_id: cid,
            message_id: msg.id,
        }) as any;
        if (author && author._ === 'user') {
            router.push({ name: 'user-profile', params: { id: String(author.id) } });
        } else {
            MessagePlugin.info('无法获取作者信息');
        }
    } catch (e: any) {
        console.error('getMessageAuthor failed:', e);
        MessagePlugin.error(e?.message || '获取作者失败');
    }
}

/** 查看消息线程 */
async function handleGetMessageThread(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;
    try {
        const thread = await tdlibSend({
            _: 'getMessageThread',
            chat_id: cid,
            message_id: msg.id,
        }) as any;
        if (thread && thread._ === 'messageThreadInfo') {
            const replyCount = thread.reply_info?.reply_count ?? 0;
            const unread = thread.unread_message_count ?? 0;
            const parts: string[] = [];
            if (replyCount > 0) parts.push(`${replyCount} 条回复`);
            if (unread > 0) parts.push(`${unread} 条未读`);
            parts.push('查看消息功能开发中')
            MessagePlugin.success(parts.length > 0 ? `消息线程：${parts.join('，')}` : '消息线程暂无回复');
        } else {
            MessagePlugin.info('该消息没有回复线程');
        }
    } catch (e: any) {
        console.error('getMessageThread failed:', e);
        MessagePlugin.error(e?.message || '获取消息线程失败');
    }
}

/** 语音转文字 */
async function handleRecognizeSpeech(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;
    try {
        const result = await tdlibSend({
            _: 'recognizeSpeech',
            chat_id: cid,
            message_id: msg.id,
        }) as any;
        if (result && result.text) {
            MessagePlugin.success(`识别结果：${result.text}`);
        } else {
            MessagePlugin.info('无法识别语音内容');
        }
    } catch (e: any) {
        console.error('recognizeSpeech failed:', e);
        MessagePlugin.error(e?.message || '语音识别失败');
    }
}

/** 举报消息（弹出举报原因选择器） */
async function handleReportMessage(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;
    try {
        await confirmReportMessage({ chatId: cid, msg });
        MessagePlugin.success('已举报');
    } catch (e: any) {
        if (e?.message !== 'canceled') {
            console.error('reportChat failed:', e);
            MessagePlugin.error(e?.message || '举报失败');
        }
    }
}

/** 构建消息右键菜单项（开发环境附带“复制消息原始 JSON”）。
 * 权限已在打开前通过 getMessageProperties 获取完毕，此处仅作纯同步渲染。
 */
function buildMessageContextMenu(msg: message): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    const isService = isServiceMessage(msg);
    const cid = chatId.value;

    // —— 阅读状态（信息项，不可点击）——
    if (pendingReadDateLabel) {
        items.push({
            key: 'read-status',
            label: pendingReadDateLabel,
            disabled: true,
        });
        items.push({ key: 'divider-read', label: '', divider: true });
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

    // —— 引用回复（仅当用户已拖动选中了该消息内容的一段文本时出现）——
    const quotedText = getSelectedQuoteForMessage(msg);
    if (!isService && quotedText && canReplyMessage(msg, cid)) {
        items.push({
            key: 'quote-reply',
            label: '引用回复',
            icon: QuoteIcon,
            onClick: () => startQuoteReply(msg, quotedText),
        });
    }

    // —— 编辑（文本消息编辑内容，媒体消息编辑描述/更换媒体）——
    // 收藏夹（Saved Messages）内不允许编辑；其余以 TDLib can_be_edited 为准
    // （普通消息 MessageProperties.can_be_edited / 快捷回复 quickReplyMessage.can_be_edited）
    if (!isService && !isInSavedMessages.value && canEditMessage(msg, cid)) {
        items.push({
            key: 'edit',
            label: '编辑',
            icon: PencilIcon,
            onClick: () => void startEdit(msg),
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

    // —— 保存到收藏 ——
    if (!isService && canSaveMessage(msg, cid)) {
        items.push({
            key: 'save',
            label: '保存到收藏',
            icon: BookmarkIcon,
            onClick: () => handleSaveMessage(msg),
        });
    }

    // —— 媒体文件：打开目录 / 另存为（仅文件完全下载完成后可用）——
    const mediaFile = getMessageFile(msg);
    if (mediaFile && isFileReady(mediaFile)) {
        items.push({ key: 'divider-file', label: '', divider: true });
        items.push({
            key: 'reveal-in-dir',
            label: '打开目录',
            icon: FolderOpenIcon,
            onClick: () => handleRevealInDir(mediaFile.local.path),
        });
        items.push({
            key: 'save-as',
            label: '另存为',
            icon: DownloadIcon,
            onClick: () => handleMessageSaveAs(mediaFile, getMessageFileName(msg, mediaFile)),
        });
    }

    // —— 翻译 ——
    const msgFormattedText = getMessageFormattedText(msg);
    if (!isService && msgFormattedText && msgFormattedText.text.trim().length > 0) {
        items.push({
            key: 'translate',
            label: '翻译',
            icon: LanguagesIcon,
            onClick: () => openTranslateFor(msg),
        });
    }

    // —— 复制链接 ——
    items.push({
        key: 'copy-link',
        label: '复制链接',
        icon: LinkIcon,
        disabled: !canGetMessageLink(msg, cid),
        onClick: () => copyMessageLink(cid!, msg),
    });

    // —— 查看回应者 ——
    if (!isService && canGetViewers(msg, cid)) {
        items.push({
            key: 'viewers',
            label: '查看回应者',
            icon: EyeIcon,
            onClick: () => handleGetViewers(msg),
        });
    }

    // —— 查看真实作者（频道代发消息） ——
    if (!isService && canGetAuthor(msg, cid)) {
        items.push({
            key: 'author',
            label: '查看真实作者',
            icon: UserCheckIcon,
            onClick: () => handleGetAuthor(msg),
        });
    }

    // —— 查看消息线程（仅当有回复时才显示）——
    if (!isService && canGetMessageThread(msg, cid) && (msg.interaction_info?.reply_info?.reply_count ?? 0) > 0) {
        items.push({
            key: 'thread',
            label: '查看回复',
            icon: MessageSquareIcon,
            onClick: () => handleGetMessageThread(msg),
        });
    }

    // —— 语音转文字 ——
    if (!isService && canRecognizeSpeech(msg, cid)) {
        items.push({
            key: 'recognize-speech',
            label: '语音转文字',
            icon: AudioLinesIcon,
            onClick: () => handleRecognizeSpeech(msg),
        });
    }

    // —— 举报 ——
    if (!isService && canReportMessage(msg, cid)) {
        items.push({
            key: 'report',
            label: '举报',
            icon: FlagIcon,
            danger: true,
            onClick: () => handleReportMessage(msg),
        });
    }

    // —— 置顶 / 取消置顶 ——
    const canPin = !isService && canPinMessage(msg, cid);
    // —— 删除（打开精确权限确认弹窗） ——
    const canDelete = !isService && cid !== undefined && canDeleteMessage(msg, cid);

    // 管理类操作（置顶/删除）：仅在确有至少一项时才插入【分隔线 + 这些项】，
    // 避免留出悬空的空槽/分隔线。
    if (canPin || canDelete) {
        // 分隔线
        items.push({ key: 'divider-1', label: '', divider: true });

        if (canPin) {
            if (msg.is_pinned) {
                items.push({
                    key: 'pin',
                    label: '取消置顶',
                    icon: PinIcon,
                    onClick: async () => {
                        await toggleMessagePinned(cid!, msg);
                    },
                });
            } else {
                items.push({
                    key: 'pin',
                    label: '置顶',
                    icon: PinIcon,
                    onClick: async () => {
                        await openPinConfirm(msg);
                    },
                });
            }
        }

        if (canDelete) {
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

    // 复制消息原始 JSON（调试用，由「开发者选项」设置页开关控制）
    if (showCopyJsonInMenus.value) {
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

/**
 * 打开「置顶」确认弹窗。
 * - 频道：无可选，直接置顶；
 * - 私聊：弹窗询问是否为对方置顶（对应 pinChatMessage.only_for_self）；
 * - 群组：弹窗询问是否通知群成员（对应 pinChatMessage.disable_notification）。
 */
async function openPinConfirm(msg: message) {
    const cid = chatId.value;
    if (cid === undefined) return;

    const t = chat.value?.type;
    const isChannel = t?._ === 'chatTypeSupergroup' && t.is_channel;
    const isPrivate = t?._ === 'chatTypePrivate' || t?._ === 'chatTypeSecret';
    const isGroup =
        t?._ === 'chatTypeBasicGroup' ||
        (t?._ === 'chatTypeSupergroup' && !t.is_channel);

    // 频道（或无法识别类型）：无可选，直接置顶
    if (isChannel || (!isPrivate && !isGroup)) {
        await pinMessage(cid, msg);
        return;
    }

    const scope: 'private' | 'group' = isPrivate ? 'private' : 'group';

    try {
        const result = await confirmPinMessage({ chatId: cid, msg, scope });
        if (scope === 'private') {
            await pinMessage(cid, msg, { onlyForSelf: !result.pinForOther });
        } else {
            await pinMessage(cid, msg, { disableNotification: !result.notifyMembers });
        }
    } catch {
        // 用户取消，忽略
    }
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

    // 自己发的消息不可封禁/删除自己全部。
    // 私聊/群组里自己发送的 sender 是本人 user；频道里自己发送的消息
    // sender 是 messageSenderChat（发送者为频道本身），需用 is_outgoing 判断：
    // 当前账号发送的消息 is_outgoing 为 true。
    const sentByMe =
        (sender._ === 'messageSenderUser' && sender.user_id === myId.value) ||
        msg.is_outgoing === true;
    if (sentByMe) {
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

/** 消息发送者（用户类型）的 user_id；其他类型发送者（频道等）返回 undefined */
function senderUserIdOf(msg: message): number | undefined {
    const s = msg.sender_id;
    return s?._ === 'messageSenderUser' ? s.user_id : undefined;
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

/** 转发来源头像（频道/群组/用户；隐藏来源为 undefined） */
const getForwardPhoto = (forwardInfo: messageForwardInfo): chatPhotoInfo | profilePhoto | undefined =>
    computeForwardPhoto(forwardInfo, senderCaches());

/** 转发来源头像底色 accent id（无照片时用于头像渐变背景） */
const getForwardAccentId = (forwardInfo: messageForwardInfo): number | undefined =>
    computeForwardProfileAccentId(forwardInfo, senderCaches());

/** 转发原始作者签名（频道帖子 / 匿名群管），用于「来源名 (原始作者)」括号内 */
const getForwardOriginalName = (forwardInfo: messageForwardInfo): string | undefined => {
    const sig = computeForwardAuthorSignature(forwardInfo)?.trim();
    if (!sig) return undefined;
    // 与来源名相同时不再重复展示
    return sig === computeForwardName(forwardInfo, senderCaches()) ? undefined : sig;
};

/** 转发横幅文字色：取发送者 accent 色字符串（自绘消息由 ForwardBanner 自处理浅色） */
const forwardTextColor = (msg: message): string | undefined => {
    if (isSelf(msg)) return undefined;
    return senderNameColor(msg).color;
};

const getDisplayAuthorSignature = (msg: message): string | undefined =>
    getDisplayAuthorSignatureOf(msg);

const getInlineKeyboard = (msg: message): replyMarkupInlineKeyboard | undefined =>
    getInlineKeyboardOf(msg);

const isSavedForwardedMessage = (msg: message): boolean =>
    computeIsSavedForwardedMessage(msg, { chat: chat.value, myId: myId.value, users: users.value, chats: chats.value });

const getDisplaySenderName = (msg: message): string =>
    computeDisplaySenderName(msg, senderDeps());

const showSenderDisplayName = (msg: message): boolean =>
    computeShowSenderDisplayName(msg, senderDeps());

/** 消息通过内联机器人发送的 `via @bot` 文本（无则空串） */
const getViaBotText = (msg: message): string =>
    computeViaBotText(msg, senderCaches());

const getDisplaySenderPhoto = (msg: message): chatPhotoInfo | profilePhoto | undefined =>
    computeDisplaySenderPhoto(msg, senderDeps());

/** 展示发送者是否已删除账户（用于头像显示删除图标） */
const getDisplaySenderDeleted = (msg: message): boolean =>
    computeDisplaySenderDeleted(msg);

/**
 * 判断消息发送者是否可点击进入资料页。
 * 支持两类发送者：用户（messageSenderUser）与频道/群组身份（messageSenderChat）。
 * 马甲身份发送的消息其 sender 可能是频道（messageSenderChat），此时点击也应跳转到对应频道。
 */
const canOpenSenderProfile = (msg: message): boolean => {
    const sid = msg.sender_id;
    if (!sid) return false;
    if (sid._ === 'messageSenderUser') return true;
    if (sid._ === 'messageSenderChat') return true;
    return false;
};

/**
 * 点击消息发送者（头像/名称）→ 跳转到对应资料页：
 * - 用户发送者（messageSenderUser）→ 用户资料页
 * - 频道/群组身份（messageSenderChat，含马甲发送）→ 频道/群组资料页
 */
async function openSenderProfile(msg: message) {
    const sid = msg.sender_id;
    if (!sid) return;
    if (sid._ === 'messageSenderUser') {
        // 发送者是自己时也打开自己的资料页
        router.push({ name: 'user-profile', params: { id: String(sid.user_id) } });
    } else if (sid._ === 'messageSenderChat') {
        router.push({ name: 'chat-profile', params: { id: String(sid.chat_id) } });
    }
}

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
const isSelfAlbum = (item: AlbumDisplayItem) => isSelfAlbumOf(item, isSelf);

/** 相册是否为「当前账号发送」（用于发送状态展示，与对齐无关） */
const isOutgoingAlbum = (item: AlbumDisplayItem) => isOutgoingMsg(item.messages[0]);

// ==================== 权限 ====================
const currentMemberStatus = computed<ChatMemberStatus | undefined>(() =>
    getCurrentMemberStatus(chat.value, groupCaches())
);

// ===== 表情包面板状态同步（依赖 currentMemberStatus / isMePremium，故放在权限定义之后） =====
watch(
    () => [chat.value?.id, currentMemberStatus.value, isMePremium.value],
    () => {
        const st = stickerPanelState.value;
        st.chat = chat.value;
        st.isPremium = isMePremium.value;
        // emoji 受 can_send_basic_messages（能发文本即可用 emoji）；
        // 贴纸 / GIF 受 can_send_other_messages；频道中只要有发送消息权限即全部放行。
        st.canSendBasic = chat.value
            ? canSendEmojiRightsOf(chat.value, currentMemberStatus.value, groupCaches())
            : true;
        st.canSendOther = chat.value
            ? canSendStickerGifRightsOf(chat.value, currentMemberStatus.value, groupCaches())
            : true;
        st.onPickEmoji = insertEmojiIntoInput;
        st.onPickCustomEmoji = insertCustomEmojiIntoInput;
        st.onPickSticker = sendSticker;
        st.onPickAnimation = sendAnimation;
    },
    { immediate: true },
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

// ==================== Inline Keyboard Refresh ====================
// InlineKeyboard 组件通过 defineExpose 暴露 resetLock()。
// 消息发生更新（内容编辑 / reply_markup 变化）后，回调期间的按钮锁定可能已失效：
// 按钮文本可能被更新，或该按钮已在下一次更新中被移除。
// 由本级（持有消息数据的一方）在收到 updateMessageContent / updateMessageEdited 时，
// 找到对应的 InlineKeyboard 组件实例并调用 resetLock() 刷新锁定状态。
const keyboardRefs = new Map<number, { resetLock: () => void }>();

function registerKeyboardRef(messageId: number) {
    return (el: unknown) => {
        if (el) keyboardRefs.set(messageId, el as { resetLock: () => void });
        else keyboardRefs.delete(messageId);
    };
}

/** 消息更新后刷新该消息的内联键盘锁定状态 */
function refreshKeyboardLock(messageId: number) {
    keyboardRefs.get(messageId)?.resetLock();
}

/**
 * “跳到底部”按钮：先加载真正的底部（最新消息）再滚动过去。
 * 列表与真正的聊天底部之间可能存在断层（gap）——普通模式打开有未读的频道时，
 * 初始窗口只覆盖锚点后约 30 条更新消息；跳转模式则只有目标附近一个窗口。
 * 若仅设置 scrollTop=scrollHeight，只会落在已加载窗口的底部，到不了真正的最新消息，
 * 且下方未加载的消息不会被标记已读（未读数残留）。
 * 因此统一先以 from_message_id=0 拉取最新消息补上缺口，跳转模式再退出跳转，然后滚到底部。
 */
const handleScrollToBottom = async () => {
    showScrollButton.value = false;
    newMessageCount.value = 0;

    const gen = loadGeneration;
    const loadChat = chatId.value;
    if (!loadChat) {
        scrollToBottom();
        return;
    }
    isLoadingMore.value = true;
    let foundGap = false;
    try {
        // 从最新消息（from_message_id=0）开始加载真正的底部
        const newest = await fetchMessages(loadChat, 0, 60, 0, gen);
        if (!isGenerationValid(gen) || chatId.value !== loadChat) return;
        if (newest.length > 0) {
            const existingIds = new Set(messages.value.map(m => m.id));
            const unique = newest.filter(m => !existingIds.has(m.id));
            if (unique.length > 0) {
                // newest 已是 旧→新 且比现有列表更新，追加到末尾
                appendMessages(unique);
                foundGap = true;
            }
        }
        // 已具备真正底部
        if (historyMode.value === 'jump') {
            // 退出跳转模式，避免在断层处反复向下加载
            historyMode.value = 'normal';
            jumpOlderExhausted.value = false;
            jumpNewerExhausted.value = false;
        }
        // 若本次补上了缺口，则允许后续向下滚动继续加载其余未加载消息
        isHistoryExhausted.value = false;
        if (foundGap) isNewerExhausted.value = false;
    } finally {
        isLoadingMore.value = false;
    }
    await nextTick();
    scrollToBottom();
    // 媒体懒加载后二次校准
    setTimeout(scrollToBottom, 200);
};
</script>
<style scoped>
.chat-wallpaper-layer,
.chat-wallpaper-overlay {
    z-index: 0;
}

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
    transform: translateY(8px);
}
</style>
<style>
.messages-scroll {
    min-height: 0;
}

.mi-fade-enter-active,
.mi-fade-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.mi-fade-enter-from,
.mi-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

/* 消息区默认不可选中（继承全局 user-select:none）；只有「消息正文 text」和
   「媒体描述 caption」通过 .msg-selectable-text 显式开放为可选中复制。
   发送者名称、时间、观看数、时长等装饰信息保持不可选中。 */
.messages-scroll,
.messages-scroll [data-bubble-msg-id] {
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
}

/* 正文 / 媒体描述（MessageTextContent 根 <p> 上的专用类）及其内部链接、代码等
   显式可选中复制。 */
.messages-scroll [data-bubble-msg-id] .msg-selectable-text,
.messages-scroll [data-bubble-msg-id] .msg-selectable-text * {
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
    user-select: text !important;
}

/* 正文内的装饰性元素（内嵌时间、代码块头部复制按钮等）仍保持不可选中，
   覆盖上面 .msg-selectable-text * 的统一开放选择，避免与正文选择混淆。 */
.messages-scroll [data-bubble-msg-id] .msg-selectable-text .msg-noselect,
.messages-scroll [data-bubble-msg-id] .msg-selectable-text .msg-noselect *,
.messages-scroll [data-bubble-msg-id] .msg-noselect,
.messages-scroll [data-bubble-msg-id] .msg-noselect * {
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
}

/* 发送者名称（含内部 button）始终不可选中：覆盖全局 button { user-select: text }，
   确保框选 / 复制消息正文时不会把用户名称一并选中。 */
.messages-scroll .msg-sender-name,
.messages-scroll .msg-sender-name * {
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
}

/* Telegram-like bubble style: text should wrap nicely */
.messages-scroll [data-bubble-msg-id] {
    word-break: break-word;
    line-height: 1.4;
}
</style>
