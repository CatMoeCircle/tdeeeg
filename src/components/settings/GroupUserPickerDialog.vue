<template>
  <ModalDialog :model-value="modelValue" :title="title" @update:model-value="close">
    <div class="space-y-3">
      <input v-model="query" type="search" :placeholder="t('lng_dlg_filter')"
        class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        @input="onSearch" />
      <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto custom-scrollbar">
        <button v-for="u in users" :key="u.id" type="button"
          class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click="pick(u)">
          <div class="w-9 h-9 shrink-0">
            <Avatar :photo="u.profile_photo" :title="nameOf(u)" :deletedAccount="isDeletedUser(u)" sizeClass="!w-9 !h-9" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ nameOf(u) }}</p>
            <p class="text-xs text-gray-400 mt-0.5">{{ u.usernames?.active_usernames?.[0] ? '@' + u.usernames.active_usernames[0] : (u.phone_number || '') }}</p>
          </div>
        </button>
        <div v-if="!loading && users.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
          {{ t('lng_admin_log_empty_text') }}
        </div>
        <div v-if="loading" class="px-4 py-6 text-center text-sm text-gray-400">{{ t('lng_context_seen_loading') }}</div>
      </div>
    </div>
    <template #footer>
      <button type="button" class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="close">{{ t('lng_cancel') }}</button>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from './ModalDialog.vue';
import Avatar from '../chat/avatar.vue';
import { tdlibSend } from '../../utils/tdlib';
import { ensureUser, getReactiveUser, isDeletedUser, DELETED_ACCOUNT_LABEL } from '../../utils/senderInfo';
import type { user } from 'tdlib-types';

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  /** 有值时优先在该群成员中搜索（封禁）；否则搜联系人（添加成员） */
  chatId?: number;
  /** 排除的 user id */
  excludeIds?: number[];
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  select: [user: user];
}>();

const { t } = useI18n();
const query = ref('');
const users = ref<user[]>([]);
const loading = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const title = ref(props.title || t('lng_channel_add_members'));

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    title.value = props.title || t('lng_channel_add_members');
    query.value = '';
    void reload();
  },
);

function nameOf(u: user): string {
  if (isDeletedUser(u)) return DELETED_ACCOUNT_LABEL;
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || t('lng_credits_box_history_entry_anonymous');
}

function close() {
  emit('update:modelValue', false);
}

function pick(u: user) {
  emit('select', u);
  close();
}

function onSearch() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void reload(), 250);
}

async function reload() {
  loading.value = true;
  try {
    const exclude = new Set(props.excludeIds ?? []);
    let ids: number[] = [];
    if (props.chatId) {
      // 群内搜索成员
      try {
        const res = await tdlibSend({
          _: 'searchChatMembers',
          chat_id: props.chatId,
          query: query.value.trim(),
          limit: 50,
          filter: null,
        } as any);
        ids = (res.members ?? [])
          .map((m: any) => (m.member_id?._ === 'messageSenderUser' ? m.member_id.user_id as number : 0))
          .filter((id: number) => id > 0 && !exclude.has(id));
      } catch {
        ids = [];
      }
    }
    if (ids.length === 0) {
      const res = await tdlibSend({
        _: 'searchContacts',
        query: query.value.trim(),
        limit: 50,
      });
      ids = (res.user_ids ?? []).filter((id) => !exclude.has(id));
    }
    await Promise.all(ids.map((id) => ensureUser(id)));
    users.value = ids
      .map((id) => getReactiveUser(id))
      .filter((u): u is user => !!u && !isDeletedUser(u));
  } catch (e) {
    console.error('GroupUserPicker load failed', e);
    users.value = [];
  } finally {
    loading.value = false;
  }
}
</script>
