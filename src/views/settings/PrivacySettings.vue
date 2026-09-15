<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <!-- 顶部导航 -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold"> {{ t('lng_settings_section_privacy') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-6">
                <!-- 安全设置 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_settings_security') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <div
                            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                            <!-- 拉黑用户列表 -->
                            <button type="button" @click="openBlockedPopup"
                                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <BanIcon class="w-5 h-5 text-gray-400 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm text-gray-800 dark:text-gray-100">{{
                                        t('lng_settings_blocked_users') }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ blockedCountText }}</p>
                                </div>
                                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                            </button>
                            <!-- 两步验证 -->
                            <button type="button" @click="openTwoStepSettings"
                                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <KeyRoundIcon class="w-5 h-5 text-gray-400 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm text-gray-800 dark:text-gray-100">{{
                                        t('lng_settings_password_title') }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ twoStepText }}</p>
                                </div>
                                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                            </button>
                            <!-- 自动删除设置 -->
                            <button type="button" @click="openAutoDeletePopup"
                                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <TimerResetIcon class="w-5 h-5 text-gray-400 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_settings_ttl_title')
                                    }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ autoDeleteText }}</p>
                                </div>
                                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                            </button>
                            <!-- 登录邮箱（仅已设置时显示） -->
                            <div v-if="passwordState?.login_email_address_pattern"
                                class="w-full flex items-center gap-3 px-4 py-3">
                                <MailIcon class="w-5 h-5 text-gray-400 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm text-gray-800 dark:text-gray-100">{{
                                        t('lng_settings_cloud_login_email_section_title') }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ passwordState.login_email_address_pattern
                                    }}</p>
                                </div>
                            </div>
                            <!-- 活动会话 -->
                            <button type="button" @click="router.push({ name: 'settings-devices' })"
                                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <SmartphoneIcon class="w-5 h-5 text-gray-400 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm text-gray-800 dark:text-gray-100">
                                        {{ t('lng_settings_sessions_title') }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ sessionCountText }}</p>
                                </div>
                                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 可见性和权限 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_settings_privacy_title') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <div
                            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                            <button v-for="item in privacyItems" :key="item.key" type="button"
                                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                @click="openPrivacyItem(item)">
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                                        {{ item.label }}
                                        <span v-if="item.premiumOnly" class="tgico tgico-lock shrink-0"
                                            style="font-size:14px" />
                                    </p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ itemSummary(item) }}</p>
                                </div>
                                <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 账户删除时间设置 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_settings_destroy_title') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="openAccountTtlPopup"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <Trash2Icon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_self_destruct_title')
                                }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ accountTtlText }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </section>

                <!-- 18+ 内容 -->
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_settings_sensitive_title') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center gap-3"
                            :class="!canIgnoreSensitive ? 'opacity-60' : ''">
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100">{{
                                    t('lng_settings_sensitive_disable_filtering') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">
                                    {{ canIgnoreSensitive ? t('lng_settings_sensitive_about') : t('privacy.sensitiveUnsupported') }}
                                </p>
                            </div>
                            <ToggleSwitch v-model="ignoreSensitiveContent" :disabled="!canIgnoreSensitive"
                                @update:model-value="saveIgnoreSensitive" />
                        </div>
                    </div>
                </section>
            </div>
        </div>
        <!-- 拉黑用户列表弹窗 -->
        <BlockedUsersDialog v-model="blockedVisible" @count="blockedCount = $event" />

        <!-- 两步验证弹窗 -->
        <TwoFactorDialog v-model="twoFactorVisible" @changed="loadPasswordState" />

        <!-- 自动删除设置弹窗 -->
        <AutoDeleteDialog v-model="autoDeleteVisible" @changed="onAutoDeleteChanged" />

        <!-- 隐私设置弹窗 -->
        <PrivacyItemDialog v-model="privacyItemVisible" :item="selectedPrivacyItem" :is-premium="isPremium"
            @changed="onPrivacyItemChanged" />

        <!-- 账户删除时间设置弹窗 -->
        <AccountTtlDialog v-model="accountTtlVisible" :current-days="accountTtlDays" @changed="onAccountTtlChanged" />
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, onActivated, onMounted, onUnmounted, reactive, ref } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useRouter } from 'vue-router';
import {
    ChevronLeft as ChevronLeftIcon, Ban as BanIcon,
    ChevronRight as ChevronRightIcon, KeyRound as KeyRoundIcon,
    TimerReset as TimerResetIcon, Trash2 as Trash2Icon,
    Mail as MailIcon, Smartphone as SmartphoneIcon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import AutoDeleteDialog from '../../components/settings/AutoDeleteDialog.vue';
import TwoFactorDialog from '../../components/settings/TwoFactorDialog.vue';
import BlockedUsersDialog from '../../components/settings/BlockedUsersDialog.vue';
import PrivacyItemDialog from '../../components/settings/PrivacyItemDialog.vue';
import type { PrivacyItemDef } from '../../components/settings/PrivacyItemDialog.vue';
import AccountTtlDialog from '../../components/settings/AccountTtlDialog.vue';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { tdlibSend } from '../../utils/tdlib';
import { tdPlural } from '../../utils/tdLang';
import { decodeUserPrivacyRules, PRIVACY_PRESET_KEYS, privacyKeyForSettingType } from '../../utils/profilePrivacy';
import type { DecodedPrivacy } from '../../utils/profilePrivacy';
import type { UserPrivacySetting$Input } from 'tdlib-types';

const router = useRouter();
const { t } = useI18n();

function goBack() {
    router.back();
}

// =====================================================================
// 拉黑用户列表
// =====================================================================
const blockedVisible = ref(false);
const blockedCount = ref(0);

const blockedCountText = computed(() => {
    if (blockedCount.value > 0) return `${blockedCount.value}`;
    return t('lng_settings_no_blocked_users');
});

function openBlockedPopup() {
    blockedVisible.value = true;
}

// =====================================================================
// 两步验证（跳转独立设置页，需先认证）
// =====================================================================
const passwordState = ref<{ has_password: boolean; password_hint: string; has_recovery_email_address: boolean; login_email_address_pattern: string } | null>(null);
const twoFactorVisible = ref(false);

const twoStepText = computed(() => {
    if (!passwordState.value) return t('lng_profile_loading');
    return passwordState.value.has_password ? t('lng_settings_cloud_password_on') : t('lng_settings_cloud_password_off');
});


async function loadPasswordState() {
    try {
        const res = (await tdlibSend({ _: 'getPasswordState' }))
        passwordState.value = {
            has_password: !!res?.has_password,
            password_hint: res?.password_hint ?? '',
            has_recovery_email_address: !!res?.has_recovery_email_address,
            login_email_address_pattern: res?.login_email_address_pattern ?? '',
        };
    } catch (e) {
        console.error('load password state failed:', e);
    }
}


function openTwoStepSettings() {
    twoFactorVisible.value = true;
}

// =====================================================================
// 活动会话
// =====================================================================
const sessionCount = ref(0);
const sessionCountText = computed(() => {
    if (sessionCount.value > 0) return `${sessionCount.value}`;
    return t('lng_profile_loading');
});

async function loadSessionCount() {
    try {
        const res = (await tdlibSend({ _: 'getActiveSessions' }));
        sessionCount.value = res?.sessions?.length ?? 0;
    } catch (e) {
        console.error('load session count failed:', e);
    }
}

// =====================================================================
// 自动删除设置
// =====================================================================
const autoDeleteVisible = ref(false);
const autoDeleteTime = ref(0);

const autoDeleteOptions = computed(() => [
    { time: 0, label: '' },
    { time: 86400, label: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_days', 1) }) },
    { time: 7 * 86400, label: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_weeks', 1) }) },
    { time: 30 * 86400, label: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_months', 1) }) },
]);

const autoDeleteText = computed(() => {
    if (autoDeleteTime.value <= 0) return t('lng_settings_ttl_after_off');
    const opt = autoDeleteOptions.value.find((o) => o.time === autoDeleteTime.value);
    if (opt?.label) return t('lng_settings_ttl_after_toast', { after_duration: opt.label });
    // 自定义时长：粗略天/小时摘要
    const days = Math.floor(autoDeleteTime.value / 86400);
    if (days >= 1) {
        return t('lng_settings_ttl_after_toast', {
            after_duration: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_days', days) }),
        });
    }
    const hours = Math.max(1, Math.floor(autoDeleteTime.value / 3600));
    return t('lng_settings_ttl_after_toast', {
        after_duration: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_hours', hours) }),
    });
});

async function loadAutoDelete() {
    try {
        const res = (await tdlibSend({ _: 'getDefaultMessageAutoDeleteTime' }));
        autoDeleteTime.value = Number(res?.time ?? 0);
    } catch (e) {
        console.error('load auto delete failed:', e);
    }
}

async function openAutoDeletePopup() {
    autoDeleteVisible.value = true;
    loadAutoDelete();
}

function onAutoDeleteChanged(time: number) {
    autoDeleteTime.value = time;
}

// =====================================================================
// 可见性和权限（列表摘要）
// =====================================================================
const privacyItems = computed<PrivacyItemDef[]>(() => [
    { key: 'phone', label: t('lng_settings_phone_number_privacy'), kind: 'phone' },
    { key: 'status', label: t('lng_settings_last_seen'), kind: 'status' },
    { key: 'photo', label: t('lng_settings_profile_photo_privacy'), kind: 'standard', whoLabel: t('lng_edit_privacy_profile_photo_header') },
    { key: 'bio', label: t('lng_settings_bio_privacy'), kind: 'standard', whoLabel: t('lng_edit_privacy_about_header') },
    { key: 'birthdate', label: t('lng_settings_birthday_privacy'), kind: 'standard', whoLabel: t('lng_edit_privacy_birthday_header') },
    { key: 'audio', label: t('lng_settings_saved_music_privacy'), kind: 'standard', whoLabel: t('lng_edit_privacy_saved_music_header') },
    { key: 'forward', label: t('lng_settings_forwards_privacy'), kind: 'standard', whoLabel: t('lng_edit_privacy_forwards_header') },
    { key: 'calls', label: t('lng_settings_calls'), kind: 'standard', whoLabel: t('lng_edit_privacy_calls_header') },
    { key: 'gifts', label: t('lng_settings_gifts_privacy'), kind: 'gifts', whoLabel: t('lng_edit_privacy_gifts_header') },
    { key: 'voice', label: t('lng_settings_voices_privacy'), kind: 'voice', whoLabel: t('lng_edit_privacy_voices_header'), premiumOnly: true },
    { key: 'newchat', label: t('lng_settings_messages_privacy'), kind: 'newchat', premiumOnly: true },
    { key: 'invites', label: t('lng_settings_groups_invite'), kind: 'standard', whoLabel: t('lng_edit_privacy_groups_header') },
]);

const PRIVACY_SETTINGS: Record<string, UserPrivacySetting$Input> = {
    phone_number: { _: 'userPrivacySettingShowPhoneNumber' },
    phone_find: { _: 'userPrivacySettingAllowFindingByPhoneNumber' },
    status: { _: 'userPrivacySettingShowStatus' },
    photo: { _: 'userPrivacySettingShowProfilePhoto' },
    bio: { _: 'userPrivacySettingShowBio' },
    birthdate: { _: 'userPrivacySettingShowBirthdate' },
    audio: { _: 'userPrivacySettingShowProfileAudio' },
    forward: { _: 'userPrivacySettingShowLinkInForwardedMessages' },
    calls: { _: 'userPrivacySettingAllowCalls' },
    gifts: { _: 'userPrivacySettingAutosaveGifts' },
    voice: { _: 'userPrivacySettingAllowPrivateVoiceAndVideoNoteMessages' },
    invites: { _: 'userPrivacySettingAllowChatInvites' },
    unpaid_messages: { _: 'userPrivacySettingAllowUnpaidMessages' },
};

const privacyRules = reactive<Record<string, DecodedPrivacy>>({});
const privacyItemVisible = ref(false);
const selectedPrivacyItem = ref<PrivacyItemDef | null>(null);

function countExceptions(d: DecodedPrivacy): number {
    return d.allowed.userIds.length + d.allowed.chatIds.length + d.restricted.userIds.length + d.restricted.chatIds.length;
}

function itemSummary(item: PrivacyItemDef): string {
    if (item.key === 'phone') {
        const p1 = privacyRules.phone_number ? t(PRIVACY_PRESET_KEYS[privacyRules.phone_number.preset]) : t('lng_profile_loading');
        return `${p1}`;
    }
    if (item.key === 'status') {
        const d = privacyRules.status;
        if (!d) return t('lng_profile_loading');
        const n = countExceptions(d);
        const label = t(PRIVACY_PRESET_KEYS[d.preset]);
        const base = n ? `${label}` : label;
        return hideReadTime.value ? `${base}` : base;
    }
    if (item.key === 'newchat') {
        const opt = newChatOptions.value.find((o) => o.value === newChatMode.value);
        return opt ? `${opt.label}` : t('lng_profile_loading');
    }
    const d = privacyRules[item.key];
    if (!d) return t('lng_profile_loading');
    const n = countExceptions(d);
    const label = t(PRIVACY_PRESET_KEYS[d.preset]);
    return n ? `${label}` : label;
}

async function loadRules(key: string): Promise<DecodedPrivacy | undefined> {
    try {
        const res = await tdlibSend({
            _: 'getUserPrivacySettingRules',
            setting: PRIVACY_SETTINGS[key],
        });
        const decoded = decodeUserPrivacyRules(res);
        privacyRules[key] = decoded;
        return decoded;
    } catch (e) {
        console.error(`load privacy rules ${key} failed:`, e);
        return undefined;
    }
}

async function loadAllPrivacyRules() {
    await Promise.all(
        Object.keys(PRIVACY_SETTINGS)
            .filter((k) => k !== 'unpaid_messages')
            .map((k) => loadRules(k)),
    );
}

function openPrivacyItem(item: PrivacyItemDef) {
    selectedPrivacyItem.value = item;
    privacyItemVisible.value = true;
}

function onPrivacyItemChanged() {
    void loadAllPrivacyRules();
    void loadReadDateSetting();
    void loadNewChatSetting();
}

// 上线状态摘要依赖
const hideReadTime = ref(false);

async function loadReadDateSetting() {
    try {
        const res = (await tdlibSend({ _: 'getReadDatePrivacySettings' }));
        hideReadTime.value = res?._ === 'readDatePrivacySettings' ? !res.show_read_date : false;
    } catch (e) {
        console.error('load read date settings failed:', e);
    }
}

// 私聊消息摘要依赖
type NewChatMode = 'everyone' | 'contacts_premium' | 'paid';
const newChatMode = ref<NewChatMode>('everyone');

const newChatOptions = computed<{ value: NewChatMode; label: string }[]>(() => [
    { value: 'everyone', label: t('lng_edit_privacy_everyone') },
    { value: 'contacts_premium', label: t('lng_edit_privacy_contacts_and_premium') },
    { value: 'paid', label: t('lng_edit_privacy_paid') },
]);

async function loadNewChatSetting() {
    try {
        const res = (await tdlibSend({ _: 'getNewChatPrivacySettings' }));
        const allow = !!res?.allow_new_chats_from_unknown_users;
        const star = Number(res?.incoming_paid_message_star_count ?? 0);
        newChatMode.value = star > 0 ? 'paid' : allow ? 'everyone' : 'contacts_premium';
    } catch (e) {
        console.error('load new chat setting failed:', e);
    }
}

// =====================================================================
// Premium 状态
// =====================================================================
const isPremium = ref(false);

async function loadPremiumOptions() {
    try {
        const prem = (await tdlibSend({ _: 'getOption', name: 'is_premium' }))
        isPremium.value = prem?._ === 'optionValueBoolean' && !!prem.value;
    } catch (e) {
        console.error('load premium options failed:', e);
    }
}

// =====================================================================
// 账户删除时间设置
// =====================================================================
const accountTtlVisible = ref(false);
const accountTtlDays = ref(365);

// 只存 key/count，翻译在 computed 内完成，语言切换才会跟着变
const ACCOUNT_TTL_LABEL_META: Record<number, { key: string; count: number }> = {
    30: { key: 'lng_self_destruct_months', count: 1 },
    90: { key: 'lng_self_destruct_months', count: 3 },
    180: { key: 'lng_self_destruct_months', count: 6 },
    365: { key: 'lng_self_destruct_years', count: 1 },
    730: { key: 'lng_self_destruct_years', count: 2 },
};

const accountTtlText = computed(() => {
    const days = accountTtlDays.value;
    const meta = ACCOUNT_TTL_LABEL_META[days];
    const duration = meta
        ? tdPlural(meta.key, meta.count)
        : tdPlural('lng_settings_ttl_after_days', days);
    return `${t('lng_settings_destroy_if')} ${duration}`;
});

async function loadAccountTtl() {
    try {
        const res = (await tdlibSend({ _: 'getAccountTtl' }));
        accountTtlDays.value = Number(res?.days ?? 365);
    } catch (e) {
        console.error('load account ttl failed:', e);
    }
}

function openAccountTtlPopup() {
    accountTtlVisible.value = true;
}

function onAccountTtlChanged(days: number) {
    accountTtlDays.value = days;
}

// =====================================================================
// 18+ 内容显示
// =====================================================================
const canIgnoreSensitive = ref(false);
const ignoreSensitiveContent = ref(false);

async function loadSensitiveOptions() {
    try {
        const can = (await tdlibSend({ _: 'getOption', name: 'can_ignore_sensitive_content_restrictions' }));
        canIgnoreSensitive.value = can?._ === 'optionValueBoolean' && !!can.value;
        const cur = (await tdlibSend({ _: 'getOption', name: 'ignore_sensitive_content_restrictions' }));
        ignoreSensitiveContent.value = cur?._ === 'optionValueBoolean' && !!cur.value;
    } catch (e) {
        console.error('load sensitive options failed:', e);
    }
}

async function saveIgnoreSensitive(v: boolean) {
    try {
        await tdlibSend({
            _: 'setOption',
            name: 'ignore_sensitive_content_restrictions',
            value: { _: 'optionValueBoolean', value: v },
        });
        ignoreSensitiveContent.value = v;
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('lng_attach_failed'));
        ignoreSensitiveContent.value = !v;
    }
}

// =====================================================================
// 初始化
// =====================================================================
let unlistenPrivacy: UnlistenFn | null = null;

/** 其他客户端改了隐私规则时，直接用 update 载荷刷新本地缓存（与 Unigram 一致） */
async function subscribePrivacyUpdates() {
    unlistenPrivacy?.();
    unlistenPrivacy = await listen<Record<string, any>>('tdlib-update', (event) => {
        const payload = event.payload;
        if (payload?._ !== 'updateUserPrivacySettingRules') return;
        const key = privacyKeyForSettingType(payload.setting?._);
        if (!key) return;
        privacyRules[key] = decodeUserPrivacyRules(payload.rules);
    });
}

onMounted(() => {
    loadPasswordState();
    loadAutoDelete();
    loadSessionCount();
    loadNewChatSetting();
    loadAccountTtl();
    loadSensitiveOptions();
    loadAllPrivacyRules();
    loadReadDateSetting();
    loadPremiumOptions();
    void subscribePrivacyUpdates();
});

onUnmounted(() => {
    unlistenPrivacy?.();
    unlistenPrivacy = null;
});

// KeepAlive：从两步验证设置页返回时刷新密码状态
onActivated(() => {
    loadPasswordState();
});
</script>
