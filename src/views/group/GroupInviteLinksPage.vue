<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('lng_manage_peer_invite_links') }}</h2>
      <button type="button" @click="openCreate"
        class="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
        {{ t('inviteLinkEdit.createAction') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="w-full space-y-3">
        <p class="text-xs text-gray-400">{{ t('lng_create_invite_link_about') }}</p>

        <!-- 加载失败：给错误态与重试，避免空列表被误读成「没有链接」 -->
        <div v-if="loadError"
          class="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <span class="min-w-0 flex-1">{{ t('inviteLinkEdit.loadFailed') }}</span>
          <button type="button" class="shrink-0 rounded-lg px-3 py-1.5 font-medium hover:bg-red-100 dark:hover:bg-red-500/15"
            @click="reload">
            {{ t('inviteLinkEdit.retry') }}
          </button>
        </div>

        <div
          class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="link in links" :key="link.invite_link" class="px-4 py-3 flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-800 dark:text-gray-100 select-all break-all">{{ link.invite_link }}</p>
              <p v-if="link.name" class="text-sm text-gray-700 dark:text-gray-200 mt-0.5 break-words">{{ link.name }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                <span>{{ t('inviteLinkEdit.members', { count: link.member_count }) }}</span>
                <span aria-hidden="true">·</span>
                <span v-if="isExpired(link)"
                  class="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-500 dark:text-red-400">
                  {{ t('inviteLinkEdit.expired') }}
                </span>
                <span v-else>{{ expirationText(link) }}</span>
                <span v-if="link.creates_join_request"
                  class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  {{ t('inviteLinkEdit.approvalBadge') }}
                  <template v-if="link.pending_join_request_count > 0">
                    · {{ t('inviteLinkEdit.pendingRequests', { count: link.pending_join_request_count }) }}
                  </template>
                </span>
              </p>
            </div>
            <button type="button" class="px-3 py-1.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 shrink-0"
              @click="copyLink(link.invite_link)">
              {{ t('lng_chat_link_copy') }}
            </button>
            <button v-if="canEdit(link)" type="button"
              class="px-3 py-1.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 shrink-0"
              @click="openEdit(link)">
              {{ t('inviteLinkEdit.editAction') }}
            </button>
            <button v-if="canRevoke(link)" type="button"
              class="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0"
              @click="revokeLink(link.invite_link)">
              {{ t('lng_group_invite_context_revoke') }}
            </button>
          </div>
          <div v-if="!loading && !loadError && links.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
            {{ t('lng_group_invite_no_joined') }}
          </div>
          <LoadingSkeleton v-if="loading" class="px-4 py-3" :rows="6" :label="t('lng_context_seen_loading')" />
        </div>
      </div>
    </div>

    <!-- 创建 / 编辑共用同一个弹窗：新建时 link 为 null -->
    <EditInviteLinkDialog v-model="dialogOpen" :chat-id="chatId" :link="editingLink" @saved="onSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronLeft as ChevronLeftIcon } from 'lucide-vue-next';
import type { chatInviteLink } from 'tdlib-types';
import { toast } from '../../utils/ui/toast';
import { tdlibSend } from '../../utils/session/tdlib';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import EditInviteLinkDialog from '../../components/group/EditInviteLinkDialog.vue';

/** 直接使用 TDLib 的 chatInviteLink，避免字段（expiration_date / creates_join_request…）漏写 */
type InviteLink = chatInviteLink;

/** getChatInviteLinks 单页上限（TDLib 文档：up to 100） */
const PAGE_SIZE = 100;
/** 翻页上限保护：异常情况下最多取 2000 条，避免无限循环 */
const MAX_PAGES = 20;

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const links = ref<InviteLink[]>([]);
const loading = ref(true);
/** 加载失败：单独的错误态，避免和「暂无链接」空态混淆 */
const loadError = ref(false);
const dialogOpen = ref(false);
/** 编辑目标；null 表示新建 */
const editingLink = ref<InviteLink | null>(null);

function goBack() {
  router.back();
}

async function reload() {
  loading.value = true;
  loadError.value = false;
  try {
    const myId = (await tdlibSend({ _: 'getMe' })).id;
    const collected: InviteLink[] = [];
    const seen = new Set<string>();
    let offsetDate = 0;
    let offsetLink = '';
    // 按 (creation date, invite link) 游标翻页：TDLib 返回的是「活动 + 已过期」全集
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await tdlibSend({
        _: 'getChatInviteLinks',
        chat_id: chatId.value,
        creator_user_id: myId,
        // TDLib 字段是 is_revoked（不是 revoked）
        is_revoked: false,
        offset_date: offsetDate,
        offset_invite_link: offsetLink,
        limit: PAGE_SIZE,
      });
      const batch = res.invite_links ?? [];
      for (const link of batch) {
        if (seen.has(link.invite_link)) continue;
        seen.add(link.invite_link);
        collected.push(link);
      }
      // 不足一页：没有更多了（不信 total_count，TDLib 文档说它是近似值，偏小会漏数据）
      if (batch.length < PAGE_SIZE) break;
      const last = batch[batch.length - 1];
      // 游标没有前进（服务端异常）时退出，避免死循环
      if (!last || (last.date === offsetDate && last.invite_link === offsetLink)) break;
      offsetDate = last.date;
      offsetLink = last.invite_link;
    }
    links.value = collected;
  } catch (e) {
    console.error('load invite links failed', e);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

/** 已过期（TDLib 列表包含活动 + 已过期；过期不等于撤销） */
function isExpired(link: InviteLink): boolean {
  return link.expiration_date > 0 && link.expiration_date * 1000 <= Date.now();
}

/**
 * 可编辑条件：
 * - 主邀请链接（is_primary）不是普通邀请链接，TDLib 不支持 editChatInviteLink；
 * - 已过期链接编辑会把过期链接「改期复活」（旧实现的兜底日期还会静默改成 7 天后），不提供入口；
 * - 订阅链接只允许改名称，也不提供入口（需要时走 editChatSubscriptionInviteLink 单独实现）。
 */
function canEdit(link: InviteLink): boolean {
  return !link.is_revoked && !link.is_primary && !isExpired(link) && !link.subscription_pricing;
}

/** 已过期链接不能再撤销 */
function canRevoke(link: InviteLink): boolean {
  return !link.is_revoked && !isExpired(link);
}

function openCreate() {
  editingLink.value = null;
  dialogOpen.value = true;
}

function openEdit(link: InviteLink) {
  editingLink.value = link;
  dialogOpen.value = true;
}

async function onSaved() {
  await reload();
}

/** 过期时间：0 表示永久；过期由上面的徽标单独展示 */
function expirationText(link: InviteLink): string {
  if (!link.expiration_date) return t('inviteLinkEdit.neverExpires');
  const date = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(link.expiration_date * 1000));
  return t('inviteLinkEdit.expiresOn', { date });
}

async function revokeLink(link: string) {
  try {
    await tdlibSend({ _: 'revokeChatInviteLink', chat_id: chatId.value, invite_link: link });
    toast.success(t('lng_group_invite_context_revoke'));
    await reload();
  } catch (e: any) {
    toast.error(e?.message || t('inviteLinkEdit.actionFailed'));
  }
}

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast.success(t('lng_group_invite_copied'));
  } catch {
    toast.error(t('inviteLinkEdit.actionFailed'));
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
