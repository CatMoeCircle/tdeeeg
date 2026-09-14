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
                                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ t('editProfile.hideYear') }}</span>
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
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <ClockIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p v-if="businessHoursLines.length" class="text-sm text-gray-800 dark:text-gray-100">{{
                                    businessHoursLines[0] }}</p>
                                <p v-else class="text-sm text-gray-400">{{ t('lng_settings_empty_bio') }}</p>
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
                            t('lng_location_title') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                        <button type="button" @click="locationVisible = true"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <MapPinIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{
                                    businessLocation?.address ||
                                    t('lng_settings_empty_bio') }}</p>
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
        <ModalDialog v-model="phoneVisible" :title="t('lng_info_mobile_label')">
            <div class="flex flex-col items-center text-center py-6 gap-3">
                <div
                    class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <PhoneIcon class="w-7 h-7" />
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {{ t('editProfile.phoneChangeTitle') }}<br />{{ t('editProfile.phoneChangeBody') }}
                </p>
                <button type="button" @click="phoneVisible = false"
                    class="mt-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                    {{ t('lng_stars_rating_understood') }}
                </button>
            </div>
        </ModalDialog>

        <!-- 用户名弹窗 -->
        <ModalDialog v-model="usernameVisible" :title="t('lng_settings_username_label')">
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

        <!-- 个人主页频道弹窗 -->
        <ModalDialog v-model="personalChatVisible" :title="t('editProfile.personalChatTitle')">
            <div class="space-y-2">
                <p class="text-xs text-gray-400 mb-2">{{ t('editProfile.personalChatPick') }}</p>
                <button type="button" @click="removePersonalChat"
                    class="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div
                        class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        <BanIcon class="w-4.5 h-4.5 text-gray-400" />
                    </div>
                    <span class="text-sm text-gray-700 dark:text-gray-200">{{ t('editProfile.personalChatRemove') }}</span>
                </button>
                <p v-if="suitableChatsLoading" class="text-sm text-gray-400 py-4 text-center">{{ t('editProfile.loadingChannels') }}</p>
                <p v-else-if="suitableChats.length === 0" class="text-sm text-gray-400 py-4 text-center">{{ t('editProfile.noChannels') }}</p>
                <template v-else>
                    <button v-for="c in suitableChats" :key="c.chat_id" type="button"
                        @click="setPersonalChat(c.chat_id)"
                        class="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        :class="c.chat_id === personalChatId ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''">
                        <div class="w-9 h-9 shrink-0">
                            <Avatar :photo="c.photo" :title="c.title" :accentColorId="c.accentId"
                                sizeClass="!w-9 !h-9" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{{ c.title }}</p>

                        </div>
                        <CheckIcon v-if="c.chat_id === personalChatId" class="w-4 h-4 text-blue-500 shrink-0" />
                    </button>
                </template>
            </div>
        </ModalDialog>

        <!-- 营业时间弹窗 -->
        <ModalDialog v-model="businessHoursVisible" :title="t('lng_hours_title')">
            <div class="space-y-4">
                <!-- 显示营业时间开关 -->
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_hours_show') }}</span>
                    <button type="button" role="switch" :aria-checked="hoursEnabled" @click="toggleHoursEnabled"
                        class="relative w-11 h-6 rounded-full transition-colors duration-200"
                        :class="hoursEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                        <span
                            class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                            :class="hoursEnabled ? 'translate-x-5' : 'translate-x-0'" />
                    </button>
                </div>

                <template v-if="hoursEnabled">
                    <!-- 时区选择（可搜索下拉） -->
                    <div class="relative" ref="tzDropdownRef">
                        <label class="text-xs text-gray-400">{{ t('lng_hours_time_zone') }}</label>
                        <button type="button" @click="tzDropdownOpen = !tzDropdownOpen"
                            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                            <span class="truncate text-gray-800 dark:text-gray-100">{{ selectedTimeZoneLabel }}</span>
                            <svg class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
                                :class="tzDropdownOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24"
                                stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        <transition enter-active-class="transition ease-out duration-100"
                            enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
                            leave-active-class="transition ease-in duration-75" leave-from-class="opacity-100 scale-100"
                            leave-to-class="opacity-0 scale-95">
                            <div v-if="tzDropdownOpen"
                                class="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden">
                                <!-- 搜索框 -->
                                <div class="p-2 border-b border-gray-100 dark:border-gray-700">
                                    <div class="relative">
                                        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input v-model="tzSearch" ref="tzSearchRef" type="text"
                                            :placeholder="t('lng_participant_filter')" spellcheck="false"
                                            class="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                    </div>
                                </div>
                                <!-- 时区列表 -->
                                <ul class="max-h-52 overflow-y-auto custom-scrollbar">
                                    <li v-for="tz in filteredTimeZones" :key="tz.id">
                                        <button type="button"
                                            class="w-full px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-colors"
                                            :class="tz.id === timeZoneInput
                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50'"
                                            @click="selectTimeZone(tz.id)">
                                            <span class="truncate">{{ tz.name }}</span>
                                            <span class="text-xs shrink-0" :class="tz.id === timeZoneInput
                                                ? 'text-blue-500 dark:text-blue-400'
                                                : 'text-gray-400'">UTC{{ formatUtcOffsetWithSign(tz.utc_time_offset)
                                                }}</span>
                                        </button>
                                    </li>
                                    <li v-if="filteredTimeZones.length === 0"
                                        class="px-3 py-4 text-sm text-gray-400 text-center">
                                        {{ t('lng_settings_empty_bio') }}
                                    </li>
                                </ul>
                            </div>
                        </transition>
                    </div>

                    <!-- 每天的营业时段 -->
                    <div class="space-y-2">
                        <div v-for="(d, dayIndex) in days" :key="dayIndex"
                            class="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                            <div class="flex items-center gap-3">
                                <!-- 胶囊开关 -->
                                <button type="button" role="switch" :aria-checked="d.enabled"
                                    @click="d.enabled = !d.enabled"
                                    class="relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0"
                                    :class="d.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                    <span
                                        class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                                        :class="d.enabled ? 'translate-x-4' : 'translate-x-0'" />
                                </button>
                                <span class="text-sm text-gray-800 dark:text-gray-100 w-max shrink-0">{{ d.name
                                    }}</span>
                            </div>
                            <template v-if="d.enabled">
                                <div v-for="(iv, ivIdx) in d.intervals" :key="ivIdx"
                                    class="flex items-center gap-2 mt-2 ml-13">
                                    <TTimePicker v-model="iv.start" format="HH:mm"
                                        :placeholder="t('lng_auction_starts_label')" class="flex-1 min-w-0" />
                                    <span class="text-gray-400 text-xs">-</span>
                                    <TTimePicker v-model="iv.end" format="HH:mm"
                                        :placeholder="t('lng_auction_end_label')" class="flex-1 min-w-0" />
                                    <button v-if="d.intervals.length > 1" type="button"
                                        @click="removeInterval(dayIndex, ivIdx)"
                                        class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                            stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <button v-if="d.intervals.length < 4 && totalIntervals < 28" type="button"
                                    @click="addInterval(dayIndex)"
                                    class="mt-2 ml-13 px-3 py-1 rounded-lg text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                    {{ t('lng_hours_add_button') }}
                                </button>
                            </template>
                        </div>
                    </div>
                </template>

                <div class="flex justify-end gap-2">
                    <button type="button" @click="saveBusinessHours" :disabled="savingHours"
                        class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
                        {{ savingHours ? t('editProfile.saving') : t('lng_settings_save') }}
                    </button>
                </div>
                <p v-if="hoursError" class="text-xs text-red-500">{{ hoursError }}</p>
            </div>
        </ModalDialog>

        <!-- 位置弹窗 -->
        <ModalDialog v-model="locationVisible" :title="t('lng_maps_point')">
            <div class="flex flex-col items-center text-center py-6 gap-3">
                <div
                    class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <MapPinIcon class="w-7 h-7" />
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {{ t('lng_location_fallback') }}
                </p>
                <button type="button" @click="locationVisible = false"
                    class="mt-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                    {{ t('lng_stars_rating_understood') }}
                </button>
            </div>
        </ModalDialog>

        <!-- 聊天机器人弹窗 -->
        <ModalDialog v-model="chatbotVisible" :title="t('editProfile.chatbotTitle')">
            <div class="flex flex-col items-center text-center py-6 gap-3">
                <div
                    class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <BotIcon class="w-7 h-7" />
                </div>
                <p v-if="chatbotText" class="text-sm text-gray-700 dark:text-gray-300">
                    {{ t('editProfile.chatbotConnected', { name: chatbotText }) }}
                </p>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {{ t('editProfile.chatbotNotSupported') }}<br />{{ t('editProfile.chatbotUseOfficial') }}
                </p>
                <button type="button" @click="chatbotVisible = false"
                    class="mt-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                    {{ t('lng_stars_rating_understood') }}
                </button>
            </div>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
    ArrowUp as ArrowUpIcon, ArrowDown as ArrowDownIcon,
    AtSign as AtSignIcon, Bot as BotIcon, Ban as BanIcon, Calendar as CalendarIcon,
    ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Check as CheckIcon, Clock as ClockIcon,
    MapPin as MapPinIcon, Megaphone as MegaphoneIcon, Phone as PhoneIcon,
} from 'lucide-vue-next';
import { DatePicker as TDatePicker, TimePicker as TTimePicker, MessagePlugin } from 'tdesign-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import AvatarEditorDialog from '../../components/settings/AvatarEditorDialog.vue';
import ModalDialog from '../../components/settings/ModalDialog.vue';
import { useUserStore } from '../../store/user';
import { useUserProfileStore } from '../../store/userProfile';
import { tdlibSend } from '../../utils/tdlib';
import { ensureChat, getReactiveChat, getReactiveUser, ensureUser } from '../../utils/senderInfo';
import { formatBusinessHours } from '../../utils/businessHours';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { useI18n } from 'vue-i18n';
import { tdHtml } from '../../utils/tdLang';

import type { user as TdUser, userFullInfo, chatPhoto, chat, businessOpeningHoursInterval, birthdate } from 'tdlib-types';

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
    usernameInput.value = user.value?.usernames?.editable_username ?? '';
    birthdatePickerValue.value = birthdateToPicker(birthdateInfo.value);
    hideYear.value = !!(birthdateInfo.value && birthdateInfo.value.year <= 0);
}

onMounted(() => {
    loadAll();
    loadBioMax();
    document.addEventListener('mousedown', onTzDropdownClickOutside);
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
const usernameInput = ref('');
const usernameCheck = ref<'' | 'checking' | 'ok' | 'occupied' | 'invalid' | 'error'>('');
const savingUsername = ref(false);
const editableUsername = computed(() => user.value?.usernames?.editable_username ?? '');
const activeUsernames = computed<string[]>(() => user.value?.usernames?.active_usernames ?? []);
const disabledUsernames = computed<string[]>(() => user.value?.usernames?.disabled_usernames ?? []);
const primaryUsername = computed(() => activeUsernames.value[0] ?? '');

const managedUsernames = computed(() => {
    const active = (user.value?.usernames?.active_usernames ?? []).map((u, i) => ({ name: u, isActive: true, activeIndex: i }));
    const disabled = (user.value?.usernames?.disabled_usernames ?? []).map((u) => ({ name: u, isActive: false, activeIndex: -1 }));
    return [...active, ...disabled];
});
const usernameSummary = computed(() => {
    const parts: string[] = [];
    if (activeUsernames.value.length) parts.push(t('editProfile.usernameActiveCount', { count: activeUsernames.value.length }));
    if (disabledUsernames.value.length) parts.push(t('editProfile.usernameDisabledCount', { count: disabledUsernames.value.length }));
    return parts.join('，') || t('lng_settings_username_about');
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

function openUsernamePopup() {
    usernameInput.value = editableUsername.value;
    usernameCheck.value = '';
    usernameVisible.value = true;
}

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
        await userStore.fetchUser();
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
        await userStore.fetchUser();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.reorderFailed'));
    }
}

async function toggleUsername(name: string, isActive: boolean) {
    try {
        await tdlibSend({ _: 'toggleUsernameIsActive', username: name, is_active: isActive } as any);
        await userStore.fetchUser();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.actionFailed'));
    }
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

const suitableChats = ref<{ chat_id: number; title: string; username: string; photo?: any; accentId?: number }[]>([]);
const suitableChatsLoading = ref(false);

async function openPersonalChatPopup() {
    personalChatVisible.value = true;
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
        await profileStore.refreshProfile(myId.value);
        personalChatVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.setFailed'));
    }
}

async function removePersonalChat() {
    try {
        await tdlibSend({ _: 'setPersonalChat', chat_id: 0 } as any);
        MessagePlugin.success(t('editProfile.personalChatRemoved'));
        await profileStore.refreshProfile(myId.value);
        personalChatVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('editProfile.removeFailed'));
    }
}
// =====================================================================
// 营业时间
// =====================================================================
const businessHoursVisible = ref(false);
const timeZoneInput = ref('');
const savingHours = ref(false);
const hoursError = ref('');
const hoursEnabled = ref(true);
const days = ref<{ name: string; enabled: boolean; intervals: { start: string; end: string }[] }[]>([]);

const totalIntervals = computed(() => days.value.reduce((sum, d) => sum + (d.enabled ? d.intervals.length : 0), 0));

function addInterval(dayIndex: number) {
    const d = days.value[dayIndex];
    if (d.intervals.length < 4 && totalIntervals.value < 28) {
        d.intervals.push({ start: '09:00', end: '17:00' });
    }
}

function removeInterval(dayIndex: number, ivIndex: number) {
    const d = days.value[dayIndex];
    if (d.intervals.length > 1) {
        d.intervals.splice(ivIndex, 1);
    }
}

// 时区列表
const timeZoneOptions = ref<{ id: string; name: string; utc_time_offset: number }[]>([]);
let timeZonesLoaded = false;

// 可搜索下拉状态
const tzDropdownOpen = ref(false);
const tzSearch = ref('');
const tzDropdownRef = ref<HTMLElement | null>(null);
const tzSearchRef = ref<HTMLInputElement | null>(null);

const filteredTimeZones = computed(() => {
    const q = tzSearch.value.trim().toLowerCase();
    if (!q) return timeZoneOptions.value;
    return timeZoneOptions.value.filter((tz) =>
        tz.name.toLowerCase().includes(q) || tz.id.toLowerCase().includes(q)
    );
});

const selectedTimeZoneLabel = computed(() => {
    const tz = timeZoneOptions.value.find((t) => t.id === timeZoneInput.value);
    if (tz) return `${tz.name} (UTC${formatUtcOffsetWithSign(tz.utc_time_offset)})`;
    return timeZoneInput.value || t('editProfile.selectTimeZone');
});

function selectTimeZone(id: string) {
    timeZoneInput.value = id;
    tzDropdownOpen.value = false;
    tzSearch.value = '';
}

// 点击外部关闭下拉
function onTzDropdownClickOutside(e: MouseEvent) {
    if (tzDropdownRef.value && !tzDropdownRef.value.contains(e.target as Node)) {
        tzDropdownOpen.value = false;
        tzSearch.value = '';
    }
}

// 下拉打开时自动聚焦搜索框
watch(tzDropdownOpen, (open) => {
    if (open) {
        nextTick(() => tzSearchRef.value?.focus());
    }
});

onUnmounted(() => {
    document.removeEventListener('mousedown', onTzDropdownClickOutside);
});

async function loadTimeZones() {
    if (timeZonesLoaded) return;
    try {
        const res = (await tdlibSend({ _: 'getTimeZones' })) as { time_zones?: { id: string; name: string; utc_time_offset: number }[] };
        timeZoneOptions.value = res.time_zones ?? [];
        timeZonesLoaded = true;
    } catch {
        // 兜底：使用当前系统时区（getTimezoneOffset 返回分钟，TDLib 用秒）
        timeZoneOptions.value = [{ id: Intl.DateTimeFormat().resolvedOptions().timeZone, name: 'Local', utc_time_offset: -(new Date().getTimezoneOffset()) * 60 }];
    }
}

function formatUtcOffset(offsetSeconds: number): string {
    const abs = Math.abs(offsetSeconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatUtcOffsetWithSign(offsetSeconds: number): string {
    return `${offsetSeconds >= 0 ? '+' : '-'}${formatUtcOffset(offsetSeconds)}`;
}

const businessHoursLines = computed(() => formatBusinessHours(fullInfo.value?.business_info?.opening_hours));

function openBusinessHoursPopup() {
    if (!user.value?.is_premium) {
        const linkText = t('lng_todo_premium_link');
        const msg = t('lng_settings_generic_subscribe', { link: linkText });
        MessagePlugin.warning(msg);
        return;
    }
    loadTimeZones();
    const hours = fullInfo.value?.business_info?.opening_hours;
    const hasIntervals = !!hours?.opening_hours?.length;
    hoursEnabled.value = hasIntervals;
    timeZoneInput.value = hours?.time_zone_id || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const list = hours?.opening_hours ?? [];
    const names = [t('lng_hours_monday'), t('lng_hours_tuesday'), t('lng_hours_wednesday'), t('lng_hours_thursday'), t('lng_hours_friday'), t('lng_hours_saturday'), t('lng_hours_sunday')];
    days.value = names.map((name, i) => {
        const dayIntervals = list.filter((iv) => Math.floor(iv.start_minute / (24 * 60)) % 7 === i);
        if (dayIntervals.length === 0) {
            return { name, enabled: false, intervals: [{ start: '09:00', end: '17:00' }] };
        }
        return {
            name,
            enabled: true,
            intervals: dayIntervals.map((iv) => ({
                start: minutesToHM(iv.start_minute),
                end: minutesToHM(iv.end_minute),
            })),
        };
    });
    hoursError.value = '';
    businessHoursVisible.value = true;
}

function toggleHoursEnabled() {
    hoursEnabled.value = !hoursEnabled.value;
}

function minutesToHM(minute: number): string {
    const total = minute % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildIntervals(): businessOpeningHoursInterval[] {
    const intervals: businessOpeningHoursInterval[] = [];
    for (let i = 0; i < days.value.length; i++) {
        const d = days.value[i];
        if (!d.enabled) continue;
        for (const iv of d.intervals) {
            const [sh, sm] = iv.start.split(':').map(Number);
            const [eh, em] = iv.end.split(':').map(Number);
            let start = i * 1440 + sh * 60 + sm;
            let end = i * 1440 + eh * 60 + em;
            if (end <= start) end += 1440; // 跨天
            intervals.push({ _: 'businessOpeningHoursInterval', start_minute: start, end_minute: end });
        }
    }
    return intervals;
}

async function saveBusinessHours() {
    hoursError.value = '';
    const tz = timeZoneInput.value.trim();
    if (!tz) {
        hoursError.value = t('editProfile.timezoneRequired');
        return;
    }
    const intervals = hoursEnabled.value ? buildIntervals() : [];
    savingHours.value = true;
    try {
        await tdlibSend({
            _: 'setBusinessOpeningHours',
            opening_hours: {
                _: 'businessOpeningHours',
                time_zone_id: tz,
                opening_hours: intervals,
            },
        } as any);
        MessagePlugin.success(hoursEnabled.value ? t('editProfile.hoursSaved') : t('editProfile.hoursDisabled'));
        await profileStore.refreshProfile(myId.value);
        businessHoursVisible.value = false;
    } catch (e: any) {
        hoursError.value = e?.message || t('editProfile.saveFailed');
    } finally {
        savingHours.value = false;
    }
}
// =====================================================================
// 位置 / 聊天机器人（未适配提示）
// =====================================================================
const locationVisible = ref(false);
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
