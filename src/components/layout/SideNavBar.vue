<template>
    <div
        class="w-16 h-full bg-gray-100 dark:bg-gray-900 flex flex-col items-center py-4 border-r border-gray-200 dark:border-gray-800 pt-9">
        <!-- Avatar / Profile -->
        <div class="mb-6 ">
            <Avatar v-if="userProfile" :photo="userProfile.profile_photo"
                :title="userProfile.first_name + ' ' + userProfile.last_name" />
            <t-skeleton v-else theme="avatar"></t-skeleton>
        </div>

        <!-- Navigation Items -->
        <div class="flex-1 flex flex-col gap-4 w-full items-center">
            <router-link to="/home/chats"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-gray-300 dark:bg-gray-600 shadow-sm">
                <MessageCircleIcon class="w-6 h-6" />
            </router-link>

            <router-link to="/home/contacts"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-gray-300 dark:bg-gray-600 shadow-sm">
                <UsersIcon class="w-6 h-6" />
            </router-link>

            <router-link to="/home/archived"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-gray-300 dark:bg-gray-600 shadow-sm">
                <ArchiveIcon class="w-6 h-6" />
            </router-link>
        </div>

        <!-- Bottom Actions -->
        <div class="mt-auto flex flex-col gap-4 w-full items-center">
            <router-link to="/home/settings"
                class="w-12 h-12 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative rounded-lg"
                active-class="bg-gray-300 dark:bg-gray-600 shadow-sm">
                <SettingsIcon class="w-6 h-6" />
            </router-link>
        </div>
    </div>
</template>

<script setup lang="ts">
import { MessageCircleIcon, UsersIcon, ArchiveIcon, SettingsIcon } from 'lucide-vue-next';
import Avatar from "../chat/avatar.vue";
import { tdlibSend } from '../../utils/tdlib';
import { onMounted, ref } from 'vue';
import { user } from 'tdlib-types';

const userProfile = ref<user | undefined>(undefined);

onMounted(() => {
    // Example: Fetch user profile on mount
    tdlibSend({ "_": "getMe" }).then(response => {
        userProfile.value = response
    });
});



</script>
