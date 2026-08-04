<template>
  <div class="h-full flex flex-col bg-[#f2f3f5] dark:bg-[#0f1114] text-gray-900 dark:text-gray-100 overflow-hidden">
    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
      <div class="max-w-2xl mx-auto pb-8" v-if="user">
        <!-- ===== 第一部分：顶部青绿色头部区域 ===== -->
        <div class="relative profile-hero overflow-hidden">
          <!-- 背景水波纹装饰 -->
          <div class="profile-hero-decoration" aria-hidden="true"></div>

          <!-- 返回导航 -->
          <button type="button" aria-label="返回"
            class="absolute top-2 left-2 z-10 w-9 h-9 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors"
            @click="goBack">
            <ArrowLeft class="w-6 h-6" />
          </button>

          <div class="flex flex-col items-center pt-10 pb-5 px-4 text-white">
            <!-- 头像 -->
            <button type="button" class="relative rounded-full focus:outline-none" title="点击查看照片"
              @click="openPhotoViewer(0)">
              <span class="block rounded-full ring-4 ring-white/90 shadow-lg">
                <div v-if="headerPhotoUrl" class="w-24 h-24 rounded-full overflow-hidden">
                  <img :src="headerPhotoUrl" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-24 h-24 rounded-full overflow-hidden">
                  <Avatar :photo="displayPhoto" :title="userName" :accentColorId="user.profile_accent_color_id"
                    sizeClass="!w-24 !h-24" />
                </div>
              </span>
            </button>

            <!-- 昵称 -->
            <h1 class="mt-3 text-2xl font-bold flex items-center gap-1.5 max-w-full">
              <span class="truncate">{{ userName }}</span>
              <span v-if="user.emoji_status" class="text-base" title="Emoji 状态">😀</span>
              <span v-if="user.is_premium" class="text-base" title="Telegram Premium">⭐</span>
              <span v-if="verificationType === 'verified'" class="text-blue-200 text-lg" title="已验证">✓</span>
            </h1>

            <!-- 在线状态（盾牌 + 文字） -->
            <p class="mt-1 text-sm text-white/90 flex items-center gap-1.5">
              <ShieldCheck class="w-4 h-4" />
              {{ statusText }}
            </p>

            <!-- 个性签名 / 音乐状态 -->
            <button type="button" v-if="profileAudio"
              class="mt-3 max-w-full flex items-center gap-1.5 text-sm text-white/90 hover:opacity-90 transition-opacity"
              @click="playProfileAudio">
              <Music class="w-4 h-4 shrink-0" />
              <span class="truncate">{{ profileAudioTitle }} - {{ profileAudioPerformer }}</span>
              <ChevronRight class="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>

        <!-- ===== 第二部分：频道订阅及推送卡片区域 ===== -->
        <div class="px-4">
          <!-- 频道订阅状态栏 -->
          <div class="flex items-center gap-2 py-2">
            <span class="text-sm text-gray-500 dark:text-gray-400">频道</span>
            <button v-if="personalChatId" type="button"
              class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-500 text-white text-xs font-medium hover:bg-teal-600 transition-colors"
              @click="openPersonalChat">
              {{ channelMemberText }}
              <ChevronDown class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- 最新推送卡片 -->
          <button v-if="channelLastMessage" type="button" @click="openPersonalChat"
            class="w-full text-left rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3 shadow-sm hover:shadow-md transition-shadow">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 shrink-0">
                <Avatar :photo="personalChatPhoto" :title="personalChatTitle" :accentColorId="personalChatAccent"
                  sizeClass="!w-10 !h-10" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-bold text-gray-900 dark:text-gray-100 truncate flex items-center gap-1">
                    {{ personalChatTitle }}
                    <Megaphone class="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </p>
                  <span class="text-[11px] text-gray-400 shrink-0">{{ channelPostTime }}</span>
                </div>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 whitespace-pre-wrap">
                  {{ channelPreviewText }}
                </p>
              </div>
            </div>
          </button>
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
              <p class="text-sm text-gray-800 dark:text-gray-100 select-all">{{ phoneDisplay || user.phone_number }}</p>
              <p class="text-xs text-gray-400">手机号码</p>
            </div>
          </div>

          <!-- 3.3 用户名（主用户名黑色，点击整卡复制主用户名；附加用户名蓝色高亮可点击复制） -->
          <div
            class="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            :title="primaryUsername ? `点击复制 @${primaryUsername}` : undefined"
            @click="primaryUsername && copyText('@' + primaryUsername)">
            <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <!-- 主用户名：黑色，不省略 -->
              <p v-if="primaryUsername"
                class="text-sm font-bold text-gray-900 dark:text-gray-100 select-all wrap-break-word leading-snug">
                @{{ primaryUsername }}
              </p>
              <!-- 附加用户名：蓝色高亮，逐个可点击复制 -->
              <p v-if="additionalUsernames.length" class="mt-0.5 text-xs wrap-break-word leading-relaxed">
                <button v-for="(u, i) in additionalUsernames" :key="u" type="button"
                  class="text-blue-500 dark:text-blue-400 hover:underline" :title="`点击复制 @${u}`"
                  @click.stop="copyText('@' + u)">
                  {{ i > 0 ? ', ' : '' }}@{{ u }}
                </button>
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
              <p class="text-sm text-gray-800 dark:text-gray-100 select-all">{{ user.id }}</p>
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
            <button v-if="isSelf" type="button"
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
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
          <div v-else-if="activeTab === 'archived' && isSelf"
            class="py-6 text-center text-sm text-gray-400">
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
import type { user as TdUser, userFullInfo, profilePhoto, chatPhoto, receivedGift, story, chat, audio as TdAudio, birthdate, file, message } from "tdlib-types";
import Avatar from "../components/chat/avatar.vue";
import MediaViewer from "../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import type { MediaViewerItem } from "../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import { useUserProfileStore } from "../store/userProfile";
import { useUserStore } from "../store/user";
import { confirmAndOpenExternalLink } from "../utils/openExternalLink";
import formatStatus from "../utils/status";
import { downloadFileUrl } from "../utils/profileMedia";
import { formatBusinessHours } from "../utils/businessHours";
import { tdlibSend } from "../utils/tdlib";
import { ensureChat, getReactiveUser, getReactiveChat } from "../utils/senderInfo";
import { useAudioPlayerStore } from "../store/audioPlayer";
import formatTime from "../utils/formatTime";

// ===== 图标组件（lucide-vue-next，与项目其余部分一致） =====
import {
  ArrowLeft, Copy, Clock, MapPin, Gift, Bot, ChevronRight,
  ShieldCheck, Music, ChevronDown, Megaphone, ExternalLink,
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

// ===== 展示用头像（优先用户资料头像，Avatar 组件负责无头像时的首字母渐变） =====
const displayPhoto = computed<profilePhoto | undefined>(() => user.value?.profile_photo);

/** 头部大图 URL（使用全量照片的最大尺寸） */
const headerPhotoUrl = ref<string | undefined>(undefined);
async function loadHeaderPhoto() {
  headerPhotoUrl.value = undefined;
  const info = fullInfo.value;
  const biggest = pickLargestPhotoFile(info?.photo);
  if (biggest) {
    headerPhotoUrl.value = await downloadFileUrl(biggest, `profile_header_${biggest.id}.jpg`);
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
    const url = await downloadFileUrl(biggest, `profile_photo_${i}.jpg`);
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
      const url = await downloadFileUrl(thumbFile, `gift_${i}.webp`);
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
      const url = await downloadFileUrl(file, `story_${s.id}.jpg`);
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
  photoViewerItemsOverride.value = [{ type: 'photo' as const, src: storyUrls.value[s.id] }];
  photoViewerVisible.value = true;
}

// ===== 数据加载 =====
async function loadData() {
  photoUrls.value = {};
  giftUrls.value = {};
  await profileStore.loadProfile(userId.value);
  await Promise.all([
    loadHeaderPhoto(),
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

async function playProfileAudio() {
  const audio = profileAudio.value;
  if (!audio) return;
  try {
    const audioFile = (audio as any).audio as file | undefined;
    if (!audioFile?.id) return;
    const url = await downloadFileUrl(audioFile, `${audio.title || 'profile_audio'}.mp3`);
    if (!url) return;
    // 构造最小 message 供播放器使用
    const fakeMsg = {
      id: 0,
      chat_id: 0,
      date: Math.floor(Date.now() / 1000),
      sender_id: { _: "messageSenderUser", user_id: userId.value },
      content: {
        _: "messageAudio",
        audio: {
          ...audio,
          audio: { ...audioFile, local: { is_downloading_completed: true, path: audioFile.id } },
        } as any,
      },
    } as any;
    await audioPlayer.playMessageAudio(fakeMsg);
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
/* ===== 顶部青绿色头部区域 ===== */
.profile-hero {
  background: linear-gradient(160deg, #6fd3c9 0%, #4db6ac 55%, #3aa49a 100%);
  min-height: 300px;
}

/* 背景水波纹 / 云朵装饰 */
.profile-hero-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.55;
  background-image:
    radial-gradient(circle at 18% 78%, rgba(255, 255, 255, 0.5) 0, rgba(255, 255, 255, 0.5) 46px, transparent 46px),
    radial-gradient(circle at 78% 82%, rgba(255, 255, 255, 0.4) 0, rgba(255, 255, 255, 0.4) 60px, transparent 60px),
    radial-gradient(circle at 88% 60%, rgba(255, 255, 255, 0.35) 0, rgba(255, 255, 255, 0.35) 34px, transparent 34px),
    radial-gradient(circle at 12% 62%, rgba(255, 255, 255, 0.25) 0, rgba(255, 255, 255, 0.25) 28px, transparent 28px),
    radial-gradient(circle at 96% 90%, rgba(255, 255, 255, 0.45) 0, rgba(255, 255, 255, 0.45) 42px, transparent 42px);
}
</style>
