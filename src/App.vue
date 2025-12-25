<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "tdlib-types";
import { onMounted } from "vue";
import { tdlibSend } from "./utils/tdlib";
import { useRouter } from "vue-router";
import TitleBar from "./components/TitleBar.vue";
import { listenForUpdates } from "./utils/update";
import { ref } from "vue";

const router = useRouter();

const initialized = ref(false);

const startTDLibError = ref<string | null>(null);


async function initTdlib() {
  try {
    await listen<Update>("tdlib-update", (event) => {
      const update = event.payload;
      console.log("Received update:", update);
    });

    // Listen for initialization errors (e.g. invalid API ID/Hash)
    await listen("tdlib-init-error", (event) => {
      console.error("TDLib init error event:", event.payload);
      // @ts-ignore
      const errorMsg = event.payload?.message || JSON.stringify(event.payload);
      startTDLibError.value = `TDLib Error: ${errorMsg}`;
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
  initTdlib();
  listenForUpdates();
  setTimeout(() => {
    get();
  }, 2000);

});
</script>

<template>
  <div class="flex flex-col h-screen w-screen overflow-hidden">
    <TitleBar />
    <div v-if="initialized" class="flex-1 overflow-hidden relative">
      <router-view />
    </div>
    <div v-else class="flex-1 flex items-center justify-center">
      <p v-if="!startTDLibError" class="text-gray-500 text-lg">Initializing...</p>
      <p v-else class="text-red-500 text-lg mt-2">{{ startTDLibError }}</p>
    </div>
  </div>
</template>

<style>
/* Global styles if needed, but Tailwind handles most */
</style>
