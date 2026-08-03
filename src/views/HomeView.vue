<template>
    <div class="flex h-full w-full bg-white/40 overflow-hidden dark:bg-black text-gray-900 dark:text-gray-100">
        <SideNavBar />
        <div class="flex-1 min-w-0 bg-white rounded-tl-xl relative">
            <div v-if="isDownloads" class="h-full">
                <router-view v-slot="{ Component }">
                    <component :is="Component" class="h-full" />
                </router-view>
            </div>
            <ResizableLayout v-else>
                <template #sidebar>
                    <ChatList v-if="isChatSection" :is-archive="isArchiveSection" />
                    <ContactList v-else-if="isContacts" />
                    <SettingsList v-else-if="isSettings" />
                </template>

                <template #content>
                    <div class="relative w-full h-full">
                        <ChatDetail v-if="showActiveChat" :chat-id="activeChatId" :topic-id="activeTopicId" @close="closeActiveChat" />
                        <router-view v-else v-slot="{ Component }">
                            <KeepAlive>
                                <component v-if="Component" :is="Component" :key="route.fullPath" class="relative z-10 h-full" />
                            </KeepAlive>
                            <div v-if="!Component" class="absolute inset-0 flex items-center justify-center text-gray-400">
                                {{ emptyStateText }}
                            </div>
                        </router-view>
                    </div>
                </template>
            </ResizableLayout>

            <!-- 全局音乐播放器核心 + 弹出面板 -->
            <AudioPlayerCore />
            <MusicPlayerOverlay />
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import SideNavBar from '../components/layout/SideNavBar.vue';
import ResizableLayout from '../components/layout/ResizableLayout.vue';
import ChatList from '../components/chat/ChatList.vue';
import ChatDetail from '../components/chat/ChatDetail/index.vue';
import ContactList from '../components/chat/ContactList.vue';
import SettingsList from '../components/chat/SettingsList.vue';
import AudioPlayerCore from '../components/audio/AudioPlayerCore.vue';
import MusicPlayerOverlay from '../components/audio/MusicPlayerOverlay.vue';

const route = useRoute();
const isDownloads = computed(() => route.name === 'downloads');
const isContacts = computed(() => route.name === 'contacts');
const isSettings = computed(() => route.name === 'settings' || route.name === 'settings-appearance' || route.name === 'settings-download');
const isSettingsDetail = computed(() => route.name === 'settings-appearance' || route.name === 'settings-download');
const isArchiveSection = computed(() => route.name === 'archived');
const isChatSection = computed(() => !isDownloads.value && !isContacts.value && !isSettings.value);
const activeChatId = ref<number | null>(null);
const activeTopicId = ref<number | null>(null);
const isChatRoute = (name: unknown) => name === 'chat-detail' || name === 'chat-topic-detail';
const closeActiveChat = () => {
    activeChatId.value = null;
    activeTopicId.value = null;
};
const showActiveChat = computed(() => activeChatId.value !== null && !isSettingsDetail.value && !isDownloads.value);

// 聊天详情独立于二级导航路由。切换联系人、设置等栏目时，只更新中间栏，
// 保留当前聊天组件，避免右侧聊天被 router-view 卸载。
watch(
    () => [route.name, route.params.id, route.params.topicId] as const,
    ([name, id, topicId], previous) => {
        if (isChatRoute(name) && id !== undefined && id !== '') {
            activeChatId.value = Number(id);
            activeTopicId.value = topicId !== undefined && topicId !== '' ? Number(topicId) : null;
            return;
        }

        // 点击设置二级内容时，关闭当前聊天并显示对应设置页面。
        if (name === 'settings-appearance' || name === 'settings-download') {
            closeActiveChat();
            return;
        }

        // 聊天详情自己的返回按钮进入 /home/chats 时关闭右侧聊天；
        // 从联系人/设置切换到聊天列表则保留当前聊天。
        if (name === 'chats' && isChatRoute(previous?.[0])) {
            closeActiveChat();
        }
    },
    { immediate: true },
);
const emptyStateText = computed(() => {
    if (isContacts.value) return '联系人详情';
    if (isSettings.value) return '选择一个设置项';
    if (isArchiveSection.value) return '选择一个归档聊天';
    return '选择一个聊天开始';
});

onMounted(async () => {
    console.log("主页面加载");
    const appWindow = getCurrentWindow();
    await appWindow.setSize(new LogicalSize(1000, 600));
    await appWindow.setMinSize(new LogicalSize(800, 450));

    // 切换窗口效果为 Acrylic
    try {
        await invoke("set_window_effect", { effect: "acrylic" });
    } catch (e) {
        console.warn("切换 Acrylic 失败:", e);
    }

    // 注意：不在此处调用 loadChats！
    // ChatList.vue 会在其 onMounted 中注册事件监听器后，
    // 通过 triggerLoadMore 统一发送 loadChats 请求。
    // 如果在监听器注册前就发送 loadChats，TDLib 返回的
    // updateNewChat 事件会全部丢失（没有监听器接收）。
});
</script>
<style scoped></style>
