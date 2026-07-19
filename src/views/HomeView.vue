<template>
    <div class="flex h-full w-full overflow-hidden dark:bg-black text-gray-900 dark:text-gray-100">
        <SideNavBar />
        <div class="flex-1 bg-white rounded-tl-xl">
            <router-view />
        </div>
    </div>
</template>
<script setup lang="ts">
import { onMounted } from 'vue';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
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

    // 切换窗口效果为 Acrylic
    try {
        await invoke("set_window_effect", { effect: "acrylic" });
    } catch (e) {
        console.warn("切换 Acrylic 失败:", e);
    }

    await loadChats();
});
</script>
<style scoped></style>