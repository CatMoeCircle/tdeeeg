<template>
  <div class="h-full flex flex-col text-gray-900 dark:text-gray-100 overflow-hidden">
    <!-- 内容区 -->
    <div ref="profileScrollEl" class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
      <div class="max-w-2xl mx-auto pb-8" v-if="chatMode || user || chatObj || chatLoading || chatError">
        <!-- ===== 第一部分：顶部青绿色头部区域 ===== -->
        <div class="relative profile-hero overflow-hidden">
          <!-- 返回导航 -->
          <button type="button" :aria-label="t('lng_menu_back')"
            class="absolute top-2 left-2 z-10 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="goBack">
            <ArrowLeft class="w-6 h-6" />
          </button>

          <!-- 用户模式头像/昵称/状态 -->
          <div v-if="!chatMode" class="flex flex-col items-center pt-10 pb-3 px-4 text-gray-900 dark:text-gray-100">
            <!-- 头像 -->
            <button type="button" class="relative rounded-full focus:outline-none"
              :title="t('lng_action_suggested_photo_button')" @click="openPhotoViewer(0)">
              <span class="block rounded-full">
                <div v-if="headerPhotoUrl" class="w-24 h-24 rounded-full overflow-hidden">
                  <img :src="headerPhotoUrl" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-24 h-24 rounded-full overflow-hidden">
                  <Avatar :photo="isDeletedProfile ? undefined : displayPhoto" :title="userName"
                    :accentColorId="isDeletedProfile ? undefined : user?.profile_accent_color_id"
                    :deletedAccount="isDeletedProfile" sizeClass="!w-24 !h-24" no-background />
                </div>
              </span>
            </button>

            <!-- 昵称 -->
            <h1 class="mt-3 text-2xl font-bold flex items-center gap-1.5 max-w-full">
              <span class="truncate">
                <GlobalEmojiText :text="userName" />
              </span>
              <button v-if="!isDeletedProfile && isSelf && user?.is_premium" type="button"
                class="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-blue-500/10 transition-colors"
                @click.stop="openEmojiStatusPicker">
                <CustomEmojiInline v-if="emojiStatusDisplayId" :emojiId="emojiStatusDisplayId" :size="22" />
                <span v-else class="tgico tgico-emoji-status text-[20px]" />
              </button>
              <span v-if="!isDeletedProfile && !isSelf && user?.is_premium && !user?.emoji_status" class="text-base"
                title="Telegram Premium">⭐</span>
              <VerifiedFilledIcon v-if="!isDeletedProfile && verificationType === 'verified'"
                class="text-blue-500 text-lg" title="verified" :fill-color='["currentColor", "transparent"]'
                :stroke-color='["currentColor", "#0052d9"]' :stroke-width="1.5" />
            </h1>

            <!-- 在线状态 -->
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ statusText }}
            </p>

            <!-- 操作按钮区：消息 / 通话 / 通知 / 搜索 / 更多（等大方块，单排，灰色半透明） -->
            <div v-if="!isSelf" class="mt-5 flex items-center justify-center gap-2">
              <!-- 消息 -->
              <button type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="openPrivateChat">
                <Send class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                  t('lng_profile_action_short_message') }}</span>
              </button>

              <!-- 通话 -->
              <button type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="startCall()">
                <PhoneCall class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                  t('lng_profile_action_short_call') }}</span>
              </button>

              <!-- 通知 -->
              <button type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="toggleNotifications">
                <BellOff v-if="isPrivateChatMuted" class="w-5 h-5 shrink-0" />
                <Bell v-else class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">
                  {{ isPrivateChatMuted ? t('lng_profile_action_short_mute') : t('lng_profile_action_short_unmute') }}
                </span>
              </button>

              <!-- 搜索 -->
              <button type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="searchInChat">
                <Search class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                  t('lng_country_ph') }}</span>
              </button>

              <!-- 更多 -->
              <button type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="openMoreMenu($event)">
                <MoreHorizontal class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                  t('lng_profile_action_short_more') }}</span>
              </button>
            </div>
          </div>

          <!-- 频道/群组/秘密聊天模式头像/名称 -->
          <div v-else-if="chatObj" class="flex flex-col items-center pt-10 pb-3 px-4 text-gray-900 dark:text-gray-100">
            <!-- 头像：秘密聊天显示用户头像，其他显示聊天头像 -->
            <div class="w-24 h-24 rounded-full overflow-hidden">
              <Avatar v-if="isSecretChat && secretChatUser" :photo="secretChatUser.profile_photo"
                :title="`${secretChatUser.first_name} ${secretChatUser.last_name}`"
                :accentColorId="secretChatUser.profile_accent_color_id" sizeClass="!w-24 !h-24" no-background />
              <Avatar v-else :photo="chatPhotoInfo" :title="chatTitle" :accentColorId="chatAccentColorId"
                sizeClass="!w-24 !h-24" no-background />
            </div>

            <!-- 名称 -->
            <h1 class="mt-3 text-2xl font-bold flex items-center gap-1.5 max-w-full">
              <span class="truncate">
                <GlobalEmojiText
                  :text="isSecretChat && secretChatUser ? `${secretChatUser.first_name} ${secretChatUser.last_name}`.trim() || t('secretChat.label') : chatTitle" />
              </span>
              <VerifiedFilledIcon v-if="isChatVerified" class="text-blue-500 text-lg" title="Verified"
                :fill-color='["currentColor", "transparent"]' :stroke-color='["currentColor", "#0052d9"]'
                :stroke-width="1.5" />
            </h1>

            <!-- 副标题 -->
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ isSecretChat ? t('secretChat.label') : chatMemberCountText }}
            </p>

            <!-- 操作按钮区（等大方块，单排，灰色半透明） -->
            <div class="mt-5 flex items-center justify-center gap-2">
              <!-- 秘密聊天：消息 / 通话 / 通知 / 搜索 / 更多 -->
              <template v-if="isSecretChat">
                <button type="button"
                  class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                  @click="openChatChannel">
                  <Send class="w-5 h-5 shrink-0" />
                  <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                    t('lng_profile_action_short_message') }}</span>
                </button>
                <button type="button"
                  class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                  @click="startCall()">
                  <PhoneCall class="w-5 h-5 shrink-0" />
                  <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                    t('lng_profile_action_short_call') }}</span>
                </button>
              </template>
              <!-- 频道/群组：进入或加入 -->
              <template v-else>
                <button type="button"
                  class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                  @click="isChatJoined ? openChatChannel() : joinChat()">
                  <MessageSquareText class="w-5 h-5 shrink-0" />
                  <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">
                    {{ isChatJoined ? (isChatChannel ? t('lng_profile_action_short_channel') :
                      t('lng_profile_view_channel')) :
                      t('lng_profile_action_short_join') }}
                  </span>
                </button>
              </template>

              <!-- 通知 -->
              <button type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="chatToggleNotifications">
                <BellOff v-if="chatNotificationMuted" class="w-5 h-5 shrink-0" />
                <Bell v-else class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">
                  {{ chatNotificationMuted ? t('lng_profile_action_short_mute') : t('lng_profile_action_short_unmute')
                  }}
                </span>
              </button>

              <!-- 秘密聊天：搜索 -->
              <button v-if="isSecretChat" type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="searchInChat">
                <Search class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                  t('lng_country_ph') }}</span>
              </button>

              <!-- 频道/群组：查看讨论 / 关联频道 -->
              <button v-if="!isSecretChat && chatLinkedChatId" type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="openLinkedGroup">
                <Users class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">
                  {{ isChatChannel ? t('lng_profile_action_short_discuss') : t('lng_profile_action_short_channel') }}
                </span>
              </button>

              <!-- 频道/群组：举报 -->
              <button v-if="!isSecretChat" type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="reportCurrentChat">
                <Flag class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                  t('lng_profile_action_short_report') }}</span>
              </button>

              <!-- 更多 -->
              <button v-if="hasChatMoreOptions" type="button"
                class="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-700 dark:text-gray-200 transition-colors overflow-hidden"
                @click="openChatMoreMenu($event)">
                <MoreHorizontal class="w-5 h-5 shrink-0" />
                <span class="text-[11px] leading-tight text-center px-0.5 wrap-break-word max-w-full">{{
                  t('lng_profile_action_short_more') }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- ===== 第二部分：音乐卡片 + 频道订阅卡片（仅用户模式） ===== -->
        <div v-if="!chatMode" class="px-4">
          <!-- 音乐卡片：标题在卡片外，方形封面/名称/作者在卡片内 -->
          <template v-if="profileAudio">
            <!-- 区域标题（卡片外部） -->
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{{
              t('lng_settings_saved_music_privacy') }}</p>
            <!-- 卡片：音乐入口行 -->
            <div
              class="rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden mb-4">
              <button type="button" @click="openUserMusicPlayer"
                class="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <!-- 方形封面（播放/暂停按钮叠加在封面上） -->
                <div
                  class="relative w-14 h-14 rounded-lg shrink-0 overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  <template v-if="profileMusicCover">
                    <!-- 高清封面就绪后替换；仅在高清下载过程中对低清 minithumbnail 做过渡模糊 -->
                    <img :src="profileMusicCover" class="w-full h-full object-cover"
                      :class="profileMusicCoverShowTransition ? 'scale-125 blur-[2px]' : ''" />
                  </template>
                  <Music v-else class="w-6 h-6 text-gray-400" />
                  <span class="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    <Pause v-if="isUserMusicPlaying" class="w-5 h-5" fill="currentColor" />
                    <Play v-else class="w-5 h-5" fill="currentColor" />
                  </span>
                </div>
                <!-- 名称 + 作者 -->
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ profileAudioTitle }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{{ profileAudioPerformer }}</p>
                </div>
              </button>
            </div>
          </template>

          <!-- 频道订阅卡片 -->
          <div v-if="personalChatId"
            class="rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden">
            <!-- 头部：频道 + 订阅数（使用该用户主题色） -->
            <div class="flex items-baseline justify-between px-3.5 pt-3 pb-1.5">
              <span class="text-sm font-semibold text-gray-900 dark:text-gray-100"> {{ t('lng_settings_channel_label')
              }}</span>
              <span v-if="channelMemberText" class="px-2 py-0.5 rounded-full text-xs font-medium"
                :style="{ color: profileAccent.color, backgroundColor: profileAccent.softBg }">
                {{ channelMemberText }}
              </span>
            </div>
            <!-- 频道入口行：头像 + 标题/时间 + 最新推送预览 -->
            <button type="button" @click="openPersonalChat"
              class="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div class="w-10 h-10 shrink-0">
                <Avatar :photo="personalChatPhoto" :title="personalChatTitle" :accentColorId="personalChatAccent"
                  sizeClass="!w-10 !h-10" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="min-w-0 flex items-center gap-1">
                    <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      <GlobalEmojiText :text="personalChatTitle" />
                    </span>
                    <Megaphone class="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </p>
                  <span v-if="channelPostTime" class="ml-auto text-[11px] text-gray-400 shrink-0">{{ channelPostTime
                  }}</span>
                </div>
                <p v-if="channelPreviewText" class="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                  {{ channelPreviewText }}
                </p>
              </div>
            </button>
          </div>
        </div>

        <!-- ===== 第二部分（频道/群组/秘密聊天模式）：介绍 / 用户名 / ID ===== -->
        <div v-if="chatMode" class="px-4 mt-4 space-y-2">
          <!-- 秘密聊天：显示用户信息（bio/手机号/用户名） -->
          <template v-if="isSecretChat && secretChatUser">
            <!-- 个人简介 -->
            <div v-if="secretChatFullInfo?.bio?.text"
              class="flex items-start gap-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3.5">
              <InfoIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                  <GlobalEmojiText :text="secretChatFullInfo.bio.text" />
                </p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_info_bio_label') }}</p>
              </div>
            </div>
            <!-- 手机号码 -->
            <div v-if="secretChatUser.phone_number"
              class="flex items-center gap-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3.5">
              <PhoneIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                  <CopyableText :text="secretChatUser.phone_number" @click.stop />
                </p>
                <p class="text-xs text-gray-400">{{ t('lng_info_mobile_label') }}</p>
              </div>
            </div>
            <!-- 用户名 -->
            <div v-if="secretChatUser.usernames?.active_usernames?.length"
              class="flex items-start gap-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="secretChatUser.usernames?.active_usernames?.[0] && copyText('@' + secretChatUser.usernames.active_usernames[0])">
              <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-gray-900 dark:text-gray-100 select-all wrap-break-word leading-snug">
                  <CopyableText :text="secretChatUser.usernames.active_usernames[0]" @click.stop />
                </p>
                <p class="mt-0.5 text-xs text-gray-400">{{ t('lng_info_username_label') }}</p>
              </div>
            </div>
            <!-- ID -->
            <div
              class="flex items-center gap-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3.5">
              <IdCardIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                  <CopyableText :text="String(secretChatUser.id)" @click.stop />
                </p>
                <p class="text-xs text-gray-400">ID</p>
              </div>
            </div>
          </template>

          <!-- 频道/群组：介绍 -->
          <div v-else-if="chatDescription"
            class="flex items-start gap-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3.5">
            <InfoIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                <GlobalEmojiText :text="chatDescription" />
              </p>
              <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_info_bio_label') }}</p>
            </div>
          </div>

          <!-- 频道/群组用户名 -->
          <div v-if="chatUsername"
            class="flex items-start gap-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            @click="chatUsername && copyText('@' + chatUsername)">
            <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold text-gray-900 dark:text-gray-100 select-all wrap-break-word leading-snug">
                <CopyableText :text="chatUsername" @click.stop />
              </p>
              <p class="mt-0.5 text-xs text-gray-400">{{ t('lng_info_username_label') }}</p>
            </div>
          </div>

          <!-- 频道/群组 ID -->
          <div v-if="!isSecretChat"
            class="flex items-center gap-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3.5">
            <IdCardIcon class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                <CopyableText :text="String(chatId)" @click.stop />
              </p>
              <p class="text-xs text-gray-400">ID</p>
            </div>
            <button type="button"
              class="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              @click="copyChatId">
              <Copy class="w-3.5 h-3.5" />
              {{ t('lng_chat_link_copy') }}
            </button>
          </div>
        </div>

        <!-- ===== 秘密聊天专属：自动删除消息 / 加密密钥（个人信息与标签栏之间） ===== -->
        <div v-if="chatMode && isSecretChat" class="px-4 mt-2">
          <div
            class="rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            <button type="button"
              class="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="openAutoDelete">
              <TimerReset class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {{ t('lng_manage_messages_ttl_title') }}
                </p>
                <p class="text-xs text-gray-400 mt-0.5">{{ secretAutoDeleteLabel }}</p>
              </div>
              <ChevronDown class="w-4 h-4 text-gray-400 shrink-0 -rotate-90" />
            </button>
            <button type="button"
              class="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="openEncryptionKey">
              <KeyRound class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {{ t('secretChat.encryptionKeyTitle') }}
                </p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('secretChat.encryptionKeySubtitle') }}</p>
              </div>
              <ChevronDown class="w-4 h-4 text-gray-400 shrink-0 -rotate-90" />
            </button>
          </div>
        </div>

        <!-- ===== 第三部分：个人信息列表卡片（仅用户模式） — 合并为单卡片 ===== -->
        <div v-if="!chatMode" class="px-4 mt-4">
          <div
            class="rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            <!-- 3.1 个人简介 -->
            <div v-if="bioText" class="flex items-start gap-3 p-3.5">
              <InfoIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                  <GlobalEmojiText :text="bioText" />
                </p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_info_bio_label') }}</p>
              </div>
            </div>

            <!-- 3.2 手机号码 -->
            <div v-if="user?.phone_number" class="flex items-center gap-3 p-3.5">
              <PhoneIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                  <CopyableText :text="phoneDisplay || user.phone_number" @click.stop />
                </p>
                <p class="text-xs text-gray-400">{{ t('lng_info_mobile_label') }}</p>
              </div>
            </div>

            <!-- 3.3 用户名（可复制文本：默认黑色，悬停变蓝，点击复制） -->
            <div v-if="primaryUsername || additionalUsernames.length"
              class="flex items-start gap-3 p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="primaryUsername && copyText('@' + primaryUsername)">
              <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <!-- 主用户名：黑色，不省略 -->
                <p v-if="primaryUsername"
                  class="text-sm font-bold text-gray-900 dark:text-gray-100 select-all wrap-break-word leading-snug">
                  <CopyableText :text="primaryUsername" @click.stop />
                </p>
                <!-- 附加用户名：蓝色高亮，逐个可点击复制 -->
                <p v-if="additionalUsernames.length" class="mt-0.5 text-xs wrap-break-word leading-relaxed">
                  <template v-for="(u, i) in additionalUsernames" :key="u">
                    <span v-if="i > 0" class="text-gray-500 dark:text-gray-400">, </span>
                    <CopyableText :text="'@' + u" />
                  </template>
                </p>
                <!-- 副标题 -->
                <p class="mt-0.5 text-xs text-gray-400">{{ t('lng_info_username_label') }}</p>
              </div>
            </div>

            <!-- 3.4 生日 -->
            <div v-if="birthdateText" class="flex items-center gap-3 p-3.5">
              <CalendarIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ birthdateText }}</p>
                <p class="text-xs text-gray-400">{{ t('lng_info_birthday_label') }}</p>
              </div>
            </div>

            <!-- 3.5 位置（点击用微软地图网页版打开） -->
            <button v-if="businessLocation" type="button"
              class="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="openLocation()">
              <MapPin class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ businessLocation.address }}</p>
                <!-- 经纬度显示在位置名称下方 -->
                <p v-if="businessLocation.location" class="text-xs text-blue-500 mt-0.5 select-all">
                  {{ businessLocation.location.latitude.toFixed(4) }}, {{ businessLocation.location.longitude.toFixed(4)
                  }}
                </p>
                <p class="text-xs text-gray-400">{{ t('lng_info_location_label') }}</p>
              </div>
              <ExternalLink class="w-4 h-4 text-gray-400 shrink-0" />
            </button>

            <!-- 3.6 营业时间（点击展开/收起详细时段） -->
            <div v-if="businessOpenNow" class="overflow-hidden">
              <button type="button"
                class="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                @click="hoursExpanded = !hoursExpanded">
                <Clock class="w-5 h-5 text-gray-400 shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium" :class="businessOpenNow.open ? 'text-green-600' : 'text-red-500'">
                    {{ businessOpenNow.text }}
                  </p>
                  <p class="text-xs text-gray-400">{{ t('lng_info_hours_label') }}</p>
                </div>
                <span class="shrink-0 text-xs text-gray-500 flex items-center gap-0.5">
                  <template v-if="!businessOpenNow.open && businessOpenNow.next">{{ businessOpenNow.next }}</template>
                  <ChevronDown class="w-4 h-4 text-gray-400 transition-transform duration-200"
                    :class="{ 'rotate-180': hoursExpanded }" />
                </span>
              </button>
              <!-- 展开的详细时段 -->
              <div v-if="hoursExpanded && businessHours.length"
                class="px-3.5 py-2 pb-3.5 border-t border-gray-100 dark:border-gray-800">
                <p v-for="(line, i) in businessHours" :key="i"
                  class="text-xs text-gray-600 dark:text-gray-400 pl-7 leading-relaxed">
                  {{ line }}
                </p>
              </div>
            </div>

            <!-- 3.7 ID -->
            <div class="flex items-center gap-3 p-3.5">
              <IdCardIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                  <CopyableText :text="String(user?.id)" @click.stop />
                </p>
                <p class="text-xs text-gray-400">ID</p>
              </div>
              <button v-if="!isSelf" type="button"
                class="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                @click="copyId">
                <Copy class="w-3.5 h-3.5" />
                {{ t('lng_chat_link_copy') }}
              </button>
            </div>

            <!-- 机器人资料（如为机器人） -->
            <div v-if="isBot" class="p-3.5">
              <div class="flex items-center gap-2 mb-1">
                <Bot class="w-5 h-5 text-gray-400" />
                <span class="text-sm font-medium">{{ t('lng_status_bot') }}</span>
              </div>
              <p v-if="botDescription" class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {{ botDescription }}
              </p>
              <div v-if="botInfo?.commands && botInfo.commands.length > 0" class="mt-2 space-y-1">
                <p v-for="cmd in botInfo.commands.slice(0, 8)" :key="cmd.command" class="text-sm">
                  <span class="font-mono text-teal-600">/{{ cmd.command }}</span>
                  <span class="text-gray-600 dark:text-gray-400 ml-2">{{ cmd.description }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>


        <!-- ===== 第四部分：底部功能导航栏（动态 / 归档动态 / 礼物 / 共享媒体） =====
             滚动时粘性置顶；下方内容区保证足够高度，切换标签时标签栏稳定贴顶、内容不闪空 -->
        <div v-if="hasBottomContent" ref="profileTabsEl" class="px-4 mt-5 sticky top-0 z-10 py-2 scroll-mt-0">
          <SlidingTabBar :active-id="activeTab" :tabs="profileTabItems" :variant="settings.folderStyle"
            :tab-class="(id, active) => folderTabClass(settings.folderStyle, id, active)"
            :show-indicator="settings.folderStyle === 'tabs'" @select="onProfileTabSelect">
            <template #default="{ tab, active }">
              <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
                <component :is="tabIcon(tab.key)" class="w-3.5 h-3.5" />
                {{ tab.label }}
                <span v-if="tab.count > 0"
                  class="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none" :class="active && settings.folderStyle === 'pills'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'">
                  {{ tab.count > 999 ? `${Math.floor(tab.count / 1000)}k` : tab.count }}
                </span>
              </span>
            </template>
          </SlidingTabBar>
        </div>

        <!-- ===== 第五部分：媒体内容区（宫格 + 共享媒体）=====
             min-h + 较大底部留白：保证可滚到标签栏完全置顶，切换标签时高度不塌缩 -->
        <div v-if="hasBottomContent" ref="mediaContentEl" class="px-4 mt-3 min-h-[70vh] pb-24">
          <!-- 动态区 -->
          <div v-if="activeTab === 'stories'" class="py-6 text-center text-sm text-gray-400">
            <p v-if="isLoading">{{ t('lng_contacts_loading') }}</p>
            <div v-else-if="displayActiveStories.length > 0" class="grid grid-cols-3 gap-1.5">
              <button v-for="s in displayActiveStories" :key="s.id" type="button"
                class="aspect-3/4 w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700 relative"
                @click="openStory(s)">
                <img v-if="storyUrlOf(s)" :src="storyUrlOf(s)" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-400">
                </div>
                <span v-if="formatStoryDuration(s)"
                  class="absolute bottom-1 right-1 text-[10px] leading-none bg-black/55 text-white px-1 py-0.5 rounded">
                  {{ formatStoryDuration(s) }}
                </span>
              </button>
            </div>
          </div>

          <!-- 归档动态区（仅用户自己） -->
          <div v-else-if="activeTab === 'archived' && !chatMode && isSelf"
            class="py-6 text-center text-sm text-gray-400">
            <p v-if="isLoading">{{ t('lng_contacts_loading') }}</p>
            <div v-else-if="displayArchivedStories.length > 0" class="grid grid-cols-3 gap-1.5">
              <button v-for="s in displayArchivedStories" :key="s.id" type="button"
                class="aspect-3/4 w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700 relative"
                @click="openStory(s)">
                <img v-if="storyUrlOf(s)" :src="storyUrlOf(s)" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-400">
                  {{ t('lng_media_type_stories') }}
                </div>
                <span v-if="formatStoryDuration(s)"
                  class="absolute bottom-1 right-1 text-[10px] leading-none bg-black/55 text-white px-1 py-0.5 rounded">
                  {{ formatStoryDuration(s) }}
                </span>
              </button>
            </div>
          </div>

          <!-- 礼物区（仅普通用户） -->
          <div v-else-if="activeTab === 'gifts' && !chatMode && giftsList.length > 0"
            class="py-6 text-center text-sm text-gray-400">
            <div class="flex items-center justify-between mb-2">
              <span class="px-2 py-0.5 rounded-lg bg-teal-600 text-white text-xs font-medium">{{
                t('lng_media_type_gifts')
              }}</span>
            </div>
            <div class="grid grid-cols-4 gap-1.5">
              <div v-for="(gift, i) in giftsList" :key="gift.received_gift_id || i"
                class="flex items-center justify-center" :title="giftText(gift)">
                <GiftDisplay :gift="gift" :size="profileGiftCellSize" :show-sender-avatar="!gift.is_private" />
              </div>
            </div>
          </div>

          <!-- 共同群组区：用户资料（他人）或秘密聊天资料 -->
          <div v-else-if="activeTab === 'groups' && commonGroupsList.length > 0" class="py-4">
            <div>
              <button v-for="gid in commonGroupsList" :key="gid" type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="openCommonGroup(gid)">
                <div class="w-10 h-10 shrink-0">
                  <Avatar :photo="getReactiveChat(gid)?.photo" :title="getChatTitle(getReactiveChat(gid))"
                    :accentColorId="getReactiveChat(gid)?.profile_accent_color_id ?? getReactiveChat(gid)?.accent_color_id"
                    sizeClass="!w-10 !h-10" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {{ getChatTitle(getReactiveChat(gid)) || gid }}</p>
                </div>
              </button>
            </div>
          </div>

          <!-- 成员区（频道/群组成员） -->
          <div v-else-if="activeTab === 'members' && chatMemberCountText" class="py-4">
            <p class="text-center text-sm text-gray-400 py-6">{{ chatMemberCountText }}</p>
          </div>

          <!-- 话题区（论坛话题） -->
          <div v-else-if="activeTab === 'topics'" class="py-4" />

          <!-- 共享媒体区（照片/视频） -->
          <div v-else-if="activeTab === 'media'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">{{ t('lng_contacts_loading')
            }}</div>
            <div v-else-if="sharedMediaItems.length > 0" class="grid grid-cols-5 gap-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId" :data-shared-media-id="item.messageId"
                class="aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 relative cursor-pointer"
                @click="openSharedMediaViewer(sharedMediaItems.indexOf(item))"
                @contextmenu.stop="showSharedMediaContextMenu($event, item)">
                <!-- minithumbnail 模糊垫底，直到高清图解码完成 -->
                <img v-if="sharedMediaMiniSrc(item) && !isSharedMediaThumbDecoded(item.messageId)"
                  :src="sharedMediaMiniSrc(item)"
                  class="absolute inset-0 w-full h-full object-cover scale-110 blur-sm" />
                <!-- 高清缩略图：解码完成后再淡入，覆盖在迷你图之上 -->
                <img v-if="sharedMediaUrl(item.messageId)" :src="sharedMediaUrl(item.messageId)"
                  class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                  :class="isSharedMediaThumbDecoded(item.messageId) ? 'opacity-100' : 'opacity-0'"
                  @load="markSharedMediaThumbDecoded(item.messageId)" />
                <!-- 未下载且无 minithumbnail 时的占位 -->
                <div v-if="!sharedMediaMiniSrc(item) && !sharedMediaUrl(item.messageId)"
                  class="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                  <Film class="w-6 h-6" />
                </div>
                <!-- 视频角标 -->
                <span v-if="item.isVideo && item.duration"
                  class="absolute bottom-1 right-1 text-[10px] leading-none bg-black/60 text-white px-1 py-0.5 rounded">
                  {{ `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}` }}
                </span>
              </div>
            </div>
            <!-- 无限滚动哨兵 -->
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">{{ t('lng_contacts_loading') }}</span>
            </div>
          </div>

          <!-- 共享文件区 -->
          <div v-else-if="activeTab === 'files'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">{{ t('lng_contacts_loading')
            }}</div>
            <div v-else-if="sharedMediaItems.length > 0" class="space-y-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                @click="jumpToMessage(item.chatId, item.messageId)"
                @contextmenu.stop="showSharedMediaContextMenu($event, item)">
                <div
                  class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <FileText class="w-5 h-5 text-gray-400" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ item.fileName ||
                    t('lng_in_dlg_file') }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` :
                    '' }}
                  </p>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">{{ t('lng_contacts_loading') }}</span>
            </div>
          </div>

          <!-- 共享链接区：日期分组 + 头像/标题/描述/URL -->
          <div v-else-if="activeTab === 'links'" class="py-2">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">{{ t('lng_contacts_loading')
            }}</div>
            <div v-else-if="sharedMediaItems.length > 0" class="space-y-4">
              <div v-for="group in linkGroups" :key="group.date || group.label">
                <!-- 日期标题 -->
                <p v-if="group.label" class="px-1 mb-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  {{ group.label }}
                </p>
                <!-- 当日链接 -->
                <div class="space-y-0.5">
                  <div v-for="item in group.items" :key="item.messageId" :data-shared-media-id="item.messageId"
                    class="flex items-start gap-3 px-1 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    @click="openSharedLink(item.url)" @contextmenu.stop="showSharedMediaContextMenu($event, item)">
                    <!-- 头像：mini 垫底，高清封面解码完成后再淡入；两者皆无则首字母 -->
                    <div
                      class="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-blue-500 text-white flex items-center justify-center text-xl font-semibold relative">
                      <img v-if="item.linkMiniSrc && !isSharedMediaThumbDecoded(item.messageId)" :src="item.linkMiniSrc"
                        class="absolute inset-0 w-full h-full object-cover" />
                      <img v-if="sharedMediaUrl(item.messageId)" :src="sharedMediaUrl(item.messageId)"
                        class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                        :class="isSharedMediaThumbDecoded(item.messageId) ? 'opacity-100' : 'opacity-0'"
                        @load="markSharedMediaThumbDecoded(item.messageId)" />
                      <span v-if="!item.linkMiniSrc && !sharedMediaUrl(item.messageId)">{{ (item.linkTitle || item.url
                        ||
                        'L').trim().charAt(0).toUpperCase() }}</span>
                    </div>
                    <!-- 文案 -->
                    <div class="min-w-0 flex-1 pt-0.5">
                      <p v-if="item.linkTitle"
                        class="text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-snug wrap-break-word">
                        <GlobalEmojiText :text="item.linkTitle" />
                      </p>
                      <p v-if="item.linkDescription"
                        class="mt-0.5 text-[13px] text-gray-700 dark:text-gray-300 leading-snug wrap-break-word line-clamp-3">
                        {{ item.linkDescription }}
                      </p>
                      <p v-if="item.url"
                        class="mt-1 text-[13px] text-blue-500 dark:text-blue-400 leading-snug wrap-break-word break-all">
                        {{ item.url }}
                      </p>
                      <p v-else class="mt-1 text-[13px] text-blue-500 dark:text-blue-400">
                        {{ t('lng_link_header_short') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">{{ t('lng_contacts_loading') }}</span>
            </div>
          </div>

          <!-- 共享音乐区 -->
          <div v-else-if="activeTab === 'music'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">{{ t('lng_contacts_loading')
            }}</div>
            <div v-else-if="sharedMediaItems.length > 0" class="space-y-1">
              <div v-for="(item, idx) in sharedMediaItems" :key="item.messageId" :data-shared-media-id="item.messageId"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                @click="playSharedMusic(idx)" @contextmenu.stop="showSharedMediaContextMenu($event, item)">
                <!-- 专辑封面：mini 垫底，高清解码完成后再淡入 -->
                <div
                  class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden relative">
                  <img v-if="item.miniSrc && !isSharedMediaThumbDecoded(item.messageId)" :src="item.miniSrc"
                    class="absolute inset-0 w-full h-full object-cover" />
                  <img v-if="sharedMediaUrl(item.messageId)" :src="sharedMediaUrl(item.messageId)"
                    class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                    :class="isSharedMediaThumbDecoded(item.messageId) ? 'opacity-100' : 'opacity-0'"
                    @load="markSharedMediaThumbDecoded(item.messageId)" />
                  <Music v-if="!item.miniSrc && !sharedMediaUrl(item.messageId)" class="w-5 h-5 text-gray-400" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {{ item.audioTitle || item.fileName || '' }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5 truncate">
                    {{ item.performer || '' }}<template v-if="item.performer && item.audioDuration"> ·
                    </template><template v-if="item.audioDuration">{{ formatAudioDuration(item.audioDuration)
                    }}</template>
                  </p>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">{{ t('lng_contacts_loading') }}</span>
            </div>
          </div>

          <!-- 共享语音区 -->
          <div v-else-if="activeTab === 'voice'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">{{ t('lng_contacts_loading')
            }}</div>
            <div v-else-if="sharedMediaItems.length > 0" class="space-y-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                @click="jumpToMessage(item.chatId, item.messageId)"
                @contextmenu.stop="showSharedMediaContextMenu($event, item)">
                <div
                  class="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Mic class="w-5 h-5 text-gray-400" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ t('lng_all_voice') }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` :
                    '' }}
                  </p>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">{{ t('lng_contacts_loading') }}</span>
            </div>
          </div>

          <!-- GIF 区 -->
          <div v-else-if="activeTab === 'gifs'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">{{ t('lng_contacts_loading')
            }}</div>
            <div v-else-if="sharedMediaItems.length > 0" class="grid grid-cols-5 gap-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId" :data-shared-media-id="item.messageId"
                class="aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 relative cursor-pointer"
                @click="openSharedMediaViewer(sharedMediaItems.indexOf(item))"
                @contextmenu.stop="showSharedMediaContextMenu($event, item)">
                <!-- minithumbnail 模糊垫底，直到高清图/动图解码完成 -->
                <img v-if="sharedMediaMiniSrc(item) && !isSharedMediaThumbDecoded(item.messageId)"
                  :src="sharedMediaMiniSrc(item)"
                  class="absolute inset-0 w-full h-full object-cover scale-110 blur-sm" />
                <!-- 高清静态图：解码完成后再淡入 -->
                <img v-if="sharedMediaUrl(item.messageId) && !isVideoThumb(item)" :src="sharedMediaUrl(item.messageId)"
                  class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                  :class="isSharedMediaThumbDecoded(item.messageId) ? 'opacity-100' : 'opacity-0'"
                  @load="markSharedMediaThumbDecoded(item.messageId)" />
                <!-- MPEG4/WEBM 动图预览：首帧就绪后再淡入 -->
                <video v-else-if="sharedMediaUrl(item.messageId)" :src="sharedMediaUrl(item.messageId)"
                  class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                  :class="isSharedMediaThumbDecoded(item.messageId) ? 'opacity-100' : 'opacity-0'" autoplay muted loop
                  playsinline @loadeddata="markSharedMediaThumbDecoded(item.messageId)" />
                <div v-if="!sharedMediaMiniSrc(item) && !sharedMediaUrl(item.messageId)"
                  class="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                  <Film class="w-6 h-6" />
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">{{ t('lng_contacts_loading') }}</span>
            </div>
          </div>
        </div>

        <!-- ===== 加载 / 错误状态（用户模式） ===== -->
        <div v-if="!chatMode && isLoading" class="flex items-center justify-center py-16 text-gray-400 text-sm">
          {{ t('lng_contacts_loading') }}
        </div>
        <div v-else-if="!chatMode && hasError"
          class="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p>{{ t('lng_attach_failed') }}</p>
          <button type="button" class="mt-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
            @click="retry">
            {{ t('lng_bot_download_retry') }}
          </button>
        </div>

        <!-- ===== 加载 / 错误状态（频道/群组模式） ===== -->
        <div v-if="chatMode && (chatLoading || (!chatObj && !chatError))"
          class="flex items-center justify-center py-16 text-gray-400 text-sm">
          {{ t('lng_contacts_loading') }}
        </div>
        <div v-else-if="chatMode && chatError"
          class="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p>{{ t('lng_attach_failed') }}</p>
          <button type="button" class="mt-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
            @click="retry">
            {{ t('lng_bot_download_retry') }}
          </button>
        </div>

        <!-- ===== 照片查看器（复用 MediaViewer，左右切换；动态也走这里） ===== -->
        <MediaViewer :visible="photoViewerVisible" :items="viewerItems" :initial-index="photoViewerIndex"
          :source-rect="null" @close="closePhotoViewer" />

        <!-- ===== 共享媒体查看器 ===== -->
        <MediaViewer :visible="sharedMediaViewerVisible" :items="sharedMediaViewerItems"
          :initial-index="sharedMediaViewerIndex" :source-rect="null" @close="sharedMediaViewerVisible = false" />

        <!-- ===== 自动删除设置弹窗 ===== -->
        <div v-if="autoDeleteVisible"
          class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @mousedown.self="closeAutoDelete">
          <div
            class="w-90 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('lng_manage_messages_ttl_menu') }}
              </h3>
              <button type="button"
                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                @click="closeAutoDelete">
                <XIcon class="w-4 h-4" />
              </button>
            </div>
            <div class="px-4 py-3">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ t('lng_ttl_edit_about', { user: userName }) }}
              </p>
              <div class="space-y-1">
                <button v-for="opt in autoDeleteOptions" :key="opt.value" type="button"
                  class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  :class="autoDeleteTime === opt.value ? 'text-teal-600 dark:text-teal-400 font-semibold' : 'text-gray-700 dark:text-gray-200'"
                  @click="applyAutoDelete(opt.value)">
                  <span>{{ opt.label }}</span>
                  <span v-if="autoDeleteTime === opt.value" class="text-teal-500">✓</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 编辑联系人弹窗 ===== -->
        <div v-if="editContactVisible"
          class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @mousedown.self="closeEditContact">
          <div
            class="w-90 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('lng_info_edit_contact') }}</h3>
              <button type="button"
                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                @click="closeEditContact">
                <XIcon class="w-4 h-4" />
              </button>
            </div>
            <div class="px-4 py-4 space-y-3">
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t("lng_signup_firstname")
                }}</label>
                <input v-model="contactFirstName" type="text" maxlength="64"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  :placeholder="t('lng_settings_name_label')" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t('lng_signup_lastname')
                }}</label>
                <input v-model="contactLastName" type="text" maxlength="64"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  :placeholder="t('lng_signup_lastname')" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t('lng_contact_add_notes')
                }}</label>
                <textarea v-model="contactNote" rows="3"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  :placeholder="t('lng_contact_add_notes')"></textarea>
              </div>
              <p class="text-xs text-gray-500">{{ t('lng_contact_add_notes_about') }}</p>
            </div>
            <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
              <button type="button" @click="closeEditContact"
                class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                {{ t('lng_cancel') }}
              </button>
              <button type="button" @click="saveContact"
                class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600">
                {{ t('lng_settings_save') }}
              </button>
            </div>
          </div>
        </div>

        <!-- ===== 拉黑 / 删除联系人 二级确认弹窗 ===== -->
        <div v-if="confirmDialog.visible"
          class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @mousedown.self="cancelConfirmDialog">
          <div
            class="w-90 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ confirmDialog.title }}</h3>
              <button type="button"
                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                @click="cancelConfirmDialog">
                <XIcon class="w-4 h-4" />
              </button>
            </div>
            <div class="px-4 py-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">{{ confirmDialog.message }}</p>
            </div>
            <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
              <button type="button" @click="cancelConfirmDialog"
                class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                {{ t('lng_cancel') }}
              </button>
              <button type="button" @click="confirmDialog.onConfirm"
                class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600">
                {{ confirmDialog.confirmText }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 用户模式未找到 -->
      <div v-else-if="!chatMode" class="flex items-center justify-center py-16 text-gray-400 text-sm">
        {{ t('lng_attach_failed') }}
      </div>
      <!-- 频道/群组模式加载/错误占位 -->
      <div v-else-if="chatMode && chatError"
        class="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
        <p>{{ t('lng_attach_failed') }}</p>
        <button type="button" class="mt-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
          @click="retry">
          {{ t('lng_bot_download_retry') }}
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="emojiStatusPickerOpen" class="fixed inset-0 z-200" @mousedown="onEmojiStatusBackdrop">
        <div ref="emojiStatusPanel"
          class="fixed w-70 h-80 -translate-x-1/2 rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden"
          :style="emojiStatusPanelStyle" @mousedown.stop>
          <EmojiDrawer :is-premium="true" :show-default-emoji-status="true"
            :emoji-status-gift-statuses="emojiStatusGiftStatuses"
            :emoji-status-recent-statuses="emojiStatusRecentStatuses" @pick-default-status="onDefaultEmojiStatus"
            @pick-custom-emoji="onEmojiStatusPicked" />
        </div>
      </div>
    </Teleport>

    <EncryptionKeyDialog v-model:visible="encryptionKeyVisible" :key-hash="secretKeyHash"
      :partner-name="secretChatPartnerName" />

    <ReportMessageConfirm />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { user as TdUser, userFullInfo, profilePhoto, chatPhoto, receivedGift, story, chat, audio as TdAudio, birthdate, file, message, supergroup, basicGroup, supergroupFullInfo, basicGroupFullInfo, chatPhotoInfo, secretChat, SearchMessagesFilter$Input, emojiStatus, emojiStatus$Input, BlockList$Input } from "tdlib-types";
import Avatar from "../../components/chat/avatar.vue";
import CustomEmojiInline from "../../components/common/CustomEmojiInline.vue";
import GlobalEmojiText from "../../components/common/GlobalEmojiText.vue";
import EmojiDrawer from "../../components/chat/ChatDetail/stickerPanel/EmojiDrawer.vue";
import GiftDisplay from "../../components/common/GiftDisplay.vue";
import MediaViewer from "../../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import type { MediaViewerItem } from "../../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import { useUserProfileStore } from "../../store/userProfile";
import { useUserStore } from "../../store/user";
import { accentColorStyle, rgbToCss } from "../../store/colors";
import { confirmAndOpenExternalLink } from "../../utils/openExternalLink";
import formatStatus from "../../utils/status";
import { downloadFileUrl, listAlbumCoverFiles } from "../../utils/profileMedia";
import { fetchItunesCoverForAudio } from "../../utils/itunesCover";
import { openStoryViewer } from "../../store/storyViewer";
import { formatBusinessHours } from "../../utils/businessHours";
import { tdlibSend } from "../../utils/tdlib";

import { ensureChat, getReactiveUser, getReactiveChat, getChatTitle, DELETED_ACCOUNT_LABEL } from "../../utils/senderInfo";
import { useAudioPlayerStore, type AudioTrack } from "../../store/audioPlayer";
import formatTime from "../../utils/formatTime";
import { openContextMenu, closeContextMenu } from "../../store/contextMenu";
import { confirmReportMessage } from "../../store/reportMessage";
import type { ContextMenuItem } from "../../components/contextMenu/types";
import { MessagePlugin } from "tdesign-vue-next";
import { buildProfileTabs, type ProfileTab, type ProfileTabKey } from "../../utils/profileTabs";
import SlidingTabBar from "../../components/common/SlidingTabBar.vue";
import { settings } from "../../store/settings";
import { shouldAutoDownloadPhotos } from "../../utils/autoDownload";
import { folderTabClass } from "../../utils/folderPillsTabClass";
import type { SharedMediaCounts } from "../../utils/sharedMediaCounts";
import { useProfileSharedMedia } from "../../composables/useProfileSharedMedia";
import { onVisibilityChange, unobserveVisibility } from "../../composables/useSharedIntersectionObserver";
import { formatDateLabel, isSameCalendarDay } from "../../components/chat/ChatDetail/composables/dateLabel";
import { requestCustomEmoji } from "../../store/customEmoji";
import EncryptionKeyDialog from "../../components/user/EncryptionKeyDialog.vue";
import { tdPlural } from "../../utils/tdLang";

// ===== 图标组件（lucide-vue-next，与项目其余部分一致） =====
import {
  ArrowLeft, Copy, Clock, MapPin, Gift, Bot, Play, Pause,
  Music, ChevronDown, Megaphone, ExternalLink, Send, Bell, BellOff,
  MoreHorizontal, TimerReset, Ban, UserPlus, UserMinus, X as XIcon,
  Eye, LogOut, MessageSquareText, PhoneCall, Flag,
  Search, Users, Hash, FileText, Link, Mic, Film, KeyRound,
  Info as InfoIcon, Phone as PhoneIcon, AtSign as AtSignIcon,
  Calendar as CalendarIcon, IdCard as IdCardIcon,
} from "lucide-vue-next"; import { VerifiedFilledIcon } from "tdesign-icons-vue-next";
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const profileStore = useUserProfileStore();
const audioPlayer = useAudioPlayerStore();

/** 资料页纵向滚动容器 / 粘性标签栏（用于切换标签后保持标签栏置顶） */
const profileScrollEl = ref<HTMLElement | null>(null);
const profileTabsEl = ref<HTMLElement | null>(null);

const userId = computed(() => Number(route.params.id));

// =====================================================================
// 模式区分：用户资料页 ｜ 频道/群组资料页（复用同一页面）
// 通过路由名 chat-profile 区分：此时 id 为聊天（频道/群组）id。
// =====================================================================
const chatMode = computed(() => route.name === 'chat-profile');
const chatId = computed(() => (chatMode.value ? Number(route.params.id) : undefined));

/** 私密聊天信息（chatTypeSecret 时有值） */
const secretChatObj = ref<secretChat | undefined>(undefined);
/** 是否为秘密聊天模式 */
const isSecretChat = computed(() => chatObj.value?.type?._ === 'chatTypeSecret');
/** 秘密聊天对应的用户 ID（chatTypeSecret 时使用） */
const secretChatUserId = computed(() => {
  if (chatObj.value?.type?._ === 'chatTypeSecret') return chatObj.value.type.user_id;
  return undefined;
});
/** 秘密聊天用户信息（优先使用 secretChatUserId） */
const secretChatUser = computed<TdUser | undefined>(() => {
  if (!secretChatUserId.value) return undefined;
  return getReactiveUser(secretChatUserId.value);
});
/** 秘密聊天用户完整信息 */
const secretChatFullInfo = computed<userFullInfo | undefined>(() => {
  if (!secretChatUserId.value) return undefined;
  return profileStore.fullInfos.get(secretChatUserId.value);
});

/** 当前资料对应的聊天对象（chatMode 时有值） */
const chatObj = ref<chat | undefined>(undefined);
/** 超级群组/频道信息（chatMode + chatTypeSupergroup 时有值） */
const supergroupObj = ref<supergroup | undefined>(undefined);
/** 基本群组信息（chatMode + chatTypeBasicGroup 时有值） */
const basicGroupObj = ref<basicGroup | undefined>(undefined);
/** 超级群组/频道完整信息（含权威订阅数、简介、关联群组） */
const supergroupFull = ref<supergroupFullInfo | undefined>(undefined);
/** 基本群组完整信息 */
const basicGroupFull = ref<basicGroupFullInfo | undefined>(undefined);

/** 当前聊天是否为频道（is_channel） */
const isChatChannel = computed(() => {
  const t = chatObj.value?.type;
  return t?._ === 'chatTypeSupergroup' && !!t.is_channel;
});
/** 聊天是否已验证 */
const isChatVerified = computed(() => {
  const v = supergroupObj.value?.verification_status;
  return !!v && v.is_verified;
});
/** 聊天是否为超级群组 */
const isChatSupergroup = computed(() => chatObj.value?.type?._ === 'chatTypeSupergroup');
/** 聊天的展示标题（频道/群组名） */
const chatTitle = computed(() => chatObj.value?.title || '');
/** 聊天头像（chat.photo 为 chatPhotoInfo，可直接交给 Avatar 组件） */
const chatPhotoInfo = computed<chatPhotoInfo | undefined>(() => chatObj.value?.photo);
const chatAccentColorId = computed<number | undefined>(() =>
  chatObj.value?.profile_accent_color_id ?? chatObj.value?.accent_color_id,
);
/** 聊天简介（超级群组/基本群组的描述） */
const chatDescription = computed(() => supergroupFull.value?.description || basicGroupFull.value?.description || '');
/** 聊天用户名（来自 supergroup.usernames.active_usernames） */
const chatUsername = computed(() =>
  supergroupObj.value?.usernames?.active_usernames?.[0] || '',
);
/** 关联讨论群组/频道的 chat id（频道有讨论组，或超群是某频道的讨论组） */
const chatLinkedChatId = computed(() => supergroupFull.value?.linked_chat_id || 0);
/** 当前用户在该聊天中的成员状态（是否已订阅/加入） */
const chatMemberStatus = computed(() =>
  isChatSupergroup.value ? supergroupObj.value?.status
    : basicGroupObj.value?.status,
);
/** 是否已订阅/加入该频道/群组（非 Left/Banned） */
const isChatJoined = computed(() => {
  const s = chatMemberStatus.value;
  if (!s) return false;
  return s._ !== 'chatMemberStatusLeft' && s._ !== 'chatMemberStatusBanned';
});
/** 昵称下方副标题：频道/群组 → 订阅/成员人数（在线时间改为订阅数） */
const chatMemberCountText = computed(() => {
  const count = chatMode.value
    ? (supergroupFull.value?.member_count || supergroupObj.value?.member_count || basicGroupObj.value?.member_count || 0)
    : 0;
  if (count <= 0) return isChatChannel.value ? t('lng_notification_channels') : t('lng_notification_groups');
  const unit = isChatChannel.value ? t('lng_profile_subscribers_section') : t('lng_profile_participants_section');
  return `${count.toLocaleString()} ${unit}`;
});

const chatLoaded = ref(false);
const chatLoading = ref(false);
const chatError = ref(false);

const user = computed<TdUser | undefined>(() => profileStore.users.get(userId.value) || getReactiveUser(userId.value));

/** 使用集中缓存的用户对象（优先 profileStore，其次 senderInfo） */
const fullInfo = computed<userFullInfo | undefined>(() => profileStore.fullInfos.get(userId.value));
const photosList = computed<chatPhoto[]>(() => profileStore.photos.get(userId.value) ?? []);
const giftsList = computed<receivedGift[]>(() => profileStore.gifts.get(userId.value) ?? []);
/** 共同群组：用户模式按 route userId；秘密聊天按对方 user_id（route 上是 chat id） */
const commonGroupsList = computed<number[]>(() => {
  const uid = isSecretChat.value ? secretChatUserId.value : userId.value;
  if (!uid) return [];
  return profileStore.commonGroups.get(uid) ?? [];
});
const storiesList = computed<story[]>(() => profileStore.stories.get(userId.value) ?? []);
/** 普通（活跃）动态 */
const activeStoriesList = computed<story[]>(() => profileStore.activeStories.get(userId.value) ?? []);
/** 归档动态 */
const archivedStoriesList = computed<story[]>(() => profileStore.archivedStories.get(userId.value) ?? []);

const isLoading = computed(() => profileStore.loading.get(userId.value) ?? false);
const hasError = computed(() => profileStore.error.get(userId.value) ?? false);

/**
 * 是否显示底部功能导航栏与媒体内容区。
 * 动态或礼物任一存在内容时显示；加载过程中也保持显示，
 * 避免加载完成前因列表仍为空而误隐藏、加载完成后才突兀出现。
 */
const hasBottomContent = computed(() => {
  if (chatMode.value) {
    // 秘密聊天：共同群组 + 共享媒体（媒体一律基于当前 secret chat chat_id）
    if (isSecretChat.value) {
      return chatLoading.value
        || commonGroupsList.value.length > 0
        || sharedMediaCounts.value.media > 0 || sharedMediaCounts.value.files > 0
        || sharedMediaCounts.value.links > 0 || sharedMediaCounts.value.music > 0
        || sharedMediaCounts.value.voice > 0 || sharedMediaCounts.value.gifs > 0;
    }
    return chatLoading.value || chatActiveStories.value.length > 0
      || sharedMediaCounts.value.media > 0 || sharedMediaCounts.value.files > 0
      || sharedMediaCounts.value.links > 0 || sharedMediaCounts.value.music > 0
      || sharedMediaCounts.value.voice > 0 || sharedMediaCounts.value.gifs > 0;
  }
  return isLoading.value || activeStoriesList.value.length > 0 || giftsList.value.length > 0
    || (!isSelf.value && commonGroupsList.value.length > 0)
    || sharedMediaCounts.value.media > 0 || sharedMediaCounts.value.files > 0
    || sharedMediaCounts.value.links > 0 || sharedMediaCounts.value.music > 0
    || sharedMediaCounts.value.voice > 0 || sharedMediaCounts.value.gifs > 0;
});

// ===== 派生属性 =====

/**
 * 是否为「已注销/未知用户」。
 * 已注销账户（userTypeDeleted）或无名（first/last 都为空，即 t('lng_credits_box_history_entry_anonymous')）都按已注销账户处理：
 * 名称显示「已注销账户」、头像显示幽灵图标。
 */
const isDeletedProfile = computed(() => {
  const u = user.value;
  if (!u) return false;
  if (u.type?._ === 'userTypeDeleted') return true;
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() === '';
});

const userName = computed(() =>
  isDeletedProfile.value ? DELETED_ACCOUNT_LABEL
    : `${user.value?.first_name ?? ''} ${user.value?.last_name ?? ''}`.trim() || t('lng_credits_box_history_entry_anonymous'));
// 主用户名（active_usernames[0]）
const primaryUsername = computed(() => user.value?.usernames?.active_usernames?.[0] || '');
// 附加用户名（其余 active + collectible），与主用户名区分
const additionalUsernames = computed<string[]>(() => {
  const active = user.value?.usernames?.active_usernames ?? [];
  const addl = active.slice(1);
  const collectible = user.value?.usernames?.collectible_usernames ?? [];
  return [...addl, ...collectible].filter((u) => u && u !== primaryUsername.value);
});
const isSelf = computed(() => !!user.value && user.value.id === userStore.userProfile?.id);
const statusText = computed(() =>
  isDeletedProfile.value ? DELETED_ACCOUNT_LABEL : formatStatus(user.value?.status));

/** 用户主题色样式：主题色文本 + 主题色 10% 透明度背景（用于频道订阅数徽标） */
const profileAccent = computed(() => {
  const id = typeof user.value?.profile_accent_color_id === 'number'
    ? user.value.profile_accent_color_id
    : 5;
  const style = accentColorStyle(id);
  return {
    color: style.color,
    softBg: rgbToCss(style.main, 0.10),
  };
});

/** 当前用户的资料音乐是否正在播放（用于封面上显示播放/暂停按钮） */
const isUserMusicPlaying = computed(() =>
  audioPlayer.profileAudioUserId === userId.value
  && audioPlayer.isPlaying
  && audioPlayer.currentTrack?.source === 'profile'
);

/** 自定义 emoji 状态的 custom_emoji_id（emojiStatusTypeCustomEmoji 类型时才有） */
const emojiStatusDisplayId = computed<string | undefined>(() => {
  const t = user.value?.emoji_status?.type;
  if (t && t._ === 'emojiStatusTypeCustomEmoji') return t.custom_emoji_id;
  if (t && t._ === 'emojiStatusTypeUpgradedGift') return t.model_custom_emoji_id;
  return undefined;
});

type EmojiStatusOption = {
  key: string;
  emojiId: string;
  title: string;
  status?: emojiStatus;
};

const emojiStatusPickerOpen = ref(false);
const emojiStatusLoading = ref(false);
const emojiStatusOptions = ref<EmojiStatusOption[]>([]);
const emojiStatusGiftStatuses = ref<emojiStatus[]>([]);
const emojiStatusRecentStatuses = ref<emojiStatus[]>([]);
const emojiStatusPanelStyle = ref<Record<string, string>>({ top: '8px', left: '8px' });
let emojiStatusRequestId = 0;

function customEmojiIdOf(status: any): string | undefined {
  if (status?.type?._ === 'emojiStatusTypeCustomEmoji') return String(status.type.custom_emoji_id);
  return undefined;
}

async function loadEmojiStatusOptions() {
  const requestId = ++emojiStatusRequestId;
  emojiStatusLoading.value = true;
  try {
    const [themed, recent, defaults, gifts, installed] = await Promise.all([
      tdlibSend({ _: 'getThemedEmojiStatuses' }).catch(() => ({ custom_emoji_ids: [] })),
      tdlibSend({ _: 'getRecentEmojiStatuses' }).catch(() => ({ emoji_statuses: [] })),
      tdlibSend({ _: 'getDefaultEmojiStatuses' }).catch(() => ({ custom_emoji_ids: [] })),
      tdlibSend({ _: 'getUpgradedGiftEmojiStatuses' }).catch(() => ({ emoji_statuses: [] })),
      tdlibSend({ _: 'getInstalledStickerSets', sticker_type: { _: 'stickerTypeCustomEmoji' } }).catch(() => ({ sets: [] })),
    ]);
    if (requestId !== emojiStatusRequestId) return;

    const defaultIds: string[] = [];
    const addDefaultId = (id: unknown) => {
      if (id !== undefined && id !== null && !defaultIds.includes(String(id))) defaultIds.push(String(id));
    };
    for (const id of themed.custom_emoji_ids.slice(0, 7)) addDefaultId(id);
    for (const status of recent.emoji_statuses) addDefaultId(customEmojiIdOf(status));
    for (const id of defaults.custom_emoji_ids) addDefaultId(id);

    const giftStatuses = gifts.emoji_statuses;
    emojiStatusRecentStatuses.value = recent.emoji_statuses;
    emojiStatusGiftStatuses.value = giftStatuses;
    const giftIds = giftStatuses
      .map((status: any) => status.type?._ === 'emojiStatusTypeUpgradedGift' ? String(status.type.model_custom_emoji_id) : undefined)
      .filter((id): id is string => !!id);

    const installedIds: string[] = [];
    for (const set of installed.sets) {
      const stickerSet = await tdlibSend({ _: 'getStickerSet', set_id: set.id }).catch(() => undefined);
      for (const sticker of stickerSet?.stickers ?? []) {
        if (sticker.id) installedIds.push(String(sticker.id));
      }
    }

    const allIds = [...new Set([...defaultIds, ...giftIds, ...installedIds])].slice(0, 200);
    await tdlibSend({ _: 'getCustomEmojiStickers', custom_emoji_ids: giftIds }).catch(() => undefined);
    await tdlibSend({ _: 'getCustomEmojiStickers', custom_emoji_ids: allIds }).catch(() => undefined);
    if (requestId !== emojiStatusRequestId) return;

    const seen = new Set<string>();
    const options: EmojiStatusOption[] = [];
    const addOption = (emojiId: string, title: string, status?: emojiStatus) => {
      if (seen.has(emojiId)) return;
      seen.add(emojiId);
      options.push({ key: `${title}-${emojiId}`, emojiId, title, status });
      requestCustomEmoji(emojiId);
    };
    for (const id of defaultIds) addOption(id, t('lng_media_type_gifts'));
    for (const status of giftStatuses) {
      const id = status.type._ === 'emojiStatusTypeUpgradedGift'
        ? String(status.type.model_custom_emoji_id) : undefined;
      if (id) addOption(id, t('lng_gift_upgrade_title'), status);
    }
    for (const id of installedIds) addOption(id, t('lng_emoji_added'));
    emojiStatusOptions.value = options;
  } finally {
    if (requestId === emojiStatusRequestId) emojiStatusLoading.value = false;
  }
}

function openEmojiStatusPicker(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const width = 280;
  const center = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(width / 2 + 8, center),
    window.innerWidth - width / 2 - 8,
  );
  const top = rect.bottom + 8;
  emojiStatusPanelStyle.value = { top: `${top}px`, left: `${left}px` };
  emojiStatusPickerOpen.value = true;
  if (emojiStatusOptions.value.length === 0) void loadEmojiStatusOptions();
}

function closeEmojiStatusPicker() {
  emojiStatusRequestId++;
  emojiStatusPickerOpen.value = false;
}

function onEmojiStatusBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget) closeEmojiStatusPicker();
}

function onEmojiStatusPicked(emojiId: string) {
  const giftStatus = [...emojiStatusGiftStatuses.value, ...emojiStatusRecentStatuses.value].find((status: any) =>
    status.type?._ === 'emojiStatusTypeUpgradedGift'
    && String(status.type.model_custom_emoji_id) === String(emojiId));
  void setEmojiStatus({
    key: `selected-${emojiId}`,
    emojiId,
    title: giftStatus ? t('lng_gift_upgrade_title') : t('lng_feature_custom_emoji_pack'),
    status: giftStatus,
  });
}

function onDefaultEmojiStatus() {
  void setEmojiStatus();
}

async function setEmojiStatus(option?: EmojiStatusOption) {
  try {
    await tdlibSend({
      _: 'setEmojiStatus',
      emoji_status: option?.status
        ? { _: 'emojiStatus', type: option.status.type, expiration_date: option.status.expiration_date }
        : option
          ? { _: 'emojiStatus', type: { _: 'emojiStatusTypeCustomEmoji', custom_emoji_id: option.emojiId }, expiration_date: 0 }
          : null as unknown as emojiStatus$Input,
    });
    closeEmojiStatusPicker();
    await profileStore.loadProfile(userId.value);
  } catch (error) {
    console.error('Failed to set emoji status:', error);
  }
}

/** 认证/安全状态：verified（蓝 V）｜fake（假冒）｜scam（诈骗）｜none */
const verificationType = computed<'verified' | 'fake' | 'scam' | 'none'>(() => {
  const v = user.value?.verification_status;
  if (!v) return 'none';
  if (v.is_verified) return 'verified';
  if (v.is_fake) return 'fake';
  if (v.is_scam) return 'scam';
  return 'none';
});
const bioText = computed(() => fullInfo.value?.bio?.text || '');
const birthdateInfo = computed<birthdate | undefined>(() => fullInfo.value?.birthdate);
const birthdateText = computed(() => {
  const b = birthdateInfo.value;
  if (!b || !b.day || !b.month) return '';
  // 未设置年份（year === 0）时省略年，只显示月-日
  if (!b.year || b.year === 0) {
    return `${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
  }
  return `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
});
const personalChatId = computed(() => fullInfo.value?.personal_chat_id || 0);
/** 个人资料关联的频道（chat）对象，供头像/标题使用 */
const personalChat = computed<chat | undefined>(() =>
  personalChatId.value ? getReactiveChat(personalChatId.value) : undefined,
);
const personalChatTitle = computed(() => personalChat.value?.title || t('lng_settings_channel_label'));
const personalChatPhoto = computed(() => personalChat.value?.photo);
const personalChatAccent = computed(() => personalChat.value?.profile_accent_color_id);

/** 关联频道的最新推送消息（用于资料页订阅卡片展示） */
const channelLastMessage = computed(() => personalChat.value?.last_message);
/** 关联频道订阅数（member_count）；未拿到时为 null */
const channelMemberCount = ref<number | null>(null);
async function loadChannelInfo() {
  channelMemberCount.value = null;
  const c = personalChat.value;
  if (!c || !personalChatId.value) return;
  // 尝试从 supergroup 拿订阅数
  try {
    const t = c.type;
    const sgId = t?._ === 'chatTypeSupergroup' ? t.supergroup_id : undefined;
    if (sgId) {
      const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: sgId });
      channelMemberCount.value = sg?.member_count ?? null;
    }
  } catch (e) {
    console.error('Failed to load channel member count', e);
  }
}

/** 频道推送消息的纯文本预览（用于订阅卡片正文） */
function channelPreview(msg: message | undefined): string {
  if (!msg) return '';
  // 文本类消息：content.text 是 formattedText（{ text, entities }），取 .text 字符串
  if (msg.content._ === 'messageText') {
    return msg.content.text?.text || '';
  }
  // 带 caption 的媒体消息：caption 也是 formattedText
  if ('caption' in msg.content) return msg.content.caption?.text || '';
  return '';
}

/** 频道订阅按钮文本，如「2452 订阅」 */
const channelMemberText = computed(() => {
  if (channelMemberCount.value === null || channelMemberCount.value === undefined) {
    return t('lng_chat_status_subscribers', { count: 0 });
  }
  return t('lng_chat_status_subscribers', { count: channelMemberCount.value.toLocaleString() });
});

/** 频道推送的纯文本概要（保留正文，含 #话题，仅去除首尾空白） */
const channelPreviewText = computed(() => {
  const raw = channelPreview(channelLastMessage.value);
  return raw.trim();
});

/** 频道推送时间（HH:MM） */
const channelPostTime = computed(() => {
  const date = channelLastMessage.value?.date;
  if (!date) return '';
  return formatTime(date);
});

/** 底部导航栏当前选中的标签 */
const activeTab = ref<ProfileTabKey>('stories');

/** 共享媒体计数（由 getChatMessageCount 获取） */
const sharedMediaCounts = ref<SharedMediaCounts>({ media: 0, files: 0, links: 0, music: 0, voice: 0, gifs: 0 });

/** 动态生成的 Tab 列表（匹配 Unigram 的 ProfileTab 系统） */
const profileTabs = computed<ProfileTab[]>(() => {
  const storyList = chatMode.value ? chatActiveStories.value : activeStoriesList.value;
  const archivedList = chatMode.value ? chatArchivedStories.value : archivedStoriesList.value;

  return buildProfileTabs({
    chatMode: chatMode.value,
    isSelf: isSelf.value,
    hasPostedStories: storyList.length > 0,
    hasArchivedStories: archivedList.length > 0,
    giftCount: giftsList.value.length,
    commonGroupCount: commonGroupsList.value.length,
    isBot: isBot.value,
    hasTopics: false,
    chatType: chatObj.value?.type,
    isChannel: isChatChannel.value,
    hasForumTabs: false,
    memberCount: chatMode.value
      ? (supergroupFull.value?.member_count || supergroupObj.value?.member_count || basicGroupObj.value?.member_count || 0)
      : 0,
    mediaCount: sharedMediaCounts.value.media,
    fileCount: sharedMediaCounts.value.files,
    linkCount: sharedMediaCounts.value.links,
    musicCount: sharedMediaCounts.value.music,
    voiceCount: sharedMediaCounts.value.voice,
    gifCount: sharedMediaCounts.value.gifs,
  });
});

/** 映射为 SlidingTabBar 需要的 id 字段 */
const profileTabItems = computed(() =>
  profileTabs.value.map((t) => ({ ...t, id: t.key })),
);

/** 进入/切换资料页后，待标签栏就绪时自动选中第一个可用标签 */
let shouldSelectFirstTab = true;

function onProfileTabSelect(id: string) {
  activeTab.value = id as ProfileTabKey;
  // 切换标签后：若标签栏已贴在滚动区顶部，则保持置顶，避免内容高度变化导致粘性条跳动闪空
  nextTick(() => {
    const scroller = profileScrollEl.value;
    const bar = profileTabsEl.value;
    if (!scroller || !bar) return;
    const scrollerTop = scroller.getBoundingClientRect().top;
    const barTop = bar.getBoundingClientRect().top;
    // 仅在标签栏已接近/低于顶部时回正 scrollTop，不打断用户仍看上方内容时的滚动位置
    if (barTop <= scrollerTop + 1) {
      scroller.scrollTop += barTop - scrollerTop;
    }
  });
}

/** Tab 图标映射 */
const tabIconMap: Record<ProfileTabKey, any> = {
  stories: Eye,
  archived: Eye,
  gifts: Gift,
  groups: Users,
  members: Users,
  topics: Hash,
  media: Film,
  files: FileText,
  links: Link,
  music: Music,
  voice: Mic,
  gifs: Film,
};

/** 插槽里 tab.key 是 any，这里收窄后再查图标，避免 TS7053 */
function tabIcon(key: string) {
  return (tabIconMap as Record<string, unknown>)[key];
}

// =====================================================================
// 共享媒体搜索与展示
// =====================================================================
/** Tab → SearchMessagesFilter 映射 */
const sharedMediaFilterMap: Record<string, SearchMessagesFilter$Input> = {
  media: { _: 'searchMessagesFilterPhotoAndVideo' },
  files: { _: 'searchMessagesFilterDocument' },
  links: { _: 'searchMessagesFilterUrl' },
  music: { _: 'searchMessagesFilterAudio' },
  voice: { _: 'searchMessagesFilterVoiceAndVideoNote' },
  gifs: { _: 'searchMessagesFilterAnimation' },
};

/** 私聊 chat id（懒加载，通过 createPrivateChat 获取/创建与用户的私聊） */
const privateChatId = ref<number | undefined>(undefined);

/** 当前共享媒体搜索使用的 chatId：
 *  - 聊天模式（含秘密聊天）：始终用路由上的 chat id（秘密聊天 = 当前 secret chat，不回落到普通私聊）
 *  - 用户模式：懒创建/获取与该用户的普通私聊 id
 */
const sharedMediaChatId = computed<number | undefined>(() => {
  if (chatMode.value) return chatId.value;
  return privateChatId.value;
});

/** 共享媒体缩略图 URL 缓存（messageId → URL） */
const sharedMediaUrlCache = ref<Record<number, string>>({});

/** 当前选中的共享媒体 filter */
const currentSharedMediaFilter = computed<SearchMessagesFilter$Input | undefined>(() => {
  const f = sharedMediaFilterMap[activeTab.value];
  return f || undefined;
});

/** 共享媒体懒加载 hook */
const {
  items: sharedMediaItems,
  loading: sharedMediaLoading,
  loadingMore: sharedMediaLoadingMore,
  hasMore: sharedMediaHasMore,
  loadMore: sharedMediaLoadMore,
  reset: sharedMediaReset,
} = useProfileSharedMedia(sharedMediaChatId, currentSharedMediaFilter);

/** 链接列表：按日期分组（同一天合并，顶部显示日期标题）；无任何可展示内容的项跳过 */
const linkGroups = computed(() => {
  const groups: { date: number; label: string; items: typeof sharedMediaItems.value }[] = [];
  for (const item of sharedMediaItems.value) {
    // 没有 URL/标题/描述 的项（例如无 caption 的音频）不进链接列表
    if (!item.url && !item.linkTitle && !item.linkDescription) continue;
    const d = item.date ?? item.message?.date ?? 0;
    const last = groups[groups.length - 1];
    if (last && isSameCalendarDay(last.date, d)) {
      last.items.push(item);
    } else {
      groups.push({ date: d, label: d > 0 ? formatDateLabel(d) : '', items: [item] });
    }
  }
  return groups;
});

/** activeTab 切换时重新拉取共享媒体（仅在切换到共享媒体 tab 时） */
let lastLoadedFilter = '';
watch(activeTab, (tab) => {
  const f = sharedMediaFilterMap[tab];
  if (f && sharedMediaChatId.value) {
    const key = `${sharedMediaChatId.value}:${tab}`;
    if (key !== lastLoadedFilter) {
      lastLoadedFilter = key;
      sharedMediaReset();
    }
  }
});

/**
 * 共享媒体缩略图串行下载队列。
 * - 视口内才入队，全部依次下载（同一时刻仅一个在下）
 * - 离开视口且尚未开始的项从等待队列移除
 * - 已在下载中的项不打断，完成后照常写缓存
 */
const mediaContentEl = ref<HTMLElement | null>(null);
const sharedMediaCellEls = new Map<number, Element>();
const sharedMediaThumbQueue = new Map<number, any>();
const sharedMediaThumbInFlight = new Set<number>();
let sharedMediaThumbPumpRunning = false;

/** 该项是否还有缩略图/封面需要下载 */
function sharedMediaNeedsThumb(item: any): boolean {
  if (!item?.messageId) return false;
  if (sharedMediaUrlCache.value[item.messageId]) return false;
  if (item.src) return false;
  return !!(item.photo || item.thumbFile || item.linkCoverFile || item.contentType === 'messageAudio');
}

function enqueueSharedMediaThumb(item: any) {
  if (!sharedMediaNeedsThumb(item)) return;
  if (sharedMediaThumbInFlight.has(item.messageId)) return;
  if (sharedMediaThumbQueue.has(item.messageId)) return;
  sharedMediaThumbQueue.set(item.messageId, item);
  void pumpSharedMediaThumbQueue();
}

/** 离开视口：仅移出等待队列，不中断进行中的下载 */
function dequeueSharedMediaThumb(messageId: number) {
  sharedMediaThumbQueue.delete(messageId);
}

async function pumpSharedMediaThumbQueue() {
  if (sharedMediaThumbPumpRunning) return;
  sharedMediaThumbPumpRunning = true;
  try {
    while (sharedMediaThumbQueue.size > 0) {
      const next = sharedMediaThumbQueue.entries().next().value as [number, any] | undefined;
      if (!next) break;
      const [messageId, item] = next;
      sharedMediaThumbQueue.delete(messageId);
      if (sharedMediaUrlCache.value[messageId]) continue;
      sharedMediaThumbInFlight.add(messageId);
      try {
        await loadSharedMediaThumb(item);
      } finally {
        sharedMediaThumbInFlight.delete(messageId);
      }
    }
  } finally {
    sharedMediaThumbPumpRunning = false;
  }
}

function cleanupSharedMediaThumbObservers() {
  for (const el of sharedMediaCellEls.values()) {
    unobserveVisibility(el);
  }
  sharedMediaCellEls.clear();
}

/** 扫描当前内容区的媒体单元格并绑定进/出视口回调（增量：已观察的同一元素不重复绑） */
function setupSharedMediaThumbObservers() {
  const root = mediaContentEl.value;
  const seen = new Set<number>();
  if (root) {
    const cells = root.querySelectorAll<HTMLElement>('[data-shared-media-id]');
    for (const cell of cells) {
      const id = Number(cell.getAttribute('data-shared-media-id'));
      if (!Number.isFinite(id)) continue;
      seen.add(id);
      if (sharedMediaCellEls.get(id) === cell) continue;
      const prev = sharedMediaCellEls.get(id);
      if (prev) unobserveVisibility(prev);
      const item = sharedMediaItems.value.find((i) => i.messageId === id);
      if (!item) continue;
      sharedMediaCellEls.set(id, cell);
      onVisibilityChange(
        cell,
        () => enqueueSharedMediaThumb(item),
        () => dequeueSharedMediaThumb(id),
      );
    }
  }
  for (const [id, el] of [...sharedMediaCellEls]) {
    if (!seen.has(id)) {
      unobserveVisibility(el);
      sharedMediaCellEls.delete(id);
      dequeueSharedMediaThumb(id);
    }
  }
}

/** 新增共享媒体项后：已就绪的 src 直接入缓存；其余等进视口再串行下载 */
watch(sharedMediaItems, (items) => {
  for (const item of items) {
    if (item.src && !sharedMediaUrlCache.value[item.messageId]) {
      sharedMediaUrlCache.value = { ...sharedMediaUrlCache.value, [item.messageId]: item.src };
    }
  }
  nextTick(setupSharedMediaThumbObservers);
}, { immediate: true });

/** 切换标签/会话时清空等待队列并重建观察（进行中的下载不打断） */
watch([activeTab, sharedMediaChatId], () => {
  sharedMediaThumbQueue.clear();
  nextTick(setupSharedMediaThumbObservers);
});

onUnmounted(() => {
  cleanupSharedMediaThumbObservers();
  sharedMediaThumbQueue.clear();
});

// =====================================================================
// 共享媒体无限滚动：滚动到底部自动加载更多
// =====================================================================
const loadMoreSentinel = ref<HTMLElement | null>(null);
let loadMoreObserver: IntersectionObserver | null = null;

function setupLoadMoreObserver() {
  cleanupLoadMoreObserver();
  const el = loadMoreSentinel.value;
  if (!el) return;
  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && sharedMediaHasMore.value && !sharedMediaLoadingMore.value && !sharedMediaLoading.value) {
          sharedMediaLoadMore();
        }
      }
    },
    { root: null, rootMargin: '200px', threshold: 0.01 },
  );
  loadMoreObserver.observe(el);
}

function cleanupLoadMoreObserver() {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }
}

// activeTab 或 sharedMediaItems 变化时重建观察器
watch([activeTab, sharedMediaItems], () => {
  nextTick(setupLoadMoreObserver);
});

/** 打开共享媒体查看器 */
const sharedMediaViewerVisible = ref(false);
const sharedMediaViewerIndex = ref(0);
const sharedMediaViewerItems = computed<MediaViewerItem[]>(() =>
  sharedMediaItems.value
    .filter(i => i.src || i.miniSrc)
    .map(i => ({
      type: i.isVideo ? 'video' : 'photo',
      thumb: i.miniSrc,
      messageId: i.messageId,
      chatId: i.chatId,
      duration: i.duration,
      message: i.message,
    })),
);
/** 共享媒体项 → viewer 项的索引映射 */
const sharedMediaToViewerIndex = computed(() => {
  const map = new Map<number, number>();
  let viewerIdx = 0;
  for (const item of sharedMediaItems.value) {
    if (item.src || item.miniSrc) {
      map.set(item.messageId, viewerIdx++);
    }
  }
  return map;
});
function openSharedMediaViewer(index: number) {
  const item = sharedMediaItems.value[index];
  if (!item) return;
  const viewerIdx = sharedMediaToViewerIndex.value.get(item.messageId);
  if (viewerIdx === undefined) return;
  sharedMediaViewerIndex.value = viewerIdx;
  sharedMediaViewerVisible.value = true;
}

/** 打开共享链接 */
function openSharedLink(url?: string) {
  if (!url) return;
  confirmAndOpenExternalLink(url).catch(() => { });
}

/** 跳转到聊天中的对应消息 */
function jumpToMessage(chatId: number, messageId: number) {
  router.push({ name: 'chat-detail', params: { id: String(chatId) }, query: { message: String(messageId) } });
}

/** 共享媒体右键菜单：跳转到消息 */
function showSharedMediaContextMenu(e: MouseEvent, item: { messageId: number; chatId: number; url?: string; fileName?: string }) {
  e.preventDefault();
  const menuItems: ContextMenuItem[] = [
    {
      key: 'jump-to-message',
      label: t('lng_downloads_view_in_chat'),
      icon: Eye,
      onClick: () => { jumpToMessage(item.chatId, item.messageId); },
    },
  ];
  if (item.url) {
    menuItems.push({
      key: 'open-link',
      label: t('lng_view_button_external_link'),
      icon: ExternalLink,
      onClick: () => { openSharedLink(item.url); },
    });
  }
  openContextMenu(e.clientX, e.clientY, menuItems, e.currentTarget as HTMLElement);
}

/** 格式化音频时长：秒 → m:ss */
function formatAudioDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 点击共享音乐项：将所有音乐项构建为播放列表并从点击位置开始播放。
 * 复用 audioPlayer 的 setPlaylist，与资料页音乐卡片播放体验一致。
 */
async function playSharedMusic(clickedIndex: number) {
  const musicItems = sharedMediaItems.value.filter(
    (i) => i.contentType === 'messageAudio' && i.message,
  );
  if (musicItems.length === 0) return;

  // 找到点击项在纯音乐列表中的索引
  const targetItem = sharedMediaItems.value[clickedIndex];
  const targetIdx = musicItems.findIndex((i) => i.messageId === targetItem.messageId);
  const startIdx = targetIdx >= 0 ? targetIdx : 0;

  // 逐条播放（audioPlayer.playMessageAudio 内部会处理下载/流式/去重），
  // 但为了获得完整的列表体验，我们用 setPlaylist 替换整个播放列表。
  // 先为每条消息构建 AudioTrack，filePath 稍后由 playTrack 按需准备。
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  const { isFileReady } = await import('../../utils/tdlib');

  const tracks = musicItems.map((item): AudioTrack | undefined => {
    const msg = item.message!;
    if (msg.content._ !== 'messageAudio') return;
    const audio = msg.content.audio;
    const file = audio.audio;
    let filePath = '';
    if (isFileReady(file) && file.local?.path) {
      filePath = convertFileSrc(file.local.path);
    }
    return {
      messageId: msg.id,
      chatId: msg.chat_id,
      title: audio.title || audio.file_name || t('lng_media_music_title'),
      performer: audio.performer || t('lng_sr_message_column_artist'),
      duration: audio.duration,
      fileId: file.id,
      filePath,
      sizeBytes: file.size || 0,
      mimeType: audio.mime_type || 'audio/mpeg',
      ready: !!filePath,
      source: 'message',
    };
  }).filter((track): track is AudioTrack => !!track);

  audioPlayer.setPlaylist(tracks, startIdx);
}

/** 下载共享媒体缩略图 / 音乐专辑封面 / 链接高清封面 / GIF·视频 thumbnail（用于列表与网格展示） */
async function loadSharedMediaThumb(item: {
  messageId: number;
  photo?: any;
  contentType?: string;
  message?: any;
  linkCoverFile?: any;
  thumbFile?: any;
  thumbFormat?: string;
}) {
  if (sharedMediaUrlCache.value[item.messageId]) return;

  // 音乐：仅下载内嵌封面；为空时走 iTunes Search
  if (item.contentType === 'messageAudio' && item.message?.content?._ === 'messageAudio') {
    const audio = item.message.content.audio;
    for (const coverFile of listAlbumCoverFiles(audio)) {
      try {
        const url = await downloadFileUrl(coverFile, `shared_music_cover_${item.messageId}_${coverFile.id}.jpg`, 'music_cover', { tags: ['音乐封面', '缩略图'], sourceLabel: userName.value || undefined });
        if (url) {
          sharedMediaUrlCache.value = { ...sharedMediaUrlCache.value, [item.messageId]: url };
          return;
        }
      } catch { /* 尝试下一个候选 */ }
    }
    const itunes = await fetchItunesCoverForAudio(audio);
    if (itunes) {
      sharedMediaUrlCache.value = { ...sharedMediaUrlCache.value, [item.messageId]: itunes };
    }
    return;
  }

  // 链接预览高清封面（调用方已按图片自动下载门控；此处再校验一次）
  if (item.linkCoverFile) {
    if (!shouldAutoDownloadPhotos(sharedMediaChatId.value)) return;
    try {
      const url = await downloadFileUrl(item.linkCoverFile, `shared_link_cover_${item.messageId}_${item.linkCoverFile.id}.jpg`, 'avatar');
      if (url) {
        sharedMediaUrlCache.value = { ...sharedMediaUrlCache.value, [item.messageId]: url };
      }
    } catch { /* 忽略 */ }
    return;
  }

  // GIF / 视频 thumbnail（含 MPEG4 动图预览）：跟随「图片」自动下载设置
  if (item.thumbFile) {
    if (!shouldAutoDownloadPhotos(sharedMediaChatId.value)) return;
    try {
      const ext = item.thumbFormat === 'thumbnailFormatMpeg4' || item.thumbFormat === 'thumbnailFormatWebm'
        ? 'mp4'
        : 'jpg';
      const url = await downloadFileUrl(item.thumbFile, `shared_thumb_${item.messageId}_${item.thumbFile.id}.${ext}`, 'avatar');
      if (url) {
        sharedMediaUrlCache.value = { ...sharedMediaUrlCache.value, [item.messageId]: url };
        return;
      }
    } catch { /* 忽略，回退 photo */ }
  }

  if (!item.photo?.sizes?.length) return;
  // 照片 Small：资料页网格始终下载（不受 autoDownload 管控）
  const sorted = item.photo.sizes
    .filter((s: any) => s.photo)
    .slice()
    .sort((a: any, b: any) => (a.width * a.height) - (b.width * b.height));
  const smallest = sorted[0]?.photo;
  if (!smallest) return;
  try {
    const url = await downloadFileUrl(smallest, `shared_${item.messageId}_${smallest.id}.jpg`, 'avatar');
    if (url) {
      sharedMediaUrlCache.value = { ...sharedMediaUrlCache.value, [item.messageId]: url };
    }
  } catch { /* 忽略 */ }
}

/** 获取共享媒体项的缩略图 URL */
function sharedMediaUrl(msgId: number): string | undefined {
  return sharedMediaUrlCache.value[msgId];
}

/**
 * 高清缩略图是否已完成解码（@load / @loadeddata 后置位）。
 * 迷你图作为底层占位保留到高清图真正可绘制，避免 src 切换瞬间闪白。
 */
const sharedMediaThumbDecoded = ref<Record<number, true>>({});

function markSharedMediaThumbDecoded(messageId: number) {
  if (sharedMediaThumbDecoded.value[messageId]) return;
  sharedMediaThumbDecoded.value = { ...sharedMediaThumbDecoded.value, [messageId]: true };
}

function isSharedMediaThumbDecoded(messageId: number): boolean {
  return !!sharedMediaThumbDecoded.value[messageId];
}

/** GIF/视频 thumbnail 是否为需要用 <video> 展示的动图格式 */
function isVideoThumb(item: { thumbFormat?: string }): boolean {
  return item.thumbFormat === 'thumbnailFormatMpeg4' || item.thumbFormat === 'thumbnailFormatWebm';
}

/** 共享媒体 minithumbnail 占位 URL */
function sharedMediaMiniSrc(item: { photo?: any; miniSrc?: string }): string | undefined {
  return item.miniSrc;
}

const businessInfo = computed(() => fullInfo.value?.business_info);
const businessLocation = computed(() => businessInfo.value?.location);
/** 每天的营业时段列表（如「周一 09:00–17:00」），供营业时间卡片展开显示 */
const businessHours = computed(() => formatBusinessHours(businessInfo.value?.opening_hours));
/** 营业时间卡片是否展开（显示详细时段） */
const hoursExpanded = ref(false);

/** 营业整体状态文案 */
const businessOpenNow = computed(() => {
  const bi = businessInfo.value;
  if (!bi) return null;
  if (bi.next_close_in && bi.next_close_in > 0 && bi.next_open_in === 0) {
    return { open: true, text: t('lng_info_work_open') };
  }
  if (bi.next_open_in && bi.next_open_in > 0) {
    return { open: false, text: t('lng_info_work_closed'), next: formatBusinessNext(bi.next_open_in) };
  }
  return null;
});
/** 将秒数格式化为「N hours / N minutes」倒计时 */
function formatBusinessNext(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 1) return `Opens in ${h}h`;
  if (m >= 1) return `Opens in ${m}m`;
  return 'Opens soon';
}

// 电话号码展示：优先用 getPhoneNumberInfoSync 的本地化格式，并标注匿名号
const phoneDisplay = ref('');
const phoneIsAnonymous = ref(false);
async function loadPhoneInfo() {
  phoneDisplay.value = user.value?.phone_number || '';
  phoneIsAnonymous.value = false;
  const info = await profileStore.getPhoneInfo(userId.value);
  if (info?.formatted_phone_number) {
    const code = info.country_calling_code ? `+${info.country_calling_code} ` : '';
    phoneDisplay.value = code + info.formatted_phone_number.replace(/-/g, ' ');
  }
  if (info?.is_anonymous) phoneIsAnonymous.value = true;
}

// 机器人资料
const isBot = computed(() => user.value?.type?._ === 'userTypeBot');
const botInfo = computed(() => fullInfo.value?.bot_info);
const botDescription = computed(() => botInfo.value?.short_description || botInfo.value?.description || '');

const profileAudio = computed<TdAudio | undefined>(() => fullInfo.value?.first_profile_audio);
const profileAudioTitle = computed(() => profileAudio.value?.title || profileAudio.value?.file_name || t('lng_all_music'));
const profileAudioPerformer = computed(() => profileAudio.value?.performer || t('lng_sr_message_column_artist'));
/** 高清封面 URL（下载完成后替换低清过渡图） */
const profileMusicCoverHd = ref<string | undefined>(undefined);
/** 高清封面是否正在下载（仅此时对低清图加模糊过渡） */
const profileMusicCoverLoading = ref(false);
/** 高清封面加载 token，防止切换用户后过期写回 */
let profileMusicCoverLoadToken = 0;
/** 当前封面：高清已就绪用高清，否则用低清 minithumbnail */
const profileMusicCover = computed<string | undefined>(() => {
  if (profileMusicCoverHd.value) return profileMusicCoverHd.value;
  const mini = profileAudio.value?.album_cover_minithumbnail?.data;
  return mini ? `data:image/jpeg;base64,${mini}` : undefined;
});
/**
 * 低清过渡效果：仅在高清下载过程中模糊放大。
 * TDLib 的 album_cover_thumbnail 常在音频文件下载完成前为空（封面需从音频内嵌抽出），
 * 若永远套用模糊，资料音乐封面会一直处于糊图状态。
 */
const profileMusicCoverShowTransition = computed(() =>
  !profileMusicCoverHd.value && profileMusicCoverLoading.value
);

/** 加载资料音乐的高清专辑封面（内嵌优先；空则 iTunes Search；失败保留低清 minithumbnail） */
async function loadProfileMusicCover() {
  const token = ++profileMusicCoverLoadToken;
  profileMusicCoverHd.value = undefined;
  profileMusicCoverLoading.value = true;
  try {
    for (const coverFile of listAlbumCoverFiles(profileAudio.value)) {
      if (token !== profileMusicCoverLoadToken) return;
      const url = await downloadFileUrl(coverFile, `profile_music_cover_${coverFile.id}.jpg`, 'music_cover', { tags: ['音乐封面', '缩略图', '资料页'], sourceLabel: '资料页' });
      if (url) {
        if (token === profileMusicCoverLoadToken) profileMusicCoverHd.value = url;
        return;
      }
    }
    if (profileAudio.value && token === profileMusicCoverLoadToken) {
      const itunes = await fetchItunesCoverForAudio(profileAudio.value);
      if (itunes && token === profileMusicCoverLoadToken) {
        profileMusicCoverHd.value = itunes;
      }
    }
  } catch (e) {
    console.error('Failed to load profile music cover', e);
  } finally {
    if (token === profileMusicCoverLoadToken) {
      profileMusicCoverLoading.value = false;
    }
  }
}

// ===== 展示用头像（优先用户资料头像，Avatar 组件负责无头像时的首字母渐变） =====
const displayPhoto = computed<profilePhoto | undefined>(() => user.value?.profile_photo);

/** 头部大图 URL（使用全量照片的最大尺寸） */
const headerPhotoUrl = ref<string | undefined>(undefined);
async function loadHeaderPhoto() {
  headerPhotoUrl.value = undefined;
  const info = fullInfo.value;
  const biggest = pickLargestPhotoFile(info?.photo);
  if (biggest) {
    headerPhotoUrl.value = await downloadFileUrl(biggest, `profile_header_${biggest.id}.jpg`, 'avatar');
  }
}

/** 从 chatPhoto 中挑出最大的 JPEG size 文件（无则 undefined） */
function pickLargestPhotoFile(photo?: chatPhoto): file | undefined {
  if (!photo || !Array.isArray(photo.sizes) || photo.sizes.length === 0) return undefined;
  let best: file | undefined;
  let bestArea = 0;
  for (const s of photo.sizes) {
    if (!s.photo) continue;
    const area = s.width * s.height;
    if (area > bestArea) {
      bestArea = area;
      best = s.photo;
    }
  }
  return best;
}

// ===== 照片 URL =====
const photoUrls = ref<Record<number, string>>({});

async function loadPhotoUrls() {
  const urls: Record<number, string> = {};
  for (let i = 0; i < photosList.value.length; i++) {
    const p = photosList.value[i];
    const biggest = pickLargestPhotoFile(p);
    if (!biggest) continue;
    const url = await downloadFileUrl(biggest, `profile_photo_${i}.jpg`, 'avatar', {
      tags: ['用户头像', '高清头像'],
      sourceLabel: userName.value || undefined,
    });
    if (url) urls[i] = url;
  }
  photoUrls.value = urls;
}

// ===== 照片查看器（复用 MediaViewer，支持左右切换；动态也可复用） =====
const photoViewerVisible = ref(false);
const photoViewerIndex = ref(0);
/** 查看器项目列表（仅包含已加载出的照片） */
const photoViewerItems = computed<MediaViewerItem[]>(() =>
  photosList.value
    .map((p, i) => ({ photo: p, url: photoUrls.value[i] }))
    .filter((item): item is { photo: chatPhoto; url: string } => !!item.url)
    .map(({ photo }) => ({ type: 'photo', file: pickLargestPhotoFile(photo) })),
);
/** 打开单条动态时临时覆盖展示的媒体列表（优先级最高）；null 表示正常照片宫格 */
const photoViewerItemsOverride = ref<MediaViewerItem[] | null>(null);
/** 查看器实际展示的项目：动态覆盖 > 照片宫格 */
const viewerItems = computed<MediaViewerItem[]>(() =>
  photoViewerItemsOverride.value ?? photoViewerItems.value,
);
/** 查看器项目索引 → 原始照片索引（i === array 索引） */
const photoViewerIndexMap = computed<number[]>(() => {
  const map: number[] = [];
  photosList.value.forEach((_, i) => {
    if (photoUrls.value[i]) map.push(i);
  });
  return map;
});
function openPhotoViewer(originalIndex = 0) {
  if (photoViewerItems.value.length === 0) return;
  photoViewerItemsOverride.value = null;
  const itemIdx = photoViewerIndexMap.value.indexOf(originalIndex);
  photoViewerIndex.value = itemIdx < 0 ? 0 : itemIdx;
  photoViewerVisible.value = true;
}
function closePhotoViewer() {
  photoViewerVisible.value = false;
  photoViewerItemsOverride.value = null;
}

// ===== 礼物渲染 =====
// 礼物网格单元格宽（用于 GiftDisplay 组件的尺寸）。
// grid-cols-4 在 ~544px 内容区下每格约 131px，取 112 留出间距且卡片足够大。
const profileGiftCellSize = 112;

/** 礼物 tooltip 文本 */
function giftText(gift: receivedGift): string {
  const title = gift.gift._ === 'sentGiftUpgraded' ? gift.gift.gift.title : undefined;
  return title || gift.text?.text || t('lng_sr_message_column_gift');
}

// ===== 动态 URL =====
const storyUrls = ref<Record<number, string>>({});
async function loadStoryUrls() {
  const urls: Record<number, string> = {};
  for (const s of storiesList.value) {
    const file = pickStoryCoverFile(s);
    if (!file) continue;
    try {
      const url = await downloadFileUrl(file, `story_${s.id}.jpg`, 'story_cover', { tags: ['动态封面', '缩略图', '动态'], sourceLabel: userName.value || undefined });
      if (url) urls[s.id] = url;
    } catch (e) {
      // 单条封面拉取失败不影响其他动态
    }
  }
  storyUrls.value = urls;
}

/** 从动态内容中挑出封面文件（照片取最大尺寸；视频取缩略图） */
function pickStoryCoverFile(s: story): file | undefined {
  const c = s.content;
  if (!c) return undefined;
  if (c._ === 'storyContentPhoto') {
    const sizes = c.photo?.sizes ?? [];
    let best: file | undefined;
    let bestArea = 0;
    for (const sz of sizes) {
      if (!sz.photo) continue;
      const area = sz.width * sz.height;
      if (area > bestArea) {
        bestArea = area;
        best = sz.photo;
      }
    }
    return best;
  }
  if (c._ === 'storyContentVideo') {
    const th = c.video?.thumbnail;
    if (th && th._ === 'thumbnail' && th.file?.id) {
      return th.file;
    }
    // 视频无缩略图时尝试用 minithumbnail 兜底（无 file id，返回 undefined）
    return undefined;
  }
  return undefined;
}

/** 动态封面 URL（用户/聊天模式自适应） */
function storyUrlOf(st: story): string {
  if (chatMode.value) return chatStoryUrls.value[st.id] || '';
  return storyUrls.value[st.id] || '';
}

/** 当前模式下应展示的动态列表（聊天模式用聊天动态，否则用用户动态） */
const displayActiveStories = computed<story[]>(() =>
  chatMode.value ? chatActiveStories.value : activeStoriesList.value,
);
const displayArchivedStories = computed<story[]>(() =>
  chatMode.value ? chatArchivedStories.value : archivedStoriesList.value,
);

/** 动态时长角标文案：直播 → 「直播」；视频 → m:ss；照片 → '' */
function formatStoryDuration(s: story): string {
  const c = s.content;
  if (!c) return '';
  if (c._ === 'storyContentLive') return t('lng_profile_action_short_live_stream');
  if (c._ === 'storyContentVideo' && c.video?.duration) {
    const d = Math.round(c.video.duration);
    const m = Math.floor(d / 60);
    const sec = d % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  return '';
}

/** 打开动态：在故事播放器中按列表播放 */
function openStory(s: story) {
  const list = activeTab.value === 'archived' ? displayArchivedStories.value : displayActiveStories.value;
  const idx = Math.max(0, list.findIndex((x) => x.id === s.id));
  openStoryViewer(list, idx);
}

// ===== 数据加载 =====
async function loadData() {
  // 频道/群组资料模式：加载聊天数据
  if (chatMode.value) {
    await loadChatData();
    return;
  }
  photoUrls.value = {};
  await profileStore.loadProfile(userId.value);
  await Promise.all([
    loadHeaderPhoto(),
    loadProfileMusicCover(),
    loadPhotoUrls(),
    loadStoryUrls(),
    loadPhoneInfo(),
    loadChannelInfo(),
    refreshPrivateChatMuted(),
    ...commonGroupsList.value.map((id) => ensureChat(id).catch(() => { })),
  ]);
  // 获取共享媒体计数（用户模式下需要私聊 chat id）
  const cid = await getPrivateChatId();
  if (cid) {
    const counts = await profileStore.fetchSharedMediaCountsForChat(cid);
    sharedMediaCounts.value = counts;
  }
}

// ===== 频道/群组资料加载 =====
async function loadChatData() {
  const cid = chatId.value;
  if (!cid) {
    chatError.value = true;
    chatLoading.value = false;
    return;
  }
  chatLoading.value = true;
  chatError.value = false;
  chatLoaded.value = false;
  chatObj.value = undefined;
  supergroupObj.value = undefined;
  basicGroupObj.value = undefined;
  supergroupFull.value = undefined;
  basicGroupFull.value = undefined;
  secretChatObj.value = undefined;
  chatActiveStories.value = [];
  chatArchivedStories.value = [];
  chatStoryUrls.value = {};
  try {
    // 优先用 senderInfo 缓存（进入该聊天时通常已缓存），立即渲染头部；
    // 缓存缺失时再通过 getChat 拉取。
    let c = getReactiveChat(cid);
    if (!c) {
      c = await tdlibSend({ _: 'getChat', chat_id: cid });
    }
    chatObj.value = c;

    // 秘密聊天：额外获取 secretChat 信息 + 用户信息
    if (c.type?._ === 'chatTypeSecret') {
      try {
        secretChatObj.value = await tdlibSend({
          _: 'getSecretChat',
          secret_chat_id: c.type.secret_chat_id,
        });
      } catch (e) {
        console.error('Failed to load secret chat', e);
      }
      autoDeleteTime.value = c.message_auto_delete_time ?? 0;
      // 获取秘密聊天对方的用户信息 + 共同群组（复用 profileStore 缓存）
      const uid = c.type.user_id;
      if (uid) {
        void profileStore.fetchUser(uid).catch(() => { });
        void profileStore.fetchFullInfo(uid).catch(() => { });
        void profileStore.fetchCommonGroups(uid).catch(() => { });
      }
    }

    // 主内容（标题/头像）已就绪，先结束加载态，让页面立即渲染；
    // 群组详情与动态在后台异步刷新，各自容错，不阻塞页面。
    chatLoaded.value = true;
    chatLoading.value = false;
    void loadChatGroupInfo();
    void refreshChatNotificationMuted();
    // 共享媒体计数：始终基于当前 chat（秘密聊天用 secret chat id，不用普通私聊）
    sharedMediaCounts.value = { media: 0, files: 0, links: 0, music: 0, voice: 0, gifs: 0 };
    void profileStore.fetchSharedMediaCountsForChat(cid, {
      returnLocal: isSecretChat.value,
    }).then((counts) => {
      // 若已切走则丢弃过期结果
      if (chatId.value === cid) sharedMediaCounts.value = counts;
    });
    // 动态：秘密聊天不拉（与频道/群组区分）
    if (!isSecretChat.value) {
      void loadChatStories();
    }
  } catch (e) {
    chatError.value = true;
    chatLoading.value = false;
    console.error('Failed to load chat profile', e);
  }
}

/** 后台异步加载超级群组/基本群组信息与完整信息（各自容错，不阻塞页面） */
async function loadChatGroupInfo() {
  const c = chatObj.value;
  if (!c) return;
  try {
    if (c.type._ === 'chatTypeSecret') {
      // 秘密聊天：用户信息已在 loadChatData 中获取
      supergroupObj.value = undefined;
      supergroupFull.value = undefined;
      basicGroupObj.value = undefined;
      basicGroupFull.value = undefined;
    } else if (c.type._ === 'chatTypeSupergroup') {
      const sgId = c.type.supergroup_id;
      try {
        supergroupObj.value = await tdlibSend({ _: 'getSupergroup', supergroup_id: sgId });
      } catch (e) {
        console.error('Failed to load supergroup', e);
      }
      try {
        supergroupFull.value = await tdlibSend({
          _: 'getSupergroupFullInfo',
          supergroup_id: sgId,
        });
      } catch (e) {
        supergroupFull.value = undefined;
        console.error('Failed to load supergroup full info', e);
      }
      basicGroupObj.value = undefined;
      basicGroupFull.value = undefined;
    } else if (c.type._ === 'chatTypeBasicGroup') {
      const bgId = c.type.basic_group_id;
      try {
        basicGroupObj.value = await tdlibSend({ _: 'getBasicGroup', basic_group_id: bgId });
      } catch (e) {
        console.error('Failed to load basic group', e);
      }
      try {
        basicGroupFull.value = await tdlibSend({
          _: 'getBasicGroupFullInfo',
          basic_group_id: bgId,
        });
      } catch (e) {
        basicGroupFull.value = undefined;
        console.error('Failed to load basic group full info', e);
      }
      supergroupObj.value = undefined;
      supergroupFull.value = undefined;
    } else {
      chatObj.value = undefined;
    }
  } catch (e) {
    console.error('Failed to load chat group info', e);
  }
}

/** 频道/群组的动态（复用 getChatPostedToChatPageStories + 归档） */
const chatActiveStories = ref<story[]>([]);
const chatArchivedStories = ref<story[]>([]);
const chatStoryUrls = ref<Record<number, string>>({});
async function loadChatStories() {
  chatActiveStories.value = [];
  chatArchivedStories.value = [];
  chatStoryUrls.value = {};
  const cid = chatId.value;
  if (!cid) return;
  let fullActive: story[] = [];
  try {
    const page = await tdlibSend({
      _: 'getChatPostedToChatPageStories',
      chat_id: cid,
      from_story_id: 0,
      limit: 100,
    });
    fullActive = page.stories ?? [];
  } catch (e) { /* 忽略：无主页动态 */ }
  chatActiveStories.value = fullActive;
  // 拉取封面 URL
  const urls: Record<number, string> = {};
  for (const s of fullActive) {
    const file = pickStoryCoverFile(s);
    if (!file) continue;
    try {
      const url = await downloadFileUrl(file, `chat_story_${s.id}.jpg`, 'story_cover', { tags: ['动态封面', '缩略图', '动态'], sourceLabel: chatTitle.value || undefined });
      if (url) urls[s.id] = url;
    } catch { /* 忽略单条失败 */ }
  }
  chatStoryUrls.value = urls;
}

// ===== 交互动作 =====
function goBack() {
  router.back();
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("Copy failed", e);
  }
}

function copyId() {
  copyText(String(user.value?.id ?? ''));
}

function copyChatId() {
  copyText(String(chatId.value ?? ''));
}

/** 点击位置 → 弹出确认提示后用微软地图网页版打开经纬度 */
function openLocation() {
  const loc = businessLocation.value?.location;
  if (!loc) return;
  const url = `https://www.bing.com/maps?cp=${loc.latitude}~${loc.longitude}&lvl=16`;
  confirmAndOpenExternalLink(url).catch((e) => {
    // 用户取消时不报错
    if (e?.message !== 'canceled') {
      console.error('打开微软地图失败:', e);
    }
  });
}

async function openPersonalChat() {
  if (!personalChatId.value) return;
  router.push({ name: "chat-detail", params: { id: String(personalChatId.value) } });
}

/** 打开共同群组（跳转到对应聊天） */
function openCommonGroup(chatId: number) {
  router.push({ name: "chat-detail", params: { id: String(chatId) } });
}

async function openUserMusicPlayer() {
  if (!profileAudio.value) return;
  try {
    // 打开音乐播放器并载入该用户的完整资料音乐列表
    await audioPlayer.playUserProfileAudios(userId.value);
    // 音频完整下载后 TDLib 才可能抽出内嵌封面；刷新 fullInfo 以升级资料页封面
    if (!chatMode.value) {
      await profileStore.fetchFullInfo(userId.value);
      // fetchFullInfo 更新 fullInfos 后由 profileAudio watcher 触发 loadProfileMusicCover
    }
  } catch (e) {
    console.error("Failed to play profile audio", e);
  }
}

// =====================================================================
// 头像区操作按钮（发消息 / 通知 / 礼物 / 更多）
// =====================================================================

async function getPrivateChatId(): Promise<number | undefined> {
  if (privateChatId.value) return privateChatId.value;
  try {
    const res = await tdlibSend({
      _: 'createPrivateChat',
      user_id: userId.value,
      force: false,
    });
    privateChatId.value = res.id;
    return res.id;
  } catch (e) {
    console.error('Failed to create private chat', e);
    return undefined;
  }
}

/** 私聊是否已静音（用于通知按钮的开关状态） */
const isPrivateChatMuted = ref(false);
async function refreshPrivateChatMuted() {
  const cid = await getPrivateChatId();
  if (!cid) return;
  const chat = getReactiveChat(cid);
  const muteFor = chat?.notification_settings?.mute_for ?? 0;
  isPrivateChatMuted.value = muteFor > 0;
}

/** 发消息：跳转到与用户的私聊 */
async function openPrivateChat() {
  const cid = await getPrivateChatId();
  if (!cid) return;
  router.push({ name: "chat-detail", params: { id: String(cid) } });
}

/** 通话（暂未接入 VoIP） */
async function startCall() {
  const cid = await getPrivateChatId();
  if (!cid) return;
  router.push({ name: 'chat-detail', params: { id: String(cid) } });
  MessagePlugin.info('Calls are not supported yet');
}

/** 搜索聊天中的消息 */
async function searchInChat() {
  const cid = chatMode.value ? chatId.value : await getPrivateChatId();
  if (!cid) return;
  router.push({ name: 'chat-detail', params: { id: String(cid) } });
}

/** 加入频道/群组 */
async function joinChat() {
  const cid = chatId.value;
  if (!cid) return;
  try {
    await tdlibSend({ _: 'joinChat', chat_id: cid });
    MessagePlugin.success(isChatChannel.value ? t('lng_action_you_joined') : t('lng_you_joined_group'));
    loadData();
  } catch (e: any) {
    MessagePlugin.error(e?.message || 'Failed to join');
  }
}


/** 切换通知（静音 / 取消静音） */
async function toggleNotifications() {
  const cid = await getPrivateChatId();
  if (!cid) return;
  try {
    await tdlibSend({
      _: 'setChatNotificationSettings',
      chat_id: cid,
      notification_settings: {
        _: 'chatNotificationSettings',
        use_default_mute_for: isPrivateChatMuted.value,
        mute_for: isPrivateChatMuted.value ? 0 : 366 * 24 * 60 * 60,
        use_default_sound: true,
        sound_id: '0',
      },
    });
    isPrivateChatMuted.value = !isPrivateChatMuted.value;
  } catch (e: any) {
    MessagePlugin.error(e?.message || 'Failed to update notifications');
  }
}

/** 打开「更多」菜单 */
function openMoreMenu(e: MouseEvent) {
  const isContact = !!user.value?.is_contact;
  const menuItems: ContextMenuItem[] = [
    {
      key: 'call',
      label: t('lng_menu_calls'),
      icon: PhoneCall,
      onClick: () => { startCall(); },
    },
    { key: 'divider-0', label: '', divider: true },
    {
      key: 'auto-delete',
      label: t('lng_manage_messages_ttl_menu'),
      icon: TimerReset,
      onClick: () => { openAutoDelete(); },
    },
    { key: 'divider-1', label: '', divider: true },
    {
      key: 'block',
      label: fullInfo.value?.block_list ? t('lng_profile_unblock_user') : t('lng_profile_block_user'),
      icon: Ban,
      danger: !fullInfo.value?.block_list,
      onClick: () => { onToggleBlock(); },
    },
  ];
  // 只有联系人才显示「编辑联系人 / 删除联系人」
  if (isContact) {
    menuItems.push(
      { key: 'divider-2', label: '', divider: true },
      {
        key: 'edit-contact',
        label: t('lng_info_edit_contact'),
        icon: UserPlus,
        onClick: () => { openEditContact(); },
      },
      {
        key: 'delete-contact',
        label: t('lng_info_delete_contact'),
        icon: UserMinus,
        danger: true,
        onClick: () => { onDeleteContact(); },
      },
    );
  }
  // 在触发按钮坐标处打开菜单
  openContextMenu(e.clientX, e.clientY, menuItems, e.currentTarget as HTMLElement);
}

// =====================================================================
// 频道/群组资料模式：操作按钮（查看频道 / 通知 / 礼物 / 更多）
// =====================================================================

/** 频道/群组通知是否已静音 */
const chatNotificationMuted = ref(false);
/** 读取当前聊天通知静音状态 */
async function refreshChatNotificationMuted() {
  const cid = chatId.value;
  if (!cid) return;
  const c = getReactiveChat(cid);
  const muteFor = c?.notification_settings?.mute_for ?? 0;
  chatNotificationMuted.value = muteFor > 0;
}

/** 查看频道：打开对应聊天（频道/群组） */
function openChatChannel() {
  const cid = chatId.value;
  if (!cid) return;
  router.push({ name: 'chat-detail', params: { id: String(cid) } });
}

/** 频道/群组关闭/开启通知 */
async function chatToggleNotifications() {
  const cid = chatId.value;
  if (!cid) return;
  try {
    await tdlibSend({
      _: 'setChatNotificationSettings',
      chat_id: cid,
      notification_settings: {
        _: 'chatNotificationSettings',
        use_default_mute_for: chatNotificationMuted.value,
        mute_for: chatNotificationMuted.value ? 0 : 366 * 24 * 60 * 60,
        use_default_sound: true,
        sound_id: '0',
      },
    });
    chatNotificationMuted.value = !chatNotificationMuted.value;
  } catch (e: any) {
    MessagePlugin.error(e?.message || 'Failed to update notifications');
  }
}

/** 进入关联群组（频道的讨论组 / 讨论组的频道） */
function openLinkedGroup() {
  const linked = chatLinkedChatId.value;
  if (!linked) return;
  router.push({ name: 'chat-detail', params: { id: String(linked) } });
}

/** 举报当前频道/群组（整会话，不带具体消息） */
async function reportCurrentChat() {
  const cid = chatId.value;
  if (!cid) return;
  try {
    await confirmReportMessage({ chatId: cid });
    MessagePlugin.success(t('lng_report_thanks'));
  } catch (e: any) {
    if (e?.message !== 'canceled') {
      console.error('reportChat failed:', e);
      MessagePlugin.error(e?.message || 'Failed to report');
    }
  }
}

/** 退出频道/群组（带二级确认） */
function unsubscribeChat() {
  const title = chatTitle.value;
  showConfirm(
    t('lng_profile_leave_channel'),
    `Leave “${title}”? You will no longer receive its messages.`,
    t('lng_profile_leave_channel'),
    async () => {
      const cid = chatId.value;
      if (!cid) return;
      try {
        await tdlibSend({ _: 'leaveChat', chat_id: cid });
        cancelConfirmDialog();
        router.push('/home/chats');
      } catch (e: any) {
        MessagePlugin.error(e?.message || 'Failed to leave');
      }
    },
  );
}

/** 频道/群组是否还有「更多」可选项（无则隐藏入口） */
const hasChatMoreOptions = computed(() => {
  if (isSecretChat.value) return true;
  return isChatJoined.value;
});

/** 频道/群组/秘密聊天「更多」选项菜单 */
function openChatMoreMenu(e: MouseEvent) {
  const menuItems: ContextMenuItem[] = [];

  if (isSecretChat.value) {
    menuItems.push({
      key: 'delete-chat',
      label: t('lng_profile_delete_conversation'),
      icon: Ban,
      danger: true,
      onClick: () => { /* TODO: 删除秘密聊天 */ },
    });
  } else if (isChatJoined.value) {
    menuItems.push({
      key: 'unsubscribe',
      label: t('lng_profile_leave_channel'),
      icon: LogOut,
      danger: true,
      onClick: () => { unsubscribeChat(); },
    });
  }

  if (menuItems.length === 0) return;
  openContextMenu(e.clientX, e.clientY, menuItems, e.currentTarget as HTMLElement);
}

// =====================================================================
// 自动删除设置弹窗
// =====================================================================
const autoDeleteVisible = ref(false);
const autoDeleteTime = ref<number>(0);
const autoDeleteOptions = [
  { value: 0, label: t('lng_close') },
  { value: 86400, label: t('lng_manage_messages_ttl_after1') },
  { value: 7 * 86400, label: t('lng_manage_messages_ttl_after2') },
  { value: 31 * 86400, label: t('lng_manage_messages_ttl_after3') },
];

/** 资料页自动删除目标 chat：聊天模式用当前 chat，用户模式取/建私聊 */
async function resolveAutoDeleteChatId(): Promise<number | undefined> {
  if (chatMode.value) return chatId.value;
  return getPrivateChatId();
}

/** 秘密聊天入口展示的当前自动删除时长文案 */
const secretAutoDeleteLabel = computed(() => {
  const secs = isSecretChat.value
    ? (autoDeleteTime.value || chatObj.value?.message_auto_delete_time || 0)
    : 0;
  if (!secs) return t('lng_manage_messages_ttl_never');
  const day = 86400;
  if (secs < day) {
    const h = Math.max(1, Math.round(secs / 3600));
    return t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_hours', h) });
  }
  if (secs < day * 7) {
    const d = Math.max(1, Math.round(secs / day));
    return t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_days', d) });
  }
  if (secs < day * 30) {
    const w = Math.max(1, Math.round(secs / (day * 7)));
    return t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_weeks', w) });
  }
  const m = Math.max(1, Math.round(secs / (day * 30)));
  return t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_months', m) });
});

async function openAutoDelete() {
  const cid = await resolveAutoDeleteChatId();
  if (!cid) return;
  try {
    const chat = getReactiveChat(cid) || chatObj.value;
    autoDeleteTime.value = chat?.message_auto_delete_time ?? 0;
  } catch {
    autoDeleteTime.value = 0;
  }
  closeContextMenu();
  autoDeleteVisible.value = true;
}

async function applyAutoDelete(seconds: number) {
  const cid = await resolveAutoDeleteChatId();
  if (!cid) return;
  try {
    await tdlibSend({
      _: 'setChatMessageAutoDeleteTime',
      chat_id: cid,
      message_auto_delete_time: seconds,
    });
    autoDeleteTime.value = seconds;
    if (chatObj.value) chatObj.value.message_auto_delete_time = seconds;
    autoDeleteVisible.value = false;
  } catch (e: any) {
    MessagePlugin.error(e?.message || 'Failed to update auto-delete settings');
  }
}

// =====================================================================
// 加密密钥弹窗（秘密聊天）
// =====================================================================
const encryptionKeyVisible = ref(false);
const secretKeyHash = computed(() => secretChatObj.value?.key_hash || '');
const secretChatPartnerName = computed(() => {
  const u = secretChatUser.value;
  if (!u) return t('lng_credits_box_history_entry_anonymous');
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || t('lng_credits_box_history_entry_anonymous');
});

function openEncryptionKey() {
  if (!secretKeyHash.value) {
    MessagePlugin.error(t('secretChat.encryptionKeyUnavailable'));
    return;
  }
  encryptionKeyVisible.value = true;
}

function closeAutoDelete() {
  autoDeleteVisible.value = false;
}

// =====================================================================
// 编辑联系人弹窗
// =====================================================================
const editContactVisible = ref(false);
const contactFirstName = ref('');
const contactLastName = ref('');
const contactNote = ref('');

async function openEditContact() {
  closeContextMenu();
  // 预填当前联系人的名字/姓氏/备注
  contactFirstName.value = user.value?.first_name ?? '';
  contactLastName.value = user.value?.last_name ?? '';
  contactNote.value = fullInfo.value?.note?.text ?? '';
  editContactVisible.value = true;
}

async function saveContact() {
  try {
    await tdlibSend({
      _: 'addContact',
      user_id: userId.value,
      contact: {
        _: 'importedContact',
        phone_number: user.value?.phone_number ?? '',
        first_name: contactFirstName.value,
        last_name: contactLastName.value,
        note: contactNote.value
          ? { _: 'formattedText', text: contactNote.value, entities: [] }
          : undefined,
      },
      share_phone_number: false,
    });
    editContactVisible.value = false;
    loadData();
  } catch (e: any) {
    MessagePlugin.error(e?.message || 'Failed to save contact');
  }
}

function closeEditContact() {
  editContactVisible.value = false;
}

// =====================================================================
// 拉黑 / 删除联系人 二级确认弹窗
// =====================================================================
const confirmDialog = ref<{
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
}>({
  visible: false,
  title: '',
  message: '',
  confirmText: t('lng_box_ok'),
  onConfirm: () => { },
});

function showConfirm(title: string, message: string, confirmText: string, onConfirm: () => void) {
  closeContextMenu();
  confirmDialog.value = { visible: true, title, message, confirmText, onConfirm };
}

function cancelConfirmDialog() {
  confirmDialog.value.visible = false;
}

/** 拉黑 / 解除拉黑（带二级确认） */
async function onToggleBlock() {
  const isBlocked = !!fullInfo.value?.block_list;
  if (!isBlocked) {
    showConfirm(
      t('lng_profile_block_user'),
      t('lng_blocked_list_confirm_text', { name: userName.value }),
      t('lng_blocked_list_confirm_ok'),
      async () => {
        try {
          await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: { _: 'messageSenderUser', user_id: userId.value },
            block_list: { _: 'blockListMain' },
          });
          cancelConfirmDialog();
          loadData();
        } catch (e: any) {
          MessagePlugin.error(e?.message || 'Failed to block');
        }
      },
    );
  } else {
    showConfirm(
      t('lng_profile_unblock_user'),
      `Unblock “${userName.value}”?`,
      t('lng_blocked_list_unblock'),
      async () => {
        try {
          await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: { _: 'messageSenderUser', user_id: userId.value },
            block_list: null as unknown as BlockList$Input,
          });
          cancelConfirmDialog();
          loadData();
        } catch (e: any) {
          MessagePlugin.error(e?.message || 'Failed to unblock');
        }
      },
    );
  }
}

/** 删除联系人（带二级确认） */
function onDeleteContact() {
  showConfirm(
    t('lng_info_delete_contact'),
    `Remove “${userName.value}” from your contacts?`,
    t('lng_selected_delete'),
    async () => {
      try {
        await tdlibSend({
          _: 'removeContacts',
          user_ids: [userId.value],
        });
        cancelConfirmDialog();
        loadData();
      } catch (e: any) {
        MessagePlugin.error(e?.message || 'Failed to delete contact');
      }
    },
  );
}

function retry() {
  loadData();
}

// 订阅 TDLib 推送更新（在线状态、资料变更等实时刷新），并加载数据
profileStore.initUserProfileUpdates();

/**
 * 标签栏就绪后自动选中第一个可用标签。
 * 进入/切换资料页时默认停在列表第一项；用户手动点选后，只要该标签仍有效则保持不变。
 * （必须放在 isBot / chatActiveStories 等依赖声明之后，避免 immediate 评估触发 TDZ）
 */
watch(profileTabs, (tabs) => {
  if (!tabs.length) return;
  if (shouldSelectFirstTab || !tabs.some((tab) => tab.key === activeTab.value)) {
    activeTab.value = tabs[0]!.key;
    shouldSelectFirstTab = false;
  }
}, { immediate: true });

watch([userId, chatMode], () => {
  if (userId.value > 0 || chatMode.value) {
    // 进入/切换资料：等标签栏就绪后自动选中第一个可用标签
    shouldSelectFirstTab = true;
    loadData();
  }
}, { immediate: true });

// 资料音乐对象变更（updateUserFullInfo 补齐封面 / 音频下载后抽出内嵌封面）时重新加载高清封面
watch(
  () => {
    const a = profileAudio.value;
    if (!a) return '';
    return [
      a.audio?.id,
      a.audio?.local?.is_downloading_completed,
      a.album_cover_thumbnail?.file?.id,
      a.album_cover_thumbnail?.file?.local?.is_downloading_completed,
    ].join('|');
  },
  (key) => {
    if (!key || chatMode.value || !profileAudio.value) return;
    loadProfileMusicCover();
  },
);
</script>

<style scoped>
/* 默认 emoji 状态图标（tgico U+EA2A，指定浅蓝色） */
.tgico-emoji-status::before {
  content: "\ea2a";
  color: #FF5288C1;
}

/* ===== 顶部头像/昵称区域（无背景色，随页面背景） ===== */
.profile-hero {
  min-height: 220px;
}
</style>
