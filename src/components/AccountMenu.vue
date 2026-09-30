<template>
    <Teleport to="body">
        <Transition name="account-menu">
            <div v-if="visible" class="fixed inset-0 z-9990" @mousedown.self="close" @keydown.esc="close">
                <!-- 账户菜单浮层（左下角，跟随导航栏头像位置） -->
                <div
                    class="absolute left-3 top-10 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3.5rem)] flex flex-col rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 当前用户信息：点击跳转个人主页 -->
                    <div
                        class="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        @click="openMyProfile">
                        <div class="w-12 h-12 shrink-0">
                            <Avatar v-if="userProfile" :photo="userProfile.profile_photo"
                                :title="userProfile.first_name + ' ' + userProfile.last_name"
                                :accentColorId="userProfile.profile_accent_color_id" />
                            <div v-else class="w-full h-full rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse">
                            </div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {{ currentName }}
                            </p>
                            <p class="text-xs text-gray-400 truncate">
                                {{ currentUsername ? '@' + currentUsername : '' }}
                            </p>
                        </div>
                    </div>

                    <!-- 账户列表 -->
                    <div class="account-menu-scroll py-1.5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
                        <p class="px-4 pt-2 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wider">{{ t('account.sectionTitle') }}</p>
                        <div v-if="accounts.length === 0" class="px-4 py-3 text-sm text-gray-400">{{ t('account.empty') }}</div>
                        <div v-for="acc in accounts" :key="acc.id"
                            class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                            @click="onSelect(acc)">
                            <img v-if="avatarSrc(acc)" :src="avatarSrc(acc)" alt="avatar"
                                class="w-9 h-9 rounded-full object-cover shrink-0" />
                            <div v-else
                                class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs text-white bg-linear-to-br from-blue-400 to-indigo-500">
                                {{ accountInitials(acc) }}
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {{ accountName(acc) }}
                                </p>
                                <p class="text-xs text-gray-400 truncate">
                                    {{ accountSubtitle(acc) }}
                                </p>
                            </div>
                            <CheckIcon v-if="acc.is_active" class="w-4 h-4 text-blue-500 shrink-0" />
                            <button v-if="acc.logged_in && !acc.is_active" type="button" @click.stop="onLogout(acc)"
                                class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                                :title="t('lng_passcode_logout')">
                                <LogOutIcon class="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <!-- 添加账户 -->
                    <div class="border-t border-gray-100 dark:border-gray-700">
                        <button type="button" @click="showAdd = true"
                            class="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors text-left">
                            <span
                                class="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center">
                                <UserPlusIcon class="w-5 h-5" />
                            </span>
                            {{ t('lng_menu_add_account') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- 添加账户确认弹窗 -->
    <Teleport to="body">
        <Transition name="account-menu">
            <div v-if="showAdd"
                class="fixed inset-0 z-9991 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="showAdd = false" @keydown.esc="showAdd = false">
                <div
                    class="w-90 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 内置 API 确认（未达上限） -->
                    <template v-if="!limitReached">
                        <div class="px-4 pt-5 pb-3 text-center">
                            <div
                                class="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center mb-3">
                                <UserPlusIcon class="w-6 h-6" />
                            </div>
                            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ t('lng_menu_add_account') }}</h3>
                            <p class="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-5">
                                {{ t('systemSettings.addDialogDesc') }}
                            </p>
                        </div>
                        <div class="px-4 pb-4 flex items-center justify-end gap-3">
                            <button type="button" @click="showAdd = false"
                                class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                {{ t('lng_cancel') }}
                            </button>
                            <button type="button" @click="confirmAdd" :disabled="adding"
                                class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-wait">
                                {{ adding ? t('systemSettings.creating') : t('lng_continue') }}
                            </button>
                        </div>
                    </template>

                    <!-- 自定义 API 表单（达到上限） -->
                    <template v-else>
                        <div class="px-4 pt-5 pb-3">
                            <div class="flex items-center gap-2 mb-3">
                                <div
                                    class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                                    <AlertIcon class="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ t('systemSettings.needCustomApi') }}</h3>
                                    <p class="text-xs text-gray-400">{{ t('systemSettings.limitReached', { count: limitInfo?.limit ?? 5 }) }}</p>
                                </div>
                            </div>
                            <i18n-t keypath="systemSettings.getApiHint" tag="p" class="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-5 mb-4">
                                <template #link>
                                    <a href="https://my.telegram.org" target="_blank" rel="noopener"
                                        class="text-blue-500 hover:underline">my.telegram.org</a>
                                </template>
                            </i18n-t>
                            <div class="space-y-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API ID</label>
                                    <input v-model="customApiId" type="text" inputmode="numeric" :placeholder="t('systemSettings.apiIdPlaceholder')"
                                        spellcheck="false"
                                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API Hash</label>
                                    <input v-model="customApiHash" type="text" :placeholder="t('systemSettings.apiHashPlaceholder')" spellcheck="false"
                                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                                </div>
                            </div>
                        </div>
                        <div class="px-4 pb-4 flex items-center justify-end gap-3">
                            <button type="button" @click="showAdd = false"
                                class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                {{ t('lng_cancel') }}
                            </button>
                            <button type="button" @click="confirmAddCustom" :disabled="adding"
                                class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-wait">
                                {{ adding ? t('systemSettings.creating') : t('systemSettings.loginWithCustomApi') }}
                            </button>
                        </div>
                    </template>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { ref, computed, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { UserPlus as UserPlusIcon, Check as CheckIcon, LogOut as LogOutIcon, AlertTriangle as AlertIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import Avatar from './chat/avatar.vue';
import { useUserStore } from '../store/user';
import { useAccountsStore, type AccountInfo } from '../store/accounts';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';

const visible = defineModel<boolean>('visible', { default: false });
const emit = defineEmits<{ (e: 'close'): void }>();

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const accountsStore = useAccountsStore();
const { accounts } = storeToRefs(accountsStore);
const router = useRouter();

const showAdd = ref(false);
const adding = ref(false);
const limitReached = ref(false);
const limitInfo = ref<{ builtin_count: number; limit: number; reached: boolean } | null>(null);

/** 自定义 API 表单 */
const customApiId = ref('');
const customApiHash = ref('');

const currentName = computed(() => {
    if (!userProfile.value) return t('lng_profile_loading');
    return (userProfile.value.first_name || '') + ' ' + (userProfile.value.last_name || '');
});
const currentUsername = computed(() => userProfile.value?.usernames?.active_usernames?.[0] ?? '');

function avatarSrc(acc: AccountInfo): string | undefined {
    return acc.avatar_path ? convertFileSrc(acc.avatar_path) : undefined;
}

function accountInitials(acc: AccountInfo): string {
    const name = (acc.first_name || '') + (acc.last_name || '');
    return name.trim().substring(0, 2) || '#';
}

function accountName(acc: AccountInfo): string {
    if (acc.first_name || acc.last_name) {
        return (acc.first_name || '') + ' ' + (acc.last_name || '');
    }
    return t('systemSettings.notLoggedInAccount');
}

function accountSubtitle(acc: AccountInfo): string {
    if (acc.logged_in) {
        return acc.username ? '@' + acc.username : `#${acc.id}`;
    }
    return t('account.clickToLogin');
}

function close() {
    visible.value = false;
    emit('close');
}

/** 点击当前用户信息栏 → 打开自己的个人主页 */
function openMyProfile() {
    if (!userProfile.value) return;
    close();
    router.push({ name: 'user-profile', params: { id: String(userProfile.value.id) } });
}

function onSelect(acc: AccountInfo) {
    if (acc.is_active) {
        close();
        return;
    }
    accountsStore.switchAccount(acc.id);
}

function onLogout(acc: AccountInfo) {
    if (window.confirm(t('lng_sure_logout'))) {
        accountsStore.logoutAccount(acc.id);
    }
}

/** 打开添加账户弹窗时检查内置 API 额度 */
watch(showAdd, async (v) => {
    if (!v) return;
    try {
        const info = await accountsStore.getAccountLimits();
        limitInfo.value = info;
        limitReached.value = info.reached;
    } catch (e: any) {
        console.error('Failed to get account limits:', e);
        limitReached.value = false;
    }
    // 重置表单
    customApiId.value = '';
    customApiHash.value = '';
});

/** 使用内置 API 添加账户 */
async function confirmAdd() {
    if (adding.value) return;
    adding.value = true;
    try {
        await accountsStore.addAccount();
    } catch (e: any) {
        adding.value = false;
        MessagePlugin.error(e?.message || t('systemSettings.addFailed'));
    }
}

/** 使用自定义 API 添加账户 */
async function confirmAddCustom() {
    if (adding.value) return;

    const idStr = customApiId.value.trim();
    const hash = customApiHash.value.trim();
    if (!idStr || !hash) {
        MessagePlugin.warning(t('systemSettings.enterApiCreds'));
        return;
    }
    const idNum = Number(idStr);
    if (!Number.isInteger(idNum) || idNum <= 0) {
        MessagePlugin.warning(t('systemSettings.apiIdInvalid'));
        return;
    }

    adding.value = true;
    try {
        await accountsStore.addAccount(idNum, hash);
    } catch (e: any) {
        adding.value = false;
        MessagePlugin.error(e?.message || t('systemSettings.addFailed'));
    }
}
</script>

<style scoped>
.account-menu-enter-active,
.account-menu-leave-active {
    transition: opacity 0.15s ease;
}

.account-menu-enter-from,
.account-menu-leave-to {
    opacity: 0;
}
</style>
