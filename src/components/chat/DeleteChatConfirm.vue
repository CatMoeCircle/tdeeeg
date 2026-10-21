<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            @mousedown.self="emit('close')">
            <div class="w-100 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <LogOutIcon v-if="isLeave" class="w-4 h-4 text-red-500" />
                        <Trash2Icon v-else class="w-4 h-4 text-red-500" />
                        {{ titleText }}
                    </h3>
                    <button type="button"
                        class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                        @click="emit('close')">
                        <XIcon class="w-4 h-4" />
                    </button>
                </div>

                <div class="px-4 py-4 space-y-2">
                    <p class="text-sm text-gray-600 dark:text-gray-300">
                        {{ askText }}
                    </p>

                    <template v-if="ready">
                        <label v-if="peerCanRevoke" class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                            :class="deleteForPeer ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                            <input v-model="deleteForPeer" type="checkbox" class="w-4 h-4 accent-red-500 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ t('lng_delete_for_everyone_check') }}</p>
                                <p class="text-xs text-gray-400 dark:text-gray-500">{{ t('lng_delete_for_everyone_hint') }}</p>
                            </div>
                        </label>

                        <label v-if="ownerCanDeleteForAll" class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                            :class="deleteForAll ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                            <input v-model="deleteForAll" type="checkbox" class="w-4 h-4 accent-red-500 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ t('lng_delete_for_everyone_check') }}</p>
                                <p class="text-xs text-gray-400 dark:text-gray-500">{{ t('lng_delete_for_everyone_hint') }}</p>
                            </div>
                        </label>

                        <label v-if="isBot" class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                            :class="blockBot ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                            <input v-model="blockBot" type="checkbox" class="w-4 h-4 accent-red-500 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ t('lng_profile_block_bot') }}</p>
                            </div>
                        </label>
                    </template>
                </div>

                <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                    <button type="button" @click="emit('close')"
                        class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        {{ t('lng_cancel') }}
                    </button>
                    <button type="button" @click="confirm" :disabled="!ready || busy"
                        class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed">
                        {{ confirmLabel }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
// ponytail: 权限判断只看 TDLib 返回的 status / can_be_deleted_for_all_users，不做本地推断
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Trash2 as Trash2Icon, LogOut as LogOutIcon, X as XIcon } from 'lucide-vue-next';
import type { Chat } from '../../store/chat';
import { tdlibSend } from '../../utils/tdlib';
import { toast } from '../../utils/toast';

const props = defineProps<{ chat: Chat }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n();

const ready = ref(false);
const busy = ref(false);
const peerUserId = ref<number | null>(null);
const isBot = ref(false);
const isOwner = ref(false);
const deleteForPeer = ref(false);
const deleteForAll = ref(false);
const blockBot = ref(false);

/** TDLib 完整 chat：类型与删除权限标记以此为准（store 的 Chat 不含这些字段） */
const full = ref<any>(null);
const isPrivate = computed(() => full.value?.type?._ === 'chatTypePrivate');
const isGroupOrChannel = computed(() => full.value?.type?._ === 'chatTypeBasicGroup' || full.value?.type?._ === 'chatTypeSupergroup');
const isChannel = computed(() => full.value?.type?._ === 'chatTypeSupergroup' && full.value?.type?.is_channel === true);
/** 群/频道走「退出」，私聊走「删除」 */
const isLeave = computed(() => isGroupOrChannel.value);
const forAllAllowed = computed(() => full.value?.can_be_deleted_for_all_users === true);
const peerCanRevoke = computed(() => isPrivate.value && forAllAllowed.value);
const ownerCanDeleteForAll = computed(() => isGroupOrChannel.value && isOwner.value && forAllAllowed.value);

const titleText = computed(() => {
    if (isLeave.value) return isChannel.value ? t('lng_profile_leave_channel') : t('lng_profile_leave_group');
    return t('lng_profile_delete_conversation');
});

const confirmLabel = computed(() => {
    if (isLeave.value) return isChannel.value ? t('lng_profile_leave_channel') : t('lng_profile_leave_group');
    return t('lng_box_delete');
});

const askText = computed(() => {
    const name = full.value?.title || props.chat.title || '';
    if (isLeave.value) return isChannel.value ? t('lng_sure_leave_channel') : t('lng_sure_leave_group');
    return t('lng_sure_delete_history', { contact: name });
});

onMounted(async () => {
    try {
        full.value = await tdlibSend({ _: 'getChat', chat_id: props.chat.id } as any);
        const type = full.value?.type;
        if (type?._ === 'chatTypePrivate') {
            peerUserId.value = type.user_id;
            const u: any = await tdlibSend({ _: 'getUser', user_id: type.user_id } as any);
            isBot.value = u?.type?._ === 'userTypeBot';
        } else if (type?._ === 'chatTypeBasicGroup') {
            const g: any = await tdlibSend({ _: 'getBasicGroup', basic_group_id: type.basic_group_id } as any);
            isOwner.value = g?.status?._ === 'chatMemberStatusCreator';
        } else if (type?._ === 'chatTypeSupergroup') {
            const g: any = await tdlibSend({ _: 'getSupergroup', supergroup_id: type.supergroup_id } as any);
            isOwner.value = g?.status?._ === 'chatMemberStatusCreator';
        }
    } catch (e) {
        console.warn('Failed to load delete-chat info:', e);
    }
    ready.value = true;
});

async function confirm() {
    busy.value = true;
    try {
        if (isLeave.value) {
            // 群/频道：群主勾选「为所有成员删除」→ deleteChat；否则退出
            if (deleteForAll.value) {
                await tdlibSend({ _: 'deleteChat', chat_id: props.chat.id } as any);
            } else {
                await tdlibSend({ _: 'leaveChat', chat_id: props.chat.id } as any);
            }
        } else {
            // 私聊：可选屏蔽 bot，再删除历史
            if (blockBot.value && peerUserId.value !== null) {
                await tdlibSend({
                    _: 'setMessageSenderBlockList',
                    sender_id: { _: 'messageSenderUser', user_id: peerUserId.value },
                    block_list: { _: 'blockListMain' },
                } as any);
            }
            await tdlibSend({
                _: 'deleteChatHistory',
                chat_id: props.chat.id,
                remove_from_chat_list: true,
                revoke: deleteForPeer.value,
            } as any);
        }
        toast.success(isLeave.value ? t('context.leftChat') : t('context.deleted'));
        emit('close');
    } catch (e: any) {
        toast.error(e?.message || t('context.deleteFailed'));
        busy.value = false;
    }
}
</script>
