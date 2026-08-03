<!-- 侧边栏 -->
<template>
    <div class="w-14 h-full dark:bg-gray-900 flex flex-col items-center py-4 dark:border-gray-800 pt-1">
        <!-- Avatar / Profile -->
        <div class="mb-5 ">
            <div v-if="userProfile" class="w-10 h-10">
                <Avatar :photo="userProfile.profile_photo" :title="userProfile.first_name + ' ' + userProfile.last_name"
                    :accentColorId="userProfile.profile_accent_color_id" />
            </div>
            <div v-else class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
        </div>

        <!-- 侧边栏-上部分-->
        <div class="flex-1 flex flex-col gap-2 w-full items-center">
            <router-link to="/home/chats" :class="buttonStyle" active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <MessageCircleIcon :class="iconStyle" />
            </router-link>

            <router-link to="/home/contacts" :class="buttonStyle" active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <UsersIcon :class="iconStyle" />
            </router-link>

            <router-link to="/home/archived" :class="buttonStyle" active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <ArchiveIcon :class="iconStyle" />
            </router-link>
        </div>

        <!-- 侧边栏-下部分 -->
        <div class="mt-auto flex flex-col gap-4 w-full items-center">
            <router-link to="/home/downloads" :class="buttonStyle"
                active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <span class="relative inline-flex">
                    <DownloadIcon :class="iconStyle" />
                    <span v-if="downloadStore.activeCount > 0"
                        class="absolute -top-2 -right-2 min-w-4.5 h-4.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
                        {{ downloadStore.activeCount > 99 ? '99+' : downloadStore.activeCount }}
                    </span>
                </span>
            </router-link>
            <router-link to="/home/settings" :class="buttonStyle" active-class="bg-white/60 shadow-sm">
                <SettingsIcon :class="iconStyle" />
            </router-link>
        </div>
    </div>
</template>

<script setup lang="ts">
import { MessageCircleIcon, UsersIcon, ArchiveIcon, DownloadIcon, SettingsIcon } from 'lucide-vue-next';
import Avatar from "../chat/avatar.vue";
import { onMounted } from 'vue';
import { useUserStore } from '../../store/user';
import { useDownloadStore } from '../../store/downloads';
import { storeToRefs } from 'pinia';

const buttonStyle = 'w-10 h-10 flex items-center justify-center text-gray-500 transition-colors relative rounded-lg hover:bg-white/60 hover:shadow-sm';
const iconStyle = 'w-5 h-5';

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const downloadStore = useDownloadStore();

onMounted(() => {
    if (!userProfile.value) {
        userStore.fetchUser();
    }
});
</script>
