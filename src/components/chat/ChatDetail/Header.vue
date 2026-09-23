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
                        <!-- 话题图标：General 用主题色 #，自定义 emoji 用 emoji，否则首字母色块 -->
                        <div v-if="topic!.info.is_general"
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
                    <Avatar v-else :photo="chat.photo" :title="chat.title" sizeClass="!w-10 !h-10" :square="isForumChat"
                        :accentColorId="headerAccentColorId" :deletedAccount="isDeletedChat(props.chat as any)" />
                    <div class="flex flex-col min-w-0">
                        <h2
                            class="flex items-center font-semibold text-lg text-gray-800 dark:text-gray-100 leading-tight truncate">
                            <!-- 秘密聊天：名称左侧锁图标（不改标题颜色） -->
                            <span v-if="isSecretChat"
                                class="tgico tgico-secret shrink-0 text-[15px] leading-none mr-1" />
                            <GlobalEmojiText :text="headerTitle" /><span v-if="verificationState"
                                class="text-blue-500 ml-1 shrink-0">
                                <component :is="verificationState" />
                            </span>
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
                <button type="button"
                    class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200/80 dark:hover:bg-white/20 hover:text-blue-500 active:scale-95 transition-[background-color,color,transform] duration-150"
                    aria-label="更多">
                    <MoreHorizontalIcon class="w-5 h-5" />
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { SearchIcon, MoreHorizontalIcon, ArrowLeftIcon, ShieldAlert, BookmarkIcon, PanelLeftIcon, PanelTopIcon, PanelBottomIcon } from 'lucide-vue-next';
import { VerifiedFilledIcon } from 'tdesign-icons-vue-next';
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import type { chat, user, verificationStatus, forumTopic, basicGroup, supergroup, supergroupFullInfo } from "tdlib-types";
import { tdlibSend } from '../../../utils/tdlib';
import formatStatus from '../../../utils/status';
import { useUserStore } from '../../../store/user';
import { useConnectionStore } from '../../../store/connectionState';
import { isSavedMessagesChat, SAVED_MESSAGES_TITLE } from '../../../utils/savedMessages';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import GlobalEmojiText from '../../common/GlobalEmojiText.vue';
import { getChatProfileAccentColorId, isDeletedChat, DELETED_ACCOUNT_LABEL } from '../../../utils/senderInfo';
import { updateActiveChatTitleBar, clearActiveChatTitleBar } from '../../../store/activeChatTitleBar';
import { onTdlibUpdates } from '../../../store/tdlibBus';

const props = defineProps<{
    chat: chat | undefined;
    topic?: forumTopic | undefined;
    showBack?: boolean;
    /** 是否显示话题标签栏位置切换按钮（tag 栏话题模式） */
    showTopicTagToggle?: boolean;
    /** 当前话题标签栏位置 */
    topicTagPosition?: 'left' | 'top' | 'bottom';
}>();

const emit = defineEmits<{
    back: [];
    openInfo: [];
    search: [];
    toggleTopicTagPosition: [];
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
        case 'top': return '话题标签栏：顶部（点击切换到底部）';
        case 'bottom': return '话题标签栏：底部（点击切换到左侧）';
        default: return '话题标签栏：左侧（点击切换到顶部）';
    }
});

const status = ref('');
const verificationState = ref<null | ReturnType<typeof h>>(null);
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

/** 头部头像的无头像背景色（私聊取用户 profile accent，群组取 chat profile accent） */
const headerAccentColorId = computed(() => getChatProfileAccentColorId(props.chat));

/** 是否为话题模式（在话题详情页中） */
const isTopicMode = computed(() => !!props.topic);

/** 头部标题：话题模式显示话题名，否则显示对话名 */
const headerTitle = computed(() => {
    if (isTopicMode.value) return props.topic!.info.name;
    return chatTitle.value;
});

/** 话题图标自定义 emoji ID（无则返回空字符串；General 话题忽略） */
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
            ? `${formatCount(currentUser.type.active_user_count)} 位月活用户`
            : '机器人';
    }
    if (currentUser.type._ === 'userTypeDeleted') return '已删除账号';
    return formatStatus(currentUser.status);
};

// 更新验证状态图标
const updateVerificationState = (status?: verificationStatus) => {
    if (!status) {
        verificationState.value = null;
        return;
    }

    if (status.is_scam || status.is_fake) {
        verificationState.value = h(ShieldAlert, { class: 'text-red-500' });
    } else if (status.is_verified) {
        verificationState.value = h(VerifiedFilledIcon, {
            class: 'text-blue-500',
            fillColor: ['currentColor', 'transparent'],
            strokeColor: ['currentColor', '#0052d9'],
            strokeWidth: 1.5,
        });
    } else {
        verificationState.value = null;
    }
};

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
        verificationState.value = null;
        return;
    }

    if (newChat.type._ === 'chatTypePrivate' || newChat.type._ === 'chatTypeSecret') {
        const u = statusUser.value;
        if (!u) return;
        status.value = formatUserStatus(u);
        updateVerificationState(u.verification_status);
        return;
    }

    if (newChat.type._ === 'chatTypeBasicGroup') {
        const count = statusBasic.value?.member_count || 0;
        status.value = count > 0
            ? `${formatCount(count)} 位成员`
            : t('lng_notification_groups');
        return;
    }

    if (newChat.type._ === 'chatTypeSupergroup') {
        const fallback = newChat.type.is_channel ? t('lng_notification_channels') : '超级群组';
        const memberCount = statusSuperFull.value?.member_count || statusSuper.value?.member_count || 0;
        status.value = memberCount > 0
            ? `${formatCount(memberCount)} 位${newChat.type.is_channel ? '订阅者' : t('lng_profile_participants_section')}`
            : fallback;
        updateVerificationState(statusSuper.value?.verification_status);
    }
}

// 对话状态：切换对话时拉一次，后续由 TDLib update 驱动刷新
watch([() => props.chat, () => userProfile.value?.id], async ([newChat]) => {
    const requestId = ++statusRequestId;
    status.value = '';
    verificationState.value = null;
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
            const fallback = newChat.type.is_channel ? t('lng_notification_channels') : '超级群组';
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
