<template>
    <ModalDialog v-model="visible" :title="t('lng_blocked_list_title')">
        <div class="space-y-3">
            <div class="flex items-center gap-2">
                <input v-model="blockInput" type="text" :placeholder="t('lng_participant_filter')"
                    spellcheck="false"
                    class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    @keydown.enter="addBlocked" />
                <button type="button" @click="addBlocked" :disabled="blockingAdd"
                    class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
                    {{ t('lng_blocked_list_add') }}
                </button>
            </div>
            <p v-if="blockingError" class="text-xs text-red-500">{{ blockingError }}</p>
            <div class="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1.5">
                <p v-if="blockedLoading" class="text-sm text-gray-400 py-4 text-center">{{ t('privacy.loading')
                }}</p>
                <p v-else-if="blockedList.length === 0" class="text-sm text-gray-400 py-4 text-center">{{
                    t('lng_blocked_list_empty_title') }}</p>
                <div v-for="item in blockedList" :key="item.id"
                    class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-context-menu"
                    @contextmenu.prevent="onBlockedContextMenu($event, item)">
                    <div class="w-9 h-9 shrink-0">
                        <Avatar :photo="item.photo" :title="item.title" :accentColorId="item.accentId"
                            sizeClass="!w-9 !h-9" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ item.title }}</p>
                        <p class="text-xs text-gray-400 truncate">{{ item.subtitle }}</p>
                    </div>
                    <button type="button"
                        class="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                        @click="unblock(item)">
                        {{ t('lng_unblock_button') }}
                    </button>
                </div>
            </div>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Ban as BanIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import Avatar from '../chat/avatar.vue';
import ModalDialog from './ModalDialog.vue';
import { openContextMenu } from '../../store/contextMenu';
import { tdlibSend } from '../../utils/tdlib';
import {
    ensureUser, ensureChat, getReactiveUser, getReactiveChat, getChatTitle,
    getChatProfileAccentColorId,
} from '../../utils/senderInfo';
import type { chat as TdChat, MessageSender } from 'tdlib-types';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'changed'): void;
    (e: 'count', count: number): void;
}>();

const { t } = useI18n();

const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});

const blockedList = ref<{ id: number; title: string; subtitle: string; isChat: boolean; photo?: any; accentId?: number }[]>([]);
const blockedLoading = ref(false);
const blockInput = ref('');
const blockingAdd = ref(false);
const blockingError = ref('');

async function loadBlocked() {
    blockedLoading.value = true;
    try {
        const res = (await tdlibSend({
            _: 'getBlockedMessageSenders',
            block_list: { _: 'blockListMain' },
            offset: 0,
            limit: 100,
        })) as { total_count?: number; senders?: MessageSender[] };
        emit('count', res?.total_count ?? res?.senders?.length ?? 0);
        const senders = res?.senders ?? [];
        await Promise.all(
            senders.map((s) =>
                s._ === 'messageSenderUser'
                    ? ensureUser(s.user_id).catch(() => { })
                    : ensureChat(s.chat_id).catch(() => { }),
            ),
        );
        // 为超级群组/频道类 chat 获取用户名（chat 对象本身不含 usernames，需从 supergroup 获取）
        const chatUsernames = new Map<number, string>();
        await Promise.all(
            senders
                .filter((s) => s._ === 'messageSenderChat')
                .map(async (s) => {
                    const c = getReactiveChat(s.chat_id);
                    if (c?.type?._ === 'chatTypeSupergroup') {
                        try {
                            const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: c.type.supergroup_id });
                            const username = sg?.usernames?.active_usernames?.[0];
                            if (username) chatUsernames.set(s.chat_id, username);
                        } catch { /* 忽略 */ }
                    }
                }),
        );
        blockedList.value = senders.map((s) => {
            if (s._ === 'messageSenderUser') {
                const u = getReactiveUser(s.user_id);
                return {
                    id: s.user_id,
                    title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(s.user_id),
                    subtitle: u?.usernames?.active_usernames?.[0] ? `@${u.usernames.active_usernames[0]}` : `ID: ${s.user_id}`,
                    photo: u?.profile_photo,
                    accentId: u && u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
                    isChat: false,
                };
            }
            const c = getReactiveChat(s.chat_id);
            const chatUsername = chatUsernames.get(s.chat_id);
            return {
                id: s.chat_id,
                title: c ? getChatTitle(c) : String(s.chat_id),
                subtitle: chatUsername ? `@${chatUsername}` : `ID: ${s.chat_id}`,
                photo: c?.photo,
                accentId: getChatProfileAccentColorId(c),
                isChat: true,
            };
        });
    } catch (e) {
        console.error('load blocked failed:', e);
    } finally {
        blockedLoading.value = false;
    }
}

async function resolveSenderFromInput(input: string): Promise<{ sender: MessageSender; title: string } | null> {
    const text = input.trim().replace(/^@/, '');
    if (!text) return null;
    if (/^\d+$/.test(text)) {
        const uid = Number(text);
        await ensureUser(uid);
        const u = getReactiveUser(uid);
        return {
            sender: { _: 'messageSenderUser', user_id: uid },
            title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(uid),
        };
    }
    try {
        const chat = (await tdlibSend({ _: 'searchPublicChat', username: text })) as TdChat;
        if (chat?.type?._ === 'chatTypePrivate' || chat?.type?._ === 'chatTypeSecret') {
            const uid = (chat.type).user_id as number;
            await ensureUser(uid);
            const u = getReactiveUser(uid);
            return {
                sender: { _: 'messageSenderUser', user_id: uid },
                title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(uid),
            };
        }
        await ensureChat(chat.id);
        return {
            sender: { _: 'messageSenderChat', chat_id: chat.id },
            title: getChatTitle(chat) || String(chat.id),
        };
    } catch (e: any) {
        throw new Error(e?.message || t('privacy.userNotFound'));
    }
}

async function addBlocked() {
    const text = blockInput.value.trim();
    if (!text) return;
    blockingError.value = '';
    blockingAdd.value = true;
    try {
        const resolved = await resolveSenderFromInput(text);
        if (!resolved) return;
        await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: resolved.sender,
            block_list: { _: 'blockListMain' },
        });
        MessagePlugin.success(t('privacy.blocked', { name: resolved.title }));
        blockInput.value = '';
        emit('changed');
        loadBlocked();
    } catch (e: any) {
        blockingError.value = e?.message || t('privacy.blockFailed');
    } finally {
        blockingAdd.value = false;
    }
}

async function unblock(item: { id: number; title: string; isChat?: boolean }) {
    try {
        await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: item.isChat ? { _: 'messageSenderChat', chat_id: item.id } : { _: 'messageSenderUser', user_id: item.id },
            block_list: undefined,
        });
        MessagePlugin.success(t('privacy.unblocked', { name: item.title }));
        emit('changed');
        loadBlocked();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('privacy.operationFailed'));
    }
}

function onBlockedContextMenu(e: MouseEvent, item: { id: number; title: string }) {
    openContextMenu(e.clientX, e.clientY, [
        {
            key: 'unblock',
            label: t('privacy.unblockLabel'),
            icon: BanIcon,
            danger: true,
            onClick: () => unblock(item),
        },
    ], e.currentTarget as HTMLElement);
}

watch(() => props.modelValue, (v) => {
    if (!v) return;
    blockedList.value = [];
    blockingError.value = '';
    blockInput.value = '';
    void loadBlocked();
});
</script>
