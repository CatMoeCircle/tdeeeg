<template>
    <div class="flex h-full w-full bg-white/40 overflow-hidden dark:bg-black text-gray-900 dark:text-gray-100">
        <SideNavBar />
        <div class="flex-1 bg-white rounded-tl-xl relative">
            <router-view />

            <!-- 全局音乐播放器核心 + 弹出面板 -->
            <AudioPlayerCore />
            <MusicPlayerOverlay />
        </div>
    </div>
</template>
<script setup lang="ts">
import { onMounted } from 'vue';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import SideNavBar from '../components/layout/SideNavBar.vue';
import AudioPlayerCore from '../components/audio/AudioPlayerCore.vue';
import MusicPlayerOverlay from '../components/audio/MusicPlayerOverlay.vue';

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