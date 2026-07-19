<template>
    <div class="h-16 pt-0 flex items-center px-4 justify-between shrink-0">
        <div class="flex items-center gap-3" v-if="chat">
            <Avatar :photo="chat.photo" :title="chat.title" sizeClass="!w-10 !h-10" />
            <div class="flex flex-col">
                <h2 class="flex font-semibold text-lg text-gray-800 dark:text-gray-100 leading-tight">{{ chat.title
                    }}<span v-if="verificationState" class="text-blue-500 ml-1">
                        <component :is="verificationState" />
                    </span>
                </h2>
                <span class="text-xs text-gray-400">{{ Status }}</span>
            </div>
        </div>
        <div v-else class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div class="flex flex-col w-48">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2 animate-pulse"></div>
                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
            </div>
        </div>

        <div class="flex gap-4 text-gray-500">
            <SearchIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
            <MoreHorizontalIcon class="w-5 h-5 cursor-pointer hover:text-blue-500" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { SearchIcon, MoreHorizontalIcon, BadgeCheckIcon, ShieldAlert } from 'lucide-vue-next';
import { h, ref, watch } from 'vue';
import type { chat, verificationStatus } from "tdlib-types";
import { tdlibSend } from '../../../utils/tdlib';
import formatStatus from '../../../utils/status';

const props = defineProps<{
    chat: chat | undefined;
}>();

const Status = ref<string>('加载中...');
const verificationState = ref<null | ReturnType<typeof h>>(null);

// 对话状态
watch(() => props.chat, async (newChat) => {

    if (!newChat) return '未知';
    if (newChat.type._ === 'chatTypePrivate') {
        const user = await tdlibSend({
            _: 'getUser',
            user_id: newChat.type.user_id
        })
        Status.value = formatStatus(user.status);
        updateVerificationState(user.verification_status);
    }

    if (newChat.type._ === 'chatTypeBasicGroup') {
        const group = await tdlibSend({
            _: 'getBasicGroup',
            basic_group_id: newChat.type.basic_group_id
        });
        Status.value = `${group.member_count} 成员`;
    }
    if (newChat.type._ === 'chatTypeSupergroup') {
        return newChat.type.is_channel ? '频道' : '超级群组';
    }
    return '';
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