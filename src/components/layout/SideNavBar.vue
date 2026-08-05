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
            <router-link to="/home/chats"
                :class="[buttonStyle, { 'bg-white/60 dark:bg-gray-600 shadow-sm': isChatNavActive }]">
                <MessageCircleIcon :class="iconStyle" />
            </router-link>

            <router-link to="/home/contacts" :class="buttonStyle" active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <UsersIcon :class="iconStyle" />
            </router-link>

            <router-link v-if="settings.chatList.archivePosition !== 'hidden'" to="/home/archived" :class="buttonStyle"
                active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <ArchiveIcon :class="iconStyle" />
            </router-link>
        </div>

        <!-- 侧边栏-下部分 -->
        <div class="mt-auto flex flex-col gap-4 w-full items-center">
            <button type="button" @click="downloadStore.togglePanel()"
                :class="[buttonStyle, downloadStore.isPanelOpen ? 'bg-white/60 dark:bg-gray-600 shadow-sm' : '']"
                :title="downloadStore.isPanelOpen ? '关闭下载管理器' : '打开下载管理器'">
                <span class="relative inline-flex">
                    <DownloadIcon :class="iconStyle" />
                    <span v-if="downloadStore.activeCount > 0"
                        class="absolute -top-2 -right-2 min-w-4.5 h-4.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
                        {{ downloadStore.activeCount > 99 ? '99+' : downloadStore.activeCount }}
                    </span>
                </span>
            </button>
            <router-link to="/home/settings"
                :class="[buttonStyle, { 'bg-white/60 dark:bg-gray-600 shadow-sm': isSettingsNavActive }]">
                <SettingsIcon :class="iconStyle" />
            </router-link>
        </div>
    </div>
</template>

<script setup lang="ts">
import { MessageCircleIcon, UsersIcon, ArchiveIcon, DownloadIcon, SettingsIcon } from 'lucide-vue-next';
import Avatar from "../chat/avatar.vue";
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '../../store/user';
import { useDownloadStore } from '../../store/downloads';
import { storeToRefs } from 'pinia';
import { settings } from '../../store/settings';

const buttonStyle = 'w-10 h-10 flex items-center justify-center text-gray-500 transition-colors relative rounded-lg hover:bg-white/60 hover:shadow-sm';
const iconStyle = 'w-5 h-5';

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const downloadStore = useDownloadStore();
const route = useRoute();
const isChatNavActive = computed(() => route.name === 'chats' || route.name === 'chat-detail' || route.name === 'chat-topic-detail');
const isSettingsNavActive = computed(() => route.name === 'settings' || route.name === 'settings-appearance' || route.name === 'settings-download');

onMounted(() => {
    if (!userProfile.value) {
        userStore.fetchUser();
    }
});
</script>
