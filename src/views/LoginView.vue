<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import QRCodeStyling from "qr-code-styling";
import { useI18n } from 'vue-i18n';
import { tdlibSend } from "../utils/tdlib";
import { listen } from "@tauri-apps/api/event";
import { MessagePlugin } from 'tdesign-vue-next';
import type { Update, countryInfo } from "tdlib-types";
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

const login = async () => {
    if (!phoneNumber.value) return;
    try {
        await tdlibSend({
            _: "setAuthenticationPhoneNumber",
            phone_number: phoneNumber.value,
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
    switch (State._) {
        case "authorizationStateWaitOtherDeviceConfirmation":
            console.log(State.link);
            qrlink.value = State.link;
            break
        case "authorizationStateReady":
            router.push("/home");
            break;
        case "authorizationStateWaitPhoneNumber":
            tdlibSend({
                _: "requestQrCodeAuthentication",
            });

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
};

onMounted(async () => {
    await getCurrentWindow().setMinSize(new LogicalSize(700, 450));


    qrlinkupdate = await listen<Update>("tdlib-update", async (event) => {
        const update = event.payload;
        if (update._ === "updateAuthorizationState" && update.authorization_state._ === "authorizationStateWaitOtherDeviceConfirmation") {
            qrlink.value = update.authorization_state.link;
        }
        if (update._ === "updateAuthorizationState" && update.authorization_state._ === "authorizationStateReady") {
            router.push("/home");
        }
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
    qrCode = new QRCodeStyling({
        width: 220,
        height: 220,
        type: "svg",
        data: qrlink.value,
        image: "https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg",
        dotsOptions: {
            color: "#000",
            type: "rounded"
        },
        backgroundOptions: {
            color: "#ffffff",
        },
        imageOptions: {
            crossOrigin: "anonymous",
        },
        cornersSquareOptions: {
            type: "extra-rounded"
        }
    });

    if (qrCodeContainer.value) {
        qrCode.append(qrCodeContainer.value);
    }

    // 当 qrlink 变化时实时更新二维码的内容
    watch(qrlink, async (val) => {
        if (!qrCode) return;

        // 等待 Vue 完成 DOM 更新（v-if 条件变化后）
        await nextTick();

        // 再次检查容器是否仍然存在且已挂载
        if (!qrCodeContainer.value) return;

        try {
            qrCode.update({ data: val || "telegram.org" });
        } catch (e) {
            // 如果库不支持 update，作为回退方案清空容器并重新 append
            // 但要确保容器仍然存在
            if (qrCodeContainer.value && qrCodeContainer.value.isConnected) {
                qrCodeContainer.value.innerHTML = "";
                qrCode.append(qrCodeContainer.value);
            }
        }
    });
});

onUnmounted(() => {

    // 清理二维码 DOM
    if (qrCodeContainer.value) qrCodeContainer.value.innerHTML = "";

    // 取消 TDLib 事件监听
    if (qrlinkupdate) {
        qrlinkupdate();
    }
});
</script>

<template>
    <div class="flex justify-center items-center h-full bg-white select-none">
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
                <div ref="qrCodeContainer"
                    class="mb-6 p-2 border border-gray-100 rounded-2xl shadow-sm relative w-[220px] h-[220px] flex items-center justify-center">
                    <div v-if="!qrlink"
                        class="absolute inset-0 flex flex-col items-center justify-center text-center text-gray-400 px-4">
                        <div class="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center mb-3">
                        </div>
                        <div class="text-sm">{{ t('login.waiting') }}</div>
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
