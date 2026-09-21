<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { tdlibSend } from "../../../utils/tdlib";
import { MessagePlugin } from "tdesign-vue-next";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";
import { onTdlibUpdate } from "../../../store/tdlibBus";
import TgsPlayer from "../../../components/common/TgsPlayer.vue";
import {
    usePasswordMonkey,
    MONKEY_EMPTY_FRAME,
    MONKEY_CLOSE_FRAME,
    MONKEY_PEEK_FRAME,
} from "../../../composables/usePasswordMonkey";

/** Unigram AuthorizationPasswordPage：AuthorizationStateWaitPassword.tgs */
const WAIT_PASSWORD_TGS_URL = new URL(
    "../../../assets/animations/AuthorizationStateWaitPassword.tgs",
    import.meta.url
).href;

const router = useRouter();
const password = ref("");
const loading = ref(false);
const passwordHint = ref("");
const showPassword = ref(false);
const tgsData = ref<Uint8Array | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const shake = ref(false);
const { t } = useI18n();
let unlisten: (() => void) | undefined;

/** 空/有密码时猴子开合眼（帧 1 ↔ 40） */
const monkey = usePasswordMonkey(password);
const { playerRef, onPlayerLoad, onPlayerComplete, seekMarker } = monkey;

/**
 * 显示密码：猴子从指缝偷看（CloseToPeek=56）
 * 隐藏密码：猴子捂眼（Close=40）
 * （与直觉一致：看得见密码时偷看，看不见时捂眼）
 */
function toggleReveal() {
    if (!password.value) return;
    showPassword.value = !showPassword.value;
    seekMarker(showPassword.value ? MONKEY_PEEK_FRAME : MONKEY_CLOSE_FRAME);
}

function mapPasswordError(error: any): string {
    const raw = String(error?.message || "");
    const upper = raw.toUpperCase();
    if (upper.includes("PASSWORD_HASH_INVALID") || upper.includes("PASSWORD_INVALID")) {
        return t("login.passwordError");
    }
    if (upper.includes("FLOOD")) {
        return t("login.floodWait");
    }
    return raw || t("login.passwordError");
}

/** Unigram PASSWORD_INVALID：输入框抖动 */
function shakeInput() {
    shake.value = false;
    requestAnimationFrame(() => {
        shake.value = true;
        setTimeout(() => {
            shake.value = false;
        }, 420);
    });
}

async function loadTgs() {
    try {
        const resp = await fetch(WAIT_PASSWORD_TGS_URL);
        tgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error("Failed to load AuthorizationStateWaitPassword.tgs:", e);
    }
}

async function loadHint() {
    try {
        const state = await tdlibSend({ _: "getAuthorizationState" });
        if (state._ === "authorizationStateWaitPassword") {
            passwordHint.value = (state as any).password_hint || "";
        }
    } catch (e) {
        console.warn("getAuthorizationState:", e);
    }
}

const submitPassword = async () => {
    if (!password.value || loading.value) return;
    loading.value = true;
    try {
        await tdlibSend({
            _: "checkAuthenticationPassword",
            password: password.value,
        });
    } catch (error: any) {
        console.error(error);
        MessagePlugin.error({ content: mapPasswordError(error), placement: "top-right" });
        // Unigram：密码错误清空 + 抖动；猴子回到空态
        monkey.resetToEmpty();
        showPassword.value = false;
        shakeInput();
        loading.value = false;
        inputRef.value?.focus();
    }
};

onMounted(async () => {
    void loadTgs();
    void loadHint();
    inputRef.value?.focus();
    try {
        await invoke("set_window_effect", { effect: "mica" });
    } catch (e) {
        console.warn("设置 Mica 失败:", e);
    }

    unlisten = onTdlibUpdate("auth", (update) => {
        if (update._ === "updateAuthorizationState") {
            const next = (update as any).authorization_state?._;
            if (next === "authorizationStateReady") {
                router.push("/home");
            } else if (next === "authorizationStateWaitPhoneNumber") {
                router.push("/login");
            }
        }
    });
});

onUnmounted(() => {
    if (unlisten) unlisten();
});
</script>

<template>
    <div class="flex justify-center items-center h-full select-none relative">
        <div class="flex flex-col items-center text-center px-8 w-[360px]">
            <!-- Unigram Header：密码动画与输入联动 -->
            <div class="mb-2 w-[160px] h-[160px] flex items-center justify-center">
                <!-- tlottie 官方：reportFrames 供停帧；forceRender 防离屏暂停 -->
                <TgsPlayer v-if="tgsData" ref="playerRef" :data="tgsData" :loop="false" :autoplay="false"
                    :report-frames="true" :force-render="true"
                    :initial-frame="password ? MONKEY_CLOSE_FRAME : MONKEY_EMPTY_FRAME" :size="160"
                    @load="onPlayerLoad" @complete="onPlayerComplete" />
            </div>

            <h1 class="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">{{ t("login.enterPassword") }}</h1>
            <p class="text-gray-500 dark:text-gray-400 mb-2 text-sm">
                {{ t("login.passwordDesc") }}
            </p>

            <div class="w-full mb-4 space-y-2">
                <div class="relative" :class="{ 'password-shake': shake }">
                    <div
                        class="flex items-center border rounded-[0.625rem] h-10 pl-3 pr-1 transition-colors"
                        :class="shake
                            ? 'border-red-400'
                            : 'border-gray-300 dark:border-gray-600 focus-within:border-[#3390ec]'">
                        <input ref="inputRef" type="text"
                            :placeholder="passwordHint || t('login.passwordPlaceholder')" v-model="password"
                            :disabled="loading" autocomplete="off"
                            :style="!showPassword ? { WebkitTextSecurity: 'disc' } : undefined"
                            class="flex-1 min-w-0 text-sm outline-none bg-transparent placeholder-gray-400 text-gray-800 dark:text-gray-100"
                            @keyup.enter="submitPassword" />
                        <!-- Unigram RevealButton：显示/隐藏密码 → 动画 Close / CloseToPeek -->
                        <button type="button" class="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            :title="showPassword ? t('login.hidePassword') : t('login.showPassword')"
                            :aria-pressed="showPassword" @click="toggleReveal">
                            <svg v-if="!showPassword" class="w-4 h-4" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243" />
                            </svg>
                            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                    </div>
                </div>

                <button type="button"
                    class="w-full h-10 rounded-[0.625rem] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="loading || !password
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                        : 'bg-[#3390ec] text-white hover:bg-[#2b7fd4]'"
                    :disabled="loading || !password" @click="submitPassword">
                    {{ loading ? t("login.submitting") : t("login.next") }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.password-shake {
    animation: password-shake 0.4s ease;
}

@keyframes password-shake {
    0%,
    100% {
        transform: translateX(0);
    }

    20% {
        transform: translateX(-6px);
    }

    40% {
        transform: translateX(6px);
    }

    60% {
        transform: translateX(-4px);
    }

    80% {
        transform: translateX(4px);
    }
}
</style>
