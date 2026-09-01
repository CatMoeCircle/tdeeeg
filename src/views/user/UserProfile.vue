<template>
  <div class="h-full flex flex-col text-gray-900 dark:text-gray-100 overflow-hidden">
    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
      <div class="max-w-2xl mx-auto pb-8" v-if="chatMode || user || chatObj || chatLoading || chatError">
        <!-- ===== 第一部分：顶部青绿色头部区域 ===== -->
        <div class="relative profile-hero overflow-hidden">
          <!-- 返回导航 -->
          <button type="button" aria-label="返回"
            class="absolute top-2 left-2 z-10 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="goBack">
            <ArrowLeft class="w-6 h-6" />
          </button>

          <!-- 用户模式头像/昵称/状态 -->
          <div v-if="!chatMode" class="flex flex-col items-center pt-10 pb-5 px-4 text-gray-900 dark:text-gray-100">
            <!-- 头像 -->
            <button type="button" class="relative rounded-full focus:outline-none" title="点击查看照片"
              @click="openPhotoViewer(0)">
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
              <CustomEmojiInline v-if="!isDeletedProfile && customEmojiId" :emojiId="customEmojiId" :size="22"
                fallback-text="😀" />
              <!-- 有自定义 emoji 状态时不显示星星，仅无自定义 emoji 状态时显示 Premium 星星 -->
              <span v-if="!isDeletedProfile && user?.is_premium && !user?.emoji_status" class="text-base"
                title="Telegram Premium">⭐</span>
              <VerifiedFilledIcon v-if="!isDeletedProfile && verificationType === 'verified'"
                class="text-blue-500 text-lg" title="已验证" :fill-color='["currentColor", "transparent"]'
                :stroke-color='["currentColor", "#0052d9"]' :stroke-width="1.5" />
            </h1>

            <!-- 在线状态 -->
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ statusText }}
            </p>

            <!-- 操作按钮区（非自己时显示：发消息 / 通话 / 通知 / 礼物 / 更多） -->
            <div v-if="!isSelf" class="mt-4 flex items-center gap-2.5">
              <!-- 发消息 -->
              <button type="button"
                class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors"
                @click="openPrivateChat">
                <Send class="w-4 h-4" />
                发消息
              </button>

              <!-- 语音通话 -->
              <button type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="startCall(false)">
                <PhoneCall class="w-4 h-4" />
                通话
              </button>

              <!-- 视频通话 -->
              <button type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="startCall(true)">
                <Video class="w-4 h-4" />
                视频
              </button>

              <!-- 搜索 -->
              <button type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="searchInChat">
                <Search class="w-4 h-4" />
                搜索
              </button>

              <!-- 通知（按下拉开的更多菜单里也能切换；这里开关通知） -->
              <button type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="toggleNotifications">
                <BellOff v-if="isPrivateChatMuted" class="w-4 h-4" />
                <Bell v-else class="w-4 h-4" />
                {{ isPrivateChatMuted ? '开启通知' : '关闭通知' }}
              </button>

              <!-- 更多 -->
              <button type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="openMoreMenu($event)">
                <MoreHorizontal class="w-4 h-4" />
                更多
              </button>
            </div>
          </div>

          <!-- 频道/群组/秘密聊天模式头像/名称 -->
          <div v-else-if="chatObj" class="flex flex-col items-center pt-10 pb-5 px-4 text-gray-900 dark:text-gray-100">
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
                  :text="isSecretChat && secretChatUser ? `${secretChatUser.first_name} ${secretChatUser.last_name}`.trim() || '秘密聊天' : chatTitle" />
              </span>
              <VerifiedFilledIcon v-if="isChatVerified" class="text-blue-500 text-lg" title="已验证"
                :fill-color='["currentColor", "transparent"]' :stroke-color='["currentColor", "#0052d9"]'
                :stroke-width="1.5" />
            </h1>

            <!-- 副标题 -->
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ isSecretChat ? '秘密聊天' : chatMemberCountText }}
            </p>

            <!-- 操作按钮区 -->
            <div class="mt-4 flex items-center gap-2.5">
              <!-- 秘密聊天：发消息 / 通话 / 更多 -->
              <template v-if="isSecretChat">
                <button type="button"
                  class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors"
                  @click="openChatChannel">
                  <Send class="w-4 h-4" />
                  发消息
                </button>
                <button type="button"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  @click="startCall(false)">
                  <PhoneCall class="w-4 h-4" />
                  通话
                </button>
                <button type="button"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  @click="startCall(true)">
                  <Video class="w-4 h-4" />
                  视频
                </button>
              </template>
              <!-- 频道/群组：加入/退出按钮 + 查看频道/群组 -->
              <template v-else>
                <button type="button"
                  class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white text-sm font-medium transition-colors"
                  :class="isChatJoined ? 'bg-gray-500 hover:bg-gray-600' : 'bg-teal-500 hover:bg-teal-600'"
                  @click="isChatJoined ? unsubscribeChat() : joinChat()">
                  <Eye v-if="!isChatJoined" class="w-4 h-4" />
                  <LogOut v-else class="w-4 h-4" />
                  {{ isChatJoined ? joinButtonText : joinButtonText }}
                </button>
              </template>

              <!-- 通知 -->
              <button type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="chatToggleNotifications">
                <BellOff v-if="chatNotificationMuted" class="w-4 h-4" />
                <Bell v-else class="w-4 h-4" />
                {{ chatNotificationMuted ? '开启通知' : '关闭通知' }}
              </button>

              <!-- 更多 -->
              <button type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="openChatMoreMenu($event)">
                <MoreHorizontal class="w-4 h-4" />
                更多
              </button>
            </div>
          </div>
        </div>

        <!-- ===== 第二部分：音乐卡片 + 频道订阅卡片（仅用户模式） ===== -->
        <div v-if="!chatMode" class="px-4">
          <!-- 音乐卡片：标题在卡片外，方形封面/名称/作者在卡片内 -->
          <template v-if="profileAudio">
            <!-- 区域标题（卡片外部） -->
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">个人资料音乐</p>
            <!-- 卡片：音乐入口行 -->
            <div
              class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] overflow-hidden mb-4">
              <button type="button" @click="openUserMusicPlayer"
                class="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <!-- 方形封面（播放/暂停按钮叠加在封面上） -->
                <div
                  class="relative w-14 h-14 rounded-lg shrink-0 overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  <template v-if="profileMusicCover">
                    <!-- 高清封面就绪后替换；低清 minithumbnail 仅作为过渡（模糊 + 放大） -->
                    <img :src="profileMusicCover" class="w-full h-full object-cover"
                      :class="profileMusicCoverIsLowRes ? 'scale-125 blur-[2px]' : ''" />
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
            class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] overflow-hidden">
            <!-- 头部：频道 + 订阅数（使用该用户主题色） -->
            <div class="flex items-baseline justify-between px-3.5 pt-3 pb-1.5">
              <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">频道</span>
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
              class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
              <InfoIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                  <GlobalEmojiText :text="secretChatFullInfo.bio.text" />
                </p>
                <p class="text-xs text-gray-400 mt-0.5">个人简介</p>
              </div>
            </div>
            <!-- 手机号码 -->
            <div v-if="secretChatUser.phone_number"
              class="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
              <PhoneIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                  <CopyableText :text="secretChatUser.phone_number" @click.stop />
                </p>
                <p class="text-xs text-gray-400">手机号码</p>
              </div>
            </div>
            <!-- 用户名 -->
            <div v-if="secretChatUser.usernames?.active_usernames?.length"
              class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="secretChatUser.usernames?.active_usernames?.[0] && copyText('@' + secretChatUser.usernames.active_usernames[0])">
              <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-gray-900 dark:text-gray-100 select-all wrap-break-word leading-snug">
                  <CopyableText :text="secretChatUser.usernames.active_usernames[0]" @click.stop />
                </p>
                <p class="mt-0.5 text-xs text-gray-400">用户名</p>
              </div>
            </div>
            <!-- ID -->
            <div
              class="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
              <IdCardIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                  <CopyableText :text="String(secretChatUser.id)" @click.stop />
                </p>
                <p class="text-xs text-gray-400">用户 ID</p>
              </div>
            </div>
          </template>

          <!-- 频道/群组：介绍 -->
          <div v-else-if="chatDescription"
            class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
            <InfoIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                <GlobalEmojiText :text="chatDescription" />
              </p>
              <p class="text-xs text-gray-400 mt-0.5">简介</p>
            </div>
          </div>

          <!-- 频道/群组用户名 -->
          <div v-if="chatUsername"
            class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            @click="chatUsername && copyText('@' + chatUsername)">
            <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold text-gray-900 dark:text-gray-100 select-all wrap-break-word leading-snug">
                <CopyableText :text="chatUsername" @click.stop />
              </p>
              <p class="mt-0.5 text-xs text-gray-400">用户名</p>
            </div>
          </div>

          <!-- 频道/群组 ID -->
          <div v-if="!isSecretChat"
            class="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
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
              复制
            </button>
          </div>
        </div>

        <!-- ===== 第三部分：个人信息列表卡片（仅用户模式） ===== -->
        <div v-if="!chatMode" class="px-4 mt-4 space-y-2">
          <!-- 3.1 个人简介 -->
          <div v-if="bioText"
            class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
            <InfoIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                <GlobalEmojiText :text="bioText" />
              </p>
              <p class="text-xs text-gray-400 mt-0.5">个人简介</p>
            </div>
          </div>

          <!-- 3.2 手机号码 -->
          <div v-if="user?.phone_number"
            class="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
            <PhoneIcon class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 select-all">
                <CopyableText :text="phoneDisplay || user.phone_number" @click.stop />
              </p>
              <p class="text-xs text-gray-400">手机号码</p>
            </div>
          </div>

          <!-- 3.3 用户名（可复制文本：默认黑色，悬停变蓝，点击复制） -->
          <div v-if="primaryUsername || additionalUsernames.length"
            class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
              <p class="mt-0.5 text-xs text-gray-400">用户名</p>
            </div>
          </div>

          <!-- 3.4 生日 -->
          <div v-if="birthdateText"
            class="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
            <CalendarIcon class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ birthdateText }}</p>
              <p class="text-xs text-gray-400">生日</p>
            </div>
          </div>

          <!-- 3.5 位置（点击用微软地图网页版打开） -->
          <button v-if="businessLocation" type="button"
            class="w-full flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            @click="openLocation()">
            <MapPin class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ businessLocation.address }}</p>
              <!-- 经纬度显示在位置名称下方 -->
              <p v-if="businessLocation.location" class="text-xs text-blue-500 mt-0.5 select-all">
                {{ businessLocation.location.latitude.toFixed(4) }}, {{ businessLocation.location.longitude.toFixed(4)
                }}
              </p>
              <p class="text-xs text-gray-400">位置</p>
            </div>
            <ExternalLink class="w-4 h-4 text-gray-400 shrink-0" />
          </button>

          <!-- 3.6 营业时间（点击展开/收起详细时段） -->
          <div v-if="businessOpenNow"
            class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] overflow-hidden">
            <button type="button"
              class="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="hoursExpanded = !hoursExpanded">
              <Clock class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium" :class="businessOpenNow.open ? 'text-green-600' : 'text-red-500'">
                  {{ businessOpenNow.text }}
                </p>
                <p class="text-xs text-gray-400">营业时间</p>
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
          <div
            class="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
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
              复制
            </button>
          </div>

          <!-- 机器人资料（如为机器人） -->
          <div v-if="isBot"
            class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
            <div class="flex items-center gap-2 mb-1">
              <Bot class="w-5 h-5 text-gray-400" />
              <span class="text-sm font-medium">机器人</span>
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


        <!-- ===== 第四部分：底部功能导航栏（动态 / 归档动态 / 礼物 / 共同群组） ===== -->
        <div v-if="hasBottomContent" class="px-4 mt-5">
          <div
            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] overflow-x-auto scrollbar-none"
            v-smooth-wheel="'horizontal'" @wheel.prevent>
            <div class="flex items-center gap-1.5 p-1 w-max">
              <button v-for="tab in profileTabs" :key="tab.key" type="button"
                class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
                :class="activeTab === tab.key ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
                @click="activeTab = tab.key">
                <component :is="tabIconMap[tab.key]" class="w-3.5 h-3.5" />
                {{ tab.label }}
                <span v-if="tab.count > 0"
                  class="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none"
                  :class="activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'">
                  {{ tab.count > 999 ? `${Math.floor(tab.count / 1000)}k` : tab.count }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- ===== 第五部分：媒体内容区（宫格 + 共享媒体） ===== -->
        <div v-if="hasBottomContent" class="px-4 mt-3">
          <!-- 动态区 -->
          <div v-if="activeTab === 'stories'" class="py-6 text-center text-sm text-gray-400">
            <p v-if="isLoading">正在加载动态…</p>
            <p v-else-if="displayActiveStories.length === 0">暂无动态</p>
            <div v-else class="grid grid-cols-3 gap-1.5">
              <button v-for="s in displayActiveStories" :key="s.id" type="button"
                class="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700 relative"
                @click="openStory(s)">
                <img v-if="storyUrlOf(s)" :src="storyUrlOf(s)" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-400">
                  动态
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
            <p v-if="isLoading">正在加载动态…</p>
            <p v-else-if="displayArchivedStories.length === 0">暂无归档动态</p>
            <div v-else class="grid grid-cols-3 gap-1.5">
              <button v-for="s in displayArchivedStories" :key="s.id" type="button"
                class="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700 relative"
                @click="openStory(s)">
                <img v-if="storyUrlOf(s)" :src="storyUrlOf(s)" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-400">
                  动态
                </div>
                <span v-if="formatStoryDuration(s)"
                  class="absolute bottom-1 right-1 text-[10px] leading-none bg-black/55 text-white px-1 py-0.5 rounded">
                  {{ formatStoryDuration(s) }}
                </span>
              </button>
            </div>
          </div>

          <!-- 礼物区（仅普通用户） -->
          <div v-else-if="activeTab === 'gifts' && !chatMode" class="py-6 text-center text-sm text-gray-400">
            <p v-if="giftsList.length === 0">暂无礼物</p>
            <div v-else>
              <div v-if="giftsList.length" class="flex items-center justify-between mb-2">
                <span class="px-2 py-0.5 rounded-lg bg-teal-600 text-white text-xs font-medium">礼物</span>
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                <div v-for="(gift, i) in giftsList" :key="gift.received_gift_id || i"
                  class="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden"
                  :title="giftText(gift)">
                  <MessageStickerContent v-if="giftStickerContent(gift)" :content="giftStickerContent(gift)!"
                    :size="profileGiftCellSize" />
                  <Gift v-else class="text-3xl text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          <!-- 共同群组区（仅查看他人资料页时显示） -->
          <div v-else-if="activeTab === 'groups' && !chatMode && !isSelf" class="py-4">
            <p v-if="commonGroupsList.length === 0" class="text-center text-sm text-gray-400 py-6">暂无共同群组</p>
            <div v-else>
              <button v-for="gid in commonGroupsList" :key="gid" type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="openCommonGroup(gid)">
                <div class="w-10 h-10 shrink-0">
                  <Avatar :photo="(getReactiveChat(gid) as any)?.photo" :title="getChatTitle(getReactiveChat(gid))"
                    :accentColorId="(getReactiveChat(gid) as any)?.profile_accent_color_id ?? (getReactiveChat(gid) as any)?.accent_color_id"
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
          <div v-else-if="activeTab === 'members'" class="py-4">
            <p v-if="chatMemberCountText" class="text-center text-sm text-gray-400 py-6">{{ chatMemberCountText }}</p>
            <p v-else class="text-center text-sm text-gray-400 py-6">暂无成员信息</p>
          </div>

          <!-- 话题区（论坛话题） -->
          <div v-else-if="activeTab === 'topics'" class="py-4">
            <p class="text-center text-sm text-gray-400 py-6">暂无话题</p>
          </div>

          <!-- 共享媒体区（照片/视频） -->
          <div v-else-if="activeTab === 'media'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">正在加载媒体…</div>
            <div v-else-if="sharedMediaItems.length === 0" class="text-center text-sm text-gray-400 py-6">暂无媒体</div>
            <div v-else class="grid grid-cols-3 gap-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId"
                class="aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 relative cursor-pointer"
                @click="openSharedMediaViewer(sharedMediaItems.indexOf(item))"
                @contextmenu="showSharedMediaContextMenu($event, item)">
                <!-- 加载中的 minithumbnail 模糊占位 -->
                <img v-if="sharedMediaMiniSrc(item) && !sharedMediaUrl(item.messageId)" :src="sharedMediaMiniSrc(item)"
                  class="w-full h-full object-cover scale-110 blur-sm" />
                <!-- 加载完成的缩略图 -->
                <img v-if="sharedMediaUrl(item.messageId)" :src="sharedMediaUrl(item.messageId)"
                  class="w-full h-full object-cover" />
                <!-- 未下载且无 minithumbnail 时的占位 -->
                <div v-if="!sharedMediaMiniSrc(item) && !sharedMediaUrl(item.messageId)"
                  class="w-full h-full flex items-center justify-center text-xs text-gray-400">
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
              <span class="text-sm text-gray-400">加载中…</span>
            </div>
          </div>

          <!-- 共享文件区 -->
          <div v-else-if="activeTab === 'files'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">正在加载文件…</div>
            <div v-else-if="sharedMediaItems.length === 0" class="text-center text-sm text-gray-400 py-6">暂无文件</div>
            <div v-else class="space-y-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                @click="jumpToMessage(item.chatId, item.messageId)"
                @contextmenu="showSharedMediaContextMenu($event, item)">
                <div
                  class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <FileText class="w-5 h-5 text-gray-400" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ item.fileName || '文件' }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` :
                    '' }}
                  </p>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">加载中…</span>
            </div>
          </div>

          <!-- 共享链接区 -->
          <div v-else-if="activeTab === 'links'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">正在加载链接…</div>
            <div v-else-if="sharedMediaItems.length === 0" class="text-center text-sm text-gray-400 py-6">暂无链接</div>
            <div v-else class="space-y-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                @click="openSharedLink(item.url)" @contextmenu="showSharedMediaContextMenu($event, item)">
                <div
                  class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Link class="w-5 h-5 text-blue-500" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-blue-600 dark:text-blue-400 truncate">{{ item.url || '链接' }}</p>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">加载中…</span>
            </div>
          </div>

          <!-- 共享音乐区 -->
          <div v-else-if="activeTab === 'music'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">正在加载音乐…</div>
            <div v-else-if="sharedMediaItems.length === 0" class="text-center text-sm text-gray-400 py-6">暂无音乐</div>
            <div v-else class="space-y-1">
              <div v-for="(item, idx) in sharedMediaItems" :key="item.messageId"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                @click="playSharedMusic(idx)"
                @contextmenu="showSharedMediaContextMenu($event, item)">
                <!-- 专辑封面（优先缩略图，无则图标） -->
                <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                  <img v-if="item.miniSrc" :src="item.miniSrc" class="w-full h-full object-cover" />
                  <Music v-else class="w-5 h-5 text-gray-400" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {{ item.audioTitle || item.fileName || '未知音乐' }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5 truncate">
                    {{ item.performer || '' }}<template v-if="item.performer && item.audioDuration"> · </template><template v-if="item.audioDuration">{{ formatAudioDuration(item.audioDuration) }}</template>
                  </p>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">加载中…</span>
            </div>
          </div>

          <!-- 共享语音区 -->
          <div v-else-if="activeTab === 'voice'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">正在加载语音…</div>
            <div v-else-if="sharedMediaItems.length === 0" class="text-center text-sm text-gray-400 py-6">暂无语音</div>
            <div v-else class="space-y-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                @click="jumpToMessage(item.chatId, item.messageId)"
                @contextmenu="showSharedMediaContextMenu($event, item)">
                <div
                  class="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Mic class="w-5 h-5 text-gray-400" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">语音消息</p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` :
                    '' }}
                  </p>
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">加载中…</span>
            </div>
          </div>

          <!-- GIF 区 -->
          <div v-else-if="activeTab === 'gifs'" class="py-4">
            <div v-if="sharedMediaLoading" class="text-center text-sm text-gray-400 py-6">正在加载 GIF…</div>
            <div v-else-if="sharedMediaItems.length === 0" class="text-center text-sm text-gray-400 py-6">暂无 GIF</div>
            <div v-else class="grid grid-cols-3 gap-1">
              <div v-for="item in sharedMediaItems" :key="item.messageId"
                class="aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 relative cursor-pointer"
                @click="openSharedMediaViewer(sharedMediaItems.indexOf(item))"
                @contextmenu="showSharedMediaContextMenu($event, item)">
                <img v-if="sharedMediaMiniSrc(item) && !sharedMediaUrl(item.messageId)" :src="sharedMediaMiniSrc(item)"
                  class="w-full h-full object-cover scale-110 blur-sm" />
                <img v-if="sharedMediaUrl(item.messageId)" :src="sharedMediaUrl(item.messageId)"
                  class="w-full h-full object-cover" />
                <div v-if="!sharedMediaMiniSrc(item) && !sharedMediaUrl(item.messageId)"
                  class="w-full h-full flex items-center justify-center text-xs text-gray-400">
                  <Film class="w-6 h-6" />
                </div>
              </div>
            </div>
            <div ref="loadMoreSentinel" class="h-1" />
            <div v-if="sharedMediaLoadingMore" class="text-center py-3">
              <span class="text-sm text-gray-400">加载中…</span>
            </div>
          </div>
        </div>

        <!-- ===== 加载 / 错误状态（用户模式） ===== -->
        <div v-if="!chatMode && isLoading" class="flex items-center justify-center py-16 text-gray-400 text-sm">
          正在加载资料…
        </div>
        <div v-else-if="!chatMode && hasError"
          class="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p>无法加载该用户的资料</p>
          <button type="button" class="mt-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
            @click="retry">
            重试
          </button>
        </div>

        <!-- ===== 加载 / 错误状态（频道/群组模式） ===== -->
        <div v-if="chatMode && (chatLoading || (!chatObj && !chatError))"
          class="flex items-center justify-center py-16 text-gray-400 text-sm">
          正在加载资料…
        </div>
        <div v-else-if="chatMode && chatError"
          class="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p>无法加载该频道/群组的资料</p>
          <button type="button" class="mt-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
            @click="retry">
            重试
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
              <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">自动删除设置</h3>
              <button type="button"
                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                @click="closeAutoDelete">
                <XIcon class="w-4 h-4" />
              </button>
            </div>
            <div class="px-4 py-3">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">选择在此对话中消息被自动删除的时间：</p>
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
              <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">编辑联系人</h3>
              <button type="button"
                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                @click="closeEditContact">
                <XIcon class="w-4 h-4" />
              </button>
            </div>
            <div class="px-4 py-4 space-y-3">
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">名字</label>
                <input v-model="contactFirstName" type="text" maxlength="64"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="名字" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">姓氏</label>
                <input v-model="contactLastName" type="text" maxlength="64"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="姓氏" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">备注</label>
                <textarea v-model="contactNote" rows="3"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  placeholder="备注（可选）"></textarea>
              </div>
            </div>
            <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
              <button type="button" @click="closeEditContact"
                class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                取消
              </button>
              <button type="button" @click="saveContact"
                class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600">
                保存
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
                取消
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
        未找到该用户
      </div>
      <!-- 频道/群组模式加载/错误占位 -->
      <div v-else-if="chatMode && chatError"
        class="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
        <p>无法加载该频道/群组的资料</p>
        <button type="button" class="mt-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
          @click="retry">
          重试
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { user as TdUser, userFullInfo, profilePhoto, chatPhoto, receivedGift, story, chat, audio as TdAudio, birthdate, file, message, thumbnail, supergroup, basicGroup, supergroupFullInfo, basicGroupFullInfo, chatPhotoInfo, messageSticker, secretChat, SearchMessagesFilter$Input } from "tdlib-types";
import Avatar from "../../components/chat/avatar.vue";
import CustomEmojiInline from "../../components/common/CustomEmojiInline.vue";
import GlobalEmojiText from "../../components/common/GlobalEmojiText.vue";
import MessageStickerContent from "../../components/chat/ChatDetail/MessageContent/content/MessageStickerContent.vue";
import MediaViewer from "../../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import type { MediaViewerItem } from "../../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import { useUserProfileStore } from "../../store/userProfile";
import { useUserStore } from "../../store/user";
import { accentColorStyle, rgbToCss } from "../../store/colors";
import { confirmAndOpenExternalLink } from "../../utils/openExternalLink";
import formatStatus from "../../utils/status";
import { downloadFileUrl } from "../../utils/profileMedia";
import { formatBusinessHours } from "../../utils/businessHours";
import { isThumbnailImgRenderable } from "../../utils/thumbnail";
import { tdlibSend } from "../../utils/tdlib";

import { ensureChat, getReactiveUser, getReactiveChat, getChatTitle, DELETED_ACCOUNT_LABEL } from "../../utils/senderInfo";
import { useAudioPlayerStore } from "../../store/audioPlayer";
import formatTime from "../../utils/formatTime";
import { openContextMenu, closeContextMenu } from "../../store/contextMenu";
import type { ContextMenuItem } from "../../components/contextMenu/types";
import { MessagePlugin } from "tdesign-vue-next";
import { buildProfileTabs, type ProfileTab, type ProfileTabKey } from "../../utils/profileTabs";
import type { SharedMediaCounts } from "../../utils/sharedMediaCounts";
import { useProfileSharedMedia } from "../../composables/useProfileSharedMedia";

// ===== 图标组件（lucide-vue-next，与项目其余部分一致） =====
import {
  ArrowLeft, Copy, Clock, MapPin, Gift, Bot, Play, Pause,
  Music, ChevronDown, Megaphone, ExternalLink, Send, Bell, BellOff,
  MoreHorizontal, TimerReset, Ban, UserPlus, UserMinus, X as XIcon,
  Eye, LogOut, MessageSquareText, PhoneCall, Video,
  Search, Users, Hash, FileText, Link, Mic, Film,
  Info as InfoIcon, Phone as PhoneIcon, AtSign as AtSignIcon,
  Calendar as CalendarIcon, IdCard as IdCardIcon,
} from "lucide-vue-next"; import { VerifiedFilledIcon } from "tdesign-icons-vue-next";
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const profileStore = useUserProfileStore();
const audioPlayer = useAudioPlayerStore();

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
  (chatObj.value as any)?.profile_accent_color_id ?? (chatObj.value as any)?.accent_color_id,
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
  if (count <= 0) return isChatChannel.value ? '频道' : '群组';
  const unit = isChatChannel.value ? '订阅者' : '成员';
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
const commonGroupsList = computed<number[]>(() => profileStore.commonGroups.get(userId.value) ?? []);
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
 * 已注销账户（userTypeDeleted）或无名（first/last 都为空，即"未知用户"）都按已注销账户处理：
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
    : `${user.value?.first_name ?? ''} ${user.value?.last_name ?? ''}`.trim() || '未知用户');
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
const customEmojiId = computed<string | undefined>(() => {
  const t = user.value?.emoji_status?.type;
  if (t && t._ === 'emojiStatusTypeCustomEmoji') return t.custom_emoji_id;
  return undefined;
});

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
const personalChatTitle = computed(() => personalChat.value?.title || '个人频道');
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
      const sg = (await tdlibSend({ _: 'getSupergroup', supergroup_id: sgId })) as { member_count?: number };
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
  const c = msg.content as { caption?: { text?: string } } | null;
  return c?.caption?.text || '';
}

/** 频道订阅按钮文本，如「2452 订阅」 */
const channelMemberText = computed(() => {
  if (channelMemberCount.value === null || channelMemberCount.value === undefined) {
    return '订阅';
  }
  return `${channelMemberCount.value.toLocaleString()} 订阅`;
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

/** 当前共享媒体搜索使用的 chatId（用户模式用私聊 id，聊天模式用 chatId） */
const sharedMediaChatId = computed<number | undefined>(() => {
  if (chatMode.value) return chatId.value;
  return privateChatId.value;
});

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

/** 新增共享媒体项后，自动开始懒加载缩略图 */
watch(sharedMediaItems, (items) => {
  for (const item of items) {
    if (!sharedMediaUrlCache.value[item.messageId] && item.photo) {
      void loadSharedMediaThumb(item);
    }
  }
}, { immediate: true });

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
      type: i.isVideo ? 'video' as const : 'photo' as const,
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
      label: '在聊天中查看',
      icon: Eye,
      onClick: () => { jumpToMessage(item.chatId, item.messageId); },
    },
  ];
  if (item.url) {
    menuItems.push({
      key: 'open-link',
      label: '打开链接',
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

  const tracks = musicItems.map((item) => {
    const msg = item.message!;
    const audio = (msg.content as any).audio;
    const file = audio.audio;
    let filePath = '';
    if (isFileReady(file) && file.local?.path) {
      filePath = convertFileSrc(file.local.path);
    }
    return {
      messageId: msg.id,
      chatId: msg.chat_id,
      title: audio.title || audio.file_name || '未知音乐',
      performer: audio.performer || '未知艺术家',
      duration: audio.duration,
      fileId: file.id,
      filePath,
      sizeBytes: file.size || 0,
      mimeType: audio.mime_type || 'audio/mpeg',
      ready: !!filePath,
      source: 'message' as const,
    };
  });

  audioPlayer.setPlaylist(tracks, startIdx);
}

/** 共享媒体缩略图 URL 缓存（messageId → URL） */
const sharedMediaUrlCache = ref<Record<number, string>>({});

/** 下载共享媒体的缩略图（最小尺寸，用于网格展示） */
async function loadSharedMediaThumb(item: { messageId: number; photo?: any }) {
  if (sharedMediaUrlCache.value[item.messageId]) return;
  if (!item.photo?.sizes?.length) return;
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
    return { open: true, text: '正在营业' };
  }
  if (bi.next_open_in && bi.next_open_in > 0) {
    return { open: false, text: '此时不营业', next: formatBusinessNext(bi.next_open_in) };
  }
  return null;
});
/** 将秒数格式化为「N小时后营业 / N分钟后营业」 */
function formatBusinessNext(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 1) return `${h}小时后营业`;
  if (m >= 1) return `${m}分钟后营业`;
  return '即将营业';
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
const profileAudioTitle = computed(() => profileAudio.value?.title || profileAudio.value?.file_name || '音乐');
const profileAudioPerformer = computed(() => profileAudio.value?.performer || '未知艺术家');
/** 高清封面 URL（下载完成后替换低清过渡图） */
const profileMusicCoverHd = ref<string | undefined>(undefined);
/** 当前封面：高清已就绪用高清，否则用低清 minithumbnail 作过渡 */
const profileMusicCover = computed<string | undefined>(() => {
  if (profileMusicCoverHd.value) return profileMusicCoverHd.value;
  const mini = profileAudio.value?.album_cover_minithumbnail?.data;
  return mini ? `data:image/jpeg;base64,${mini}` : undefined;
});
/** 是否只有低清封面（用于给过渡图加模糊/放大效果） */
const profileMusicCoverIsLowRes = computed(() => !profileMusicCoverHd.value);

/** 挑出最大的可渲染（<img>）专辑封面缩略图文件 */
function pickBestAlbumCoverFile(a: TdAudio | undefined): file | undefined {
  if (!a) return undefined;
  const candidates: thumbnail[] = [];
  if (a.album_cover_thumbnail) candidates.push(a.album_cover_thumbnail);
  if (Array.isArray(a.external_album_covers)) candidates.push(...a.external_album_covers);
  let best: file | undefined;
  let bestArea = 0;
  for (const t of candidates) {
    if (!isThumbnailImgRenderable(t.format)) continue;
    const area = t.width * t.height;
    if (area > bestArea) {
      bestArea = area;
      best = t.file;
    }
  }
  return best;
}

/** 加载资料音乐的高清专辑封面（失败则保留低清过渡图） */
async function loadProfileMusicCover() {
  profileMusicCoverHd.value = undefined;
  const coverFile = pickBestAlbumCoverFile(profileAudio.value);
  if (!coverFile) return;
  try {
    const url = await downloadFileUrl(coverFile, `profile_music_cover_${coverFile.id}.jpg`, 'music_cover');
    if (url) profileMusicCoverHd.value = url;
  } catch (e) {
    console.error('Failed to load profile music cover', e);
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
    const url = await downloadFileUrl(biggest, `profile_photo_${i}.jpg`, 'avatar');
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
    .map(({ photo }) => ({ type: 'photo' as const, file: pickLargestPhotoFile(photo) })),
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
// 礼物网格单元格宽（用于限制 MessageStickerContent 的贴纸尺寸）。
// grid-cols-3 在 ~400px 内容区下每格约 120px，取略小值确保不溢出。
const profileGiftCellSize = 112;

/**
 * 从收货礼物中提取可交给 MessageStickerContent 渲染的贴纸内容（messageSticker）。
 * 兼容两种结构化：
 *   - TDLib 类型定义：receivedGift.gift 是 SentGift（sentGiftRegular.gift.sticker）
 *   - 运行时常量：部分场景 receivedGift.gift 直接是 gift 对象（gift.sticker）
 * 升级礼物（sentGiftUpgraded）无单一 sticker 时返回 undefined，由调用方回退到图标占位。
 */
function giftStickerContent(gift: receivedGift): messageSticker | undefined {
  const sent = gift.gift as any;
  if (!sent) return undefined;
  let st: unknown;
  // sentGiftRegular.gift.sticker
  if (sent._ === 'sentGiftRegular') {
    st = sent.gift?.sticker;
  } else if (sent._ === 'gift') {
    // 运行时时 gift.gift 就是 gift 对象
    st = sent.sticker;
  }
  // 兜底：无论结构，直接取可能的 sticker 字段
  if (!st) st = sent.sticker || sent.gift?.sticker;
  if (st) {
    return {
      _: 'messageSticker',
      sticker: st as any,
      is_premium: false,
    };
  }
  return undefined;
}

/** 礼物 tooltip 文本 */
function giftText(gift: receivedGift): string {
  const g = (gift.gift as any)?.gift as { name?: string } | undefined;
  return g?.name || gift.text?.text || '礼物';
}

// ===== 动态 URL =====
const storyUrls = ref<Record<number, string>>({});
async function loadStoryUrls() {
  const urls: Record<number, string> = {};
  for (const s of storiesList.value) {
    const file = pickStoryCoverFile(s);
    if (!file) continue;
    try {
      const url = await downloadFileUrl(file, `story_${s.id}.jpg`, 'story_cover');
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
      return th.file as file;
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
  if (c._ === 'storyContentLive') return '直播';
  if (c._ === 'storyContentVideo' && c.video?.duration) {
    const d = Math.round(c.video.duration);
    const m = Math.floor(d / 60);
    const sec = d % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  return '';
}

/** 打开动态：把动态媒体塞进 MediaViewer 展示（照片/视频封面统一走图片查看器） */
function openStory(s: story) {
  const c = s.content;
  if (!c) return;
  let f: file | undefined;
  if (c._ === 'storyContentPhoto') {
    const sizes = c.photo.sizes;
    if (sizes.length > 0) {
      const largest = sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
      f = largest.photo;
    }
  } else if (c._ === 'storyContentVideo') {
    f = c.video.video;
  }
  photoViewerIndex.value = 0;
  photoViewerItemsOverride.value = [{ type: 'photo', file: f }];
  photoViewerVisible.value = true;
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
      c = await tdlibSend({ _: 'getChat', chat_id: cid }) as chat;
    }
    chatObj.value = c;

    // 秘密聊天：额外获取 secretChat 信息 + 用户信息
    if (c.type?._ === 'chatTypeSecret') {
      try {
        secretChatObj.value = await tdlibSend({
          _: 'getSecretChat',
          secret_chat_id: c.type.secret_chat_id,
        }) as secretChat;
      } catch (e) {
        console.error('Failed to load secret chat', e);
      }
      // 获取秘密聊天对方的用户信息（复用 profileStore 缓存）
      const uid = c.type.user_id;
      if (uid) {
        void profileStore.fetchUser(uid).catch(() => { });
        void profileStore.fetchFullInfo(uid).catch(() => { });
      }
    }

    // 主内容（标题/头像）已就绪，先结束加载态，让页面立即渲染；
    // 群组详情与动态在后台异步刷新，各自容错，不阻塞页面。
    chatLoaded.value = true;
    chatLoading.value = false;
    void loadChatGroupInfo();
    void loadChatStories();
    void refreshChatNotificationMuted();
    // 获取共享媒体计数（频道/群组模式）
    void profileStore.fetchSharedMediaCountsForChat(cid).then((counts) => {
      sharedMediaCounts.value = counts;
    });
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
        supergroupObj.value = await tdlibSend({ _: 'getSupergroup', supergroup_id: sgId }) as supergroup;
      } catch (e) {
        console.error('Failed to load supergroup', e);
      }
      try {
        supergroupFull.value = await tdlibSend({
          _: 'getSupergroupFullInfo',
          supergroup_id: sgId,
        }) as supergroupFullInfo;
      } catch (e) {
        supergroupFull.value = undefined;
        console.error('Failed to load supergroup full info', e);
      }
      basicGroupObj.value = undefined;
      basicGroupFull.value = undefined;
    } else if (c.type._ === 'chatTypeBasicGroup') {
      const bgId = c.type.basic_group_id;
      try {
        basicGroupObj.value = await tdlibSend({ _: 'getBasicGroup', basic_group_id: bgId }) as basicGroup;
      } catch (e) {
        console.error('Failed to load basic group', e);
      }
      try {
        basicGroupFull.value = await tdlibSend({
          _: 'getBasicGroupFullInfo',
          basic_group_id: bgId,
        }) as basicGroupFullInfo;
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
    const page = (await tdlibSend({
      _: 'getChatPostedToChatPageStories',
      chat_id: cid,
      from_story_id: 0,
      limit: 100,
    })) as { stories: story[] };
    fullActive = page.stories ?? [];
  } catch (e) { /* 忽略：无主页动态 */ }
  chatActiveStories.value = fullActive;
  // 拉取封面 URL
  const urls: Record<number, string> = {};
  for (const s of fullActive) {
    const file = pickStoryCoverFile(s);
    if (!file) continue;
    try {
      const url = await downloadFileUrl(file, `chat_story_${s.id}.jpg`, 'story_cover');
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
  } catch (e) {
    console.error("Failed to play profile audio", e);
  }
}

// =====================================================================
// 头像区操作按钮（发消息 / 通知 / 礼物 / 更多）
// =====================================================================

/** 私聊 chat id（懒加载，通过 createPrivateChat 获取/创建与用户的私聊） */
const privateChatId = ref<number | undefined>(undefined);
async function getPrivateChatId(): Promise<number | undefined> {
  if (privateChatId.value) return privateChatId.value;
  try {
    const res = (await tdlibSend({
      _: 'createPrivateChat',
      user_id: userId.value,
      force: false,
    })) as { id: number };
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
  const muteFor = (chat as any)?.notification_settings?.mute_for ?? 0;
  isPrivateChatMuted.value = muteFor > 0;
}

/** 发消息：跳转到与用户的私聊 */
async function openPrivateChat() {
  const cid = await getPrivateChatId();
  if (!cid) return;
  router.push({ name: "chat-detail", params: { id: String(cid) } });
}

/** 语音/视频通话 */
async function startCall(video: boolean) {
  const cid = await getPrivateChatId();
  if (!cid) return;
  // 跳转到聊天页面（通话功能需要在聊天页面触发）
  router.push({ name: 'chat-detail', params: { id: String(cid) } });
  // TODO: 通过 VoIP 服务发起通话
  MessagePlugin.info(video ? '视频通话功能开发中' : '语音通话功能开发中');
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
    MessagePlugin.success('已加入');
    loadData();
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加入失败');
  }
}

/** 获取加入/退出按钮文本 */
const joinButtonText = computed(() => {
  if (isChatJoined.value) {
    return isChatChannel.value ? '取消订阅' : '退出群组';
  }
  return isChatChannel.value ? '加入频道' : '加入群组';
});

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
      } as any,
    });
    isPrivateChatMuted.value = !isPrivateChatMuted.value;
    MessagePlugin.success(isPrivateChatMuted.value ? '已关闭通知' : '已开启通知');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '操作失败');
  }
}

/** 打开「更多」菜单 */
function openMoreMenu(e: MouseEvent) {
  const isContact = !!user.value?.is_contact;
  const menuItems: ContextMenuItem[] = [
    {
      key: 'auto-delete',
      label: '自动删除设置',
      icon: TimerReset,
      onClick: () => { openAutoDelete(); },
    },
    { key: 'divider-1', label: '', divider: true },
    {
      key: 'block',
      label: fullInfo.value?.block_list ? '解除拉黑' : '拉黑',
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
        label: '编辑联系人',
        icon: UserPlus,
        onClick: () => { openEditContact(); },
      },
      {
        key: 'delete-contact',
        label: '删除联系人',
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
  const c = getReactiveChat(cid) as any;
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
      } as any,
    });
    chatNotificationMuted.value = !chatNotificationMuted.value;
    MessagePlugin.success(chatNotificationMuted.value ? '已关闭通知' : '已开启通知');
  } catch (e: any) {
    MessagePlugin.error(e?.message || '操作失败');
  }
}

/** 进入关联群组（频道的讨论组 / 讨论组的频道） */
function openLinkedGroup() {
  const linked = chatLinkedChatId.value;
  if (!linked) return;
  router.push({ name: 'chat-detail', params: { id: String(linked) } });
}

/** 取消订阅/退出频道或群组（带二级确认） */
function unsubscribeChat() {
  const title = chatTitle.value || '该频道';
  showConfirm(
    '取消订阅',
    `确定要取消订阅「${title}」吗？取消后将不再接收其消息。`,
    '取消订阅',
    async () => {
      const cid = chatId.value;
      if (!cid) return;
      try {
        await tdlibSend({ _: 'leaveChat', chat_id: cid });
        MessagePlugin.success('已取消订阅');
        cancelConfirmDialog();
        router.push('/home/chats');
      } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
      }
    },
  );
}

/** 频道/群组/秘密聊天「更多」选项菜单 */
function openChatMoreMenu(e: MouseEvent) {
  const menuItems: ContextMenuItem[] = [];

  if (isSecretChat.value) {
    // 秘密聊天：显示加密信息、删除聊天
    menuItems.push({
      key: 'delete-chat',
      label: '删除聊天',
      icon: Ban,
      danger: true,
      onClick: () => { /* TODO: 删除秘密聊天 */ },
    });
  } else {
    // 频道/群组：进入关联群组
    if (chatLinkedChatId.value) {
      menuItems.push({
        key: 'linked-group',
        label: '进入关联群组',
        icon: MessageSquareText,
        onClick: () => { openLinkedGroup(); },
      });
    }
    // 已加入/订阅时显示取消订阅（带二级提示）
    if (isChatJoined.value) {
      menuItems.push({ key: 'divider-chat', label: '', divider: true });
      menuItems.push({
        key: 'unsubscribe',
        label: '取消订阅',
        icon: LogOut,
        danger: true,
        onClick: () => { unsubscribeChat(); },
      });
    }
  }

  if (menuItems.length === 0) {
    MessagePlugin.info('暂无可用的更多选项');
    return;
  }
  openContextMenu(e.clientX, e.clientY, menuItems, e.currentTarget as HTMLElement);
}

// =====================================================================
// 自动删除设置弹窗
// =====================================================================
const autoDeleteVisible = ref(false);
const autoDeleteTime = ref<number>(0);
const autoDeleteOptions = [
  { value: 0, label: '关闭' },
  { value: 86400, label: '1 天后' },
  { value: 7 * 86400, label: '7 天后' },
  { value: 31 * 86400, label: '31 天后' },
];

async function openAutoDelete() {
  const cid = await getPrivateChatId();
  if (!cid) return;
  // 读取当前私聊的自动删除时间
  try {
    const chat = getReactiveChat(cid) as any;
    autoDeleteTime.value = chat?.message_auto_delete_time ?? 0;
  } catch {
    autoDeleteTime.value = 0;
  }
  closeContextMenu();
  autoDeleteVisible.value = true;
}

async function applyAutoDelete(seconds: number) {
  const cid = await getPrivateChatId();
  try {
    await tdlibSend({
      _: 'setChatMessageAutoDeleteTime',
      chat_id: cid,
      message_auto_delete_time: seconds,
    });
    autoDeleteTime.value = seconds;
    MessagePlugin.success('已更新自动删除设置');
    autoDeleteVisible.value = false;
  } catch (e: any) {
    MessagePlugin.error(e?.message || '设置失败');
  }
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
      } as any,
      share_phone_number: false,
    });
    MessagePlugin.success('联系人已保存');
    editContactVisible.value = false;
    loadData();
  } catch (e: any) {
    MessagePlugin.error(e?.message || '保存失败');
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
  confirmText: '确定',
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
      '拉黑',
      `确定要拉黑「${userName.value}」吗？拉黑后将无法收到对方的任何消息。`,
      '拉黑',
      async () => {
        try {
          await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: { _: 'messageSenderUser', user_id: userId.value },
            block_list: { _: 'blockListMain' },
          } as any);
          MessagePlugin.success('已拉黑');
          cancelConfirmDialog();
          loadData();
        } catch (e: any) {
          MessagePlugin.error(e?.message || '操作失败');
        }
      },
    );
  } else {
    showConfirm(
      '解除拉黑',
      `确定要解除对「${userName.value}」的拉黑吗？`,
      '解除拉黑',
      async () => {
        try {
          await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: { _: 'messageSenderUser', user_id: userId.value },
            block_list: null,
          } as any);
          MessagePlugin.success('已解除拉黑');
          cancelConfirmDialog();
          loadData();
        } catch (e: any) {
          MessagePlugin.error(e?.message || '操作失败');
        }
      },
    );
  }
}

/** 删除联系人（带二级确认） */
function onDeleteContact() {
  showConfirm(
    '删除联系人',
    `确定要将「${userName.value}」从联系人中删除吗？`,
    '删除',
    async () => {
      try {
        await tdlibSend({
          _: 'removeContacts',
          user_ids: [userId.value],
        });
        MessagePlugin.success('已删除联系人');
        cancelConfirmDialog();
        loadData();
      } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
      }
    },
  );
}

function retry() {
  loadData();
}

// 订阅 TDLib 推送更新（在线状态、资料变更等实时刷新），并加载数据
profileStore.initUserProfileUpdates();
watch([userId, chatMode], () => {
  if (userId.value > 0 || chatMode.value) {
    // 「归档动态」仅自己可见、「共同群组」仅他人可见；切到不适用的人时回到默认标签
    if (activeTab.value === 'archived' && (chatMode.value || isSelf.value)) {
      activeTab.value = 'stories';
    } else if (activeTab.value === 'groups' && (chatMode.value || isSelf.value)) {
      activeTab.value = 'stories';
    }
    loadData();
  }
}, { immediate: true });
</script>

<style scoped>
/* ===== 顶部头像/昵称区域（无背景色，随页面背景） ===== */
.profile-hero {
  min-height: 220px;
}
</style>
