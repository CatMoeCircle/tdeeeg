<template>
    <div class="h-16 px-3 py-1.5 flex items-center justify-center shrink-0">
        <div
            class="flex items-center w-full min-w-0 h-full px-2 sm:px-3 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg transition-[background-color,box-shadow] duration-200">
            <div class="flex items-center gap-3 min-w-0 flex-1" v-if="chat">
                <!-- 返回按钮（叠层模式） -->
                <button v-if="showBack" type="button" @click="emit('back')"
                    class="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-300 bg-gray-100/70 dark:bg-white/10 hover:bg-gray-200/80 dark:hover:bg-white/20 active:scale-95 transition-[background-color,transform] duration-150 shrink-0 -ml-1"
                    :aria-label="t('lng_menu_back')">
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                <!-- 点击头像/标题区域打开对话信息叠层 -->
                <button type="button" @click="emit('openInfo')"
                    class="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer rounded-full hover:opacity-80 active:scale-[0.99] transition-[opacity,transform] duration-150">
                    <template v-if="isTopicMode">
                        <!-- 频道私信话题：对方头像 -->
                        <Avatar v-if="dmTopicInfo" :photo="dmTopicInfo.photo" :title="dmTopicInfo.name"
                            :first-name="dmTopicInfo.firstName" :last-name="dmTopicInfo.lastName"
                            sizeClass="!w-10 !h-10" />
                        <!-- 话题图标：General 用主题色 #，自定义 emoji 用 emoji，否则首字母色块 -->
                        <div v-else-if="topic!.info.is_general"
                            class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white text-xl font-bold"
                            :style="{ backgroundColor: topicIconColor(topic!.info.icon.color) }">#</div>
                        <CustomEmojiInline v-else-if="topicCustomEmojiId" :emojiId="topicCustomEmojiId" :size="40"
                            class="shrink-0" />
                        <div v-else
                            class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white text-lg font-bold"
                            :style="{ backgroundColor: topicIconColor(topic!.info.icon.color) }">
                            {{ topicNameInitial(topic!.info.name) }}
                        </div>
                    </template>
                    <template v-else-if="isSavedMessages">
                        <div
                            class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                            <BookmarkIcon class="w-5 h-5 fill-current" />
                        </div>
                    </template>
                    <StoryRing v-else :chat-id="chat.id" :size="40" :diameter="40"
                        :radius-percent="isForumChat ? 0 : undefined">
                        <Avatar :photo="chat.photo" :title="chat.title" :square="isForumChat"
                            :first-name="getChatUserNames(props.chat).first"
                            :last-name="getChatUserNames(props.chat).last"
                            :accentColorId="headerAccentColorId" :deletedAccount="isDeletedChat(props.chat as any)" />
                    </StoryRing>
                    <div class="flex flex-col min-w-0">
                        <h2
                            class="flex items-center font-semibold text-lg text-gray-800 dark:text-gray-100 leading-tight truncate">
                            <!-- 秘密聊天：名称左侧锁图标（不改标题颜色） -->
                            <span v-if="isSecretChat"
                                class="tgico tgico-secret shrink-0 text-[15px] leading-none mr-1" />
                            <!-- 机构认证标识：显示在名称前面 -->
                            <CustomEmojiInline v-if="headerOrgEmojiId" :emojiId="headerOrgEmojiId" :size="18"
                                class="shrink-0 mr-1" />
                            <GlobalEmojiText :text="headerTitle" />
                            <!-- 名称后标识优先级：诈骗/虚假 > 礼物 > Premium 星标 > 蓝 V -->
                            <span v-if="headerScamOrFake"
                                class="ml-1 inline-flex items-center shrink-0 px-1.5 rounded-sm border border-red-500 text-xs font-semibold leading-5 text-red-500 whitespace-nowrap"
                                :title="headerVerification?.is_scam ? t('lng_scam_badge') : t('lng_fake_badge')">{{ headerVerification?.is_scam ? t('lng_scam_badge') : t('lng_fake_badge') }}</span>
                            <CustomEmojiInline v-else-if="headerGiftEmojiId" :emojiId="headerGiftEmojiId" :size="18"
                                class="ml-1 shrink-0" />
                            <PremiumStatusIcon v-else-if="headerPremiumStar"
                                class="ml-1 text-[18px] shrink-0" :title="t('lng_premium_summary_title')" />
                            <VerifiedFilledIcon v-else-if="headerBlueVerified"
                                class="text-blue-500 ml-1 shrink-0" :title="t('profileBadges.verified')"
                                :fillColor="['currentColor', 'transparent']"
                                :strokeColor="['currentColor', '#0052d9']" :strokeWidth="1.5" />
                        </h2>
                        <span class="text-xs text-gray-400 truncate">
                            <template v-if="isTopicMode">
                                <GlobalEmojiText :text="props.chat?.title || ''" />
                            </template>
                            <template v-else-if="showConnectionStatus">
                                {{ displayStatus }}<span class="animated-dots"><span class="dot-1">.</span><span
                                        class="dot-2">.</span><span class="dot-3">.</span></span>
                            </template>
                            <template v-else>{{ displayStatus }}</template>
                        </span>
                    </div>
                </button>
            </div>
            <div v-else class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                <div class="flex flex-col w-48">
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2 animate-pulse"></div>
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
                </div>
            </div>

            <div class="flex items-center gap-1 text-gray-500 dark:text-gray-300 shrink-0">
                <!-- 话题标签栏位置切换（标题栏第一个按钮）：left → top → bottom → left -->
                <button v-if="showTopicTagToggle" type="button" @click="emit('toggleTopicTagPosition')"
                    class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200/80 dark:hover:bg-white/20 hover:text-blue-500 active:scale-95 transition-[background-color,color,transform] duration-150"
                    :title="topicTagPositionTitle" :aria-label="topicTagPositionTitle">
                    <component :is="topicTagPositionIcon" class="w-5 h-5" />
                </button>
                <slot name="actions" />
                <button type="button" @click="emit('search')"
                    class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200/80 dark:hover:bg-white/20 hover:text-blue-500 active:scale-95 transition-[background-color,color,transform] duration-150"
                    :aria-label="t('lng_dlg_filter')">
                    <SearchIcon class="w-5 h-5" />
                </button>
                <button type="button" @click="openMoreMenu"
                    class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200/80 dark:hover:bg-white/20 hover:text-blue-500 active:scale-95 transition-[background-color,color,transform] duration-150"
                    :aria-label="t('lng_profile_action_short_more')" :title="t('lng_profile_action_short_more')">
                    <MoreHorizontalIcon class="w-5 h-5" />
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    SearchIcon, MoreHorizontalIcon, ArrowLeftIcon, BookmarkIcon, PanelLeftIcon, PanelTopIcon, PanelBottomIcon,
    BellOffIcon, BellRingIcon, ZapIcon, EraserIcon, CircleQuestionMarkIcon, FlagIcon, BanIcon, LanguagesIcon,
} from 'lucide-vue-next';
import { VerifiedFilledIcon } from 'tdesign-icons-vue-next';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import type { chat, user, verificationStatus, forumTopic, basicGroup, supergroup, supergroupFullInfo, chatPhotoInfo, profilePhoto } from "tdlib-types";
import { tdlibSend } from '../../../utils/tdlib';
import formatStatus from '../../../utils/status';
import { useUserStore } from '../../../store/user';
import { useConnectionStore } from '../../../store/connectionState';
import { isSavedMessagesChat, SAVED_MESSAGES_TITLE } from '../../../utils/savedMessages';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import GlobalEmojiText from '../../common/GlobalEmojiText.vue';
import StoryRing from '../../story/StoryRing.vue';
import { getChatProfileAccentColorId, getChatUserNames, isDeletedChat, DELETED_ACCOUNT_LABEL, emojiStatusCustomEmojiId } from '../../../utils/senderInfo';
import PremiumStatusIcon from '../../common/PremiumStatusIcon.vue';
import { updateActiveChatTitleBar, clearActiveChatTitleBar } from '../../../store/activeChatTitleBar';
import { onTdlibUpdates } from '../../../store/tdlibBus';
import { openContextMenu } from '../../../store/contextMenu';
import { confirmReportMessage } from '../../../store/reportMessage';
import { muteChat, unmuteChat } from '../../contextMenu/chatActions';
import { toast } from '../../../utils/toast';
import type { ContextMenuItem } from '../../contextMenu/types';

const props = defineProps<{
    chat: chat | undefined;
    topic?: forumTopic | undefined;
    /** 频道私信话题（展示为对方头像/名称；与 topic 互斥） */
    dmTopic?: { name: string; photo?: chatPhotoInfo | profilePhoto; firstName?: string; lastName?: string } | undefined;
    showBack?: boolean;
    /** 是否显示话题标签栏位置切换按钮（tag 栏话题模式） */
    showTopicTagToggle?: boolean;
    /** 当前话题标签栏位置 */
    topicTagPosition?: 'left' | 'top' | 'bottom';
    /** 全部翻译栏被隐藏时，在「更多」中提供重新打开入口 */
    showTranslateEntry?: boolean;
}>();

const emit = defineEmits<{
    back: [];
    openInfo: [];
    search: [];
    toggleTopicTagPosition: [];
    showTranslateBar: [];
}>();

/** 位置切换按钮图标：左栏 / 顶部 / 底部 */
const topicTagPositionIcon = computed(() => {
    switch (props.topicTagPosition) {
        case 'top': return PanelTopIcon;
        case 'bottom': return PanelBottomIcon;
        default: return PanelLeftIcon;
    }
});
const topicTagPositionTitle = computed(() => {
    switch (props.topicTagPosition) {
        case 'top': return t('header.topicBarTop');
        case 'bottom': return t('header.topicBarBottom');
        default: return t('header.topicBarLeft');
    }
});

const status = ref('');
const numberFormatter = new Intl.NumberFormat('zh-CN');
let statusRequestId = 0;

/** 顶栏状态原始数据：TDLib update 后就地刷新并重算文案 */
const statusUser = ref<user | undefined>(undefined);
const statusBasic = ref<basicGroup | undefined>(undefined);
const statusSuper = ref<supergroup | undefined>(undefined);
const statusSuperFull = ref<supergroupFullInfo | undefined>(undefined);

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const connectionStore = useConnectionStore();
const { t } = useI18n();
const isSavedMessages = computed(() =>
    !!props.chat && isSavedMessagesChat(props.chat, userProfile.value?.id)
);
const chatTitle = computed(() => {
    if (isSavedMessages.value) return SAVED_MESSAGES_TITLE;
    if (props.chat && isDeletedChat(props.chat)) return DELETED_ACCOUNT_LABEL;
    return props.chat?.title || '';
});
const isForumChat = computed(() =>
    !!props.chat && props.chat.type?._ === 'chatTypeSupergroup' && !!(props.chat).view_as_topics
);

/** 秘密聊天：标题左侧显示锁图标（不改颜色） */
const isSecretChat = computed(() => props.chat?.type?._ === 'chatTypeSecret');

// ==================== 顶栏「更多」菜单 ====================

/** 当前用户在群/频道里是否为创建者（群主） */
const isChatCreator = computed(() =>
    statusBasic.value?.status?._ === 'chatMemberStatusCreator'
    || statusSuper.value?.status?._ === 'chatMemberStatusCreator'
);

/** 助推群组/频道：取自己一个空闲加成位交给 TDLib（无空闲位则提示） */
async function boostChatById(chatId: number) {
    try {
        const slots = await tdlibSend({ _: 'getAvailableChatBoostSlots' });
        const now = Math.floor(Date.now() / 1000);
        const free = slots.slots.find((s) => s.currently_boosted_chat_id === 0 && s.cooldown_until_date <= now);
        if (!free) {
            toast.error(t('lng_boost_need_more'));
            return;
        }
        await tdlibSend({ _: 'boostChat', chat_id: chatId, slot_ids: [free.slot_id] });
    } catch (e: any) {
        toast.error(e?.message || t('lng_sr_chat_failed'));
    }
}

/**
 * 清空历史记录：群主/频道主清空全员历史（revoke），私聊只清自己的。
 * 保留对话本身（不从列表移除）。
 */
async function clearChatHistory(target: chat) {
    const name = target.title || '';
    const type = target.type;
    const ask = type._ === 'chatTypeSupergroup' && type.is_channel
        ? t('lng_sure_delete_channel_history', { channel: name })
        : type._ === 'chatTypeSupergroup' || type._ === 'chatTypeBasicGroup'
            ? t('lng_sure_delete_group_history', { group: name })
            : t('lng_sure_delete_history', { contact: name });
    if (!window.confirm(ask)) return;
    try {
        await tdlibSend({
            _: 'deleteChatHistory',
            chat_id: target.id,
            remove_from_chat_list: false,
            // 群主/频道主且 TDLib 允许时才为所有成员删除
            revoke: isChatCreator.value && target.can_be_deleted_for_all_users,
        });
    } catch (e: any) {
        toast.error(e?.message || t('lng_sr_chat_failed'));
    }
}

/** bot 帮助：发送 /help */
async function sendBotHelp(target: chat) {
    try {
        await tdlibSend({
            _: 'sendMessage',
            chat_id: target.id,
            input_message_content: {
                _: 'inputMessageText',
                text: { _: 'formattedText', text: '/help', entities: [] },
                clear_draft: false,
            },
        } as any);
    } catch (e: any) {
        toast.error(e?.message || t('lng_sr_chat_failed'));
    }
}

/** 举报当前会话（原因由 ReportMessageConfirm 弹窗交互） */
async function reportCurrentChat(target: chat) {
    try {
        await confirmReportMessage({ chatId: target.id });
        toast.success(t('lng_report_thanks'));
    } catch (e: any) {
        if (e?.message !== 'canceled') {
            console.error('reportChat failed:', e);
            toast.error(e?.message || t('lng_sr_chat_failed'));
        }
    }
}

/** 删除并屏蔽 bot：拉黑后清空历史并从列表移除 */
async function stopAndBlockBot(target: chat) {
    if (target.type._ !== 'chatTypePrivate') return;
    if (!window.confirm(t('lng_blocked_list_confirm_text', { name: target.title || '' }))) return;
    try {
        await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: { _: 'messageSenderUser', user_id: target.type.user_id },
            block_list: { _: 'blockListMain' },
        });
        await tdlibSend({
            _: 'deleteChatHistory',
            chat_id: target.id,
            remove_from_chat_list: true,
            revoke: false,
        });
        toast.success(t('lng_new_contact_block_done', { user: target.title || '' }));
        emit('back');
    } catch (e: any) {
        toast.error(e?.message || t('lng_sr_chat_failed'));
    }
}

/** 顶栏「更多」：按会话类型拼装菜单（全部翻译 / 通知 / 助推 / 清空历史 / bot 操作） */
function openMoreMenu(e: MouseEvent) {
    const target = props.chat;
    if (!target) return;
    const type = target.type;
    const muted = (target.notification_settings?.mute_for ?? 0) > 0;
    const isGroupOrChannel = type._ === 'chatTypeBasicGroup' || type._ === 'chatTypeSupergroup';
    const isBot = type._ === 'chatTypePrivate' && statusUser.value?.type?._ === 'userTypeBot';
    const items: ContextMenuItem[] = [];

    // 全部翻译栏被隐藏：在这里重新打开（否则只能重新进入对话）
    if (props.showTranslateEntry) {
        items.push({
            key: 'translate-bar',
            label: t('translate.showBar'),
            icon: LanguagesIcon,
            onClick: () => emit('showTranslateBar'),
        });
    }

    // 静音通知：静音中显示「取消静音」，否则「静音通知」
    if (!isSavedMessages.value) {
        items.push({
            key: 'mute',
            label: muted ? t('lng_context_unmute') : t('lng_context_mute'),
            icon: muted ? BellRingIcon : BellOffIcon,
            onClick: () => (muted ? unmuteChat(target.id) : muteChat(target.id)),
        });
    }

    // 群/频道：助推（仅超级群支持 boostChat）
    if (type._ === 'chatTypeSupergroup') {
        items.push({
            key: 'boost',
            label: type.is_channel ? t('lng_boost_channel_button') : t('lng_boost_group_button'),
            icon: ZapIcon,
            onClick: () => { void boostChatById(target.id); },
        });
    }

    // 清空历史：群主/频道主可清空全员历史；私聊清自己的聊天记录
    if ((isGroupOrChannel && isChatCreator.value) || type._ === 'chatTypePrivate') {
        items.push({
            key: 'clear-history',
            label: t('lng_profile_clear_history'),
            icon: EraserIcon,
            danger: true,
            onClick: () => { void clearChatHistory(target); },
        });
    }

    // bot：帮助 / 举报 / 删除并屏蔽
    if (isBot) {
        items.push({
            key: 'bot-help',
            label: t('lng_profile_bot_help'),
            icon: CircleQuestionMarkIcon,
            divider: true,
            onClick: () => { void sendBotHelp(target); },
        });
        if (target.can_be_reported) {
            items.push({
                key: 'report',
                label: t('lng_profile_report'),
                icon: FlagIcon,
                onClick: () => { void reportCurrentChat(target); },
            });
        }
        items.push({
            key: 'bot-block',
            label: t('lng_profile_block_bot'),
            icon: BanIcon,
            danger: true,
            onClick: () => { void stopAndBlockBot(target); },
        });
    }

    if (items.length === 0) return;
    openContextMenu(e.clientX, e.clientY, items, e.currentTarget as HTMLElement);
}

/** 头部头像的无头像背景色（私聊取用户 profile accent，群组取 chat profile accent） */
const headerAccentColorId = computed(() => getChatProfileAccentColorId(props.chat));

/** 是否为话题模式（在话题详情页中）：论坛话题或频道私信会话 */
const isTopicMode = computed(() => !!props.topic || !!props.dmTopic);
/** 频道私信话题展示信息 */
const dmTopicInfo = computed(() => props.dmTopic);

/** 头部标题：话题模式显示话题名（私信为对方名称），否则显示对话名 */
const headerTitle = computed(() => {
    if (props.dmTopic) return props.dmTopic.name;
    if (props.topic) return props.topic.info.name;
    return chatTitle.value;
});

/** 话题图标自定义 emoji ID（无则返回空字符串；General 话题 / 私信忽略） */
const topicCustomEmojiId = computed(() => {
    const topic = props.topic;
    if (!topic || topic.info.is_general) return '';
    const id = topic.info.icon.custom_emoji_id;
    return id && id !== '0' ? String(id) : '';
});

const topicIconColors: Record<number, string> = {
    0x6FB9F0: '#6FB9F0',
    0xFFD67E: '#FFD67E',
    0xCB86DB: '#CB86DB',
    0x8EEE98: '#8EEE98',
    0xFF93B2: '#FF93B2',
    0xFB6F5F: '#FB6F5F',
};

function topicIconColor(color: number): string {
    return topicIconColors[color] || '#6FB9F0';
}

function topicNameInitial(name: string): string {
    return name.substring(0, 1).toUpperCase() || '#';
}

/** 是否显示连接状态（替代对话原有状态文本） */
const showConnectionStatus = computed(() =>
    connectionStore.isConnecting && !!connectionStore.connectionLabel
);

/** 连接状态的基底文本（不含动画点号） */
const connectionStatusText = computed(() =>
    showConnectionStatus.value ? t(connectionStore.connectionLabel) : ''
);

/** 显示状态：连接异常时优先显示连接状态，否则显示对话状态 */
const displayStatus = computed(() => {
    if (showConnectionStatus.value) {
        return connectionStatusText.value;
    }
    return status.value;
});

const formatCount = (count: number) => numberFormatter.format(count);

const formatUserStatus = (currentUser: user) => {
    if (currentUser.type._ === 'userTypeBot') {
        return currentUser.type.active_user_count > 0
            ? t('lng_bot_status_users', { count: formatCount(currentUser.type.active_user_count) })
            : t('lng_sr_chat_bot');
    }
    if (currentUser.type._ === 'userTypeDeleted' || currentUser.type._ === 'userTypeUnknown') return t('lng_deleted');
    return formatStatus(currentUser.status);
};

/** 顶栏认证来源：私聊/密聊取对方用户，超级群/频道取群信息 */
const headerVerification = computed<verificationStatus | undefined>(() => {
    const type = props.chat?.type;
    if (type?._ === 'chatTypePrivate' || type?._ === 'chatTypeSecret') return statusUser.value?.verification_status;
    if (type?._ === 'chatTypeSupergroup') return statusSuper.value?.verification_status;
    return undefined;
});

/** 诈骗/虚假账户：红色盾牌，优先级最高（与列表一致） */
const headerScamOrFake = computed(() => !!(headerVerification.value?.is_scam || headerVerification.value?.is_fake));

/** 机构认证标识的自定义 emoji id（空或 0 表示未设置） */
const headerOrgEmojiId = computed(() => {
    const id = headerVerification.value?.bot_verification_icon_custom_emoji_id;
    return id && id !== '0' ? id : '';
});

/** 礼物/emoji 状态：私聊取对方用户，超级群/频道取对话自身；保存的消息与诈骗/虚假账户不显示 */
const headerGiftEmojiId = computed(() => {
    if (headerScamOrFake.value || isSavedMessages.value) return '';
    const type = props.chat?.type;
    if (type?._ === 'chatTypePrivate' || type?._ === 'chatTypeSecret') {
        return emojiStatusCustomEmojiId(statusUser.value?.emoji_status);
    }
    if (type?._ === 'chatTypeSupergroup') return emojiStatusCustomEmojiId(props.chat?.emoji_status);
    return '';
});

/** Premium 星标：私聊对方为会员且无礼物时显示 */
const headerPremiumStar = computed(() => {
    if (headerScamOrFake.value || isSavedMessages.value || headerGiftEmojiId.value) return false;
    const type = props.chat?.type;
    const isPrivate = type?._ === 'chatTypePrivate' || type?._ === 'chatTypeSecret';
    return isPrivate && !!statusUser.value?.is_premium;
});

/** 官方蓝 V：有礼物、Premium 星标或机构标识时由其替代 */
const headerBlueVerified = computed(() =>
    !!headerVerification.value?.is_verified
    && !headerOrgEmojiId.value
    && !headerGiftEmojiId.value
    && !headerPremiumStar.value
);

/** 私聊/密聊对方 user_id */
const peerUserId = computed(() => {
    const type = props.chat?.type;
    if (type?._ === 'chatTypePrivate' || type?._ === 'chatTypeSecret') return type.user_id;
    return undefined;
});
const peerBasicGroupId = computed(() => {
    const type = props.chat?.type;
    return type?._ === 'chatTypeBasicGroup' ? type.basic_group_id : undefined;
});
const peerSupergroupId = computed(() => {
    const type = props.chat?.type;
    return type?._ === 'chatTypeSupergroup' ? type.supergroup_id : undefined;
});

/** 由已缓存的原始数据重算状态文案（update / 相对时间刷新共用） */
function rebuildStatusText() {
    const newChat = props.chat;
    if (!newChat || isSavedMessagesChat(newChat, userProfile.value?.id)) {
        status.value = '';
        return;
    }

    if (newChat.type._ === 'chatTypePrivate' || newChat.type._ === 'chatTypeSecret') {
        const u = statusUser.value;
        if (!u) return;
        status.value = formatUserStatus(u);
        return;
    }

    if (newChat.type._ === 'chatTypeBasicGroup') {
        const count = statusBasic.value?.member_count || 0;
        status.value = count > 0
            ? t('lng_chat_status_members', { count: formatCount(count) })
            : t('lng_notification_groups');
        return;
    }

    if (newChat.type._ === 'chatTypeSupergroup') {
        const fallback = newChat.type.is_channel ? t('lng_notification_channels') : t('header.supergroup');
        const memberCount = statusSuperFull.value?.member_count || statusSuper.value?.member_count || 0;
        status.value = memberCount > 0
            ? (newChat.type.is_channel
                ? t('lng_chat_status_subscribers', { count: formatCount(memberCount) })
                : t('lng_chat_status_members', { count: formatCount(memberCount) }))
            : fallback;
    }
}

// 对话状态：切换对话时拉一次，后续由 TDLib update 驱动刷新
watch([() => props.chat, () => userProfile.value?.id], async ([newChat]) => {
    const requestId = ++statusRequestId;
    status.value = '';
    statusUser.value = undefined;
    statusBasic.value = undefined;
    statusSuper.value = undefined;
    statusSuperFull.value = undefined;
    if (!newChat) {
        clearActiveChatTitleBar();
        return;
    }

    if (isSavedMessagesChat(newChat, userProfile.value?.id)) return;

    const isCurrentRequest = () => requestId === statusRequestId && props.chat?.id === newChat.id;

    try {
        if (newChat.type._ === 'chatTypePrivate' || newChat.type._ === 'chatTypeSecret') {
            const currentUser = await tdlibSend({
                _: 'getUser',
                user_id: newChat.type.user_id
            });
            if (!isCurrentRequest()) return;
            statusUser.value = currentUser;
            rebuildStatusText();
            return;
        }

        if (newChat.type._ === 'chatTypeBasicGroup') {
            status.value = t('lng_notification_groups');
            const group = await tdlibSend({
                _: 'getBasicGroup',
                basic_group_id: newChat.type.basic_group_id
            });
            if (!isCurrentRequest()) return;
            statusBasic.value = group;
            rebuildStatusText();
            return;
        }

        if (newChat.type._ === 'chatTypeSupergroup') {
            const fallback = newChat.type.is_channel ? t('lng_notification_channels') : t('header.supergroup');
            status.value = fallback;
            const [group, fullInfo] = await Promise.all([
                tdlibSend({
                    _: 'getSupergroup',
                    supergroup_id: newChat.type.supergroup_id
                }).catch(() => undefined),
                tdlibSend({
                    _: 'getSupergroupFullInfo',
                    supergroup_id: newChat.type.supergroup_id
                }).catch(() => undefined)
            ]);
            if (!isCurrentRequest()) return;
            statusSuper.value = group;
            statusSuperFull.value = fullInfo;
            rebuildStatusText();
        }
    } catch (error) {
        if (isCurrentRequest()) console.error('Failed to load chat header status:', error);
    }
}, { immediate: true });

// 同步当前聊天信息到 TitleBar 活跃聊天存储（titlebar 头像模式用）
watch(
    [chatTitle, () => props.chat?.photo, displayStatus],
    ([title, photo, sText]) => {
        updateActiveChatTitleBar({
            title: title || '',
            photo: photo,
            statusText: sText || '',
        });
    },
    { immediate: true }
);

// TDLib 实时刷新：在线状态 / 成员数 / 认证标识
let offStatusUpdates: (() => void) | null = null;
let statusTickTimer: number | null = null;

onMounted(() => {
    offStatusUpdates = onTdlibUpdates(['user'], (update) => {
        const type_ = update._;
        if (type_ === 'updateUserStatus') {
            const uid = (update as { user_id?: number }).user_id;
            const next = (update as { status?: user['status'] }).status;
            if (uid === peerUserId.value && statusUser.value && next) {
                statusUser.value.status = next;
                rebuildStatusText();
            }
        } else if (type_ === 'updateUserEmojiStatus') {
            // 礼物/emoji 状态变更：就地更新，顶栏计算属性随之刷新
            const uid = (update as { user_id?: number }).user_id;
            const next = (update as { emoji_status?: user['emoji_status'] }).emoji_status;
            if (uid === peerUserId.value && statusUser.value) {
                statusUser.value.emoji_status = next ?? undefined;
            }
        } else if (type_ === 'updateUser') {
            const u = (update as { user?: user }).user;
            if (u && u.id === peerUserId.value) {
                statusUser.value = u;
                rebuildStatusText();
            }
        } else if (type_ === 'updateBasicGroup') {
            const g = (update as { basic_group?: basicGroup }).basic_group;
            if (g && g.id === peerBasicGroupId.value) {
                statusBasic.value = g;
                rebuildStatusText();
            }
        } else if (type_ === 'updateSupergroup') {
            const g = (update as { supergroup?: supergroup }).supergroup;
            if (g && g.id === peerSupergroupId.value) {
                statusSuper.value = g;
                rebuildStatusText();
            }
        } else if (type_ === 'updateSupergroupFullInfo') {
            const id = (update as { supergroup_id?: number }).supergroup_id;
            const info = (update as { supergroup_full_info?: supergroupFullInfo }).supergroup_full_info;
            if (id === peerSupergroupId.value && info) {
                statusSuperFull.value = info;
                rebuildStatusText();
            }
        }
    });

    // 「x 分钟前上线」随本地时钟推进，定时重算相对时间文案
    statusTickTimer = window.setInterval(() => {
        const type = props.chat?.type;
        if (type?._ === 'chatTypePrivate' || type?._ === 'chatTypeSecret') {
            rebuildStatusText();
        }
    }, 60_000);
});

onUnmounted(() => {
    if (offStatusUpdates) {
        offStatusUpdates();
        offStatusUpdates = null;
    }
    if (statusTickTimer !== null) {
        window.clearInterval(statusTickTimer);
        statusTickTimer = null;
    }
});
</script>
