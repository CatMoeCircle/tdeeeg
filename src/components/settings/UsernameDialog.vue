<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_settings_username_label')" @update:model-value="close">
        <div class="space-y-5">
            <!-- 顶部：编辑当前用户名 -->
            <div>
                <div class="mt-1 flex items-center gap-2">
                    <span class="text-gray-500 dark:text-gray-400 text-sm">@</span>
                    <input v-model="usernameInput" type="text" spellcheck="false"
                        class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        @input="checkUsernameDebounced" @keydown.enter="saveUsername" />
                    <button type="button" @click="saveUsername" :disabled="savingUsername"
                        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
                        {{ savingUsername ? t('editProfile.saving') : t('lng_settings_save') }}
                    </button>
                </div>
                <p class="text-xs mt-1.5" :class="usernameCheckClass">{{ usernameCheckText }}</p>
                <div class="mt-2 space-y-1">
                    <p v-html="tdHtml('lng_username_description')" class="text-xs text-gray-400"></p>
                </div>

            </div>

            <div v-if="activeUsernames.length + disabledUsernames.length > 1"
                class="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p class="text-xs text-gray-400 mb-2">{{ t('lng_usernames_subtitle') }}</p>
                <div class="space-y-2">
                    <template v-for="(u, idx) in managedUsernames" :key="u.name">
                        <div class="flex items-center gap-2 rounded-xl border px-3 py-2"
                            :class="u.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'">
                            <div class="flex-1 min-w-0">
                                <span class="text-sm truncate block"
                                    :class="u.isActive ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'">
                                    @{{ u.name }}
                                </span>
                                <span class="text-xs" :class="u.isActive ? 'text-teal-500' : 'text-gray-400'">
                                    {{ u.isActive ? t('lng_usernames_active') : t('lng_usernames_non_active') }}
                                </span>
                            </div>

                            <template v-if="u.isActive">
                                <button type="button" :disabled="idx === 0"
                                    class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    :title="t('editProfile.moveUp')" @click="moveUsername(u.activeIndex, -1)">
                                    <ArrowUpIcon class="w-4 h-4" />
                                </button>
                                <button type="button" :disabled="idx === activeUsernames.length - 1"
                                    class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    :title="t('editProfile.moveDown')" @click="moveUsername(u.activeIndex, 1)">
                                    <ArrowDownIcon class="w-4 h-4" />
                                </button>
                                <button v-if="idx !== 0" type="button" @click="toggleUsername(u.name, false)"
                                    :disabled="u.name === editableUsername"
                                    class="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                    :class="u.name === editableUsername ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'">
                                    <BanIcon class="w-4 h-4" />
                                </button>
                            </template>

                            <template v-else>
                                <button type="button" @click="toggleUsername(u.name, true)"
                                    class="w-7 h-7 flex items-center justify-center rounded-lg text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors">
                                    <CheckIcon class="w-4 h-4" />
                                </button>
                            </template>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    ArrowUp as ArrowUpIcon, ArrowDown as ArrowDownIcon,
    Ban as BanIcon, Check as CheckIcon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ModalDialog from './ModalDialog.vue';
import { tdlibSend } from '../../utils/tdlib';
import { tdHtml } from '../../utils/tdLang';

import type { user as TdUser } from 'tdlib-types';

const props = defineProps<{
    modelValue: boolean;
    user?: TdUser;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    changed: [];
}>();

const { t } = useI18n();

const usernameInput = ref('');
const usernameCheck = ref<'' | 'checking' | 'ok' | 'occupied' | 'invalid' | 'error'>('');
const savingUsername = ref(false);

const myId = computed(() => props.user?.id ?? 0);
const editableUsername = computed(() => props.user?.usernames?.editable_username ?? '');
const activeUsernames = computed<string[]>(() => props.user?.usernames?.active_usernames ?? []);
const disabledUsernames = computed<string[]>(() => props.user?.usernames?.disabled_usernames ?? []);

const managedUsernames = computed(() => {
    const active = (props.user?.usernames?.active_usernames ?? []).map((u, i) => ({ name: u, isActive: true, activeIndex: i }));
    const disabled = (props.user?.usernames?.disabled_usernames ?? []).map((u) => ({ name: u, isActive: false, activeIndex: -1 }));
    return [...active, ...disabled];
});

const usernameCheckText = computed(() => {
    switch (usernameCheck.value) {
        case 'checking': return t('editProfile.usernameChecking');
        case 'ok': return t('lng_username_available');
        case 'occupied': return t('lng_username_occupied');
        case 'invalid': return t('lng_username_invalid');
        case 'error': return t('editProfile.usernameUnavailableCheck');
        default: return '';
    }
});
const usernameCheckClass = computed(() => ({
    'text-teal-500': usernameCheck.value === 'ok',
    'text-red-500': usernameCheck.value === 'occupied' || usernameCheck.value === 'invalid' || usernameCheck.value === 'error',
    'text-gray-400': usernameCheck.value === 'checking',
}));

let checkTimer: ReturnType<typeof setTimeout> | null = null;

function close() {
    emit('update:modelValue', false);
}

watch(() => props.modelValue, (v) => {
    if (v) {
        usernameInput.value = editableUsername.value;
        usernameCheck.value = '';
    }
});

function checkUsernameDebounced() {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(checkUsername, 500);
}

async function checkUsername() {
    const name = usernameInput.value.trim();
    if (!name) {
        usernameCheck.value = '';
        return;
    }
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(name)) {
        usernameCheck.value = 'invalid';
        return;
    }
    if (!myId.value) return;
    usernameCheck.value = 'checking';
    try {
        const res = (await tdlibSend({
            _: 'checkChatUsername',
            chat_id: myId.value,
            username: name,
        } as any)) as { _: string };
        if (res._ === 'checkChatUsernameResultOk') usernameCheck.value = 'ok';
        else if (res._ === 'checkChatUsernameResultUsernameOccupied') usernameCheck.value = 'occupied';
        else if (res._ === 'checkChatUsernameResultUsernamePurchasable') usernameCheck.value = 'ok';
        else usernameCheck.value = 'invalid';
    } catch (e: any) {
        const msg = String(e?.message ?? '');
        if (msg.includes('USERNAME_OCCUPIED') || msg.includes('OCCUPIED')) usernameCheck.value = 'occupied';
        else usernameCheck.value = 'error';
    }
}

async function saveUsername() {
    const name = usernameInput.value.trim();
    savingUsername.value = true;
    try {
        await tdlibSend({ _: 'setUsername', username: name } as any);
        MessagePlugin.success(t('editProfile.usernameUpdated'));
        usernameCheck.value = '';
        emit('changed');
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.usernameSetFailed'));
    } finally {
        savingUsername.value = false;
    }
}

async function moveUsername(index: number, dir: -1 | 1) {
    const list = [...activeUsernames.value];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    try {
        await tdlibSend({ _: 'reorderActiveUsernames', usernames: list } as any);
        emit('changed');
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.reorderFailed'));
    }
}

async function toggleUsername(name: string, isActive: boolean) {
    try {
        await tdlibSend({ _: 'toggleUsernameIsActive', username: name, is_active: isActive } as any);
        emit('changed');
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.actionFailed'));
    }
}
</script>
