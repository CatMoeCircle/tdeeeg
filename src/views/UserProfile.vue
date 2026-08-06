<template>
  <div class="h-full flex flex-col text-gray-900 dark:text-gray-100 overflow-hidden">
    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
      <div class="max-w-2xl mx-auto pb-8" v-if="user">
        <!-- ===== 第一部分：顶部青绿色头部区域 ===== -->
        <div class="relative profile-hero overflow-hidden">
          <!-- 返回导航 -->
          <button type="button" aria-label="返回"
            class="absolute top-2 left-2 z-10 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="goBack">
            <ArrowLeft class="w-6 h-6" />
          </button>

          <div class="flex flex-col items-center pt-10 pb-5 px-4 text-gray-900 dark:text-gray-100">
            <!-- 头像 -->
            <button type="button" class="relative rounded-full focus:outline-none" title="点击查看照片"
              @click="openPhotoViewer(0)">
              <span class="block rounded-full">
                <div v-if="headerPhotoUrl" class="w-24 h-24 rounded-full overflow-hidden">
                  <img :src="headerPhotoUrl" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-24 h-24 rounded-full overflow-hidden">
                  <Avatar :photo="displayPhoto" :title="userName" :accentColorId="user.profile_accent_color_id"
                    sizeClass="!w-24 !h-24" no-background />
                </div>
              </span>
            </button>

            <!-- 昵称 -->
            <h1 class="mt-3 text-2xl font-bold flex items-center gap-1.5 max-w-full">
              <span class="truncate">{{ userName }}</span>
              <CustomEmojiInline v-if="customEmojiId" :emojiId="customEmojiId" :size="22" fallback-text="😀" />
              <!-- 有自定义 emoji 状态时不显示星星，仅无自定义 emoji 状态时显示 Premium 星星 -->
              <span v-if="user.is_premium && !user.emoji_status" class="text-base" title="Telegram Premium">⭐</span>
              <span v-if="verificationType === 'verified'" class="text-blue-500 text-lg" title="已验证">✓</span>
            </h1>

            <!-- 在线状态 -->
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ statusText }}
            </p>
          </div>
        </div>

        <!-- ===== 第二部分：音乐卡片 + 频道订阅卡片（同一父级） ===== -->
        <div class="px-4">
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

        <!-- ===== 第三部分：个人信息列表卡片 ===== -->
        <div class="px-4 mt-4 space-y-2">
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
          <div v-if="user.phone_number"
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
          <div
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
                <CopyableText :text="String(user.id)" @click.stop />
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
        <div class="px-4 mt-5">
          <div
            class="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-1 w-max">
            <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="activeTab === 'stories' ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="activeTab = 'stories'">动态</button>
            <!-- 归档标签只在“自己”的资料页出现（getChatArchivedStories 需 can_edit_stories 权限，仅自己/管理员可拉） -->
            <button v-if="isSelf" type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="activeTab === 'archived' ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="activeTab = 'archived'">归档动态</button>
            <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="activeTab === 'gifts' ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="activeTab = 'gifts'">礼物</button>
          </div>
        </div>

        <!-- ===== 第五部分：媒体内容区（宫格） ===== -->
        <div class="px-4 mt-3">
          <!-- 动态区 -->
          <div v-if="activeTab === 'stories'" class="py-6 text-center text-sm text-gray-400">
            <p v-if="isLoading">正在加载动态…</p>
            <p v-else-if="activeStoriesList.length === 0">暂无动态</p>
            <div v-else class="grid grid-cols-3 gap-1.5">
              <button v-for="s in activeStoriesList" :key="s.id" type="button"
                class="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700 relative"
                @click="openStory(s)">
                <img v-if="storyUrl(s)" :src="storyUrl(s)" class="w-full h-full object-cover" />
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

          <!-- 归档动态区（仅自己） -->
          <div v-else-if="activeTab === 'archived' && isSelf" class="py-6 text-center text-sm text-gray-400">
            <p v-if="isLoading">正在加载动态…</p>
            <p v-else-if="archivedStoriesList.length === 0">暂无归档动态</p>
            <div v-else class="grid grid-cols-3 gap-1.5">
              <button v-for="s in archivedStoriesList" :key="s.id" type="button"
                class="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700 relative"
                @click="openStory(s)">
                <img v-if="storyUrl(s)" :src="storyUrl(s)" class="w-full h-full object-cover" />
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

          <!-- 礼物区 -->
          <div v-else-if="activeTab === 'gifts'" class="py-6 text-center text-sm text-gray-400">
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

        <!-- ===== 加载 / 错误状态 ===== -->
        <div v-if="isLoading" class="flex items-center justify-center py-16 text-gray-400 text-sm">
          正在加载资料…
        </div>
        <div v-else-if="hasError" class="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p>无法加载该用户的资料</p>
          <button type="button" class="mt-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
            @click="retry">
            重试
          </button>
        </div>

        <!-- ===== 照片查看器（复用 MediaViewer，左右切换；动态也走这里） ===== -->
        <MediaViewer :visible="photoViewerVisible" :items="viewerItems" :initial-index="photoViewerIndex"
          :source-rect="null" @close="closePhotoViewer" />
      </div>

      <!-- 用户不存在 -->
      <div v-else class="flex items-center justify-center py-16 text-gray-400 text-sm">
        未找到该用户
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { user as TdUser, userFullInfo, profilePhoto, chatPhoto, receivedGift, story, chat, audio as TdAudio, birthdate, file, message, thumbnail } from "tdlib-types";
import Avatar from "../components/chat/avatar.vue";
import CustomEmojiInline from "../components/chat/ChatDetail/MessageContent/CustomEmojiInline.vue";
import MediaViewer from "../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import type { MediaViewerItem } from "../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import { useUserProfileStore } from "../store/userProfile";
import { useUserStore } from "../store/user";
import { accentColorStyle, rgbToCss } from "../store/colors";
import { confirmAndOpenExternalLink } from "../utils/openExternalLink";
import formatStatus from "../utils/status";
import { downloadFileUrl } from "../utils/profileMedia";
import { formatBusinessHours } from "../utils/businessHours";
import { isThumbnailImgRenderable } from "../utils/thumbnail";
import { tdlibSend } from "../utils/tdlib";
import { ensureChat, getReactiveUser, getReactiveChat } from "../utils/senderInfo";
import { useAudioPlayerStore } from "../store/audioPlayer";
import formatTime from "../utils/formatTime";

// ===== 图标组件（lucide-vue-next，与项目其余部分一致） =====
import {
  ArrowLeft, Copy, Clock, MapPin, Gift, Bot, Play, Pause,
  Music, ChevronDown, Megaphone, ExternalLink,
  Info as InfoIcon, Phone as PhoneIcon, AtSign as AtSignIcon,
  Calendar as CalendarIcon, IdCard as IdCardIcon,
} from "lucide-vue-next";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const profileStore = useUserProfileStore();
const audioPlayer = useAudioPlayerStore();

const userId = computed(() => Number(route.params.id));

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

// ===== 派生属性 =====
const userName = computed(() => `${user.value?.first_name ?? ''} ${user.value?.last_name ?? ''}`.trim() || '未知用户');
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
const statusText = computed(() => formatStatus(user.value?.status));

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

/** 动态封面 URL（已下载则返回，否则空字符串） */
function storyUrl(s: story): string {
  return storyUrls.value[s.id] || '';
}

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
  if (!storyUrls.value[s.id]) return;
  photoViewerIndex.value = 0;
  photoViewerItemsOverride.value = [{ type: 'photo', src: storyUrls.value[s.id] }];
  photoViewerVisible.value = true;
}

// ===== 数据加载 =====
async function loadData() {
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
    ...commonGroupsList.value.map((id) => ensureChat(id).catch(() => { })),
  ]);
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

function retry() {
  loadData();
}

// 订阅 TDLib 推送更新（在线状态、资料变更等实时刷新），并加载数据
profileStore.initUserProfileUpdates();
watch(userId, () => {
  if (userId.value > 0) {
    // 归档 tab 仅自己可见：切到他人资料页时若停留在归档，回退到「动态」
    if (!isSelf.value && activeTab.value === 'archived') {
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
