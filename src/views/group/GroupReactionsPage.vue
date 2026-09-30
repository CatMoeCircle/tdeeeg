<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_manage_peer_reactions') }}</h2>
      <button type="button" @click="save" :disabled="saving"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
        {{ saving ? t('lng_context_seen_loading') : t('lng_settings_save') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <section>
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_peer_reactions') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <button v-for="opt in options" :key="opt.value" type="button"
              class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="mode = opt.value">
              <span class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                :class="mode === opt.value ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'">
                <span v-if="mode === opt.value" class="w-2 h-2 rounded-full bg-blue-500"></span>
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ opt.label }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ opt.hint }}</p>
              </div>
            </button>
          </div>
          <!-- 部分回应：自定义 emoji 列表 -->
          <div v-if="mode === 'some'" class="mt-4">
            <p class="text-xs text-gray-400 mb-2">{{ t('lng_manage_peer_reactions_some_about') }}</p>
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 flex flex-wrap gap-2">
              <button v-for="e in emojiPool" :key="e" type="button"
                class="w-10 h-10 rounded-lg text-2xl leading-none flex items-center justify-center border-2 transition-transform hover:scale-105"
                :class="selectedEmojis.has(e) ? 'border-blue-500 bg-blue-500/10' : 'border-transparent'"
                @click="toggleEmoji(e)">
                {{ e }}
              </button>
            </div>
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
import { ChevronLeft as ChevronLeftIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend } from '../../utils/tdlib';
import type { ReactionType } from 'tdlib-types';

type Mode = 'all' | 'some' | 'none';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const mode = ref<Mode>('all');
const savedReactions = ref<ReactionType[]>([]);
const selectedEmojis = ref<Set<string>>(new Set());
const saving = ref(false);
const loading = ref(true);

/** 常用表情池（部分回应） */
const emojiPool = ['👍', '❤️', '🔥', '👏', '😁', '🎉', '🤔', '😱', '🙏', '💯', '⚡', '😍', '😢', '😡', '👌', '✨'];

function toggleEmoji(e: string) {
  const next = new Set(selectedEmojis.value);
  if (next.has(e)) next.delete(e);
  else next.add(e);
  selectedEmojis.value = next;
}

const options = computed(() => [
  {
    value: 'all' as const,
    label: t('lng_manage_peer_reactions_all'),
    hint: t('lng_manage_peer_reactions_all_about'),
  },
  {
    value: 'some' as const,
    label: t('lng_manage_peer_reactions_some'),
    hint: t('lng_manage_peer_reactions_some_about'),
  },
  {
    value: 'none' as const,
    label: t('lng_manage_peer_reactions_none'),
    hint: t('lng_manage_peer_reactions_none_about'),
  },
]);

function goBack() {
  router.back();
}

async function reload() {
  loading.value = true;
  try {
    const chat = await tdlibSend({ _: 'getChat', chat_id: chatId.value });
    const ar = (chat as { available_reactions?: any }).available_reactions;
    if (ar?._ === 'chatAvailableReactionsAll') {
      mode.value = 'all';
      savedReactions.value = [];
      selectedEmojis.value = new Set();
    } else if (ar?._ === 'chatAvailableReactionsSome') {
      savedReactions.value = ar.reactions ?? [];
      const emojis = savedReactions.value
        .filter((r): r is Extract<ReactionType, { _: 'reactionTypeEmoji' }> => r._ === 'reactionTypeEmoji')
        .map((r) => r.emoji);
      selectedEmojis.value = new Set(emojis);
      mode.value = emojis.length > 0 ? 'some' : 'none';
    } else {
      mode.value = 'none';
      savedReactions.value = [];
      selectedEmojis.value = new Set();
    }
  } catch (e) {
    console.error('GroupReactions load failed', e);
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const someReactions: ReactionType[] = [...selectedEmojis.value].map((emoji) => ({
      _: 'reactionTypeEmoji' as const,
      emoji,
    }));
    const value =
      mode.value === 'all'
        ? { _: 'chatAvailableReactionsAll', max_reaction_count: 11 }
        : mode.value === 'some'
          ? { _: 'chatAvailableReactionsSome', reactions: someReactions, max_reaction_count: 11 }
          : { _: 'chatAvailableReactionsSome', reactions: [], max_reaction_count: 11 };
    await tdlibSend({
      _: 'setChatAvailableReactions',
      chat_id: chatId.value,
      available_reactions: value as any,
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
