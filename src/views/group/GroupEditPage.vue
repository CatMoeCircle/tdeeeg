<template>
  <div class="h-full flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ pageTitle }}</h2>
      <button v-if="canChangeInfo" type="button" @click="save" :disabled="saving"
        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
        {{ saving ? t('lng_context_seen_loading') : t('lng_settings_save') }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="max-w-2xl space-y-6">
        <!-- 头像 + 名称 + 简介 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ isChannel ? t('lng_manage_channel_info') : t('lng_manage_group_info') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex gap-6">
              <div class="flex flex-col items-center gap-3 shrink-0">
                <Avatar :photo="chat?.photo" :title="chat?.title" :accentColorId="chatAccentId" sizeClass="!w-20 !h-20" />
                <button v-if="canChangeInfo" type="button" @click="photoVisible = true"
                  class="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors">
                  {{ t('lng_profile_set_photo_button') }}
                </button>
              </div>
              <div class="flex-1 min-w-0 space-y-3">
                <div>
                  <label class="text-xs text-gray-400">{{ isChannel ? t('lng_dlg_new_channel_name') : t('lng_dlg_new_group_name') }}</label>
                  <input v-model="title" type="text" maxlength="128" :readonly="!canChangeInfo"
                    :placeholder="isChannel ? t('lng_dlg_new_channel_name') : t('lng_dlg_new_group_name')"
                    class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:opacity-70" />
                </div>
                <div>
                  <label class="text-xs text-gray-400">{{ t('lng_info_bio_label') }}</label>
                  <textarea ref="aboutTextarea" v-model="about" rows="3" :maxlength="aboutMax" :readonly="!canChangeInfo"
                    :placeholder="t('groupEdit.aboutPlaceholder')"
                    class="bio-textarea input-scrollbar mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm leading-6 resize-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:opacity-70"></textarea>
                  <div class="mt-1 text-right text-xs text-gray-400">{{ about.length }} / {{ aboutMax }}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 1. 聊天设置 -->
        <section v-if="showSettingsSection" class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('groupEdit.basic') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 space-y-3">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
              <!-- 频道类型 -->
              <button v-if="showTypeRow" type="button" @click="go('group-type')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <MegaphoneIcon v-if="isChannel" class="w-5 h-5 text-gray-400 shrink-0" />
                <UsersIcon v-else class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ isChannel ? t('lng_manage_peer_channel_type') : t('lng_manage_peer_group_type') }}
                </p>
                <span class="text-xs text-gray-400 shrink-0">{{ typeSummary }}</span>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 讨论（频道：关联讨论组） -->
              <button v-if="showDiscussionRow" type="button" @click="go('group-linked')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <MessageSquareTextIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_discussion_group') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 外观 -->
              <button v-if="showAppearance" type="button" @click="go('group-appearance')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <PaletteIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_edit_channel_color') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 自动翻译 -->
              <div v-if="showAutoTranslate" class="w-full flex items-center gap-3 px-4 py-3"
                :class="autoTranslateLocked ? 'opacity-60' : ''">
                <LanguagesIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_edit_autotranslate') }}
                </p>
                <LockIcon v-if="autoTranslateLocked" class="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span v-if="autoTranslateLocked"
                  class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 shrink-0">
                  {{ t('lng_boost_level', { count: minAutoTranslate }) }}
                </span>
                <ToggleSwitch v-else :model-value="autoTranslate" :disabled="!canChangeInfo"
                  @update:model-value="onAutoTranslate" />
              </div>

              <!-- 私信 -->
              <button v-if="showDirectMessages" type="button" @click="go('group-direct-messages')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <MailIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_profile_direct_messages') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 已关联频道（群组：显示关联频道） -->
              <button v-if="showLinkedChannelRow" type="button" @click="go('group-linked')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <MessageSquareTextIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('groupEdit.linkedChannel') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 话题 -->
              <button v-if="showTopics" type="button" @click="go('group-topics')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ListTreeIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_edit_topics_enable') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 聊天记录 -->
              <div v-if="showHistoryRow" class="w-full flex items-center gap-3 px-4 py-3">
                <EyeIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_history_visibility_title') }}
                </p>
                <ToggleSwitch :model-value="historyVisible" :disabled="!canChangeInfo" @update:model-value="onHistoryToggle" />
              </div>

              <!-- 邀请链接 -->
              <button v-if="showInviteLinks" type="button" @click="go('group-invite-links')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <LinkIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_peer_invite_links') }}
                </p>
                <span v-if="inviteLinksCount > 0" class="text-xs text-gray-400 shrink-0">{{ inviteLinksCount }}</span>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            </div>
          </div>
        </section>

        <!-- 2. 管理 -->
        <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
          <div class="flex items-center gap-3 mb-1">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {{ t('groupEdit.management') }}
            </h3>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div class="mt-5 space-y-3">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
              <!-- 表情回应 -->
              <button type="button" @click="go('group-reactions')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <SmilePlusIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_peer_reactions') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 权限 -->
              <button v-if="showPermissions" type="button" @click="go('group-permissions')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ShieldIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_peer_permissions') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 管理员 -->
              <button type="button" @click="go('group-admins')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ShieldCheckIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_peer_administrators') }}
                </p>
                <span class="text-xs text-gray-400 shrink-0">{{ adminCount }}</span>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 成员 -->
              <button type="button" @click="go('group-members')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <UsersIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ isChannel ? t('lng_manage_peer_subscribers') : t('lng_manage_peer_members') }}
                </p>
                <span class="text-xs text-gray-400 shrink-0">{{ memberCount }}</span>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 被移除用户 -->
              <button v-if="showBlacklist" type="button" @click="go('group-blacklist')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <BanIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_peer_banned_users') }}
                </p>
                <span class="text-xs text-gray-400 shrink-0">{{ bannedCount }}</span>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              <!-- 近期操作 -->
              <button v-if="showEventLog" type="button" @click="go('group-event-log')"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <HistoryIcon class="w-5 h-5 text-gray-400 shrink-0" />
                <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                  {{ t('lng_manage_peer_recent_actions') }}
                </p>
                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            </div>
          </div>
        </section>

        <!-- 3. 删除 / 退出（互斥：创建者=删除，其他=退出） -->
        <section v-if="isCreator || canLeave">
          <button v-if="isCreator" type="button" @click="confirmDelete"
            class="w-full rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 px-4 py-3 flex items-center gap-3 text-left hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
            <Trash2Icon class="w-5 h-5 text-red-500 shrink-0" />
            <p class="min-w-0 flex-1 text-sm text-red-600 dark:text-red-400 truncate">
              {{ isChannel ? t('lng_profile_delete_channel') : t('lng_profile_delete_group') }}
            </p>
          </button>
          <button v-else type="button" @click="confirmLeave"
            class="w-full rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 px-4 py-3 flex items-center gap-3 text-left hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
            <LogOutIcon class="w-5 h-5 text-red-500 shrink-0" />
            <p class="min-w-0 flex-1 text-sm text-red-600 dark:text-red-400 truncate">
              {{ leaveLabel }}
            </p>
          </button>
        </section>

        <div v-if="loading" class="py-10 text-center text-sm text-gray-400">{{ t('groupEdit.loading') }}</div>
        <div v-else-if="loadError" class="py-10 text-center text-sm text-red-500">{{ t('groupEdit.loadFailed') }}</div>
      </div>
    </div>

    <AvatarEditorDialog v-model="photoVisible" :photos="[]" :current-photo-id="undefined" :chat-id="chatId"
      @changed="reload" />

    <!-- 删除 / 退出确认 -->
    <Teleport to="body">
      <div v-if="deleteVisible || leaveVisible" class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="deleteVisible = leaveVisible = false">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="px-5 py-4">
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
              {{ deleteVisible ? deleteLabel : leaveLabel }}
            </h3>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
              {{ deleteVisible
                ? (isChannel ? t('lng_sure_delete_channel') : t('lng_sure_delete_group'))
                : (isChannel ? t('lng_sure_leave_channel') : t('lng_sure_leave_group')) }}
            </p>
          </div>
          <div class="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2">
            <button type="button" class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="deleteVisible = leaveVisible = false">{{ t('lng_cancel') }}</button>
            <button v-if="deleteVisible" type="button" class="px-4 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              @click="doLeave">{{ t('lng_profile_delete_and_exit') }}</button>
            <button type="button" class="px-4 py-2 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600"
              @click="deleteVisible ? doDelete() : doLeave()">
              {{ deleteVisible ? deleteLabel : leaveLabel }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Megaphone as MegaphoneIcon,
  Users as UsersIcon,
  MessageSquareText as MessageSquareTextIcon,
  Eye as EyeIcon,
  Shield as ShieldIcon,
  ShieldCheck as ShieldCheckIcon,
  Ban as BanIcon,
  Trash2 as Trash2Icon,
  Palette as PaletteIcon,
  Languages as LanguagesIcon,
  ListTree as ListTreeIcon,
  Mail as MailIcon,
  History as HistoryIcon,
  Lock as LockIcon,
  Link as LinkIcon,
  SmilePlus as SmilePlusIcon,
  LogOut as LogOutIcon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import AvatarEditorDialog from '../../components/settings/AvatarEditorDialog.vue';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { tdlibSend } from '../../utils/tdlib';
import { loadChatBoostInfo, minAutoTranslateLevel } from '../../utils/chatBoost';
import {
  canChangeGroupInfo,
  canInviteUsers,
  canRestrictMembers,
  hasActiveUsername,
  isBasicGroupChat,
  isChannelChat,
  isCreatorStatus,
  loadGroupFullInfo,
  loadMyChatMemberStatus,
  isGroupChat,
} from '../../utils/groupRights';
import type { chat, ChatMemberStatus, supergroup, basicGroup } from 'tdlib-types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** 聊天 ID：Telegram 群/频道 id 可能为负数（如 -100…），不能用 > 0 判断 */
const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);
const chat = ref<chat | undefined>();
const status = ref<ChatMemberStatus | undefined>();
const title = ref('');
const about = ref('');
const aboutMax = ref(255);
const aboutTextarea = ref<HTMLTextAreaElement | null>(null);

/** 简介框按内容高度自适应：最小 3 行，超高后内部滚动 */
const ABOUT_MIN_HEIGHT = 72;
const ABOUT_MAX_HEIGHT = 280;

function resizeAboutTextarea() {
  const el = aboutTextarea.value;
  if (!el) return;
  el.style.height = 'auto';
  const next = Math.min(Math.max(el.scrollHeight, ABOUT_MIN_HEIGHT), ABOUT_MAX_HEIGHT);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > ABOUT_MAX_HEIGHT ? 'auto' : 'hidden';
}
const historyVisible = ref(true);
const adminCount = ref(0);
const memberCount = ref(0);
const bannedCount = ref(0);
const linkedChatId = ref(0);
const inviteLinksCount = ref(0);
const chatDescriptionSnapshot = ref('');
const saving = ref(false);
const loading = ref(true);
const loadError = ref(false);
const photoVisible = ref(false);
const deleteVisible = ref(false);
const leaveVisible = ref(false);

const isChannel = computed(() => isChannelChat(chat.value));
const isCreator = computed(() => isCreatorStatus(status.value));
const canChangeInfo = computed(() => canChangeGroupInfo(status.value, chat.value));
const chatAccentId = computed(() => {
  const c = chat.value as any;
  return c?.accent_color_id ?? c?.profile_accent_color_id;
});

const pageTitle = computed(() =>
  isChannel.value ? t('lng_edit_channel_title') : t('lng_edit_group')
);

const typeSummary = computed(() => {
  // Unigram：公开 / 私密 / 私密+限制保存
  const publicish = hasActiveUsername(supergroupLike.value);
  const protectedContent = !!chat.value?.has_protected_content;
  if (isChannel.value) {
    if (publicish) return t('lng_create_public_channel_title');
    return protectedContent
      ? `${t('lng_manage_peer_link_permanent')} · ${t('lng_manage_peer_no_forwards')}`
      : t('lng_manage_peer_link_permanent');
  }
  if (publicish) return t('lng_create_public_group_title');
  return protectedContent
    ? `${t('lng_manage_peer_link_permanent')} · ${t('lng_manage_peer_no_forwards')}`
    : t('lng_manage_peer_link_permanent');
});

const showTypeRow = computed(() => isCreator.value);
/** 讨论：频道侧配置讨论组 */
const showDiscussionRow = computed(() => isCreator.value && isChannel.value);
/** 已关联频道：群组侧展示所关联的频道 */
const showLinkedChannelRow = computed(() => !isChannel.value && linkedChatId.value > 0);
const showHistoryRow = computed(() => {
  // Unigram：基本群仅创建者；超级群 canChangeInfo 且无公开链接、非频道、未关联讨论
  if (isChannel.value) return false;
  if (isBasicGroupChat(chat.value)) return isCreator.value;
  if (!canChangeInfo.value) return false;
  if (hasActiveUsername(supergroupLike.value)) return false;
  return linkedChatId.value === 0;
});
const showInviteLinks = computed(() => {
  // Unigram：canInviteUsers && !hasActiveUsername（基本群不看 username）
  if (!canInviteUsers(status.value, chat.value)) return false;
  return !hasActiveUsername(supergroupLike.value);
});
const showPermissions = computed(() => {
  if (isChannel.value) return false;
  if (isBasicGroupChat(chat.value)) return isCreator.value;
  return canRestrictMembers(status.value);
});
const showBlacklist = computed(() => !isBasicGroupChat(chat.value) && canRestrictMembers(status.value));
// Unigram：超级群 EventLog 恒显示（进入编辑页即可）
const showEventLog = computed(() => !isBasicGroupChat(chat.value));
// 外观：仅群主/频道主（创建者）可设
const showAppearance = computed(() => isCreator.value);
const showAutoTranslate = computed(() => isChannel.value && canChangeInfo.value);
const showTopics = computed(() => isCreator.value && !isChannel.value && linkedChatId.value === 0);
const showDirectMessages = computed(() => isCreator.value && isChannel.value);
const showSettingsSection = computed(
  () =>
    showTypeRow.value
    || showDiscussionRow.value
    || showAppearance.value
    || showAutoTranslate.value
    || showDirectMessages.value
    || showLinkedChannelRow.value
    || showTopics.value
    || showHistoryRow.value
    || showInviteLinks.value
);
/** 非创建者可退出（创建者走删除，删除优先覆盖退出） */
const canLeave = computed(() => !isCreator.value);
const deleteLabel = computed(() =>
  isChannel.value ? t('lng_profile_delete_channel') : t('lng_profile_delete_group')
);
const leaveLabel = computed(() =>
  isChannel.value ? t('lng_profile_leave_channel') : t('lng_profile_leave_group')
);
const autoTranslate = ref(false);
const boostLevel = ref(0);
const minAutoTranslate = ref(1);

const autoTranslateLocked = computed(() => boostLevel.value < minAutoTranslate.value);

async function onAutoTranslate(v: boolean) {
  if (!chat.value || chat.value.type._ !== 'chatTypeSupergroup') return;
  if (autoTranslateLocked.value) {
    MessagePlugin.warning(t('lng_boost_channel_needs_level_autotranslate', { count: minAutoTranslate.value }));
    return;
  }
  autoTranslate.value = v;
  try {
    await tdlibSend({
      _: 'toggleSupergroupHasAutomaticTranslation',
      supergroup_id: chat.value.type.supergroup_id,
      has_automatic_translation: v,
    });
  } catch (e: any) {
    autoTranslate.value = !v;
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

const supergroupLike = ref<supergroup | basicGroup | null>(null);

function go(name: string) {
  router.push({ name, params: { id: String(chatId.value) } });
}

function goBack() {
  router.back();
}

async function onHistoryToggle(v: boolean) {
  historyVisible.value = v;
}

async function reload() {
  loading.value = true;
  loadError.value = false;
  try {
    const { chat: c, status: st, supergroup, basicGroup } = await loadMyChatMemberStatus(chatId.value);
    if (!c || !isGroupChat(c)) {
      loadError.value = true;
      return;
    }
    chat.value = c;
    status.value = st;
    supergroupLike.value = supergroup ?? basicGroup ?? null;
    title.value = c.title ?? '';
    autoTranslate.value = !!(supergroup as any)?.has_automatic_translation;
    const boost = await loadChatBoostInfo(c);
    boostLevel.value = boost.level;
    minAutoTranslate.value = minAutoTranslateLevel(boost.features);
    const full = await loadGroupFullInfo(c);
    about.value = full.description;
    chatDescriptionSnapshot.value = full.description;
    historyVisible.value = full.isAllHistoryAvailable;
    adminCount.value = full.administratorCount;
    memberCount.value = full.memberCount;
    bannedCount.value = full.bannedCount;
    linkedChatId.value = full.linkedChatId;
    try {
      const myId = (await tdlibSend({ _: 'getMe' })).id;
      const links = await tdlibSend({
        _: 'getChatInviteLinks',
        chat_id: chatId.value,
        creator_user_id: myId,
        revoked: false,
        offset_date: 0,
        offset_invite_link: '',
        limit: 1,
      });
      inviteLinksCount.value = (links as { total_count?: number }).total_count ?? 0;
    } catch {
      inviteLinksCount.value = 0;
    }
  } catch (e) {
    console.error('GroupEdit load failed', e);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!chat.value || !canChangeInfo.value) return;
  const name = title.value.trim();
  if (!name) {
    MessagePlugin.warning(t('groupEdit.titleRequired'));
    return;
  }
  saving.value = true;
  try {
    if (name !== chat.value.title) {
      await tdlibSend({ _: 'setChatTitle', chat_id: chatId.value, title: name });
    }
    const nextAbout = about.value.trim();
    if (nextAbout !== (chatDescriptionSnapshot.value ?? '')) {
      await tdlibSend({ _: 'setChatDescription', chat_id: chatId.value, description: nextAbout });
    }

    // 基本群：打开「新成员可见历史」需先升级为超级群
    let target = chat.value;
    if (
      showHistoryRow.value
      && historyVisible.value
      && target.type._ === 'chatTypeBasicGroup'
    ) {
      const upgraded = await tdlibSend({
        _: 'upgradeBasicGroupChatToSupergroupChat',
        chat_id: chatId.value,
      });
      if (upgraded && typeof upgraded === 'object' && (upgraded as chat)._ === 'chat') {
        target = upgraded as chat;
      }
    }

    // 超级群历史可见性
    if (target.type._ === 'chatTypeSupergroup' && showHistoryRow.value) {
      await tdlibSend({
        _: 'toggleSupergroupIsAllHistoryAvailable',
        supergroup_id: target.type.supergroup_id,
        is_all_history_available: historyVisible.value,
      });
    }
    MessagePlugin.success(t('groupEdit.saved'));
    await reload();
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('groupEdit.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function confirmDelete() {
  deleteVisible.value = true;
}

function confirmLeave() {
  leaveVisible.value = true;
}

async function doDelete() {
  try {
    await tdlibSend({ _: 'deleteChat', chat_id: chatId.value });
    MessagePlugin.success(t('lng_settings_save'));
    deleteVisible.value = false;
    leaveVisible.value = false;
    router.push('/home/chats');
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

async function doLeave() {
  try {
    await tdlibSend({ _: 'leaveChat', chat_id: chatId.value });
    MessagePlugin.success(t('lng_profile_delete_and_exit'));
    deleteVisible.value = false;
    leaveVisible.value = false;
    router.push('/home/chats');
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('lng_settings_save'));
  }
}

watch(chatId, () => {
  if (hasChatId.value) reload();
});

onMounted(() => {
  void loadAboutMax();
  if (hasChatId.value) reload();
  else {
    loading.value = false;
    loadError.value = true;
  }
  void nextTick(resizeAboutTextarea);
});

async function loadAboutMax() {
  try {
    const res = (await tdlibSend({ _: 'getOption', name: 'about_length_max' })) as { _?: string; value?: number };
    if (res?._ === 'optionValueInteger') aboutMax.value = Number(res.value);
  } catch {
    aboutMax.value = 255;
  }
}

watch(about, () => {
  void nextTick(resizeAboutTextarea);
});
</script>

<style scoped>
/* 简介编辑框：按内容宽度自动换行；滚动条见全局 .input-scrollbar */
.bio-textarea {
  box-sizing: border-box;
  min-height: 72px;
  max-height: 280px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
