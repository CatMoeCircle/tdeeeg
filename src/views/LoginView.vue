<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import QRCodeStyling from "qr-code-styling";
import { useI18n } from 'vue-i18n';
import { tdlibSend } from "../utils/tdlib";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MessagePlugin } from 'tdesign-vue-next';
import type { AuthorizationState, Update, countryInfo } from "tdlib-types";
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';



const router = useRouter();
const qrCodeContainer = ref<HTMLElement | null>(null);
const qrlink = ref<string>("");
const Countries = ref<Array<countryInfo>>([]);
const phoneNumber = ref("");
const selectedCountry = ref("");
const isAutoSwitching = ref(false);
let qrCode: QRCodeStyling | null = null;
const { t } = useI18n();
/** 用户点击手机登录时，若正在二维码状态，先重置再发请求 */
const pendingPhoneLogin = ref<string | null>(null);

watch(selectedCountry, (newVal) => {
    if (isAutoSwitching.value) {
        isAutoSwitching.value = false;
        return;
    }
    const country = Countries.value.find((c) => c.country_code === newVal);
    if (country && country.calling_codes.length > 0) {
        phoneNumber.value = country.calling_codes[0];
    }
});

watch(phoneNumber, (newVal) => {
    const cleanNum = newVal.replace(/^\+/, "");
    let bestMatch: countryInfo | null = null;
    let maxLen = 0;

    for (const c of Countries.value) {
        for (const code of c.calling_codes) {
            if (cleanNum.startsWith(code)) {
                if (code.length > maxLen) {
                    maxLen = code.length;
                    bestMatch = c;
                }
            }
        }
    }

    if (bestMatch && bestMatch.country_code !== selectedCountry.value) {
        const currentCountry = Countries.value.find(c => c.country_code === selectedCountry.value);
        let currentMatchLen = 0;
        if (currentCountry) {
            for (const code of currentCountry.calling_codes) {
                if (cleanNum.startsWith(code)) {
                    if (code.length > currentMatchLen) {
                        currentMatchLen = code.length;
                    }
                }
            }
        }

        if (maxLen > currentMatchLen || currentMatchLen === 0) {
            isAutoSwitching.value = true;
            selectedCountry.value = bestMatch.country_code;
        }
    }
});

/** 用户主动点击二维码区域时显示/刷新二维码 */
const startQrLogin = async () => {
    // 如果已有二维码链接，直接重新显示
    if (qrlink.value) {
        await nextTick();
        if (qrCodeContainer.value) {
            initOrUpdateQrCode(qrlink.value);
        }
        return;
    }
    // 无链接时查询当前状态，可能已在 WaitOtherDeviceConfirmation
    try {
        const state = await tdlibSend({ _: "getAuthorizationState" });
        if (state._ === 'authorizationStateWaitOtherDeviceConfirmation') {
            qrlink.value = (state as any).link;
            return;
        }
        // 否则发起二维码认证
        await tdlibSend({ _: "requestQrCodeAuthentication" });
    } catch (e) {
        console.error("QR auth failed:", e);
    }
};

/** 清除二维码显示 */
const clearQrCode = () => {
    qrlink.value = '';
    if (qrCodeContainer.value) {
        qrCodeContainer.value.innerHTML = '';
    }
    qrCode = null;
};

/** 创建或重新创建二维码实例并挂载 */
const initOrUpdateQrCode = (link: string) => {
    if (!qrCodeContainer.value) return;
    if (!qrCode) {
        qrCode = new QRCodeStyling({
            width: 220,
            height: 220,
            type: "svg",
            data: link || "telegram.org",
            dotsOptions: { color: "#000", type: "rounded" },
            backgroundOptions: { color: "#ffffff" },
            imageOptions: { crossOrigin: "anonymous" },
            cornersSquareOptions: { type: "extra-rounded" }
        });
        qrCodeContainer.value.innerHTML = '';
        qrCode.append(qrCodeContainer.value);
    } else {
        try {
            qrCode.update({ data: link || "telegram.org" });
        } catch (e) {
            qrCodeContainer.value.innerHTML = '';
            qrCode = new QRCodeStyling({
                width: 220, height: 220, type: "svg",
                data: link || "telegram.org",
                dotsOptions: { color: "#000", type: "rounded" },
                backgroundOptions: { color: "#ffffff" },
                imageOptions: { crossOrigin: "anonymous" },
                cornersSquareOptions: { type: "extra-rounded" }
            });
            qrCode.append(qrCodeContainer.value);
        }
    }
};

const login = async () => {
    if (!phoneNumber.value) return;

    // 确保手机号有 + 前缀
    const rawPhone = phoneNumber.value.startsWith('+')
        ? phoneNumber.value
        : '+' + phoneNumber.value;

    // 检查当前授权状态
    try {
        const state = await tdlibSend({ _: "getAuthorizationState" });
        if (state._ === 'authorizationStateWaitOtherDeviceConfirmation') {
            // 正在二维码等待状态，需要先重置 TDLib 才能切到手机号登录
            clearQrCode();
            pendingPhoneLogin.value = rawPhone;
            await invoke("init_tdlib", { force: true });
            // TDLib 重启后 auth state 会重新走初始化流程，
            // 事件监听会在 WaitPhoneNumber 时处理 pendingPhoneLogin
            return;
        }

        // 正常流程
        await tdlibSend({
            _: "setAuthenticationPhoneNumber",
            phone_number: rawPhone,
            settings: {
                _: "phoneNumberAuthenticationSettings",
                allow_flash_call: false,
                allow_missed_call: false,
                is_current_phone_number: false,
                allow_sms_retriever_api: false,
                authentication_tokens: []
            }
        });
    } catch (e) {
        console.error(e);
        MessagePlugin.error({ content: "Error setting phone number", placement: "top-right" });
    }
};

let qrlinkupdate: () => void;

const getqrlink = async () => {
    const State = await tdlibSend({
        _: "getAuthorizationState"
    })
    AuthState(State);
};

const AuthState = async (State: AuthorizationState) => {
    switch (State._) {
        case "authorizationStateWaitOtherDeviceConfirmation":
            console.log(State.link);
            qrlink.value = State.link;
            break
        case "authorizationStateReady":
            router.push("/home");
            break;
        case "authorizationStateWaitPhoneNumber":
            // 如果有待处理的手机号登录（从二维码切换过来）
            if (pendingPhoneLogin.value) {
                const phone = pendingPhoneLogin.value;
                pendingPhoneLogin.value = null;
                try {
                    await tdlibSend({
                        _: "setAuthenticationPhoneNumber",
                        phone_number: phone,
                        settings: {
                            _: "phoneNumberAuthenticationSettings",
                            allow_flash_call: false,
                            allow_missed_call: false,
                            is_current_phone_number: false,
                            allow_sms_retriever_api: false,
                            authentication_tokens: []
                        }
                    });
                } catch (e) {
                    console.error(e);
                    MessagePlugin.error({ content: "Error setting phone number", placement: "top-right" });
                }
                return;
            }
            // 无待处理手机号，自动触发二维码（同时显示两种登录方式）
            await tdlibSend({ _: "requestQrCodeAuthentication" });
            break;
        case "authorizationStateWaitTdlibParameters":
            MessagePlugin.error({ content: t('login.tdlibParametersError'), placement: "top-right", offset: [0, 20] });
            break
        case "authorizationStateWaitPremiumPurchase":
            MessagePlugin.warning({ content: t('login.PremiumWarning'), placement: "top-right", offset: [0, 20] });
            break;
        case "authorizationStateWaitEmailAddress":
            MessagePlugin.warning({ content: t('login.SetEmailTips'), placement: "top-right", offset: [0, 20] });
            break
        case "authorizationStateWaitEmailCode":
            MessagePlugin.warning({ content: t('login.CheckEmailTips'), placement: "top-right", offset: [0, 20] });
            break
        case "authorizationStateWaitCode":
            router.push("/loginCode");
            break
        case "authorizationStateWaitRegistration":
            MessagePlugin.warning({ content: t('login.RegisterTips'), placement: "top-right", offset: [0, 20] });
            break;
        case "authorizationStateWaitPassword":
            router.push("/loginPaws");
            break;
        default:
            console.log(State);
            MessagePlugin.error({ content: t('login.UnknownStateError'), placement: "top-right", offset: [0, 20] });
            break;
    }
}

onMounted(async () => {
    await getCurrentWindow().setMinSize(new LogicalSize(700, 450));

    // 登录页面使用默认 mica 效果
    try {
        await invoke("set_window_effect", { effect: "mica" });
    } catch (e) {
        console.warn("设置 Mica 失败:", e);
    }

    qrlinkupdate = await listen<Update>("tdlib-update", async (event) => {
        const update = event.payload;
        if (update._ !== "updateAuthorizationState") return;
        AuthState(update.authorization_state);
    });
    tdlibSend({
        _: "getCountries",
    }).then((res) => {
        console.log("获取国家列表成功:", res);
        if (res._ === "countries") {
            Countries.value = res.countries;
        }
    }).catch((err) => {
        console.error("获取国家列表失败:", err);
    });
    getqrlink();

    // 当 qrlink 变化时实时更新或创建二维码
    watch(qrlink, async (val) => {
        if (!val) return;
        // 等待 Vue 完成 DOM 更新（v-if 条件变化后）
        await nextTick();
        if (!qrCodeContainer.value) return;
        initOrUpdateQrCode(val);
    });
});

onUnmounted(() => {
    // 清理待处理的手机号登录
    pendingPhoneLogin.value = null;

    // 清理二维码 DOM
    if (qrCodeContainer.value) qrCodeContainer.value.innerHTML = "";
    qrCode = null;

    // 取消 TDLib 事件监听
    if (qrlinkupdate) {
        qrlinkupdate();
    }
});
</script>

<template>
    <div class="flex justify-center items-center h-full select-none">
        <div class="flex w-[800px] items-center justify-between">
            <!-- Left Side: Phone Login -->
            <div class="flex-1 flex flex-col items-center text-center px-8">
                <h1 class="text-xl font-bold mb-4 text-gray-900">{{ t('login.title') }}</h1>
                <p class="text-gray-500 mb-10 text-base">
                    {{ t('login.descLine1') }}<br />{{ t('login.descLine2') }}
                </p>

                <div class="w-full max-w-xs mb-8">
                    <div class="mb-4">
                        <t-select v-model="selectedCountry" :placeholder="t('login.selectCountry')" filterable>
                            <t-option v-for="country in Countries" :key="country.country_code"
                                :value="country.country_code" :label="`+${country.calling_codes[0]} ${country.name}`">
                                <span>+{{ country.calling_codes[0] }} {{ country.name }}</span>
                            </t-option>
                        </t-select>
                    </div>
                    <div
                        class="flex items-center border border-gray-300 rounded-xl px-4 py-3 focus-within:border-[#3390ec] transition-colors">
                        <span class="text-base text-gray-500 mr-3">+</span>
                        <input type="text" :placeholder="t('login.phonePlaceholder')" v-model="phoneNumber"
                            class="flex-1 text-base outline-none bg-transparent placeholder-gray-400 text-black" />
                    </div>
                </div>

                <t-button variant="outline" class="placement-top-right" @click="login">
                    {{ t('login.next') }}
                </t-button>
            </div>

            <!-- Divider -->
            <div class="h-[80dvh] w-px bg-gray-200"></div>

            <!-- Right Side: QR Code -->
            <div class="flex-1 flex flex-col items-center text-center px-8">
                <div ref="qrCodeContainer" @click="startQrLogin"
                    class="mb-6 p-2 border border-gray-100 rounded-2xl shadow-sm relative w-[220px] h-[220px] flex items-center justify-center cursor-pointer hover:border-blue-300 transition-colors">
                    <div v-if="!qrlink"
                        class="absolute inset-0 flex flex-col items-center justify-center text-center text-gray-400 px-4">
                        <div class="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center mb-3">
                            <span class="text-2xl">QR</span>
                        </div>
                        <div class="text-sm">{{ t('login.clickToShowQr') }}</div>
                    </div>
                </div>

                <h2 class="text-xl font-bold mb-4 text-gray-800">{{ t('login.scanTitle') }}</h2>
                <ol class="text-left text-gray-600 space-y-2 text-sm">
                    <li>{{ t('login.step1') }}</li>
                    <li>{{ t('login.step2') }}</li>
                    <li>{{ t('login.step3') }}</li>
                </ol>
            </div>
        </div>
    </div>
</template>
