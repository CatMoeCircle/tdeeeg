<template>
  <div v-if="userProfile?.is_premium" class="relative shrink-0" data-tauri-drag-region-exclude>
    <button type="button" class="w-7 h-7 flex items-center justify-center rounded-full text-gray-500"
      :class="readonly ? 'cursor-default' : 'hover:bg-blue-500/10 transition-colors'"
      :title="readonly ? undefined : '更换 emoji 状态'" :aria-label="readonly ? undefined : '更换 emoji 状态'"
      :disabled="readonly" @click.stop="togglePicker">
      <CustomEmojiInline v-if="displayEmojiId" :emojiId="displayEmojiId" :size="22" :loop="false" />
      <span v-else class="tgico tgico-emoji-status text-[22px]" />
    </button>
    <Teleport to="body">
      <div v-if="pickerOpen" class="fixed inset-0 z-200" @mousedown="onBackdrop">
        <div class="fixed w-70 h-80 rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden"
          :style="panelStyle" @mousedown.stop>
          <EmojiDrawer :is-premium="true" :show-default-emoji-status="true"
            :emoji-status-gift-statuses="giftStatuses" :emoji-status-recent-statuses="recentStatuses"
            @pick-default-status="setDefaultStatus" @pick-custom-emoji="setCustomStatus" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { emojiStatus, emojiStatus$Input } from 'tdlib-types';
import { storeToRefs } from 'pinia';
import { useUserStore } from '../../store/user';
import { tdlibSend } from '../../utils/tdlib';
import CustomEmojiInline from './CustomEmojiInline.vue';
import EmojiDrawer from '../chat/ChatDetail/stickerPanel/EmojiDrawer.vue';

defineProps<{ readonly?: boolean }>();

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const pickerOpen = ref(false);
const recentStatuses = ref<emojiStatus[]>([]);
const giftStatuses = ref<emojiStatus[]>([]);
const panelStyle = { top: '32px', left: '8px' };

const displayEmojiId = computed(() => {
  const type = userProfile.value?.emoji_status?.type;
  if (!type) return undefined;
  if (type._ === 'emojiStatusTypeCustomEmoji') return type.custom_emoji_id;
  if (type._ === 'emojiStatusTypeUpgradedGift') return type.model_custom_emoji_id;
  return undefined;
});

async function loadStatuses() {
  const [recent, gifts] = await Promise.all([
    tdlibSend({ _: 'getRecentEmojiStatuses' }).catch(() => ({ _: 'emojiStatuses', emoji_statuses: [] })),
    tdlibSend({ _: 'getUpgradedGiftEmojiStatuses' }).catch(() => ({ _: 'emojiStatuses', emoji_statuses: [] })),
  ]);
  recentStatuses.value = recent.emoji_statuses;
  giftStatuses.value = gifts.emoji_statuses;
}

function togglePicker() {
  pickerOpen.value = !pickerOpen.value;
  if (pickerOpen.value) void loadStatuses();
}

function closePicker() {
  pickerOpen.value = false;
}

function onBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget) closePicker();
}

async function setDefaultStatus() {
  await tdlibSend({ _: 'setEmojiStatus', emoji_status: null as never });
  closePicker();
}

async function setCustomStatus(emojiId: string) {
  const giftStatus = [...giftStatuses.value, ...recentStatuses.value].find((status) =>
    status.type._ === 'emojiStatusTypeUpgradedGift'
    && String(status.type.model_custom_emoji_id) === String(emojiId));
  const emojiStatus: emojiStatus$Input = giftStatus
    ? { _: 'emojiStatus', type: giftStatus.type, expiration_date: giftStatus.expiration_date }
    : { _: 'emojiStatus', type: { _: 'emojiStatusTypeCustomEmoji', custom_emoji_id: emojiId }, expiration_date: 0 };
  await tdlibSend({ _: 'setEmojiStatus', emoji_status: emojiStatus });
  closePicker();
}
</script>

<style scoped>
[data-tauri-drag-region-exclude] {
  -webkit-app-region: no-drag;
}

.tgico-emoji-status::before {
  content: "\ea2a";
  color: #FF5288C1;
}
</style>
