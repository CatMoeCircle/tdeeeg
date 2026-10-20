<template>
    <div class="absolute inset-0 z-20 bg-white dark:bg-gray-900 overflow-y-auto custom-scrollbar">
        <div class="p-4 pt-20">
            <!-- 对话信息 -->
            <div class="flex flex-col items-center mb-6">
                <button type="button"
                    class="w-20 h-20 mb-3 rounded-full overflow-hidden focus:outline-none cursor-pointer"
                    :disabled="!overlayUserId" @click="emit('profile')">
                    <Avatar v-if="chat" :photo="chat.photo" :title="chat.title" sizeClass="!w-20 !h-20"
                        :first-name="getChatUserNames(chat).first" :last-name="getChatUserNames(chat).last"
                        :accentColorId="getChatProfileAccentColorId(chat)" />
                </button>
                <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
                    <GlobalEmojiText :text="title" />
                </h2>
                <p class="text-sm text-gray-500 mt-1">{{ subtitle }}</p>
            </div>

            <!-- 操作按钮 -->
            <div class="space-y-2 px-4">
                <button v-if="overlayUserId" type="button" @click="emit('profile')"
                    class="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
                    <UserIcon class="w-5 h-5 text-blue-500" />
                    <span class="text-sm font-medium">{{ t('lng_context_view_profile') }}</span>
                </button>
                <button type="button" @click="emit('open-chat')"
                    class="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
                    <MessageCircleIcon class="w-5 h-5 text-blue-500" />
                    <span class="text-sm font-medium">{{ t('lng_saved_open_chat') }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { chat } from 'tdlib-types';
import { MessageCircle as MessageCircleIcon, User as UserIcon } from 'lucide-vue-next';
import Avatar from '../avatar.vue';
import GlobalEmojiText from '../../common/GlobalEmojiText.vue';
import { getChatUserNames, getChatProfileAccentColorId } from '../../../utils/senderInfo';

/** 叠层对话信息面板。 */
defineProps<{
    chat: chat | undefined;
    overlayUserId: number | undefined;
    title: string;
    subtitle: string;
}>();
const emit = defineEmits<{ profile: []; 'open-chat': [] }>();
const { t } = useI18n();
</script>
