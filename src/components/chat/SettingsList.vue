<template>
    <!-- 与 ChatList 同级侧栏容器：透明底让壁纸透出（右缘分隔由 ResizableLayout 提供） -->
    <div class="flex flex-col h-full pt-1.5">
        <!-- 资料入口：磨砂圆角卡片，hover 提升与对话列表一致 -->
        <div class="px-2.5 pb-1.5">
            <button type="button"
                class="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-2xl text-left transition-all duration-150 hover:bg-white/70 dark:hover:bg-gray-800/70 hover:shadow-(--box-shadow) active:scale-[0.985]"
                @click="openMyProfile">
                <div class="w-12 h-12 shrink-0">
                    <avatar v-if="userProfile" :photo="userProfile.profile_photo"
                        :title="userProfile.first_name + ' ' + userProfile.last_name"
                        :accentColorId="userProfile.profile_accent_color_id" />
                    <div v-else class="w-full h-full rounded-full bg-gray-200/80 dark:bg-gray-700/80 animate-pulse"></div>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        <GlobalEmojiText
                            :text="userProfile ? (userProfile.first_name + ' ' + userProfile.last_name) : t('lng_context_seen_loading')" />
                    </p>
                    <p class="text-xs truncate" :class="isOnline
                        ? 'text-blue-500 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400'">
                        {{ userStatusText }}
                    </p>
                    <p v-if="activeUsername" class="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        @{{ activeUsername }}
                    </p>
                </div>
                <ChevronRightIcon class="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
            </button>
        </div>

        <!-- 音乐播放器入口（聊天面板打开时由 ChatDetail 接管，此处隐藏） -->
        <div v-if="!chatPaneVisible" class="pb-1.5">
            <MusicPlayerEntry compact />
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar px-2.5 pb-3 space-y-1.5" v-smooth-wheel>
            <!-- 分组卡片：圆角 + 轻磨砂 + 细分隔，与设置详情页卡片同语言 -->
            <div v-for="group in menuGroups" :key="group.key"
                class="rounded-2xl overflow-hidden bg-white/55 dark:bg-gray-800/45 backdrop-blur-md border border-white/50 dark:border-gray-700/40">
                <template v-for="item in group.items" :key="item.key">
                    <!-- 路由项 -->
                    <router-link v-if="item.to" :to="item.to"
                        class="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/80 dark:hover:bg-gray-800/80"
                        :class="isItemActive(item.to) ? 'bg-blue-50/70 dark:bg-blue-500/10' : ''">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                            :class="isItemActive(item.to)
                                ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                                : item.tile">
                            <component :is="item.icon" class="w-[18px] h-[18px]" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {{ item.title }}
                            </h3>
                            <p v-if="item.subtitle"
                                class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {{ item.subtitle }}
                            </p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                    </router-link>
                    <!-- 动作项（无路由） -->
                    <div v-else
                        class="flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer hover:bg-white/80 dark:hover:bg-gray-800/80"
                        @click="item.onClick">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                            :class="item.tile">
                            <component :is="item.icon" class="w-[18px] h-[18px]" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {{ item.title }}
                            </h3>
                            <p v-if="item.subtitle"
                                class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {{ item.subtitle }}
                            </p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                    </div>
                </template>
            </div>

            <!-- 版本信息（连点 5 次打开/关闭开发者选项） -->
            <div class="flex items-center justify-center gap-2 pt-3 pb-2">
                <p class="text-[11px] text-gray-400 dark:text-gray-500 leading-5 select-text cursor-pointer whitespace-nowrap"
                    :class="debugMode ? 'text-blue-500/80 dark:text-blue-400/80' : ''"
                    :title="debugMode ? t('settingsList.devOnHint') : t('settingsList.devOffHint')"
                    @click="onVersionClick">
                    {{ appName }} v{{ appVersion }}
                </p>
                <span class="text-gray-300 dark:text-gray-600 text-[11px]">|</span>
                <p class="text-[11px] text-gray-400 dark:text-gray-500 leading-5 select-text whitespace-nowrap">
                    TDLib {{ tdlibVersion }}
                </p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    PaletteIcon, ChevronRightIcon, GlobeIcon, DatabaseIcon, NetworkIcon, SendIcon,
    TerminalSquare as TerminalSquareIcon, Settings as SettingsIcon, UserCog as UserCogIcon,
    Shield as ShieldIcon, Laptop as LaptopIcon, Bell as BellIcon, Languages as LanguagesIcon,
} from 'lucide-vue-next';
import type { Component } from 'vue';
import avatar from './avatar.vue';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';
import { useUserStore } from '../../store/user';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { computed, ref, onMounted } from 'vue';
import MusicPlayerEntry from './../audio/MusicPlayerEntry.vue';
import { chatPaneVisible } from '../../store/chatPane';
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
const route = useRoute();
const { t } = useI18n();

/** 点击自己的头像/名字 → 打开自己的个人资料页 */
function openMyProfile() {
    if (!userProfile.value) return;
    router.push({ name: 'user-profile', params: { id: String(userProfile.value.id) } });
}

/** TDEEEG 官方群组用户名 */
const OFFICIAL_GROUP_USERNAME = 'CatMoeCircle_Group';

/** 跳转到官方群组：与「消息中点击 @ 用户名」完全一致的逻辑（t.me 链接 → resolveInternalLink） */
async function openOfficialGroup() {
    try {
        await resolveInternalLink(`https://t.me/${OFFICIAL_GROUP_USERNAME}`, router);
    } catch (e) {
        console.warn('openOfficialGroup failed:', e);
    }
}

/** 用户状态显示文本：机器人显示「bot」，其余用 formatStatus 显示上次在线时间 */
const userStatusText = computed(() => {
    if (!userProfile.value) return t('lng_context_seen_loading');
    return formatStatus(userProfile.value);
});

/** 在线时状态文案高亮为品牌蓝 */
const isOnline = computed(() => userProfile.value?.status?._ === 'userStatusOnline');

/** 主用户名（无则不显示） */
const activeUsername = computed(() => userProfile.value?.usernames?.active_usernames?.[0] ?? '');

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

/** 当前路由是否命中该项（详情子路径也算激活） */
function isItemActive(to?: string) {
    if (!to) return false;
    return route.path === to || route.path.startsWith(to + '/');
}

interface SettingsMenuItem {
    key: string;
    to?: string;
    onClick?: () => void;
    icon: Component;
    /** 图标瓷片底色（未激活态） */
    tile: string;
    title: string;
    subtitle?: string;
}

interface SettingsMenuGroup {
    key: string;
    items: SettingsMenuItem[];
}

/**
 * 设置入口分组。
 * 图标瓷片配色与 UserProfile 动作块 / 设置详情入口一致，明暗两套。
 */
const menuGroups = computed<SettingsMenuGroup[]>(() => {
    const groups: SettingsMenuGroup[] = [
        {
            key: 'account',
            items: [{
                key: 'edit-profile',
                to: '/home/settings/edit-profile',
                icon: UserCogIcon,
                tile: 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400',
                title: t('lng_settings_information'),
                subtitle: `${t('lng_settings_name_label')}, ${t('lng_settings_upload')}, ${t('lng_username_title')}`,
            }],
        },
        {
            key: 'experience',
            items: [
                {
                    key: 'appearance',
                    to: '/home/settings/appearance',
                    icon: PaletteIcon,
                    tile: 'bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
                    title: t('lng_edit_channel_color'),
                    subtitle: `${t('lng_settings_section_chat_settings')}, ${t('lng_settings_section_background')}`,
                },
                {
                    key: 'notifications',
                    to: '/home/settings/notifications',
                    icon: BellIcon,
                    tile: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
                    title: t('lng_settings_section_notify'),
                    subtitle: `${t('lng_settings_desktop_notify')}, ${t('lng_settings_notify_title')}`,
                },
            ],
        },
        {
            key: 'privacy',
            items: [
                {
                    key: 'privacy',
                    to: '/home/settings/privacy',
                    icon: ShieldIcon,
                    tile: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
                    title: t('lng_settings_section_privacy'),
                    subtitle: `${t('lng_settings_password_title')}, ${t('lng_settings_blocked_users')}, ${t('lng_settings_privacy_title')}`,
                },
                {
                    key: 'download',
                    to: '/home/settings/download',
                    icon: DatabaseIcon,
                    tile: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400',
                    title: t('lng_settings_data_storage'),
                    subtitle: `${t('lng_media_auto_settings')}, ${t('lng_settings_manage_local_storage')}`,
                },
                {
                    key: 'devices',
                    to: '/home/settings/devices',
                    icon: LaptopIcon,
                    tile: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
                    title: t('lng_url_auth_device_label'),
                    subtitle: `${t('lng_settings_show_sessions')}, ${t('lng_sessions_terminate')}`,
                },
            ],
        },
        {
            key: 'general',
            items: [
                {
                    key: 'proxy',
                    to: '/home/settings/proxy',
                    icon: NetworkIcon,
                    tile: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
                    title: t('lng_settings_network_proxy'),
                    subtitle: `${t('lng_proxy_disable')}, ${t('lng_proxy_add')}`,
                },
                {
                    key: 'language',
                    to: '/home/settings/language',
                    icon: GlobeIcon,
                    tile: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
                    title: t('lng_settings_language'),
                    subtitle: t('lng_language_name'),
                },
                {
                    key: 'translate',
                    to: '/home/settings/translate',
                    icon: LanguagesIcon,
                    tile: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
                    title: t('translateSettings.title'),
                    subtitle: t('translateSettings.listSubtitle'),
                },
                {
                    key: 'system',
                    to: '/home/settings/system',
                    icon: SettingsIcon,
                    tile: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400',
                    title: t('lng_settings_advanced'),
                    subtitle: t('settingsList.systemSubtitle'),
                },
            ],
        },
        {
            key: 'more',
            items: [
                {
                    key: 'official-group',
                    onClick: openOfficialGroup,
                    icon: SendIcon,
                    tile: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
                    title: t('settingsList.officialGroup'),
                    subtitle: `@${OFFICIAL_GROUP_USERNAME}`,
                },
            ],
        },
    ];

    // 开发者选项（连点版本号 5 次解锁后显示）
    if (debugMode.value) {
        groups.push({
            key: 'debug',
            items: [{
                key: 'debug',
                to: '/home/settings/debug',
                icon: TerminalSquareIcon,
                tile: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400',
                title: t('settingsList.devOptions'),
                subtitle: t('settingsList.devOptionsDesc'),
            }],
        });
    }

    return groups;
});
</script>
