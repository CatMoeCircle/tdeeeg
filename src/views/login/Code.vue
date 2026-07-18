<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { tdlibSend } from "../../utils/tdlib";
import { listen } from "@tauri-apps/api/event";
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import type { Update } from "tdlib-types";

const router = useRouter();
const code = ref("");
const loading = ref(false);
const { t } = useI18n();
let unlisten: () => void;

const submitCode = async () => {
    if (!code.value) return;
    loading.value = true;
    try {
        await tdlibSend({
            _: "checkAuthenticationCode",
            code: code.value,
        });
        loading.value = false;
    } catch (error: any) {
        const msg = error.message || t('login.codeError');
        MessagePlugin.error({ content: msg, placement: "top-right" });
        console.error(error);
        loading.value = false;
    }
};

onMounted(async () => {
    unlisten = await listen<Update>("tdlib-update", (event) => {
        const update = event.payload;
        if (update._ === "updateAuthorizationState") {
            switch (update.authorization_state._) {
                case "authorizationStateWaitPassword":
                    router.push("/loginPaws");
                    break;
                case "authorizationStateReady":
                    router.push("/home");
                    break;
            }
        }
    });
});

onUnmounted(() => {
    if (unlisten) unlisten();
});
</script>

<template>
    <div class="flex justify-center items-center h-full bg-white select-none">
        <div class="flex flex-col items-center text-center px-8 w-[400px]">
            <h1 class="text-xl font-bold mb-4 text-gray-900">{{ t('login.enterCode') }}</h1>
            <p class="text-gray-500 mb-8 text-base">
                {{ t('login.codeDesc') }}
            </p>

            <div class="w-full mb-6">
                <div
                    class="flex items-center border border-gray-300 rounded-xl px-4 py-3 focus-within:border-[#3390ec] transition-colors">
                    <input type="text" :placeholder="t('login.codePlaceholder')" v-model="code"
                        class="flex-1 text-base outline-none bg-transparent placeholder-gray-400 text-black text-center tracking-widest"
                        @keyup.enter="submitCode" />
                </div>
            </div>

            <button block :loading="loading" @click="submitCode">
                {{ t('login.next') }}
            </button>
        </div>
    </div>
</template>
