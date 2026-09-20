<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { tdlibSend } from "../../../utils/tdlib";
import { MessagePlugin } from "tdesign-vue-next";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";
import { onTdlibUpdate } from "../../../store/tdlibBus";
import TgsPlayer from "../../../components/common/TgsPlayer.vue";
import type { authenticationCodeInfo } from "tdlib-types";

/** Unigram AuthorizationCodePage：顶部 AuthorizationStateWaitCode.tgs */
const WAIT_CODE_TGS_URL = new URL(
    "../../../assets/animations/AuthorizationStateWaitCode.tgs",
    import.meta.url
).href;

const router = useRouter();
const code = ref("");
const loading = ref(false);
const codeInfo = ref<authenticationCodeInfo | null>(null);
const tgsData = ref<Uint8Array | null>(null);
const { t } = useI18n();
let unlisten: (() => void) | undefined;

/** Unigram ConvertType：按验证码类型展示说明 */
const codeTypeDesc = computed(() => {
    const info = codeInfo.value;
    if (!info) return t("login.codeDesc");
    const type = info.type;
    switch (type._) {
        case "authenticationCodeTypeTelegramMessage":
            return t("login.codeTypeTelegramMessage");
        case "authenticationCodeTypeSms":
            return t("login.codeTypeSms");
        case "authenticationCodeTypeFragment":
            return t("login.codeTypeFragment");
        case "authenticationCodeTypeCall":
            return t("login.codeTypeCall");
        default:
            return t("login.codeDesc");
    }
});

const codeLength = computed(() => {
    const type = codeInfo.value?.type as any;
    if (type && typeof type.length === "number") return type.length;
    return 5;
});

/**
 * 参考 Unigram AuthorizationCodeViewModel.SendExecute：
 * 把 TDLib error.message 映射为用户可读文案。
 */
function mapAuthError(error: any, fallbackKey: string): { msg: string; goLogin?: boolean } {
    const raw: string = String(error?.message || error?._ || "");
    const upper = raw.toUpperCase();
    if (upper.includes("PHONE_CODE_EMPTY") || upper.includes("PHONE_CODE_INVALID") || upper.includes("CODE_INVALID")) {
        return { msg: t("login.invalidCode") };
    }
    if (upper.includes("PHONE_CODE_EXPIRED")) {
        // Unigram：验证码过期返回重新获取
        return { msg: t("login.codeExpired"), goLogin: true };
    }
    if (upper.includes("PHONE_NUMBER_INVALID")) {
        return { msg: t("login.invalidPhoneNumber"), goLogin: true };
    }
    if (upper.includes("FIRSTNAME_INVALID")) {
        return { msg: t("login.invalidFirstName"), goLogin: true };
    }
    if (upper.includes("LASTNAME_INVALID")) {
        return { msg: t("login.invalidLastName"), goLogin: true };
    }
    if (upper.includes("FLOOD_WAIT")) {
        return { msg: t("login.floodWait") };
    }
    return { msg: raw || t(fallbackKey) };
}

async function loadTgs() {
    try {
        const resp = await fetch(WAIT_CODE_TGS_URL);
        tgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error("Failed to load AuthorizationStateWaitCode.tgs:", e);
    }
}

async function loadCodeInfo() {
    try {
        const state = await tdlibSend({ _: "getAuthorizationState" });
        if (state._ === "authorizationStateWaitCode") {
            codeInfo.value = (state as any).code_info ?? null;
        }
    } catch (e) {
        console.warn("getAuthorizationState:", e);
    }
}

const submitCode = async () => {
    const value = code.value.trim();
    if (!value) {
        MessagePlugin.warning({ content: t("login.invalidCode"), placement: "top-right" });
        return;
    }
    if (loading.value) return;
    loading.value = true;
    try {
        await tdlibSend({
            _: "checkAuthenticationCode",
            code: value,
        });
        // 成功后由授权态事件跳转，这里保持 loading
    } catch (error: any) {
        console.error(error);
        const { msg, goLogin } = mapAuthError(error, "login.codeError");
        MessagePlugin.error({ content: msg, placement: "top-right" });
        loading.value = false;
        if (goLogin) {
            router.push("/login");
        }
    }
};

/** Unigram：输满位数自动提交 */
function onCodeInput() {
    const digits = code.value.replace(/\D/g, "");
    if (digits !== code.value) code.value = digits;
    if (digits.length >= codeLength.value) {
        void submitCode();
    }
}

onMounted(async () => {
    void loadTgs();
    void loadCodeInfo();
    try {
        await invoke("set_window_effect", { effect: "mica" });
    } catch (e) {
        console.warn("设置 Mica 失败:", e);
    }

    unlisten = onTdlibUpdate("auth", (update) => {
        if (update._ === "updateAuthorizationState") {
            const next = (update as any).authorization_state?._;
            switch (next) {
                case "authorizationStateWaitPassword":
                    router.push("/loginPaws");
                    break;
                case "authorizationStateReady":
                    router.push("/home");
                    break;
                case "authorizationStateWaitPhoneNumber":
                    // 验证码过期等回到手机号页
                    router.push("/login");
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
    <div class="flex justify-center items-center h-full select-none relative">
        <div class="flex flex-col items-center text-center px-8 w-[360px]">
            <!-- Unigram AuthorizationCodePage：顶部 TGS -->
            <div class="mb-2 w-[160px] h-[160px] flex items-center justify-center">
                <TgsPlayer v-if="tgsData" :data="tgsData" :loop="true" :autoplay="true" :size="160" />
            </div>

            <h1 class="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">{{ t("login.enterCode") }}</h1>
            <p class="text-gray-500 dark:text-gray-400 mb-6 text-sm">
                {{ codeTypeDesc }}
            </p>
            <p v-if="codeInfo?.phone_number" class="text-xs text-gray-400 mb-4 tabular-nums">
                +{{ codeInfo.phone_number.replace(/^\+/, "") }}
            </p>

            <div class="w-full mb-4 space-y-2">
                <div
                    class="flex items-center border rounded-[0.625rem] h-10 px-3 transition-colors border-gray-300 dark:border-gray-600 focus-within:border-[#3390ec]">
                    <input type="text" inputmode="numeric" autocomplete="one-time-code"
                        :placeholder="t('login.codePlaceholder')" v-model="code" :disabled="loading" maxlength="8"
                        class="flex-1 text-sm outline-none bg-transparent placeholder-gray-400 text-gray-800 dark:text-gray-100 text-center tracking-[0.35em] tabular-nums"
                        @input="onCodeInput" @keyup.enter="submitCode" />
                </div>

                <button type="button"
                    class="w-full h-10 rounded-[0.625rem] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="loading || !code.trim()
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                        : 'bg-[#3390ec] text-white hover:bg-[#2b7fd4]'"
                    :disabled="loading || !code.trim()" @click="submitCode">
                    {{ loading ? t("login.submitting") : t("login.next") }}
                </button>
            </div>
        </div>
    </div>
</template>
