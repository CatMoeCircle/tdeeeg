<template>
    <!-- 全屏显示壁纸时默认壁纸由 HomeView 底层统一绘制；此处仅在会话有专属背景、
         或关闭全屏后需要自己铺默认壁纸时叠一层 -->
    <div class="h-full relative overflow-hidden chat-wallpaper-root" :style="rootStyle">
        <ChatBackgroundLayers v-if="drawsOwnWallpaper" :render="render" :overlay-opacity="overlayOpacity"
            :blur-px="blurPx" />
        <!-- ===== Messages Area (底层，穿透 header/footer) ===== -->
        <!--
          骨架屏作为遮罩叠在列表上：消息容器在首屏数据到达后即挂载（可测量/可滚动），
          但在 listRevealed 前保持 opacity:0，避免「先露出一批再跳到已读/未读锚点」的闪跳。
          z-index 必须低于 Header / 置顶栏 / 输入框（均为 z-10 且 DOM 更靠后），
          否则骨架气泡会盖在顶栏、置顶菜单和输入框上方。
        -->
        <MessageListSkeleton v-if="showSkeleton" :top-padding="topPaddingClass" :tag-pad="tagBarMessagePadStyle"
            :bottom-pad="messagesBottomPad" />

        <!-- Messages：始终挂载，定位完成前不可见 -->
        <div ref="messagesContainer"
            class="absolute inset-0 z-10 overflow-y-auto custom-scrollbar flex flex-col messages-scroll"
            data-no-smooth-wheel
            :style="[topPaddingClass, tagBarMessagePadStyle, messagesContainerStyle, { paddingBottom: messagesBottomPad }]"
            @scroll.passive="onScroll">

            <!-- 消息列表容器：mt-auto 将消息推到底部 -->
            <div class="mt-auto flex flex-col">
                <template v-for="item in messageItems" :key="item.key">
                    <!-- Date separator -->
                    <div v-if="item.type === 'date'" class="msg-list-item flex justify-center my-2" :data-sticky-key="item.key">
                        <span
                            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full leading-none select-none">
                            {{ item.text }}
                        </span>
                    </div>

                    <!-- Unread separator -->
                    <div v-else-if="item.type === 'unread'" class="msg-list-item flex items-center gap-3 my-3" :data-unread-sep="item.key"
                        :aria-label="t('lng_unread_bar_some')">
                        <div class="h-px flex-1 bg-blue-400/70 dark:bg-blue-500/70"></div>
                        <span class="text-xs font-medium text-blue-500 dark:text-blue-400 select-none">{{ t('lng_unread_bar_some') }}</span>
                        <div class="h-px flex-1 bg-blue-400/70 dark:bg-blue-500/70"></div>
                    </div>

                    <!-- Album group -->
                    <template v-else-if="item.type === 'album'">
                        <div :data-msg-id="item.messages[0].id" class="msg-list-item" :class="{
                            'animate-message-in': isNewMessage(item.messages[0].id),
                            'msg-leaving': leavingMessageIds.has(item.messages[0].id),
                            'animate-flash-highlight': highlightedMessageId === item.messages[0].id,
                        }" v-context-menu="selectionMode ? null : makeMsgMenu(item.messages[0])"
                            @animationend="onMessageAnimEnd($event, item.messages[0].id)">
                            <div class="flex mb-2" :class="isSelfAlbum(item) ? 'justify-end' : 'justify-start'">
                                <div v-if="selectionMode"
                                    class="self-center shrink-0 mr-1 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer select-none"
                                    :class="isAlbumSelected(item.messages) ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'"
                                    @click.stop="toggleSelectAlbum(item.messages)">
                                    <CheckIcon v-if="isAlbumSelected(item.messages)"
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
                                            :first-name="getDisplaySenderNames(item.messages[0]).first"
                                            :last-name="getDisplaySenderNames(item.messages[0]).last"
                                            :accentColorId="getDisplaySenderProfileAccentId(item.messages[0])"
                                            :deletedAccount="getDisplaySenderDeleted(item.messages[0])" />
                                    </button>
                                </div>
                                <div class="flex min-w-0 max-w-[70%] flex-col"
                                    :class="isSelfAlbum(item) ? 'items-end' : 'items-start'">
                                    <!-- 文件相册与图片宫格保持相近的固定宽度（MessageAlbum 的 ALBUM_W = 340） -->
                                    <div :class="[
                                        isFileAlbumItem(item) ? 'w-[340px] min-w-30' : 'w-min',
                                        'max-w-full overflow-hidden',
                                        isAlbumBubbleless(item)
                                            ? ''
                                            : [
                                                'shadow-sm',
                                                isSelfAlbum(item)
                                                    ? 'text-gray-900'
                                                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                                            ]
                                    ]"
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
                                            :first-name="getForwardNames(item.messages[0].forward_info).first"
                                            :last-name="getForwardNames(item.messages[0].forward_info).last"
                                            :photo="getForwardPhoto(item.messages[0].forward_info)"
                                            :accent-id="getForwardAccentId(item.messages[0].forward_info)"
                                            :navigable="canNavigateForward(item.messages[0].forward_info)"
                                            :self="isSelfAlbum(item)" :text-color="forwardTextColor(item.messages[0])"
                                            media-inline
                                            @open-source="openForwardSource(item.messages[0].forward_info)" />
                                        <MessageAlbum :messages="item.messages" :isSelf="isOutgoingAlbum(item)"
                                            :chatId="chatId" :topicId="topicId"
                                            :commentsBar="!!albumCommentsMsg(item.messages)"
                                            :isRead="isMessageRead(item.messages[item.messages.length - 1])"
                                            :authorSignature="getDisplayAuthorSignature(item.messages[0])"
                                            :selectionMode="selectionMode"
                                            :selectedIds="selectedMsgIds"
                                            @toggle-select="toggleSelectMsgById"
                                            @message-context-menu="onAlbumMessageContextMenu">
                                            <!-- 回应放在内容与时间/观看量之间：
                                                 文件相册始终走组件内 slot（无 caption 也固定在文件下面）；
                                                 图片/视频相册仅在带 caption 时使用气泡内 slot -->
                                            <template
                                                v-if="hasReactions(item.messages[0]) && (albumHasVisibleCaption(item.messages) || isFileAlbumItem(item))"
                                                #reactions>
                                                <ReactionsBar class="pl-2" :msg="item.messages[0]"
                                                    :isSelf="isSelfAlbum(item)"
                                                    @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.messages[0], type)" />
                                            </template>
                                        </MessageAlbum>
                                        <!-- 图片/视频相册无 caption 时：回应在评论条之前（文件相册的回应已放在组件内时间上方） -->
                                        <ReactionsBar class="w-full"
                                            v-if="hasReactions(item.messages[0]) && !albumHasVisibleCaption(item.messages) && !isFileAlbumItem(item)"
                                            :msg="item.messages[0]" :isSelf="isSelfAlbum(item)"
                                            @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.messages[0], type)" />
                                        <!-- 频道评论条（相册）：无可见 caption 时白条承接相册底部（相册下缘由 commentsBar 压平），
                                             有 caption 时回应 / 时间在相册根内，此处即气泡最底部 -->
                                        <MessageCommentsBar v-if="albumCommentsMsg(item.messages)"
                                            class="px-2"
                                            :class="albumHasVisibleCaption(item.messages) ? 'pt-2.5 pb-2.5' : 'py-2.5 bg-white dark:bg-gray-800'"
                                            :msg="albumCommentsMsg(item.messages) || item.messages[0]"
                                            @open="openCommentsThread(albumCommentsMsg(item.messages) || item.messages[0])" />
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
                        <div :data-msg-id="item.msg.id" class="msg-list-item" :class="{
                            'animate-message-in': isNewMessage(item.msg.id),
                            'msg-leaving': leavingMessageIds.has(item.msg.id),
                            'animate-flash-highlight': highlightedMessageId === item.msg.id,
                            'relative': selectionMode && !isServiceMessage(item.msg)
                        }" :style="selectionMode && !isServiceMessage(item.msg) ? { border: '2px solid ' + (isMsgSelected(item.msg.id) ? '#3b82f6' : 'transparent'), borderRadius: '0.5rem' } : {}"
                            v-context-menu="selectionMode ? null : makeMsgMenu(item.msg)"
                            @click="selectionMode && toggleSelectMsg(item.msg)"
                            @animationend="onMessageAnimEnd($event, item.msg.id)">
                            <div v-if="isServiceMessage(item.msg)" class="relative flex justify-center my-0.5">
                                <MessageContent :content="item.msg.content" :date="item.msg.date"
                                    :senderName="getServiceSenderName(item.msg)"
                                    :senderUserId="senderUserIdOf(item.msg)" :isSelf="isOutgoingMsg(item.msg)"
                                    :messageList="messages" :chatId="chatId" :messageId="item.msg.id"
                                    :message="item.msg" @jumpToMessage="handleReplyJumpToMessage" />
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
                                            :first-name="getDisplaySenderNames(item.msg).first"
                                            :last-name="getDisplaySenderNames(item.msg).last"
                                            :accentColorId="getDisplaySenderProfileAccentId(item.msg)"
                                            :deletedAccount="getDisplaySenderDeleted(item.msg)" />
                                    </button>
                                </div>
                                <div class="flex min-w-0 max-w-[70%] flex-col"
                                    :class="isSelf(item.msg) ? 'items-end' : 'items-start'">
                                    <div :data-bubble-msg-id="item.msg.id" v-bubble-size
                                        :data-no-bubble-anim="item.msg.content._ === 'messageVideoNote' ? '' : null" :class="[
                                        isMediaMessage(item.msg)
                                            ? [
                                                'w-fit max-w-full min-w-0 overflow-hidden',
                                                isBubblelessMedia(item.msg) ? '' : 'shadow-sm'
                                            ]
                                            : isStandaloneMessage(item.msg)
                                                ? 'relative max-w-full'
                                                : 'px-2 py-1.5 shadow-sm max-w-full min-w-30',
                                        !isStandaloneMessage(item.msg) && isBubblelessMedia(item.msg)
                                            ? ''
                                            : !isStandaloneMessage(item.msg) && isSelf(item.msg)
                                                ? 'text-gray-900'
                                                : !isStandaloneMessage(item.msg)
                                                    ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                                                    : '',
                                        canSummarizeBubble(item.msg) ? 'relative' : ''
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
                                            :first-name="getForwardNames(item.msg.forward_info).first"
                                            :last-name="getForwardNames(item.msg.forward_info).last"
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
                                            :forwardFirstName="getDisplayForwardInfo(item.msg) ? getForwardNames(getDisplayForwardInfo(item.msg)!).first : undefined"
                                            :forwardLastName="getDisplayForwardInfo(item.msg) ? getForwardNames(getDisplayForwardInfo(item.msg)!).last : undefined"
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
                                            :commentsBar="showChannelCommentsBar(item.msg)"
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
                                            <!-- 媒体 caption：译文放在回应与时间之间（named slot → MessageMediaContent #translation），
                                                 与普通消息一致（译文在时间上方）；媒体气泡无内边距，补 px-2 pb-1.5 对齐普通气泡。
                                                 仅 inline 模式渲染附加块；popup 的全部翻译与 replace 均由正文原位顶替 -->
                                            <template
                                                v-if="isMediaMessage(item.msg) && isTranslateInlineBlockDisplay()"
                                                #translation>
                                                <div v-if="getInlineTranslation(chatId ?? 0, item.msg.id)" class="px-2 pb-1.5">
                                                    <InlineTranslation
                                                        :chat-id="chatId ?? 0" :message-id="item.msg.id"
                                                        :text="getMessageFormattedText(item.msg)"
                                                        :compact="getInlineTranslation(chatId ?? 0, item.msg.id)?.source === 'viewport'" />
                                                </div>
                                            </template>
                                        </MessageContent>
                                        <!-- 频道评论条（评论线程行）：无气泡媒体紧跟媒体本体，
                                             白条直接承接媒体底部（媒体下缘由 commentsBar 压平），回应行再往下 -->
                                        <MessageCommentsBar v-if="showChannelCommentsBar(item.msg) && isBubblelessMedia(item.msg)"
                                            class="bg-white px-2 py-2.5 dark:bg-gray-800"
                                            :msg="item.msg" @open="openCommentsThread(item.msg)" />
                                        <!-- 内联翻译（非媒体）：在原消息气泡中显示译文；气泡容器自带 px-2 py-1.5 -->
                                        <InlineTranslation
                                            v-if="!isMediaMessage(item.msg) && getInlineTranslation(chatId ?? 0, item.msg.id)"
                                            :chat-id="chatId ?? 0" :message-id="item.msg.id"
                                            :text="getMessageFormattedText(item.msg)"
                                            :compact="getInlineTranslation(chatId ?? 0, item.msg.id)?.source === 'viewport'" />
                                        <!-- 纯媒体（无 caption）：回应放在气泡外面，自己靠右、他人靠左 -->
                                        <ReactionsBar class="w-full"
                                            v-if="isMediaMessage(item.msg) && !hasMediaCaption(item.msg) && hasReactions(item.msg)"
                                            :msg="item.msg" :isSelf="isSelf(item.msg)"
                                            @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.msg, type)" />
                                        <span
                                            v-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && !isInlineTimeMessage(item.msg) && !isOutgoingMsg(item.msg)"
                                            class="block text-right text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-none">
                                            <MessageStatus :date="item.msg.date" :isOutgoing="false"
                                                :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                                :viewCount="item.msg.interaction_info?.view_count"
                                                :authorSignature="getDisplayAuthorSignature(item.msg)"
                                                :isTranslated="isShowingTranslation(item.msg)" />
                                        </span>
                                        <span
                                            v-else-if="!isMediaMessage(item.msg) && !isStandaloneMessage(item.msg) && !isInlineTimeMessage(item.msg) && isOutgoingMsg(item.msg)"
                                            class="block text-right text-[11px] text-gray-700/70 mt-0.5 leading-none">
                                            <MessageStatus :date="item.msg.date" :isOutgoing="true"
                                                :sendingState="item.msg.sending_state" :isRead="isMessageRead(item.msg)"
                                                :viewCount="item.msg.interaction_info?.view_count"
                                                :authorSignature="getDisplayAuthorSignature(item.msg)"
                                                :isTranslated="isShowingTranslation(item.msg)" />
                                        </span>
                                        <!-- 频道评论条：文本 / 带 caption 媒体放气泡最底部。
                                             文本气泡有 px-2，出血靠外层 div 的 -mx-2（button 自身负 margin 拉不宽）；
                                             分隔线贯通气泡宽度 -->
                                        <div v-if="showChannelCommentsBar(item.msg) && !isBubblelessMedia(item.msg)"
                                            :class="isMediaMessage(item.msg) ? '' : '-mx-2 mt-1'">
                                            <MessageCommentsBar class="px-2 pt-2.5"
                                                :class="isMediaMessage(item.msg) ? 'pb-2.5' : 'pb-1'"
                                                :msg="item.msg" @open="openCommentsThread(item.msg)" />
                                        </div>
                                    </div>
                                    <!-- 圆形视频（独立消息）：回应放在视频下方，自己靠右、他人靠左 -->
                                    <ReactionsBar
                                        v-if="item.msg.content._ === 'messageVideoNote' && hasReactions(item.msg)"
                                        :msg="item.msg" :isSelf="isSelf(item.msg)"
                                        @toggle-reaction="(type: ReactionType) => toggleReaction(chatId!, item.msg, type)" />
                                    <InlineKeyboard v-if="getInlineKeyboard(item.msg)" class="mt-1 w-full"
                                        :ref="registerKeyboardRef(item.msg.id)"
                                        :rows="getInlineKeyboard(item.msg)!.rows" :chat-id="chatId"
                                        :message-id="item.msg.id" />
                                </div>
                                <!-- 消息右侧小按钮：转文字（语音 / 圆形视频）、评论（频道圆形视频） -->
                                <MessageSideActions :msg="item.msg" @comments="openCommentsThread(item.msg)" />
                            </div>
                        </div>
                    </template>

                    <!-- 评论线程分隔（DiscussionStarted/NoComments 服务消息）：
                         紧跟根帖副本之后、评论之前；0 评论时显示「暂无留言」 -->
                    <div v-if="threadMode && isThreadRootItem(item)" class="msg-list-item flex justify-center my-2">
                        <span
                            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full leading-none select-none">
                            {{ threadHasComments ? t('lng_replies_discussion_started') : t('lng_replies_no_comments') }}
                        </span>
                    </div>
                </template>

                <div class="shrink-0 h-4"></div>
            </div>
        </div>
        <!-- 向更旧方向加载指示器：浮层，不进滚动流。
             若作为滚动内容首个子节点，出现/消失会改 scrollHeight，贴顶时把内容顶起再落下。 -->
        <div v-if="isLoadingMore && loadingDirection === 'older'"
            data-loading-older
            class="absolute left-0 right-0 z-20 text-center text-gray-400 text-sm py-3 pointer-events-none"
            :style="[topPaddingClass, tagBarMessagePadStyle]">
            {{ t('lng_context_seen_loading') }}
        </div>
        <!-- ===== Header（顶层，磨砂玻璃） ===== -->
        <div class="absolute top-0 left-0 right-0 z-10" :class="topicLayoutAnim ? 'topic-chrome-anim' : ''"
            :style="tagBarSideInsetStyle">
            <ChatDetailHeader :chat="chat" :topic="isDirectMessagesChat ? undefined : topic"
                :dm-topic="dmHeaderTopic" :showBack="showBackBtn" @back="handleBack"
                @openInfo="handleTopClick" @search="openSearch"
                :show-topic-tag-toggle="showTopicPanel" :topic-tag-position="topicTagPosition"
                :show-translate-entry="canReopenChatTranslateBar" @show-translate-bar="reopenChatTranslateBar"
                @toggle-topic-tag-position="toggleTopicTagPosition" />
        </div>

        <!-- ===== 话题标签栏（话题模式 / 论坛群组） =====
             right/left：图片样式侧栏；top：悬浮在 Header 与置顶栏中间；bottom：悬浮在输入条上方 -->
        <!-- ===== 话题标签栏（tag 栏话题模式）
             位置切换动画由 TopicTagBar 根节点 data-pos 驱动的 CSS keyframes 完成
             （不用 Vue Transition，避免 out-in 卡死导致元素不再挂载） ===== -->
        <TopicTagBar v-if="showTopicPanel && chatId !== undefined" :chat-id="chatId" :topic-id="topicId"
            :position="topicTagPosition" :top-offset="4" :bottom-offset="76" :data-pos="topicTagPosition"
            :is-dm="isDirectMessagesChat" @select="onTopicTagSelect" />

        <!-- ===== 消息搜索栏（覆盖 Header） ===== -->
        <SearchBar v-if="searchActive && chatId !== undefined" :chat-id="chatId" :topic-id="topicId" :chat="chat"
            :is-dm="isDirectMessagesChat" :initial-query="hashtagSearchQuery" @close="searchActive = false"
            @jump="handleReplyJumpToMessage" />

        <!-- ===== 顶置消息栏 + 音乐播放器 + 全部翻译栏（合并同一顶部栈） ===== -->
        <!-- PinnedMessageBar 必须始终挂载：visibleChange 是 showTopCard 的唯一来源，
             用 v-if(showTopCard) 包住会导致永远不渲染。
             全部翻译栏与置顶/播放器贴合为同一圆角卡片（border-t 分区，与播放器一致）。 -->
        <div class="absolute inset-x-0 z-10 flex justify-center pointer-events-none"
            :class="[topStackVisible ? '' : 'hidden', topicLayoutAnim ? 'topic-chrome-anim' : '']"
            :style="[topStackTopStyle, tagBarSideInsetStyle]">
            <div class="w-full px-3 relative">
                <!-- 必须用 v-show 保持 PinnedMessageBar 挂载：visibleChange 是 showTopCard 的来源，
                     用 v-if 会形成「不显示 → 不挂载 → 永远无法报告已置顶」的循环。 -->
                <div v-show="showTopCard || showChatTranslateBarUi"
                    class="pointer-events-auto rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                    <PinnedMessageBar bare :chatId="chatId" :refreshToken="pinnedBarRefreshToken"
                        @jumpToMessage="jumpToPinnedMessage" @visibleChange="onPinnedVisibleChange" />
                    <!-- 全部翻译栏：贴合在置顶/播放器底部；单独显示时占满整卡 -->
                    <div v-if="showChatTranslateBarUi"
                        :class="showTopCard ? 'border-t border-gray-100/50 dark:border-gray-700/30' : ''">
                        <ChatTranslateBar attached :chat="chat" :is-premium="isMePremium"
                            :has-automatic-translation="hasAutomaticTranslation"
                            :sample-text="translateSampleText"
                            @translating-change="onChatTranslatingChange" @hide="translateBarHidden = true" />
                    </div>
                </div>
                <!-- 吸顶日期：绝对定位挂在顶栏正下方，不占布局空间；向下滚隐藏、向上滚显示 -->
                <Transition name="mi-fade">
                    <div v-if="stickyDateDisplay"
                        class="absolute inset-x-3 flex justify-center pointer-events-none"
                        :class="topStackHasCard ? 'top-full mt-1' : 'top-1'">
                        <span
                            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/90 dark:bg-gray-800/90 backdrop-blur-sm px-2.5 py-1 rounded-full leading-none select-none shadow-sm">
                            {{ stickyDateDisplay }}
                        </span>
                    </div>
                </Transition>
            </div>
        </div>

        <!-- ===== 胶囊回应选择器（右键菜单上方的独立浮动栏） ===== -->
        <ReactionCapsule />

        <!-- ===== 多选操作栏（多选模式时叠在输入框上方） ===== -->
        <Transition name="multi-bar">
            <SelectionToolbar v-if="selectionMode" :count="selectedMsgIds.length" :max="MAX_SELECTED_MSG_COUNT"
                :can-delete="canDeleteSelected" @close="exitSelectionMode" @forward="openForwardPicker"
                @delete="onDeleteSelected" />
        </Transition>

        <!-- ===== 转发选择器 ===== -->
        <ForwardPicker :visible="forwardPickerVisible" :from-chat-id="chatId ?? 0" :message-ids="forwardMessageIds"
            :messages="forwardMessagesSnapshot" @update:visible="forwardPickerVisible = $event" @done="onForwardDone" />

        <!-- ===== 叠层面板 ===== -->
        <Transition name="overlay-slide">
            <ChatOverlayPanel v-if="showOverlay && chat" :chat="chat" :overlay-user-id="overlayUserId"
                :title="overlayChatTitle" :subtitle="getChatSubtitle()" @profile="openOverlayUserProfile"
                @open-chat="openInNewChat" />
        </Transition>

        <!-- ===== Input Area（顶层，磨砂玻璃） ===== -->
        <div v-if="showAiInput" ref="inputAnchorEl"
            class="absolute bottom-0 left-0 right-0 z-10 dark:from-gray-900/80 dark:via-gray-900/60 to-transparent"
            :class="topicLayoutAnim ? 'topic-chrome-anim' : ''" :style="tagBarSideInsetStyle">
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
                            <p class="text-xs font-semibold text-orange-500">{{ t('lng_theme_edit') }}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ editTargetInfo.text ||
                                t('lng_message_empty') }}
                            </p>
                        </div>
                        <button type="button" :aria-label="t('lng_cancel')"
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
                                {{ editResourceLabel }}
                            </div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {{ editMediaReplacement ? editMediaReplacement.name : (editMediaPreviewSrc ? t('chat.editMediaAttached', { type: editResourceLabel }) :
                                    t('chat.editMediaNoPreview', { type: editResourceLabel }))
                                }}
                            </p>
                            <p v-if="editMediaReplacement" class="text-[11px] text-orange-500">{{ t('chat.editMediaReplaceHint', { type: editResourceLabel }) }}</p>
                        </div>
                        <button type="button"
                            class="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                            @click="pickEditMediaReplacement">
                            {{ t('lng_boost_now_replace') }}
                        </button>
                    </div>
                </div>
            </Transition>
            <!-- 输入框：普通消息输入框 / AI 输入框，在 AI 设置页顶部切换（settings.ai.input）
                 外层 px-3 py-2.5 与 MessageInput 自带的外边距一致：底部留白、左右内缩都对得上。
                 再包一层 ref：消息区的底部留白按**这一块实测高度**算（活动条折叠 / 展开、
                 两种输入框的高度都不一样，写死常量会对不上） -->
            <div ref="inputAreaRef" class="relative z-10">
                <!-- 私聊 AI 接管横幅：这个聊天被用户选中接管时提醒一句（可暂停 / 进设置）。
                     与输入框模式无关：普通输入框和 AI 输入框下都要看得见。 -->
                <div v-if="takeoverCfg" class="mx-3 mt-3 mb-1">
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl border"
                        :class="takeoverRunning
                            ? 'bg-rose-50/80 dark:bg-rose-500/10 border-rose-200/70 dark:border-rose-500/25'
                            : 'bg-gray-100/80 dark:bg-gray-800/60 border-gray-200/70 dark:border-gray-700/50'">
                        <BotIcon class="w-4 h-4 shrink-0"
                            :class="takeoverRunning ? 'text-rose-500' : 'text-gray-400'" />
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-medium truncate"
                                :class="takeoverRunning ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400'">
                                {{ takeoverCfg.mode === 'imitate' ? t('aiTakeover.bannerImitate') : t('aiTakeover.bannerAssistant') }}
                            </p>
                            <p class="text-[11px] truncate"
                                :class="takeoverRunning ? 'text-rose-500/80 dark:text-rose-400/70' : 'text-gray-400'">
                                {{ !aiTakeoverOn ? t('aiTakeover.bannerGlobalOff') : takeoverCfg.enabled ? t('aiTakeover.bannerOn') : t('aiTakeover.bannerPaused') }}
                            </p>
                        </div>
                        <button type="button"
                            class="shrink-0 px-2 py-1 rounded-lg text-[11px] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            @click="toggleTakeoverChat">
                            {{ takeoverCfg.enabled ? t('aiTakeover.pause') : t('aiTakeover.resume') }}
                        </button>
                        <button type="button"
                            class="shrink-0 px-2 py-1 rounded-lg text-[11px] text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                            @click="router.push({ name: 'settings-ai-takeover' })">
                            {{ t('aiTakeover.settings') }}
                        </button>
                    </div>
                </div>
                <div v-if="settings.ai.input === 'ai'" class="px-3 py-2.5">
                    <!-- 只读会话（不可发言的频道 / 群）：AI 照样能读能总结，只是不能在这里发言 -->
                    <p v-if="!canSend"
                        class="mb-2 flex items-start gap-1.5 px-1 text-[12px] leading-4 text-gray-500 dark:text-gray-400">
                        <CircleStopIcon class="w-3.5 h-3.5 shrink-0 mt-px text-amber-500" />
                        <span>{{ t('aiInput.noPostPermission') }}</span>
                    </p>
                    <!-- AI 活动条：用过 AI、有输出 / 工具调用 / 待审核时才在输入框顶部冒出来；
                         没用过 AI 的聊天默认什么都不显示 -->
                    <AiActivityStrip v-if="aiActivityEntries.length > 0 || aiActivityApproval"
                        v-model:expanded="aiStripExpanded"
                        :entries="aiActivityEntries" :approval="aiActivityApproval"
                        @approve="resolveAiActivity(true)" @reject="resolveAiActivity(false)" />
                    <AiPromptBar ref="aiPromptRef" v-model:conversations-open="conversationsOpen"
                        :chat-id="currentChatId()" :usage="aiUsage" :on-attach="pickAiImages" :quote="aiQuote"
                        :busy="aiBusy" @send="onAiPromptSend" @stop="onAiStop"
                        @jump-quote="jumpToAiQuote" @remove-quote="aiQuote = null"
                        @switch-message="settings.ai.input = 'message'" />
                </div>
                <MessageInput v-else-if="canSend" ref="messageInputRef" v-model="messageInput"
                    :reply-target="replyTargetInfo" :edit-target="editTargetInfo" :edit-entities="editSeedEntitiesForInput"
                    :chat="chat" :users="users" :supergroups="supergroups" :basic-groups="basicGroups" :my-id="myId"
                    :member-status="currentMemberStatus" :is-premium="isMePremium" :custom-emojis="pendingCustomEmoji"
                    :current-sender-id="chat?.message_sender_id" :available-senders="availableSenders"
                    :senders-loading="sendersLoading"
                    :placeholder="threadMode ? t('chat.commentPh') : undefined"
                    @clear-reply="clearReply" @clear-edit="cancelEdit" @send="handleSend"
                    @change-sender="handleChangeSender" @sticker="openStickerPanel"
                    @switch-ai="settings.ai.input = 'ai'" />
            </div>

            <!-- 会话管理弹窗：管当前聊天下的 AI 对话（新建 / 打开 / 重命名 / 删除，不看消息）。
                 放在输入框 v-if / v-else 之后：插在两者中间会打断这一对分支 -->
            <AiConversationDialog v-model="conversationsOpen" :chat-id="currentChatId()"
                :items="aiConversationList" :loading="aiConversationsLoading" @create="onConversationCreate"
                @open="onConversationOpen" @rename="onConversationRename" @remove="onConversationRemove" />

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
            <div ref="inputAreaRef" class="relative z-10 flex items-center justify-center p-5">
                <button type="button" :disabled="!canJoinCurrentChat || isJoinPending || joinRequestSent"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-default transition-colors"
                    @click="joinCurrentChat">
                    {{ membershipActionLabel }}
                </button>
            </div>
        </div>

        <!-- ===== 频道私信：未选中话题提示（替代输入框） ===== -->
        <div v-else-if="showDmTopicHint"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-transparent dark:from-gray-900/80 via-transparent dark:via-gray-900/60 to-transparent"
            :style="tagBarSideInsetStyle">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <div ref="inputAreaRef" class="relative z-10 flex items-center justify-center p-5">
                <div
                    class="min-h-12 max-w-[90%] px-5 py-3 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg flex items-center justify-center text-sm font-medium text-gray-500 dark:text-gray-400 text-center">
                    {{ t('chat.selectDmTopic') }}
                </div>
            </div>
        </div>

        <!-- ===== 秘密聊天状态：等待加密 / 已取消（替代输入框） ===== -->
        <div v-else-if="isSecretChat && secretChatNoticeText"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-transparent dark:from-gray-900/80 via-transparent dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <div ref="inputAreaRef" class="relative z-10 flex items-center justify-center p-5">
                <div
                    class="min-h-12 max-w-[90%] px-5 py-3 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg flex items-center justify-center text-sm font-medium text-gray-500 dark:text-gray-400 text-center">
                    {{ secretChatNoticeText }}
                </div>
            </div>
        </div>

        <!-- ===== 只读 ===== -->
        <div v-else-if="showChannelActions"
            class="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-transparent dark:from-gray-900/80 via-transparent dark:via-gray-900/60 to-transparent">
            <div aria-hidden="true"
                class="absolute inset-0 z-0 pointer-events-none backdrop-blur-md mask-[linear-gradient(to_top,black,transparent)]">
            </div>
            <div ref="inputAreaRef" class="relative z-10 flex items-center justify-center gap-3 p-5">
                <button type="button" :disabled="isNotificationTogglePending"
                    class="h-12 min-w-32 px-5 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg text-sm font-medium text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 disabled:opacity-60 disabled:cursor-wait transition-colors"
                    @click="toggleNotifications">
                    {{ notificationsMuted ? t('lng_enable_notifications_from_tray') : t('lng_channel_mute') }}
                </button>
                <!-- AI 输入框入口：这里发不了言，但可以让 AI 读 / 总结，再发到别的聊天 -->
                <button v-if="settings.ai.switchButton" type="button" :title="t('aiInput.switchToAi')"
                    :aria-label="t('aiInput.switchToAi')"
                    class="w-12 h-12 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg flex items-center justify-center text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 transition-colors"
                    @click="settings.ai.input = 'ai'">
                    <SparklesIcon class="w-5 h-5" />
                </button>
                <button v-if="linkedChatId" type="button" :title="t('lng_profile_view_discussion')" :aria-label="t('lng_profile_view_discussion')"
                    class="w-12 h-12 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg flex items-center justify-center text-blue-500 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-gray-800/90 transition-colors"
                    @click="openLinkedChat">
                    <MessageCircleIcon class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- ===== Floating scroll-to-bottom button ===== -->
        <Transition name="fade">
            <ScrollToBottomButton v-if="showScrollButton" :bottom="scrollButtonBottom" :count="newMessageCount"
                :places="newMessageCountPlaces" @click="handleScrollToBottom" />
        </Transition>

        <!-- ===== 全局媒体查看器 ===== -->
        <MediaViewer :visible="viewerVisible" :items="viewerItems" :initial-index="viewerIndex"
            :initial-time="viewerInitialTime" @close="onViewerClose" @jump-to-message="handleViewerJump"
            @forward-message="handleViewerForward" />

        <!-- 贴纸集弹窗已上移到 HomeView（下载面板/内部链接也能打开） -->

        <!-- ===== 删除消息确认弹窗 ===== -->
        <DeleteMessageConfirm />
        <!-- ===== 翻译消息弹窗 ===== -->
        <TranslateMessageModal />
        <!-- ===== 置顶消息确认弹窗 ===== -->
        <PinMessageConfirm />
        <!-- ===== 停止投票确认弹窗 ===== -->
        <StopPollConfirm />
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
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { tdPlural } from '../../../utils/tdLang';
import MessageInput from './MessageInput.vue';
import AiPromptBar from '../../ai/AiPromptBar.vue';
import AiActivityStrip, { type AiActivityEntry, type AiApprovalLine } from '../../ai/AiActivityStrip.vue';
import AiConversationDialog from '../../ai/AiConversationDialog.vue';
import { runAiTurn, cancelAiStream, AiTurnLimitError, type AiActivitySink, type AiTurnPermissions } from '../../../utils/aiChat';
import { setApprovalGate, setApprovalPolicy } from '../../../utils/aiTools/call';
import type { ApprovalDecision, ApprovalRequest } from '../../../utils/aiTools/types';
import { aiProviders, aiProviderReady, loadAiProviders } from '../../../store/aiConfig';
import { aiTakeover, takeoverFor, updateTakeover } from '../../../store/aiTakeover';

/**
 * AI 活动条（输入框顶部那个窄框）的数据：用过 AI 才有内容，有输出 / 工具调用就往 entries 里追加，
 * 写类工具要审核时挂 approval —— 两个都空时活动条整个不显示（默认情况）。
 *
 * 放最前面：setup 里有些 immediate watcher 会同步跑 loadChat() → resetState()，
 * 而 resetState 要读这两个 ref，挂后面会撞上暂时性死区
 * （Cannot access 'aiActivityEntries' before initialization）。
 */
const aiActivityEntries = ref<AiActivityEntry[]>([]);
const aiActivityApproval = ref<AiApprovalLine | null>(null);
/** 输入框是否在跑一轮 AI；当前这轮的中止句柄；挂起中的审核（resolve 即放行 / 拒绝） */
const aiBusy = ref(false);
let aiAbort: AbortController | null = null;
let pendingApproval: ((d: ApprovalDecision) => void) | null = null;

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
import ChatTranslateBar from './ChatTranslateBar.vue';
import GlobalEmojiText from '../../common/GlobalEmojiText.vue';
import MediaViewer from './MessageContent/MediaViewer.vue';
import DeleteMessageConfirm from '../../contextMenu/DeleteMessageConfirm.vue';
import TranslateMessageModal from '../../contextMenu/TranslateMessageModal.vue';
import PinMessageConfirm from '../../contextMenu/PinMessageConfirm.vue';
import StopPollConfirm from '../../contextMenu/StopPollConfirm.vue';
import ReportMessageConfirm from '../../contextMenu/ReportMessageConfirm.vue';
import PinnedMessageBar from './PinnedMessageBar.vue';
import TopicTagBar from './TopicTagBar.vue';
import SearchBar from './SearchBar.vue';
import ReactionsBar from './ReactionsBar.vue';
import MessageCommentsBar from './MessageCommentsBar.vue';
import MessageSideActions from './MessageSideActions.vue';
import ReactionPicker from './ReactionPicker.vue';

import { tdlibSend } from '../../../utils/tdlib';
import { resolveTopicMode } from '../../../utils/topicDisplayMode';
import { buildMessageTopicInput, extractTopicNumber, ensureDmTopic, resolveDmSenderName, getSenderPhoto } from '../../../utils/directMessagesTopics';
import { sendAttachments, sending, type SendAttachmentsResult } from '../../../utils/attachmentSend';
import { withParsedMarkdown } from '../../../utils/sendText';
import { useAttachmentStore } from '../../../store/attachment';
import type { AttachmentItem } from '../../../store/attachment';
import { getForwardNavigationTarget } from '../../../utils/forwardedMessages';

import { MessageCircleIcon, XIcon, CheckIcon, Pencil as PencilIcon, CircleStopIcon, Sparkles as SparklesIcon, Bot as BotIcon } from 'lucide-vue-next';
import { toast } from '../../../utils/toast';
import { useRoute, useRouter } from 'vue-router';
import { computed, watch, ref, shallowRef, markRaw, onMounted, onBeforeUnmount, onUnmounted, nextTick } from 'vue';
import { useUserStore } from '../../../store/user';
import { useAudioPlayerStore } from '../../../store/audioPlayer';
import { clearActiveChatTitleBar } from '../../../store/activeChatTitleBar';
import { chatPaneOrigin } from '../../../store/chatPane';
import { consumeChatNavFromList, isChatPaneSectionPath, isChatRoutePath } from '../../../store/chatNav';
import { storeToRefs } from 'pinia';
import { onTdlibUpdates } from "../../../store/tdlibBus";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { settings } from '../../../store/settings';
import { canSummarizeMessage } from '../../../store/summary';
import {
    aiConversations,
    activeConversation,
    createConversation,
    loadConversations,
} from '../../../store/aiConversations';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useChatWallpaper } from '../../../composables/useChatWallpaper';
import ChatBackgroundLayers from '../ChatBackgroundLayers.vue';
import { useCommandInsert, clearPendingCommand } from '../../../store/commandInsert';
import { useHashtagSearch, clearPendingHashtag } from '../../../store/hashtagSearch';
import { useCustomEmoji } from '../../../store/customEmoji';
import { getMessagePlainText, getMessageFormattedText } from '../../../utils/messageText';
import { applyTerminalFileToMessages, isTerminalFileUpdate } from '../../../utils/messageFileSnapshot';
import {
    withViewportLock,
    holdViewport,
    beginManualAnchor,
    endManualAnchor,
    beginLayoutCompensation,
    compensateLayoutShift,
    type ViewportHold,
} from '../../../utils/viewportLock';
import {
    canEditMessage, editTextMessage, editCaptionMessage,
    editMessageMediaContent,
    toggleReaction,
} from '../../contextMenu/messageActions';
import {
    classifyAttachment,
    buildEditMediaContent,
    allowedEditReplaceKinds,
    resolveEditReplaceKind,
} from '../../../utils/attachmentSend';
import { isSavedMessagesChat } from '../../../utils/savedMessages';
import { hasReactions } from '../../../utils/reactionHelpers';
import {
    getInlineTranslation,
    isChatTranslating,
    requestViewportTranslation,
    isTranslateInlineBlockDisplay,
    canShowChatTranslateBar,
    shouldPromptChatTranslatePremium,
} from '../../../store/translate';

import type { chat, message, user, chatPhotoInfo, profilePhoto, Update, supergroup, basicGroup, messageForwardInfo, replyMarkupInlineKeyboard, ChatMemberStatus, ChatMember, forumTopic, inputTextQuote, sendMessage, $Function, textEntity, textEntity$Input, file as TdFile, ReactionType } from 'tdlib-types';
import { getViewerState, closeMediaViewer, isMediaViewerActive, openMediaViewer } from '../../../store/mediaViewer';

import { getSenderAccentColorId, getSenderProfileAccentColorId, getSenderNameParts, isDeletedChat, DELETED_ACCOUNT_LABEL } from '../../../utils/senderInfo';
import { useColors } from '../../../store/colors';
import { isMediaMessage, isStandaloneMessage, isServiceMessage, isInlineTimeMessage, isBubblelessMediaMessage, albumHasVisibleCaption, isFileAlbum, showChannelCommentsBar } from './composables/messageType';
import { buildDisplayItems } from './composables/messageItems';
import { chatWindowKey, peekChatWindow, saveChatWindow } from './composables/chatWindowCache';
import { completeAlbumMembers, hasIncompleteAlbum } from './composables/albumHistory';
import { useDraft } from './composables/useDraft';
import { useBrowsePosition } from './composables/useBrowsePosition';
import type { BrowsePosition } from './composables/useBrowsePosition';
import { useMessageSelection } from './composables/useMessageSelection';
import { useMessageContextMenu } from './composables/useMessageContextMenu';
import { useStickyDate } from './composables/useStickyDate';
import { useAiConversation } from './composables/useAiConversation';
import MessageListSkeleton from './MessageListSkeleton.vue';
import SelectionToolbar from './SelectionToolbar.vue';
import ScrollToBottomButton from './ScrollToBottomButton.vue';
import ChatOverlayPanel from './ChatOverlayPanel.vue';
import ReactionCapsule from './ReactionCapsule.vue';
import type { DisplayItem, AlbumDisplayItem } from './composables/messageItems';
import {
    bubbleStyle as computeBubbleStyle, albumStyle as computeAlbumStyle,
    messagesStyleCss,
} from './composables/bubbleStyle';
import type { BubbleStyleDeps, BubbleBackgroundDeps } from './composables/bubbleStyle';
import { useCustomBubbleSkin } from '../../../composables/useCustomBubbleSkin';
import {
    getDisplaySenderName as computeDisplaySenderName,
    getDisplaySenderNames as computeDisplaySenderNames,
    getDisplaySenderPhoto as computeDisplaySenderPhoto,
    getDisplaySenderProfileAccentId as computeDisplaySenderProfileAccentId,
    getDisplaySenderDeleted as computeDisplaySenderDeleted,
    getSenderName as computeSenderName,
    getForwardName as computeForwardName,
    getForwardNames as computeForwardNames,
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
import { canDeleteOthersMessages, canRestrictMembers, isGroupChat } from '../../../utils/groupRights';

// ==================== Route ====================
const route = useRoute();
const router = useRouter();
const emit = defineEmits<{
    close: [];
}>();
const props = defineProps<{
    chatId?: number | null;
    topicId?: number | null;
    /** 频道评论线程根帖子的 message id（>0 时进入评论线程视图） */
    threadRootId?: number | null;
}>();

/** 校准残余误差阈值（px）；超过则再纠一次，允许残余，禁止死循环 */
const BROWSE_POS_TOLERANCE_PX = 12;
/** 未读 separator 预留高度（my-3 上下边距 + 行高），首条未读顶对齐时垫在上方 */
const UNREAD_SEP_RESERVE_PX = 40;

const chatId = computed(() => {
    const id = props.chatId ?? route.params.id;
    return id !== undefined && id !== null && id !== '' ? Number(id) : undefined;
});

/** 话题 ID（论坛群组话题模式时存在） */
const topicId = computed(() => {
    const tid = props.topicId ?? route.params.topicId;
    return tid !== undefined && tid !== null && tid !== '' ? Number(tid) : undefined;
});

/**
 * 频道评论线程视图：threadRootMsgId = 频道帖子（线程根）的 message id。
 * 进入后消息列表来自讨论组的 getMessageThreadHistory，发送带 messageTopicThread。
 */
const threadRootMsgId = computed(() => {
    const v = props.threadRootId ?? route.params.threadMsgId;
    const n = v !== undefined && v !== null && v !== '' ? Number(v) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
});
const threadMode = computed(() => threadRootMsgId.value > 0);
/** getMessageThread 结果：讨论组 chat_id、线程 id、根消息副本、评论计数 */
const threadInfo = ref<import('tdlib-types').messageThreadInfo | undefined>(undefined);
/** 线程评论计数信息（头部标题与未读点的数据源，随 updateMessageInteractionInfo 刷新） */
const threadReplyInfo = ref<import('tdlib-types').messageReplyInfo | undefined>(undefined);

/** 线程视图中「当前消息归属的会话」= 讨论组；普通模式 = 当前会话 */
function isActiveChat(cid: number | undefined | null): boolean {
    if (cid === undefined || cid === null) return false;
    if (cid === chatId.value) return true;
    return threadMode.value && threadInfo.value !== undefined && cid === threadInfo.value.chat_id;
}

/** 评论线程头部标题：有评论显示「N 条评论」，无评论显示「评论」（官方词条） */
function threadHeaderTitle(): string {
    const count = threadReplyInfo.value?.reply_count ?? 0;
    return count > 0 ? tdPlural('lng_comments_header', count) : t('lng_comments_header_none');
}

/** 线程是否已有评论（决定根帖下方分隔显示「讨论开始」还是「暂无留言」） */
const threadHasComments = computed(() => (threadReplyInfo.value?.reply_count ?? 0) > 0);

/** 评论线程中某展示项是否为线程根（讨论组内的帖子副本） */
function isThreadRootItem(item: DisplayItem): boolean {
    if (!threadMode.value || !threadInfo.value) return false;
    const rootId = threadInfo.value.message_thread_id;
    if (item.type === 'single') return item.msg.id === rootId;
    if (item.type === 'album') return item.messages.some(m => m.id === rootId);
    return false;
}

/**
 * 发送消息的 topic_id：评论线程 → messageTopicThread（发到讨论组线程）；
 * 否则论坛 / 频道私信原有逻辑。（已实测：线程发送必须 chat_id=讨论组 + 该 topic）
 */
function outgoingTopicInput() {
    if (threadMode.value) {
        const t = threadInfo.value;
        return t ? ({ _: 'messageTopicThread', message_thread_id: t.message_thread_id } as const) : undefined;
    }
    return buildMessageTopicInput(isDirectMessagesChat.value, topicId.value);
}

/** 发送目标会话：评论线程的消息实体在讨论组（已实测：频道 chat_id 不能直接带线程 topic 发送） */
function outgoingChatId(): number | undefined {
    if (threadMode.value && threadInfo.value) return threadInfo.value.chat_id;
    return chatId.value;
}

/**
 * 重新拉取 getMessageThread，刷新评论计数/根消息/线程归属。
 * 删除评论时 TDLib 不一定再发 updateMessageInteractionInfo，删完主动对账一次。
 */
async function refreshThreadInfo(): Promise<void> {
    if (!threadMode.value || chatId.value === undefined) return;
    try {
        const t = await tdlibSend({
            _: 'getMessageThread',
            chat_id: chatId.value,
            message_id: threadRootMsgId.value,
        }) as import('tdlib-types').messageThreadInfo;
        if (!threadMode.value || !t || t._ !== 'messageThreadInfo') return;
        threadInfo.value = t;
        threadReplyInfo.value = t.reply_info;
        dmHeaderTopic.value = { name: threadHeaderTitle(), photo: chat.value?.photo };
    } catch (e) {
        console.warn('refreshThreadInfo failed:', e);
    }
}

// ==================== 话题标签栏 ====================
/** 论坛群组（话题模式）才显示标签栏 */
/**
 * 话题展示模式（按群自身字段判定，非全局设置）：
 * - list：view_as_topics === true → 话题在对话列表（ChatList forumMode），对话页无标签栏
 * - tag ：view_as_topics === false 的论坛群 → 对话页左侧标签栏
 * - none：普通群组
 */
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
 * - 私聊 → 用户个人资料页（user-profile）
 * - 秘密聊天 → 当前 secret chat 资料页（chat-profile，含自动删除/加密密钥等）
 * - 群组 / 频道 → 聊天资料页（chat-profile）
 */
function handleTopClick() {
    const c = chat.value;
    if (!c) return;
    const t = c.type;

    // 评论线程：头部点击打开评论实际所在的「讨论组」资料页，而不是频道资料页
    if (threadMode.value && threadInfo.value) {
        router.push({
            name: 'chat-profile',
            params: { id: String(threadInfo.value.chat_id) },
        });
        return;
    }

    // 秘密聊天：必须用 secret chat id 进 chat-profile，不能落到普通用户资料
    if (t?._ === 'chatTypeSecret') {
        closeOverlay();
        router.push({
            name: 'chat-profile',
            params: { id: String(c.id) },
        });
        return;
    }

    // 私聊 → 对应用户资料页
    if (overlayUserId.value !== undefined) {
        openOverlayUserProfile();
        return;
    }

    // 话题/普通群组/频道（超级群组或基本群组）均复用资料页（chat-profile）展示
    if (t?._ === 'chatTypeSupergroup' || t?._ === 'chatTypeBasicGroup') {
        router.push({
            name: 'chat-profile',
            params: { id: String(c.id) },
        });
    } else {
        openOverlay();
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

/**
 * 聊天内跳转栈：按访问顺序记录聊天路由路径。
 *
 * 聊天之间互相跳转（转发来源、消息内链接、内联按钮…）时层层压栈，
 * 顶栏返回按原路逐层回退；从会话列表打开的聊天只保留当前一层，
 * 返回即收起面板回到空状态。栈随 ChatDetail 卸载清空（面板收起即重新开始）。
 */
const chatJumpStack = ref<string[]>([]);

/**
 * 打开当前聊天会话的入口页（非聊天路由）。
 * 从资料页（用户主页里的个人频道、频道资料里的关联群组…）进入聊天时，
 * 返回应回到那个页面；从栏目空页进入则收起面板回到空状态。
 */
const chatEntryPath = ref<string | null>(null);

watch(
    () => route.fullPath,
    (path, prev) => {
        // 栏目页 / 资料页不改写栈：回到聊天时仍能接着按原路回退
        if (!isChatRoutePath(path)) return;
        const stack = chatJumpStack.value;
        const idx = stack.indexOf(path);
        if (idx >= 0) {
            // 回到栈内已有会话（返回 / 重复跳转）：截断到该层
            if (idx !== stack.length - 1) chatJumpStack.value = stack.slice(0, idx + 1);
            return;
        }
        const fromList = consumeChatNavFromList();
        if (fromList || stack.length === 0) {
            // 新会话（含从列表重新打开）：记录入口页，栈从一层重新开始。
            // 组件刚挂载时 watcher 没有 prev，退回浏览器历史里的上一跳。
            const from = fromList ? null : (prev ?? router.options.history.state.back);
            chatEntryPath.value = typeof from === 'string' && !isChatRoutePath(from) && !isChatPaneSectionPath(from)
                ? from
                : null;
            chatJumpStack.value = [path];
            return;
        }
        // 聊天内跳转：沿用会话入口，只叠加一层
        chatJumpStack.value = [...stack, path];
    },
    { immediate: true },
);

/**
 * 返回按钮处理：叠层模式先关闭叠层；评论线程回到所属频道；
 * 聊天内逐层跳转进来的按原路退回上一个会话；其余情况收起聊天面板，
 * 并回到「打开该聊天的来源栏目」（对话列表 / 联系人 / 归档 / 设置）。
 * 聊天面板在联系人、归档等栏目下仍然挂载，此时返回只收起面板、保持当前栏目的路由。
 */
function handleBack() {
    if (showOverlay.value) {
        closeOverlay();
        return;
    }
    if (threadMode.value && chatId.value !== undefined) {
        // 评论线程返回：回到所属频道会话（而不是聊天列表）
        router.push(`/home/chat/${chatId.value}`);
        return;
    }
    if (chatJumpStack.value.length > 1 && isChatRoutePath(route.fullPath)) {
        // 聊天内跳转到另一个会话（转发来源、消息内链接等）：按历史退回上一层
        router.back();
        return;
    }
    if (chatEntryPath.value !== null && isChatRoutePath(route.fullPath)) {
        // 从资料页等内容页打开的聊天（如用户主页里的个人频道）：返回该页
        router.back();
        return;
    }
    emit('close');
    // 当前已在栏目页（联系人/归档/设置）时不要再改路由，否则会被带回对话列表
    if (route.name === 'chat-detail' || route.name === 'chat-topic-detail' || route.name === 'chat-thread-detail') {
        router.push(chatPaneOrigin.value);
    }
}

/** 顶部搜索：评论线程内不提供会话级搜索（搜索结果属频道历史，与线程上下文不符） */
function openSearch() {
    if (threadMode.value) return;
    searchActive.value = true;
}

function getChatSubtitle(): string {
    if (!chat.value) return '';
    const c = chat.value;
    if (c.type._ === 'chatTypePrivate' || c.type._ === 'chatTypeSecret') {
        return t('lng_media_auto_private_chats');
    }
    if (c.type._ === 'chatTypeBasicGroup') {
        return t('lng_notification_groups');
    }
    if (c.type._ === 'chatTypeSupergroup') {
        return c.type.is_channel ? t('lng_notification_channels') : t('lng_notification_groups');
    }
    return '';
}

function openInNewChat() {
    showOverlay.value = false;
    // 用户点击"跳转到对话"时的处理，这里只是关闭叠层
}

// ==================== State ====================
const chat = ref<chat | undefined>(undefined);

/**
 * 话题展示模式（按群自身字段判定，非全局设置）：
 * - list：view_as_topics === true → 话题在对话列表（ChatList forumMode），对话页无标签栏
 * - tag ：view_as_topics === false 的论坛群 / 频道私聊群组 → 对话页左侧标签栏
 * - none：普通群组
 */
const topicDisplayMode = ref<'none' | 'list' | 'tag'>('none');
/** 频道私聊群组：话题是与各用户的私信会话，数据/发送走 messageTopicDirectMessages */
const isDirectMessagesChat = ref(false);
watch(chat, async (c) => {
    // 切换话题时 chat 会短暂清空再填充；空档不要清成 none，否则标签栏 v-if 闪断重挂
    if (!c) return;
    const modeInfo = await resolveTopicMode(c);
    topicDisplayMode.value = modeInfo.mode;
    isDirectMessagesChat.value = modeInfo.isDirectMessages;
}, { immediate: true });

/** 对话页话题标签栏：仅 tag 栏话题模式显示 */
const showTopicPanel = computed(() =>
    topicDisplayMode.value === 'tag' && chatId.value !== undefined
);
/** 标签栏位置：left / top / bottom（标题栏第一个按钮点击轮换） */
const topicTagPosition = computed<'left' | 'top' | 'bottom'>(
    () => settings.topicTagBar?.position ?? 'left'
);
function toggleTopicTagPosition() {
    const order: Array<'left' | 'top' | 'bottom'> = ['left', 'top', 'bottom'];
    const idx = order.indexOf(topicTagPosition.value);
    // 仅在切换位置的短暂窗口内启用 chrome 布局过渡，
    // 避免切换话题时置顶栏闪烁也带动整页展开动画
    topicLayoutAnim.value = true;
    settings.topicTagBar.position = order[(idx + 1) % order.length];
    window.setTimeout(() => {
        topicLayoutAnim.value = false;
    }, 320);
}
/**
 * 输入区（活动条 + 输入框）与消息区的**实际重叠**：底部留白和「回到最底部」按钮都靠它定位。
 *
 * 不猜高度：活动条折叠 / 展开、AI 输入框 / 普通输入框、回复 / 编辑预览，高度都不一样，
 * 写死常量必然对不上（之前就是 pb-[90px] 这种估算，最后几条会被输入区挡住）。
 * 直接量「消息区底边 − 输入区顶边」——不管输入区怎么浮、下面还压着别的什么，都对得上。
 * `null` = 还没量过（首帧），先用常量兜底，免得入聊天时闪一下。
 *
 * 底部浮层不止输入框：加入群、频道私信选话题、秘密聊天提示、只读频道操作栏都是**替代**输入框的，
 * 所以它们各自也挂同一个 ref —— 量到的永远是「当前真正压在底部的那个」，不再套固定常量；
 * 一个都没有（如被限制发言的普通群）就量成 0，别留一截空白。
 * 只有尺寸变化时才量（ResizeObserver + 浮层切换），不挂 scroll 监听：滚动时零开销。
 */
const inputAreaRef = ref<HTMLElement | null>(null);
const inputInset = ref<number | null>(null);
/** 活动条是否展开（它说了算，见下面 measureInputInset 里的钉住逻辑） */
const aiStripExpanded = ref(false);
const fallbackInset = () => (settings.ai.input === 'ai' ? 100 : 52);

/** 消息区底部留白：只留「被浮层盖住的部分」，不再加额外余量 ——
 *  浮层自己的内边距（输入框 px-3 py-2.5 / 只读栏 p-5）就是视觉间距，再 +8 会多出一截空。 */
const messagesBottomPad = computed(() => `${inputInset.value ?? fallbackInset()}px`);
/** 「回到最底部」按钮：贴在输入区上方（原来固定 7rem，会压在活动条的展开按钮上） */
const scrollButtonBottom = computed(() => `${(inputInset.value ?? fallbackInset()) + 8}px`);

/**
 * 应用新的底部留白。两种语义，别混：
 * - 本来就在底部（含差一点的，阈值同 isAtBottom）：留白变了要**跟着底走**
 *   —— 切换输入框 / AI 活动条变高时，钉住视口会把最后一条往上推，滚动条就不再是最底部。
 * - 不在底部：保持视口不动，正在看历史的人不会被顶得跳位置。
 */
function applyInputInset(next: number) {
    if (next === inputInset.value) return;
    if (isAtBottom()) {
        inputInset.value = next;
        void nextTick().then(() => {
            if (!messagesContainer.value) return;
            scrollToBottomPure();
            // 留白变了 = scrollHeight 变了：滚动缓存要跟着刷，别拿旧值判断「在不在底部」
            refreshScrollMetrics();
        });
        return;
    }
    void withViewportLock(messagesContainer.value, () => { inputInset.value = next; }, nextTick).then(() => {
        refreshScrollMetrics();
    });
}

function measureInputInset() {
    const list = messagesContainer.value;
    if (!list) return;
    // 活动条展开时不重算：展开只是临时盖在上面看，不该把消息顶走（按钮也钉在原地）
    if (aiStripExpanded.value && aiActivityEntries.value.length > 0) return;
    const area = inputAreaRef.value;
    if (!area) {
        // 浮层切换的一瞬间 ref 会先变 null 再指到新元素（底部条要等 TDLib 状态）：
        // 晚一帧再确认，否则底边先被「没有浮层 = 0」压一下再弹回来 —— 又是一次底部丢失。
        requestAnimationFrame(() => {
            if (!messagesContainer.value) return;
            if (inputAreaRef.value) {
                measureInputInset();
                return;
            }
            applyInputInset(0);
        });
        return;
    }
    // 量「消息区底边 − 浮层顶边」
    applyInputInset(Math.max(0, Math.round(list.getBoundingClientRect().bottom - area.getBoundingClientRect().top)));
}

// 输入区 / 底部浮层 / 消息区任一边尺寸变了都要重算（窗口缩放、活动条展开、
// 切换输入框类型、切到「加入群 / 只读频道」那种替代栏…）
watch(inputAreaRef, (el, _old, onCleanup) => {
    const list = messagesContainer.value;
    const ro = new ResizeObserver(() => measureInputInset());
    if (el) ro.observe(el);
    if (list) ro.observe(list);
    measureInputInset();
    onCleanup(() => ro.disconnect());
}, { flush: 'post' });
/** 位置切换窗口：Header / 置顶栈 / 输入条做 padding/top 过渡 */
const topicLayoutAnim = ref(false);
/** 左侧标签栏宽度（图片样式窄栏 72px）；top/bottom 不占侧边 */
const TOPIC_PANEL_WIDTH = 72;
const tagBarSideInsetStyle = computed<Record<string, string>>(() => {
    // 始终写明确数值（0px / 72px），避免删属性导致 CSS 过渡失效、整页跳动
    const left = showTopicPanel.value && topicTagPosition.value === 'left';
    return { paddingLeft: left ? `${TOPIC_PANEL_WIDTH}px` : '0px' };
});
const tagBarMessagePadStyle = computed<Record<string, string>>(() => {
    const left = showTopicPanel.value && topicTagPosition.value === 'left';
    return {
        paddingLeft: left ? `${TOPIC_PANEL_WIDTH + 16}px` : '16px',
        paddingRight: '16px',
    };
});
/** top 模式时顶部栈下移（标签栏悬在 Header 与置顶栏之间） */
const topicTagTopSpace = computed(() =>
    showTopicPanel.value && topicTagPosition.value === 'top' ? 46 : 0
);

function onTopicTagSelect(_topicId: number | null) {
    // 路由由 TopicTagBar 内部 push
}

const {
  drawsOwnWallpaper,
  render,
  overlayOpacity,
  blurPx,
  rootStyle,
} = useChatWallpaper(chat);
/** 叠层对话信息面板显示的对话标题（已注销账户对话显示「已注销账户」） */
const overlayChatTitle = computed(() => {
    if (!chat.value) return '';
    return isDeletedChat(chat.value) ? DELETED_ACCOUNT_LABEL : chat.value.title || '';
});
/** 当前话题信息（话题模式时存在） */
const topic = ref<forumTopic | undefined>(undefined);
/** 频道私信话题的头部展示（对方头像/名称） */
const dmHeaderTopic = ref<{ name: string; photo?: import('tdlib-types').chatPhotoInfo | import('tdlib-types').profilePhoto; firstName?: string; lastName?: string } | undefined>(undefined);
const messageInput = ref('');
/** 面板插入的自定义 emoji 队列（按插入顺序；发送时据此生成实体） */
const pendingCustomEmoji = ref<{ id: string; alt: string }[]>([]);

/**
 * 消息列表使用 shallowRef + markRaw：
 * TDLib message 是深层嵌套大对象，若用 ref 做深度响应式，任意字段变更
 * （下载终态回写、编辑、回应）都会触发整表深遍历，聊天中随机白屏/卡死的主因之一。
 * 所有变更必须通过 replaceMessages/patchMessage 等入口整体替换数组并 bump 版本号。
 */
const messages = shallowRef<message[]>([]);
/** 内存中同时保留的消息上限，超出后从远离视口的一端裁剪，避免 DOM/内存无限增长 */
const MAX_MESSAGE_WINDOW = 180;
/**
 * 向更旧方向加载后、尚未分批揭示进 DOM 的消息 id。
 * 大频道单条消息 DOM 很重，一次性挂载 30 条会造成 80ms+ 长任务；
 * 先把新历史藏起来，再按块揭示，把挂载成本摊到多帧。
 */
const hiddenOlderIds = ref<Set<number>>(new Set());
/** 揭示任务代际：切聊天/新加载时 +1，旧的分批揭示循环据此退出 */
let olderRevealGen = 0;
/**
 * 首屏只挂视口附近：无锚点时保留最新这么多条，其余先藏起来逐帧揭示。
 * 单条消息 DOM 很重，首帧成本应只跟视口条数有关（Unigram 靠 ListView 虚拟化做到这点）。
 */
const FIRST_PAINT_TAIL = 12;

/**
 * 首屏分批挂载：把锚点（无锚点时取尾部 FIRST_PAINT_TAIL 条）以上的旧消息写进
 * hiddenOlderIds，首帧只挂视口这几条；返回被藏的 id（新的在前），供揭示循环使用。
 * 相册不能被切开，保留区间会扩展到相册首条。
 */
function hideMessagesOutsideFirstPaint(anchorId: number): number[] {
    const list = messages.value;
    if (list.length === 0) return [];
    let keepStart = list.length - FIRST_PAINT_TAIL;
    if (anchorId > 0) {
        const idx = list.findIndex(m => m.id === anchorId);
        if (idx >= 0) keepStart = idx;
    }
    keepStart = Math.max(0, keepStart);
    const albumId = list[keepStart]?.media_album_id;
    if (albumId && albumId !== '0') {
        while (keepStart > 0 && list[keepStart - 1].media_album_id === albumId) keepStart--;
    }
    const hidden = list.slice(0, keepStart).map(m => m.id);
    if (hidden.length === 0) return [];
    hiddenOlderIds.value = new Set(hidden);
    return hidden;
}

/** 露出后逐帧揭示首屏藏起来的历史（复用上滚加载那套视口钉扎，不挪视口） */
function startFirstPaintReveal(ids: number[]) {
    if (ids.length === 0) return;
    const hold = holdViewport(messagesContainer.value);
    void revealOlderMessagesInChunks(ids, olderRevealGen, hold);
}
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
/**
 * AI 模式下的引用：只存定位信息（chat_id / message_id），正文不给模型 ——
 * 让它自己调 get_message 读（发送后清空）
 */
const aiQuote = ref<{ name: string; chatId: number; messageId: number } | null>(null);

/** 回复目标摘要（发送者名 + 文本 + 引用片段），供 MessageInput 显示 */
const replyTargetInfo = computed<{ title: string; text: string; quote?: string } | null>(() => {
    const m = replyTargetMsg.value;
    if (!m) return null;
    const title = isSelf(m) ? t('lng_from_you') : getDisplaySenderName(m) || t('lng_profile_participants_section');
    const text = getMessagePlainText(m);
    return { title, text, quote: replyQuoteText.value ?? undefined };
});

/** 设置普通回复目标；传入消息 id 对应消息或 null 以清除 */
function startReply(msg: message | null) {
    // AI 输入框模式下没有消息输入框：回复 = 把这条消息作为引用喂给 AI（见 startAiReply）
    if (msg && settings.ai.input === 'ai') {
        startAiReply(msg);
        return;
    }
    replyTargetMsg.value = msg;
    replyQuoteText.value = null;
}

/**
 * AI 模式的「回复」：输入框顶部出现一个蓝色 @回复消息 占位芯片（AiPromptBar 的 quote prop）。
 * 只把 chat_id / message_id 交给模型，正文由模型自己 get_message 取；点芯片跳回原消息（见 jumpToAiQuote）。
 */
function startAiReply(msg: message) {
    const name = isSelf(msg) ? t('lng_from_you') : getDisplaySenderName(msg) || t('lng_profile_participants_section');
    aiQuote.value = { name, chatId: msg.chat_id, messageId: msg.id };
    aiPromptRef.value?.focusInput();
}

/** 点击引用占位芯片：跳到被引用的那条消息 */
function jumpToAiQuote() {
    const target = aiQuote.value;
    if (target) void jumpToMessage(target.messageId);
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
const aiPromptRef = ref<InstanceType<typeof AiPromptBar> | null>(null);

// ==================== 草稿（内存缓存 + TDLib 同步） ====================
/** 切换对话加载期间为 true：抑制自动存草稿，避免清空输入误删新聊天草稿 */
const suppressDraftAutosave = ref(false);
const {
    saveDraft, restoreDraft, clearDraft, flushTdlibDraftNow, cancelLocalDraftTimer, cancelTdlibDraftTimer,
} = useDraft({
    chatId, topicId, threadMode, threadRootMsgId,
    messageInput, pendingCustomEmoji, editingMsg,
    isDirectMessagesChat, suppress: suppressDraftAutosave,
});

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
        label: t('lng_theme_edit'),
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

/** 当前编辑消息是否有可替换的媒体/文档资源 */
const editHasMedia = computed(() => {
    const m = editingMsg.value;
    if (!m) return false;
    return allowedEditReplaceKinds(m.content._) !== null;
});

/** 编辑区资源类型文案（文档/图片/视频…） */
const editResourceLabel = computed(() => {
    const m = editingMsg.value;
    if (!m) return t('lng_media_type_media');
    switch (m.content._) {
        case 'messageDocument': return t('lng_in_dlg_file');
        case 'messagePhoto': return t('lng_in_dlg_photo');
        case 'messageVideo': return t('lng_in_dlg_video');
        case 'messageAudio': return t('lng_media_music_title');
        case 'messageAnimation': return t('lng_media_type_gifs');
        default: return t('lng_media_type_media');
    }
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
    // 进入编辑时清空草稿附件，避免误带进编辑；编辑期间新粘贴 / 选择的文件会作为新媒体提交
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

/**
 * 编辑替换：按原消息类型给出文件选择器与分类策略。
 * 图片↔视频、文件↔音乐可互换；动画仅 GIF/MPEG4。
 * 文件/音乐替换不设扩展名筛选（任意文件均可选入）。
 */
function editReplaceDialogSpec(contentType: string): {
    title: string;
    filterName?: string;
    extensions?: string[];
    forceDocument: boolean;
} | null {
    const IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'heic', 'heif'];
    const VIDEO = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpeg', 'mpg', 'wmv', 'flv', '3gp', 'ogv'];
    const ANIMATION = ['gif', 'mp4', 'm4v', 'mpeg', 'mpg', 'mp4v'];
    switch (contentType) {
        case 'messageDocument':
            // 文件消息：任意文件；音频→music，其余→document
            return {
                title: t('chat.chooseFileOrMusic'),
                forceDocument: false,
            };
        case 'messagePhoto':
            // 图片 ↔ 视频
            return {
                title: t('chat.choosePhotoOrVideo'),
                filterName: t('chat.photosAndVideos'),
                extensions: [...IMAGE, ...VIDEO],
                forceDocument: false,
            };
        case 'messageVideo':
            return {
                title: t('chat.chooseVideoOrPhoto'),
                filterName: t('chat.videosAndPhotos'),
                extensions: [...VIDEO, ...IMAGE],
                forceDocument: false,
            };
        case 'messageAudio':
            // 音乐 ↔ 文件
            return {
                title: t('chat.chooseMusicOrFile'),
                forceDocument: false,
            };
        case 'messageAnimation':
            // 动画仅 GIF 或 MPEG4
            return {
                title: t('chat.chooseAnimation'),
                filterName: 'GIF / MPEG4',
                extensions: ANIMATION,
                forceDocument: false,
            };
        default:
            return null;
    }
}

/** 更换编辑中的资源：按原消息类型选文件、分类，并解析为合法 kind */
async function pickEditMediaReplacement() {
    if (!editingMsg.value || !editHasMedia.value) return;
    const contentType = editingMsg.value.content._;
    const spec = editReplaceDialogSpec(contentType);
    if (!spec || !allowedEditReplaceKinds(contentType)) {
        toast.warning(t('chat.replaceUnsupported'));
        return;
    }
    try {
        const selected = await openDialog({
            multiple: false,
            title: spec.title,
            // 文件消息不设扩展名筛选：document 通道接受任意文件
            ...(spec.extensions && spec.extensions.length > 0
                ? { filters: [{ name: spec.filterName || t('lng_in_dlg_file'), extensions: spec.extensions }] }
                : {}),
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
            // kind 由 resolveEditReplaceKind 按原消息类型映射，这里不强制 document
            forceDocument: spec.forceDocument,
        });
        if (result.status === 'rejected') {
            toast.warning(result.reason);
            return;
        }
        // 图片↔视频、文件↔音乐：映射为合法提交类型
        const resolved = resolveEditReplaceKind(contentType, result.kind, name);
        if (!resolved.ok) {
            toast.warning(resolved.reason);
            return;
        }
        editMediaReplacement.value = {
            id: `edit-media-${Date.now()}`,
            path, name, size,
            kind: resolved.kind,
            width: result.width,
            height: result.height,
            duration: result.duration,
            probeFailed: result.probeFailed,
        };
        editMediaPreviewSrc.value = convertFileSrc(path);
    } catch (e) {
        console.error('pick edit media failed:', e);
        toast.error({ content: t('chat.pickMediaFailed', { type: editResourceLabel.value }), placement: 'center' });
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

/** 统一的 inputMessageReplyToMessage（无回复目标返回 undefined） */
type ReplyToMessage = {
    _: 'inputMessageReplyToMessage';
    message_id: number;
    quote: inputTextQuote | null;
    checklist_task_id: number;
    poll_option_id: string;
};
function replyToInput(): ReplyToMessage | undefined {
    const target = replyTargetMsg.value;
    if (!target) return undefined;
    return {
        _: 'inputMessageReplyToMessage',
        message_id: target.id,
        quote: buildReplyQuote(),
        checklist_task_id: 0,
        poll_option_id: '',
    };
}

/** 统一的 sendMessage 外壳：补 chat/topic/reply，文本 / 贴纸 / 动画共用 */
function sendMessageContent(content: sendMessage['input_message_content']) {
    return tdlibSend({
        _: 'sendMessage',
        chat_id: outgoingChatId()!,
        input_message_content: content,
        reply_to: replyToInput(),
        topic_id: outgoingTopicInput(),
    } as sendMessage as $Function);
}

// ===== 多选 + 转发 =====
let menuApi!: ReturnType<typeof useMessageContextMenu>;
const {
    MAX_SELECTED_MSG_COUNT, selectionMode, selectedMsgIds, enterSelectionMode, exitSelectionMode,
    toggleSelectMsg, toggleSelectMsgById, isAlbumSelected, toggleSelectAlbum, isMsgSelected,
    canDeleteSelected, onDeleteSelected, forwardPickerVisible, forwardMessageIds,
    forwardMessagesSnapshot, openForwardPicker, startForward, onForwardDone,
} = useMessageSelection({
    messages, chatId,
    openDeletePopup: (msgs) => menuApi.openDeletePopup(msgs),
});

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
/** 当前边缘加载方向：'older' 时才显示顶部指示器，避免底部加载引起布局跳动 */
const loadingDirection = ref<'older' | 'newer' | 'bottom' | null>(null);
/** 程序化滚动/跳底后短暂抑制 onScroll 触发历史加载 */
let scrollLoadSuppressedUntil = 0;
/** loadHistoryNewer 连续失败计数，防止网络错误导致指示器死循环 */
let newerFetchFailStreak = 0;
const isHistoryExhausted = ref(false);
/** 普通模式下向下滚动加载“更新”消息是否已到边界（已加载到最新消息） */
const isNewerExhausted = ref(false);
const isReady = ref(false);           // 标记初始加载和定位已完成
/** 列表是否已对用户可见：首屏必须「先定位再露出」，否则会看到无意义的跳动 */
const listRevealed = ref(false);
/**
 * 骨架屏延迟出现：本地读历史常常几十毫秒就定位并露出，骨架屏立刻挂上会「闪一下」
 * （看起来像白屏）。超过 SKELETON_DELAY_MS 仍未露出才显示，快路径没有任何中间态。
 */
const SKELETON_DELAY_MS = 180;
const skeletonArmed = ref(false);
let skeletonTimer: number | null = null;
/** 每次开始加载（resetState）时重新计时 */
function armSkeleton() {
    disarmSkeleton();
    skeletonArmed.value = false;
    skeletonTimer = window.setTimeout(() => {
        skeletonTimer = null;
        skeletonArmed.value = true;
    }, SKELETON_DELAY_MS);
}
function disarmSkeleton() {
    if (skeletonTimer !== null) {
        window.clearTimeout(skeletonTimer);
        skeletonTimer = null;
    }
    skeletonArmed.value = false;
}
const unreadBoundaryMessageId = ref<number | null>(null);
/** 已滚动过的新消息上界：比它新且在窗口内的 newMessageIds 才计入跳底按钮徽标 */
const latestUnreadSeenId = ref(0);

const newMessageIds = ref<Set<number>>(new Set());
/** 离开底部期间收到的他人新消息 id（不依赖窗口/入场动画，窗口未连到底部时也计数） */
const pendingNewIds = ref<Set<number>>(new Set());
/** 跳底按钮徽标：未读新消息实时数（id 超过已看到的底部上界即计入） */
const newMessageCount = computed(() => {
    if (!threadMode.value && chat.value) return chat.value.unread_count;
    let n = 0;
    for (const id of pendingNewIds.value) {
        if (id > latestUnreadSeenId.value) n++;
    }
    return n;
});
/** 未读角标计数器位数：按未读数长度生成（≤99 走滚动数字，>99 仍显示 99+） */
const newMessageCountPlaces = computed<(number | '.')[]>(() => {
    const digits = Math.max(1, String(newMessageCount.value).length);
    return Array.from({ length: digits }, (_, i) => 10 ** (digits - 1 - i));
});
/** 正在播放删除消失动画的消息 id：动画结束后才真正从列表移除 */
const leavingMessageIds = ref<Set<number>>(new Set());
const showScrollButton = ref(false);
const notificationsMuted = ref(false);
const isNotificationTogglePending = ref(false);
const linkedChatId = ref(0);
/** 超级群 has_automatic_translation（无 Premium / 无 is_translatable 时的替代门槛） */
const hasAutomaticTranslation = ref(false);
/** 当前对话的群组信息是否已就绪（用于延迟 Premium 提示） */
const supergroupFullReady = ref(false);
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
/** 总线多通道订阅取消函数 */
let unsubscribeUpdates: (() => void) | null = null;

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
let measureBubbleRaf = 0;
function measureBubbleWidths() {
    const container = messagesContainer.value;
    if (!container) return;
    const next: Record<number, number> = {};
    // 只读 offsetWidth（比 getBoundingClientRect 少一层转换），且一次遍历
    container.querySelectorAll<HTMLElement>('[data-bubble-msg-id]').forEach((el) => {
        const id = Number(el.dataset.bubbleMsgId || '0');
        if (id > 0) next[id] = Math.round(el.offsetWidth);
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

/** rAF 合帧：短时间多次 messagesVersion 变化只测一次，避免连续强制重排 */
function scheduleMeasureBubbleWidths() {
    if (measureBubbleRaf) return;
    measureBubbleRaf = requestAnimationFrame(() => {
        measureBubbleRaf = 0;
        measureBubbleWidths();
    });
}

// 消息变化（新增/删除/内容编辑等）后重新测量宽度。
// 不用 deep watch：messages 已是 shallowRef，深监听会把每次深层字段写入
// 变成整表 O(n) 遍历 + DOM 扫描。测量本身经 rAF 合帧，避免与本轮 patch 抢同一帧。
watch(
    messagesVersion,
    async () => {
        await nextTick();
        scheduleMeasureBubbleWidths();
        refreshScrollMetrics();
    },
    { immediate: true }
);

// 容器尺寸变化（窗口缩放/布局变化）时重新测量
let bubbleWidthObserver: ResizeObserver | null = null;
watch(messagesContainer, (el) => {
    if (bubbleWidthObserver) bubbleWidthObserver.disconnect();
    bubbleWidthObserver = null;
    scrollMetrics.h = 0;
    scrollMetrics.c = 0;
    if (el) {
        refreshScrollMetrics(el);
        bubbleWidthObserver = new ResizeObserver(() => {
            scheduleMeasureBubbleWidths();
            // clientHeight 随窗口/顶栏变化；scrollHeight 在下一次预取前再读
            scrollMetrics.c = el.clientHeight;
        });
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
    // 订阅总线：消息/对话/用户/文件/稀有类型，按类分发到 handleUpdate
    // 替代原先单条 tdlib-update 全量监听 + 前端 if 过滤
    unsubscribeUpdates = onTdlibUpdates(
        ["message", "chat", "user", "file", "other"],
        (update) => {
            handleUpdate(update as unknown as Update);
        },
    );

    // 同聊天内链接跳转：resolveInternalLink 检测到目标消息在当前聊天时，
    // 分发此事件而非 router.push，避免路由变更导致 ChatDetail 重建/缓存恢复。
    window.addEventListener('tdgram:jump-to-message-in-chat', onSameChatJump);
});

// 浏览位置必须在 DOM 卸载前冲刷：onUnmounted 时 messagesContainer 已是 null，flush 会直接 return
onBeforeUnmount(() => {
    if (chatId.value !== undefined) {
        // DOM 还在时把窗口存进内存缓存（关闭会话后再打开可立刻铺上）
        saveCurrentChatWindow(chatId.value, topicId.value, threadRootMsgId.value);
        flushScheduledBrowsePosSave(chatId.value, topicId.value);
    } else {
        cancelScheduledBrowsePosSave();
    }
});

onUnmounted(() => {
    window.removeEventListener('tdgram:jump-to-message-in-chat', onSameChatJump);
    // 面板收起：聊天内跳转栈与入口页作废，下次打开聊天重新开始
    chatJumpStack.value = [];
    chatEntryPath.value = null;
    if (unsubscribeUpdates) {
        unsubscribeUpdates();
        unsubscribeUpdates = null;
    }
    if (bubbleWidthObserver) bubbleWidthObserver.disconnect();
    if (measureBubbleRaf) {
        cancelAnimationFrame(measureBubbleRaf);
        measureBubbleRaf = 0;
    }
    cancelHistoryPrefetch();
    disarmSkeleton();
    if (readVisibilityTimer !== null) window.clearTimeout(readVisibilityTimer);
    if (chatLoadRetryTimer !== null) window.clearTimeout(chatLoadRetryTimer);
    cancelLocalDraftTimer();
    // 编辑中卸载：编辑文本不是草稿，不要写入；直接冲刷先前已保存的 TDLib 草稿
    if (!editingMsg.value) {
        saveDraft();
    }
    // 无论是否编辑，都把待提交草稿冲刷出队，避免组件卸载后丢草稿
    cancelTdlibDraftTimer();
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

/**
 * 依据 updateFile 终态，把同 file.id 的消息内嵌 File 快照写回。
 * messages 是 markRaw：写回时替换命中 File 引用后，还必须浅拷贝 content 换新引用，
 * 子组件 computed（photoBigPath / isFileReady 等）才能重算并显示本地路径。
 */
function syncEmbeddedFileSnapshot(file: TdFile): void {
    if (!isTerminalFileUpdate(file)) return;
    const all = collectAllInMemoryMessages();
    if (all.length === 0) return;
    const changedIds = applyTerminalFileToMessages(all, file);
    if (changedIds.length === 0) return;
    for (const id of changedIds) {
        const msg = messages.value.find(m => m.id === id);
        if (!msg) continue;
        // 嵌套 File 已替换为新对象；再换 content 引用触发 props 更新
        patchMessage(id, { content: { ...msg.content } } as Partial<message>);
    }
}

const handleUpdate = async (update: Update) => {
    switch (update._) {
        case 'updateChatReadInbox': {
            // 未读数实时跟随（进入会话、已读、新消息都会推送）；评论线程用 pendingNewIds 计数
            if (!chat.value || threadMode.value || update.chat_id !== chat.value.id) break;
            chat.value.unread_count = update.unread_count;
            break;
        }

        case 'updateNewMessage': {
            const msg = update.message;
            // 仅处理当前正在渲染的聊天中的消息
            if (!isReady.value) return;
            if (threadMode.value) {
                // 评论线程：只接收讨论组内属于本线程的消息（含自己刚发出的评论）
                const t = threadInfo.value;
                const topic = msg.topic_id;
                if (!t || msg.chat_id !== t.chat_id || !topic || topic._ !== 'messageTopicThread'
                    || topic.message_thread_id !== t.message_thread_id) return;
            } else if (msg.chat_id !== chatId.value) return;
            if (messages.value.find(m => m.id === msg.id)) return;

            // 话题模式下只显示属于当前话题的消息（论坛 / 频道私信）
            if (!threadMode.value && topicId.value) {
                const msgTopicId = extractTopicNumber(msg.topic_id as any);
                if (msgTopicId !== topicId.value) return;
            }

            const senderIsMe =
                msg.sender_id._ === 'messageSenderUser' &&
                msg.sender_id.user_id === myId.value;

            await fetchSenders([msg]);
            void fetchMemberStatuses([msg]);

            const currentNewestId = messages.value[messages.value.length - 1]?.id ?? 0;
            const isNewerThanWindow = currentNewestId <= 0 || msg.id > currentNewestId;

            // 窗口未连到真实底部（跳转/未读锚点中间态）时，禁止把消息 append 进带 gap 的列表，
            // 否则会出现 id 跳变（消息中断）。
            if (!windowReachesLatest.value) {
                if (senderIsMe) {
                    // 自己发送：切到真实底部连续窗口，保证发送结果可见且列表连续
                    // 评论线程的 message 属讨论组，不得回写频道会话的 last_message
                    if (!threadMode.value && chat.value?.last_message && msg.id >= (chat.value.last_message.id || 0)) {
                        chat.value.last_message = msg;
                    }
                    void handleScrollToBottom();
                    break;
                }
                if (isNewerThanWindow) {
                    showScrollButton.value = true;
                    newMessageIds.value.add(msg.id);
                    pendingNewIds.value.add(msg.id);
                }
                break;
            }

            // 先读贴底状态再写列表：append 后立刻读布局会和 patch 抢强制回流
            const atBottom = isAtBottom();
            if (!messages.value.find(m => m.id === msg.id)) {
                appendMessages([msg]);
            }

            newMessageIds.value.add(msg.id);
            if (senderIsMe || atBottom) {
                showScrollButton.value = false;
                if (!threadMode.value && chat.value?.last_message && msg.id >= (chat.value.last_message.id || 0)) {
                    chat.value.last_message = msg;
                }
                windowReachesLatest.value = true;
                scrollToBottom();
            } else {
                showScrollButton.value = true;
                pendingNewIds.value.add(msg.id);
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
            if (!isActiveChat(update.chat_id)) break;
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
            if (!isActiveChat(update.message.chat_id)) return;
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
            if (!isActiveChat(update.chat_id) || !isReady.value) break;
            const removedSome = update.message_ids.some(id => messages.value.some(m => m.id === id));
            animateRemoveMessages(update.message_ids);
            // 评论被删：TDLib 不一定补发 interaction 更新，主动刷新线程计数
            if (threadMode.value && removedSome) void refreshThreadInfo();
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

        case 'updateChatIsTranslatable': {
            // 全部翻译栏跟随 chat.is_translatable
            if (update.chat_id !== chatId.value || !chat.value) return;
            chat.value.is_translatable = !!update.is_translatable;
            break;
        }

        case 'updateSupergroupFullInfo': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeSupergroup') return;
            if (update.supergroup_id !== currentChat.type.supergroup_id) return;
            linkedChatId.value = update.supergroup_full_info.linked_chat_id;
            maybePromptTranslatePremium();
            break;
        }

        case 'updateSupergroup': {
            const currentChat = chat.value;
            if (currentChat?.type._ !== 'chatTypeSupergroup') return;
            if (update.supergroup.id !== currentChat.type.supergroup_id) return;
            supergroups.value[update.supergroup.id] = update.supergroup;
            // 自动翻译状态在 supergroup.has_automatic_translation 上
            hasAutomaticTranslation.value = !!update.supergroup.has_automatic_translation;
            supergroupFullReady.value = true;
            maybePromptTranslatePremium();
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

            if (isActiveChat(update.chat_id)) {
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
            // 换头像：同步当前 chat（Header 头像）与本地缓存（消息来源头像）
            if (update.chat_id === chatId.value && chat.value) {
                chat.value.photo = update.photo;
            }
            if (typeof update.chat_id === 'number' && chats.value[update.chat_id]) {
                chats.value[update.chat_id].photo = update.photo;
            }
            break;
        }
        case 'updateChatTitle': {
            // 改名：同步当前 chat（Header 标题）与本地缓存（消息来源显示名）
            if (update.chat_id === chatId.value && chat.value) {
                chat.value.title = update.title;
            }
            if (typeof update.chat_id === 'number' && chats.value[update.chat_id]) {
                chats.value[update.chat_id].title = update.title;
            }
            break;
        }
        case 'updateChatAccentColors': {
            // 主题色变更：同步当前 chat（Header 无头像背景）与本地缓存
            if (update.chat_id === chatId.value && chat.value) {
                chat.value.accent_color_id = update.accent_color_id;
                chat.value.profile_accent_color_id = update.profile_accent_color_id;
            }
            if (typeof update.chat_id === 'number' && chats.value[update.chat_id]) {
                chats.value[update.chat_id].accent_color_id = update.accent_color_id;
                chats.value[update.chat_id].profile_accent_color_id = update.profile_accent_color_id;
            }
            break;
        }
        case 'updateChatBackground': {
            // 换壁纸（自己应用 / 对方设置 / 其他设备）：useChatWallpaper 读的就是 chat.background，
            // 不在这里同步的话界面会一直用旧壁纸，直到重新打开对话。
            // background 缺省表示已重置为默认背景。
            if (update.chat_id === chatId.value && chat.value) {
                chat.value.background = update.background;
            }
            if (typeof update.chat_id === 'number' && chats.value[update.chat_id]) {
                chats.value[update.chat_id].background = update.background;
            }
            break;
        }

        case 'updateMessageIsPinned': {
            // 自己/其他设备置顶或取消置顶：保持消息菜单与顶部置顶栏同步
            if (!isActiveChat(update.chat_id)) break;
            onMessagePinnedStateChanged(update.message_id, update.is_pinned);
            break;
        }

        // ---- 消息回应更新 ----
        case 'updateMessageInteractionInfo': {
            // 评论线程：频道帖子或讨论组内根副本的 interaction_info 变化 → 刷新头部评论计数
            if (threadMode.value && threadRootMsgId.value > 0
                && (update.message_id === threadRootMsgId.value
                    || (threadInfo.value && update.chat_id === threadInfo.value.chat_id
                        && update.message_id === threadInfo.value.message_thread_id))) {
                threadReplyInfo.value = update.interaction_info?.reply_info;
                dmHeaderTopic.value = {
                    name: threadHeaderTitle(),
                    photo: chat.value?.photo,
                };
            }
            if (!isActiveChat(update.chat_id)) break;
            patchMessage(update.message_id, { interaction_info: update.interaction_info });
            break;
        }

        case 'updateMessageUnreadReactions': {
            if (!isActiveChat(update.chat_id)) break;
            patchMessage(update.message_id, { unread_reactions: update.unread_reactions });
            break;
        }

        case 'updateSecretChat': {
            const currentChat = chat.value;
            if (currentChat?.type?._ !== 'chatTypeSecret') break;
            if (update.secret_chat.id !== currentChat.type.secret_chat_id) break;
            applySecretChatState(update.secret_chat.state);
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
/**
 * 本次打开会话时的已读线（last_read_inbox_message_id）。
 * 比较「是否滑进未读」用它，而不是会随 markVisible 前进的 live 已读线，
 * 否则用户刚滚进未读、消息被标已读后，兜底判定永远为 false。
 */
const sessionUnreadBaseId = ref(0);

// ==================== 上次浏览位置缓存 ====================
const {
    getBrowsePosition, setBrowsePosition, clearLastBrowsePosition,
    bumpBrowsePosReadInboxMaxId, isAnchorInUnreadZone,
} = useBrowsePosition({ unreadBoundaryMessageId, sessionUnreadBaseId });

// ==================== Pinned Messages ====================
const pinnedBarVisible = ref(false);
/** 置顶消息发生变化时递增，驱动 PinnedMessageBar 重新拉取 */
const pinnedBarRefreshToken = ref(0);
/** 上一次 scrollTop，用于判断滚动方向 */
let lastStickyScrollTop = 0;

// ==================== 吸顶日期 ====================
const {
    stickyDateText, stickyDateHidden, stickyDateDisplay,
    updateStickyDate, scheduleUpdateStickyDate,
} = useStickyDate({
    messagesContainer,
    listRevealed,
    getMessageItems: () => messageItems.value,
});

function onPinnedVisibleChange(visible: boolean) {
    pinnedBarVisible.value = visible;
}

type HistoryMode = 'normal' | 'jump';
type HistoryFetch = message[] | null;

/**
 * 历史切片参数（HistoryOffset/HistoryLimit）：
 * TDLib 约定：offset 为负时 limit 必须严格大于 -offset，否则请求非法。
 * 因此「向更新方向」永远用 limit = HISTORY_NEWER_OFFSET + 1，绝不能 limit === -offset。
 */
const HISTORY_SLICE_LIMIT = 40;
const HISTORY_SLICE_OFFSET = -20;
const HISTORY_OLDER_LIMIT = 30;
const HISTORY_NEWER_OFFSET = 30;
const HISTORY_NEWER_LIMIT = HISTORY_NEWER_OFFSET + 1;
const HISTORY_BOTTOM_LIMIT = 60;
/** 本地切片少于此条数视为不足，首屏回退网络 */
const HISTORY_LOCAL_MIN = 8;
/** 距顶/底预取阈值（px），避免滚到边才请求导致空白 */
const SCROLL_PREFETCH_PX = 220;

/** 当前历史加载模式：普通模式只从顶部向更旧方向扩展，跳转模式允许两端扩展 */
const historyMode = ref<HistoryMode>('normal');
const jumpOlderExhausted = ref(false);
const jumpNewerExhausted = ref(false);
/** 当前消息窗口是否已连到聊天真实最新消息；未连上时 updateNewMessage 不得 append 进列表 */
const windowReachesLatest = ref(false);

/** 标记“更旧方向”已到边界：跳转模式用 jumpOlderExhausted，普通模式用 isHistoryExhausted */
function markOlderExhausted() {
    if (historyMode.value === 'jump') {
        jumpOlderExhausted.value = true;
    } else {
        isHistoryExhausted.value = true;
    }
}

/** 标记“更新方向”已到边界：跳转模式用 jumpNewerExhausted，普通模式用 isNewerExhausted */
function markNewerExhausted() {
    if (historyMode.value === 'jump') {
        jumpNewerExhausted.value = true;
    } else {
        isNewerExhausted.value = true;
    }
}

function isOlderExhausted(): boolean {
    return historyMode.value === 'jump' ? jumpOlderExhausted.value : isHistoryExhausted.value;
}

function isNewerDirectionExhausted(): boolean {
    return historyMode.value === 'jump' ? jumpNewerExhausted.value : isNewerExhausted.value;
}

/** 依据当前列表末端与 chat.last_message，判断窗口是否已贴到真实最新 */
function refreshWindowReachesLatest() {
    const lastId = chat.value?.last_message?.id ?? 0;
    const newestId = messagesMaxId();
    if (lastId <= 0 || newestId <= 0) {
        // 无 last_message 时，若更新方向已耗尽也可视为贴底
        windowReachesLatest.value = isNewerDirectionExhausted();
        return;
    }
    windowReachesLatest.value = newestId >= lastId;
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

/** 是否秘密聊天 */
const isSecretChat = computed(() => chat.value?.type?._ === 'chatTypeSecret');
/** 秘密聊天握手状态：pending / ready / closed；非密聊或未知为 undefined */
const secretChatState = ref<'pending' | 'ready' | 'closed' | undefined>(undefined);
/** 底部提示文案（仅 Pending / Closed） */
const secretChatNoticeText = computed(() => {
    if (!isSecretChat.value) return '';
    if (secretChatState.value === 'pending') return t('secretChat.waitingEncryption');
    if (secretChatState.value === 'closed') return t('secretChat.closedNotice');
    return '';
});

function applySecretChatState(state: { _: string }) {
    if (state._ === 'secretChatStateReady') secretChatState.value = 'ready';
    else if (state._ === 'secretChatStateClosed') secretChatState.value = 'closed';
    else secretChatState.value = 'pending';
}

/** 读取秘密聊天当前 state（打开/切换聊天时） */
async function loadSecretChatState(currentChat: chat) {
    if (currentChat.type._ !== 'chatTypeSecret') {
        secretChatState.value = undefined;
        return;
    }
    const secretChatId = currentChat.type.secret_chat_id;
    try {
        const sc = await tdlibSend({
            _: 'getSecretChat',
            secret_chat_id: secretChatId,
        }) as { state: { _: string } };
        if (chat.value?.type?._ !== 'chatTypeSecret'
            || chat.value.type.secret_chat_id !== secretChatId) return;
        applySecretChatState(sc.state);
    } catch (e) {
        console.error('Failed to load secret chat state', e);
        // 未知时先按可用处理，避免误锁输入；后续 updateSecretChat 会纠正
        if (secretChatState.value === undefined) secretChatState.value = 'ready';
    }
}

// 监听 chatId 变化，加载聊天信息和消息
watch([chatId, topicId, threadRootMsgId, chatLoadRetryToken, forwardedTargetMessageId], async (
    // 源数组：[chatId, topicId, threadRootMsgId, chatLoadRetryToken, forwardedTargetMessageId]
    // 目标消息 id 在末位（index 4），不是 index 3（那是重试令牌）
    [newChatId, newTopicId, , , requestedMessageId],
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
    // 取消进行中的历史分批揭示，清空隐藏集，避免旧聊天的消息串进新聊天
    olderRevealGen++;
    hiddenOlderIds.value = new Set();

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
    // 切走前把当前窗口留在内存缓存里：下次进入同一会话直接铺上，不再闪骨架屏
    if (oldChatId !== undefined) {
        saveCurrentChatWindow(oldChatId, oldTopicId ?? null, oldVals?.[2] ?? null);
    }
    if (switchingChat) {
        // 切走前冲刷未写入的浏览位置（debounce 窗口内）
        flushScheduledBrowsePosSave(oldChatId!, oldTopicId);
        // 编辑态下的输入框是被编辑消息内容，不是草稿；丢弃编辑并走本地缓存恢复，
        // 绝不能把编辑内容写成草稿，也不要把旧草稿覆盖成空。
        suppressDraftAutosave.value = true;
        if (editingMsg.value) {
            editingMsg.value = null;
            editSeedEntities.value = null;
            editMediaPreviewSrc.value = null;
            editMediaReplacement.value = null;
            messageInput.value = '';
            pendingCustomEmoji.value = [];
            cancelLocalDraftTimer();
        } else {
            saveDraft(oldChatId!, oldTopicId);
            // 抑制自动存草稿并立刻清空输入框，避免加载期间看到旧内容、
            // 或防抖回调用新 chatId 把空输入误存成「删除新聊天草稿」。
            cancelLocalDraftTimer();
            messageInput.value = '';
            pendingCustomEmoji.value = [];
        }
    } else {
        suppressDraftAutosave.value = false;
    }

    // 重置全部状态
    resetState();
    searchActive.value = false;
    // 本会话内已打开过的对话：chats 缓存里留有一份完整 chat 对象，先拿回来铺上，
    // 壁纸/头部标题头像在第一帧就有（getChat 返回后整体覆盖，取数流程完全不变）。
    // 不这样做的话首帧 chat 为空 → 没有壁纸层 → 内容区露白。
    const rememberedChat = chats.value[currentId];
    if (rememberedChat) chat.value = rememberedChat;

    // 读取上次浏览位置（决定首屏加载锚点；导航带 message_id / 评论线程模式时忽略缓存）
    const savedBrowsePos = requestedMessageId || threadMode.value ? null : getBrowsePosition(currentId, topicId.value);

    // 上次离开时的窗口还在内存里 → 直接铺上并立刻露出，不等 TDLib/网络（后台加载随后覆盖，位置一致）。
    // 只在「能按同一位置定位」时用：有浏览位置，或会话无未读（否则会先贴底再跳到未读线）。
    // 评论线程的历史属讨论组，消息归属过滤依赖 threadInfo，仍走原流程。
    const cachedWindow = !threadMode.value
        && (savedBrowsePos || (rememberedChat?.unread_count ?? 0) === 0)
        ? peekChatWindow(chatWindowKey(currentId, topicId.value, threadRootMsgId.value))
        : null;
    if (cachedWindow) {
        applyMessages(cachedWindow.messages);
        windowReachesLatest.value = cachedWindow.windowReachesLatest;
    }

    try {
        // 并行发起：chat 基础信息 + 话题/线程信息 +（可提前确定的）首屏消息
        const chatPromise = tdlibSend({ _: 'getChat', chat_id: currentId }) as Promise<chat>;
        const topicPromise: Promise<unknown> = threadMode.value
            ? tdlibSend({ _: 'getMessageThread', chat_id: currentId, message_id: threadRootMsgId.value }) as Promise<import('tdlib-types').messageThreadInfo>
            : topicId.value
                ? (isDirectMessagesChat.value
                    ? ensureDmTopic(currentId, topicId.value)
                    : tdlibSend({ _: 'getForumTopic', chat_id: currentId, forum_topic_id: topicId.value }) as Promise<forumTopic>)
                : Promise.resolve(undefined);

        // 有上次浏览位置时，围绕 anchor 先拉一个对称切片（40/-20），无需等待 getChat。
        // 首屏优先 TDLib 本地库，不足再回退网络（fetchMessagesPreferLocal 两段式）
        const earlyMessages: Promise<HistoryFetch> | null = savedBrowsePos && savedBrowsePos.anchorId > 0
            ? fetchMessagesPreferLocal(currentId, savedBrowsePos.anchorId, HISTORY_SLICE_LIMIT, HISTORY_SLICE_OFFSET, gen, {
                anchorId: savedBrowsePos.anchorId,
            })
            : null;

        // 缓存窗口已经铺在屏幕上了：请求已在飞，这里只做定位 + 露出，不等首屏数据。
        // 后面的正常流程照旧（首屏数据到达后覆盖列表，再按同一锚点定位，位置不变）。
        if (cachedWindow) {
            // 首帧同样只挂视口附近：整窗一次挂载会把缓存省下的时间又还回去
            const cachedFirstPaintHidden = hideMessagesOutsideFirstPaint(savedBrowsePos?.anchorId ?? 0);
            await nextTick();
            if (!isGenerationValid(gen) || chatId.value !== currentId) return;
            if (savedBrowsePos && savedBrowsePos.anchorId > 0 && messages.value.some(m => m.id === savedBrowsePos.anchorId)) {
                scrollToBrowseAnchor(savedBrowsePos.anchorId, savedBrowsePos.pixelFromTop);
            } else {
                scrollToBottomPure();
            }
            // 已读上报与历史预取都由 isReady 挡住（此时仍为 false），等正式首屏数据到达后按原逻辑跑
            disarmSkeleton();
            listRevealed.value = true;
            startFirstPaintReveal(cachedFirstPaintHidden);
        }

        const chatData = await chatPromise;
        if (!isGenerationValid(gen)) return;
        chat.value = chatData;
        // 当前会话同时进本地 chats 缓存：消息发送者为本会话时（频道帖子/线程根副本）
        // 头像与名称需要能解析，否则回退成「未知频道」
        if (chatData && chatData.id) chats.value[chatData.id] = chatData;
        // 秘密聊天：读取握手状态（Pending/Ready/Closed），驱动底部提示与输入框
        void loadSecretChatState(chatData);

        // 话题模式：加载当前话题信息（用于头部显示话题名称/图标）
        // 评论线程模式：加载 getMessageThread（讨论组、线程 id、根消息、评论计数）
        if (threadMode.value) {
            topic.value = undefined;
            dmHeaderTopic.value = undefined;
            threadInfo.value = undefined;
            threadReplyInfo.value = undefined;
            try {
                const t = await topicPromise as import('tdlib-types').messageThreadInfo;
                if (!isGenerationValid(gen)) return;
                if (!t || t._ !== 'messageThreadInfo') throw new Error('getMessageThread returned no thread');
                threadInfo.value = t;
                threadReplyInfo.value = t.reply_info;
                dmHeaderTopic.value = {
                    name: threadHeaderTitle(),
                    photo: chatData.photo,
                };
            } catch (e) {
                console.error('Failed to load message thread:', e);
                throw e;
            }
        } else if (topicId.value) {
            topic.value = undefined;
            dmHeaderTopic.value = undefined;
            threadInfo.value = undefined;
            threadReplyInfo.value = undefined;
            try {
                const t = await topicPromise;
                if (!isGenerationValid(gen)) return;
                if (isDirectMessagesChat.value) {
                    // 私信话题：解析对方名称/头像供 Header 展示
                    const dm = t as Awaited<ReturnType<typeof ensureDmTopic>>;
                    if (dm) {
                        const name = await resolveDmSenderName(dm.sender_id);
                        const dmNames = getSenderNameParts(dm.sender_id);
                        dmHeaderTopic.value = { name, photo: getSenderPhoto(dm.sender_id), firstName: dmNames.first, lastName: dmNames.last };
                    }
                } else {
                    topic.value = t as forumTopic;
                }
            } catch (e) {
                console.error('Failed to load topic:', e);
            }
        } else {
            topic.value = undefined;
            dmHeaderTopic.value = undefined;
            threadInfo.value = undefined;
            threadReplyInfo.value = undefined;
        }

        // 有未读消息时，以最后一条已读收件箱消息作为历史定位锚点
        // 评论线程：不使用会话未读线（属另一会话），首屏固定从线程最新向历史拉、贴底打开
        const lastReadId = threadMode.value
            ? 0
            : chatData.unread_count > 0
                ? chatData.last_read_inbox_message_id
                : 0;
        lastReportedReadMessageId = threadMode.value ? 0 : chatData.last_read_inbox_message_id;
        // 记住打开时的已读线，供「滑进未读」兜底比较（不随 markVisible 前进）
        sessionUnreadBaseId.value = threadMode.value ? 0 : chatData.last_read_inbox_message_id;

        // 浏览位置失效判定（任一命中则删除缓存，改走未读/底部）：
        // 1) 已读线前进（当前 last_read_inbox_message_id > saved.readInboxMaxId，其它端读过/离开期间读过）
        // 2) 滑进未读：anchor 落在未读区（以 UI 未读边界为准，见下文 unreadBoundary）
        let browsePos: BrowsePosition | null = savedBrowsePos;
        if (browsePos) {
            const readInboxMaxId = chatData.last_read_inbox_message_id;
            const readLineChanged = readInboxMaxId > browsePos.readInboxMaxId;
            if (readLineChanged) {
                clearLastBrowsePosition(currentId, topicId.value);
                browsePos = null;
            }
        }

        if (requestedMessageId) {
            const jumped = await jumpToMessageInternal(requestedMessageId, gen);
            if (!isGenerationValid(gen)) return;
            if (jumped) {
                unreadBoundaryMessageId.value = null;
                chatLoadRetryCount = 0;
                refreshWindowReachesLatest();
                if (!threadMode.value) {
                    restoreDraft(currentId, topicId.value, chatData.draft_message);
                }
                void tdlibSend({ _: 'openChat', chat_id: currentId });
                // 先补齐视口再校准锚点，最后才露出列表（避免看到中间态再跳）
                await ensureViewportFilled(gen);
                if (!isGenerationValid(gen) || chatId.value !== currentId) return;
                await nextTick();
                scrollToMessageImmediate(requestedMessageId);
                flashMessage(requestedMessageId);
                listRevealed.value = true;
                isReady.value = true;
                scheduleVisibleMessagesRead();
                void autoOpenMediaFromQuery(gen);
                setTimeout(() => {
                    if (isGenerationValid(gen) && chatId.value === currentId) {
                        scrollToMessage(requestedMessageId);
                    }
                }, 250);
                return;
            }
        }

        // 首屏消息与群组/通知信息并行加载：
        //   - 位置仍有效 → 复用提前发起的 earlyMessages（围绕 anchor 的对称切片）
        //   - 否则有未读 → 围绕最后已读位置拉窗口（offset 合法且非对称过小）
        //   - 否则 → from_message_id=0 从最新消息向历史拉
        // 均走 fetchMessagesPreferLocal：先 TDLib 本地，不足再网络（话题/DM 自动退化为单次网络）
        const firstBatchPromise = (browsePos && earlyMessages) ? earlyMessages : fetchMessagesPreferLocal(
            currentId,
            lastReadId,
            HISTORY_SLICE_LIMIT,
            lastReadId > 0 ? HISTORY_SLICE_OFFSET : 0,
            gen,
            lastReadId > 0
                ? { anchorId: lastReadId, requireUnread: true, lastReadId }
                : {},
        );
        // 群组信息 / 通知静音 / 发送身份与消息正文无关：不再串在首屏关键路径上。
        // 消息先到先渲染，这三项后台补（请求本身、顺序、失败处理都不变，
        // 只是不再让最慢的一个拖住首次露出）。
        void Promise.allSettled([
            fetchGroupInfo(chatData, gen),
            syncNotificationMuteState(chatData, currentId),
            fetchAvailableSenders(currentId, gen),
        ]);
        const firstBatchResult = await firstBatchPromise;
        if (!isGenerationValid(gen)) return;
        if (firstBatchResult == null) {
            throw new Error(`Chat ${currentId} history fetch failed`);
        }
        let firstBatch = firstBatchResult;
        // 评论线程：把 getMessageThread 返回的根消息（讨论组内的帖子副本）并到列表顶部，
        // 保证0评论时也能显示原帖；副本 id 即线程 id，天然比评论消息旧
        if (threadMode.value && threadInfo.value) {
            const roots = (threadInfo.value.messages || []).filter(
                (m): m is import('tdlib-types').message => !!m && !firstBatch.some(x => x.id === m.id),
            );
            if (roots.length > 0) firstBatch = [...roots, ...firstBatch];
        }
        if (firstBatch.length === 0 && chatData.last_message && !threadMode.value) {
            throw new Error(`Chat ${currentId} returned empty history despite having a last message`);
        }
        // earlyMessages 发起时 chat 尚未就绪，群成员状态可能被跳过，这里补拉一次
        if (earlyMessages) {
            void fetchMemberStatuses(firstBatch);
        }

        // 评论线程不按会话未读锚定（未读线属另一会话），始终贴线程底部打开
        const firstUnreadMessage = !threadMode.value && chatData.unread_count > 0
            ? firstBatch.find(message => !message.is_outgoing && (lastReadId === 0 || message.id > lastReadId))
            : undefined;
        const unreadAlbumId = firstUnreadMessage?.media_album_id;
        unreadBoundaryMessageId.value = unreadAlbumId && unreadAlbumId !== '0'
            ? firstBatch.find(message => message.media_album_id === unreadAlbumId)?.id || firstUnreadMessage.id
            : firstUnreadMessage?.id || null;

        // anchor 落在未读区：即使已读线未变，也视为「滑进未读」，下次从第一条未读顶进入
        if (browsePos && isAnchorInUnreadZone(browsePos.anchorId)) {
            clearLastBrowsePosition(currentId, topicId.value);
            browsePos = null;
        }

        // 写入首屏数据（此时列表仍 opacity:0 + 骨架遮罩，用户看不到中间态）
        applyMessages(firstBatch);
        // 首帧只挂视口附近：锚点（或尾部）以上的旧消息先藏起来，露出后逐帧揭示。
        // 缓存窗口已经铺过的会话不再重藏，避免两轮揭示循环打架。
        const firstPaintHidden = cachedWindow
            ? []
            : hideMessagesOutsideFirstPaint(browsePos?.anchorId ?? unreadBoundaryMessageId.value ?? 0);
        // from_message_id=0 或已包含 last_message → 窗口贴真实底部
        if (lastReadId === 0 && !earlyMessages) {
            windowReachesLatest.value = firstBatch.length > 0;
        } else {
            const lastMessageId = chatData.last_message?.id ?? 0;
            const newestInBatch = firstBatch[firstBatch.length - 1]?.id ?? 0;
            windowReachesLatest.value = lastMessageId > 0 && newestInBatch >= lastMessageId;
        }
        // 本地窗口缺真正最新时，后台补全（只 merge，不阻塞 listRevealed、禁止整表 replace）。
        // 仅首屏意图贴最新（from_message_id=0）时触发；历史 browsePos / 未读锚点窗口
        // 本就不要求含最新，否则会白做桥接甚至拉大半段历史。评论线程不适用（桥接拉的是会话历史）。
        if (!earlyMessages && lastReadId === 0 && !threadMode.value) {
            void alignLatestMessagesInBackground(currentId, chatData, gen);
        }
        chatLoadRetryCount = 0;
        // 评论线程不读写会话草稿（草稿 key 与主聊天相同，会互相覆盖）
        if (!threadMode.value) {
            restoreDraft(currentId, topicId.value, chatData.draft_message);
        }
        void tdlibSend({ _: 'openChat', chat_id: currentId });

        // 1) 先按锚点定位（可见前） 2) 补视口 3) 再校准 4) 最后 listRevealed
        /** 首屏定位：缓存有效 → anchor 顶对齐 + pixelFromTop；否则未读顶对齐（预留 separator）/ 贴底 */
        const positionAtAnchor = (): number => {
            if (browsePos && browsePos.anchorId > 0 && messages.value.some(m => m.id === browsePos!.anchorId)) {
                scrollToBrowseAnchor(browsePos.anchorId, browsePos.pixelFromTop);
                return browsePos.anchorId;
            }
            const unreadBoundary = unreadBoundaryMessageId.value;
            if (unreadBoundary != null && unreadBoundary > 0 && messages.value.some(m => m.id === unreadBoundary)) {
                scrollToUnreadAnchor(unreadBoundary);
                return unreadBoundary;
            }
            // 首屏回落到底部 ≠ 用户贴底意图：用纯滚动，避免误清仍然有效的 browsePos
            // （anchor 临时不在 DOM 时常见：相册未渲染、ensureViewportFilled 前测量失败）
            scrollToBottomPure();
            return 0;
        };

        await nextTick();
        positionAtAnchor();

        await ensureViewportFilled(gen);
        if (!isGenerationValid(gen) || chatId.value !== currentId) return;

        await nextTick();
        const anchorAfterFill = positionAtAnchor();

        // 定位与补齐都完成后才露出，避免「先显示再跳到已读/未读」
        listRevealed.value = true;
        isReady.value = true;
        // 首帧只挂了视口附近：剩下的历史逐帧揭示（视口钉扎，用户看不到跳动）
        startFirstPaintReveal(firstPaintHidden);

        // 媒体布局后再校准一次（此时用户已可见，只做小幅纠偏）；
        // 误差 > 12px 再纠一次，允许残余，禁止死循环
        if (anchorAfterFill > 0 && browsePos && anchorAfterFill === browsePos.anchorId) {
            const calAnchorId = browsePos.anchorId;
            const calPixelFromTop = browsePos.pixelFromTop;
            calibrateBrowseAnchor(calAnchorId, calPixelFromTop, true);
            // 首屏分批揭示还没跑完时不要抢滚动位置（揭示本身持视口钉扎，位置是对的）
            setTimeout(() => {
                if (isGenerationValid(gen) && chatId.value === currentId && hiddenOlderIds.value.size === 0) {
                    calibrateBrowseAnchor(calAnchorId, calPixelFromTop, true);
                }
            }, 250);
        } else if (anchorAfterFill > 0 && unreadBoundaryMessageId.value === anchorAfterFill) {
            // 未读锚点：保持顶对齐 + separator 预留，不要用 45% 居中覆盖
            const unreadId = anchorAfterFill;
            setTimeout(() => {
                if (isGenerationValid(gen) && chatId.value === currentId && hiddenOlderIds.value.size === 0) {
                    scrollToUnreadAnchor(unreadId);
                }
            }, 250);
        } else if (anchorAfterFill > 0) {
            setTimeout(() => {
                if (isGenerationValid(gen) && chatId.value === currentId && hiddenOlderIds.value.size === 0) {
                    scrollToMessage(anchorAfterFill);
                }
            }, 250);
        }

        scheduleVisibleMessagesRead();
    } catch (e) {
        console.error("Error loading chat:", e);
        if (chatId.value === currentId && chatLoadRetryCount < 2) {
            chatLoadRetryCount++;
            isReady.value = false;
            // 重试期间保持骨架；若最终失败会在下面露出已有内容
            chatLoadRetryTimer = window.setTimeout(() => {
                chatLoadRetryTimer = null;
                if (chatId.value === currentId) chatLoadRetryToken.value++;
            }, chatLoadRetryCount * 300);
        } else {
            listRevealed.value = true;
            isReady.value = true;
        }
    } finally {
        // 仅当仍是当前这一代加载时解除抑制；
        // 若期间又切换了聊天（gen 已更新），交给新一代自行管理。
        if (loadGeneration === gen) {
            suppressDraftAutosave.value = false;
        }
    }
}, { immediate: true });

// ==================== Data Fetching ====================
/**
 * 从 TDLib 加载消息，返回 旧→新 顺序。
 * 返回约定（区分失败与边界）：
 * - `message[]`：请求成功（可能为空；空 = 该方向历史边界）
 * - `null`：请求失败 / 代数过期，调用方不得标记 exhausted
 * 注意：fromMessageId 会被 TDLib 包含在返回结果中，调用方需自行去重。
 * offset 为负时，limit 必须严格大于 -offset。
 * onlyLocal 仅对普通 getChatHistory 透传；话题/DM 无此参数，忽略该值。
 */
async function fetchMessages(chatIdNum: number, fromMessageId: number, limit: number, offset = 0, generation?: number, onlyLocal = false): Promise<HistoryFetch> {
    // 客户端侧兜底：非法 TDLib 参数直接视为错误，避免服务端拒绝后被当成「边界」
    if (offset < 0 && limit <= -offset) {
        console.error(`fetchMessages: invalid TDLib params limit=${limit} offset=${offset} (limit must be > -offset)`);
        return null;
    }
    try {
        // 评论线程模式：讨论组内 getMessageThreadHistory（消息实体归属讨论组，
        // chat_id/message_id 传线程归属会话与线程 id；TDLib 无 only_local）
        if (threadMode.value && threadInfo.value) {
            const t = threadInfo.value;
            const result = await tdlibSend({
                _: 'getMessageThreadHistory',
                chat_id: t.chat_id,
                message_id: t.message_thread_id,
                from_message_id: fromMessageId,
                offset,
                limit,
            });
            if (generation !== undefined && !isGenerationValid(generation)) return null;
            const msgs: message[] = (result.messages || []).filter((m: any): m is message => !!m);
            if (msgs.length > 0) {
                await fetchSenders(msgs);
                void fetchMemberStatuses(msgs);
                // TDLib 返回 newest-first，反转成 oldest-first
                msgs.reverse();
                return msgs;
            }
            return [];
        }
        // 话题模式：论坛 getForumTopicHistory / 频道私信 getDirectMessagesChatTopicHistory
        // （TDLib 无 only_local，禁止透传）
        const tid = topicId.value;
        const isDm = isDirectMessagesChat.value;
        const result = await tdlibSend(tid
            ? (isDm ? {
                _: 'getDirectMessagesChatTopicHistory',
                chat_id: chatIdNum,
                topic_id: tid,
                from_message_id: fromMessageId,
                offset,
                limit,
            } : {
                _: 'getForumTopicHistory',
                chat_id: chatIdNum,
                forum_topic_id: tid,
                from_message_id: fromMessageId,
                offset,
                limit,
            })
            : {
                _: 'getChatHistory',
                chat_id: chatIdNum,
                from_message_id: fromMessageId,
                offset,
                limit,
                only_local: onlyLocal,
            });
        // 如果生成代数已过期（聊天已切换），丢弃结果
        if (generation !== undefined && !isGenerationValid(generation)) return null;
        let msgs: message[] = (result.messages || []).filter((m: any): m is message => !!m);
        // 本地切片不做网络补全；由 isLocalSliceSufficient 判定不完整后走网络分支补全
        if (msgs.length > 0 && !tid && !onlyLocal) {
            msgs = await completeAlbumMembers(chatIdNum, msgs);
        }
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
        return null;
    }
}

/** 首屏本地优先：判定切片是否够用所需的上下文 */
interface PreferLocalOpts {
    /** 必须被返回区间 [minId, maxId] 覆盖的锚点（browsePos.anchorId 或 lastReadId） */
    anchorId?: number;
    /** 有未读：返回里须能找到第一条未读，否则视为本地不足 */
    requireUnread?: boolean;
    /** 计算第一条未读用的已读线 */
    lastReadId?: number;
}

/** 本地切片是否够用：失败/过少/锚点未覆盖/未读算不出来 → 不够 */
function isLocalSliceSufficient(result: HistoryFetch, opts: PreferLocalOpts): boolean {
    if (result == null) return false;
    if (result.length < HISTORY_LOCAL_MIN) return false;
    // 相册成员可能本地只同步了首尾两条：不完整时强制走网络再取一次，
    // 否则首屏会长期停留在「一个相册只显示 2 个文件」的状态。
    if (hasIncompleteAlbum(result)) return false;
    if (opts.anchorId != null && opts.anchorId > 0 && result.length > 0) {
        let minId = result[0].id;
        let maxId = result[0].id;
        for (const m of result) {
            if (m.id < minId) minId = m.id;
            if (m.id > maxId) maxId = m.id;
        }
        if (opts.anchorId < minId || opts.anchorId > maxId) return false;
    }
    if (opts.requireUnread) {
        const lastReadId = opts.lastReadId ?? 0;
        const firstUnread = result.find(m => !m.is_outgoing && (lastReadId === 0 || m.id > lastReadId));
        if (!firstUnread) return false;
    }
    return true;
}

/**
 * 首屏本地优先两段式：先 onlyLocal，不足再用同一组参数走网络（严格串行，不并行双发）。
 * 话题/DM 无 only_local，直接单次网络请求，与改前行为一致。
 * 对外签名与 fetchMessages 对齐（多一个可选 opts）。
 */
async function fetchMessagesPreferLocal(
    chatIdNum: number,
    fromMessageId: number,
    limit: number,
    offset = 0,
    generation?: number,
    opts: PreferLocalOpts = {},
): Promise<HistoryFetch> {
    // 话题/DM/评论线程：无 onlyLocal（线程历史也没有该参数），直接单次网络请求
    if (topicId.value || threadMode.value) {
        return fetchMessages(chatIdNum, fromMessageId, limit, offset, generation, false);
    }

    const local = await fetchMessages(chatIdNum, fromMessageId, limit, offset, generation, true);
    if (generation !== undefined && !isGenerationValid(generation)) return null;

    if (isLocalSliceSufficient(local, opts)) {
        return local;
    }

    // 第二次发出前再验代数
    if (generation !== undefined && !isGenerationValid(generation)) return null;
    return fetchMessages(chatIdNum, fromMessageId, limit, offset, generation, false);
}

/**
 * 首屏本地窗口缺最新消息时的后台补全。
 * 只做 mergeIntoList（按 id 去重 append/insert），禁止 applyMessages(newest) 整表替换；
 * gap 过大时复用 bridge（BRIDGE_MAX_PAGES），失败就放弃，不替换、不清列表。
 * 不阻塞 listRevealed，不占用 isLoadingMore（避免与滚动加载互斥打架）。
 */
async function alignLatestMessagesInBackground(currentId: number, chatData: chat, gen: number): Promise<void> {
    const lastMessageId = chatData.last_message?.id ?? 0;
    if (lastMessageId <= 0) return;
    // 已含最新：无需补全
    if (messagesMaxId() >= lastMessageId) return;

    const newest = await fetchMessages(currentId, 0, HISTORY_BOTTOM_LIMIT, 0, gen, false);
    if (!isGenerationValid(gen) || chatId.value !== currentId) return;
    if (newest == null || newest.length === 0) return;

    const currentNewestId = messagesMaxId();
    const batchOldestId = newest.reduce((min, m) => (m.id < min ? m.id : min), newest[0].id);
    const batchNewestId = newest.reduce((max, m) => (m.id > max ? m.id : max), newest[0].id);

    const mergeIntoList = (batch: message[]) => {
        if (batch.length === 0) return;
        const ids = new Set(messages.value.map(m => m.id));
        const unique = batch.filter(m => !ids.has(m.id));
        if (unique.length > 0) appendMessages(unique);
    };

    if (currentNewestId <= 0) {
        // 列表仍为空（极端）：直接写入不算「整表替换已有列表」
        applyMessages(newest);
    } else if (currentNewestId >= batchNewestId) {
        mergeIntoList(newest);
    } else if (batchOldestId <= currentNewestId + 1) {
        // 重叠或已连通
        mergeIntoList(newest);
    } else {
        // 存在 gap：从当前末端向更新方向分页桥接（与 handleScrollToBottom 同策略）
        const BRIDGE_MAX_PAGES = 4;
        let newestId = currentNewestId;
        let bridged = false;
        for (let i = 0; i < BRIDGE_MAX_PAGES && newestId < batchNewestId; i++) {
            if (!isGenerationValid(gen) || chatId.value !== currentId) return;
            const page = await fetchMessages(
                currentId,
                newestId,
                HISTORY_NEWER_LIMIT,
                -HISTORY_NEWER_OFFSET,
                gen,
            );
            if (page == null) break;
            const newerOnly = page.filter(m => m.id > newestId);
            if (newerOnly.length === 0) break;
            mergeIntoList(newerOnly);
            newestId = newerOnly.reduce((max, m) => (m.id > max ? m.id : max), newestId);
            if (newestId >= batchOldestId - 1) {
                bridged = true;
                break;
            }
        }
        // 桥接失败：放弃，不替换、不清列表
        if (bridged) {
            mergeIntoList(newest);
        }
    }

    refreshWindowReachesLatest();
}

/**
 * 跳转切片：围绕目标加载连续窗口（LoadMessageSlice）。
 * offset=-K, limit=2K+1 → 目标前后大致各 K 条；limit 必须 > -offset。
 */
async function loadJumpWindow(chatIdNum: number, targetMessageId: number, gen: number): Promise<message[]> {
    const sliced = await fetchMessages(
        chatIdNum,
        targetMessageId,
        HISTORY_SLICE_LIMIT,
        HISTORY_SLICE_OFFSET,
        gen,
    );
    if (!isGenerationValid(gen) || sliced == null) return [];
    if (sliced.length === 0) {
        // 目标可能被删或无权限：退回向旧方向拉一页，至少让跳转不彻底失败
        const fallback = await fetchMessages(chatIdNum, targetMessageId, HISTORY_OLDER_LIMIT, 0, gen);
        if (!isGenerationValid(gen) || fallback == null) return [];
        return [...fallback].sort((a, b) => a.id - b.id);
    }
    return [...sliced].sort((a, b) => a.id - b.id);
}

/**
 * 普通历史加载：只向更旧方向扩展当前列表顶部。
 * 仅在请求成功且确认无更旧消息时标记 exhausted；失败返回 false 但不焊死边界。
 */
/**
 * 分批把 hiddenOlderIds 里的历史消息揭示进 DOM。
 * 每帧只挂一小块（大频道单条 DOM 很重）；块内「挂载 + 视口恢复」同帧完成，
 * 块间才让出 rAF。外层 hold 保证 content-visibility 等高度回流也不挪视口。
 * 顺序：id 从大到小（先揭靠近视口接缝的一侧）。
 */
async function revealOlderMessagesInChunks(ids: number[], gen: number, hold?: ViewportHold) {
    // 大频道单条 DOM 极重（长文+几十个链接），每帧只挂 1 条，保证不出现 50ms 长任务
    const REVEAL_CHUNK = 1;
    const sorted = [...ids].sort((a, b) => b - a);
    try {
        for (let i = 0; i < sorted.length; i += REVEAL_CHUNK) {
            if (gen !== olderRevealGen) return;
            const chunk = sorted.slice(i, i + REVEAL_CHUNK).filter(id => hiddenOlderIds.value.has(id));
            if (chunk.length === 0) continue;

            // 块间让出一帧，给上一帧绘制/布局喘息；本块内变更与恢复必须同帧
            await new Promise<void>(r => requestAnimationFrame(() => r()));
            if (gen !== olderRevealGen) return;

            await withViewportLock(messagesContainer.value, () => {
                const next = new Set(hiddenOlderIds.value);
                for (const id of chunk) next.delete(id);
                hiddenOlderIds.value = next;
            }, nextTick);
            if (gen !== olderRevealGen) return;
        }
    } finally {
        // 揭示结束后再钉几帧，吞掉 content-visibility 估算→真实高度的回流
        hold?.releaseAfterStable(4);
    }
}

async function loadHistoryOlder(loadChatId: number, gen: number): Promise<boolean> {
    if (isLoadingMore.value) return false;

    const oldestId = messages.value.length > 0
        ? messages.value.reduce((min, m) => (m.id < min ? m.id : min), messages.value[0].id)
        : 0;
    if (!oldestId) {
        markOlderExhausted();
        return false;
    }

    isLoadingMore.value = true;
    loadingDirection.value = 'older';
    try {
        const older = await fetchMessages(loadChatId, oldestId, HISTORY_OLDER_LIMIT, 0, gen);
        if (!isGenerationValid(gen) || chatId.value !== loadChatId) return false;
        if (older == null) return false;
        if (older.length === 0) {
            markOlderExhausted();
            return false;
        }

        const existingIds = new Set(messages.value.map(m => m.id));
        const unique = older.filter(m => !existingIds.has(m.id));
        if (unique.length === 0) {
            // 成功返回但无新消息：已到更旧边界
            markOlderExhausted();
            return false;
        }

        // 先把新历史藏进 hiddenOlderIds，再写入 messages：DOM 不会一次性挂载 30 条。
        // 整个加载过程持视口钉扎：插入同帧恢复，高度回流由 RO 拉回。
        const newIds = unique.map(m => m.id);
        olderRevealGen++;
        const revealGen = olderRevealGen;
        const nextHidden = new Set(hiddenOlderIds.value);
        for (const id of newIds) nextHidden.add(id);

        const hold = holdViewport(messagesContainer.value);
        try {
            await withViewportLock(messagesContainer.value, () => {
                hiddenOlderIds.value = nextHidden;
                applyMessages([...unique, ...messages.value], 'older');
            }, nextTick);
        } catch (e) {
            hold.release();
            throw e;
        }

        const el = messagesContainer.value;
        if (el) {
            lastStickyScrollTop = el.scrollTop;
            refreshScrollMetrics(el);
            updateStickyDate(el);
        }

        // 分批揭示：每帧挂载一小块，块内同帧恢复视口；结束后 hold 自行稳定释放。
        // 传全部隐藏 id（含首屏分批挂载的剩余部分）：本轮揭示会顶掉上一轮循环，
        // 不接管这些残留就会永远藏着不显示。
        void revealOlderMessagesInChunks([...nextHidden], revealGen, hold);
        return true;
    } finally {
        isLoadingMore.value = false;
        loadingDirection.value = null;
    }
}

/**
 * 向更“新”的方向扩展当前列表底部。
 * TDLib：from=newestId, offset=-K, limit=K+1 → 比 newestId 更新的至多 K 条 + newestId。
 * newestId 取列表最大 id（不信任数组顺序）。成功且无更新消息 / 已有全部返回结果时标记 exhausted。
 */
async function loadHistoryNewer(loadChatId: number, gen: number): Promise<boolean> {
    if (isLoadingMore.value) return false;

    const newestId = messagesMaxId();
    if (!newestId) {
        markNewerExhausted();
        windowReachesLatest.value = true;
        return false;
    }

    isLoadingMore.value = true;
    loadingDirection.value = 'newer';
    try {
        const newer = await fetchMessages(loadChatId, newestId, HISTORY_NEWER_LIMIT, -HISTORY_NEWER_OFFSET, gen);
        if (!isGenerationValid(gen) || chatId.value !== loadChatId) return false;
        if (newer == null) {
            newerFetchFailStreak++;
            // 连续失败：停止空转，避免“加载中”指示器无限开关造成跳动
            if (newerFetchFailStreak >= 3) {
                markNewerExhausted();
                refreshWindowReachesLatest();
            }
            return false;
        }
        newerFetchFailStreak = 0;

        const filtered = newer.filter(m => m.id > newestId);
        if (filtered.length === 0) {
            markNewerExhausted();
            windowReachesLatest.value = true;
            return false;
        }

        const existingIds = new Set(messages.value.map(m => m.id));
        const unique = filtered.filter(m => !existingIds.has(m.id));
        if (unique.length === 0) {
            // 返回的“更新”消息列表里都已有：说明已覆盖到该切片，视为更新方向边界
            markNewerExhausted();
            refreshWindowReachesLatest();
            return false;
        }

        appendMessages(unique);
        refreshWindowReachesLatest();
        await nextTick();
        refreshScrollMetrics();
        return true;
    } finally {
        isLoadingMore.value = false;
        loadingDirection.value = null;
    }
}

/**
 * 视口补齐：加载切片后若内容撑不满（或两端仍很薄），双向继续拉，
 * 避免跳转/未读锚点后出现空白与「无法触发 onScroll」的死局。
 */
async function ensureViewportFilled(gen: number, maxRounds = 8): Promise<void> {
    for (let round = 0; round < maxRounds; round++) {
        // 列表尚未露出时也要允许补齐（isReady 可能仍为 false）
        if (!isGenerationValid(gen) || !chatId.value) return;
        if (messages.value.length === 0) return;
        const cid = chatId.value;
        await nextTick();

        const el = messagesContainer.value;
        if (!el) return;

        // 有「已加载但暂未挂载」的历史（首屏分批挂载）时，DOM 高度不代表内容不足，
        // 直接视为已够，否则会为了补高度多拉一页网络。
        if (hiddenOlderIds.value.size > 0) return;

        const overflow = el.scrollHeight > el.clientHeight + 2;
        const comfortable = el.scrollHeight >= el.clientHeight * 1.6 && messages.value.length >= 30;
        if (comfortable) return;

        const olderDone = isOlderExhausted();
        const newerDone = isNewerDirectionExhausted();
        if (olderDone && newerDone) return;
        if (overflow && olderDone && newerDone) return;

        let progressed = false;

        // 内容不足或已贴顶 → 向更旧方向扩
        if (!olderDone && (!overflow || el.scrollTop <= SCROLL_PREFETCH_PX)) {
            if (await loadHistoryOlder(cid, gen)) progressed = true;
        }

        if (!isGenerationValid(gen) || chatId.value !== cid) return;
        await nextTick();
        const el2 = messagesContainer.value;
        if (!el2) return;

        const stillShort = el2.scrollHeight <= el2.clientHeight + 2;
        const atBottomish = el2.scrollTop + el2.clientHeight >= el2.scrollHeight - SCROLL_PREFETCH_PX;
        // 窗口已贴真实最新：向更新方向必然为空，直接记边界，省掉首屏那次空网络往返
        if (windowReachesLatest.value) {
            markNewerExhausted();
        } else if (!isNewerDirectionExhausted() && (stillShort || atBottomish || !overflow)) {
            if (await loadHistoryNewer(cid, gen)) progressed = true;
        }

        if (!progressed) return;
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
        // 自动翻译字段在 supergroup 上（TDLib has_automatic_translation）
        hasAutomaticTranslation.value = !!sg.has_automatic_translation;
        supergroupFullReady.value = true;
        maybePromptTranslatePremium();
        // fullInfo：关联频道等
        try {
            const fullInfo = await tdlibSend({
                _: 'getSupergroupFullInfo',
                supergroup_id: chatData.type.supergroup_id
            });
            if (!isGenerationValid(gen)) return;
            linkedChatId.value = fullInfo.linked_chat_id;
        } catch (e) {
            console.error('Failed to load supergroup full info:', e);
        }
    } else if (chatData.type._ === 'chatTypeBasicGroup') {
        const bg = await tdlibSend({ _: 'getBasicGroup', basic_group_id: chatData.type.basic_group_id });
        if (!isGenerationValid(gen)) return;
        basicGroups.value[chatData.type.basic_group_id] = bg;
        hasAutomaticTranslation.value = false;
        supergroupFullReady.value = true;
        maybePromptTranslatePremium();
    } else {
        // 私聊等：无自动翻译
        hasAutomaticTranslation.value = false;
        supergroupFullReady.value = true;
        maybePromptTranslatePremium();
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
/**
 * 滚动路径布局缓存：scrollHeight/clientHeight 在加载/消息变化后刷新。
 * onScroll 读 scrollTop + 本缓存即可做预取判断，避免高频读写交错强制回流。
 */
const scrollMetrics = { h: 0, c: 0 };

function refreshScrollMetrics(el?: HTMLElement | null) {
    const target = el ?? messagesContainer.value;
    if (!target) return;
    scrollMetrics.h = target.scrollHeight;
    scrollMetrics.c = target.clientHeight;
}

/** 历史预取：scroll 只调度，真正读边界并加载放到下一帧（读写分离） */
let historyPrefetchRaf = 0;
function cancelHistoryPrefetch() {
    if (historyPrefetchRaf) {
        cancelAnimationFrame(historyPrefetchRaf);
        historyPrefetchRaf = 0;
    }
}

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

    // 一次建 Map，避免循环内 O(n) find（大量未读频道会退化成 O(n²)）
    const msgById = new Map<number, message>();
    for (const m of messages.value) msgById.set(m.id, m);

    const containerRect = container.getBoundingClientRect();
    const visibleUnreadIds = new Set<number>();
    const renderedMessages = container.querySelectorAll<HTMLElement>('[data-msg-id]');

    // 先只读几何信息（不写 DOM），避免读写交错触发多次强制重排
    const visibleIds: number[] = [];
    for (const element of renderedMessages) {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) continue;
        const messageId = Number(element.dataset.msgId);
        if (messageId > 0) visibleIds.push(messageId);
    }

    for (const messageId of visibleIds) {
        const renderedMessage = msgById.get(messageId);
        if (!renderedMessage) continue;

        const albumId = renderedMessage.media_album_id;
        const visibleMessages = albumId && albumId !== '0'
            ? messages.value.filter(message => message.media_album_id === albumId)
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
            // 评论线程：消息实体在讨论组，需用讨论组 chat_id 标记已读（推进线程已读线）
            chat_id: threadMode.value && threadInfo.value ? threadInfo.value.chat_id : currentChatId,
            message_ids: messageIds,
            force_read: true,
            source: threadMode.value
                ? ({ _: 'messageSourceMessageThreadHistory' } as const)
                : topicId.value
                    ? (isDirectMessagesChat.value
                        ? { _: 'messageSourceDirectMessagesChatTopicHistory' } as const
                        : { _: 'messageSourceForumTopicHistory' } as const)
                    : undefined,
        });
        // 已读线前进：同步缓存里的 readInboxMaxId，避免退出再进时被「已读线变化」误失效
        // 评论线程不写浏览位置缓存（与主聊天共用 key，会互相污染）
        if (!threadMode.value) {
            bumpBrowsePosReadInboxMaxId(currentChatId, topicId.value, latestVisibleId);
        }
    } catch (e) {
        if (chatId.value === currentChatId && lastReportedReadMessageId === latestVisibleId) {
            lastReportedReadMessageId = previousReportedId;
        }
        console.error('Failed to mark visible messages as read:', e);
    }
}

/** 检测是否在底部附近（优先用缓存的 scrollHeight/clientHeight，减少滚动路径布局读） */
const isAtBottom = (threshold = 150): boolean => {
    const el = messagesContainer.value;
    if (!el) return true;
    const h = scrollMetrics.h || el.scrollHeight;
    const c = scrollMetrics.c || el.clientHeight;
    return el.scrollTop + c >= h - threshold;
};

/** 滚动到底部（标准 flex-col：scrollTop = scrollHeight - clientHeight） */
const scrollToBottom = () => {
    showScrollButton.value = false;
    stickyDateHidden.value = true;
    nextTick(() => {
        const el = messagesContainer.value;
        if (!el) return;
        // 布局读一次算目标值，写后不回读 scrollTop，避免强制二次布局
        const top = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = top;
        lastStickyScrollTop = top;
    });
};

/** 同步滚动到指定消息（调用方需已 await nextTick，DOM 已更新） */
function scrollToMessageImmediate(messageId: number): boolean {
    const el = messagesContainer.value;
    if (!el) return false;
    const target = messages.value.find(message => message.id === messageId);
    const renderedMessageId = target?.media_album_id && target.media_album_id !== '0'
        ? messages.value.find(message => message.media_album_id === target.media_album_id)?.id || messageId
        : messageId;
    const msgEl = el.querySelector(`[data-msg-id="${renderedMessageId}"]`) as HTMLElement | null;
    if (!msgEl) return false;

    const containerRect = el.getBoundingClientRect();
    const msgRect = msgEl.getBoundingClientRect();
    const delta = msgRect.top - containerRect.top;
    const desired = el.scrollTop + delta - el.clientHeight * 0.45 + msgRect.height / 2;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const next = Math.max(0, Math.min(Math.round(desired), max));
    el.scrollTop = next;
    lastStickyScrollTop = next;
    return true;
}

/** 同步滚到底部（不触碰浏览位置缓存；首屏定位/测量失败回落用） */
function scrollToBottomPure() {
    const maxId = messages.value[messages.value.length - 1]?.id ?? 0;
    if (maxId > latestUnreadSeenId.value) latestUnreadSeenId.value = maxId;
    showScrollButton.value = false;
    stickyDateHidden.value = true;
    const el = messagesContainer.value;
    if (!el) return;
    // 先读布局算出目标 scrollTop，一次写入且不回读，避免写后读触发二次 Recalculate style
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = top;
    lastStickyScrollTop = top;
}

/** 同步滚到底部（用户贴底意图：清掉浏览位置缓存，下次进入直接到底部） */
function scrollToBottomImmediate() {
    if (chatId.value !== undefined) {
        cancelScheduledBrowsePosSave();
        clearLastBrowsePosition(chatId.value, topicId.value);
    }
    scrollToBottomPure();
}

/** 滚动到指定消息元素，将其放在视口约 45% 位置（基于 getBoundingClientRect，避免 offsetTop 偏差） */
const scrollToMessage = (messageId: number) => {
    nextTick(() => {
        if (scrollToMessageImmediate(messageId)) return;
        // 布局尚未稳定时再校准一次
        requestAnimationFrame(() => scrollToMessageImmediate(messageId));
    });
};

/**
 * 统一跳转函数：加载目标为中心的连续切片并定位；随后补齐视口，避免空白与无法继续加载。
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

    const lastMessageId = chat.value?.last_message?.id ?? 0;
    windowReachesLatest.value = lastMessageId > 0
        && windowMessages.some(m => m.id === lastMessageId);

    // 会话内跳转（列表已露出）：定位 + 后台补视口
    // 首屏带 message 打开：只写入数据并定位，由 watch 负责补视口后统一 reveal
    if (listRevealed.value) {
        isReady.value = true;
        await nextTick();
        scrollToMessageImmediate(messageId);
        flashMessage(messageId);
        void ensureViewportFilled(gen).then(() => {
            if (isGenerationValid(gen) && chatId.value === currentChatId) {
                scrollToMessage(messageId);
            }
        });
        setTimeout(() => {
            if (isGenerationValid(gen) && chatId.value === currentChatId) {
                scrollToMessage(messageId);
            }
        }, 300);
    } else {
        await nextTick();
        scrollToMessageImmediate(messageId);
    }

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
/** 解析相册/单条消息在 DOM 上的锚点节点（相册挂在第一条 media 的 data-msg-id 上） */
function findRenderedMsgEl(el: HTMLElement, messageId: number): HTMLElement | null {
    const direct = el.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
    if (direct) return direct;
    const target = messages.value.find(m => m.id === messageId);
    if (target?.media_album_id && target.media_album_id !== '0') {
        const albumFirst = messages.value.find(m => m.media_album_id === target.media_album_id);
        if (albumFirst) {
            return el.querySelector<HTMLElement>(`[data-msg-id="${albumFirst.id}"]`);
        }
    }
    return null;
}

/**
 * 浏览位置恢复：anchor 顶对齐 + pixelFromTop。
 * pixelFromTop 是保存时「元素 top 相对容器顶」的偏移，不是相对 window 视口。
 * 恢复时把该偏移重新对齐到容器顶，从而还原同一屏内容。
 */
function scrollToBrowseAnchor(anchorId: number, pixelFromTop: number): boolean {
    const el = messagesContainer.value;
    if (!el) return false;
    const msgEl = findRenderedMsgEl(el, anchorId);
    if (!msgEl) return false;
    const refTop = el.getBoundingClientRect().top;
    const msgTop = msgEl.getBoundingClientRect().top;
    const delta = msgTop - refTop;
    const desired = el.scrollTop + delta - pixelFromTop;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const next = Math.max(0, Math.min(Math.round(desired), max));
    el.scrollTop = next;
    lastStickyScrollTop = next;
    return true;
}

/**
 * 未读锚点定位：第一条未读顶对齐，并为未读 separator 预留高度
 * （separator 在首条未读上方，预留后露出时不会把它顶出视口）。
 */
function scrollToUnreadAnchor(messageId: number): boolean {
    const el = messagesContainer.value;
    if (!el) return false;
    const msgEl = findRenderedMsgEl(el, messageId);
    if (!msgEl) return false;
    const refTop = el.getBoundingClientRect().top;
    const msgTop = msgEl.getBoundingClientRect().top;
    const sep = el.querySelector<HTMLElement>('[data-unread-sep]');
    // separator 自身高度 + my-3 上下边距；无 separator 节点时用固定预留
    const reserve = sep
        ? sep.getBoundingClientRect().height + 24
        : UNREAD_SEP_RESERVE_PX;
    const delta = msgTop - refTop;
    const desired = el.scrollTop + delta - reserve;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const next = Math.max(0, Math.min(Math.round(desired), max));
    el.scrollTop = next;
    lastStickyScrollTop = next;
    return true;
}

/**
 * 浏览位置校准：测量当前 anchor 顶相对容器顶的偏移，与 pixelFromTop 比较。
 * 误差 > 12px 再纠一次（allowRetry），允许残余误差，禁止死循环。
 */
function calibrateBrowseAnchor(anchorId: number, pixelFromTop: number, allowRetry: boolean) {
    const el = messagesContainer.value;
    if (!el) return;
    const msgEl = findRenderedMsgEl(el, anchorId);
    if (!msgEl) return;
    const refTop = el.getBoundingClientRect().top;
    const msgTop = msgEl.getBoundingClientRect().top;
    const current = msgTop - refTop;
    const error = Math.abs(current - pixelFromTop);
    if (error <= BROWSE_POS_TOLERANCE_PX) return;
    if (!allowRetry) return;
    scrollToBrowseAnchor(anchorId, pixelFromTop);
    requestAnimationFrame(() => {
        calibrateBrowseAnchor(anchorId, pixelFromTop, false);
    });
}

/**
 * 计算并保存当前浏览位置。
 * 返回保存的位置；贴底 / 滑进未读 / 无锚点时清空缓存并返回 null。
 */
function captureBrowsePosition(el: HTMLElement, id: number, tid?: number | null): BrowsePosition | null {
    if (!el) return null;
    // 容器自身的视口位置是常数参考点：消息 rect.top 越接近它，越靠近容器顶部（scrollTop=0 处）
    const refTop = el.getBoundingClientRect().top;
    let bestId = 0;
    let bestDistance = Infinity;
    let bestPixelFromTop = 0;
    for (const node of el.querySelectorAll<HTMLElement>('[data-msg-id]')) {
        const msgId = Number(node.dataset.msgId || '0');
        if (msgId <= 0) continue;
        // 消息元素顶部所在行（元素首行可见场景很少，用整条消息顶边即可）
        const top = node.getBoundingClientRect().top;
        const distance = Math.abs(top - refTop);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestId = msgId;
            // 元素 top 相对容器顶的偏移（不是相对 window 视口）
            bestPixelFromTop = top - refTop;
        }
    }
    if (bestId <= 0) {
        clearLastBrowsePosition(id, tid);
        return null;
    }

    // 用本地已上报与 TDLib 两侧的较大值，避免「已读回执晚于 capture」造成 readInboxMaxId 过期
    const readInboxMaxId = Math.max(chat.value?.last_read_inbox_message_id ?? 0, lastReportedReadMessageId);
    // 滑进未读 → 删除缓存，下次进入走未读/底部（与进入会话共用 isAnchorInUnreadZone）
    if (isAnchorInUnreadZone(bestId)) {
        clearLastBrowsePosition(id, tid);
        return null;
    }

    const pos: BrowsePosition = {
        anchorId: bestId,
        pixelFromTop: bestPixelFromTop,
        readInboxMaxId,
        savedAt: Date.now(),
    };
    setBrowsePosition(id, tid, pos);
    return pos;
}

/** 滚动 debounce 写入浏览位置（300ms）；贴底时仍立即 clear */
let browsePosSaveTimer: number | null = null;

function cancelScheduledBrowsePosSave() {
    if (browsePosSaveTimer !== null) {
        window.clearTimeout(browsePosSaveTimer);
        browsePosSaveTimer = null;
    }
}

function scheduleBrowsePosSave(el: HTMLElement) {
    // 评论线程不落浏览位置（与主聊天共用 chatId+topicId key，会污染主聊天锚点）
    if (threadMode.value) return;
    cancelScheduledBrowsePosSave();
    browsePosSaveTimer = window.setTimeout(() => {
        browsePosSaveTimer = null;
        if (chatId.value === undefined || !listRevealed.value) return;
        captureBrowsePosition(el, chatId.value, topicId.value);
    }, 300);
}

/** 切换/卸载前冲刷 debounce 中的浏览位置（用旧 chatId 写入） */
function flushScheduledBrowsePosSave(id: number, tid?: number | null) {
    if (browsePosSaveTimer === null) return;
    cancelScheduledBrowsePosSave();
    const el = messagesContainer.value;
    if (!el || !listRevealed.value) return;
    captureBrowsePosition(el, id, tid);
}

const onScroll = (e: Event) => {
    // 首屏「定位/补齐但尚未露出」阶段：忽略滚动事件，
    // 避免程序化 scrollTop 触发加载，或把中间态写入上次浏览位置缓存。
    if (!listRevealed.value) return;

    const el = e.currentTarget as HTMLElement;
    // 滚动路径只读 scrollTop + 缓存的 H/C，避免与后续写交错强制回流
    const nextTop = el.scrollTop;
    if (nextTop > lastStickyScrollTop + 1) {
        stickyDateHidden.value = true;
    } else if (nextTop < lastStickyScrollTop - 1) {
        stickyDateHidden.value = false;
    }
    lastStickyScrollTop = nextTop;
    // 吸顶日期需在跳底抑制窗口内也更新（程序化滚动同样会改变日期相对顶缘的位置）
    // rAF 合帧，避免高频 scroll 事件每次都触发 DOM 测量
    scheduleUpdateStickyDate(el);

    if (!scrollMetrics.h || !scrollMetrics.c) refreshScrollMetrics(el);
    const H = scrollMetrics.h;
    const C = scrollMetrics.c;
    const T = nextTop;
    const atBottom = T + C >= H - SCROLL_PREFETCH_PX;

    // 记录当前浏览位置（用户手动滚动时 debounce 写入顶部可见消息）
    // 贴底时立即清空缓存位置（下次进入直接到底部，能自动看到新消息）
    if (chatId.value !== undefined) {
        if (atBottom) {
            cancelScheduledBrowsePosSave();
            clearLastBrowsePosition(chatId.value, topicId.value);
        } else {
            scheduleBrowsePosSave(el);
        }
    }

    // 程序化跳底后的短暂窗口：避免 onScroll 与 scrollToBottom/load 互相打架
    if (Date.now() < scrollLoadSuppressedUntil) {
        // 即使在抑制窗口内，也要推进视口翻译（全部翻译模式）
        if (chatTranslateOn.value) scheduleViewportTranslate();
        return;
    }

    // 全部翻译：滚动时按需翻译新进入视口的消息
    if (chatTranslateOn.value) scheduleViewportTranslate();

    // 底部检测
    showScrollButton.value = !atBottom;
    if (atBottom) {
        const maxId = messages.value[messages.value.length - 1]?.id ?? 0;
        if (maxId > latestUnreadSeenId.value) latestUnreadSeenId.value = maxId;
    }
    scheduleVisibleMessagesRead();

    if (!chatId.value || !isReady.value) return;

    // 历史预取推迟到下一帧：本帧只做 UI 状态，加载（写 DOM）与滚动读分离
    cancelHistoryPrefetch();
    historyPrefetchRaf = requestAnimationFrame(() => {
        historyPrefetchRaf = 0;
        void maybePrefetchHistory(el);
    });
};

/** rAF 内再读一次边界并按需拉历史（与 scroll 读路径分离） */
async function maybePrefetchHistory(el: HTMLElement) {
    if (!listRevealed.value || !chatId.value || !isReady.value) return;
    if (Date.now() < scrollLoadSuppressedUntil) return;
    if (isLoadingMore.value) return;

    refreshScrollMetrics(el);
    const H = scrollMetrics.h;
    const C = scrollMetrics.c;
    const T = el.scrollTop;
    const scrollGen = loadGeneration;
    const loadChat = chatId.value;

    // 内容未溢出：不能靠滚动触发加载，交给视口补齐（跳转/未读锚点后常见）
    if (H <= C + 2) {
        if (!isLoadingMore.value && messages.value.length > 0) {
            void ensureViewportFilled(scrollGen);
        }
        return;
    }

    // 距边预取，降低高速滚动空白
    const atTop = T <= SCROLL_PREFETCH_PX;
    const nearBottom = T + C >= H - SCROLL_PREFETCH_PX;
    if (messages.value.length === 0) return;

    // jump / normal 共用同一套两端扩展；exhausted 标志按模式读取
    if (atTop && !isOlderExhausted()) {
        await loadHistoryOlder(loadChat, scrollGen);
        return;
    }
    if (nearBottom && !isNewerDirectionExhausted()) {
        await loadHistoryNewer(loadChat, scrollGen);
    }
}

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
        const attachStore = useAttachmentStore();
        // 编辑期间新粘贴 / 拖入 / 选择的文件：横幅「更换」优先，其次取附件栏第一个
        const trayMedia = attachStore.items[0] ?? null;
        const mediaToSend = editMediaReplacement.value ?? trayMedia;
        const isMedia = isMediaMessage(target) || editHasMedia.value;
        // 文本消息不允许空内容；媒体消息（含即将被改成媒体的文本消息）允许清空描述
        if (!text.trim() && !isMedia && !mediaToSend) return;
        try {
            const richEntities = (typeof input === 'string' ? [] : input.entities || []) as textEntity$Input[];
            const customEmojiEntities = buildCustomEmojiEntities(text);
            const parsed = await withParsedMarkdown(text, [...richEntities, ...customEmojiEntities]);
            const entities = parsed.entities;
            let ok = false;
            if (mediaToSend) {
                // 原消息已是媒体 → 按原类型校验可替换性（图片↔视频、文件↔音乐…）；
                // 纯文本消息 → 直接把消息体改成媒体，类型由分类结果决定
                let kind = mediaToSend.kind;
                if (editHasMedia.value) {
                    const resolved = resolveEditReplaceKind(target.content._, mediaToSend.kind, mediaToSend.name);
                    if (!resolved.ok) {
                        toast.warning(resolved.reason);
                        return;
                    }
                    kind = resolved.kind;
                } else if (target.content._ !== 'messageText') {
                    // 既不是媒体消息、也不是纯文本（投票 / 贴纸 / 位置…）→ 无处安放附件
                    toast.warning(t('chat.replaceUnsupported'));
                    return;
                }
                const content = buildEditMediaContent({ ...mediaToSend, kind }, parsed.text, entities);
                ok = await editMessageMediaContent(target.chat_id || chatId.value, target.id, content);
            } else if (isMedia) {
                // 仅改描述
                ok = await editCaptionMessage(target.chat_id || chatId.value, target.id, parsed.text, entities);
            } else {
                ok = await editTextMessage(target.chat_id || chatId.value, target.id, parsed.text, entities);
            }
            if (ok) {
                messageInput.value = '';
                pendingCustomEmoji.value = [];
                editingMsg.value = null;
                editSeedEntities.value = null;
                editMediaPreviewSrc.value = null;
                editMediaReplacement.value = null;
                // 用掉的附件从托盘移除；编辑期间多选的文件留在托盘，退出编辑后可单独发送
                if (trayMedia && mediaToSend === trayMedia) {
                    attachStore.remove(trayMedia.id);
                    if (attachStore.items.length > 0) {
                        toast.info(t('chat.editMediaRestKept', { count: attachStore.items.length }));
                    }
                }
                cancelLocalDraftTimer();
                // 编辑成功后恢复进入编辑前保存的草稿，避免输入框被清空丢失草稿视图
                // （评论线程不读写会话草稿）
                if (chatId.value !== undefined && !threadMode.value) {
                    suppressDraftAutosave.value = true;
                    restoreDraft(chatId.value, topicId.value, chat.value?.draft_message);
                    // restore 触发的模型更新在 nextTick 后结束，再解除抑制
                    void nextTick(() => {
                        suppressDraftAutosave.value = false;
                    });
                }
            } else {
                // 编辑失败：文本与实体还回输入框，附件仍留在托盘，避免用户重打
                messageInput.value = parsed.text;
                editSeedEntities.value = entities as textEntity$Input[];
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
        let sentResult: SendAttachmentsResult | null = null;
        try {
            // 附件描述也必须过 TDLib 的 Markdown 判断，且要带上输入框实体
            // （格式菜单 + 自定义 emoji），否则描述里的 custom emoji 会丢
            const richEntities = (typeof input === 'string' ? [] : input.entities || []) as textEntity$Input[];
            const customEmojiEntities = buildCustomEmojiEntities(text);
            const caption = await withParsedMarkdown(text, [...richEntities, ...customEmojiEntities]);
            sentResult = await sendAttachments(
                attachStore.items,
                {
                    chatId: outgoingChatId() ?? chatId.value,
                    topicId: topicId.value,
                    // 评论线程：消息发到讨论组的线程（优先于 topicId）
                    threadId: threadMode.value ? threadInfo.value?.message_thread_id : undefined,
                    isDm: isDirectMessagesChat.value,
                    replyTo: replyToInput() ?? null,
                },
                caption,
            );
        } finally {
            sending.value = false;
        }
        // sendMessageAlbum / sendMessage 会返回已发送消息的完整列表。
        // 立即合并进消息列表，避免仅依赖 updateNewMessage 时相册成员被丢弃或延迟，
        // 保证一次发送的多个文件全部显示出来。
        if (sentResult && sentResult.messages.length > 0) {
            await fetchSenders(sentResult.messages);
            void fetchMemberStatuses(sentResult.messages);
            appendMessages(sentResult.messages);
            // 发送后贴底展示刚发出的文件（与 updateNewMessage 的发送者贴底行为保持一致）
            scrollToBottom();
        }
        await attachStore.clearWithCleanup();
        messageInput.value = '';
        // 已随描述发出，清空 emoji 队列，避免残留 id 在后续文本发送中被重复匹配
        pendingCustomEmoji.value = [];
        clearReply();
        return;
    }
    if (!text.trim()) return;
    try {
        // 富文本实体（来自输入框格式菜单）与自定义 emoji 实体会并，再交给 TDLib 判断 Markdown
        const richEntities = (typeof input === 'string' ? [] : input.entities || []) as textEntity$Input[];
        const customEmojiEntities = buildCustomEmojiEntities(text);
        const parsed = await withParsedMarkdown(text, [...richEntities, ...customEmojiEntities]);
        await sendMessageContent({
            _: 'inputMessageText',
            text: { _: 'formattedText', text: parsed.text, entities: parsed.entities },
            clear_draft: true,
        });
        messageInput.value = '';
        pendingCustomEmoji.value = [];
        // 发送成功后清除本地草稿与 TDLib 草稿，并清除回复状态（评论线程不触碰会话草稿）
        if (chatId.value !== undefined && !threadMode.value) {
            clearDraft(chatId.value, topicId.value);
        }
        clearReply();
    } catch (e) {
        console.error("Failed to send message:", e);
    }
};

// ==================== 表情包面板发送（贴纸 / GIF） ====================
/** 发送贴纸：inputMessageSticker(inputSticker(inputFileId(文件id))) */
async function sendSticker(fileId: number | string) {
    const fid = Number(fileId);
    if (!chatId.value || !fid) return;
    try {
        await sendMessageContent({
            _: 'inputMessageSticker',
            sticker: { _: 'inputSticker', sticker: { _: 'inputFileId', id: fid } },
            emoji: '',
        });
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
            await sendMessageContent({
                _: 'inputMessageAnimation',
                animation: { _: 'inputAnimation', animation: { _: 'inputFileId', id: fileId } },
                caption: { _: 'formattedText', text: '', entities: [] },
            });
            clearReply();
        } catch (e) {
            console.error("Failed to send animation:", e);
        }
    })();
}

// ==================== 附件发送 ====================
// 图片/视频选择与分类在 MessageInput 内完成（打开系统文件选择器 + 剪贴板粘贴），
// 通过附件 store 累积；handleSend 统一处理发送。
const isMePremium = computed(() => !!userProfile.value?.is_premium);

/**
 * 思考档位（AiPromptBar 默认六档：关闭 + 低 / 中 / 高 / 极高 / 最高）→ llmsdk 思考强度键。
 * 顺序必须与 AiPromptBar 的档位表一致；只发标准值（none / minimal / low / medium / high）：
 * llmsdk 还有 xhigh，但 OpenAI / DeepSeek 这类严格校验枚举的接口会直接 400，所以最高两档都落在 high。
 */
const AI_EFFORT_KEYS = ['none', 'minimal', 'low', 'medium', 'high', 'high'] as const;

/** 新建会话时的兜底标题：用户这句话的第一行，截断到 24 字（模型之后可以改） */
function titleFromQuestion(text: string): string {
    const line = (text.trim().split(/\r?\n/)[0] ?? '').trim();
    return line.length > 24 ? `${line.slice(0, 24)}…` : line;
}

/**
 * AI 输入框「+ → 图片」：只负责选图，不做上传。
 * 选到的本机路径随请求发给 Rust，由 ai_chat::to_prompt 读盘转成多模态图片段。
 */
async function pickAiImages(): Promise<string[]> {
    const selected = await openDialog({
        multiple: true,
        title: t('chat.choosePhotoOrVideo'),
        filters: [{
            name: t('chat.photosAndVideos'),
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif'],
        }],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
}

/**
 * AI 输入框的发送：跑一轮 agent（utils/aiChat）。活动条实时显示思考 / 输出 / 工具调用；
 * 写类工具先挂审核卡片（见 requestAiApproval），批准后才执行。用量由 aiChat 每次请求后记入当前对话。
 */
async function onAiPromptSend(text: string, detail: { effort?: string; attachments?: string[]; command?: string }) {
    const chatIdNow = currentChatId();
    if (aiBusy.value || !chatIdNow) return;
    // 引用回复：只给模型定位信息（正文让它自己 get_message 取），引用由输入框顶部的蓝色占位芯片承载
    const quote = aiQuote.value;
    aiQuote.value = null;
    const body = text.trim();
    // 只发图不写字：给请求和活动条一个占位，别出现一句空白提问
    const asked = body || (detail.attachments?.length ? t('aiInput.imageOnly') : '');
    // 引用只给模型 id（走 system prompt，正文它自己 get_message 取）：用户消息保持输入框里那句话，
    // 活动条 / 历史显示的就是原样文本
    const prompt = asked || text;
    if (!aiProviders.loaded) await loadAiProviders();
    const provider = aiProviders.list.find((p) => p.id === settings.ai.providerId);
    const model = provider?.models.find((m) => m.id === settings.ai.model);
    if (!provider || !model || !aiProviderReady(provider)) {
        void toast.warning(t('aiSettings.notReady'));
        return;
    }
    // 历史按会话落盘：先把该聊天的会话列表拉到（可能还在加载），再决定用哪个 / 要不要新建，
    // 否则列表还没到就发消息会凭空多出一个会话（旧会话看着就「不见了」）
    if (!aiConversations.loaded || aiConversations.chatId !== chatIdNow) await loadConversations(chatIdNow);
    let conversation = activeConversation(chatIdNow);
    if (!conversation) {
        // 新建会话：标题先用用户这句话兜底（只发图时用文件名），模型在第一轮里可以用 set_conversation_title 换掉
        const firstImage = ((detail.attachments?.[0] ?? '').split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '');
        conversation = await createConversation(chatIdNow, titleFromQuestion(body || firstImage || text));
    }
    if (!conversation) {
        void toast.error(t('aiConversations.createFailed'));
        return;
    }
    const labels = [
        t('aiInput.effortOff'),
        t('aiInput.effortLow'),
        t('aiInput.effortMedium'),
        t('aiInput.effortHigh'),
        t('aiInput.effortExtra'),
        t('aiInput.effortMax'),
    ];
    const effortIdx = labels.indexOf(detail.effort ?? '');
    const effort = effortIdx >= 0 ? AI_EFFORT_KEYS[effortIdx] : null;

    const controller = new AbortController();
    aiAbort = controller;
    aiBusy.value = true;
    // 不清空活动条：刚读回来的历史留在上面，这一轮接着往下追加（看得见上下文）
    const sink: AiActivitySink = {
        add: (e) => {
            if (!controller.signal.aborted) aiActivityEntries.value = [...aiActivityEntries.value, e];
        },
        update: (id, patch) => {
            if (!controller.signal.aborted)
                aiActivityEntries.value = aiActivityEntries.value.map((e) => (e.id === id ? { ...e, ...patch } : e));
        },
        // 流式中途失败要重试：把这次尝试画了一半的条目撤掉（见 utils/aiChat 的 callModel）
        remove: (ids) => {
            const drop = new Set<string | number>(ids);
            aiActivityEntries.value = aiActivityEntries.value.filter((e) => !drop.has(e.id));
        },
    };
    try {
        await runAiTurn({
            chatId: chatIdNow,
            // 当前所在线程：论坛话题 / 频道直通消息 / 评论线程。不告诉模型，它读整个聊天、发到 General
            thread: threadMode.value && threadInfo.value
                ? { id: threadInfo.value.message_thread_id, chatId: threadInfo.value.chat_id, kind: 'comment' }
                : topicId.value
                    ? { id: topicId.value, chatId: chatIdNow, kind: isDirectMessagesChat.value ? 'dm' : 'forum' }
                    : undefined,
            conversationId: conversation.id,
            title: conversation.title,
            text: prompt,
            quote: quote ? { chatId: quote.chatId, messageId: quote.messageId } : undefined,
            command: detail.command,
            images: detail.attachments,
            provider,
            model,
            effort,
            sink,
            signal: controller.signal,
            // 群 / 频道的写权限：没「删他人消息 / 封禁」权限就不给对应工具，只读频道还告诉模型别在此发言
            perms: aiTurnPermissions.value,
        });
    } catch (e) {
        if (e instanceof AiTurnLimitError) {
            void toast.warning(t('aiInput.maxSteps'));
        } else {
            // 失败原因写进活动条（对话里看得见），别只在 toast 里闪一下
            const reason = e instanceof Error ? e.message : String(e);
            sink.add({
                id: `ai-failed-${Date.now()}`,
                kind: 'output',
                status: 'error',
                text: t('aiActivity.requestFailed', { reason }),
            });
            void toast.error(reason);
        }
    } finally {
        // 停止时已经提前收尾（onAiStop），这里只收自己那一轮
        if (aiAbort === controller) {
            aiAbort = null;
            aiBusy.value = false;
        }
    }
}

/** 停止：立即释放输入框，并让 Rust 真正中断请求（abort 只停界面，不传后端），挂着的审核卡片按拒绝收掉 */
function onAiStop() {
    aiAbort?.abort();
    cancelAiStream();
    aiAbort = null;
    aiBusy.value = false;
    resolveAiActivity(false);
}

// ==================== AI 会话（对话）管理 ====================
const {
    conversationsOpen, currentChatId, aiUsage, aiConversationList, aiConversationsLoading,
    onConversationCreate, onConversationOpen, onConversationRename, onConversationRemove,
} = useAiConversation({
    chatId,
    aiActivityEntries,
    stopTurn: () => { if (aiBusy.value) onAiStop(); },
});

/** 审核卡片的结果：批准 / 拒绝都 resolve 掉挂起的那次写类工具调用（一次只挂一个） */
function resolveAiActivity(granted: boolean) {
    const settle = pendingApproval;
    pendingApproval = null;
    aiActivityApproval.value = null;
    settle?.(granted ? { granted: true } : { granted: false, reason: '用户拒绝' });
}

/** 审核通道（call.ts 在写类工具执行前调用）：挂卡片，等用户点批准 / 拒绝 */
function requestAiApproval(req: ApprovalRequest): Promise<ApprovalDecision> {
    resolveAiActivity(false);
    aiActivityApproval.value = { title: req.summary, reason: req.reason };
    return new Promise((resolve) => {
        pendingApproval = resolve;
    });
}
setApprovalGate(requestAiApproval);
watch(() => settings.ai.approval, (policy) => setApprovalPolicy(policy), { immediate: true });

// ==================== 私聊 AI 接管 ====================
/** 这个聊天被用户选中接管了吗（横幅只在选中后出现；暂停 / 总开关关掉也照样显示） */
const takeoverCfg = computed(() => takeoverFor(currentChatId()));
const aiTakeoverOn = computed(() => aiTakeover.enabled);
/** 真的在工作吗：选中 + 单个聊天开关 + 总开关 */
const takeoverRunning = computed(() => !!takeoverCfg.value?.enabled && aiTakeover.enabled);

/** 横幅上的暂停 / 继续：只切这个聊天的开关，总开关在设置页 */
function toggleTakeoverChat(): void {
    const cfg = takeoverCfg.value;
    if (cfg) updateTakeover(cfg.chatId, { enabled: !cfg.enabled });
}

// ==================== State Reset ====================
function resetState() {
    // 重新计一次骨架屏延迟：快路径（本地历史几十毫秒）不出现骨架屏
    armSkeleton();
    if (readVisibilityTimer !== null) {
        window.clearTimeout(readVisibilityTimer);
        readVisibilityTimer = null;
    }
    lastReportedReadMessageId = 0;
    sessionUnreadBaseId.value = 0;
    applyMessages([]);
    chat.value = undefined;
    // 活动条是聊天内的临时状态：换聊天就清掉，没用过 AI 的聊天不会残留上一条
    aiAbort?.abort();
    cancelAiStream();
    aiAbort = null;
    aiBusy.value = false;
    aiActivityEntries.value = [];
    resolveAiActivity(false);
    clearActiveChatTitleBar();
    topic.value = undefined;
    dmHeaderTopic.value = undefined;
    threadInfo.value = undefined;
    threadReplyInfo.value = undefined;
    memberStatus.value = {};
    isHistoryExhausted.value = false;
    isNewerExhausted.value = false;
    isReady.value = false;
    listRevealed.value = false;
    newerFetchFailStreak = 0;
    scrollLoadSuppressedUntil = 0;
    loadingDirection.value = null;
    unreadBoundaryMessageId.value = null;
    latestUnreadSeenId.value = 0;
    showScrollButton.value = false;
    newMessageIds.value = new Set();
    pendingNewIds.value = new Set();
    leavingMessageIds.value = new Set();
    notificationsMuted.value = false;
    isNotificationTogglePending.value = false;
    linkedChatId.value = 0;
    isJoinPending.value = false;
    joinRequestSent.value = false;
    secretChatState.value = undefined;
    pinnedBarVisible.value = false;
    stickyDateText.value = null;
    stickyDateHidden.value = false;
    lastStickyScrollTop = 0;
    availableSenders.value = [];
    sendersLoading.value = false;
    historyMode.value = 'normal';
    jumpOlderExhausted.value = false;
    jumpNewerExhausted.value = false;
    windowReachesLatest.value = false;
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
 * 中央写入 messages 的入口：过滤、按 id 去重并排序，再整体替换。
 * 排序是必须的：若数组末端不是真正的最大 id，loadHistoryNewer 会反复拉回
 * 列表中已有的消息（unique 为空），又因未标记 exhausted 而形成死循环。
 */
function applyMessages(next: message[], keep: 'older' | 'newer' = 'newer') {
    const cid = chatId.value;
    // 按消息归属会话过滤；评论线程中消息归属讨论组（≠ 当前频道），需一并放行
    const belongs = (m: message): boolean => {
        if (cid == null) return true;
        if (m.chat_id === cid) return true;
        return threadMode.value && threadInfo.value !== undefined && m.chat_id === threadInfo.value.chat_id;
    };
    const safe = next.filter(belongs);
    const seen = new Set<number>();
    const dedup: message[] = [];
    for (const m of safe) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        dedup.push(m);
    }
    dedup.sort((a, b) => a.id - b.id);
    let list = dedup.map(freezeMsg);
    if (list.length > MAX_MESSAGE_WINDOW) {
        list = keep === 'older'
            ? list.slice(0, MAX_MESSAGE_WINDOW)
            : list.slice(list.length - MAX_MESSAGE_WINDOW);
        // 裁掉更新端后窗口可能不再贴底
        if (keep === 'older') {
            refreshWindowReachesLatest();
        }
    }
    messages.value = list;
    messagesVersion.value++;
}

/** 把当前窗口留在内存缓存里（切走 / 关闭会话时调用），下次进入直接铺上，不再闪骨架屏 */
function saveCurrentChatWindow(cid: number, tid: number | null | undefined, threadRoot: number | null | undefined) {
    if (messages.value.length === 0) return;
    saveChatWindow(chatWindowKey(cid, tid, threadRoot), {
        messages: messages.value,
        windowReachesLatest: windowReachesLatest.value,
    });
}

/** 列表中已加载的最大消息 id（不依赖数组顺序） */
function messagesMaxId(): number {
    let max = 0;
    for (const m of messages.value) {
        if (m.id > max) max = m.id;
    }
    return max;
}

/**
 * 末尾追加消息（新消息 / 向更新方向加载）。
 * 超出窗口时裁掉最旧一端——那批消息在视口上方，必须钉住视口，否则内容上跳。
 */
function appendMessages(incoming: message[]) {
    if (incoming.length === 0) return;
    const willTrimFromTop = messages.value.length + incoming.length > MAX_MESSAGE_WINDOW;
    if (!willTrimFromTop) {
        applyMessages([...messages.value, ...incoming], 'newer');
        return;
    }
    const el = messagesContainer.value;
    // 顶部裁剪会抬升锚点上方布局：手动增量补偿（与 hold 共享状态，避免叠加）；
    // 无锚点时不接管，交给原生 scroll anchoring
    const manual = !!(el && listRevealed.value && beginLayoutCompensation(el));
    if (manual && el) beginManualAnchor(el);
    applyMessages([...messages.value, ...incoming], 'newer');
    if (manual && el) {
        void nextTick().then(() => {
            if (el.isConnected) compensateLayoutShift(el);
            endManualAnchor(el);
        });
    }
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

/**
 * 置顶状态变化：同步消息列表中的 is_pinned（右键菜单据此切换「置顶/取消置顶」），
 * 并让置顶栏重新拉取。主动操作与 TDLib update 会各调用一次，重复拉取无副作用。
 */
function onMessagePinnedStateChanged(messageId: number, isPinned: boolean) {
    const current = messages.value.find(m => m.id === messageId);
    if (current && current.is_pinned !== isPinned) {
        patchMessage(messageId, { is_pinned: isPinned });
    }
    pinnedBarRefreshToken.value++;
}

/** 按 id 删除消息 */
function removeMessagesByIds(ids: number[]) {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    const next = messages.value.filter(m => !drop.has(m.id));
    if (next.length !== messages.value.length) applyMessages(next);
}

/** 删除消失动画时长（与 .msg-leaving 的 animation-duration 保持一致） */
const LEAVE_ANIM_MS = 220;

/**
 * 带消失动画地删除消息：先给消息行加 .msg-leaving（淡出并收起高度），
 * 动画结束后再从列表移除，避免整段列表瞬间跳变。
 */
function animateRemoveMessages(ids: number[]) {
    if (ids.length === 0) return;
    const cid = chatId.value;
    const present = ids.filter(id => messages.value.some(m => m.id === id));
    if (present.length === 0) return;
    for (const id of present) leavingMessageIds.value.add(id);
    window.setTimeout(() => {
        for (const id of present) leavingMessageIds.value.delete(id);
        // 动画期间切换了会话：消息 id 在不同会话间会重复，不能误删新会话的消息
        if (chatId.value !== cid) return;
        removeMessagesByIds(present);
    }, LEAVE_ANIM_MS);
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
/** 可做 AI 摘要的文本气泡：气泡需 relative，摘要按钮才能贴齐气泡顶部、位于气泡外侧 */
const canSummarizeBubble = (msg: message) =>
    msg.content._ === 'messageText' && canSummarizeMessage(msg, isOutgoingMsg(msg));

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

/** 单条媒体无 caption → 气泡外渲染（不套白/绿气泡底） */
function isBubblelessMedia(msg: message): boolean {
    return isBubblelessMediaMessage(msg);
}

/** 相册条目是否为文件相册（全部消息都是文档/音频） */
function isFileAlbumItem(item: { messages: message[] }): boolean {
    return isFileAlbum(item.messages);
}

/** 相册无可见 caption → 气泡外渲染 */
function isAlbumBubbleless(item: { messages: message[] }): boolean {
    // 文件相册始终需要气泡背景（Telegram 从不把文档/音频组渲染成无气泡媒体）
    if (isFileAlbumItem(item)) return false;
    return !albumHasVisibleCaption(item.messages);
}

/** 相册中携带频道评论信息的消息（有则该相册底部显示评论条） */
function albumCommentsMsg(messages: message[]): message | undefined {
    return messages.find(showChannelCommentsBar);
}

// ==================== 聊天「全部翻译」（仅视口内） ====================

/** 本会话是否隐藏了翻译栏（用户点了 X） */
const translateBarHidden = ref(false);

/** 是否开启全部翻译 */
const chatTranslateOn = computed(() => isChatTranslating(chatId.value));

/** 全部翻译栏门槛（Premium+is_translatable / 自动翻译 / 非官方提供方） */
function chatTranslateGateOpen(): boolean {
    return canShowChatTranslateBar({
        chat: chat.value,
        isPremium: isMePremium.value,
        hasAutomaticTranslation: hasAutomaticTranslation.value,
    });
}

/** 全部翻译栏可见性（门槛 + 未被用户隐藏） */
function chatTranslateBarVisible(): boolean {
    return !translateBarHidden.value && chatTranslateGateOpen();
}

/** 翻译栏被用户隐藏、但本会话仍可显示 → 顶栏「更多」提供重新打开入口 */
const canReopenChatTranslateBar = computed(() => translateBarHidden.value && chatTranslateGateOpen());

/** 顶栏「更多」→「全部翻译」：恢复翻译栏 */
function reopenChatTranslateBar() {
    translateBarHidden.value = false;
}

/** 进入群组时的 Premium 提示（每个会话只弹一次） */
let translatePremiumPromptedChatId: number | null = null;
function maybePromptTranslatePremium() {
    const c = chat.value;
    if (!c) return;
    const cid = c.id;
    // 超级群需等 getSupergroup 回来，避免误把「未加载」当成「未开自动翻译」
    if (c.type?._ === 'chatTypeSupergroup' && !supergroupFullReady.value) return;
    if (translatePremiumPromptedChatId === cid) return;
    const input = {
        chat: c,
        isPremium: isMePremium.value,
        hasAutomaticTranslation: hasAutomaticTranslation.value,
    };
    if (!shouldPromptChatTranslatePremium(input)) return;
    if (canShowChatTranslateBar(input)) return;
    translatePremiumPromptedChatId = cid;
    toast.warning({
        content: t('translate.premiumHint'),
        duration: 5000,
        placement: 'top-right',
    });
}

let viewportTranslateTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 扫描消息容器，**仅对视口内**可见消息发起翻译。
 * 全部翻译开启后由滚动 / 新消息 / 状态切换触发，避免整段历史一次性请求。
 */
function translateViewportMessages() {
    if (!chatTranslateOn.value) return;
    const container = messagesContainer.value;
    const cid = chatId.value;
    if (!container || cid == null) return;
    const cRect = container.getBoundingClientRect();
    const nodes = container.querySelectorAll<HTMLElement>('[data-msg-id]');
    for (const node of nodes) {
        const id = Number(node.getAttribute('data-msg-id'));
        if (!id) continue;
        const msg = messages.value.find((m) => m.id === id);
        if (!msg) continue;
        const r = node.getBoundingClientRect();
        // 完全在视口外：跳过
        if (r.bottom < cRect.top - 4 || r.top > cRect.bottom + 4) continue;
        const ft = getMessageFormattedText(msg);
        if (!ft || !ft.text.trim()) continue;
        void requestViewportTranslation(cid, msg, ft, getMessagePlainText(msg));
    }
}

function scheduleViewportTranslate(delay = 160) {
    if (viewportTranslateTimer) clearTimeout(viewportTranslateTimer);
    viewportTranslateTimer = setTimeout(() => {
        viewportTranslateTimer = null;
        translateViewportMessages();
    }, delay);
}

function onChatTranslatingChange(on: boolean) {
    if (on) {
        // 等 DOM 布局后再扫视口
        void nextTick(() => scheduleViewportTranslate(0));
    }
}

// 切换对话：重置提示状态；若该对话曾开启全部翻译，进入后翻译当前视口
watch(chatId, () => {
    translateBarHidden.value = false;
    translatePremiumPromptedChatId = null;
    hasAutomaticTranslation.value = false;
    supergroupFullReady.value = false;
    if (chatTranslateOn.value) {
        void nextTick(() => scheduleViewportTranslate(200));
    }
}, { immediate: false });

// chat / Premium / 自动翻译就绪后评估是否弹提示
watch(
    () => [chat.value?.id, chat.value?.is_translatable, isMePremium.value, hasAutomaticTranslation.value, supergroupFullReady.value] as const,
    () => { maybePromptTranslatePremium(); },
);

// 新消息到达且贴底时：若开启全部翻译，翻译新进入视口的消息
watch(() => messages.value.length, () => {
    if (chatTranslateOn.value) scheduleViewportTranslate(240);
});

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

/** 自定义气泡皮肤（QQ 风格图片气泡，null = 未启用） */
const customBubbleSkin = useCustomBubbleSkin();

/** 气泡完整样式计算的动态依赖 */
const bubbleDeps = (): BubbleStyleDeps => ({
    ...bubbleBackgroundDeps(),
    messages: messages.value,
    bubbleWidths: bubbleWidths.value,
    isSelf,
    settings: settings.message,
    customSkin: customBubbleSkin.value,
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

/** 转发来源姓名拆分（头像首字母用；非用户来源为空串） */
const getForwardNames = (forwardInfo: messageForwardInfo): { first: string; last: string } =>
    computeForwardNames(forwardInfo, senderCaches());

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

/** 展示发送者的姓名拆分（无头像文字用）；无法解析为用户时回退展示名称 */
const getDisplaySenderNames = (msg: message): { first: string; last: string } =>
    computeDisplaySenderNames(msg, senderDeps());

/**
 * 服务消息的操作者名称：直接用真实名称（"你" 只用于气泡上方的发送者名称行）。
 * 即使是自己触发的置顶/加入/清单等操作，服务消息里也显示自己的名称，不做特殊处理。
 */
const getServiceSenderName = (msg: message): string =>
    computeSenderName(msg, senderCaches());

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

// ==================== 消息右键菜单 / 单条消息动作 ====================
menuApi = useMessageContextMenu({
    chat, chatId, myId, isInSavedMessages,
    selectionMode, exitSelectionMode, supergroups, basicGroups, memberStatus,
    startReply, startQuoteReply, startForward, enterSelectionMode,
    startEdit, openReactionPicker, onMessagePinnedStateChanged,
    getDisplaySenderName, getDisplaySenderPhoto, getDisplaySenderNames,
    getDisplaySenderProfileAccentId, getDisplaySenderDeleted,
});
const {
    makeMsgMenu, onAlbumMessageContextMenu,
    openCommentsThread, isShowingTranslation, senderUserIdOf,
} = menuApi;

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

const showSkeleton = computed(() => !listRevealed.value && skeletonArmed.value);

/** 消息容器样式：定位完成前 opacity:0，保证仍可测量 scrollHeight / 滚动定位 */
const messagesContainerStyle = computed<Record<string, string>>(() => {
    const base = messagesStyle.value;
    return listRevealed.value ? base : { ...base, opacity: '0' };
});

/** 动态顶部间距：Header + 置顶/音乐卡片 + 全部翻译栏 */
const showTopCard = computed(() => pinnedBarVisible.value || player.showEntry);
/** 全部翻译栏是否可见（Premium+is_translatable / has_automatic_translation / 非官方提供方） */
const translateBarVisible = computed(() => chatTranslateBarVisible());
/** 顶部栈是否渲染（置顶/音乐 或 翻译栏 或 吸顶日期） */
const topStackHasCard = computed(() => showTopCard.value || translateBarVisible.value);
const showChatTranslateBarUi = computed(() => !translateBarHidden.value && translateBarVisible.value);
const topStackVisible = computed(() => topStackHasCard.value || !!stickyDateDisplay.value);

/**
 * 用于语言检测的样本文本：最近几条有正文的非自己消息。
 * ChatTranslateBar「不翻译该语言」据此识别源语言并写入排除列表。
 */
const translateSampleText = computed(() => {
    const list = messages.value;
    for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m.is_outgoing) continue;
        const text = getMessagePlainText(m).trim();
        if (text.length >= 2) return text.slice(0, 400);
    }
    return '';
});

/**
 * 顶部栈 top：置顶/播放器/全部翻译均并入同一圆角卡片，统一贴 Header 下方稍留缝；
 * 仅吸顶日期时紧贴 Header 底边。
 */
const topStackTopStyle = computed(() => ({
    top: `${((showTopCard.value || showChatTranslateBarUi.value) ? 70 : 64) + topicTagTopSpace.value}px`,
}));

const topPaddingClass = computed(() => {
    // Header h-16=64px；话题顶部标签栏；顶置/播放器卡片约 +68px
    // 全部翻译与卡片贴合：有置顶/播放器时仅 +36（无额外间隙）；单独成卡时约 +44（含描边）
    let px = 64 + topicTagTopSpace.value;
    if (showTopCard.value) px += 68;
    if (translateBarVisible.value) px += showTopCard.value ? 36 : 44;
    return { paddingTop: `${px}px` };
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
/**
 * messageItems 结果缓存：可见消息对象身份完全一致时直接复用。
 * 向顶部插入「仍隐藏」的历史时，可见列表不变，跳过 buildDisplayItems 与整表 patch；
 * patchMessage 会换新对象引用，身份比较会失效并正确重建。
 */
let messageItemsCache: { list: message[]; unread: number; items: DisplayItem[] } | null = null;

const messageItems = computed<DisplayItem[]>(() => {
    const hidden = hiddenOlderIds.value;
    const list = hidden.size > 0
        ? messages.value.filter(m => !hidden.has(m.id))
        : messages.value;
    const unread = unreadBoundaryMessageId.value ?? 0;
    const cache = messageItemsCache;
    if (cache && cache.unread === unread && cache.list.length === list.length) {
        let same = true;
        for (let i = 0; i < list.length; i++) {
            if (cache.list[i] !== list[i]) {
                same = false;
                break;
            }
        }
        if (same) return cache.items;
    }
    const items = buildDisplayItems(list, unreadBoundaryMessageId.value, {
        isSelf,
        isSavedForwardedMessage,
        shouldReserveAvatarColumn,
    });
    messageItemsCache = { list, unread, items };
    return items;
});

// 列表结构 / 顶栏高度 / 露出后 DOM 变化时重算吸顶日期
// 用 flush:'post' 确保 DOM（日期分隔、消息节点）已更新后再测量
watch(
    () => [messageItems.value, showTopCard.value, listRevealed.value] as const,
    () => {
        void nextTick(() => updateStickyDate());
    },
    { flush: 'post' },
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

const canSend = computed(() => {
    const base = canSendChat(chat.value, currentMemberStatus.value, groupCaches());
    if (!base) return false;
    // 秘密聊天：Pending（握手未完成）/ Closed（已取消）禁用输入，底部显示对应提示
    if (isSecretChat.value) {
        return secretChatState.value !== 'pending' && secretChatState.value !== 'closed';
    }
    // 受管理的频道私信群组：未选中话题时不开放发送（ForumReplyToMessagesInTopic）
    if (isDirectMessagesChat.value && topicDisplayMode.value === 'tag' && !topicId.value) {
        return false;
    }
    return true;
});

/** 频道私信：未选中话题时的底部提示 */
const showDmTopicHint = computed(() =>
    isDirectMessagesChat.value && topicDisplayMode.value === 'tag' && !topicId.value && !showMembershipAction.value
);

const showMembershipAction = computed(() =>
    showMembershipActionOf(chat.value, currentMemberStatus.value)
);

const canJoinCurrentChat = computed(() =>
    canJoinCurrentChatOf(currentMemberStatus.value)
);

const membershipActionLabel = computed(() => {
    const currentChat = chat.value;
    const isChannel = currentChat?.type._ === 'chatTypeSupergroup' && currentChat.type.is_channel;
    const noun = isChannel ? t('lng_notification_channels') : t('lng_notification_groups');
    if (isJoinPending.value) return t('lng_profile_loading');
    if (joinRequestSent.value) return t(isChannel ? 'lng_group_request_sent_channel' : 'lng_group_request_sent');
    if (!canJoinCurrentChat.value) return t('chat.cannotJoin', { noun });

    const needsRequest = currentChat?.type._ === 'chatTypeSupergroup'
        && !!supergroups.value[currentChat.type.supergroup_id]?.join_by_request;
    if (needsRequest) return t(isChannel ? 'lng_profile_apply_to_join_group' : 'lng_group_request_to_join');
    return t(isChannel ? 'lng_profile_join_channel' : 'lng_profile_join_group');
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

/**
 * AI 写工具的聊天权限（只有群 / 频道才有限制；私聊 / 密聊不传 = 全给）：
 * 没有「删除他人消息 / 封禁」权限就不下发对应工具（见 utils/aiChat 的 enabledTools、systemPrompt）。
 */
const aiTurnPermissions = computed<AiTurnPermissions | undefined>(() => {
    const c = chat.value;
    if (!c || !isGroupChat(c)) return undefined;
    const status = currentMemberStatus.value;
    return {
        deleteMessages: canDeleteOthersMessages(status),
        restrictMembers: canRestrictMembers(status),
        canPost: canSend.value,
    };
});

/**
 * 底部输入区显示什么：能发言 → 普通 / AI 输入框；**不能发言的群 / 频道**（只读频道、
 * 被限制发言的群、没加入的频道）→ AI 输入框照样能用：AI 只读 / 总结这里的内容，
 * 需要产出消息就发到别的聊天或该帖子的评论线程（见 aiTurnPermissions.canPost）。
 * 加入 / 选话题 / 秘密聊天提示优先，别跟它们抢底部。
 */
const showAiInput = computed(() =>
    canSend.value
    || (settings.ai.input === 'ai'
        && isGroupChat(chat.value)
        && !showMembershipAction.value
        && !showDmTopicHint.value)
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
 * “跳到底部”按钮：先拿到真正底部的连续历史，再滚动过去。
 * 列表与真实底部之间可能存在 gap（跳转窗口 / 未读锚点切片）。
 * 不能只 append 最新页——那会在中间留下巨大空洞。
 * 策略（ScrollToBottom + LoadMessageSlice）：
 * 1) from_message_id=0 拉最新一页；
 * 2) 若与当前列表连通/重叠 → 合并去重；
 * 3) 若有中等 gap → 从当前末端向更新方向分页桥接；
 * 4) gap 过大或桥接失败 → 整表替换为底部连续窗口（向上滚再加载更旧）。
 * 使用 function 声明以便 updateNewMessage 在 TDZ 外安全引用。
 */
async function handleScrollToBottom() {
    showScrollButton.value = false;
    // 抑制滚动加载，避免贴底后 loadHistoryNewer 与“加载中”指示器形成高度抖动
    scrollLoadSuppressedUntil = Date.now() + 600;

    const gen = loadGeneration;
    const loadChat = chatId.value;
    if (!loadChat) {
        scrollToBottom();
        return;
    }
    isLoadingMore.value = true;
    loadingDirection.value = 'bottom';
    try {
        const newest = await fetchMessages(loadChat, 0, HISTORY_BOTTOM_LIMIT, 0, gen);
        if (!isGenerationValid(gen) || chatId.value !== loadChat) return;
        if (newest == null || newest.length === 0) {
            // 拉取失败时至少滚到当前窗口底部
            if (historyMode.value === 'jump') {
                historyMode.value = 'normal';
                jumpOlderExhausted.value = false;
                jumpNewerExhausted.value = false;
            }
            refreshWindowReachesLatest();
            return;
        }

        const currentNewestId = messagesMaxId();
        const batchOldestId = newest.reduce((min, m) => (m.id < min ? m.id : min), newest[0].id);
        const batchNewestId = newest.reduce((max, m) => (m.id > max ? m.id : max), newest[0].id);

        const mergeIntoList = (batch: message[]) => {
            if (batch.length === 0) return;
            const ids = new Set(messages.value.map(m => m.id));
            const unique = batch.filter(m => !ids.has(m.id));
            if (unique.length > 0) appendMessages(unique);
        };

        if (messages.value.length === 0 || currentNewestId <= 0) {
            applyMessages(newest);
        } else if (currentNewestId >= batchNewestId) {
            // 已在底部，合并可能存在的中间更新消息即可
            mergeIntoList(newest);
        } else if (batchOldestId <= currentNewestId + 1) {
            // 重叠或已连通
            mergeIntoList(newest);
        } else {
            // 存在 gap：从当前末端向更新方向分页桥接
            const BRIDGE_MAX_PAGES = 4;
            let newestId = currentNewestId;
            let bridged = false;
            for (let i = 0; i < BRIDGE_MAX_PAGES && newestId < batchNewestId; i++) {
                if (!isGenerationValid(gen) || chatId.value !== loadChat) return;
                const page = await fetchMessages(
                    loadChat,
                    newestId,
                    HISTORY_NEWER_LIMIT,
                    -HISTORY_NEWER_OFFSET,
                    gen,
                );
                if (page == null) break;
                const newerOnly = page.filter(m => m.id > newestId);
                if (newerOnly.length === 0) break;
                mergeIntoList(newerOnly);
                newestId = newerOnly.reduce((max, m) => (m.id > max ? m.id : max), newestId);
                if (newestId >= batchOldestId - 1) {
                    bridged = true;
                    break;
                }
            }

            const afterNewestId = messagesMaxId();
            if (bridged && afterNewestId >= batchOldestId - 1) {
                mergeIntoList(newest);
            } else if (afterNewestId < batchOldestId - 1) {
                // 桥接失败 / gap 过大：替换为底部连续窗口（用户意图是到最新）
                applyMessages(newest);
            } else {
                mergeIntoList(newest);
            }
        }

        // 已拿到 from_message_id=0 的底部切片
        historyMode.value = 'normal';
        jumpOlderExhausted.value = false;
        jumpNewerExhausted.value = false;
        isHistoryExhausted.value = false;
        windowReachesLatest.value = true;
        // 已贴真实底部：更新方向历史视为耗尽，禁止 loadHistoryNewer 空转
        isNewerExhausted.value = true;
        newerFetchFailStreak = 0;
        if (chat.value?.last_message) {
            const lastId = chat.value.last_message.id || 0;
            const inList = messages.value.find(m => m.id === batchNewestId);
            if (inList) chat.value.last_message = inList;
            else if (lastId > 0) {
                const last = messages.value.find(m => m.id === lastId);
                if (last) chat.value.last_message = last;
            }
        }
    } finally {
        isLoadingMore.value = false;
        loadingDirection.value = null;
    }
    await nextTick();
    scrollToBottomImmediate();
    // 媒体懒加载后二次校准：高度未变且已贴底则跳过写入，避免无意义二次强制布局
    setTimeout(() => {
        const el = messagesContainer.value;
        if (el) {
            const top = Math.max(0, el.scrollHeight - el.clientHeight);
            if (el.scrollTop < top - 1) {
                el.scrollTop = top;
                lastStickyScrollTop = top;
            }
        }
        scrollLoadSuppressedUntil = Date.now() + 300;
    }, 200);
}
</script>
<style scoped>
/* 话题标签栏（左侧 list / tag）由 TopicTagBar 自身定位 */

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
    /* 滚动锚定分工见 viewportLock.ts：平时原生 scroll anchoring 补偿
       content-visibility/图片高度抖动；手动补偿期间由 beginManualAnchor 临时关闭。 */
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

/* 话题标签栏位置切换/出现动画（非 scoped）
   按 data-pos / animClass 方向：左←左向，上←上向，下←下向 */
@keyframes tag-in-left {
    from { transform: translateX(-100%); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
}
@keyframes tag-in-top {
    from { transform: translateY(-100%); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
}
@keyframes tag-in-bottom {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
}

.tag-anim-left {
    animation: tag-in-left 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
.tag-anim-top {
    animation: tag-in-top 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
.tag-anim-bottom {
    animation: tag-in-bottom 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

/* 标签栏位置切换时，Header / 置顶栈 / 输入条的 inset 与 top 平滑过渡，避免闪跳 */
.topic-chrome-anim {
    transition: padding 0.28s cubic-bezier(0.4, 0, 0.2, 1),
        top 0.28s cubic-bezier(0.4, 0, 0.2, 1),
        left 0.28s cubic-bezier(0.4, 0, 0.2, 1),
        right 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

/*
 * 消息行 content-visibility：视口外的消息跳过布局/绘制。
 * 大频道（长文本多链接）DOM 很重，向顶部插入历史时新行大多在视口上方，
 * 浏览器可直接用 contain-intrinsic-size 估算高度，避免一次性布局几十条复杂消息。
 * auto 前缀会在首次渲染后记住真实高度，滚动越久越准。
 */
.msg-list-item {
    content-visibility: auto;
    contain-intrinsic-size: auto 88px;
}

/*
 * 消息被删除时的消失动画：淡出 + 行高收起（grid 1fr → 0fr）。
 * JS 在动画结束后才真正移除节点，因此列表是平滑收拢而不是瞬间跳变。
 * 若 WebView 不支持 grid 轨道动画，则退化为单纯淡出（仍然移除，只是高度不再渐变）。
 */
@keyframes message-disappear {
    from {
        opacity: 1;
        grid-template-rows: minmax(0, 1fr);
    }

    to {
        opacity: 0;
        grid-template-rows: minmax(0, 0fr);
    }
}

.msg-list-item.msg-leaving {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
    pointer-events: none;
    animation: message-disappear 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.msg-list-item.msg-leaving > * {
    min-height: 0;
    overflow: hidden;
}
</style>
