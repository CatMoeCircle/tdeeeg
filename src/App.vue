<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "tdlib-types";
import { onMounted, onUnmounted, ref } from "vue";
import { tdlibSend } from "./utils/tdlib";
import { useRouter } from "vue-router";
import TitleBar from "./components/TitleBar.vue";
import { MessagePlugin } from 'tdesign-vue-next';
import { useDownloadStore } from "./store/downloads";

const router = useRouter();

const initialized = ref(false);

const startTDLibError = ref<string | null>(null);

const downloadStore = useDownloadStore();

async function initTdlib() {
  try {
    // 初始化下载管理器的 updateFile 监听
    await downloadStore.init();

    if (import.meta.env.DEV) {
      // await listen<Update>("tdlib-update", (event) => {
      //   const update = event.payload;
      // console.log("Received update:", update);
      // });
    }


    // Listen for initialization errors (e.g. invalid API ID/Hash)
    await listen("tdlib-init-error", (event) => {
      console.error("TDLib init error event:", event.payload);
      // @ts-ignore
      const errorMsg = event.payload?.message || JSON.stringify(event.payload);
      startTDLibError.value = `TDLib Error: ${errorMsg}`;
      MessagePlugin.error({ content: errorMsg, placement: "top-right" });
      initialized.value = false;
    });

    // Listen for debug logs
    await listen("tdlib-log", (event) => {
      console.log("[Rust Log]:", event.payload);
    });

    await invoke("init_tdlib").catch((e) => {
      console.error("Error invoking init_tdlib:", e);
      initialized.value = false;
      startTDLibError.value = e.toString();
    });
    console.log("TDLib initialized");
    initialized.value = true;
  } catch (e) {
    console.error("Error initializing TDLib:", e);
  }
}

async function get() {
  const result = await tdlibSend({
    _: "getAuthorizationState"
  });

  if (result._ !== "authorizationStateReady") {
    router.push("/login");
  } else {
    router.push("/home");
  }
}

onMounted(() => {
  invoke('set_tdlib_parameters', { useTestDc: false });
  initTdlib();
  setTimeout(() => {
    get();
  }, 2000);

});

onUnmounted(() => {
  downloadStore.destroy();
});
</script>

<template>
  <!-- Main app window -->
  <div class="relative flex flex-col h-screen w-screen overflow-hidden">
    <div class="absolute inset-0 bg-cover bg-center"></div>

    <div class="relative z-10 flex flex-col h-full w-full overflow-hidden">
      <TitleBar />

      <div class="flex-1 overflow-hidden relative">
        <router-view v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </div>
    </div>
  </div>
</template>

<style>
/* Global styles if needed, but Tailwind handles most */
</style>
