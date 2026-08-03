<template>
    <div class="flex flex-col h-full ">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="text-lg font-semibold">联系人</h2>
        </div>
        <!-- 音乐播放器入口（聊天打开时由 ChatDetail 接管） -->
        <MusicPlayerEntry v-if="!isChatOpen" compact />
        <div class="flex-1 overflow-y-auto custom-scrollbar p-2" v-smooth-wheel>
            <div v-for="user in Contacts ?? []" :key="user.id">
                <div
                    class="flex items-center p-2 hover:shadow-(--box-shadow) hover:bg-gray-200/50 rounded-xl cursor-pointer transition-colors">

                    <div class="w-13 h-13 mr-3">
                        <Avatar :photo="user.profile_photo" :title="user.first_name + ` ` + user.last_name"
                            :accentColorId="user.profile_accent_color_id" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-sm font-semibold text-gray-900">{{ user.first_name + ` ` +
                            user.last_name }}</h3>
                        <p v-if="user.status._ === 'userStatusOnline'" class="text-xs text-blue-500">
                            在线</p>
                        <p v-else class="text-xs text-gray-400">{{ formatStatus(user.status)
                        }}</p>
                    </div>
                    <div class="flex items-center">
                        <t-tooltip content="互为联系人" placement="bottom">
                            <ArrowLeftRightIcon v-if="user.is_mutual_contact" class="w-4 h-4 text-gray-400 ml-2" />
                        </t-tooltip>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { tdlibSend } from '../../utils/tdlib';
import formatStatus from '../../utils/status';
import { ArrowLeftRightIcon } from 'lucide-vue-next';
import { onMounted, ref } from "vue"
import { useRoute } from 'vue-router';
import { computed } from 'vue';
import MusicPlayerEntry from './../audio/MusicPlayerEntry.vue';

import type { user } from 'tdlib-types';

const route = useRoute();
const isChatOpen = computed(() => /^\/home\/chat\/\d+/.test(route.path));

const Contacts = ref<user[] | undefined>(undefined);

onMounted(async () => {
    console.log("加载联系人列表");

    const [users, currentUser] = await Promise.all([
        tdlibSend({ "_": "getContacts" }),
        tdlibSend({ "_": "getMe" })
    ]);
    if (users.user_ids.length < 0) {
        return;
    }
    const contactList: user[] = [];
    for (const id of users.user_ids) {
        if (id === currentUser.id) continue;
        const user = await tdlibSend({
            "_": "getUser",
            "user_id": id
        });

        contactList.push(user);
    }
    Contacts.value = contactList;
});
</script>
