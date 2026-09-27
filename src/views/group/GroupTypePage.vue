<template>
  <div class="h-full flex flex-col bg-white dark:bg-gray-900">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ isChannel ? t('lng_manage_peer_channel_type') : t('lng_manage_peer_group_type') }}</h2>
      <button type="button" @click="save" :disabled="saving"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
        {{ saving ? t('lng_context_seen_loading') : t('lng_settings_save') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <!-- 公开 / 私密 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ isChannel ? t('lng_manage_peer_channel_type') : t('lng_manage_peer_group_type') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 space-y-3">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
              <button type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                @click="isPublic = true">
                <span class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                  :class="isPublic ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'">
                  <span v-if="isPublic" class="w-2 h-2 rounded-full bg-blue-500"></span>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-800 dark:text-gray-100">
                    {{ isChannel ? t('lng_create_public_channel_title') : t('lng_create_public_group_title') }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ isChannel ? t('lng_create_public_channel_about') : t('lng_create_public_group_about') }}
                  </p>
                </div>
              </button>
              <button type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                @click="isPublic = false">
                <span class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                  :class="!isPublic ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'">
                  <span v-if="!isPublic" class="w-2 h-2 rounded-full bg-blue-500"></span>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-800 dark:text-gray-100">
                    {{ isChannel ? t('lng_create_private_channel_title') : t('lng_create_private_group_title') }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ isChannel ? t('lng_create_private_channel_about') : t('lng_create_private_group_about') }}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </section>

        <!-- 公开链接（t.me 用户名） -->
        <section v-if="isPublic" class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_peer_bot_public_link') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 space-y-3">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
              <!-- t.me/ 前缀与用户名输入合为同一输入框 -->
              <div class="flex items-center w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                <span class="text-sm text-gray-500 dark:text-gray-400 select-none shrink-0">t.me/</span>
                <input v-model="username" type="text" spellcheck="false"
                  class="flex-1 min-w-0 py-2 pl-0 bg-transparent border-0 text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                  @input="checkDebounced" />
              </div>
              <p class="text-xs text-gray-400 mt-2 whitespace-pre-line">{{ t('lng_create_channel_link_about') }}</p>
              <p class="text-xs mt-1 min-h-4" :class="usernameClass">{{ usernameText }}</p>
            </div>
            <!-- 多用户名：启用 / 停用 / 排序（Unigram UsernameInfo 列表） -->
            <div v-if="managedUsernames.length > 1" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
              <div v-for="(u, idx) in managedUsernames" :key="u.name"
                class="flex items-center gap-2 px-4 py-3"
                :class="u.isActive ? '' : 'opacity-60'">
                <div class="min-w-0 flex-1">
                  <p class="text-sm truncate" :class="u.isActive ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'">
                    @{{ u.name }}
                  </p>
                  <p class="text-xs" :class="u.isActive ? 'text-teal-500' : 'text-gray-400'">
                    {{ u.isActive ? t('lng_usernames_active') : t('lng_usernames_non_active') }}
                  </p>
                </div>
                <template v-if="u.isActive">
                  <button type="button" :disabled="idx === 0"
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                    @click="moveUsername(u.activeIndex, -1)">
                    <ArrowUpIcon class="w-4 h-4" />
                  </button>
                  <button type="button" :disabled="idx === activeUsernames.length - 1"
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                    @click="moveUsername(u.activeIndex, 1)">
                    <ArrowDownIcon class="w-4 h-4" />
                  </button>
                  <button v-if="u.name !== editableUsername" type="button"
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    @click="toggleUsername(u.name, false)">
                    <BanIcon class="w-4 h-4" />
                  </button>
                </template>
                <button v-else type="button"
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                  @click="toggleUsername(u.name, true)">
                  <CheckIcon class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 邀请链接（与公开链接分离） -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('groupEdit.inviteLink') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 space-y-3">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
              <p class="text-sm text-gray-800 dark:text-gray-100 select-all break-all">{{ inviteLink || t('lng_admin_log_empty_text') }}</p>
              <p class="text-xs text-gray-400 mt-1">{{ t('groupEdit.inviteLinkHelp') }}</p>
            </div>
            <button type="button" @click="goInviteLinks"
              class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <LinkIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_invite_links') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_create_invite_link_about') }}</p>
              </div>
              <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          </div>
        </section>

        <!-- 加入规则（群组） -->
        <section v-if="!isChannel" class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_peer_send_title') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <div class="flex items-center gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_send_only_members') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_manage_peer_send_only_members_about') }}</p>
              </div>
              <ToggleSwitch v-model="joinToSendMessages" />
            </div>
            <div v-if="joinToSendMessages" class="flex items-center gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_send_approve_members') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_manage_peer_request_apply_title') }}</p>
              </div>
              <ToggleSwitch v-model="joinByRequest" />
            </div>
          </div>
        </section>

        <!-- 限制保存内容 -->
        <section>
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_peer_no_forwards_title') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_no_forwards') }}</p>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ isChannel ? t('lng_manage_peer_no_forwards_about_channel') : t('lng_manage_peer_no_forwards_about') }}
              </p>
            </div>
            <ToggleSwitch v-model="hasProtectedContent" />
          </div>
        </section>

        <div v-if="loading" class="py-8 text-center text-sm text-gray-400">{{ t('lng_context_seen_loading') }}</div>
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
  ChevronRight as ChevronRightIcon,
  Link as LinkIcon,
  ArrowUp as ArrowUpIcon,
  ArrowDown as ArrowDownIcon,
  Ban as BanIcon,
  Check as CheckIcon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { tdlibSend } from '../../utils/tdlib';
import {
  hasActiveUsername,
  isChannelChat,
  loadGroupFullInfo,
  loadMyChatMemberStatus,
} from '../../utils/groupRights';
import type { chat, supergroup, basicGroup } from 'tdlib-types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chat = ref<chat | undefined>();
const group = ref<supergroup | basicGroup | undefined>();
const isPublic = ref(false);
const username = ref('');
const inviteLink = ref('');
const hasProtectedContent = ref(false);
const joinToSendMessages = ref(false);
const joinByRequest = ref(false);
const saving = ref(false);
const loading = ref(true);
const checkState = ref<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
let checkTimer: ReturnType<typeof setTimeout> | undefined;

const editableUsername = ref('');
const activeUsernames = ref<string[]>([]);
const disabledUsernames = ref<string[]>([]);
const managedUsernames = computed(() => {
  const active = activeUsernames.value.map((u, i) => ({ name: u, isActive: true, activeIndex: i }));
  const disabled = disabledUsernames.value.map((u) => ({ name: u, isActive: false, activeIndex: -1 }));
  return [...active, ...disabled];
});

async function toggleUsername(name: string, activate: boolean) {
  const c = chat.value;
  if (!c || c.type._ !== 'chatTypeSupergroup') return;
  try {
    await tdlibSend({
      _: 'toggleSupergroupUsernameIsActive',
      supergroup_id: c.type.supergroup_id,
      username: name,
      is_active: activate,
    });
    MessagePlugin.success(t(activate ? 'lng_usernames_activate_description' : 'lng_usernames_deactivate_description'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

async function moveUsername(index: number, dir: -1 | 1) {
  const c = chat.value;
  if (!c || c.type._ !== 'chatTypeSupergroup') return;
  const next = [...activeUsernames.value];
  const j = index + dir;
  if (j < 0 || j >= next.length) return;
  const tmp = next[index]!;
  next[index] = next[j]!;
  next[j] = tmp;
  try {
    await tdlibSend({
      _: 'reorderSupergroupActiveUsernames',
      supergroup_id: c.type.supergroup_id,
      usernames: next,
    });
    activeUsernames.value = next;
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

const isChannel = computed(() => isChannelChat(chat.value));
const usernameText = computed(() => {
  if (checkState.value === 'checking') return t('groupEdit.linkChecking');
  if (checkState.value === 'ok') return t('groupEdit.linkAvailable');
  if (checkState.value === 'taken') return t('groupEdit.linkTaken');
  if (checkState.value === 'invalid') return t('groupEdit.linkInvalid');
  return '';
});
const usernameClass = computed(() => {
  if (checkState.value === 'ok') return 'text-teal-500';
  if (checkState.value === 'taken' || checkState.value === 'invalid') return 'text-red-500';
  return 'text-gray-400';
});

function goBack() {
  router.back();
}

function goInviteLinks() {
  router.push({ name: 'group-invite-links', params: { id: String(chatId.value) } });
}

function isValidUsername(u: string) {
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(u);
}

function checkDebounced() {
  checkState.value = 'idle';
  if (checkTimer) clearTimeout(checkTimer);
  const u = username.value.trim();
  if (!u) return;
  if (!isValidUsername(u)) {
    checkState.value = 'invalid';
    return;
  }
  checkTimer = setTimeout(() => void checkUsername(), 400);
}

async function checkUsername() {
  const u = username.value.trim();
  if (!u) return;
  checkState.value = 'checking';
  try {
    const res = await tdlibSend({ _: 'checkChatUsername', chat_id: chatId.value, username: u });
    if (res._ === 'checkChatUsernameResultOk') checkState.value = 'ok';
    else if (res._ === 'checkChatUsernameResultUsernameInvalid') checkState.value = 'invalid';
    else checkState.value = 'taken';
  } catch {
    checkState.value = 'invalid';
  }
}

async function reload() {
  loading.value = true;
  try {
    const { chat: c, supergroup: sg, basicGroup: bg } = await loadMyChatMemberStatus(chatId.value);
    chat.value = c;
    group.value = sg ?? bg;
    isPublic.value = hasActiveUsername(sg ?? bg ?? null);
    const unames = ((sg ?? bg) as any)?.usernames as { editable_username?: string; active_usernames?: string[]; disabled_usernames?: string[] } | undefined;
    username.value = unames?.active_usernames?.[0] ?? unames?.editable_username ?? '';
    editableUsername.value = unames?.editable_username ?? '';
    activeUsernames.value = unames?.active_usernames ?? [];
    disabledUsernames.value = unames?.disabled_usernames ?? [];
    hasProtectedContent.value = !!c?.has_protected_content;
    if (sg) {
      joinToSendMessages.value = !!sg.join_to_send_messages;
      joinByRequest.value = !!sg.join_by_request;
    }
    const full = c ? await loadGroupFullInfo(c) : null;
    inviteLink.value = full?.inviteLink ?? '';
  } catch (e) {
    console.error('GroupType load failed', e);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!chat.value) return;
  saving.value = true;
  try {
    const next = isPublic.value ? username.value.trim() : '';
    if (isPublic.value) {
      if (!isValidUsername(next)) {
        MessagePlugin.warning(usernameText.value || t('lng_username_invalid'));
        return;
      }
      if (checkState.value !== 'ok') await checkUsername();
      if (checkState.value !== 'ok') {
        MessagePlugin.warning(usernameText.value || t('lng_username_occupied'));
        return;
      }
    }

    let target = chat.value;
    if (target.type._ === 'chatTypeBasicGroup' && next) {
      const upgraded = await tdlibSend({
        _: 'upgradeBasicGroupChatToSupergroupChat',
        chat_id: chatId.value,
      });
      if (upgraded && typeof upgraded === 'object' && (upgraded as chat)._ === 'chat') {
        target = upgraded as chat;
      }
    }

    if (target.type._ === 'chatTypeSupergroup') {
      await tdlibSend({ _: 'setSupergroupUsername', supergroup_id: target.type.supergroup_id, username: next });
      if (!target.type.is_channel) {
        await tdlibSend({
          _: 'toggleSupergroupJoinToSendMessages',
          supergroup_id: target.type.supergroup_id,
          join_to_send_messages: joinToSendMessages.value,
        });
        await tdlibSend({
          _: 'toggleSupergroupJoinByRequest',
          supergroup_id: target.type.supergroup_id,
          join_by_request: joinByRequest.value,
          } as any);
      }
    }

    await tdlibSend({
      _: 'toggleChatHasProtectedContent',
      chat_id: chatId.value,
      has_protected_content: hasProtectedContent.value,
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
  else loading.value = false;
});
</script>
