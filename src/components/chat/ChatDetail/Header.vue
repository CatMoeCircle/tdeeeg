<template>
    <div class="h-16 pt-0 flex items-center px-4 justify-between shrink-0">
        <div class="flex items-center gap-3 min-w-0" v-if="chat">
            <!-- 返回按钮（叠层模式） -->
            <button v-if="showBack" type="button" @click="emit('back')"
                class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0 -ml-1"
                aria-label="返回">
                <ArrowLeftIcon class="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <!-- 点击头像/标题区域打开对话信息叠层 -->
            <button type="button" @click="emit('openInfo')"
                class="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer hover:opacity-80 transition-opacity">
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
                    <h2 class="flex font-semibold text-lg text-gray-800 dark:text-gray-100 leading-tight truncate">{{
                        headerTitle
                        }}<span v-if="verificationState" class="text-blue-500 ml-1 shrink-0">
                            <component :is="verificationState" />
                        </span>
                    </h2>
                    <span class="text-xs text-gray-400 truncate">
                        <template v-if="isTopicMode">
                            在 {{ props.chat?.title || '' }}
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
        <div v-else class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div class="flex flex-col w-48">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2 animate-pulse"></div>
                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
            </div>
        </div>

        <div class="flex gap-4 text-gray-500">
            <slot name="actions" />
            <SearchIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
            <MoreHorizontalIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { SearchIcon, MoreHorizontalIcon, ArrowLeftIcon, ShieldAlert, BookmarkIcon } from 'lucide-vue-next';
import { VerifiedFilledIcon } from 'tdesign-icons-vue-next';
import { computed, h, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import type { chat, user, verificationStatus, forumTopic } from "tdlib-types";
import { tdlibSend } from '../../../utils/tdlib';
import formatStatus from '../../../utils/status';
import { useUserStore } from '../../../store/user';
import { useConnectionStore } from '../../../store/connectionState';
import { isSavedMessagesChat, SAVED_MESSAGES_TITLE } from '../../../utils/savedMessages';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import { getChatProfileAccentColorId, isDeletedChat, DELETED_ACCOUNT_LABEL } from '../../../utils/senderInfo';

const props = defineProps<{
    chat: chat | undefined;
    topic?: forumTopic | undefined;
    showBack?: boolean;
}>();

const emit = defineEmits<{
    back: [];
    openInfo: [];
}>();

const status = ref('');
const verificationState = ref<null | ReturnType<typeof h>>(null);
const numberFormatter = new Intl.NumberFormat('zh-CN');
let statusRequestId = 0;

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

// 对话状态
watch([() => props.chat, () => userProfile.value?.id], async ([newChat]) => {
    const requestId = ++statusRequestId;
    status.value = '';
    verificationState.value = null;
    if (!newChat) return;

    if (isSavedMessagesChat(newChat, userProfile.value?.id)) return;

    const isCurrentRequest = () => requestId === statusRequestId && props.chat?.id === newChat.id;

    try {
        if (newChat.type._ === 'chatTypePrivate' || newChat.type._ === 'chatTypeSecret') {
            const currentUser = await tdlibSend({
                _: 'getUser',
                user_id: newChat.type.user_id
            });
            if (!isCurrentRequest()) return;
            status.value = formatUserStatus(currentUser);
            updateVerificationState(currentUser.verification_status);
            return;
        }

        if (newChat.type._ === 'chatTypeBasicGroup') {
            status.value = '群组';
            const group = await tdlibSend({
                _: 'getBasicGroup',
                basic_group_id: newChat.type.basic_group_id
            });
            if (!isCurrentRequest()) return;
            status.value = group.member_count > 0
                ? `${formatCount(group.member_count)} 位成员`
                : '群组';
            return;
        }

        if (newChat.type._ === 'chatTypeSupergroup') {
            const fallback = newChat.type.is_channel ? '频道' : '超级群组';
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

            const memberCount = fullInfo?.member_count || group?.member_count || 0;
            status.value = memberCount > 0
                ? `${formatCount(memberCount)} 位${newChat.type.is_channel ? '订阅者' : '成员'}`
                : fallback;
            updateVerificationState(group?.verification_status);
        }
    } catch (error) {
        if (isCurrentRequest()) console.error('Failed to load chat header status:', error);
    }
}, { immediate: true });

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
</script>
