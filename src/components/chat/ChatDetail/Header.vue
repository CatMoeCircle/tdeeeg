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
                <div v-if="isSavedMessages"
                    class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                    <BookmarkIcon class="w-5 h-5 fill-current" />
                </div>
                <Avatar v-else :photo="chat.photo" :title="chat.title" sizeClass="!w-10 !h-10" :square="isForumChat" />
                <div class="flex flex-col min-w-0">
                    <h2 class="flex font-semibold text-lg text-gray-800 dark:text-gray-100 leading-tight truncate">{{
                        chatTitle
                        }}<span v-if="verificationState" class="text-blue-500 ml-1 shrink-0">
                            <component :is="verificationState" />
                        </span>
                    </h2>
                    <span class="text-xs text-gray-400 truncate">
                        <template v-if="showConnectionStatus">
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
import { SearchIcon, MoreHorizontalIcon, ArrowLeftIcon, BadgeCheckIcon, ShieldAlert, BookmarkIcon } from 'lucide-vue-next';
import { computed, h, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import type { chat, user, verificationStatus } from "tdlib-types";
import { tdlibSend } from '../../../utils/tdlib';
import formatStatus from '../../../utils/status';
import { useUserStore } from '../../../store/user';
import { useConnectionStore } from '../../../store/connectionState';
import { isSavedMessagesChat, SAVED_MESSAGES_TITLE } from '../../../utils/savedMessages';

const props = defineProps<{
    chat: chat | undefined;
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
const chatTitle = computed(() => isSavedMessages.value ? SAVED_MESSAGES_TITLE : props.chat?.title || '');
const isForumChat = computed(() =>
    !!props.chat && props.chat.type?._ === 'chatTypeSupergroup' && !!(props.chat as any).view_as_topics
);

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
        verificationState.value = h(BadgeCheckIcon, { class: 'text-blue-500' });
    } else {
        verificationState.value = null;
    }
};
</script>
