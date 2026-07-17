<template>
    <div class="flex h-screen w-screen overflow-hidden dark:bg-black text-gray-900 dark:text-gray-100">
        <SideNavBar />
        <router-view />
    </div>
</template>
<script setup lang="ts">
import { onMounted } from 'vue';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import SideNavBar from '../components/layout/SideNavBar.vue';
import { tdlibSend } from '../utils/tdlib';

const loadChats = async () => {
    // 模拟加载聊天数据的异步操作
    await tdlibSend({
        _: "loadChats",
        chat_list: {
            _: "chatListMain"
        },
        limit: 50
    })
};

onMounted(async () => {
    console.log("主页面加载");
    const appWindow = getCurrentWindow();
    await appWindow.setSize(new LogicalSize(1000, 600));
    await appWindow.setMinSize(new LogicalSize(800, 450));
    console.log("加载聊天列表");

    await loadChats();
});
</script>
<style scoped></style>