<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_settings_channel_label')" @update:model-value="close">
        <div class="space-y-2">
            <p class="text-xs text-gray-400 mb-2">{{ t('editProfile.personalChatPick') }}</p>
            <button type="button" @click="removePersonalChat"
                class="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div
                    class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <BanIcon class="w-4.5 h-4.5 text-gray-400" />
                </div>
                <span class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_settings_channel_remove')
                    }}</span>
            </button>
            <p v-if="suitableChatsLoading" class="text-sm text-gray-400 py-4 text-center">{{
                t('editProfile.loadingChannels') }}</p>
            <p v-else-if="suitableChats.length === 0" class="text-sm text-gray-400 py-4 text-center">{{
                t('lng_settings_channel_no_yet') }}</p>
            <template v-else>
                <button v-for="c in suitableChats" :key="c.chat_id" type="button" @click="setPersonalChat(c.chat_id)"
                    class="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    :class="c.chat_id === personalChatId ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''">
                    <div class="w-9 h-9 shrink-0">
                        <Avatar :photo="c.photo" :title="c.title" :accentColorId="c.accentId" sizeClass="!w-9 !h-9" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{{ c.title }}</p>

                    </div>
                    <CheckIcon v-if="c.chat_id === personalChatId" class="w-4 h-4 text-blue-500 shrink-0" />
                </button>
            </template>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Ban as BanIcon, Check as CheckIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ModalDialog from './ModalDialog.vue';
import Avatar from '../chat/avatar.vue';
import { tdlibSend } from '../../utils/tdlib';
import { ensureChat, getReactiveChat } from '../../utils/senderInfo';

const props = defineProps<{
    modelValue: boolean;
    personalChatId?: number;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    changed: [];
}>();

const { t } = useI18n();

const suitableChats = ref<{ chat_id: number; title: string; username: string; photo?: any; accentId?: number }[]>([]);
const suitableChatsLoading = ref(false);

function close() {
    emit('update:modelValue', false);
}

watch(() => props.modelValue, (v) => {
    if (v) loadSuitableChats();
});

async function loadSuitableChats() {
    suitableChatsLoading.value = true;
    suitableChats.value = [];
    try {
        const res = (await tdlibSend({ _: 'getSuitablePersonalChats' })) as { chat_ids: number[] };
        const ids = res.chat_ids ?? [];
        await Promise.all(ids.map((id) => ensureChat(id).catch(() => { })));
        suitableChats.value = ids
            .map((id) => {
                const c = getReactiveChat(id) as any;
                return {
                    chat_id: id,
                    title: c?.title || String(id),
                    username: c?.usernames?.active_usernames?.[0] ?? '',
                    photo: c?.photo,
                    accentId: c?.profile_accent_color_id ?? c?.accent_color_id ?? undefined,
                };
            })
            .filter((c) => c.title);
    } catch (e) {
        console.error('load suitable personal chats failed:', e);
        MessagePlugin.error(t('editProfile.loadingChannelsFailed'));
    } finally {
        suitableChatsLoading.value = false;
    }
}

async function setPersonalChat(chatId: number) {
    try {
        await tdlibSend({ _: 'setPersonalChat', chat_id: chatId } as any);
        MessagePlugin.success(t('editProfile.personalChatUpdated'));
        emit('changed');
        close();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.setFailed'));
    }
}

async function removePersonalChat() {
    try {
        await tdlibSend({ _: 'setPersonalChat', chat_id: 0 } as any);
        MessagePlugin.success(t('editProfile.personalChatRemoved'));
        emit('changed');
        close();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.removeFailed'));
    }
}
</script>
