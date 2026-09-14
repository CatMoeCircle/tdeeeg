<template>
    <div
        class="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 rounded-tl-xl overflow-hidden">
        <div class="mt-3">
            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="openMyProfile">
                <div class="w-10 h-10" v-if="userProfile">
                    <avatar :photo="userProfile.profile_photo"
                        :title="userProfile.first_name + ' ' + userProfile.last_name"
                        :accentColorId="userProfile.profile_accent_color_id" />
                </div>

                <div v-else class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                <div class="ml-3">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        <GlobalEmojiText
                            :text="userProfile ? (userProfile.first_name + ' ' + userProfile.last_name) : t('lng_context_seen_loading')" />
                    </p>
                    <p class="text-xs text-gray-400">
                        {{ userStatusText }}
                    </p>
                    <p class="text-xs text-gray-500">
                        {{ userProfile ? ('@' + userProfile.usernames?.active_usernames[0]) : '' }} - id: {{ userProfile
                            ?
                            userProfile.id : '' }}
                    </p>
                </div>
            </div>
        </div>
        <!-- 音乐播放器入口（聊天打开时由 ChatDetail 接管） -->
        <MusicPlayerEntry v-if="!isChatOpen" compact />
        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <div class="py-2">
                <!-- 账户 -->
                <router-link to="/home/settings/edit-profile"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div class="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center mr-3">
                        <UserCogIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {{ t('lng_settings_information') }}</h3>
                        <p class="text-xs text-gray-500">{{ t('lng_settings_name_label') }}, {{ t('lng_settings_upload')
                            }},
                            {{ t('lng_settings_username') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <router-link to="/home/settings/appearance"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div
                        class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-3">
                        <PaletteIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('lng_edit_channel_color')
                            }}
                        </h3>
                        <p class="text-xs text-gray-500">{{ t('lng_settings_section_chat_settings') }}, {{
                            t('lng_settings_section_background') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <router-link to="/home/settings/notifications"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div class="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mr-3">
                        <BellIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {{ t('lng_settings_section_notify') }}</h3>
                        <p class="text-xs text-gray-500">{{ t('lng_settings_desktop_notify') }},
                            {{ t('lng_settings_notify_title') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <router-link to="/home/settings/privacy"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div
                        class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                        <ShieldIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {{ t('lng_settings_section_privacy') }}</h3>
                        <p class="text-xs text-gray-500">{{ t('lng_settings_password_title') }},
                            {{ t('lng_settings_blocked_users') }}, {{t('lng_settings_privacy_title')}}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <router-link to="/home/settings/download"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3">
                        <DatabaseIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{
                            t('lng_settings_data_storage') }}</h3>
                        <p class="text-xs text-gray-500">{{ t('lng_media_auto_settings') }},{{
                            t('lng_settings_manage_local_storage') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <router-link to="/home/settings/proxy"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div class="w-8 h-8 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center mr-3">
                        <NetworkIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {{ t('lng_settings_network_proxy') }}</h3>
                        <p class="text-xs text-gray-500">{{ t('lng_proxy_disable') }} ,{{ t('lng_proxy_add') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <router-link to="/home/settings/devices"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div
                        class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mr-3">
                        <LaptopIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {{ t('lng_url_auth_device_label') }}</h3>
                        <p class="text-xs text-gray-500">
                            {{ t('lng_settings_show_sessions') }},{{ t('lng_sessions_terminate') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <router-link to="/home/settings/language"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3">
                        <GlobeIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t("lng_settings_language")
                        }}</h3>
                        <p class="text-xs text-gray-500">{{ t('lng_language_name') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <!-- 系统设置（测试数据中心、自定义 API ID/Hash） -->
                <router-link to="/home/settings/system"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mr-3">
                        <SettingsIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('lng_settings_advanced')
                            }}
                        </h3>
                        <p class="text-xs text-gray-500">{{ t('settingsList.systemSubtitle') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <!-- 分界线：官方群组入口 -->
                <div class="my-2 border-t border-gray-200 dark:border-gray-800"></div>

                <div @click="openOfficialGroup"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                    <div class="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mr-3">
                        <SendIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('settingsList.officialGroup') }}</h3>
                        <p class="text-xs text-gray-500">@xiaoqvan_chat</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </div>

                <!-- 开发者选项设置入口（连点版本号 5 次解锁后显示） -->
                <router-link v-if="debugMode" to="/home/settings/debug"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center mr-3">
                        <TerminalSquareIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('settingsList.devOptions') }}</h3>
                        <p class="text-xs text-gray-500">{{ t('settingsList.devOptionsDesc') }}</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <!-- 版本信息（连点 5 次打开/关闭开发者选项） -->
                <div class="flex items-center justify-center gap-2 px-4 pt-3 pb-4">
                    <p class="text-xs text-gray-400 leading-5 select-text cursor-pointer whitespace-nowrap"
                        :title="debugMode ? t('settingsList.devOnHint') : t('settingsList.devOffHint')"
                        @click="onVersionClick">
                        {{ appName }} v{{ appVersion }}
                    </p>
                    <span class="text-gray-300 dark:text-gray-600">|</span>
                    <p class="text-xs text-gray-400 leading-5 select-text whitespace-nowrap">
                        TDLib {{ tdlibVersion }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { PaletteIcon, ChevronRightIcon, GlobeIcon, DatabaseIcon, NetworkIcon, SendIcon, TerminalSquare as TerminalSquareIcon, Settings as SettingsIcon, UserCog as UserCogIcon, Shield as ShieldIcon, Laptop as LaptopIcon, Bell as BellIcon } from 'lucide-vue-next';
import avatar from './avatar.vue';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';
import { useUserStore } from '../../store/user';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { computed, ref, onMounted } from 'vue';
import MusicPlayerEntry from './../audio/MusicPlayerEntry.vue';
import formatStatus from '../../utils/status';
import { tdlibSend } from '../../utils/tdlib';
import { resolveInternalLink } from '../../utils/openInternalLink';
import { getVersion } from '@tauri-apps/api/app';
import packageInfo from '../../../package.json';
import { debugMode, setDebugMode, setLogUpdates } from '../../store/debug';
import { useI18n } from 'vue-i18n';

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const router = useRouter();
const { t } = useI18n();

/** 点击自己的头像/名字 → 打开自己的个人资料页 */
function openMyProfile() {
    if (!userProfile.value) return;
    router.push({ name: 'user-profile', params: { id: String(userProfile.value.id) } });
}

/** TDEEEG 官方群组用户名 */
const OFFICIAL_GROUP_USERNAME = 'xiaoqvan_chat';

/** 跳转到官方群组：与「消息中点击 @ 用户名」完全一致的逻辑（t.me 链接 → resolveInternalLink） */
async function openOfficialGroup() {
    try {
        await resolveInternalLink(`https://t.me/${OFFICIAL_GROUP_USERNAME}`, router);
    } catch (e) {
        console.warn('openOfficialGroup failed:', e);
    }
}

const route = useRoute();
const isChatOpen = computed(() => /^\/home\/chat\/\d+/.test(route.path));

/** 用户状态显示文本：优先用 formatStatus 显示上次在线时间，无数据时显示离线 */
const userStatusText = computed(() => {
    if (!userProfile.value) return t('lng_context_seen_loading');
    const status = userProfile.value.status;
    if (!status) return t('settingsList.offline');
    return formatStatus(status);
});

/** 应用名称与版本号 */
const appName = packageInfo.name ?? 'tdeeeg';
const appVersion = ref(packageInfo.version ?? '');
const tdlibVersion = ref('...');

/** 获取客户端版本号（优先从 Tauri 动态获取，失败时回退到 package.json 编译期版本） */
async function loadAppVersion() {
    try {
        appVersion.value = await getVersion();
    } catch {
        // 非 Tauri 环境（如纯 Web 预览）时回退到编译期写死的版本
        appVersion.value = packageInfo.version ?? '';
    }
}

/** 从 TDLib 返回的 option 中获取版本号 */
async function loadTdlibVersion() {
    try {
        const res = await tdlibSend({ _: 'getOption', name: 'version' });
        if (res && res._ === 'optionValueString') {
            tdlibVersion.value = res.value;
        }
    } catch {
        tdlibVersion.value = t('settingsList.notConnected');
    }
}

onMounted(() => {
    loadAppVersion();
    loadTdlibVersion();
});

/** 连点版本号 5 次打开/关闭开发者选项（防止误触，2s 窗口内不连点则归零） */
const VERSION_CLICK_THRESHOLD = 5;
const VERSION_CLICK_WINDOW_MS = 2000;
let versionClickCount = 0;
let versionClickTimer: ReturnType<typeof setTimeout> | null = null;

function onVersionClick() {
    versionClickCount++;
    if (versionClickTimer) clearTimeout(versionClickTimer);
    versionClickTimer = setTimeout(() => {
        versionClickCount = 0;
    }, VERSION_CLICK_WINDOW_MS);
    if (versionClickCount < VERSION_CLICK_THRESHOLD) return;
    // 达到阈值，重置计数并切换调试模式
    versionClickCount = 0;
    if (versionClickTimer) { clearTimeout(versionClickTimer); versionClickTimer = null; }
    setDebugMode(!debugMode.value);
    if (!debugMode.value) {
        setLogUpdates(false);
    }
}
</script>
