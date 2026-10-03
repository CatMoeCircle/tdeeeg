<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ title }}</h2>
      <!-- Unigram AddNew：添加管理员 / 添加成员 / 封禁用户 -->
      <button v-if="showAddButton" type="button" @click="openAddPicker"
        class="px-3 py-1.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
        {{ addButtonText }}
      </button>
    </div>

    <!-- 管理员页顶部：近期操作 / 签名 / 反垃圾（Unigram：事件日志仅超群，签名仅频道+可改资料，反垃圾仅群组） -->
    <div v-if="mode === 'admins' && showAdminHeader" class="px-6 pt-4 shrink-0 space-y-2">
      <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        <button v-if="showEventLog" type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          @click="goEventLog">
          <HistoryIcon class="w-5 h-5 text-gray-400 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_recent_actions') }}</p>
          </div>
          <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
        </button>
        <div v-if="isChannel && canChangeInfo" class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_edit_sign_messages') }}</p>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_edit_sign_messages_about') }}</p>
          </div>
          <ToggleSwitch :model-value="signMessages" @update:model-value="onSignMessages" />
        </div>
        <div v-if="isChannel && canChangeInfo" class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_edit_sign_profiles') }}</p>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_edit_sign_profiles_about') }}</p>
          </div>
          <ToggleSwitch :model-value="showMessageSender" @update:model-value="onShowMessageSender" />
        </div>
        <div v-if="canToggleAntiSpam" class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_antispam') }}</p>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_manage_peer_antispam_about') }}</p>
          </div>
          <ToggleSwitch :model-value="antiSpam" @update:model-value="onAntiSpam" />
        </div>
      </div>
    </div>

    <!-- 成员页：隐藏成员（Unigram HideMembers，需 can_hide_members） -->
    <div v-if="mode === 'members' && canHideMembers" class="px-6 pt-4 shrink-0">
      <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-4 py-3 flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_profile_hide_participants') }}</p>
          <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_manage_peer_no_forwards_about') }}</p>
        </div>
        <ToggleSwitch :model-value="hasHiddenMembers" @update:model-value="onHideMembers" />
      </div>
    </div>

    <div class="px-6 pt-4 shrink-0">
      <input v-model="query" type="search" :placeholder="t('lng_dlg_filter')"
        class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        @input="onSearch" />
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-4">
        <!-- 成员/订阅者：联系人 → 机器人 → 其他（Unigram ChatMemberGroupedCollection） -->
        <template v-if="mode === 'members' && !query.trim() && sections.length">
          <div v-for="sec in sections" :key="sec.key">
            <p class="px-1 pb-2 text-xs font-medium text-gray-400 dark:text-gray-500">{{ sec.title }}</p>
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
              <div v-for="m in sec.members" :key="memberKey(m)"
                class="flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                @click="onRowClick(m)"
                @contextmenu.prevent="openMenu($event, m)">
                <div class="w-10 h-10 shrink-0">
                  <Avatar :photo="userOf(m)?.profile_photo" :title="nameOf(m)" :deletedAccount="isDeletedMember(memberUserId(m))"
                    sizeClass="!w-10 !h-10" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ nameOf(m) }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ statusOf(m) }}</p>
                </div>
                <button type="button"
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                  @click.stop="openMenu($event, m)">
                  <MoreHorizontalIcon class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="m in members" :key="memberKey(m)"
            class="flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            @click="onRowClick(m)"
            @contextmenu.prevent="openMenu($event, m)">
            <div class="w-10 h-10 shrink-0">
              <Avatar :photo="userOf(m)?.profile_photo" :title="nameOf(m)" :deletedAccount="isDeletedMember(memberUserId(m))"
                sizeClass="!w-10 !h-10" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ nameOf(m) }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ statusOf(m) }}</p>
            </div>
            <button type="button"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
              @click.stop="openMenu($event, m)">
              <MoreHorizontalIcon class="w-4 h-4" />
            </button>
          </div>
          <div v-if="!loading && members.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
            {{ t('groupEdit.empty') }}
          </div>
          <div v-if="loading" class="px-4 py-8 text-center text-sm text-gray-400">{{ t('groupEdit.loading') }}</div>
        </div>
        <div v-if="mode === 'members' && !query.trim() && !loading && sections.length === 0"
          class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-4 py-8 text-center text-sm text-gray-400">
          {{ t('groupEdit.empty') }}
        </div>
        <div v-if="mode === 'members' && !query.trim() && loading"
          class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-4 py-8 text-center text-sm text-gray-400">
          {{ t('groupEdit.loading') }}
        </div>
      </div>
    </div>

    <GroupAdminRightsDialog v-model="adminVisible" :chat-id="chatId" :member="selected" :is-channel="isChannel"
      :is-forum="isForum" :is-owner="isOwner" :my-rights="myAdminRights" :default-permissions="chat?.permissions"
      @changed="reload" />
    <GroupRestrictDialog v-model="restrictVisible" :chat-id="chatId" :member="selected"
      :default-permissions="chat?.permissions" @changed="reload" />
    <GroupUserPickerDialog v-model="pickerVisible" :title="addButtonText" :chat-id="mode === 'members' || mode === 'blacklist' ? chatId : undefined"
      :exclude-ids="memberIds" @select="onPickUser" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  MoreHorizontal as MoreHorizontalIcon,
  History as HistoryIcon,
  UserPlus as UserPlusIcon,
  Trash2 as Trash2Icon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import GroupAdminRightsDialog from '../../components/settings/GroupAdminRightsDialog.vue';
import GroupRestrictDialog from '../../components/settings/GroupRestrictDialog.vue';
import GroupUserPickerDialog from '../../components/settings/GroupUserPickerDialog.vue';
import { ShieldAdminIcon, RestrictKeyIcon } from '../../components/common/tgico';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { openContextMenu } from '../../store/contextMenu';
import type { ContextMenuItem } from '../../components/contextMenu/types';
import { tdlibSend } from '../../utils/tdlib';
import {
  ensureMemberUsers,
  isAdminStatus,
  isChannelChat,
  isBasicGroupChat,
  isCreatorStatus,
  loadGroupMembers,
  memberUserId,
  userNameOf,
  isDeletedMember,
  canPromoteMembers,
  canRestrictMembers,
  canInviteUsers,
  canChangeGroupInfo,
  loadMyChatMemberStatus,
} from '../../utils/groupRights';
import { getReactiveUser } from '../../utils/senderInfo';
import formatStatus from '../../utils/status';
import type { chat, chatMember, ChatMemberStatus, user } from 'tdlib-types';

function canEditAdminRights(st?: ChatMemberStatus | null): boolean {
  return st?._ === 'chatMemberStatusAdministrator' && st.can_be_edited;
}
void canEditAdminRights;

const props = defineProps<{
  mode: 'admins' | 'members' | 'blacklist';
}>();

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** 聊天 ID 可能为负数（频道 -100…），不能用 > 0 判断 */
const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chat = ref<chat | undefined>();
const myStatus = ref<ChatMemberStatus | undefined>();
const myUserId = ref(0);
const members = ref<chatMember[]>([]);
const loading = ref(true);
const query = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const selected = ref<chatMember | null>(null);
const adminVisible = ref(false);
const restrictVisible = ref(false);
const pickerVisible = ref(false);

const isChannel = computed(() => isChannelChat(chat.value));
const isBasic = computed(() => isBasicGroupChat(chat.value));
const isForum = computed(() => !!(chat.value?.type._ === 'chatTypeSupergroup' && (chat.value.type as any).is_forum));

type MemberSection = { key: string; title: string; members: chatMember[] };

/** 成员/订阅者分组：此频道/群组中的联系人 → 机器人 → 其他（Unigram ChatMemberGroupedCollection） */
const sections = computed<MemberSection[]>(() => {
  if (props.mode !== 'members' || query.value.trim()) return [];
  const seen = new Set<number>();
  const contacts: chatMember[] = [];
  const bots: chatMember[] = [];
  const others: chatMember[] = [];
  for (const m of members.value) {
    const uid = memberUserId(m);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const u = getReactiveUser(uid);
    if (u?.is_contact) {
      contacts.push(m);
    } else if (u && u.type._ === 'userTypeBot') {
      bots.push(m);
    } else {
      others.push(m);
    }
  }
  const list: MemberSection[] = [];
  if (contacts.length) {
    list.push({
      key: 'contacts',
      title: isChannel.value ? t('groupEdit.contactsInChannel') : t('groupEdit.contactsInGroup'),
      members: contacts,
    });
  }
  if (bots.length) {
    list.push({ key: 'bots', title: t('groupEdit.botsSection'), members: bots });
  }
  if (others.length) {
    list.push({
      key: 'others',
      title: isChannel.value ? t('groupEdit.otherSubscribers') : t('groupEdit.otherMembers'),
      members: others,
    });
  }
  return list;
});

const memberIds = computed(() =>
  members.value.map((m) => memberUserId(m)).filter((id): id is number => !!id)
);

const showAddButton = computed(() => {
  if (props.mode === 'admins') return canPromoteMembers(myStatus.value);
  if (props.mode === 'blacklist') return canRestrictMembers(myStatus.value);
  return canInviteUsers(myStatus.value, chat.value) || canRestrictMembers(myStatus.value);
});

const addButtonText = computed(() => {
  if (props.mode === 'admins') return t('lng_channel_add_admin');
  if (props.mode === 'blacklist') return t('lng_profile_block_user');
  return t('lng_channel_add_members');
});

function openAddPicker() {
  pickerVisible.value = true;
}

async function onPickUser(u: { id: number }) {
  try {
    if (props.mode === 'admins') {
      // 选中后直接打开管理权限编辑
      const m: chatMember = {
        _: 'chatMember',
        member_id: { _: 'messageSenderUser', user_id: u.id },
        tag: '',
        inviter_user_id: 0,
        joined_chat_date: 0,
        status: { _: 'chatMemberStatusMember', member_until_date: 0 },
      };
      await openAdmin(m);
      return;
    }
    if (props.mode === 'blacklist') {
      await tdlibSend({
        _: 'banChatMember',
        chat_id: chatId.value,
        member_id: { _: 'messageSenderUser', user_id: u.id },
        revoke_messages: true,
      });
      MessagePlugin.success(t('lng_rights_group_ban'));
    } else {
      await tdlibSend({
        _: 'addChatMember',
        chat_id: chatId.value,
        user_id: u.id,
      } as any);
      MessagePlugin.success(t('lng_channel_add_members'));
    }
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

const canHideMembers = ref(false);
const hasHiddenMembers = ref(false);

async function onHideMembers(v: boolean) {
  if (chat.value?.type._ !== 'chatTypeSupergroup') return;
  const prev = hasHiddenMembers.value;
  hasHiddenMembers.value = v;
  try {
    await tdlibSend({
      _: 'toggleSupergroupHasHiddenMembers',
      supergroup_id: chat.value.type.supergroup_id,
      has_hidden_members: v,
    });
    MessagePlugin.success(t('lng_settings_save'));
  } catch (e: any) {
    hasHiddenMembers.value = prev;
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}
const canChangeInfo = computed(() => canChangeGroupInfo(myStatus.value, chat.value));
const showEventLog = computed(() => !isBasic.value);
const showAdminHeader = computed(
  () => showEventLog.value || (isChannel.value && canChangeInfo.value) || canToggleAntiSpam.value
);
const signMessages = ref(false);
const showMessageSender = ref(false);
const antiSpam = ref(false);
const canToggleAntiSpam = ref(false);

function goEventLog() {
  router.push({ name: 'group-event-log', params: { id: String(chatId.value) } });
}

async function onSignMessages(v: boolean) {
  if (chat.value?.type._ !== 'chatTypeSupergroup') return;
  const prev = signMessages.value;
  signMessages.value = v;
  try {
    await tdlibSend({
      _: 'toggleSupergroupSignMessages',
      supergroup_id: chat.value.type.supergroup_id,
      sign_messages: v,
      show_message_sender: showMessageSender.value,
    });
  } catch (e: any) {
    signMessages.value = prev;
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

async function onShowMessageSender(v: boolean) {
  if (chat.value?.type._ !== 'chatTypeSupergroup') return;
  const prev = showMessageSender.value;
  showMessageSender.value = v;
  try {
    await tdlibSend({
      _: 'toggleSupergroupSignMessages',
      supergroup_id: chat.value.type.supergroup_id,
      sign_messages: signMessages.value,
      show_message_sender: v,
    });
  } catch (e: any) {
    showMessageSender.value = prev;
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

async function onAntiSpam(v: boolean) {
  if (chat.value?.type._ !== 'chatTypeSupergroup') return;
  const prev = antiSpam.value;
  antiSpam.value = v;
  try {
    await tdlibSend({
      _: 'toggleSupergroupHasAggressiveAntiSpamEnabled',
      supergroup_id: chat.value.type.supergroup_id,
      has_aggressive_anti_spam_enabled: v,
    });
  } catch (e: any) {
    antiSpam.value = prev;
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}
const title = computed(() => {
  if (props.mode === 'admins') return t('groupEdit.admins');
  if (props.mode === 'blacklist') return t('groupEdit.blacklist');
  return isChannel.value ? t('groupEdit.subscribers') : t('groupEdit.members');
});

function goBack() {
  router.back();
}

function userOf(m: chatMember): user | undefined {
  const id = memberUserId(m);
  return id ? getReactiveUser(id) : undefined;
}

function nameOf(m: chatMember): string {
  const id = memberUserId(m);
  return id ? userNameOf(id) : '?';
}

function memberKey(m: chatMember): string {
  const id = memberUserId(m);
  return String(id ?? Math.random());
}

function statusOf(m: chatMember): string {
  const st = m.status;
  if (isCreatorStatus(st)) return t('lng_gift_unique_owner');
  // 管理员列表：显示「由 xxx 设置为管理员」，不用头衔
  if (props.mode === 'admins' && isAdminStatus(st)) {
    const byId = m.inviter_user_id;
    const byName = byId ? userNameOf(byId) : '';
    const date = m.joined_chat_date
      ? new Date(m.joined_chat_date * 1000).toLocaleDateString()
      : '';
    return t('lng_rights_about_by', { user: byName, date });
  }
  // 封禁列表：被谁封禁
  if (props.mode === 'blacklist') {
    const byId = m.inviter_user_id;
    const byName = byId ? userNameOf(byId) : '';
    const date = m.joined_chat_date
      ? new Date(m.joined_chat_date * 1000).toLocaleDateString()
      : '';
    return t('lng_rights_chat_banned_by', { user: byName, date });
  }
  // 成员列表：只显示在线状态
  const uid = memberUserId(m);
  const u = uid ? getReactiveUser(uid) : undefined;
  return u ? formatStatus(u) : '';
}

/** 点击进入个人主页（成员/订阅者/封禁列表均可用，无权限限制） */
function openUserProfile(m: chatMember) {
  const uid = memberUserId(m);
  if (!uid) return;
  router.push({ name: 'user-profile', params: { id: String(uid) } });
}

/** 点击条目：
 *  管理员列表 → 查看/修改管理员权限
 *  成员/订阅者 → 个人主页（Unigram NavigateToSender，无权限限制）
 *  封禁列表 → 个人资料
 */
function onRowClick(m: chatMember) {
  if (props.mode === 'admins') {
    void openAdmin(m);
    return;
  }
  openUserProfile(m);
}

/** Unigram RemoveMember：从频道/群组移除（status → Banned） */
async function removeFromChat(m: chatMember) {
  const uid = memberUserId(m);
  if (!uid) return;
  try {
    await tdlibSend({
      _: 'setChatMemberStatus',
      chat_id: chatId.value,
      member_id: { _: 'messageSenderUser', user_id: uid },
      status: { _: 'chatMemberStatusBanned', banned_until_date: 0 },
    });
    MessagePlugin.success(t('groupEdit.removed'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

/** Unigram AddMember：加回群组/频道（status → Member） */
async function addToChat(m: chatMember) {
  const uid = memberUserId(m);
  if (!uid) return;
  try {
    await tdlibSend({
      _: 'setChatMemberStatus',
      chat_id: chatId.value,
      member_id: { _: 'messageSenderUser', user_id: uid },
      status: { _: 'chatMemberStatusMember', member_until_date: 0 },
    });
    MessagePlugin.success(t('lng_context_add_to_group'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

/** Unigram UnbanMember：从列表移除（status → Left，不再出现在黑名单） */
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

function isSelf(m: chatMember): boolean {
  return memberUserId(m) === myUserId.value;
}

/** 是否群主（可转让） */
const isOwner = computed(() => isCreatorStatus(myStatus.value));
const myAdminRights = computed(() =>
  myStatus.value?._ === 'chatMemberStatusAdministrator' ? myStatus.value.rights : undefined
);

/** Unigram MemberPromote：非创建者、非自己、有 promote 权限 */
function canPromoteTarget(m: chatMember): boolean {
  if (isCreatorStatus(m.status)) return false;
  if (isSelf(m)) return false;
  return canPromoteMembers(myStatus.value);
}

/** Unigram MemberRestrict：仅群组；创建者/不可编辑管理员/自己不可 */
function canRestrictTarget(m: chatMember): boolean {
  if (isChannel.value) return false;
  if (isSelf(m)) return false;
  if (isCreatorStatus(m.status)) return false;
  if (m.status._ === 'chatMemberStatusAdministrator' && !m.status.can_be_edited) return false;
  return canRestrictMembers(myStatus.value);
}

/** Unigram MemberRemove：非创建者/不可编辑管理员/自己；有 restrict 权限 */
function canRemoveTarget(m: chatMember): boolean {
  if (isCreatorStatus(m.status)) return false;
  if (isSelf(m)) return false;
  if (m.status._ === 'chatMemberStatusAdministrator' && !m.status.can_be_edited) {
    // 基本群管理员：仅当自己是邀请人时可移除
    return isBasic.value ? m.inviter_user_id === myUserId.value : false;
  }
  return canRestrictMembers(myStatus.value);
}

/**
 * 右键菜单：
 *  成员/订阅者 → 「设置为管理员」（盾牌）+「限制」（密钥，仅群组）+「从频道/群组中移除」
 *  管理员 → 仅「权限设置」
 *  封禁 → 加回群组 / 从列表移除
 */
function openMenu(e: MouseEvent, m: chatMember) {
  // 阻止冒泡到 main.ts 的全局 contextmenu（那里会 closeContextMenu）
  e.preventDefault();
  e.stopPropagation();
  const items: ContextMenuItem[] = [];
  if (props.mode === 'members') {
    if (canPromoteTarget(m)) {
      items.push({
        key: 'promote',
        label: t('groupEdit.promote'),
        icon: ShieldAdminIcon,
        onClick: () => openAdmin(m),
      });
    }
    if (canRestrictTarget(m)) {
      items.push({
        key: 'restrict',
        label: t('groupEdit.restrict'),
        icon: RestrictKeyIcon,
        onClick: () => openRestrict(m),
      });
    }
    if (canRemoveTarget(m)) {
      items.push({
        key: 'remove',
        label: isChannel.value ? t('groupEdit.removeFromChannel') : t('groupEdit.removeFromGroup'),
        icon: Trash2Icon,
        danger: true,
        onClick: () => removeFromChat(m),
      });
    }
  } else if (props.mode === 'admins') {
    items.push({
      key: 'edit',
      label: t('lng_rights_edit_admin'),
      icon: ShieldAdminIcon,
      onClick: () => openAdmin(m),
    });
  } else if (props.mode === 'blacklist') {
    items.push({
      key: 'add-back',
      label: isChannel.value ? t('lng_channel_add_users') : t('lng_context_add_to_group'),
      icon: UserPlusIcon,
      onClick: () => addToChat(m),
    });
    items.push({
      key: 'delete-from-list',
      label: t('lng_group_invite_context_delete'),
      icon: Trash2Icon,
      danger: true,
      onClick: () => deleteFromList(m),
    });
  }
  if (!items.length) return;
  openContextMenu(e.clientX, e.clientY, items, e.currentTarget as HTMLElement);
}

async function openAdmin(m: chatMember) {
  // 拉取完整成员状态（含管理员权限），避免列表摘要缺 rights
  let full = m;
  const uid = memberUserId(m);
  if (uid) {
    try {
      full = await tdlibSend({
        _: 'getChatMember',
        chat_id: chatId.value,
        member_id: { _: 'messageSenderUser', user_id: uid },
      });
    } catch {
      /* 保留列表项 */
    }
  }
  selected.value = full;
  adminVisible.value = true;
}

async function openRestrict(m: chatMember) {
  let full = m;
  const uid = memberUserId(m);
  if (uid) {
    try {
      full = await tdlibSend({
        _: 'getChatMember',
        chat_id: chatId.value,
        member_id: { _: 'messageSenderUser', user_id: uid },
      });
    } catch {
      /* 保留列表项 */
    }
  }
  selected.value = full;
  restrictVisible.value = true;
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void reload(), 300);
}

async function reload() {
  loading.value = true;
  try {
    const { chat: c, status, supergroup } = await loadMyChatMemberStatus(chatId.value);
    chat.value = c;
    myStatus.value = status;
    if (!myUserId.value) {
      try {
        myUserId.value = (await tdlibSend({ _: 'getMe' })).id;
      } catch {
        myUserId.value = 0;
      }
    }
    if (!c) return;
    if (props.mode === 'admins' && supergroup) {
      signMessages.value = !!supergroup.sign_messages;
      showMessageSender.value = !!(supergroup as any).show_message_sender;
    }
    if (props.mode === 'admins' && c.type._ === 'chatTypeSupergroup') {
      try {
        const full = await tdlibSend({
          _: 'getSupergroupFullInfo',
          supergroup_id: c.type.supergroup_id,
        });
        antiSpam.value = !!(full as any).has_aggressive_anti_spam_enabled;
        canToggleAntiSpam.value = !isChannel.value && !!(full as any).can_toggle_aggressive_anti_spam;
        canHideMembers.value = !!(full as any).can_hide_members;
        hasHiddenMembers.value = !!(full as any).has_hidden_members;
      } catch {
        canToggleAntiSpam.value = false;
      }
    }
    const filter =
      props.mode === 'admins'
        ? 'administrators'
        : props.mode === 'blacklist'
          ? 'banned'
          : query.value.trim()
            ? 'search'
            : 'recent';
    let list: chatMember[];
    if (props.mode === 'members' && !query.value.trim()) {
      // Unigram ChatMemberGroupedCollection：联系人 → 机器人 → 其他，服务端过滤后合并去重
      const [contacts, bots, recent] = await Promise.all([
        loadGroupMembers(c, 'contacts', '', 0, 100),
        loadGroupMembers(c, 'bots', '', 0, 100),
        loadGroupMembers(c, 'recent', '', 0, 100),
      ]);
      const seen = new Set<number>();
      list = [];
      for (const m of [...contacts, ...bots, ...recent]) {
        const uid = memberUserId(m);
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        list.push(m);
      }
    } else {
      list = await loadGroupMembers(c, filter as any, query.value.trim(), 0, 100);
    }
    // 先加载成员/操作人，再写入列表并强制刷新，保证「被谁封禁/设置」文案渲染
    await ensureMemberUsers(list);
    members.value = [...list];
  } catch (e) {
    console.error('GroupMemberList load failed', e);
  } finally {
    loading.value = false;
  }
}

watch([() => route.params.id, () => props.mode], () => {
  if (hasChatId.value) void reload();
});

onMounted(() => {
  if (hasChatId.value) void reload();
  else loading.value = false;
});
</script>
