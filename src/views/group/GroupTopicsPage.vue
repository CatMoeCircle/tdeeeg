<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_edit_topics_enable') }}</h2>
      <button type="button" @click="save" :disabled="saving"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
        {{ t('lng_settings_save') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <section>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-4 py-3 flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_edit_topics_enable') }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_edit_topics_about') }}</p>
            </div>
            <ToggleSwitch v-model="enabled" />
          </div>
        </section>

        <section v-if="enabled">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_edit_topics_layout') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <button type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
              @click="useTabs = true">
              <span class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                :class="useTabs ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'">
                <span v-if="useTabs" class="w-2 h-2 rounded-full bg-blue-500"></span>
              </span>
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_edit_topics_tabs') }}</p>
            </button>
            <button type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
              @click="useTabs = false">
              <span class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                :class="!useTabs ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'">
                <span v-if="!useTabs" class="w-2 h-2 rounded-full bg-blue-500"></span>
              </span>
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_edit_topics_list') }}</p>
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2">{{ t('lng_edit_topics_layout_about') }}</p>
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
import { loadMyChatMemberStatus } from '../../utils/groupRights';
import type { chat, supergroup } from 'tdlib-types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chat = ref<chat | undefined>();
const group = ref<supergroup | undefined>();
const enabled = ref(false);
const useTabs = ref(true);
const saving = ref(false);

function goBack() {
  router.back();
}

async function reload() {
  const { chat: c, supergroup: sg } = await loadMyChatMemberStatus(chatId.value);
  chat.value = c;
  group.value = sg;
  enabled.value = !!sg?.is_forum;
}

async function save() {
  saving.value = true;
  try {
    let target = chat.value;
    if (enabled.value && target?.type._ === 'chatTypeBasicGroup') {
      const upgraded = await tdlibSend({
        _: 'upgradeBasicGroupChatToSupergroupChat',
        chat_id: chatId.value,
      });
      if (upgraded && typeof upgraded === 'object' && (upgraded as chat)._ === 'chat') {
        target = upgraded as chat;
      }
    }
    if (!target || target.type._ !== 'chatTypeSupergroup') {
      MessagePlugin.error(t('lng_settings_save'));
      return;
    }
    await tdlibSend({
      _: 'toggleSupergroupIsForum',
      supergroup_id: target.type.supergroup_id,
      is_forum: enabled.value,
      has_forum_tabs: useTabs.value,
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
