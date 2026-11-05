<template>
    <Teleport to="body">
        <Transition name="csc-drop">
            <div v-if="visible && sender" ref="rootRef" class="fixed z-10000" :style="cardStyle"
                @contextmenu.prevent.stop @mousedown.stop>
                <div class="csc-card">
                    <!-- 头部：头像 + 名称 + 状态 / 成员数 -->
                    <div class="csc-head" :class="{ 'csc-head-clickable': canOpenProfile }" @click="openProfile">
                        <div class="csc-avatar">
                            <div v-if="isDeleted" class="csc-ghost-wrap">
                                <span class="tgico tgico-avatar-deletedaccount csc-ghost"></span>
                            </div>
                            <Avatar v-else :photo="photo" :title="displayTitle"
                                :first-name="nameParts.first" :last-name="nameParts.last"
                                :radius="100" :accentColorId="accentColorId" />
                        </div>

                        <div class="csc-title-wrap">
                            <!-- 第 1 行：名称 + 状态标识 -->
                            <p class="csc-title">
                                <span class="csc-title-text"><GlobalEmojiText :text="displayTitle" /></span>
                                <CustomEmojiInline v-if="orgVerifyEmojiId" :emojiId="orgVerifyEmojiId" :size="15"
                                    class="shrink-0" />
                                <ShieldAlert v-if="isScamOrFake" class="w-3.5 h-3.5 text-red-500 shrink-0"
                                    :title="scamOrFakeTitle" />
                                <CustomEmojiInline v-else-if="giftEmojiId" :emojiId="giftEmojiId" :size="16"
                                    class="shrink-0" />
                                <PremiumStatusIcon v-else-if="isPremiumStar" class="text-[16px] shrink-0"
                                    :title="t('lng_premium_summary_title')" />
                                <VerifiedBadge v-else-if="isVerified" class="text-sm"
                                    :title="t('profileBadges.verified')" />
                            </p>
                            <!-- 第 2 行：在线状态 / 成员数 -->
                            <p v-if="subtitle" class="csc-subtitle">{{ subtitle }}</p>
                            <!-- 第 3 行：@用户名 + ID（各自可点击复制；用户名过长折叠省略） -->
                            <p class="csc-ident">
                                <button v-if="username" type="button" class="csc-ident-part csc-ident-username"
                                    :title="`@${username}`" @click.stop="copyUsername">
                                    <AtSignIcon class="csc-ident-icon" />
                                    <span class="csc-ident-text">{{ username }}</span>
                                </button>
                                <span v-if="username && idText" class="csc-ident-sep" aria-hidden="true">·</span>
                                <button v-if="idText" type="button" class="csc-ident-part csc-ident-id"
                                    :title="idText" @click.stop="copyId">
                                    <IdCardIcon class="csc-ident-icon" />
                                    <span class="csc-ident-text">{{ idText }}</span>
                                </button>
                            </p>
                        </div>
                    </div>

                    <!-- 信息区：简介 -->
                    <div v-if="bio" class="csc-info">
                        <div class="csc-row csc-row-top">
                            <AlignLeftIcon class="csc-row-icon" />
                            <span class="csc-bio">{{ bio }}</span>
                        </div>
                    </div>

                    <!-- 操作区：@对方 / 查看主页 -->
                    <div class="csc-actions">
                        <button type="button" class="csc-btn csc-btn-primary" :disabled="!canMention"
                            @click.stop="mention">
                            <AtSignIcon class="w-4 h-4" />
                            <span>{{ t('lng_context_mention') }}</span>
                        </button>
                        <button type="button" class="csc-btn" :disabled="!canOpenProfile" @click.stop="openProfile">
                            <UserRoundIcon class="w-4 h-4" />
                            <span>{{ t(profileLabelKey) }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    AtSign as AtSignIcon, AlignLeft as AlignLeftIcon, IdCard as IdCardIcon,
    UserRound as UserRoundIcon, ShieldAlert,
} from 'lucide-vue-next';
import Avatar from './avatar.vue';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';
import CustomEmojiInline from '../common/CustomEmojiInline.vue';
import PremiumStatusIcon from '../common/PremiumStatusIcon.vue';
import VerifiedBadge from '../common/VerifiedBadge.vue';
import { useUserProfileStore } from '../../store/profile/userProfile';
import { requestInsertMention } from '../../store/chat/mentionInsert';
import { visible, x, y, sender, target, closeSenderCard } from '../../store/chat/senderCard';
import {
    getSenderName, getSenderNameParts, getSenderPhoto, getSenderProfileAccentColorId,
    getReactiveUser, getReactiveChat, getReactiveSupergroup, getReactiveBasicGroup,
    ensureUser, ensureChat, ensureSupergroup, ensureBasicGroup,
    isDeletedSender, getChatEmojiStatus, emojiStatusCustomEmojiId,
} from '../../utils/profile/senderInfo';
import formatStatus from '../../utils/profile/status';
import { toast } from '../../utils/ui/toast';

const { t } = useI18n();
const router = useRouter();
const profileStore = useUserProfileStore();

const rootRef = ref<HTMLElement | null>(null);
const cardStyle = ref<Record<string, string>>({ left: '0px', top: '0px' });

const numberFormatter = new Intl.NumberFormat();

/** 发送者用户 id / 发送者频道 chat id（二者互斥） */
const senderUserId = computed(() => (sender.value?._ === 'messageSenderUser' ? sender.value.user_id : undefined));
const senderChatId = computed(() => (sender.value?._ === 'messageSenderChat' ? sender.value.chat_id : undefined));

/** 响应式缓存对象（加载完成后自动驱动视图更新） */
const userObj = computed(() => (senderUserId.value === undefined ? undefined : getReactiveUser(senderUserId.value)));
const chatObj = computed(() => (senderChatId.value === undefined ? undefined : getReactiveChat(senderChatId.value)));

const supergroupObj = computed(() => {
    const type = chatObj.value?.type;
    return type?._ === 'chatTypeSupergroup' ? getReactiveSupergroup(type.supergroup_id) : undefined;
});
const basicGroupObj = computed(() => {
    const type = chatObj.value?.type;
    return type?._ === 'chatTypeBasicGroup' ? getReactiveBasicGroup(type.basic_group_id) : undefined;
});

const isDeleted = computed(() => isDeletedSender(sender.value ?? undefined));

const displayTitle = computed(() => {
    if (!sender.value) return '';
    return getSenderName(sender.value) || t('lng_credits_box_history_entry_anonymous');
});

const nameParts = computed(() => getSenderNameParts(sender.value ?? undefined));

const photo = computed(() => getSenderPhoto(sender.value ?? undefined));

/** 头像首字母渐变用的 accent 色（无有效值交给 Avatar 自身按标题哈希） */
const accentColorId = computed(() => {
    const s = sender.value;
    if (!s) return undefined;
    const id = getSenderProfileAccentColorId(s);
    return typeof id === 'number' && id >= 0 ? id : undefined;
});

/** 副标题：用户=在线状态（bot 显示月活）；频道/群组=订阅数/成员数 */
const subtitle = computed(() => {
    if (senderUserId.value !== undefined) {
        const u = userObj.value;
        if (!u) return '';
        if (u.type._ === 'userTypeBot') {
            return u.type.active_user_count > 0
                ? t('lng_bot_status_users', { count: numberFormatter.format(u.type.active_user_count) })
                : t('lng_sr_chat_bot');
        }
        if (u.type._ === 'userTypeDeleted' || u.type._ === 'userTypeUnknown') return t('lng_deleted');
        return formatStatus(u);
    }

    const c = chatObj.value;
    if (!c) return '';
    const type = c.type;
    if (type?._ === 'chatTypeSupergroup') {
        const count = supergroupObj.value?.member_count ?? 0;
        if (count > 0) {
            return type.is_channel
                ? t('lng_chat_status_subscribers', { count: numberFormatter.format(count) })
                : t('lng_chat_status_members', { count: numberFormatter.format(count) });
        }
        return type.is_channel ? t('lng_notification_channels') : t('lng_notification_groups');
    }
    if (type?._ === 'chatTypeBasicGroup') {
        const count = basicGroupObj.value?.member_count ?? 0;
        return count > 0
            ? t('lng_chat_status_members', { count: numberFormatter.format(count) })
            : t('lng_notification_groups');
    }
    return '';
});

/** 认证来源：用户取自己的，频道/supergroup 取群信息 */
const verification = computed(() => userObj.value?.verification_status ?? supergroupObj.value?.verification_status);

/** 机构认证 / 诈骗 / 虚假 / 礼物 / 会员标识（与消息行内标识一致） */
const orgVerifyEmojiId = computed(() => {
    const id = verification.value?.bot_verification_icon_custom_emoji_id;
    return id && id !== '0' ? id : '';
});
const isScamOrFake = computed(() => !!(verification.value?.is_scam || verification.value?.is_fake));
const scamOrFakeTitle = computed(() =>
    verification.value?.is_scam ? t('profileBadges.scam') : t('profileBadges.fake'));
const isVerified = computed(() => !!verification.value?.is_verified && !isScamOrFake.value && !orgVerifyEmojiId.value);

const giftEmojiId = computed(() => {
    if (isScamOrFake.value) return '';
    if (senderUserId.value !== undefined) return emojiStatusCustomEmojiId(userObj.value?.emoji_status);
    return emojiStatusCustomEmojiId(getChatEmojiStatus(chatObj.value));
});

const isPremiumStar = computed(() => {
    if (isScamOrFake.value || giftEmojiId.value) return false;
    return senderUserId.value !== undefined && !!userObj.value?.is_premium;
});

/** 主用户名：用户取自己的，频道/群取 supergroup 的用户名 */
const username = computed(() => {
    if (senderUserId.value !== undefined) return userObj.value?.usernames?.active_usernames?.[0] || '';
    return supergroupObj.value?.usernames?.active_usernames?.[0] || '';
});

/** 简介：仅用户有（getUserFullInfo，按需拉取，拉不到整行隐藏） */
const bio = computed(() => {
    const uid = senderUserId.value;
    if (uid === undefined) return '';
    return profileStore.fullInfos.get(uid)?.bio?.text?.trim() || '';
});

/** 资料页路由：用户 → 用户资料；频道/群 → 对话资料 */
const profileTarget = computed<{ name: string; id: number } | undefined>(() => {
    if (senderUserId.value !== undefined) return { name: 'user-profile', id: senderUserId.value };
    if (senderChatId.value !== undefined) return { name: 'chat-profile', id: senderChatId.value };
    return undefined;
});

const canOpenProfile = computed(() => !!profileTarget.value);

/** 「查看主页」文案按对象类型区分（频道 / 群组 / 用户） */
const profileLabelKey = computed(() => {
    if (senderUserId.value !== undefined) return 'lng_context_view_profile';
    const type = chatObj.value?.type;
    if (type?._ === 'chatTypeSupergroup') {
        return type.is_channel ? 'lng_context_view_channel' : 'lng_context_view_group';
    }
    return 'lng_context_view_group';
});

/** 是否可 @：用户总可以（无用户名也走 MentionName 实体）；频道/群需要公开用户名 */
const canMention = computed(() => {
    if (isDeleted.value) return false;
    if (senderUserId.value !== undefined) return true;
    return !!username.value;
});

/** 第三行显示的 ID：用户 → user_id，频道/群 → chat_id（不带前缀，前缀由图标表达） */
const idText = computed(() => {
    const uid = senderUserId.value;
    if (uid !== undefined) return String(uid);
    const cid = senderChatId.value;
    return cid !== undefined ? String(cid) : '';
});

/** 提及文本：优先 @用户名；用户没有用户名时用显示名（配 MentionName 实体） */
const mentionText = computed(() => {
    if (username.value) return `@${username.value}`;
    const full = `${nameParts.value.first}${nameParts.value.last ? ' ' + nameParts.value.last : ''}`.trim()
        || displayTitle.value;
    // 提及文本里出现空格会被当成多个词，用下划线拼成一个整体
    return `@${full.replace(/\s+/g, '_')}`;
});

/** 打开资料页 */
function openProfile() {
    const info = profileTarget.value;
    if (!info) return;
    closeSenderCard();
    router.push({ name: info.name, params: { id: String(info.id) } });
}

/** 复制 @用户名（点击第三行用户名，复制完整值，不受省略号影响） */
async function copyUsername() {
    if (!username.value) return;
    await copyText(`@${username.value}`, 'Copy username failed:');
}

/** 复制 ID（点击第三行 ID） */
async function copyId() {
    if (!idText.value) return;
    await copyText(idText.value, 'Copy id failed:');
}

/** 写入剪贴板并提示（沿用 TDLib 官方「已复制」文案） */
async function copyText(value: string, errorLabel: string) {
    try {
        await navigator.clipboard.writeText(value);
        toast.success(t('lng_text_copied'));
    } catch (e) {
        console.error(errorLabel, e);
    }
}

/** 点「@对方」：交给当前对话输入框插入提及实体，并关闭卡片 */
function mention() {
    if (!canMention.value) return;
    requestInsertMention({
        userId: senderUserId.value,
        username: username.value || undefined,
        text: mentionText.value,
    });
    closeSenderCard();
}

/** 打开卡片时按需补齐用户 / 群信息（用户名、简介、成员数） */
watch(
    () => [visible.value, sender.value] as const,
    async ([isVisible]) => {
        if (!isVisible) return;
        const uid = senderUserId.value;
        if (uid !== undefined) {
            await ensureUser(uid);
            if (!profileStore.fullInfos.get(uid)) void profileStore.fetchFullInfo(uid);
            return;
        }
        const cid = senderChatId.value;
        if (cid === undefined) return;
        await ensureChat(cid);
        const type = chatObj.value?.type;
        if (type?._ === 'chatTypeSupergroup') await ensureSupergroup(type.supergroup_id);
        else if (type?._ === 'chatTypeBasicGroup') await ensureBasicGroup(type.basic_group_id);
    },
    { immediate: true },
);

/** 卡片与头像之间的间距（px） */
const ANCHOR_GAP = 6;

/** 头像当前的位置（头像被卸载则视为失锚） */
function anchorRect(): DOMRect | null {
    const el = target.value;
    if (!el || !el.isConnected) return null;
    return el.getBoundingClientRect();
}

/** 视口内夹紧定位：优先贴住头像右侧、与头像顶对齐，越界时回收到视口内 */
async function positionCard() {
    await nextTick();
    const el = rootRef.value;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const rect = anchorRect();
    let left = rect ? rect.right + ANCHOR_GAP : x.value;
    let top = rect ? rect.top : y.value;
    if (left + w > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - w - margin);
    if (left < margin) left = margin;
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    if (top < margin) top = margin;
    cardStyle.value = { left: `${left}px`, top: `${top}px` };
}

/** 点击卡片外部关闭（触发头像本身不算外部） */
function onOutside(e: MouseEvent) {
    const el = rootRef.value;
    const node = e.target as Node;
    if (el && el.contains(node)) return;
    if (target.value && target.value.contains(node)) return;
    closeSenderCard();
}

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeSenderCard();
}

/**
 * 消息列表滚动 / 窗口变化：卡片是 position:fixed，必须跟着头像一起走，
 * 否则会悬在旧位置。头像被卸载、或已完全滚出视口时直接关闭。
 */
let repositionScheduled = false;
function scheduleReposition() {
    if (repositionScheduled) return;
    repositionScheduled = true;
    requestAnimationFrame(() => {
        repositionScheduled = false;
        if (!visible.value) return;
        const rect = anchorRect();
        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
            closeSenderCard();
            return;
        }
        void positionCard();
    });
}

function onScroll() {
    scheduleReposition();
}

function onResize() {
    scheduleReposition();
}

watch(visible, async (v) => {
    if (v) {
        await positionCard();
        document.addEventListener('mousedown', onOutside, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        // 捕获阶段：消息列表的滚动发生在内部容器上，冒泡到 window 前就被处理
        window.addEventListener('scroll', onScroll, true);
    } else {
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll, true);
    }
});

/** 内容异步补齐（简介 / 状态）后宽度高度会变 → 重新夹紧 */
watch([displayTitle, subtitle, bio, username, idText], () => {
    if (visible.value) void positionCard();
});

onUnmounted(() => {
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, true);
});
</script>

<style scoped>
.csc-card {
    width: 280px;
    max-width: calc(100vw - 16px);
    border-radius: 16px;
    background: #fff;
    color: #111827;
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
    overflow: hidden;
}

:global(html.dark .csc-card) {
    background: #1f2937;
    color: #f3f4f6;
    border-color: rgba(255, 255, 255, 0.1);
}

.csc-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
}

.csc-head-clickable {
    cursor: pointer;
    transition: background 0.15s;
}

.csc-head-clickable:hover {
    background: rgba(0, 0, 0, 0.04);
}

:global(html.dark .csc-head-clickable:hover) {
    background: rgba(255, 255, 255, 0.06);
}

.csc-avatar {
    position: relative;
    width: 56px;
    height: 56px;
    flex: 0 0 56px;
    border-radius: 50%;
    overflow: hidden;
}

.csc-ghost-wrap,
.csc-ghost {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.csc-ghost {
    font-size: 34px;
    color: #fff;
    background: linear-gradient(#b8c2cc, #9eaab5);
}

.csc-title-wrap {
    flex: 1;
    min-width: 0;
}

.csc-title {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
}

.csc-title-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.csc-subtitle {
    margin: 3px 0 0;
    font-size: 12px;
    line-height: 1.35;
    color: #6b7280;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

:global(html.dark .csc-subtitle) {
    color: #9ca3af;
}

/* 第 3 行：@用户名 · ID（两段各自可点，用户名过长折叠） */
.csc-ident {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 3px 0 0;
    min-width: 0;
    font-size: 12px;
    line-height: 1.35;
}

.csc-ident-part {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: #3b82f6;
    cursor: pointer;
    transition: color 0.15s;
}

.csc-ident-part:hover {
    color: #2563eb;
    text-decoration: underline;
}

:global(html.dark .csc-ident-part) {
    color: #60a5fa;
}

:global(html.dark .csc-ident-part:hover) {
    color: #93c5fd;
}

/* 「·」分隔符：用户名被省略时也保持两段可读 */
.csc-ident-sep {
    flex: 0 0 auto;
    color: #9ca3af;
}

/* 用户名可能很长：占满剩余宽度并省略，点击复制的仍是完整值 */
.csc-ident-username {
    flex: 0 1 auto;
    max-width: 100%;
}

/* ID 是定长数字，不参与收缩 */
.csc-ident-id {
    flex: 0 0 auto;
    color: #6b7280;
}

:global(html.dark .csc-ident-id) {
    color: #9ca3af;
}

.csc-ident-icon {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    opacity: 0.85;
}

.csc-ident-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.csc-info {
    border-top: 1px solid rgba(0, 0, 0, 0.06);
}

:global(html.dark .csc-info) {
    border-color: rgba(255, 255, 255, 0.08);
}

.csc-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 8px 14px;
    font-size: 12.5px;
    line-height: 1.45;
    color: inherit;
    text-align: left;
    background: transparent;
    border: 0;
}

.csc-row-clickable {
    align-items: center;
    cursor: pointer;
    transition: background 0.15s;
}

.csc-row-clickable:hover {
    background: rgba(0, 0, 0, 0.05);
}

:global(html.dark .csc-row-clickable:hover) {
    background: rgba(255, 255, 255, 0.08);
}

.csc-row-icon {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
    margin-top: 2px;
    color: #9ca3af;
}

.csc-row-clickable .csc-row-icon {
    margin-top: 0;
}

.csc-row-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #3b82f6;
}

.csc-row-trail {
    width: 13px;
    height: 13px;
    flex: 0 0 13px;
    color: #9ca3af;
    opacity: 0;
    transition: opacity 0.15s;
}

.csc-row-clickable:hover .csc-row-trail {
    opacity: 1;
}

.csc-bio {
    flex: 1;
    min-width: 0;
    color: #4b5563;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
    word-break: break-word;
}

:global(html.dark .csc-bio) {
    color: #d1d5db;
}

.csc-actions {
    display: flex;
    gap: 8px;
    padding: 10px 12px 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
}

:global(html.dark .csc-actions) {
    border-color: rgba(255, 255, 255, 0.08);
}

.csc-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px;
    border-radius: 9px;
    font-size: 12.5px;
    font-weight: 500;
    color: #374151;
    background: rgba(0, 0, 0, 0.05);
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
}

/* 按钮文案可能较长（「查看频道信息」/「查看个人资料」）：单行省略，不换行撑高卡片 */
.csc-btn > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.csc-btn > svg {
    flex: 0 0 auto;
}

:global(html.dark .csc-btn) {
    color: #e5e7eb;
    background: rgba(255, 255, 255, 0.08);
}

.csc-btn:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.09);
}

:global(html.dark .csc-btn:hover:not(:disabled)) {
    background: rgba(255, 255, 255, 0.14);
}

.csc-btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.csc-btn-primary,
:global(html.dark .csc-btn-primary) {
    color: #fff;
    background: #3b82f6;
}

.csc-btn-primary:hover:not(:disabled),
:global(html.dark .csc-btn-primary:hover:not(:disabled)) {
    background: #2563eb;
}

.csc-drop-enter-active,
.csc-drop-leave-active {
    transition: opacity 0.12s ease, transform 0.12s ease;
}

.csc-drop-enter-from,
.csc-drop-leave-to {
    opacity: 0;
    transform: scale(0.96);
}
</style>
