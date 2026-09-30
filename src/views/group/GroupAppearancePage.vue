<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_edit_channel_color') }}</h2>
      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-500 shrink-0">
        {{ t('lng_boost_level', { count: boostLevel }) }}
      </span>
      <button type="button" @click="save" :disabled="saving"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
        {{ t('lng_settings_save') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <!-- 当前 Boost -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3">
            <ZapIcon class="w-5 h-5 text-amber-500 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_boosts_title') }}</p>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ t('lng_boost_level', { count: boostLevel }) }}
                <template v-if="nextLevelBoostCount > 0">
                  · {{ t('lng_boosts_next_level') }}: {{ nextLevelBoostCount }}
                </template>
              </p>
            </div>
          </div>
        </section>

        <!-- 名称色 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_admin_log_change_color') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <p class="mt-2 text-xs text-gray-400">{{ t('lng_boost_channel_needs_level_color', { count: 1 }) }}</p>
          <div class="mt-4 grid grid-cols-6 sm:grid-cols-8 gap-3">
            <div v-for="id in nameColorIds" :key="`name-${id}`" class="flex flex-col items-center gap-1">
              <button type="button"
                class="relative w-10 h-10 rounded-full border-2 transition-transform hover:scale-105"
                :class="[
                  nameColorId === id ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-transparent',
                  nameColorLocked(id) ? 'opacity-40' : '',
                ]"
                :style="{ background: accentColorStyle(id).color }"
                @click="pickNameColor(id)">
                <LockIcon v-if="nameColorLocked(id)" class="w-3.5 h-3.5 absolute inset-0 m-auto text-white drop-shadow" />
              </button>
              <span v-if="nameColorLevel(id) > 0" class="text-[10px] text-gray-400">
                {{ t('lng_edit_channel_level_min').includes('1') ? t('lng_boost_level', { count: nameColorLevel(id) }) : t('lng_boost_level', { count: nameColorLevel(id) }) }}
              </span>
            </div>
          </div>
        </section>

        <!-- 资料封面色 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_admin_log_change_profile_color') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <p class="mt-2 text-xs text-gray-400">
            {{ t(isChannel ? 'lng_feature_profile_color_channel' : 'lng_feature_profile_color_group', { count: profileColorIds.length }) }}
          </p>
          <div class="mt-4 grid grid-cols-6 sm:grid-cols-8 gap-3">
            <div class="flex flex-col items-center gap-1">
              <button type="button"
                class="w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs text-gray-400 bg-gray-100 dark:bg-gray-800"
                :class="profileColorId < 0 ? 'border-blue-500' : 'border-transparent'"
                @click="profileColorId = -1">—</button>
            </div>
            <div v-for="id in profileColorIds" :key="`prof-${id}`" class="flex flex-col items-center gap-1">
              <button type="button"
                class="relative w-10 h-10 rounded-full border-2 transition-transform hover:scale-105"
                :class="[
                  profileColorId === id ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-transparent',
                  profileColorLocked(id) ? 'opacity-40' : '',
                ]"
                :style="{ background: accentAvatarBackground(id) }"
                @click="pickProfileColor(id)">
                <LockIcon v-if="profileColorLocked(id)" class="w-3.5 h-3.5 absolute inset-0 m-auto text-white drop-shadow" />
              </button>
              <span v-if="profileColorLevel(id) > 0" class="text-[10px] text-gray-400">
                {{ t('lng_boost_level', { count: profileColorLevel(id) }) }}
              </span>
            </div>
          </div>
        </section>

        <!-- Emoji 状态 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_edit_channel_status') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center gap-3"
            :class="emojiStatusLocked ? 'opacity-60' : ''">
            <SmileIcon class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                {{ t('lng_feature_emoji_status') }}
                <LockIcon v-if="emojiStatusLocked" class="w-3.5 h-3.5 text-gray-400" />
              </p>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ emojiStatusLocked
                  ? t('lng_boost_channel_needs_level_status', { count: minEmojiStatus })
                  : t(isChannel ? 'lng_edit_channel_status_about' : 'lng_edit_channel_status_about_group') }}
              </p>
            </div>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 shrink-0">
              {{ t('lng_boost_level', { count: minEmojiStatus }) }}
            </span>
          </div>
        </section>

        <!-- 壁纸 -->
        <section>
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t(isChannel ? 'lng_edit_channel_wallpaper' : 'lng_edit_channel_wallpaper_group') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center gap-3"
            :class="wallpaperLocked ? 'opacity-60' : ''">
            <ImageIcon class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                {{ t(isChannel ? 'lng_edit_channel_wallpaper' : 'lng_edit_channel_wallpaper_group') }}
                <LockIcon v-if="wallpaperLocked" class="w-3.5 h-3.5 text-gray-400" />
              </p>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ wallpaperLocked
                  ? t('lng_boost_channel_needs_level_wallpaper', { count: minWallpaper })
                  : t(isChannel ? 'lng_edit_channel_wallpaper_about' : 'lng_edit_channel_wallpaper_about_group') }}
              </p>
            </div>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 shrink-0">
              {{ t('lng_boost_level', { count: minWallpaper }) }}
            </span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ChevronLeft as ChevronLeftIcon,
  Lock as LockIcon,
  Zap as ZapIcon,
  Smile as SmileIcon,
  Image as ImageIcon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend } from '../../utils/tdlib';
import { accentColorStyle, accentAvatarBackground, useColors } from '../../store/colors';
import { loadMyChatMemberStatus, isChannelChat } from '../../utils/groupRights';
import { loadChatBoostInfo, minCustomBackgroundLevel, minEmojiStatusLevel } from '../../utils/chatBoost';
import type { chat, chatBoostFeatures, accentColor, profileAccentColor } from 'tdlib-types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { availableIds, profileAvailableIds, accentColors, profileAccentColors } = useColors();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chat = ref<chat | undefined>();
const nameColorId = ref(5);
const profileColorId = ref(-1);
const saving = ref(false);
const snapshotName = ref(5);
const snapshotProfile = ref(-1);

const isDirty = computed(
  () => nameColorId.value !== snapshotName.value || profileColorId.value !== snapshotProfile.value,
);
const boostLevel = ref(0);
const nextLevelBoostCount = ref(0);
const boostFeatures = ref<chatBoostFeatures | null>(null);

const isChannel = computed(() => isChannelChat(chat.value));
const minEmojiStatus = computed(() => minEmojiStatusLevel(boostFeatures.value));
const minWallpaper = computed(() => minCustomBackgroundLevel(boostFeatures.value));
const emojiStatusLocked = computed(() => boostLevel.value < minEmojiStatus.value);
const wallpaperLocked = computed(() => boostLevel.value < minWallpaper.value);

const nameColorIds = computed(() => {
  const ids = availableIds.value?.length ? [...availableIds.value] : [0, 1, 2, 3, 4, 5, 6];
  return [...new Set(ids)].sort((a, b) => a - b);
});
const profileColorIds = computed(() => {
  const ids = profileAvailableIds.value?.length ? [...profileAvailableIds.value] : [0, 1, 2, 3, 4, 5, 6];
  return [...new Set(ids)].sort((a, b) => a - b);
});

function nameColorLevel(id: number): number {
  if (id >= 0 && id <= 6) return 0;
  const entry = accentColors.get(id) as accentColor | undefined;
  return entry?.min_channel_chat_boost_level ?? 0;
}
function nameColorLocked(id: number): boolean {
  return nameColorLevel(id) > boostLevel.value;
}
function profileColorLevel(id: number): number {
  if (id >= 0 && id <= 6) return 0;
  const entry = profileAccentColors.get(id) as profileAccentColor | undefined;
  return (isChannel.value ? entry?.min_channel_chat_boost_level : entry?.min_supergroup_chat_boost_level) ?? 0;
}
function profileColorLocked(id: number): boolean {
  return profileColorLevel(id) > boostLevel.value;
}

function pickNameColor(id: number) {
  if (nameColorLocked(id)) {
    MessagePlugin.warning(t('lng_boost_channel_needs_level_color', { count: nameColorLevel(id) }));
    return;
  }
  nameColorId.value = id;
}
function pickProfileColor(id: number) {
  if (id >= 0 && profileColorLocked(id)) {
    MessagePlugin.warning(t('lng_boost_channel_needs_level_color', { count: profileColorLevel(id) }));
    return;
  }
  profileColorId.value = id;
}

function goBack() {
  // Unigram ProfileColor：未保存更改时确认
  if (isDirty.value && !window.confirm(t('lng_forum_discard_sure'))) return;
  router.back();
}

async function reload() {
  const { chat: c } = await loadMyChatMemberStatus(chatId.value);
  chat.value = c;
  nameColorId.value = c?.accent_color_id ?? 5;
  profileColorId.value = c?.profile_accent_color_id ?? -1;
  snapshotName.value = nameColorId.value;
  snapshotProfile.value = profileColorId.value;
  const boost = await loadChatBoostInfo(c);
  boostLevel.value = boost.level;
  nextLevelBoostCount.value = boost.nextLevelBoostCount;
  boostFeatures.value = boost.features;
}

async function save() {
  saving.value = true;
  try {
    await tdlibSend({
      _: 'setChatAccentColor',
      chat_id: chatId.value,
      accent_color_id: nameColorId.value,
      background_custom_emoji_id: 0,
    });
    await tdlibSend({
      _: 'setChatProfileAccentColor',
      chat_id: chatId.value,
      profile_accent_color_id: profileColorId.value,
      profile_background_custom_emoji_id: 0,
    });
    MessagePlugin.success(t('lng_settings_save'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  } finally {
    saving.value = false;
  }
}

watch(() => route.params.id, () => {
  if (hasChatId.value) void reload();
});

onMounted(() => {
  if (hasChatId.value) void reload();
});
</script>
