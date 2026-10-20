<template>
  <ModalDialog :model-value="modelValue"
    :title="isChannel ? t('newChat.newChannel') : t('newChat.newGroup')" @update:model-value="close">
    <div class="space-y-4">
      <div class="flex items-start gap-4">
        <!-- 头像：仅本地预览，创建后用 setChatPhoto 提交（不做裁剪） -->
        <button type="button" :aria-label="t('avatar.pickImage')"
          class="w-16 h-16 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:opacity-90 transition-opacity"
          @click="pickPhoto">
          <img v-if="photoPreview" :src="photoPreview" class="w-full h-full object-cover" alt="" />
          <CameraIcon v-else class="w-6 h-6 text-gray-400" />
        </button>
        <div class="flex-1 min-w-0 space-y-3">
          <input v-model="title" type="text" maxlength="128"
            :placeholder="isChannel ? t('lng_dlg_new_channel_name') : t('lng_dlg_new_group_name')"
            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <textarea v-model="about" rows="2" maxlength="255"
            :placeholder="isChannel ? t('newChat.channelAboutPh') : t('newChat.groupAboutPh')"
            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <!-- 群组：创建时直接拉人（频道没有成员概念，加入走订阅） -->
      <div v-if="!isChannel">
        <button type="button"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click="pickerVisible = true">
          <UsersIcon class="w-4 h-4 text-gray-400 shrink-0" />
          <span class="text-sm text-gray-700 dark:text-gray-200 flex-1 text-left">{{ t('newChat.addMembers') }}</span>
          <span v-if="members.length" class="text-xs text-gray-400">{{ members.length }}</span>
          <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
        </button>
        <div v-if="members.length" class="mt-2 flex flex-wrap gap-1.5">
          <span v-for="m in members" :key="m.id"
            class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200">
            {{ nameOf(m) }}
            <button type="button" class="w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              @click="removeMember(m.id)">
              <XIcon class="w-3 h-3" />
            </button>
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="close">{{ t('lng_cancel') }}</button>
      <button type="button" :disabled="!canCreate || creating"
        class="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
        @click="create">
        {{ creating ? t('newChat.creating') : t('newChat.create') }}
      </button>
    </template>
  </ModalDialog>

  <GroupUserPickerDialog v-model="pickerVisible" multiple :title="t('newChat.addMembers')"
    @select-many="onPickMembers" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Camera as CameraIcon, ChevronRight as ChevronRightIcon, Users as UsersIcon, X as XIcon } from 'lucide-vue-next';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { toast } from '../../utils/toast';
import ModalDialog from '../settings/ModalDialog.vue';
import GroupUserPickerDialog from '../settings/GroupUserPickerDialog.vue';
import { tdlibSend } from '../../utils/tdlib';
import { markChatNavFromList } from '../../store/chatNav';
import { isDeletedUser, DELETED_ACCOUNT_LABEL } from '../../utils/senderInfo';
import type { chat, createdBasicGroupChat, user } from 'tdlib-types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'group' | 'channel';
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const router = useRouter();
const { t } = useI18n();

const isChannel = computed(() => props.mode === 'channel');
const title = ref('');
const about = ref('');
const photoPath = ref('');
const photoPreview = ref('');
const members = ref<user[]>([]);
const pickerVisible = ref(false);
const creating = ref(false);

const canCreate = computed(() => title.value.trim().length > 0);

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) return;
    title.value = '';
    about.value = '';
    photoPath.value = '';
    photoPreview.value = '';
    members.value = [];
    creating.value = false;
  },
);

function nameOf(u: user): string {
  if (isDeletedUser(u)) return DELETED_ACCOUNT_LABEL;
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
}

function close() {
  if (creating.value) return;
  emit('update:modelValue', false);
}

function onPickMembers(users: user[]) {
  members.value = users;
}

function removeMember(id: number) {
  members.value = members.value.filter((u) => u.id !== id);
}

async function pickPhoto() {
  try {
    const selected = await open({
      multiple: false,
      title: t('avatar.pickImage'),
      filters: [{ name: t('lng_in_dlg_photo'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (!selected || Array.isArray(selected)) return;
    photoPath.value = selected;
    photoPreview.value = convertFileSrc(selected);
  } catch (e) {
    console.error('pick chat photo failed:', e);
    toast.error(t('avatar.pickFailed'));
  }
}

async function create() {
  const name = title.value.trim();
  if (!name) {
    toast.warning(t('newChat.titleRequired'));
    return;
  }
  creating.value = true;
  try {
    let chatId = 0;
    if (isChannel.value) {
      const created = (await tdlibSend({
        _: 'createNewSupergroupChat',
        title: name,
        is_forum: false,
        is_channel: true,
        description: about.value.trim(),
      })) as chat;
      chatId = created.id;
    } else {
      const created = (await tdlibSend({
        _: 'createNewBasicGroupChat',
        user_ids: members.value.map((u) => u.id),
        title: name,
        message_auto_delete_time: 0,
      })) as createdBasicGroupChat;
      chatId = created.chat_id;
      const failed = created.failed_to_add_members?.failed_to_add_members?.length ?? 0;
      if (failed) toast.warning(t('newChat.membersFailed', { count: failed }));
      const description = about.value.trim();
      if (description) {
        await tdlibSend({ _: 'setChatDescription', chat_id: chatId, description });
      }
    }

    if (photoPath.value) {
      await tdlibSend({
        _: 'setChatPhoto',
        chat_id: chatId,
        photo: { _: 'inputChatPhotoStatic', photo: { _: 'inputFileLocal', path: photoPath.value } },
      });
    }

    emit('update:modelValue', false);
    toast.success(isChannel.value ? t('newChat.channelCreated') : t('newChat.groupCreated'));
    // 频道创建后进入「频道类型」页设置公开/私密
    if (isChannel.value) {
      router.push({ name: 'group-type', params: { id: String(chatId) } });
    } else {
      markChatNavFromList();
      router.push({ name: 'chat-detail', params: { id: String(chatId) } });
    }
  } catch (e: any) {
    console.error('create chat failed:', e);
    toast.error(e?.message || t('newChat.createFailed'));
  } finally {
    creating.value = false;
  }
}
</script>
