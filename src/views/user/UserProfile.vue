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
              <span class="truncate">{{ userName }}</span>
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

            <!-- 操作按钮区（非自己时显示：发消息 / 通知 / 礼物 / 更多） -->
            <div v-if="!isSelf" class="mt-4 flex items-center gap-2.5">
              <!-- 发消息 -->
              <button type="button"
                class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors"
                @click="openPrivateChat">
                <Send class="w-4 h-4" />
                发消息
              </button>

              <!-- 通知（按下拉开的更多菜单里也能切换；这里开关通知） -->
              <button type="button" :title="isPrivateChatMuted ? '开启通知' : '关闭通知'"
                class="flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="toggleNotifications">
                <BellOff v-if="isPrivateChatMuted" class="w-4 h-4" />
                <Bell v-else class="w-4 h-4" />
              </button>

              <!-- 赠送礼物（暂未实现） -->
              <button type="button" title="赠送礼物"
                class="flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="onSendGift">
                <Gift class="w-4 h-4" />
              </button>

              <!-- 更多 -->
              <button type="button" title="更多"
                class="flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="openMoreMenu($event)">
                <MoreHorizontal class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- 频道/群组模式头像/名称/订阅数 -->
          <div v-else-if="chatObj" class="flex flex-col items-center pt-10 pb-5 px-4 text-gray-900 dark:text-gray-100">
            <!-- 头像 -->
            <div class="w-24 h-24 rounded-full overflow-hidden">
              <Avatar :photo="chatPhotoInfo" :title="chatTitle" :accentColorId="chatAccentColorId"
                sizeClass="!w-24 !h-24" no-background />
            </div>

            <!-- 名称 -->
            <h1 class="mt-3 text-2xl font-bold flex items-center gap-1.5 max-w-full">
              <span class="truncate">{{ chatTitle }}</span>
              <VerifiedFilledIcon v-if="isChatVerified" class="text-blue-500 text-lg" title="已验证"
                :fill-color='["currentColor", "transparent"]' :stroke-color='["currentColor", "#0052d9"]'
                :stroke-width="1.5" />
            </h1>

            <!-- 订阅/成员人数（在线时间改为订阅数） -->
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ chatMemberCountText }}
            </p>

            <!-- 操作按钮区（查看频道/群组 / 关闭通知 / 礼物 / 更多） -->
            <div class="mt-4 flex items-center gap-2.5">
              <!-- 查看频道 / 查看群组 -->
              <button type="button"
                class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors"
                @click="openChatChannel">
                <Eye class="w-4 h-4" />
                {{ isChatChannel ? '查看频道' : '查看群组' }}
              </button>

              <!-- 关闭通知 -->
              <button type="button" :title="chatNotificationMuted ? '开启通知' : '关闭通知'"
                class="flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="chatToggleNotifications">
                <BellOff v-if="chatNotificationMuted" class="w-4 h-4" />
                <Bell v-else class="w-4 h-4" />
              </button>

              <!-- Telegram 礼物（暂未实现） -->
              <button type="button" title="赠送礼物"
                class="flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="onSendGift">
                <Gift class="w-4 h-4" />
              </button>

              <!-- 更多 -->
              <button type="button" title="更多"
                class="flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                @click="openChatMoreMenu($event)">
                <MoreHorizontal class="w-4 h-4" />
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
                    <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ personalChatTitle
                    }}</span>
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

        <!-- ===== 第二部分（频道/群组模式）：介绍 / 用户名 / ID ===== -->
        <div v-if="chatMode" class="px-4 mt-4 space-y-2">
          <!-- 介绍 -->
          <div v-if="chatDescription"
            class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5">
            <InfoIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">{{ chatDescription
              }}</p>
              <p class="text-xs text-gray-400 mt-0.5">简介</p>
            </div>
          </div>

          <!-- 用户名（频道/群组名） -->
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

          <!-- ID -->
          <div
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
              <p class="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">{{ bioText }}</p>
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
                <CopyableText :text="'@' + primaryUsername" @click.stop />
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


        <!-- ===== 第四部分：底部功能导航栏（动态 / 归档动态 / 礼物） ===== -->
        <div v-if="hasBottomContent" class="px-4 mt-5">
          <div
            class="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-1 w-max">
            <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="activeTab === 'stories' ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="activeTab = 'stories'">动态</button>
            <!-- 归档标签只在“自己”/普通用户的资料页出现（getChatArchivedStories 需 can_edit_stories 权限，仅自己/管理员可拉） -->
            <button v-if="!chatMode && isSelf" type="button"
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="activeTab === 'archived' ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="activeTab = 'archived'">归档动态</button>
            <!-- 礼物标签仅普通用户资料页显示 -->
            <button v-if="!chatMode" type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="activeTab === 'gifts' ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="activeTab = 'gifts'">礼物</button>
          </div>
        </div>

        <!-- ===== 第五部分：媒体内容区（宫格） ===== -->
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
                  <img v-if="giftUrls[i]" :src="giftUrls[i]" class="w-full h-full object-cover" />
                  <Gift v-else class="text-3xl text-gray-400" />
                </div>
              </div>
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
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { user as TdUser, userFullInfo, profilePhoto, chatPhoto, receivedGift, story, chat, audio as TdAudio, birthdate, file, message, thumbnail, supergroup, basicGroup, supergroupFullInfo, basicGroupFullInfo, chatPhotoInfo } from "tdlib-types";
import Avatar from "../../components/chat/avatar.vue";
import CustomEmojiInline from "../../components/common/CustomEmojiInline.vue";
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
import { ensureChat, getReactiveUser, getReactiveChat, DELETED_ACCOUNT_LABEL } from "../../utils/senderInfo";
import { useAudioPlayerStore } from "../../store/audioPlayer";
import formatTime from "../../utils/formatTime";
import { openContextMenu, closeContextMenu } from "../../store/contextMenu";
import type { ContextMenuItem } from "../../components/contextMenu/types";
import { MessagePlugin } from "tdesign-vue-next";

// ===== 图标组件（lucide-vue-next，与项目其余部分一致） =====
import {
  ArrowLeft, Copy, Clock, MapPin, Gift, Bot, Play, Pause,
  Music, ChevronDown, Megaphone, ExternalLink, Send, Bell, BellOff,
  MoreHorizontal, TimerReset, Ban, UserPlus, UserMinus, X as XIcon,
  Eye, LogOut, MessageSquareText,
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
    return chatLoading.value || chatActiveStories.value.length > 0;
  }
  return isLoading.value || activeStoriesList.value.length > 0 || giftsList.value.length > 0;
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
const activeTab = ref<'stories' | 'archived' | 'gifts'>('stories');

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
/** 查看器项目列表（仅包含已加载出 src 的照片） */
const photoViewerItems = computed<MediaViewerItem[]>(() =>
  photosList.value
    .map((_, i) => photoUrls.value[i])
    .filter((src): src is string => !!src)
    .map((src) => ({ type: 'photo' as const, src })),
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

// ===== 礼物 URL =====
const giftUrls = ref<Record<number, string>>({});
async function loadGiftUrls() {
  const urls: Record<number, string> = {};
  for (let i = 0; i < giftsList.value.length; i++) {
    const g = giftsList.value[i];
    const sticker = (g.gift as any).sticker as { thumbnail?: { file?: { id?: number } } } | undefined;
    const thumbFile = sticker?.thumbnail?.file as any;
    if (thumbFile?.id) {
      const url = await downloadFileUrl(thumbFile, `gift_${i}.webp`, 'gift');
      if (url) urls[i] = url;
    }
  }
  giftUrls.value = urls;
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
  const url = storyUrlOf(s);
  if (!url) return;
  photoViewerIndex.value = 0;
  photoViewerItemsOverride.value = [{ type: 'photo', src: url }];
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
  giftUrls.value = {};
  await profileStore.loadProfile(userId.value);
  await Promise.all([
    loadHeaderPhoto(),
    loadProfileMusicCover(),
    loadPhotoUrls(),
    loadGiftUrls(),
    loadStoryUrls(),
    loadPhoneInfo(),
    loadChannelInfo(),
    refreshPrivateChatMuted(),
    ...commonGroupsList.value.map((id) => ensureChat(id).catch(() => { })),
  ]);
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

    // 主内容（标题/头像）已就绪，先结束加载态，让页面立即渲染；
    // 群组详情与动态在后台异步刷新，各自容错，不阻塞页面。
    chatLoaded.value = true;
    chatLoading.value = false;
    void loadChatGroupInfo();
    void loadChatStories();
    void refreshChatNotificationMuted();
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
    if (c.type._ === 'chatTypeSupergroup') {
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

/** 赠送礼物：礼物页面暂未实现，提示用户等待更新 */
function onSendGift() {
  MessagePlugin.info('暂未实现，请等待后续更新');
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

/** 频道/群组「更多」选项菜单 */
function openChatMoreMenu(e: MouseEvent) {
  const menuItems: ContextMenuItem[] = [];
  // 进入关联群组：仅当存在关联群组（讨论组）时显示
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
    if (!chatMode.value && !isSelf.value && activeTab.value === 'archived') {
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
