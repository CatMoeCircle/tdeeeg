<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <!-- 顶部导航 -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold flex-1">{{ t('lng_settings_information') }}</h2>
            <button type="button" @click="saveProfile" :disabled="savingProfile"
                class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
                {{ savingProfile ? t('editProfile.saving') : t('lng_settings_save') }}
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-6">
                <!-- 头像 + 姓名 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_info_user_title') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5">
                        <div
                            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex gap-6">
                            <!-- 左侧：头像 + 上传按钮 -->
                            <div class="flex flex-col items-center gap-3 shrink-0">
                                <Avatar :photo="user?.profile_photo" :title="fullName"
                                    :accentColorId="user?.profile_accent_color_id" sizeClass="!w-20 !h-20" />
                                <button type="button" @click="avatarEditorVisible = true"
                                    class="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors">
                                    {{ t('lng_settings_upload') }}
                                </button>
                            </div>
                            <!-- 右侧：姓名设置 -->
                            <div class="flex-1 min-w-0 space-y-3">
                                <div>
                                    <label class="text-xs text-gray-400">{{ t('lng_signup_firstname') }}</label>
                                    <input v-model="firstName" type="text" maxlength="64"
                                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label class="text-xs text-gray-400">{{ t('lng_signup_lastname') }}</label>
                                    <input v-model="lastName" type="text" maxlength="64"
                                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 个人简介 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_info_bio_label') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <div
                            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-2">
                            <textarea v-model="bio" rows="3" :maxlength="bioMax"
                                class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-400">{{ bio.length }} / {{ bioMax }}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 手机号码 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_info_mobile_label') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="phoneVisible = true"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <PhoneIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100 select-all">{{ formattedPhone ||
                                    t('editProfile.phoneNotSet') }}
                                </p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('editProfile.phoneChangeHint') }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </section>

                <!-- 用户名 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_username_title') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="openUsernamePopup"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100">{{ primaryUsername ||
                                    t('lng_settings_username_add') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ usernameSummary }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </section>

                <!-- 生日 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_settings_birthday_label') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <div
                            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
                            <div class="flex items-center gap-3">
                                <CalendarIcon class="w-5 h-5 text-gray-400 shrink-0" />
                                <p v-if="birthdateText" class="text-sm text-gray-800 dark:text-gray-100 flex-1">{{
                                    birthdateText }}
                                </p>
                                <p v-else class="text-sm text-gray-400 flex-1">{{ t('lng_settings_empty_bio') }}</p>
                                <button type="button" @click="toggleBirthdayEditing"
                                    class="px-3 py-1.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors shrink-0">
                                    {{ birthdayEditing ? t('editProfile.collapse') : t('lng_settings_edit') }}
                                </button>
                            </div>
                            <div v-if="birthdayEditing" class="flex flex-wrap items-center gap-3">
                                <TDatePicker v-model="birthdatePickerValue" mode="date" format="YYYY-MM-DD" clearable
                                    :style="{ width: '180px' }" @change="(v) => saveBirthdate(v as string)" />
                                <label class="flex items-center gap-2 cursor-pointer select-none shrink-0"
                                    @click.prevent="setHideYear(!hideYear)">
                                    <button type="button" role="switch" :aria-checked="hideYear"
                                        class="relative w-10 h-6 rounded-full transition-colors duration-200"
                                        :class="hideYear ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                        <span
                                            class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                                            :class="hideYear ? 'translate-x-4' : 'translate-x-0'" />
                                    </button>
                                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t('editProfile.hideYear')
                                        }}</span>
                                </label>
                                <button type="button" v-if="birthdateInfo" @click="deleteBirthdate"
                                    :disabled="savingBirthdate"
                                    class="px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50">
                                    {{ t('lng_settings_birthday_reset') }}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 个人主页频道 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_settings_channel_label') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="openPersonalChatPopup"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <div class="w-10 h-10 shrink-0" v-if="personalChat">
                                <Avatar :photo="personalChat.photo" :title="personalChat.title"
                                    :accentColorId="personalChatAccent" sizeClass="!w-10 !h-10" />
                            </div>
                            <div v-else
                                class="w-10 h-10 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <MegaphoneIcon class="w-5 h-5 text-gray-400" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ personalChat?.title ||
                                    t('lng_settings_empty_bio')
                                }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('editProfile.personalChannelHint') }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </section>

                <!-- 营业时间 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_hours_title') }} <span class="tgico tgico-lock shrink-0" style="font-size:14px" />
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="openBusinessHoursPopup"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <ClockIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p v-if="businessHoursLines.length"
                                    class="text-sm text-gray-800 dark:text-gray-100 flex items-baseline justify-between gap-3">
                                    <span class="shrink-0">{{ businessHoursLines[0].day }}</span>
                                    <span class="text-right text-gray-500 dark:text-gray-400 min-w-0">{{
                                        businessHoursLines[0].time }}</span>
                                </p>
                                <p v-else class="text-sm text-gray-400 truncate">{{ t('lng_settings_empty_bio') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{
                                    t('lng_hours_about') }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </section>

                <!-- 位置 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_location_title') }} <span class="tgico tgico-lock shrink-0" style="font-size:14px" />
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="openLocationPopup"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <MapPinIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p v-if="businessLocation?.address"
                                    class="text-sm text-gray-800 dark:text-gray-100 truncate">{{
                                        businessLocation.address }}</p>
                                <p v-else class="text-sm text-gray-400 truncate">{{ t('lng_settings_empty_bio') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_location_fallback') }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </section>

                <!-- 聊天机器人 -->
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_settings_chat_automation_label') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="openChatbotPopup"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <BotIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ chatbotText ||
                                    t('lng_settings_empty_bio') }}
                                </p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('lng_chat_automation_about') }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </section>
            </div>
        </div>

        <!-- 头像编辑器 -->
        <AvatarEditorDialog v-model="avatarEditorVisible" :photos="photos" :current-photo-id="user?.profile_photo?.id"
            @changed="onProfileChanged" />

        <!-- 手机号码弹窗 -->
        <ChangePhoneDialog v-model="phoneVisible" />

        <!-- 用户名弹窗 -->
        <UsernameDialog v-model="usernameVisible" :user="user" @changed="onUsernameChanged" />

        <!-- 个人主页频道弹窗 -->
        <PersonalChatDialog v-model="personalChatVisible" :personal-chat-id="personalChatId" @changed="onPersonalChatChanged" />

        <!-- 营业时间弹窗 -->
        <BusinessHoursDialog v-model="businessHoursVisible" :full-info="fullInfo" @changed="onBusinessHoursChanged" />

        <!-- 位置弹窗 -->
        <BusinessLocationDialog v-model="locationVisible" />

        <!-- 聊天机器人弹窗 -->
        <BusinessChatbotDialog v-model="chatbotVisible" :chatbot-text="chatbotText" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
    AtSign as AtSignIcon, Bot as BotIcon, Calendar as CalendarIcon,
    ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Clock as ClockIcon,
    MapPin as MapPinIcon, Megaphone as MegaphoneIcon, Phone as PhoneIcon,
} from 'lucide-vue-next';
import { DatePicker as TDatePicker, MessagePlugin } from 'tdesign-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import AvatarEditorDialog from '../../components/settings/AvatarEditorDialog.vue';
import ChangePhoneDialog from '../../components/settings/ChangePhoneDialog.vue';
import UsernameDialog from '../../components/settings/UsernameDialog.vue';
import PersonalChatDialog from '../../components/settings/PersonalChatDialog.vue';
import BusinessHoursDialog from '../../components/settings/BusinessHoursDialog.vue';
import BusinessLocationDialog from '../../components/settings/BusinessLocationDialog.vue';
import BusinessChatbotDialog from '../../components/settings/BusinessChatbotDialog.vue';
import { useUserStore } from '../../store/user';
import { useUserProfileStore } from '../../store/userProfile';
import { tdlibSend } from '../../utils/tdlib';
import { ensureChat, getReactiveChat, getReactiveUser, ensureUser } from '../../utils/senderInfo';
import { formatBusinessHoursPreview } from '../../utils/businessHours';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { useI18n } from 'vue-i18n';

import type { user as TdUser, userFullInfo, chatPhoto, chat, birthdate } from 'tdlib-types';

const router = useRouter();
const { t } = useI18n();
const userStore = useUserStore();
const profileStore = useUserProfileStore();

const avatarEditorVisible = ref(false);
const phoneVisible = ref(false);

const user = computed<TdUser | undefined>(() => userStore.userProfile);
const myId = computed(() => user.value?.id ?? 0);

// TDLib 返回的 phone_number 未必是带 + 号的标准 E.164 格式（可能是匿名号、本国号等），
// 直接 parsePhoneNumberFromString 解析不出来会返回 undefined。因此优先使用
// getPhoneNumberInfoSync 的权威本地化格式，parsePhoneNumberFromString 仅作为兜底。
const formattedPhone = ref('');
const phoneIsAnonymous = ref(false);
async function loadPhoneDisplay() {
    const raw = user.value?.phone_number;
    if (!raw) {
        formattedPhone.value = '';
        phoneIsAnonymous.value = false;
        return;
    }
    // 先用原始号码做立即回退，确保始终有内容显示
    formattedPhone.value = raw;
    // 尝试用 TDLib 获取权威本地化格式（与 UserProfile 一致）
    try {
        const info = await profileStore.getPhoneInfo(myId.value);
        if (info?.formatted_phone_number) {
            const code = info.country_calling_code ? `+${info.country_calling_code} ` : '';
            formattedPhone.value = code + info.formatted_phone_number.replace(/-/g, ' ');
        }
        phoneIsAnonymous.value = !!info?.is_anonymous;
        return;
    } catch {
        // 忽略，继续使用原始号码或 parsePhoneNumberFromString 结果
    }
    // 兜底：尝试用 parsePhoneNumberFromString 解析（仅对标准 E.164 有效）
    try {
        const parsed = parsePhoneNumberFromString(raw);
        if (parsed) {
            formattedPhone.value = parsed.formatInternational();
        }
    } catch {
        // 忽略，保留原始号码
    }
}
// loadPhoneDisplay 中加载到的 fullInfo / photos 不在这里重复声明，
// 使用 profileStore 已有的 reactive Map 即可。
const fullInfo = computed<userFullInfo | undefined>(() => (myId.value ? profileStore.fullInfos.get(myId.value) : undefined));
const photos = computed<chatPhoto[]>(() => (myId.value ? profileStore.photos.get(myId.value) ?? [] : []));

const fullName = computed(() => [user.value?.first_name, user.value?.last_name].filter(Boolean).join(' ').trim() || t('editProfile.me'));
// =====================================================================
// 数据加载
// =====================================================================
async function loadAll() {
    if (!user.value) await userStore.fetchUser();
    if (myId.value > 0) {
        await Promise.all([
            profileStore.fetchFullInfo(myId.value),
            profileStore.fetchPhotos(myId.value),
        ]);
    }
    initEditors();
    // 确保 user 已加载后再获取电话号码格式
    if (myId.value > 0) {
        await loadPhoneDisplay();
    }
}

async function initEditors() {
    firstName.value = user.value?.first_name ?? '';
    lastName.value = user.value?.last_name ?? '';
    bio.value = fullInfo.value?.bio?.text ?? '';
    birthdatePickerValue.value = birthdateToPicker(birthdateInfo.value);
    hideYear.value = !!(birthdateInfo.value && birthdateInfo.value.year <= 0);
}

onMounted(() => {
    loadAll();
    loadBioMax();
});

async function onProfileChanged() {
    await Promise.all([userStore.fetchUser(), profileStore.refreshProfile(myId.value)]);
    initEditors();
    // 确保 user 已加载后再获取电话号码格式
    if (myId.value > 0) {
        await loadPhoneDisplay();
    }
}

function goBack() {
    router.back();
}

// =====================================================================
// 姓名
// =====================================================================
const firstName = ref('');
const lastName = ref('');
const savingProfile = ref(false);

async function saveProfile() {
    const name = firstName.value.trim();
    if (!name) {
        MessagePlugin.warning(t('editProfile.nameRequired'));
        return;
    }
    savingProfile.value = true;
    try {
        await tdlibSend({ _: 'setName', first_name: name, last_name: lastName.value.trim() });
        await tdlibSend({ _: 'setBio', bio: bio.value });
        MessagePlugin.success(t('editProfile.profileSaved'));
        await Promise.all([userStore.fetchUser(), profileStore.refreshProfile(myId.value)]);
        initEditors();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.saveFailed'));
    } finally {
        savingProfile.value = false;
    }
}

// =====================================================================
// 个人简介
// =====================================================================
const bio = ref('');
const bioMax = ref(70);

async function loadBioMax() {
    try {
        const res = (await tdlibSend({ _: 'getOption', name: 'bio_length_max' })) as { _: string; value?: number | string };
        if (res._ === 'optionValueInteger') bioMax.value = Number(res.value);
    } catch {
        bioMax.value = 70;
    }
}


// =====================================================================
// 用户名
// =====================================================================
const usernameVisible = ref(false);
const activeUsernames = computed<string[]>(() => user.value?.usernames?.active_usernames ?? []);
const disabledUsernames = computed<string[]>(() => user.value?.usernames?.disabled_usernames ?? []);
const primaryUsername = computed(() => activeUsernames.value[0] ?? '');

const usernameSummary = computed(() => {
    const parts: string[] = [];
    if (activeUsernames.value.length) parts.push(t('editProfile.usernameActiveCount', { count: activeUsernames.value.length }));
    if (disabledUsernames.value.length) parts.push(t('editProfile.usernameDisabledCount', { count: disabledUsernames.value.length }));
    return parts.join('，') || t('lng_settings_username_about');
});

function openUsernamePopup() {
    usernameVisible.value = true;
}

async function onUsernameChanged() {
    await userStore.fetchUser();
}
// =====================================================================
// 生日
// =====================================================================
const birthdateInfo = computed<birthdate | undefined>(() => fullInfo.value?.birthdate);
const birthdatePickerValue = ref('');
const hideYear = ref(false);
const birthdayEditing = ref(false);
const savingBirthdate = ref(false);

function toggleBirthdayEditing() {
    birthdayEditing.value = !birthdayEditing.value;
    if (birthdayEditing.value) {
        birthdatePickerValue.value = birthdateToPicker(birthdateInfo.value);
        hideYear.value = !!(birthdateInfo.value && birthdateInfo.value.year <= 0);
    }
}

function setHideYear(val: boolean) {
    hideYear.value = val;
    if (birthdatePickerValue.value) {
        saveBirthdate();
    }
}

const birthdateText = computed(() => {
    const b = birthdateInfo.value;
    if (!b) return '';
    const mm = String(b.month).padStart(2, '0');
    const dd = String(b.day).padStart(2, '0');
    if (b.year > 0) return `${b.year}-${mm}-${dd}`;
    return `${mm}-${dd}`;
});

function birthdateToPicker(b?: birthdate): string {
    if (!b) return '';
    const year = b.year > 0 ? b.year : 2000;
    return `${year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}

async function saveBirthdate(value?: string) {
    const v = value ?? birthdatePickerValue.value;
    if (!v) return;
    const [y, m, d] = v.split('-').map(Number);
    if (!m || !d) return;
    savingBirthdate.value = true;
    try {
        await tdlibSend({
            _: 'setBirthdate',
            birthdate: { _: 'birthdate', day: d, month: m, year: hideYear.value ? 0 : y || 0 },
        } as any);
        MessagePlugin.success(t('editProfile.birthdaySaved'));
        await profileStore.refreshProfile(myId.value);
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.saveFailed'));
    } finally {
        savingBirthdate.value = false;
    }
}

async function deleteBirthdate() {
    savingBirthdate.value = true;
    try {
        await tdlibSend({ _: 'setBirthdate', birthdate: null } as any);
        birthdatePickerValue.value = '';
        MessagePlugin.success(t('editProfile.birthdayDeleted'));
        await profileStore.refreshProfile(myId.value);
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.deleteFailed'));
    } finally {
        savingBirthdate.value = false;
    }
}

// =====================================================================
// 个人主页频道
// =====================================================================
const personalChatVisible = ref(false);
const personalChatId = computed(() => fullInfo.value?.personal_chat_id ?? 0);
const personalChat = computed<chat | undefined>(() => {
    const id = personalChatId.value;
    if (!id) return undefined;
    ensureChat(id).catch(() => { });
    return getReactiveChat(id);
});
const personalChatAccent = computed<number | undefined>(() => {
    const c = personalChat.value as any;
    return c?.profile_accent_color_id ?? c?.accent_color_id ?? undefined;
});

function openPersonalChatPopup() {
    personalChatVisible.value = true;
}

async function onPersonalChatChanged() {
    await profileStore.refreshProfile(myId.value);
}
// =====================================================================
// 营业时间
// =====================================================================
const businessHoursVisible = ref(false);

const businessHoursLines = computed(() => {
    const preview = formatBusinessHoursPreview(fullInfo.value?.business_info?.opening_hours);
    return preview ? [preview] : [];
});

function openBusinessHoursPopup() {
    if (!user.value?.is_premium) {
        const linkText = t('lng_todo_premium_link');
        const msg = t('lng_settings_generic_subscribe', { link: linkText });
        MessagePlugin.warning(msg);
        return;
    }
    businessHoursVisible.value = true;
}

async function onBusinessHoursChanged() {
    await profileStore.refreshProfile(myId.value);
}
// =====================================================================
// 位置 / 聊天机器人（未适配提示）
// =====================================================================
const locationVisible = ref(false);

function openLocationPopup() {
    if (!user.value?.is_premium) {
        const linkText = t('lng_todo_premium_link');
        const msg = t('lng_settings_generic_subscribe', { link: linkText });
        MessagePlugin.warning(msg);
        return;
    }
    locationVisible.value = true;
}

const chatbotVisible = ref(false);
const chatbotText = ref('');

const businessLocation = computed(() => fullInfo.value?.business_info?.location);

async function openChatbotPopup() {
    chatbotVisible.value = true;
    chatbotText.value = '';
    try {
        const info = (await tdlibSend({ _: 'getBusinessConnectedBot' })) as { bot?: { bot_user_id?: number } };
        const botId = info?.bot?.bot_user_id;
        if (botId) {
            await ensureUser(botId);
            const u = getReactiveUser(botId);
            chatbotText.value = u ? `@${u.usernames?.active_usernames?.[0] ?? (u.first_name + ' ' + u.last_name).trim()}` : String(botId);
        }
    } catch {
        chatbotText.value = '';
    }
}

// 同步 user 变化到编辑器
watch(user, () => initEditors());
watch(fullInfo, () => {
    bio.value = fullInfo.value?.bio?.text ?? '';
    birthdatePickerValue.value = birthdateToPicker(birthdateInfo.value);
    hideYear.value = !!(birthdateInfo.value && birthdateInfo.value.year <= 0);
});
</script>
