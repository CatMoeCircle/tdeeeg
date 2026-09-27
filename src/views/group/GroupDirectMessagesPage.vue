<template>
  <div class="h-full flex flex-col bg-white dark:bg-gray-900">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_profile_direct_messages') }}</h2>
      <button type="button" @click="save" :disabled="saving"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
        {{ t('lng_settings_save') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_action_direct_messages_enabled') }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_admin_log_about_text_channel') }}</p>
            </div>
            <ToggleSwitch v-model="enabled" />
          </div>
        </section>

        <section v-if="enabled">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_rights_charge_stars') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
            <p class="text-sm text-gray-800 dark:text-gray-100 mb-2">{{ starCount }}</p>
            <input v-model.number="starCount" type="range" min="0" max="10000" step="1" class="w-full accent-blue-500" />
            <p class="text-xs text-gray-400 mt-2">{{ t('lng_rights_charge_stars_about') }}</p>
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
import { ChevronLeft as ChevronLeftIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { tdlibSend } from '../../utils/tdlib';
import { loadGroupFullInfo, loadMyChatMemberStatus } from '../../utils/groupRights';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const enabled = ref(false);
const starCount = ref(0);
const saving = ref(false);
const snapEnabled = ref(false);
const snapStars = ref(0);

const isDirty = computed(
  () => enabled.value !== snapEnabled.value || starCount.value !== snapStars.value,
);

function goBack() {
  // Unigram DirectMessages：未保存更改提示
  if (isDirty.value && !window.confirm(t('lng_forum_discard_sure'))) return;
  router.back();
}

async function reload() {
  const { chat: c, supergroup } = await loadMyChatMemberStatus(chatId.value);
  const full = c ? await loadGroupFullInfo(c) : null;
  enabled.value = !!full?.linkedChatId || !!(supergroup as any)?.has_direct_messages;
  // 直接消息群 id 存在则视为开启；付费星数从 direct messages chat 读
  try {
    const sgFull = c?.type._ === 'chatTypeSupergroup'
      ? await tdlibSend({ _: 'getSupergroupFullInfo', supergroup_id: c.type.supergroup_id })
      : null;
    const dmId = (sgFull as any)?.direct_messages_chat_id ?? 0;
    enabled.value = !!dmId;
    if (dmId) {
      const dm = await tdlibSend({ _: 'getChat', chat_id: dmId });
      starCount.value = (dm as any)?.paid_message_star_count ?? 0;
    } else {
      starCount.value = 0;
    }
  } catch {
    /* ignore */
  }
  snapEnabled.value = enabled.value;
  snapStars.value = starCount.value;
}

async function save() {
  saving.value = true;
  try {
    await tdlibSend({
      _: 'setChatDirectMessagesGroup',
      chat_id: chatId.value,
      is_enabled: enabled.value,
      paid_message_star_count: enabled.value ? starCount.value : 0,
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
