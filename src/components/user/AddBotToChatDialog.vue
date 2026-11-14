<template>
  <ModalDialog :model-value="modelValue" :title="dialogTitle" @update:model-value="close">
    <div class="space-y-3">
      <input v-model="query" type="search" :placeholder="t('lng_dlg_filter')"
        class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

      <div v-if="loading" class="py-10 text-center text-sm text-gray-400">
        {{ t('lng_context_seen_loading') }}
      </div>
      <div v-else-if="visibleSections.length === 0" class="py-10 text-center text-sm text-gray-400">
        {{ query.trim() ? noResultsText : emptyText }}
      </div>
      <div v-else
        class="max-h-[55vh] overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        <template v-for="section in visibleSections" :key="section.key">
          <p class="px-4 pt-3 pb-1 text-xs font-medium text-gray-400">{{ section.title }}</p>
          <button v-for="c in section.chats" :key="c.id" type="button"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
            :class="selectedId === c.id ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
            @click="selectedId = c.id">
            <Avatar :photo="c.photo" :title="c.title" sizeClass="!w-9 !h-9" />
            <p class="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">{{ c.title }}</p>
            <span v-if="selectedId === c.id"
              class="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
              <CheckIcon class="w-2.5 h-2.5 text-white" stroke-width="3" />
            </span>
          </button>
        </template>
      </div>
    </div>
    <template #footer>
      <BaseButton type="button" variant="ghost" size="sm" @click="close">{{ t('lng_cancel') }}</BaseButton>
      <BaseButton type="button" size="sm" :disabled="!selectedId || adding" @click="submit">
        {{ adding ? t('lng_context_seen_loading') : submitLabel }}
      </BaseButton>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check as CheckIcon } from 'lucide-vue-next';
import type { chatPhotoInfo, ChatMemberStatus } from 'tdlib-types';
import ModalDialog from '../ui/modal/ModalDialog.vue';
import Avatar from '../chat/avatar.vue';
import BaseButton from '../ui/button/BaseButton.vue';
import { tdlibSend } from '../../utils/session/tdlib';
import { useChatStore } from '../../store/chat/chat';
import {
  ensureBasicGroup,
  ensureChat,
  ensureSupergroup,
  getReactiveBasicGroup,
  getReactiveChat,
  getReactiveSupergroup,
} from '../../utils/profile/senderInfo';
import { canInviteUsers, canPromoteMembers } from '../../utils/chat/groupRights';
import { toast } from '../../utils/ui/toast';

/**
 * 「将机器人添加到群组/频道」选择器（对齐官方客户端 AddBotToGroupBoxController /
 * Telegram Android 的 add-bot-to-chat 选择器）：
 * - 频道：只列出我是管理员且拥有「添加管理员」权限的频道（机器人加入频道只能作为管理员）
 * - 群组：列出我可邀请成员的群组；我在该群能添加管理员时先进入「设置管理员权限」，
 *   否则直接以普通成员加入
 */
const props = defineProps<{
  modelValue: boolean;
  botUserId: number;
  /** 机器人是否允许加入群组（userTypeBot.can_join_groups）；false 时只提供频道 */
  canJoinGroups: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 需要先设置管理员权限（父组件打开权限弹窗） */
  'admin-flow': [chatId: number];
  /** 已作为普通成员添加成功 */
  done: [chatId: number];
}>();

const { t } = useI18n();
const chatStore = useChatStore();

/** 候选对话（只保留选择器渲染与判定所需字段） */
interface BotTargetChat {
  id: number;
  title: string;
  photo?: chatPhotoInfo;
  isChannel: boolean;
  /** 我在该对话中拥有「添加管理员」权限 */
  canPromote: boolean;
}

const query = ref('');
const loading = ref(false);
const adding = ref(false);
const candidates = ref<BotTargetChat[]>([]);
const selectedId = ref<number | null>(null);

/** 每次打开重新加载，避免对话权限/列表变化后数据过期 */
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    query.value = '';
    selectedId.value = null;
    void reload();
  },
);

// 搜索过滤后不再显示已选对话时清空选择，避免底部按钮作用到看不见的对话
watch(query, () => {
  if (selectedId.value === null) return;
  const visible = visibleSections.value.some((section) =>
    section.chats.some((c) => c.id === selectedId.value),
  );
  if (!visible) selectedId.value = null;
});

const dialogTitle = computed(() =>
  props.canJoinGroups ? t('lng_profile_add_bot_as_admin') : t('lng_profile_invite_to_channel'),
);
const emptyText = computed(() =>
  props.canJoinGroups ? t('lng_bot_no_groups') : t('lng_bot_no_chats'),
);
const noResultsText = computed(() =>
  props.canJoinGroups ? t('lng_bot_groups_not_found') : t('lng_bot_chats_not_found'),
);

/**
 * 分组顺序对齐官方客户端：我管理的频道 → 我管理的群组 → 群组。
 * - 频道只列出我有「添加管理员」权限的（机器人加入频道只能作为管理员）：
 *   与 Telegram Android / Unigram 一致，频道不要求机器人预先申请管理员权限。
 * - 群组：能加管理员的放在「我管理的群组」（进入权限设置），其余按普通成员加入。
 */
const channelSection = computed(() => candidates.value.filter((c) => c.isChannel));
const managedGroupSection = computed(() =>
  candidates.value.filter((c) => !c.isChannel && c.canPromote),
);
const groupSection = computed(() =>
  candidates.value.filter((c) => !c.isChannel && !c.canPromote),
);

const visibleSections = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const match = (c: BotTargetChat) => !needle || c.title.toLowerCase().includes(needle);
  return [
    { key: 'channels', title: t('lng_bot_channels_manage'), chats: channelSection.value },
    { key: 'managed-groups', title: t('lng_bot_groups_manage'), chats: managedGroupSection.value },
    { key: 'groups', title: t('lng_bot_groups'), chats: groupSection.value },
  ]
    .map((section) => ({ ...section, chats: section.chats.filter(match) }))
    .filter((section) => section.chats.length > 0);
});

const selected = computed(
  () => candidates.value.find((c) => c.id === selectedId.value) ?? null,
);
const submitLabel = computed(() => {
  const target = selected.value;
  if (target?.isChannel) return t('lng_profile_invite_to_channel');
  if (!props.canJoinGroups) return t('lng_profile_invite_to_channel');
  return t('lng_profile_invite_to_group');
});

async function reload() {
  loading.value = true;
  try {
    const ids = [
      ...(chatStore.lists['chatListMain'] ?? []),
      ...(chatStore.lists['chatListArchive'] ?? []),
    ];
    // 极端情况下列表还没下发（深链直接打开资料页）：退回已缓存的对话对象
    const source = ids.length > 0 ? ids : Object.keys(chatStore.chats).map(Number);
    // 去重并限制规模：bot 选择器只面向普通群组/频道，500 个对话足够覆盖
    const unique = Array.from(new Set(source)).slice(0, 500);
    const loaded = await mapLimit(unique, 8, (id) => loadCandidate(id));
    candidates.value = loaded.filter((c): c is BotTargetChat => !!c);
  } catch (e) {
    console.error('AddBotToChatDialog: load candidates failed', e);
    candidates.value = [];
  } finally {
    loading.value = false;
  }
}

/** 读取单个对话并判定是否可作为目标（需要读取我在群里的成员状态） */
async function loadCandidate(id: number): Promise<BotTargetChat | null> {
  try {
    await ensureChat(id);
    const chat = getReactiveChat(id);
    if (!chat?.type) return null;

    let status: ChatMemberStatus | undefined;
    let isChannel = false;
    if (chat.type._ === 'chatTypeBasicGroup') {
      await ensureBasicGroup(chat.type.basic_group_id);
      status = getReactiveBasicGroup(chat.type.basic_group_id)?.status;
    } else if (chat.type._ === 'chatTypeSupergroup') {
      isChannel = !!chat.type.is_channel;
      await ensureSupergroup(chat.type.supergroup_id);
      status = getReactiveSupergroup(chat.type.supergroup_id)?.status;
    } else {
      return null;
    }

    // 未加入/被封禁的对话不能作为目标
    if (!status || status._ === 'chatMemberStatusLeft' || status._ === 'chatMemberStatusBanned') {
      return null;
    }
    const canPromote = canPromoteMembers(status);
    if (isChannel) {
      // 频道里的机器人只能作为管理员加入；需要我有「添加管理员」权限
      if (!canPromote) return null;
    } else if (!props.canJoinGroups || !canInviteUsers(status, chat)) {
      // 机器人不允许加入群组 / 我在该群没有邀请成员的权限
      return null;
    }

    return { id, title: chat.title || String(id), photo: chat.photo, isChannel, canPromote };
  } catch (e) {
    console.warn('AddBotToChatDialog: load candidate failed', id, e);
    return null;
  }
}

function submit() {
  const target = selected.value;
  if (!target || adding.value) return;
  // 频道恒为管理员；群组里我能加管理员时先进入权限设置（官方客户端 / Android 行为）
  if (target.isChannel || target.canPromote) {
    emit('admin-flow', target.id);
    close();
    return;
  }
  void addAsMember(target);
}

/** 普通成员方式加入（对齐官方客户端 messages.addChatUser；bot 场景无需转发历史消息） */
async function addAsMember(target: BotTargetChat) {
  adding.value = true;
  try {
    await tdlibSend({
      _: 'addChatMember',
      chat_id: target.id,
      user_id: props.botUserId,
    });
    toast.success(t('user.addedToChat', { group: target.title }));
    emit('done', target.id);
    close();
  } catch (e: any) {
    toast.error(e?.message || t('user.addBotFailed'));
  } finally {
    adding.value = false;
  }
}

function close() {
  query.value = '';
  selectedId.value = null;
  emit('update:modelValue', false);
}

/** 并发上限：候选对话较多时避免一次性打满 TDLib 请求队列 */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, Math.max(items.length, 1)) },
    async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
</script>
