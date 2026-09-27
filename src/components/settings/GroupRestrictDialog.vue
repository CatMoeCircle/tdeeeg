<template>
  <ModalDialog :model-value="modelValue" :title="t('lng_rights_user_restrictions')" @update:model-value="close">
    <div class="space-y-4">
      <!-- 用户信息：头像 + 名称 + 状态 -->
      <div class="flex items-center gap-3">
        <Avatar :photo="user?.profile_photo" :title="userName" :deletedAccount="isDeleted"
          sizeClass="!w-12 !h-12" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ userName }}</p>
          <p class="text-xs text-gray-400 mt-0.5">{{ statusText }}</p>
        </div>
      </div>

      <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        <div v-for="row in rows" :key="row.key" class="flex items-center gap-3 px-4 py-2.5"
          :class="row.locked ? 'opacity-50' : ''">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100">{{ row.label }}</p>
          </div>
          <ToggleSwitch v-model="(form as any)[row.key]" :disabled="row.locked" />
        </div>
      </div>

      <!-- 限制时长：预设 + 自定义（≥60 秒） -->
      <div>
        <p class="text-xs font-medium text-blue-500 mb-1">{{ t('lng_rights_chat_banned_until_header') }}</p>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 divide-y divide-gray-100 dark:divide-gray-800">
          <button v-for="opt in presetOptions" :key="opt.value" type="button"
            class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="selectPreset(opt.value)">
            <span class="text-sm" :class="!isCustomSelected && duration === opt.value
              ? 'text-blue-500'
              : 'text-gray-800 dark:text-gray-100'">{{ opt.label }}</span>
            <span class="radio-dot shrink-0" :class="!isCustomSelected && duration === opt.value ? 'radio-dot-on' : ''" />
          </button>
          <button type="button"
            class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="selectCustom">
            <span class="text-sm" :class="isCustomSelected ? 'text-blue-500' : 'text-gray-800 dark:text-gray-100'">
              {{ t('lng_settings_ttl_after_custom') }}
            </span>
            <span class="radio-dot shrink-0" :class="isCustomSelected ? 'radio-dot-on' : ''" />
          </button>
          <div v-if="isCustomSelected" class="px-4 py-3 space-y-3">
            <div class="flex items-center gap-2">
              <label v-for="field in customFields" :key="field.key"
                class="flex-1 min-w-0 flex flex-col items-center gap-1">
                <span class="text-xs text-gray-400">{{ field.label }}</span>
                <input v-model.number="customParts[field.key]" type="number" :min="0" :max="field.max"
                  inputmode="numeric"
                  class="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>
            <p v-if="customError" class="text-xs text-red-500">{{ customError }}</p>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <button type="button" @click="ban"
        class="px-4 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
        {{ t('lng_ban_specific_user', { user: userName }) }}
      </button>
      <button type="button" class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="close">{{ t('lng_cancel') }}</button>
      <button type="button" @click="save" :disabled="saving || (isCustomSelected && !!customError)"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
        {{ saving ? t('lng_context_seen_loading') : t('lng_settings_save') }}
      </button>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import ModalDialog from './ModalDialog.vue';
import ToggleSwitch from './ToggleSwitch.vue';
import Avatar from '../chat/avatar.vue';
import { tdlibSend } from '../../utils/tdlib';
import { defaultMemberPermissions, userNameOf, isDeletedMember, memberUserId } from '../../utils/groupRights';
import { getReactiveUser } from '../../utils/senderInfo';
import formatStatus from '../../utils/status';
import type { chatMember, chatPermissions, MessageSender, user } from 'tdlib-types';

const props = defineProps<{
  modelValue: boolean;
  chatId: number;
  member?: chatMember | null;
  /** 默认成员权限：对应项默认关闭时不可勾选（Unigram IsEnabled = chat.Permissions.X） */
  defaultPermissions?: chatPermissions | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
}>();

const { t } = useI18n();
const saving = ref(false);
const duration = ref(0);
const isCustomSelected = ref(false);
const customParts = reactive({ days: 0, hours: 0, minutes: 1, seconds: 0 });
const form = reactive(defaultMemberPermissions());

const DAY = 86400;

const user = computed<user | undefined>(() => {
  const uid = props.member ? memberUserId(props.member) : undefined;
  return uid ? getReactiveUser(uid) : undefined;
});

const userName = computed(() => {
  const uid = props.member ? memberUserId(props.member) : undefined;
  return uid ? userNameOf(uid) : '';
});

const isDeleted = computed(() => {
  const uid = props.member ? memberUserId(props.member) : undefined;
  return isDeletedMember(uid);
});

const statusText = computed(() => formatStatus(user.value));

const presetOptions = computed(() => [
  { value: 3600, label: t('lng_rights_slowmode_hours', { count: 1 }) },
  { value: 86400, label: t('lng_rights_chat_banned_day', { count: 1 }) },
  { value: 7 * 86400, label: t('lng_rights_chat_banned_week', { count: 1 }) },
  { value: 30 * 86400, label: t('lng_rights_chat_banned_day', { count: 30 }) },
  { value: 0, label: t('lng_rights_chat_banned_forever') },
]);

const customFields = computed(() => [
  { key: 'days' as const, label: t('privacy.unitDays'), max: 364 },
  { key: 'hours' as const, label: t('privacy.unitHours'), max: 23 },
  { key: 'minutes' as const, label: t('privacy.unitMinutes'), max: 59 },
  { key: 'seconds' as const, label: t('privacy.unitSeconds'), max: 59 },
]);

const customSeconds = computed(() =>
  customParts.days * DAY + customParts.hours * 3600 + customParts.minutes * 60 + customParts.seconds,
);

const customError = computed(() => {
  if (!isCustomSelected.value) return '';
  if (customSeconds.value < 60) return t('privacy.minRestrictSeconds');
  if (customSeconds.value > 365 * DAY) return t('privacy.maxOneYear');
  return '';
});

function applySecondsToCustom(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  customParts.days = Math.floor(total / DAY);
  customParts.hours = Math.floor((total % DAY) / 3600);
  customParts.minutes = Math.floor((total % 3600) / 60);
  customParts.seconds = total % 60;
}

function selectPreset(value: number) {
  isCustomSelected.value = false;
  duration.value = value;
}

function selectCustom() {
  isCustomSelected.value = true;
  if (duration.value > 0) applySecondsToCustom(duration.value);
  else if (customSeconds.value < 60) {
    customParts.days = 0;
    customParts.hours = 0;
    customParts.minutes = 1;
    customParts.seconds = 0;
  }
}

/** Unigram：每项 IsEnabled 跟随默认权限 */
function locked(key: keyof chatPermissions): boolean {
  const p = props.defaultPermissions;
  if (!p) return false;
  return !(p as any)[key];
}

const rows = computed(() => [
  { key: 'can_send_basic_messages', label: t('lng_rights_chat_send_text'), locked: locked('can_send_basic_messages') },
  { key: 'can_send_photos', label: t('lng_rights_chat_photos'), locked: locked('can_send_photos') },
  { key: 'can_send_videos', label: t('lng_rights_chat_videos'), locked: locked('can_send_videos') },
  { key: 'can_send_other_messages', label: t('lng_rights_chat_stickers'), locked: locked('can_send_other_messages') },
  { key: 'can_send_audios', label: t('lng_rights_chat_music'), locked: locked('can_send_audios') },
  { key: 'can_send_documents', label: t('lng_rights_chat_files'), locked: locked('can_send_documents') },
  { key: 'can_send_voice_notes', label: t('lng_rights_chat_voice_messages'), locked: locked('can_send_voice_notes') },
  { key: 'can_send_video_notes', label: t('lng_rights_chat_video_messages'), locked: locked('can_send_video_notes') },
  { key: 'can_send_polls', label: t('lng_rights_chat_send_polls'), locked: locked('can_send_polls') },
  { key: 'can_add_link_previews', label: t('lng_rights_chat_send_links'), locked: locked('can_add_link_previews') },
  { key: 'can_invite_users', label: t('lng_rights_chat_add_members'), locked: locked('can_invite_users') },
  { key: 'can_pin_messages', label: t('lng_rights_group_pin'), locked: locked('can_pin_messages') },
  { key: 'can_change_info', label: t('lng_rights_group_info'), locked: locked('can_change_info') },
  { key: 'can_edit_tag', label: t('lng_rights_group_edit_rank_single'), locked: locked('can_edit_tag') },
]);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const st = props.member?.status;
    const base = defaultMemberPermissions(props.defaultPermissions);
    if (st?._ === 'chatMemberStatusRestricted') {
      Object.assign(form, defaultMemberPermissions(st.permissions));
      duration.value = Math.max(0, st.restricted_until_date - Math.floor(Date.now() / 1000));
    } else {
      // Unigram：未限制时取默认权限
      Object.assign(form, base);
      duration.value = 0;
    }
    isCustomSelected.value =
      duration.value > 0 && !presetOptions.value.some((o) => o.value === duration.value);
    applySecondsToCustom(duration.value > 0 ? duration.value : 60);
  },
);

function close() {
  emit('update:modelValue', false);
}

function userIdOf(): number | undefined {
  return (props.member?.member_id as MessageSender & { user_id?: number } | undefined)?.user_id;
}

function resolveDuration(): number {
  if (isCustomSelected.value) return customSeconds.value;
  return duration.value;
}

async function save() {
  const userId = userIdOf();
  if (!userId) return;
  const seconds = resolveDuration();
  if (isCustomSelected.value && (customError.value || seconds < 60)) return;
  saving.value = true;
  try {
    const until = seconds > 0 ? Math.floor(Date.now() / 1000) + seconds : 0;
    const { _: _ignored, ...rest } = form as chatPermissions;
    const permissions: chatPermissions = { _: 'chatPermissions', ...rest };
    await tdlibSend({
      _: 'setChatMemberStatus',
      chat_id: props.chatId,
      member_id: { _: 'messageSenderUser', user_id: userId },
      status: {
        _: 'chatMemberStatusRestricted',
        is_member: true,
        restricted_until_date: until,
        permissions,
      },
    });
    MessagePlugin.success(t('lng_settings_save'));
    emit('changed');
    close();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  } finally {
    saving.value = false;
  }
}

async function ban() {
  const userId = userIdOf();
  if (!userId) return;
  saving.value = true;
  try {
    await tdlibSend({
      _: 'banChatMember',
      chat_id: props.chatId,
      member_id: { _: 'messageSenderUser', user_id: userId },
      revoke_messages: true,
    });
    MessagePlugin.success(t('lng_rights_group_ban'));
    emit('changed');
    close();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
/* 与 AutoDeleteDialog 同款单选圆点 */
.radio-dot {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 2px solid #d1d5db;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.radio-dot-on {
  border-color: #3b82f6;
}

.radio-dot-on::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #3b82f6;
}

@media (prefers-color-scheme: dark) {
  .radio-dot {
    border-color: #4b5563;
  }

  .radio-dot-on {
    border-color: #3b82f6;
  }
}
</style>
