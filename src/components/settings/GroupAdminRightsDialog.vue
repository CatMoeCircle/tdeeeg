<template>
  <ModalDialog :model-value="modelValue" :title="dialogTitle" @update:model-value="close">
    <div class="space-y-4">
      <!-- 头衔（群组，频道隐藏 — EditRank；添加机器人时还没有头衔） -->
      <div v-if="!isChannel && !addingBot">
        <label class="text-xs text-gray-400">{{ t('lng_rights_edit_admin_rank_name') }}</label>
        <input v-model="customTitle" type="text" maxlength="16"
          :placeholder="isCreatorSelf ? t('lng_rights_group_anonymous') : t('lng_admin_log_admin_change_info')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          :disabled="!canEdit" />
        <p class="text-xs text-gray-400 mt-1">{{ t('lng_rights_edit_admin_rank_about', { name: t('lng_rights_group_anonymous') }) }}</p>
      </div>

      <p v-if="!canEdit" class="text-xs text-amber-600">{{ t('lng_rights_about_admin_cant_edit') }}</p>

      <!-- 添加机器人：群组可选择「以普通成员身份加入」（对齐官方客户端 EditAdminBox） -->
      <div v-if="addingBot && botCanChooseMember"
        class="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_bot_as_admin_check') }}</p>
        </div>
        <ToggleSwitch v-model="addAsAdmin" />
      </div>

      <div v-if="showAdminRights" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800"
        :class="!canEdit ? 'opacity-60 pointer-events-none' : ''">
        <!-- 修改资料 -->
        <div class="flex items-center gap-3 px-4 py-2.5" :class="lockChangeInfo ? 'opacity-50' : ''">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ isChannel ? t('lng_rights_channel_info') : t('lng_rights_group_info') }}</p>
          </div>
          <ToggleSwitch v-model="rights.can_change_info" :disabled="lockChangeInfo || !canEdit" />
        </div>

        <!-- 管理消息（仅频道：发/编/删） -->
        <template v-if="isChannel">
          <div class="px-4 py-2.5">
            <div class="flex items-center gap-3">
              <button type="button" class="w-5 h-5 flex items-center justify-center text-gray-400 shrink-0"
                @click="msgExpanded = !msgExpanded">
                <ChevronRightIcon class="w-4 h-4 transition-transform" :class="msgExpanded ? 'rotate-90' : ''" />
              </button>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">
                  {{ t('lng_rights_channel_manage') }}
                  <span class="text-xs font-semibold text-gray-400 ml-1">{{ manageMsgCount }}/3</span>
                </p>
              </div>
              <ToggleSwitch :model-value="manageMsgAll" :disabled="!canEdit" @update:model-value="onManageMsgAll" />
            </div>
            <div v-if="msgExpanded" class="mt-2 ml-7 space-y-1">
              <div class="flex items-center gap-3 px-2 py-1">
                <div class="min-w-0 flex-1"><p class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_rights_channel_post') }}</p></div>
                <ToggleSwitch v-model="rights.can_post_messages" :disabled="!canEdit || !grantable('can_post_messages')" />
              </div>
              <div class="flex items-center gap-3 px-2 py-1">
                <div class="min-w-0 flex-1"><p class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_rights_channel_edit') }}</p></div>
                <ToggleSwitch v-model="rights.can_edit_messages" :disabled="!canEdit || !grantable('can_edit_messages')" />
              </div>
              <div class="flex items-center gap-3 px-2 py-1">
                <div class="min-w-0 flex-1"><p class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_rights_channel_delete') }}</p></div>
                <ToggleSwitch v-model="rights.can_delete_messages" :disabled="!canEdit || !grantable('can_delete_messages')" />
              </div>
            </div>
          </div>
        </template>
        <!-- 删除消息（仅群组独立项） -->
        <div v-else class="flex items-center gap-3 px-4 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_rights_group_delete') }}</p>
          </div>
          <ToggleSwitch v-model="rights.can_delete_messages" :disabled="!canEdit" />
        </div>

        <!-- 管理动态 -->
        <div class="px-4 py-2.5">
          <div class="flex items-center gap-3">
            <button type="button" class="w-5 h-5 flex items-center justify-center text-gray-400 shrink-0"
              @click="storyExpanded = !storyExpanded">
              <ChevronRightIcon class="w-4 h-4 transition-transform" :class="storyExpanded ? 'rotate-90' : ''" />
            </button>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100">
                {{ t('lng_rights_channel_manage_stories') }}
                <span class="text-xs font-semibold text-gray-400 ml-1">{{ manageStoryCount }}/3</span>
              </p>
            </div>
            <ToggleSwitch :model-value="manageStoryAll" :disabled="!canEdit" @update:model-value="onManageStoryAll" />
          </div>
          <div v-if="storyExpanded" class="mt-2 ml-7 space-y-1">
            <div class="flex items-center gap-3 px-2 py-1">
              <div class="min-w-0 flex-1"><p class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_rights_channel_post_stories') }}</p></div>
              <ToggleSwitch v-model="rights.can_post_stories" :disabled="!canEdit" />
            </div>
            <div class="flex items-center gap-3 px-2 py-1">
              <div class="min-w-0 flex-1"><p class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_rights_channel_edit_stories') }}</p></div>
              <ToggleSwitch v-model="rights.can_edit_stories" :disabled="!canEdit" />
            </div>
            <div class="flex items-center gap-3 px-2 py-1">
              <div class="min-w-0 flex-1"><p class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_rights_channel_delete_stories') }}</p></div>
              <ToggleSwitch v-model="rights.can_delete_stories" :disabled="!canEdit" />
            </div>
          </div>
        </div>

        <div v-for="row in rows" :key="row.key" class="flex items-center gap-3 px-4 py-2.5"
          :class="row.locked ? 'opacity-50' : ''">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ row.label }}</p>
          </div>
          <ToggleSwitch v-model="(rights as any)[row.key]" :disabled="row.locked || !canEdit" />
        </div>
      </div>
    </div>
    <template #footer>
      <!-- 仅保存 / 取消（不放转让、卸任） -->
      <BaseButton type="button" variant="ghost"
        @click="close">{{ t('lng_cancel') }}</BaseButton>
      <BaseButton v-if="canEdit" type="button" @click="save" :disabled="saving" variant="primary">
        {{ saving ? t('lng_context_seen_loading') : saveLabel }}
      </BaseButton>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight as ChevronRightIcon } from 'lucide-vue-next';
import { toast } from '../../utils/ui/toast';
import ModalDialog from '../ui/modal/ModalDialog.vue';
import ToggleSwitch from '../ui/toggle/ToggleSwitch.vue';
import { tdlibSend } from '../../utils/session/tdlib';
import { emptyAdminRights } from '../../utils/chat/groupRights';
import { getReactiveChat } from '../../utils/profile/senderInfo';
import type { chatAdministratorRights, chatMember, chatPermissions, MessageSender } from 'tdlib-types';
import BaseButton from '../ui/button/BaseButton.vue';

const props = defineProps<{
  modelValue: boolean;
  chatId: number;
  member?: chatMember | null;
  isChannel?: boolean;
  isForum?: boolean;
  /** 是否群主：仅群主可授予全部权限；非群主只能改自己拥有的子集 */
  isOwner?: boolean;
  /** 我自己的管理员权限（非群主时用于限制可改项） */
  myRights?: chatAdministratorRights | null;
  /** 默认成员权限：已对全员开启的项不可单独关闭（IsEnabled 逻辑） */
  defaultPermissions?: chatPermissions | null;
  /**
   * 添加机器人场景（对齐官方客户端 EditAdminBox 的添加模式）：
   * - 标题改为「添加机器人」，按钮为「以管理员/成员身份添加机器人」
   * - 频道恒为管理员；群组可通过开关改为普通成员加入
   */
  addBot?: {
    userId: number;
    /** 机器人请求的默认管理员权限（按频道/群组区分，可为空） */
    rights?: chatAdministratorRights | null;
    /** 群组：是否允许「作为普通成员加入」 */
    allowMember?: boolean;
    /** 打开时是否默认勾选「管理员权限」（频道恒为 true） */
    startAsAdmin?: boolean;
  } | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
  added: [];
}>();

const { t } = useI18n();
const saving = ref(false);
const customTitle = ref('');
const rights = reactive<chatAdministratorRights>(emptyAdminRights());
const msgExpanded = ref(false);
const storyExpanded = ref(false);
/** 添加机器人：是否以管理员身份加入（机器人有申请时默认开，否则默认关闭、由用户决定） */
const addAsAdmin = ref(true);

const addingBot = computed(() => !!props.addBot);
/** 仅群组可切换为普通成员；频道里的机器人只能作为管理员 */
const botCanChooseMember = computed(() => !!props.addBot?.allowMember && !props.isChannel);
const showAdminRights = computed(
  () => !addingBot.value || !botCanChooseMember.value || addAsAdmin.value,
);
const dialogTitle = computed(() =>
  addingBot.value ? t('lng_bot_add_title') : t('lng_rights_edit_admin'),
);
const saveLabel = computed(() => {
  if (!addingBot.value) return t('lng_settings_save');
  return addAsAdmin.value && showAdminRights.value
    ? t('lng_bot_add_as_admin')
    : t('lng_bot_add_as_member');
});

const isCreatorSelf = computed(() => props.member?.status?._ === 'chatMemberStatusCreator');
/** canBeEdited：创建者=自己，或管理员 can_be_edited；新成员/机器人可编辑 */
const canEdit = computed(() => {
  if (addingBot.value) return true;
  const st = props.member?.status;
  if (!st) return true;
  if (st._ === 'chatMemberStatusCreator') return isCreatorSelf.value;
  if (st._ === 'chatMemberStatusAdministrator') return st.can_be_edited;
  return true;
});

/** 非群主时，只能授予自己拥有的权限（子集） */
function grantable(key: keyof chatAdministratorRights): boolean {
  if (props.isOwner || isCreatorSelf.value) return true;
  const mine = props.myRights;
  if (!mine) return false;
  return !!(mine as any)[key];
}

const lockChangeInfo = computed(
  () => !!props.defaultPermissions?.can_change_info || !grantable('can_change_info'),
);
const lockPin = computed(
  () => !!props.defaultPermissions?.can_pin_messages || !grantable('can_pin_messages'),
);

const manageMsgKeys = ['can_post_messages', 'can_edit_messages', 'can_delete_messages'] as const;
const manageStoryKeys = ['can_post_stories', 'can_edit_stories', 'can_delete_stories'] as const;
const manageMsgCount = computed(() => manageMsgKeys.filter((k) => rights[k]).length);
const manageStoryCount = computed(() => manageStoryKeys.filter((k) => rights[k]).length);
const manageMsgAll = computed(() => manageMsgCount.value === 3);
const manageStoryAll = computed(() => manageStoryCount.value === 3);

function onManageMsgAll(v: boolean) {
  for (const k of manageMsgKeys) rights[k] = v;
}
function onManageStoryAll(v: boolean) {
  for (const k of manageStoryKeys) rights[k] = v;
}

/** UpdateMember 可见性矩阵 */
const rows = computed(() => {
  const list: { key: keyof chatAdministratorRights; label: string; locked?: boolean }[] = [];
  // 封禁用户
  list.push({
    key: 'can_restrict_members',
    label: t('lng_rights_group_ban'),
    locked: !grantable('can_restrict_members'),
  });
  // 管理私信：仅频道
  if (props.isChannel) {
    list.push({
      key: 'can_manage_direct_messages',
      label: t('lng_rights_channel_manage_direct'),
      locked: !grantable('can_manage_direct_messages'),
    });
  }
  // 邀请
  list.push({
    key: 'can_invite_users',
    label: props.defaultPermissions?.can_invite_users
      ? t('lng_rights_group_invite_link')
      : t('lng_rights_chat_add_members'),
    locked: !grantable('can_invite_users'),
  });
  // 置顶：仅群组
  if (!props.isChannel) {
    list.push({ key: 'can_pin_messages', label: t('lng_rights_group_pin'), locked: lockPin.value });
  }
  // 话题：仅论坛
  if (props.isForum) {
    list.push({
      key: 'can_manage_topics',
      label: t('lng_rights_group_topics'),
      locked: !grantable('can_manage_topics'),
    });
  }
  // 视频聊天
  list.push({
    key: 'can_manage_video_chats',
    label: t('lng_rights_group_manage_calls'),
    locked: !grantable('can_manage_video_chats'),
  });
  // 添加管理员
  list.push({
    key: 'can_promote_members',
    label: t('lng_rights_add_admins'),
    locked: !grantable('can_promote_members'),
  });
  // 匿名：仅群组
  if (!props.isChannel) {
    list.push({
      key: 'is_anonymous',
      label: t('lng_rights_group_anonymous'),
      locked: !grantable('is_anonymous'),
    });
  }
  return list;
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    if (addingBot.value) {
      // 添加机器人：预填机器人向 BotFather 申请的管理员权限
      addAsAdmin.value = props.addBot?.startAsAdmin ?? true;
      customTitle.value = '';
      resetRights(props.addBot?.rights);
      return;
    }
    customTitle.value = props.member?.tag ?? '';
    const st = props.member?.status;
    resetRights(st?._ === 'chatMemberStatusAdministrator' ? st.rights : null);
    if (st?._ === 'chatMemberStatusCreator') {
      customTitle.value = props.member?.tag ?? '';
    }
  },
);

/** 重置权限面板：先清零上一次打开残留的字段，再套用默认权限 + 传入权限 */
function resetRights(source?: chatAdministratorRights | null) {
  const target = rights as unknown as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (key !== '_') target[key] = false;
  }
  const fresh = { ...emptyAdminRights(), ...(source ?? {}) };
  Object.assign(rights, fresh);
}

function close() {
  emit('update:modelValue', false);
}

/** 保存时按频道/群组掩码（频道不支持群组权限，群组不支持频道权限） */
function maskedRights(): chatAdministratorRights {
  return {
    ...rights,
    can_post_messages: props.isChannel ? rights.can_post_messages : false,
    can_edit_messages: props.isChannel ? rights.can_edit_messages : false,
    can_manage_direct_messages: props.isChannel ? rights.can_manage_direct_messages : false,
    can_pin_messages: props.isChannel ? false : rights.can_pin_messages,
    can_manage_topics: props.isForum ? rights.can_manage_topics : false,
    is_anonymous: props.isChannel ? false : rights.is_anonymous,
  };
}

/** 是否有任何实质管理员权限（无权限时管理员身份没有意义） */
function meaningfulRights(): boolean {
  return rights.can_change_info
    || rights.can_delete_messages
    || rights.can_invite_users
    || rights.can_restrict_members
    || rights.can_promote_members
    || rights.can_post_messages
    || rights.can_edit_messages
    || rights.can_post_stories
    || rights.can_edit_stories
    || rights.can_delete_stories
    || rights.can_manage_video_chats
    || rights.can_manage_topics
    || rights.can_manage_direct_messages;
}

async function save() {
  if (addingBot.value) {
    await saveAddBot();
    return;
  }
  if (!props.member) return;
  const userId = (props.member.member_id as MessageSender & { user_id?: number }).user_id;
  if (!userId) return;
  saving.value = true;
  try {
    const meaningful = meaningfulRights();
    const status = meaningful
      ? { _: 'chatMemberStatusAdministrator' as const, can_be_edited: true, rights: maskedRights() }
      : { _: 'chatMemberStatusMember' as const, member_until_date: 0 };
    await tdlibSend({
      _: 'setChatMemberStatus',
      chat_id: props.chatId,
      member_id: { _: 'messageSenderUser', user_id: userId },
      status: status as any,
    });
    if (meaningful && !props.isChannel && customTitle.value.trim()) {
      try {
        await tdlibSend({
          _: 'setChatMemberTag',
          chat_id: props.chatId,
          user_id: userId,
          tag: customTitle.value.trim().slice(0, 16),
        } as any);
      } catch {
        /* tag 可选 */
      }
    }
    toast.success(t('lng_settings_save'));
    emit('changed');
    close();
  } catch (e: any) {
    toast.error(e?.message || t('lng_settings_save'));
  } finally {
    saving.value = false;
  }
}

/**
 * 添加机器人：
 * - 管理员：setChatMemberStatus(administrator) 一步完成「加入 + 设为管理员」
 *   （TDLib 对非成员会先 add_chat_participant / channels.editAdmin，官方客户端同样走这里）
 * - 普通成员：addChatMember
 */
async function saveAddBot() {
  const bot = props.addBot;
  if (!bot?.userId) return;
  saving.value = true;
  try {
    const asAdmin = addAsAdmin.value && showAdminRights.value;
    if (asAdmin) {
      const finalRights = grantableMask(maskedRights());
      await tdlibSend({
        _: 'setChatMemberStatus',
        chat_id: props.chatId,
        member_id: { _: 'messageSenderUser', user_id: bot.userId },
        status: {
          _: 'chatMemberStatusAdministrator' as const,
          can_be_edited: true,
          rights: finalRights,
        },
      } as any);
    } else {
      await tdlibSend({
        _: 'addChatMember',
        chat_id: props.chatId,
        user_id: bot.userId,
      } as any);
    }
    const title = getReactiveChat(props.chatId)?.title ?? '';
    toast.success(t('user.addedToChat', { group: title }));
    emit('added');
    close();
  } catch (e: any) {
    toast.error(e?.message || t('user.addBotFailed'));
  } finally {
    saving.value = false;
  }
}

/**
 * 非群主只能授予自己拥有的权限：机器人在 BotFather 申请的权限可能超出我的可授予范围，
 * 保存前按官方客户端（EditAdminBox 的 myEditableRights 掩码）取交集，避免服务端报权限不足。
 */
function grantableMask(source: chatAdministratorRights): chatAdministratorRights {
  if (props.isOwner || !props.myRights) return source;
  const mine = props.myRights as unknown as Record<string, unknown>;
  const out = { ...source } as unknown as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (key === '_') continue;
    if (out[key] === true && mine[key] !== true) out[key] = false;
  }
  return out as unknown as chatAdministratorRights;
}
</script>
