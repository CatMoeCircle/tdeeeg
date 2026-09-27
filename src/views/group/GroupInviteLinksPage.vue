<template>
  <div class="h-full flex flex-col bg-white dark:bg-gray-900">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_manage_peer_invite_links') }}</h2>
      <button type="button" @click="createLink" :disabled="creating"
        class="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
        {{ creating ? t('lng_context_seen_loading') : t('lng_create_invite_link_title') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-3">
        <p class="text-xs text-gray-400">{{ t('lng_create_invite_link_about') }}</p>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="link in links" :key="link.invite_link" class="px-4 py-3 flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 select-all break-all">{{ link.invite_link }}</p>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ link.name || t('lng_profile_invite_link_section') }}
                · {{ link.member_count ?? 0 }}
                <span v-if="link.is_revoked"> · {{ t('lng_group_invite_link_revoked') }}</span>
              </p>
            </div>
            <button type="button" class="px-3 py-1.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"
              @click="copyLink(link.invite_link)">
              {{ t('lng_chat_link_copy') }}
            </button>
            <button v-if="!link.is_revoked" type="button"
              class="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              @click="revokeLink(link.invite_link)">
              {{ t('lng_group_invite_context_revoke') }}
            </button>
          </div>
          <div v-if="!loading && links.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
            {{ t('lng_group_invite_no_joined') }}
          </div>
          <div v-if="loading" class="px-4 py-8 text-center text-sm text-gray-400">{{ t('lng_context_seen_loading') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronLeft as ChevronLeftIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend } from '../../utils/tdlib';

type InviteLink = {
  invite_link: string;
  name?: string;
  member_count?: number;
  is_revoked?: boolean;
  is_primary?: boolean;
};

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const links = ref<InviteLink[]>([]);
const loading = ref(true);
const creating = ref(false);

function goBack() {
  router.back();
}

async function reload() {
  loading.value = true;
  try {
    const myId = (await tdlibSend({ _: 'getMe' })).id;
    const res = await tdlibSend({
      _: 'getChatInviteLinks',
      chat_id: chatId.value,
      creator_user_id: myId,
      revoked: false,
      offset_date: 0,
      offset_invite_link: '',
      limit: 50,
    });
    links.value = (res.invite_links ?? []) as InviteLink[];
  } catch (e) {
    console.error('load invite links failed', e);
  } finally {
    loading.value = false;
  }
}

async function createLink() {
  creating.value = true;
  try {
    await tdlibSend({
      _: 'createChatInviteLink',
      chat_id: chatId.value,
      name: '',
      expiration_date: 0,
      member_limit: 0,
      creates_join_request: false,
    } as any);
    MessagePlugin.success(t('lng_settings_save'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  } finally {
    creating.value = false;
  }
}

async function revokeLink(link: string) {
  try {
    await tdlibSend({ _: 'revokeChatInviteLink', chat_id: chatId.value, invite_link: link });
    MessagePlugin.success(t('lng_group_invite_context_revoke'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    MessagePlugin.success(t('lng_group_invite_copied'));
  } catch {
    MessagePlugin.error(t('lng_settings_save'));
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
