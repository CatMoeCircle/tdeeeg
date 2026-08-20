<template>
    <div class="flex h-full w-full bg-white/40 overflow-hidden dark:bg-black text-gray-900 dark:text-gray-100">
        <SideNavBar />
        <div class="flex-1 min-w-0 bg-white rounded-tl-xl relative">
            <ResizableLayout>
                <template #sidebar>
                    <ChatList v-if="sidebarShowsChats" :is-archive="isArchiveSection" />
                    <ContactList v-else-if="sidebarShowsContacts" />
                    <SettingsList v-else-if="sidebarShowsSettings" />
                </template>

                <template #content>
                    <div class="relative w-full h-full">
                        <ChatDetail v-if="showActiveChat" :chat-id="activeChatId" :topic-id="activeTopicId"
                            @close="closeActiveChat" />
                        <router-view v-else v-slot="{ Component }">
                            <KeepAlive>
                                <component v-if="Component" :is="Component" :key="route.fullPath"
                                    class="relative z-10 h-full" />
                            </KeepAlive>
                            <div v-if="!Component"
                                class="absolute inset-0 flex items-center justify-center text-gray-400">
                                {{ emptyStateText }}
                            </div>
                        </router-view>
                    </div>
                </template>
            </ResizableLayout>

            <!-- 全局音乐播放器核心 + 弹出面板 -->
            <AudioPlayerCore />
            <MusicPlayerOverlay />
            <!-- @用户名 右键菜单 -->
            <UsernameMenu />
            <!-- 左下角下载管理器悬浮窗 -->
            <DownloadsModule />
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import SideNavBar from '../../components/layout/SideNavBar.vue';
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
import ChatList from '../../components/chat/ChatList.vue';
import ChatDetail from '../../components/chat/ChatDetail/index.vue';
import ContactList from '../../components/chat/ContactList.vue';
import SettingsList from '../../components/chat/SettingsList.vue';
import AudioPlayerCore from '../../components/audio/AudioPlayerCore.vue';
import MusicPlayerOverlay from '../../components/audio/MusicPlayerOverlay.vue';
import UsernameMenu from '../../components/contextMenu/UsernameMenu.vue';
import DownloadsModule from '../../components/downloads/DownloadsModule.vue';

const route = useRoute();
const isContacts = computed(() => route.name === 'contacts');
const isSettings = computed(() => route.name === 'settings'
    || route.name === 'settings-appearance'
    || route.name === 'settings-download'
    || route.name === 'settings-proxy'
    || route.name === 'settings-debug'
    || route.name === 'settings-system'
    || route.name === 'settings-edit-profile'
    || route.name === 'settings-privacy'
    || route.name === 'settings-devices');
const isSettingsDetail = computed(() => route.name === 'settings-appearance'
    || route.name === 'settings-download'
    || route.name === 'settings-proxy'
    || route.name === 'settings-debug'
    || route.name === 'settings-system'
    || route.name === 'settings-edit-profile'
    || route.name === 'settings-privacy'
    || route.name === 'settings-devices');
const isArchiveSection = computed(() => route.name === 'archived');
const isProfile = computed(() => route.name === 'user-profile' || route.name === 'chat-profile');

// 进入个人资料页时，记住来源栏目，让左侧列表保持不变（从设置进→仍是设置，
// 从聊天进→仍是聊天），避免进入资料页后左侧被误切到聊天列表。
type SidebarSection = 'chats' | 'contacts' | 'settings';
const profileFromSection = ref<SidebarSection | null>(null);
/** 左侧应显示的栏目（资料页期间沿用进入前的栏目） */
const activeSection = computed<SidebarSection>(() => {
    if (isProfile.value && profileFromSection.value) return profileFromSection.value;
    if (isContacts.value) return 'contacts';
    if (isSettings.value) return 'settings';
    return 'chats';
});
const sidebarShowsChats = computed(() => activeSection.value === 'chats');
const sidebarShowsContacts = computed(() => activeSection.value === 'contacts');
const sidebarShowsSettings = computed(() => activeSection.value === 'settings');
const activeChatId = ref<number | null>(null);
const activeTopicId = ref<number | null>(null);
const isChatRoute = (name: unknown) => name === 'chat-detail' || name === 'chat-topic-detail';
const closeActiveChat = () => {
    activeChatId.value = null;
    activeTopicId.value = null;
};
// 个人资料页（user-profile）是独立路由页面，走 router-view 渲染，
// 绝不复用聊天详情容器。加上该判断确保即使 activeChatId 尚未被
// watch 清除（时序竞态），右侧也强制渲染资料页而非聊天面板。
const showActiveChat = computed(
    () =>
        activeChatId.value !== null &&
        !isSettingsDetail.value &&
        route.name !== 'user-profile' &&
        route.name !== 'chat-profile',
);

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
        if (name === 'settings-appearance' || name === 'settings-download' || name === 'settings-proxy' || name === 'settings-debug' || name === 'settings-system' || name === 'settings-edit-profile' || name === 'settings-privacy' || name === 'settings-devices') {
            closeActiveChat();
            return;
        }

        // 进入资料页（用户 / 频道/群组）时关闭当前聊天，在内容区渲染资料页。
        // 同时记忆来源栏目，令左侧列表保持不变。
        if (name === 'user-profile' || name === 'chat-profile') {
            closeActiveChat();
            const prev = previous?.[0];
            if (prev === 'contacts') profileFromSection.value = 'contacts';
            else if (prev === 'settings' || prev === 'settings-appearance' || prev === 'settings-download' || prev === 'settings-proxy' || prev === 'settings-debug' || prev === 'settings-system') profileFromSection.value = 'settings';
            else profileFromSection.value = 'chats';
            return;
        }

        // 离开个人资料页后清除来源栏目记忆。
        if (profileFromSection.value !== null) {
            profileFromSection.value = null;
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

    try {
        await appWindow.setShadow(true);
    } catch (e) {
        console.warn("开启窗口阴影失败:", e);
    }

    // 切换窗口效果为 Acrylic
    try {
        await invoke("set_window_effect", { effect: "acrylic" });
    } catch (e) {
        console.warn("切换 Acrylic 失败:", e);
    }

});
</script>
<style scoped></style>
