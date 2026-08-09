<template>
    <div class="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 rounded-tl-xl overflow-hidden">
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
                        <GlobalEmojiText :text="userProfile ? (userProfile.first_name + ' ' + userProfile.last_name) : '加载中...'" />
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
                <router-link to="/home/settings/appearance"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    active-class="bg-blue-50 dark:bg-gray-800 text-blue-600">
                    <div
                        class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-3">
                        <PaletteIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">外观</h3>
                        <p class="text-xs text-gray-500">主题, 字体, 聊天背景</p>
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
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">数据和存储</h3>
                        <p class="text-xs text-gray-500">自动下载, 存储管理</p>
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
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">代理</h3>
                        <p class="text-xs text-gray-500">禁用、系统或自定义代理</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>

                <div
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-not-allowed opacity-60">
                    <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3">
                        <GlobeIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">语言</h3>
                        <p class="text-xs text-gray-500">中文, English</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </div>

                <!-- 分界线：官方群组入口 -->
                <div class="my-2 border-t border-gray-200 dark:border-gray-800"></div>

                <div @click="openOfficialGroup"
                    class="flex items-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                    <div class="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mr-3">
                        <SendIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">TDEEEG 官方群组</h3>
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
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">开发者选项</h3>
                        <p class="text-xs text-gray-500">发送 TDLib 方法, 更新日志, 开发者工具</p>
                    </div>
                    <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                </router-link>
            </div>
        </div>
        <!-- 版本信息（连点 5 次打开/关闭开发者选项） -->
        <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
            <p class="text-xs text-gray-400 leading-5 select-text cursor-pointer"
                :title="debugMode ? '已开启开发者选项（连点 5 次关闭）' : '连点 5 次打开开发者选项'" @click="onVersionClick">
                {{ appName }} v{{ appVersion }}
            </p>
            <p class="text-xs text-gray-400 leading-5 select-text">
                TDLib {{ tdlibVersion }}
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { PaletteIcon, ChevronRightIcon, GlobeIcon, DatabaseIcon, NetworkIcon, SendIcon, TerminalSquare as TerminalSquareIcon } from 'lucide-vue-next';
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

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const router = useRouter();

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
    if (!userProfile.value) return '加载中...';
    const status = userProfile.value.status;
    if (!status) return '离线';
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
        tdlibVersion.value = '未连接';
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
