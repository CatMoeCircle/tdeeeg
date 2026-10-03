<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_manage_discussion_group') }}</h2>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_discussion_group') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <p class="mt-3 text-xs text-gray-400">{{ t('lng_manage_discussion_group_about') }}</p>
          <div class="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <div v-if="linkedChat" class="flex items-center gap-3 px-4 py-3">
              <div class="w-10 h-10 shrink-0">
                <Avatar :photo="linkedChat.photo" :title="linkedChat.title" sizeClass="!w-10 !h-10" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ linkedChat.title }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_manage_discussion_group') }}</p>
              </div>
              <button type="button" @click="unlink"
                class="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                {{ t('lng_manage_discussion_group_unlink') }}
              </button>
            </div>
            <template v-else>
              <button type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                @click="createDiscussion">
                <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                  <PlusIcon class="w-5 h-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-blue-500">{{ t('lng_manage_discussion_group_create') }}</p>
                </div>
              </button>
              <button v-for="c in candidates" :key="c.id" type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                @click="linkTo(c.id)">
                <div class="w-10 h-10 shrink-0">
                  <Avatar :photo="c.photo" :title="c.title" sizeClass="!w-10 !h-10" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ c.title }}</p>
                </div>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>
              <div v-if="!loading && candidates.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
                {{ t('groupEdit.empty') }}
              </div>
            </template>
          </div>
        </section>

        <!-- 谁可以发送消息（讨论群组；频道已关联时显示） -->
        <section v-if="showSendSection">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('lng_manage_peer_send_title') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <div class="flex items-center gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_send_only_members') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_manage_peer_send_only_members_about') }}</p>
              </div>
              <ToggleSwitch :model-value="joinToSendMessages" @update:model-value="onJoinToSend" />
            </div>
            <div v-if="joinToSendMessages" class="flex items-center gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_manage_peer_send_approve_members') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_manage_peer_request_apply_title') }}</p>
              </div>
              <ToggleSwitch :model-value="joinByRequest" @update:model-value="onJoinByRequest" />
            </div>
          </div>
          <p class="text-xs text-gray-400 mt-2">
            {{ joinToSendMessages ? t('lng_manage_peer_send_approve_members') : t('lng_manage_peer_send_only_members_about') }}
          </p>
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
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Plus as PlusIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { tdlibSend } from '../../utils/tdlib';
import { ensureChat, getReactiveChat, ensureSupergroup, getReactiveSupergroup } from '../../utils/senderInfo';
import { isChannelChat, loadGroupFullInfo, loadMyChatMemberStatus } from '../../utils/groupRights';
import type { chat } from 'tdlib-types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** 聊天 ID 可能为负数（频道 -100…），不能用 > 0 判断 */
const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chat = ref<chat | undefined>();
const linkedChat = ref<chat | undefined>();
const candidates = ref<chat[]>([]);
const loading = ref(true);
const joinToSendMessages = ref(false);
const joinByRequest = ref(false);
const linkedSupergroupId = ref(0);

const isChannel = computed(() => isChannelChat(chat.value));
/** 谁可以发送消息：仅频道 + 已关联讨论组时显示（对齐 Unigram） */
const showSendSection = computed(() => isChannel.value && !!linkedChat.value && linkedSupergroupId.value > 0);

async function loadLinkedSendRules(discussion: chat | undefined) {
  joinToSendMessages.value = false;
  joinByRequest.value = false;
  linkedSupergroupId.value = 0;
  if (!discussion || discussion.type._ !== 'chatTypeSupergroup') return;
  const sgId = discussion.type.supergroup_id;
  linkedSupergroupId.value = sgId;
  await ensureSupergroup(sgId);
  const sg = getReactiveSupergroup(sgId)
    ?? (await tdlibSend({ _: 'getSupergroup', supergroup_id: sgId }).catch(() => undefined));
  if (sg) {
    joinToSendMessages.value = !!sg.join_to_send_messages;
    joinByRequest.value = !!sg.join_by_request;
  }
}

async function onJoinToSend(v: boolean) {
  if (!linkedSupergroupId.value) return;
  const prev = joinToSendMessages.value;
  joinToSendMessages.value = v;
  try {
    await tdlibSend({
      _: 'toggleSupergroupJoinToSendMessages',
      supergroup_id: linkedSupergroupId.value,
      join_to_send_messages: v,
    });
    if (!v && joinByRequest.value) {
      joinByRequest.value = false;
      await tdlibSend({
        _: 'toggleSupergroupJoinByRequest',
        supergroup_id: linkedSupergroupId.value,
        join_by_request: false,
      } as any);
    }
    MessagePlugin.success(t('lng_settings_save'));
  } catch (e: any) {
    joinToSendMessages.value = prev;
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

async function onJoinByRequest(v: boolean) {
  if (!linkedSupergroupId.value) return;
  const prev = joinByRequest.value;
  joinByRequest.value = v;
  try {
    await tdlibSend({
      _: 'toggleSupergroupJoinByRequest',
      supergroup_id: linkedSupergroupId.value,
      join_by_request: v,
    } as any);
    MessagePlugin.success(t('lng_settings_save'));
  } catch (e: any) {
    joinByRequest.value = prev;
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

function goBack() {
  router.back();
}

async function reload() {
  loading.value = true;
  try {
    const { chat: c } = await loadMyChatMemberStatus(chatId.value);
    chat.value = c;
    const full = await loadGroupFullInfo(c!);
    linkedChat.value = undefined;
    if (full.linkedChatId) {
      await ensureChat(full.linkedChatId);
      linkedChat.value = getReactiveChat(full.linkedChatId);
      if (!linkedChat.value) {
        linkedChat.value = await tdlibSend({ _: 'getChat', chat_id: full.linkedChatId });
      }
      candidates.value = [];
      await loadLinkedSendRules(linkedChat.value);
    } else {
      await loadLinkedSendRules(undefined);
      const res = await tdlibSend({ _: 'getSuitableDiscussionChats' });
      const ids = res.chat_ids ?? [];
      candidates.value = [];
      for (const id of ids) {
        try {
          await ensureChat(id);
          const item = getReactiveChat(id) ?? (await tdlibSend({ _: 'getChat', chat_id: id }));
          if (item) candidates.value.push(item);
        } catch {
          /* skip */
        }
      }
    }
  } catch (e) {
    console.error('GroupLinked load failed', e);
  } finally {
    loading.value = false;
  }
}

async function createDiscussion() {
  const name = chat.value?.title || t('lng_manage_discussion_group');
  try {
    // 直接建超级群（讨论组），再关联
    const created = await tdlibSend({
      _: 'createNewSupergroupChat',
      title: name,
      is_forum: false,
      is_channel: false,
      description: '',
    });
    const discussion = created as chat;
    const discussionId = discussion.id;
    let sgId = 0;
    if (discussion.type._ === 'chatTypeSupergroup') sgId = discussion.type.supergroup_id;
    if (sgId) {
      await tdlibSend({
        _: 'toggleSupergroupIsAllHistoryAvailable',
        supergroup_id: sgId,
        is_all_history_available: true,
      });
    }
    await tdlibSend({
      _: 'setChatDiscussionGroup',
      chat_id: isChannel.value ? chatId.value : discussionId,
      discussion_chat_id: discussionId,
    });
    MessagePlugin.success(t('lng_manage_discussion_group_create'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

async function linkTo(targetId: number) {
  const title = getReactiveChat(targetId)?.title ?? String(targetId);
  // Unigram：关联前确认，并提示会打开「新成员可见历史」
  const ok = window.confirm(
    `${t('lng_manage_discussion_group_sure', { group: title, channel: chat.value?.title ?? '' })}\n\n${t('lng_manage_discussion_group_warning')}`
  );
  if (!ok) return;
  try {
    // 讨论组若是基本群，需先升级为超级群
    let discussionId = isChannel.value ? targetId : chatId.value;
    const discussion = getReactiveChat(discussionId)
      ?? (await tdlibSend({ _: 'getChat', chat_id: discussionId }).catch(() => undefined));
    if (discussion?.type._ === 'chatTypeBasicGroup') {
      const upgraded = await tdlibSend({
        _: 'upgradeBasicGroupChatToSupergroupChat',
        chat_id: discussionId,
      });
      if (upgraded && typeof upgraded === 'object' && (upgraded as chat)._ === 'chat') {
        discussionId = (upgraded as chat).id;
      }
    }

    // 关联后新成员需能看历史（TDLib 要求）
    const channelOrGroupId = isChannel.value ? chatId.value : targetId;
    const channelOrGroup = getReactiveChat(channelOrGroupId)
      ?? (await tdlibSend({ _: 'getChat', chat_id: channelOrGroupId }).catch(() => undefined));
    if (channelOrGroup?.type._ === 'chatTypeSupergroup') {
      try {
        await tdlibSend({
          _: 'toggleSupergroupIsAllHistoryAvailable',
          supergroup_id: channelOrGroup.type.supergroup_id,
          is_all_history_available: true,
        });
      } catch {
        /* 已开启或无权限时忽略 */
      }
    }

    await tdlibSend({
      _: 'setChatDiscussionGroup',
      chat_id: isChannel.value ? chatId.value : targetId,
      discussion_chat_id: discussionId,
    });
    MessagePlugin.success(t('groupEdit.discussionLinked'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('groupEdit.saveFailed'));
  }
}

async function unlink() {
  const title = linkedChat.value?.title ?? '';
  const ok = window.confirm(t('lng_manage_discussion_group_sure', { group: title, channel: chat.value?.title ?? '' }));
  if (!ok) return;
  try {
    const cid = isChannel.value ? chatId.value : linkedChat.value?.id ?? chatId.value;
    await tdlibSend({ _: 'setChatDiscussionGroup', chat_id: cid, discussion_chat_id: 0 });
    MessagePlugin.success(t('groupEdit.discussionUnlinked'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('groupEdit.saveFailed'));
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
