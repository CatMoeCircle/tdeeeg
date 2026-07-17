<template>
    <div
        class="w-16 h-full dark:bg-gray-900 flex flex-col items-center py-4 border-r border-gray-200 dark:border-gray-800 pt-9">
        <!-- Avatar / Profile -->
        <div class="mb-6 ">
            <Avatar v-if="userProfile" :photo="userProfile.profile_photo"
                :title="userProfile.first_name + ' ' + userProfile.last_name" />
            <div v-else class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
        </div>

        <!-- Navigation Items -->
        <div class="flex-1 flex flex-col gap-4 w-full items-center">
            <router-link to="/home/chats"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <MessageCircleIcon class="w-6 h-6" />
            </router-link>

            <router-link to="/home/contacts"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <UsersIcon class="w-6 h-6" />
            </router-link>

            <router-link to="/home/archived"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <ArchiveIcon class="w-6 h-6" />
            </router-link>
        </div>

        <!-- Bottom Actions -->
        <div class="mt-auto flex flex-col gap-4 w-full items-center">
            <router-link to="/home/settings"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-white/60 dark:bg-gray-600 shadow-sm">
                <SettingsIcon class="w-6 h-6" />
            </router-link>
        </div>
    </div>
</template>

<script setup lang="ts">
import { MessageCircleIcon, UsersIcon, ArchiveIcon, SettingsIcon } from 'lucide-vue-next';
import Avatar from "../chat/avatar.vue";
import { onMounted } from 'vue';
import { useUserStore } from '../../store/user';
import { storeToRefs } from 'pinia';

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);

onMounted(() => {
    if (!userProfile.value) {
        userStore.fetchUser();
    }
});
</script>
