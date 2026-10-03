<template>
  <!-- 与 ChatDetail 一致：专属背景或关闭全屏显示时叠壁纸层，否则透出 HomeView 默认壁纸 -->
  <div class="h-full relative overflow-hidden chat-wallpaper-root flex flex-col" :style="rootStyle">
    <template v-if="drawsOwnWallpaper">
      <div class="absolute inset-0 pointer-events-none chat-wallpaper-layer" :style="chatWallpaperLayerStyle"></div>
      <div class="absolute inset-0 pointer-events-none chat-wallpaper-overlay"
        :style="[chatWallpaperOverlayStyle, { background: 'var(--app-bg-elevated, #fff)' }]"></div>
    </template>

    <!-- 顶栏 -->
    <div
      class="relative z-10 p-3 border-b border-gray-200/60 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <Avatar :photo="chat?.photo" :title="chat?.title" :accentColorId="chatAccent" sizeClass="!w-8 !h-8" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ chat?.title || '' }}</p>
        <p class="text-xs text-gray-400">{{ t('lng_admin_log_title_all') }}</p>
      </div>
      <button type="button" class="px-3 py-1.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"
        @click="filterVisible = true">
        {{ t('lng_admin_log_filter') }}
      </button>
    </div>

    <!-- 聊天式时间线：最新在底部，向上滚动加载更早（Unigram EventLog） -->
    <div ref="scrollEl" class="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar" v-smooth-wheel
      @scroll="onScroll">
      <div class="mx-auto max-w-3xl px-4 py-4 space-y-1">
        <div v-if="loadingMore" class="py-2 text-center text-xs text-gray-500 dark:text-gray-400">
          {{ t('lng_context_seen_loading') }}
        </div>
        <div v-else-if="!hasMore && items.length > 0" class="py-2 text-center text-[11px] text-gray-400">
          {{ t('lng_admin_log_about') }}
        </div>

        <!-- 旧 → 新，全部左对齐（Unigram：均视为 incoming） -->
        <div v-for="item in items" :key="item.id" class="space-y-0.5">
          <!-- 居中服务胶囊（特殊显示） -->
          <div v-if="item.kind !== 'rights'" class="relative flex justify-center my-0.5">
            <MessageContent :content="item.serviceMessage.content" :date="item.date"
              :senderName="serviceSenderName" :chatId="chatId" />
          </div>

          <!-- 左对齐消息气泡：用户头像 + 昵称 + 正文 -->
          <div v-if="item.bubbleMessage" class="flex justify-start mb-1.5">
            <div class="w-9 shrink-0 mr-2 self-end">
              <Avatar :photo="item.bubbleSender?.photo" :title="item.bubbleSender?.name"
                :accentColorId="item.bubbleSender?.accentId" :deletedAccount="item.bubbleSender?.deleted"
                sizeClass="!w-9 !h-9" />
            </div>
            <div class="flex min-w-0 max-w-[75%] flex-col items-start">
              <div
                class="relative px-2 py-1.5 shadow-sm max-w-full min-w-30 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg">
                <p class="msg-sender-name text-xs font-semibold mb-0.5" :style="senderNameStyle(item)">
                  {{ item.bubbleSender?.name }}
                </p>
                <MessageContent :content="item.bubbleMessage.content" :isSelf="false" :date="item.bubbleMessage.date"
                  :chatId="chatId" :messageId="item.bubbleMessage.id" :message="item.bubbleMessage"
                  :senderName="item.bubbleSender?.name" :accentColorId="item.bubbleSender?.accentId"
                  :inlineTime="true" :isFirstInGroup="true" :isLastInGroup="true" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="loading" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ t('lng_context_seen_loading') }}
        </div>
        <div v-else-if="items.length === 0" class="py-12 text-center">
          <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ t('lng_admin_log_no_events_title') }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-line">
            {{ isChannel ? t('lng_admin_log_no_events_text_channel') : t('lng_admin_log_no_events_text') }}
          </p>
        </div>
      </div>
    </div>

    <!-- 筛选 -->
    <Teleport to="body">
      <div v-if="filterVisible" class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="filterVisible = false">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div
          class="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#1f2937] shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ t('lng_admin_log_filter_title') }}</h3>
            <button type="button"
              class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="filterVisible = false">
              <XIcon class="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-2">
            <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_admin_log_filter_actions_type_subtitle') }}
            </div>
            <label v-for="row in filterRows" :key="row.key"
              class="flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <div class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100">{{ row.label }}</div>
              <ToggleSwitch v-model="(filters as any)[row.key]" />
            </label>
          </div>
          <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button type="button" class="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600"
              @click="applyFilters">
              {{ t('lng_settings_save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronLeft as ChevronLeftIcon, X as XIcon } from 'lucide-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import MessageContent from '../../components/chat/ChatDetail/MessageContent/index.vue';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { tdlibSend } from '../../utils/tdlib';
import {
  defaultEventLogFilters,
  ensureEventPeers,
  ensureLinkedChats,
  buildChatEventItem,
  type EventLogItem,
} from '../../utils/eventLogText';
import { isChannelChat, loadMyChatMemberStatus } from '../../utils/groupRights';
import { useChatWallpaper } from '../../composables/useChatWallpaper';
import { accentColorStyle } from '../../store/colors';
import type { chat, chatEvent } from 'tdlib-types';

const SCROLL_PREFETCH_PX = 220;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chatRef = ref<chat | undefined>();
const chat = computed(() => chatRef.value);
const items = ref<EventLogItem[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const hasMore = ref(true);
const filterVisible = ref(false);
const minEventId = ref<string>('0');
const filters = reactive(defaultEventLogFilters());
const scrollEl = ref<HTMLElement | null>(null);

const isChannel = computed(() => isChannelChat(chat.value));
const chatAccent = computed(() => {
  const c = chat.value as any;
  return c?.accent_color_id ?? c?.profile_accent_color_id;
});

const {
  drawsOwnWallpaper,
  chatWallpaperLayerStyle,
  chatWallpaperOverlayStyle,
  rootStyle,
} = useChatWallpaper(chat);

const serviceSenderName = computed(() => chat.value?.title || '');

const filterRows = computed(() => [
  { key: 'member_promotions', label: t('lng_admin_log_filter_admins_new') },
  { key: 'member_restrictions', label: t('lng_admin_log_filter_restrictions') },
  { key: 'member_joins', label: t(isChannel.value ? 'lng_admin_log_filter_subscribers_new' : 'lng_admin_log_filter_members_new') },
  { key: 'member_leaves', label: t(isChannel.value ? 'lng_admin_log_filter_subscribers_removed' : 'lng_admin_log_filter_members_removed') },
  { key: 'info_changes', label: t(isChannel.value ? 'lng_admin_log_filter_info_channel' : 'lng_admin_log_filter_info_group') },
  { key: 'message_edits', label: t('lng_admin_log_filter_messages_edited') },
  { key: 'message_deletions', label: t('lng_admin_log_filter_messages_deleted') },
  { key: 'message_pins', label: t('lng_admin_log_filter_messages_pinned') },
  { key: 'invite_link_changes', label: t('lng_admin_log_filter_invite_links') },
  { key: 'video_chat_changes', label: t(isChannel.value ? 'lng_admin_log_filter_voice_chats_channel' : 'lng_admin_log_filter_voice_chats') },
  { key: 'forum_changes', label: t('lng_admin_log_filter_topics') },
  { key: 'setting_changes', label: t('lng_admin_log_filter_actions_settings_section') },
]);

function senderNameStyle(item: EventLogItem) {
  const id = item.bubbleSender?.accentId;
  if (id == null) return undefined;
  return { color: accentColorStyle(Number(id)).text };
}

function goBack() {
  router.back();
}

async function applyFilters() {
  filterVisible.value = false;
  await reload();
}

function scrollToBottom() {
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function reload() {
  loading.value = true;
  items.value = [];
  hasMore.value = true;
  minEventId.value = '0';
  try {
    const { chat: c } = await loadMyChatMemberStatus(chatId.value);
    chatRef.value = c;
    await fetchLatest();
  } catch (e) {
    console.error('EventLog load failed', e);
  } finally {
    loading.value = false;
    await nextTick();
    scrollToBottom();
  }
}

/** TDLib 返回新→旧；展示为旧→新（聊天式，最新在底） */
async function fetchLatest() {
  const res = await tdlibSend({
    _: 'getChatEventLog',
    chat_id: chatId.value,
    query: '',
    from_event_id: '0',
    limit: 50,
    filters: { ...filters } as any,
    user_ids: [],
  });
  const events = (res as { events?: chatEvent[] }).events ?? [];
  await ensureEventPeers(events);
  await ensureLinkedChats(events);
  const mapped = events.map((e) => buildChatEventItem(t, e, isChannel.value, chatId.value));
  // 旧 → 新
  items.value = [...mapped].reverse();
  if (events.length > 0) {
    minEventId.value = String(events[events.length - 1]!.id);
  }
  if (events.length < 50) hasMore.value = false;
}

/** 向上滚动加载更早事件，插入顶部并保持视口 */
async function loadOlder() {
  if (loadingMore.value || !hasMore.value || items.value.length === 0) return;
  loadingMore.value = true;
  try {
    const el = scrollEl.value;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;

    const res = await tdlibSend({
      _: 'getChatEventLog',
      chat_id: chatId.value,
      query: '',
      from_event_id: minEventId.value,
      limit: 50,
      filters: { ...filters } as any,
      user_ids: [],
    });
    const events = (res as { events?: chatEvent[] }).events ?? [];
    await ensureEventPeers(events);
    await ensureLinkedChats(events);
    const mapped = events.map((e) => buildChatEventItem(t, e, isChannel.value, chatId.value));
    // 更早事件插入顶部（仍保持旧→新）
    items.value = [...mapped].reverse().concat(items.value);
    if (events.length > 0) {
      minEventId.value = String(events[events.length - 1]!.id);
    }
    if (events.length < 50) hasMore.value = false;

    await nextTick();
    if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
  } catch (e) {
    console.error('EventLog loadOlder failed', e);
    hasMore.value = false;
  } finally {
    loadingMore.value = false;
  }
}

/** 聊天式：靠近顶部时加载更早 */
function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  if (el.scrollTop <= SCROLL_PREFETCH_PX) {
    void loadOlder();
  }
}

watch(() => route.params.id, () => {
  if (hasChatId.value) void reload();
});

onMounted(() => {
  if (hasChatId.value) void reload();
  else loading.value = false;
});
</script>

<style scoped>
.chat-wallpaper-layer,
.chat-wallpaper-overlay {
  z-index: 0;
}
</style>
