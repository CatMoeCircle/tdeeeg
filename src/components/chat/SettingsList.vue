<template>
    <div class="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        <div class="mt-3">
            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center">
                <avatar v-if="userProfile" :photo="userProfile.profile_photo"
                    :title="userProfile.first_name + ' ' + userProfile.last_name" />
                <div v-else class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                <div class="ml-3">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {{ userProfile ? (userProfile.first_name + ' ' + userProfile.last_name) : '加载中...' }}
                    </p>
                    <p class="text-xs text-gray-500">
                        {{ userProfile ? ('@' + userProfile.usernames?.active_usernames[0]) : '' }} - id: {{ userProfile
                            ?
                            userProfile.id : '' }}
                    </p>
                </div>
            </div>
        </div>
        <div class="flex-1 overflow-y-auto">
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
import { PaletteIcon, ChevronRightIcon, GlobeIcon } from 'lucide-vue-next';
import avatar from './avatar.vue';
import { useUserStore } from '../../store/user';
import { storeToRefs } from 'pinia';

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
</script>