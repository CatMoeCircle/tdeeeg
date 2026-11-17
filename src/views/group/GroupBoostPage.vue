<template>
  <div class="h-full flex flex-col">
    <!-- 顶部返回栏 -->
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1 truncate">{{ t('boostPage.title') }}</h2>
      <span v-if="status" class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 shrink-0">
        {{ t('boostPage.levelLabel', { count: status?.level ?? 0 }) }}
      </span>
      <BaseButton v-if="freeSlots.length" type="button" class="shrink-0 !flex items-center gap-1.5" @click="openBoostDialog()">
        <TgIcon name="boost" :size="16" />
        {{ t('boostPage.boostAction') }}
      </BaseButton>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="w-full space-y-6">
        <LoadingSkeleton v-if="loading" variant="form" :rows="4" :label="t('boostPage.loading')" />

        <!-- 不可助推 / 加载失败说明 -->
        <div v-else-if="unsupported || errorText"
          class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-8 text-center">
          <div class="w-12 h-12 mx-auto rounded-2xl bg-gray-500/10 flex items-center justify-center">
            <TgIcon name="boost" :size="26" class="opacity-40" />
          </div>
          <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">
            {{ unsupported ? t('boostPage.unsupported') : t('boostPage.notBoostable') }}
          </p>
          <p v-if="errorText && !unsupported" class="mt-1 text-xs text-gray-400 break-words">{{ errorText }}</p>
        </div>

        <template v-else-if="status">
          <!-- 当前等级与进度 -->
          <section>
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-5">
              <div class="flex items-center gap-4">
                <div class="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <TgIcon name="boost" :size="30" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {{ t('boostPage.levelLabel', { count: progress.level }) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ t('boostPage.boostCount', { count: status?.boost_count ?? 0 }) }}
                  </p>
                </div>
                <span v-if="appliedCount > 0"
                  class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 shrink-0">
                  <TgIcon name="boosted" :size="12" />
                  {{ t('boostPage.myBoost') }}
                </span>
              </div>

              <div class="mt-4">
                <div class="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  <span class="shrink-0">{{ t('boostPage.levelLabel', { count: progress.level }) }}</span>
                  <span class="min-w-0 truncate text-right">
                    {{ progress.isMax
                      ? t('boostPage.levelMax')
                      : t('boostPage.progressHint', { count: progress.needed, level: progress.level + 1 }) }}
                  </span>
                </div>
                <div class="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div class="h-full rounded-full bg-amber-500 transition-all duration-300"
                    :style="{ width: progress.percent + '%' }"></div>
                </div>
              </div>

              <div v-if="(status?.premium_member_count ?? 0) > 0" class="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                <TgIcon name="premium" :size="14" />
                {{ t('boostPage.premiumMembersPercent', { count: status?.premium_member_count ?? 0, percent: premiumPercent }) }}
              </div>
              <div v-if="(status?.gift_code_boost_count ?? 0) > 0" class="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                <TgIcon name="gift" :size="14" />
                {{ t('boostPage.giftCodeBoosts', { count: status?.gift_code_boost_count ?? 0 }) }}
              </div>
            </div>
          </section>

          <!-- 可用助推位 -->
          <section>
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ t('boostPage.slotsSection') }}
              </h3>
              <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
              <span v-if="slots.length" class="text-xs text-gray-400 shrink-0">
                {{ t('boostPage.slotsFreeCount', { count: freeSlots.length }) }}
              </span>
            </div>
            <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
              <div v-for="slot in slots" :key="slot.slot_id" class="flex items-center gap-3 px-4 py-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  :class="isSlotFree(slot) ? 'bg-amber-500/10' : 'bg-gray-500/10'">
                  <TgIcon name="boost" :size="18" :class="isSlotFree(slot) ? '' : 'opacity-40'" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-800 dark:text-gray-100">
                    {{ t('boostPage.slotLabel', { index: slot.slot_id + 1 }) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5 truncate">{{ slotStatusText(slot) }}</p>
                </div>
                <BaseButton v-if="isSlotFree(slot)" variant="ghost" size="sm" class="shrink-0" @click="openBoostDialog(slot.slot_id)">
                  {{ t('boostPage.boostAction') }}
                </BaseButton>
              </div>
              <p v-if="!slots.length" class="px-4 py-3 text-sm text-gray-400">{{ t('boostPage.noSlotsHint') }}</p>
            </div>
            <p v-if="slots.length && !freeSlots.length" class="mt-3 text-xs text-gray-400">
              {{ t('boostPage.slotsBusyHint') }}
            </p>
          </section>

          <!-- 下一等级解锁的功能 -->
          <section v-if="perkItems.length">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ t('boostPage.nextLevelSection', { level: progress.level + 1 }) }}
              </h3>
              <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
            </div>
            <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-4 py-3">
              <ul class="space-y-2">
                <li v-for="item in perkItems" :key="item" class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                  <span class="min-w-0">{{ item }}</span>
                </li>
              </ul>
            </div>
          </section>

          <!-- 助推者列表 -->
          <section>
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ t('boostPage.boostersSection') }}
              </h3>
              <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
              <span v-if="totalBoosts > 0" class="text-xs text-gray-400 shrink-0">
                {{ t('boostPage.boostersCount', { count: totalBoosts }) }}
              </span>
            </div>

            <LoadingSkeleton v-if="boostsLoading && !boosts.length" class="mt-5" variant="list" avatar
              :rows="3" :label="t('boostPage.loading')" />

            <div v-else-if="boostsDenied"
              class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-4 py-3 text-sm text-gray-400">
              {{ t('boostPage.boostersUnavailable') }}
            </div>

            <div v-else-if="!boosts.length"
              class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-4 py-3 text-sm text-gray-400">
              {{ t('boostPage.boostersEmpty') }}
            </div>

            <template v-else>
              <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                <div v-for="item in boosts" :key="item.id" class="flex items-center gap-3 px-4 py-3">
                  <div class="w-10 h-10 shrink-0">
                    <Avatar :photo="boostUser(item)?.profile_photo" :title="boosterName(item)"
                      :first-name="boostUser(item)?.first_name" :last-name="boostUser(item)?.last_name"
                      :accent-color-id="boostUser(item)?.accent_color_id"
                      :deleted-account="isDeletedUserId(boostSourceUserId(item))" sizeClass="!w-10 !h-10" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ boosterName(item) }}</p>
                    <p class="text-xs text-gray-400 mt-0.5 truncate">{{ boosterSubtitle(item) }}</p>
                  </div>
                  <span v-if="item.count > 1"
                    class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 shrink-0">
                    ×{{ item.count }}
                  </span>
                </div>
              </div>
              <div v-if="nextOffset" class="mt-3 flex justify-center">
                <BaseButton variant="ghost" size="sm" :disabled="boostsLoading" @click="loadMoreBoosts">
                  {{ boostsLoading ? t('boostPage.loadingMore') : t('boostPage.loadMore') }}
                </BaseButton>
              </div>
            </template>
          </section>

          <!-- 助推链接 -->
          <section v-if="linkValue">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ t('boostPage.linkSection') }}
              </h3>
              <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
            </div>
            <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4">
              <div class="flex items-center gap-2">
                <LinkIcon class="w-4 h-4 text-gray-400 shrink-0" />
                <input :value="linkValue" readonly
                  class="min-w-0 flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-600 dark:text-gray-300 focus:outline-none" />
                <BaseButton variant="ghost" size="sm" class="shrink-0" @click="copyBoostLink">
                  {{ t('boostPage.copyLink') }}
                </BaseButton>
                <BaseButton size="sm" class="shrink-0" @click="shareBoostLink">
                  {{ t('boostPage.shareLink') }}
                </BaseButton>
              </div>
              <p class="mt-2 text-xs text-gray-400">
                {{ boostLink && !boostLink.is_public ? t('boostPage.linkPrivate') : t('boostPage.linkHint') }}
              </p>
            </div>
          </section>
        </template>
      </div>
    </div>

    <!-- 助推位选择弹窗 -->
    <ModalDialog v-model="dialogOpen" :title="t('boostPage.confirmTitle')">
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('boostPage.confirmText') }}</p>
      <div class="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        <label v-for="slot in freeSlots" :key="slot.slot_id"
          class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
          <input v-model="selectedSlotIds" type="checkbox" :value="slot.slot_id"
            class="w-4 h-4 accent-blue-500 shrink-0" />
          <span class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100">
            {{ t('boostPage.slotLabel', { index: slot.slot_id + 1 }) }}
          </span>
          <span class="text-xs text-gray-400 shrink-0">{{ t('boostPage.slotFree') }}</span>
        </label>
      </div>
      <template #footer>
        <BaseButton variant="ghost" size="sm" @click="dialogOpen = false">{{ t('boostPage.cancel') }}</BaseButton>
        <BaseButton size="sm" :disabled="!selectedSlotIds.length || boosting" @click="doBoost">
          {{ boosting ? t('boostPage.boosting') : t('boostPage.confirmBoost') }}
        </BaseButton>
      </template>
    </ModalDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronLeft as ChevronLeftIcon, Link as LinkIcon } from 'lucide-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import ModalDialog from '../../components/ui/modal/ModalDialog.vue';
import TgIcon from '../../components/common/TgIcon.vue';
import { tdlibSend } from '../../utils/session/tdlib';
import { toast } from '../../utils/ui/toast';
import {
  ensureUser,
  getReactiveUser,
  getUserDisplayName,
  isDeletedUserId,
} from '../../utils/profile/senderInfo';
import {
  boostProgress,
  boostSourceUserId,
  formatBoostDate,
  freeBoostSlots,
  isBoostSlotFree,
  pickNextLevelFeatures,
} from '../../utils/chat/boostStatus';
import type {
  chatBoost,
  chatBoostLevelFeatures,
  chatBoostLink,
  chatBoostSlot,
  chatBoostStatus,
} from 'tdlib-types';

/** 助推者列表每页数量（getChatBoosts 单次上限 100） */
const BOOSTS_PAGE_SIZE = 20;

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);

const loading = ref(true);
const unsupported = ref(false);
const errorText = ref('');
const status = ref<chatBoostStatus | null>(null);
const slots = ref<chatBoostSlot[]>([]);
const boostLink = ref<chatBoostLink | null>(null);
const nextLevelPerks = ref<chatBoostLevelFeatures | null>(null);

const boosts = ref<chatBoost[]>([]);
const boostsLoading = ref(false);
const boostsDenied = ref(false);
const nextOffset = ref('');
const totalBoosts = ref(0);

/** 助推者请求序号：reset 请求可接管在飞的旧请求，旧响应按序号丢弃，避免列表停在空态 */
let boostsRequestSeq = 0;

const boosting = ref(false);
const dialogOpen = ref(false);
const selectedSlotIds = ref<number[]>([]);

/** 当前用户可立即用于助推的空闲槽位 */
const freeSlots = computed(() => freeBoostSlots(slots.value));
/** 等级进度（当前等级 / 距下一级所需助推数） */
const progress = computed(() => boostProgress(status.value));
/** 本人在此会话已应用的助推位数 */
const appliedCount = computed(() => status.value?.applied_slot_ids?.length ?? 0);
/** Premium 成员占比：TDLib 的 premium_member_percentage 已是 0~100 的百分数
 *（tdlib BoostManager 按 100.0 * premium_member_count / participant_count 计算，不再做单位猜测） */
const premiumPercent = computed(() => {
  const raw = status.value?.premium_member_percentage ?? 0;
  return Math.round(raw * 10) / 10;
});
/** 助推链接：优先 getChatBoostLink，失败时退回 boostStatus.boost_url */
const linkValue = computed(() => boostLink.value?.link || status.value?.boost_url || '');

/** 下一等级解锁的功能文案（只列出有增量的项） */
const perkItems = computed<string[]>(() => {
  const f = nextLevelPerks.value;
  if (!f) return [];
  const items: string[] = [];
  if (f.story_per_day_count > 0) items.push(t('boostPage.perkStories', { count: f.story_per_day_count }));
  if (f.custom_emoji_reaction_count > 0) items.push(t('boostPage.perkCustomReactions', { count: f.custom_emoji_reaction_count }));
  if (f.title_color_count > 0) items.push(t('boostPage.perkTitleColors', { count: f.title_color_count }));
  if (f.profile_accent_color_count > 0) items.push(t('boostPage.perkProfileColors', { count: f.profile_accent_color_count }));
  if (f.accent_color_count > 0) items.push(t('boostPage.perkAccentColors', { count: f.accent_color_count }));
  if (f.can_set_emoji_status) items.push(t('boostPage.perkEmojiStatus'));
  if (f.can_set_custom_background) items.push(t('boostPage.perkCustomBackground'));
  if (f.can_set_custom_emoji_sticker_set) items.push(t('boostPage.perkCustomEmojiStickerSet'));
  if (f.can_enable_automatic_translation) items.push(t('boostPage.perkAutoTranslate'));
  if (f.can_recognize_speech) items.push(t('boostPage.perkSpeechRecognition'));
  if (f.can_disable_sponsored_messages) items.push(t('boostPage.perkNoSponsored'));
  return items.slice(0, 6);
});

function goBack() {
  router.back();
}

/** 槽位是否可用 */
function isSlotFree(slot: chatBoostSlot): boolean {
  return isBoostSlotFree(slot);
}

function slotStatusText(slot: chatBoostSlot): string {
  if (slot.currently_boosted_chat_id === chatId.value) return t('boostPage.slotMine');
  if (slot.currently_boosted_chat_id > 0) return t('boostPage.slotInUse');
  if (!isSlotFree(slot)) return t('boostPage.slotCooldown', { date: formatBoostDate(slot.cooldown_until_date, locale.value) });
  return t('boostPage.slotFree');
}

function boostUser(item: chatBoost) {
  const userId = boostSourceUserId(item);
  return userId > 0 ? getReactiveUser(userId) : undefined;
}

function boosterName(item: chatBoost): string {
  const userId = boostSourceUserId(item);
  if (userId <= 0) return t('boostPage.sourceUnclaimed');
  return getUserDisplayName(userId) || t('boostPage.unknownUser');
}

function boosterSubtitle(item: chatBoost): string {
  const parts: string[] = [];
  if (item.source?._ === 'chatBoostSourceGiveaway') parts.push(t('boostPage.sourceGiveaway'));
  else if (item.source?._ === 'chatBoostSourceGiftCode') parts.push(t('boostPage.sourceGiftCode'));
  if (item.expiration_date) parts.push(t('boostPage.expiresOn', { date: formatBoostDate(item.expiration_date, locale.value) }));
  return parts.join(' · ');
}

/** 加载助推状态、槽位、助推链接与等级功能 */
async function reload() {
  if (!hasChatId.value) {
    loading.value = false;
    unsupported.value = true;
    return;
  }
  loading.value = true;
  unsupported.value = false;
  errorText.value = '';
  // 路由切换 / 连续刷新：让仍在飞的旧助推者请求作废，避免旧列表或空态残留
  boostsRequestSeq += 1;
  boostsLoading.value = false;
  status.value = null;
  slots.value = [];
  boostLink.value = null;
  nextLevelPerks.value = null;
  nextOffset.value = '';
  totalBoosts.value = 0;
  boosts.value = [];
  try {
    const chat = await tdlibSend({ _: 'getChat', chat_id: chatId.value });
    if (chat.type._ !== 'chatTypeSupergroup') {
      unsupported.value = true;
      return;
    }
    const isChannel = chat.type.is_channel;
    const [boostStatus, boostSlots, link, features] = await Promise.all([
      tdlibSend({ _: 'getChatBoostStatus', chat_id: chatId.value }),
      tdlibSend({ _: 'getAvailableChatBoostSlots' }).catch(() => null),
      tdlibSend({ _: 'getChatBoostLink', chat_id: chatId.value }).catch(() => null),
      tdlibSend({ _: 'getChatBoostFeatures', is_channel: isChannel }).catch(() => null),
    ]);
    status.value = boostStatus;
    slots.value = boostSlots?.slots ?? [];
    boostLink.value = link;
    nextLevelPerks.value = pickNextLevelFeatures(features, boostStatus.level);
  } catch (e: any) {
    // getChatBoostStatus 失败：该会话不可助推（如普通群组 / 无权限）
    errorText.value = String(e?.message ?? '') || t('boostPage.loadFailed');
  } finally {
    loading.value = false;
  }
  // 状态就绪后再拉助推者列表；await 保证刷新 / 路由切换时列表不会停在空态
  if (status.value) await loadBoosts(true);
}

/** 加载助推者列表；reset 为 true 时从第一页重新加载，并可接管在飞的旧请求 */
async function loadBoosts(reset: boolean) {
  if (!hasChatId.value) return;
  // 加载更多：已有请求在飞或没有下一页时忽略
  if (!reset && (boostsLoading.value || !nextOffset.value)) return;
  // reset 递增序号接管旧请求：旧响应的数据与 loading 收尾都会按序号丢弃
  const seq = ++boostsRequestSeq;
  boostsLoading.value = true;
  if (reset) {
    boosts.value = [];
    nextOffset.value = '';
    totalBoosts.value = 0;
    boostsDenied.value = false;
  }
  try {
    const found = await tdlibSend({
      _: 'getChatBoosts',
      chat_id: chatId.value,
      only_gift_codes: false,
      offset: reset ? '' : nextOffset.value,
      limit: BOOSTS_PAGE_SIZE,
    });
    if (seq !== boostsRequestSeq) return;
    boosts.value = reset ? found.boosts : [...boosts.value, ...found.boosts];
    nextOffset.value = found.next_offset;
    totalBoosts.value = found.total_count;
    // 助推者资料：头像与名字来自 senderInfo 缓存
    const userIds = [...new Set(found.boosts.map((item) => boostSourceUserId(item)).filter((id) => id > 0))];
    await Promise.all(userIds.map((userId) => ensureUser(userId).catch(() => undefined)));
  } catch {
    if (seq !== boostsRequestSeq) return;
    // 非管理员无权限读取助推者列表：页面内展示说明文案；加载更多失败则只提示，不清空已有列表
    if (reset) boostsDenied.value = true;
    else toast.error(t('boostPage.errors.loadMore'));
  } finally {
    if (seq === boostsRequestSeq) boostsLoading.value = false;
  }
}

function loadMoreBoosts() {
  return loadBoosts(false);
}

/** 助推成功后只刷新状态与槽位，避免整页骨架闪烁 */
async function refreshStatusAfterBoost() {
  try {
    status.value = await tdlibSend({ _: 'getChatBoostStatus', chat_id: chatId.value });
  } catch {
    // 保留旧状态
  }
  try {
    const boostSlots = await tdlibSend({ _: 'getAvailableChatBoostSlots' });
    slots.value = boostSlots.slots ?? [];
  } catch {
    // 保留旧槽位
  }
  void loadBoosts(true);
}

/** 打开助推弹窗；传入点击的槽位 id 时预选该槽位，否则预选第一个空闲槽位 */
function openBoostDialog(slotId?: number) {
  if (!freeSlots.value.length) return;
  const preselected = slotId !== undefined && freeSlots.value.some((slot) => slot.slot_id === slotId)
    ? slotId
    : freeSlots.value[0].slot_id;
  selectedSlotIds.value = [preselected];
  dialogOpen.value = true;
}

function onBoostError(e: any): string {
  const message = String(e?.message ?? '');
  if (/premium/i.test(message)) return t('boostPage.errors.premiumRequired');
  if (/already/i.test(message)) return t('boostPage.errors.alreadyBoosted');
  if (/flood|too many/i.test(message)) return t('boostPage.errors.flood');
  if (/slot|cooldown/i.test(message)) return t('boostPage.errors.noSlot');
  return message || t('boostPage.errors.generic');
}

async function doBoost() {
  if (!selectedSlotIds.value.length || boosting.value) return;
  boosting.value = true;
  try {
    const remaining = await tdlibSend({
      _: 'boostChat',
      chat_id: chatId.value,
      slot_ids: [...selectedSlotIds.value],
    });
    slots.value = remaining.slots ?? [];
    dialogOpen.value = false;
    toast.success(t('boostPage.boostSuccess'));
    await refreshStatusAfterBoost();
  } catch (e: any) {
    // 付费 / Premium 等限制由 TDLib 错误体现，这里只做提示，不自行发起支付流程
    toast.error(onBoostError(e));
  } finally {
    boosting.value = false;
  }
}

async function copyBoostLink() {
  if (!linkValue.value) return;
  try {
    await navigator.clipboard.writeText(linkValue.value);
    toast.success(t('boostPage.linkCopied'));
  } catch {
    toast.error(t('boostPage.linkCopyFailed'));
  }
}

async function shareBoostLink() {
  if (!linkValue.value) return;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: t('boostPage.title'), url: linkValue.value });
      return;
    } catch {
      // 用户取消或系统分享不可用：回退到复制
    }
  }
  await copyBoostLink();
}

watch(() => route.params.id, () => {
  if (hasChatId.value) void reload();
});

onMounted(() => {
  void reload();
});
</script>
