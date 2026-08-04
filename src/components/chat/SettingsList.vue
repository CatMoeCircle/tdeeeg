<template>
    <div class="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        <div class="mt-3">
            <div
                class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="openMyProfile">
                <div class="w-10 h-10" v-if="userProfile">
                    <avatar :photo="userProfile.profile_photo"
                        :title="userProfile.first_name + ' ' + userProfile.last_name"
                        :accentColorId="userProfile.profile_accent_color_id" />
                </div>

                <div v-else class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                <div class="ml-3">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {{ userProfile ? (userProfile.first_name + ' ' + userProfile.last_name) : '加载中...' }}
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
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { PaletteIcon, ChevronRightIcon, GlobeIcon, DatabaseIcon } from 'lucide-vue-next';
import avatar from './avatar.vue';
import { useUserStore } from '../../store/user';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { computed } from 'vue';
import MusicPlayerEntry from './../audio/MusicPlayerEntry.vue';
import formatStatus from '../../utils/status';

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const router = useRouter();

/** 点击自己的头像/名字 → 打开自己的个人资料页 */
function openMyProfile() {
    if (!userProfile.value) return;
    router.push({ name: 'user-profile', params: { id: String(userProfile.value.id) } });
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
</script>
