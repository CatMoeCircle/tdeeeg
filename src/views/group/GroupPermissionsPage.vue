<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_manage_peer_permissions') }}</h2>
      <button type="button" @click="save" :disabled="saving"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
        {{ saving ? t('lng_context_seen_loading') : t('lng_settings_save') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <!-- 默认成员权限 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_rights_default_restrictions_header') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <!-- 发送消息 -->
            <div class="flex items-center gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_rights_chat_send_text') }}</p>
              </div>
              <ToggleSwitch v-model="form.can_send_basic_messages" />
            </div>

            <!-- 发送媒体（总开关 + 展开子项） -->
            <div class="px-4 py-3">
              <div class="flex items-center gap-3">
                <button type="button" class="w-5 h-5 flex items-center justify-center text-gray-400 shrink-0"
                  @click="mediaExpanded = !mediaExpanded">
                  <ChevronRightIcon class="w-4 h-4 transition-transform" :class="mediaExpanded ? 'rotate-90' : ''" />
                </button>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-800 dark:text-gray-100">
                    {{ t('lng_rights_chat_send_media') }}
                    <span class="text-xs font-semibold text-gray-400 ml-1">{{ mediaEnabledCount }}/9</span>
                  </p>
                </div>
                <ToggleSwitch :model-value="mediaAllOn" @update:model-value="onMediaAll" />
              </div>
              <div v-if="mediaExpanded" class="mt-2 ml-7 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                <div v-for="row in mediaRows" :key="row.key" class="flex items-center gap-3 px-3 py-2">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-gray-700 dark:text-gray-200">{{ row.label }}</p>
                  </div>
                  <ToggleSwitch v-model="(form as any)[row.key]" />
                </div>
              </div>
            </div>

            <div v-for="row in manageRows" :key="row.key" class="flex items-center gap-3 px-4 py-3"
              :class="row.locked ? 'opacity-60' : ''">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ row.label }}</p>
                <p v-if="row.hint" class="text-xs text-gray-400 mt-0.5">{{ row.hint }}</p>
              </div>
              <ToggleSwitch v-model="(form as any)[row.key]" :disabled="row.locked" />
            </div>
          </div>
        </section>

        <!-- 付费消息（Unigram：CanEnablePaidMessages || 已开启） -->
        <section v-if="showPaidMessages" class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_rights_charge_stars') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_rights_charge_stars') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_rights_charge_stars_about') }}</p>
              </div>
              <ToggleSwitch v-model="chargePerMessage" />
            </div>
            <div v-if="chargePerMessage" class="mt-3">
              <p class="text-sm text-gray-800 dark:text-gray-100 mb-2">{{ paidMessageStarCount }}</p>
              <input v-model.number="paidMessageStarCount" type="range" min="1" max="9000" step="1" class="w-full accent-blue-500" />
            </div>
          </div>
        </section>

        <!-- 慢速模式 -->
        <section v-if="showSlowMode" class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_rights_slowmode_header') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
            <select v-model.number="slowModeDelay"
              class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option v-for="opt in slowModeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <p class="text-xs text-gray-400 mt-2">
              {{ slowModeDelay > 0 ? t('lng_rights_slowmode_about_interval', { interval: slowModeLabel(slowModeDelay) }) : t('lng_rights_slowmode_about') }}
            </p>
          </div>
        </section>

        <!-- Boost 免限 -->
        <section v-if="showBoosters" class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_rights_boosts_no_restrict') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_rights_boosts_no_restrict') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_rights_boosts_about') }}</p>
              </div>
              <ToggleSwitch v-model="unrestrictBoosters" />
            </div>
            <div v-if="unrestrictBoosters" class="mt-3">
              <p class="text-sm text-gray-800 dark:text-gray-100 mb-2">{{ unrestrictBoostCount }}</p>
              <input v-model.number="unrestrictBoostCount" type="range" min="1" max="5" step="1" class="w-full accent-blue-500" />
            </div>
          </div>
        </section>

        <!-- 黑名单 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_peer_banned_users') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
            <button type="button" @click="goBlacklist"
              class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <BanIcon class="w-5 h-5 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_banned_users') }}</p>
              </div>
              <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          </div>
        </section>

        <!-- 受限成员（例外） -->
        <section>
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_peer_restricted_users') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <button v-if="canRestrict" type="button" @click="goMembers"
            class="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <UserPlusIcon class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_channel_add_exception') }}</p>
            </div>
            <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
          </button>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <div v-for="m in restrictedMembers" :key="String(memberUserId(m) ?? Math.random())"
              class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="openRestrict(m)"
              @contextmenu.prevent="openRestrictedMenu($event, m)">
              <div class="w-9 h-9 shrink-0">
                <Avatar :photo="userOf(m)?.profile_photo" :title="nameOf(m)"
                  :deletedAccount="isDeletedMember(memberUserId(m))" sizeClass="!w-9 !h-9" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ nameOf(m) }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ restrictedBy(m) }}</p>
              </div>
              <button type="button"
                class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                @click.stop="openRestrictedMenu($event, m)">
                <MoreHorizontalIcon class="w-4 h-4" />
              </button>
            </div>
            <div v-if="!loading && restrictedMembers.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
              {{ t('lng_admin_log_empty_text') }}
            </div>
          </div>
        </section>

        <div v-if="loading" class="py-8 text-center text-sm text-gray-400">{{ t('lng_context_seen_loading') }}</div>
      </div>
    </div>

    <GroupRestrictDialog v-model="restrictVisible" :chat-id="chatId" :member="selectedMember"
      :default-permissions="chat?.permissions" @changed="reload" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Ban as BanIcon,
  UserPlus as UserPlusIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Trash2 as Trash2Icon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import Avatar from '../../components/chat/avatar.vue';
import GroupRestrictDialog from '../../components/settings/GroupRestrictDialog.vue';
import { RestrictKeyIcon } from '../../components/common/tgico';
import { openContextMenu } from '../../store/contextMenu';
import { tdlibSend } from '../../utils/tdlib';
import {
  hasActiveUsername,
  loadGroupMembers,
  loadMyChatMemberStatus,
  memberUserId,
  userNameOf,
  isDeletedMember,
  ensureMemberUsers,
  canRestrictMembers,
  isBasicGroupChat,
} from '../../utils/groupRights';
import { getReactiveUser } from '../../utils/senderInfo';
import type { chat, chatMember, chatPermissions, supergroup, user } from 'tdlib-types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chat = ref<chat | undefined>();
const saving = ref(false);
const loading = ref(true);
const lockManage = ref(false);
const mediaExpanded = ref(false);
const showSlowMode = ref(false);
const showBoosters = ref(false);
const canRestrict = ref(false);
const showPaidMessages = ref(false);
const chargePerMessage = ref(false);
const paidMessageStarCount = ref(1);
const slowModeDelay = ref(0);
const unrestrictBoosters = ref(false);
const unrestrictBoostCount = ref(1);
const restrictedMembers = ref<chatMember[]>([]);
const selectedMember = ref<chatMember | null>(null);
const restrictVisible = ref(false);

const form = reactive({
  can_send_basic_messages: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_other_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_voice_notes: true,
  can_send_video_notes: true,
  can_send_polls: true,
  can_add_link_previews: true,
  can_invite_users: true,
  can_pin_messages: true,
  can_change_info: true,
  can_create_topics: true,
  can_react_to_messages: true,
  can_edit_tag: true,
});

const mediaKeys = [
  'can_send_photos',
  'can_send_videos',
  'can_send_other_messages',
  'can_send_audios',
  'can_send_documents',
  'can_send_voice_notes',
  'can_send_video_notes',
  'can_send_polls',
  'can_add_link_previews',
] as const;

const mediaRows = computed(() => [
  { key: 'can_send_photos', label: t('lng_rights_chat_photos') },
  { key: 'can_send_videos', label: t('lng_rights_chat_videos') },
  { key: 'can_send_other_messages', label: t('lng_rights_chat_stickers') },
  { key: 'can_send_audios', label: t('lng_rights_chat_music') },
  { key: 'can_send_documents', label: t('lng_rights_chat_files') },
  { key: 'can_send_voice_notes', label: t('lng_rights_chat_voice_messages') },
  { key: 'can_send_video_notes', label: t('lng_rights_chat_video_messages') },
  { key: 'can_send_polls', label: t('lng_rights_chat_send_polls') },
  { key: 'can_add_link_previews', label: t('lng_rights_chat_send_links') },
]);

const mediaEnabledCount = computed(() => mediaKeys.filter((k) => (form as any)[k]).length);
const mediaAllOn = computed(() => mediaEnabledCount.value === mediaKeys.length);

function onMediaAll(v: boolean) {
  for (const k of mediaKeys) (form as any)[k] = v;
}

/** Unigram 默认权限页仅：邀请 / 置顶 / 修改资料 */
const manageRows = computed(() => [
  {
    key: 'can_invite_users',
    label: t('lng_rights_chat_add_members'),
    locked: false,
    hint: '',
  },
  {
    key: 'can_pin_messages',
    label: t('lng_rights_group_pin'),
    locked: lockManage.value,
    hint: lockManage.value ? t('lng_rights_permission_unavailable') : '',
  },
  {
    key: 'can_change_info',
    label: t('lng_rights_group_info'),
    locked: lockManage.value,
    hint: lockManage.value ? t('lng_rights_permission_unavailable') : '',
  },
  {
    key: 'can_edit_tag',
    label: t('lng_rights_group_edit_rank_single'),
    locked: false,
    hint: '',
  },
]);

const slowModeOptions = computed(() => [
  { value: 0, label: t('lng_rights_slowmode_off') },
  { value: 5, label: t('lng_rights_slowmode_seconds', { count: 5 }) },
  { value: 10, label: t('lng_rights_slowmode_seconds', { count: 10 }) },
  { value: 30, label: t('lng_rights_slowmode_seconds', { count: 30 }) },
  { value: 60, label: t('lng_rights_slowmode_minutes', { count: 1 }) },
  { value: 300, label: t('lng_rights_slowmode_minutes', { count: 5 }) },
  { value: 900, label: t('lng_rights_slowmode_minutes', { count: 15 }) },
  { value: 3600, label: t('lng_rights_slowmode_hours', { count: 1 }) },
]);

function slowModeLabel(v: number): string {
  if (v <= 0) return t('lng_rights_slowmode_off');
  if (v < 60) return t('lng_rights_slowmode_seconds', { count: v });
  if (v < 3600) return t('lng_rights_slowmode_minutes', { count: Math.round(v / 60) });
  return t('lng_rights_slowmode_hours', { count: Math.round(v / 3600) });
}

function goBack() {
  router.back();
}

function goBlacklist() {
  router.push({ name: 'group-blacklist', params: { id: String(chatId.value) } });
}

function goMembers() {
  router.push({ name: 'group-members', params: { id: String(chatId.value) } });
}

function userOf(m: chatMember): user | undefined {
  const id = memberUserId(m);
  return id ? getReactiveUser(id) : undefined;
}

function nameOf(m: chatMember): string {
  const id = memberUserId(m);
  return id ? userNameOf(id) : '?';
}

/** 受限列表：被谁限制 */
function restrictedBy(m: chatMember): string {
  const byId = m.inviter_user_id;
  // 0 = 未知操作人，避免显示 "0"
  const byName = byId ? userNameOf(byId) : '';
  const date = m.joined_chat_date
    ? new Date(m.joined_chat_date * 1000).toLocaleDateString()
    : '';
  return t('lng_rights_chat_restricted_by', { user: byName || '—', date: date || '—' });
}

function openRestrict(m: chatMember) {
  selectedMember.value = m;
  restrictVisible.value = true;
}

/** Unigram 权限页例外列表：权限设置 / 从列表移除 */
function openRestrictedMenu(e: MouseEvent, m: chatMember) {
  e.preventDefault();
  e.stopPropagation();
  openContextMenu(e.clientX, e.clientY, [
    {
      key: 'edit',
      label: t('lng_rights_user_restrictions'),
      icon: RestrictKeyIcon,
      onClick: () => openRestrict(m),
    },
    {
      key: 'delete-from-list',
      label: t('lng_group_invite_context_delete'),
      icon: Trash2Icon,
      danger: true,
      onClick: () => deleteFromList(m),
    },
  ], e.currentTarget as HTMLElement);
}

async function deleteFromList(m: chatMember) {
  const uid = memberUserId(m);
  if (!uid) return;
  try {
    await tdlibSend({
      _: 'setChatMemberStatus',
      chat_id: chatId.value,
      member_id: { _: 'messageSenderUser', user_id: uid },
      status: { _: 'chatMemberStatusLeft' },
    });
    MessagePlugin.success(t('lng_group_invite_context_delete'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

function applyPermissions(p?: chatPermissions | null) {
  if (!p) return;
  for (const key of Object.keys(form) as (keyof typeof form)[]) {
    (form as any)[key] = !!(p as any)[key];
  }
}

async function loadLinked(c?: chat | null): Promise<number> {
  if (!c || c.type._ !== 'chatTypeSupergroup') return 0;
  try {
    const full = await tdlibSend({ _: 'getSupergroupFullInfo', supergroup_id: c.type.supergroup_id });
    return full.linked_chat_id ?? 0;
  } catch {
    return 0;
  }
}

async function reload() {
  loading.value = true;
  try {
    const { chat: c, supergroup: sg } = await loadMyChatMemberStatus(chatId.value);
    chat.value = c;
    applyPermissions(c?.permissions);
    const linked = await loadLinked(c);
    lockManage.value = !!linked || hasActiveUsername(sg as supergroup | undefined);

    showSlowMode.value = !!c && !isBasicGroupChat(c);
    showBoosters.value = !!c && !isBasicGroupChat(c) && canRestrictMembers(sg?.status);
    canRestrict.value = showBoosters.value;
    showPaidMessages.value = false;

    if (c && showSlowMode.value && c.type._ === 'chatTypeSupergroup') {
      try {
        const full = await tdlibSend({
          _: 'getSupergroupFullInfo',
          supergroup_id: c.type.supergroup_id,
        });
        slowModeDelay.value = (full as any).slow_mode_delay ?? 0;
        unrestrictBoostCount.value = (full as any).unrestrict_boost_count ?? 1;
        unrestrictBoosters.value = unrestrictBoostCount.value > 0;
        if (!unrestrictBoosters.value) unrestrictBoostCount.value = 1;
        // Unigram：PaidMessagesPanel 仅 CanEnablePaidMessages 或已开启付费
        const canEnablePaid = !!(full as any).can_enable_paid_messages;
        paidMessageStarCount.value = (sg as any)?.paid_message_star_count ?? 0;
        chargePerMessage.value = paidMessageStarCount.value > 0;
        if (!chargePerMessage.value) paidMessageStarCount.value = 1;
        showPaidMessages.value = canEnablePaid || chargePerMessage.value;
      } catch {
        /* ignore */
      }
    }

    if (c && !isBasicGroupChat(c)) {
      const list = await loadGroupMembers(c, 'restricted', '', 0, 50);
      // 先加载成员与操作人，再写入列表并强制刷新，保证「被谁限制」文案渲染
      await ensureMemberUsers(list);
      restrictedMembers.value = [...list];
    } else {
      restrictedMembers.value = [];
    }
  } catch (e) {
    console.error('GroupPermissions load failed', e);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!hasChatId.value) return;
  saving.value = true;
  try {
    const permissions: chatPermissions = {
      _: 'chatPermissions',
      can_send_basic_messages: form.can_send_basic_messages,
      can_send_audios: form.can_send_audios,
      can_send_documents: form.can_send_documents,
      can_send_photos: form.can_send_photos,
      can_send_videos: form.can_send_videos,
      can_send_video_notes: form.can_send_video_notes,
      can_send_voice_notes: form.can_send_voice_notes,
      can_send_polls: form.can_send_polls,
      can_send_other_messages: form.can_send_other_messages,
      can_add_link_previews: form.can_add_link_previews,
      can_react_to_messages: form.can_react_to_messages,
      can_edit_tag: form.can_edit_tag,
      can_change_info: form.can_change_info,
      can_invite_users: form.can_invite_users,
      can_pin_messages: form.can_pin_messages,
      can_create_topics: form.can_create_topics,
    };
    await tdlibSend({ _: 'setChatPermissions', chat_id: chatId.value, permissions });

    if (showSlowMode.value) {
      await tdlibSend({
        _: 'setChatPaidMessageStarCount',
        chat_id: chatId.value,
        paid_message_star_count: chargePerMessage.value ? paidMessageStarCount.value : 0,
      });
      await tdlibSend({
        _: 'setChatSlowModeDelay',
        chat_id: chatId.value,
        slow_mode_delay: slowModeDelay.value,
      });
    }

    if (showBoosters.value && chat.value?.type._ === 'chatTypeSupergroup') {
      await tdlibSend({
        _: 'setSupergroupUnrestrictBoostCount',
        supergroup_id: chat.value.type.supergroup_id,
        unrestrict_boost_count: unrestrictBoosters.value ? unrestrictBoostCount.value : 0,
      });
    }

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
