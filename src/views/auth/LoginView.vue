<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import QRCodeStyling from "qr-code-styling";
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";
import { useI18n } from 'vue-i18n';
import i18n from "../../i18n";
import { tdlibSend } from "../../utils/tdlib";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MessagePlugin } from 'tdesign-vue-next';
import type { AuthorizationState, Update, countryInfo } from "tdlib-types";
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import LoginProxyMenu from "./LoginProxyMenu.vue";
import LoginSystemMenu from "./LoginSystemMenu.vue";



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

/**
 * 国家显示名：
 * - 中文 locale 下，对 native 名称本身为汉字（中文可读）的常见地区使用其本地名（name），
 *   其余统一用英文名（english_name），避免显示用户看不懂的外语本地名。
 * - 非中文 locale 统一用英文名（english_name），保证通用可读。
 */
const isChineseLocale = computed(() => i18n.global.locale.value.startsWith("zh"));
function displayName(c: countryInfo): string {
    // native name 为汉字的地区（中国、香港、澳门、台湾、新加坡、日本），中文用户可直接识别
    const zhReadable = new Set(["CN", "HK", "MO", "TW", "SG", "JP"]);
    if (isChineseLocale.value && zhReadable.has(c.country_code)) {
        return c.name || c.english_name;
    }
    return c.english_name || c.name;
}

/** 常用国家/地区置顶（按区号），便于快速选择 */
const COUNTRY_PRIORITY: Record<string, number> = { CN: 0, HK: 1, MO: 2, TW: 3, US: 4, JP: 5, SG: 6 };
/** 按优先级 + 英文名排序后的国家列表 */
const sortedCountries = computed(() => {
    return [...Countries.value].sort((a, b) => {
        const pa = COUNTRY_PRIORITY[a.country_code];
        const pb = COUNTRY_PRIORITY[b.country_code];
        if (pa !== undefined || pb !== undefined) return (pa ?? 99) - (pb ?? 99);
        return displayName(a).localeCompare(displayName(b));
    });
});

/** 自定义过滤：支持按国家名（中/英）、区号搜索 */
function countryFilter(search: string, option: any): boolean {
    if (!search) return true;
    const kw = search.trim().toLowerCase();
    const c: countryInfo = sortedCountries.value.find(x => x.country_code === option?.value) as countryInfo;
    if (!c) return false;
    return (
        c.english_name.toLowerCase().includes(kw) ||
        c.name.toLowerCase().includes(kw) ||
        c.calling_codes.some(code => code.toLowerCase().includes(kw)) ||
        c.country_code.toLowerCase().includes(kw)
    );
}

/**
 * 用 libphonenumber-js（无参 AsYouType）对号码做格式化显示。
 * 无参 AsYouType 以 `+区号` 开头自动识别国家，删除时也稳定（不会把区号当作本地号码造成 `+86 86`）。
 * 若内容无任何数字，则直接清空（避免残留孤立的 `+`）。
 */
function onPhoneInput() {
    const digits = phoneNumber.value.replace(/[^\d+]/g, "");
    const withPlus = digits.startsWith("+") ? digits : "+" + digits;
    if (!withPlus.replace(/[^\d]/g, "")) {
        phoneNumber.value = "";
        return;
    }
    const asYouType = new AsYouType();
    phoneNumber.value = asYouType.input(withPlus);
}

// 输入框优先：当输入框中的区号变化时，让选择器跟随更新。
watch(phoneNumber, (newVal) => {
    const cleanNum = newVal.replace(/[^\d]/g, "");
    if (!cleanNum) return;

    let detected: string | null = null;
    // 优先用 libphonenumber-js 精确识别国家：能区分 +1 共享区号的美加等国家
    // （如 +1416... 是多伦多=CA，+1202... 是华盛顿=US），而 TDLib 的 calling_codes
    // 对共享区号只返回第一个匹配项，无法区分。
    const parsed = parsePhoneNumberFromString('+' + cleanNum);
    if (parsed?.country) {
        detected = parsed.country;
    } else {
        // 号码过短（如 +1、+1416）时 libphonenumber 尚无法确定国家，回退用 Countries 匹配最长区号
        let best: string | null = null;
        let maxLen = 0;
        for (const c of Countries.value) {
            for (const code of c.calling_codes) {
                if (cleanNum.startsWith(code) && code.length > maxLen) {
                    maxLen = code.length;
                    best = c.country_code;
                }
            }
        }
        detected = best;
    }

    if (detected && detected !== selectedCountry.value) {
        // 标记该选择器变化来自输入框，watch(selectedCountry) 据此不再回填输入框
        isAutoSwitching.value = true;
        selectedCountry.value = detected;
    }
});

// 选择器 → 输入框：手动选择国家时，若输入框为空则预填 +区号，便于接着输入本地号码。
// 输入框触发的选择器变化（isAutoSwitching）不覆盖已有输入。
watch(selectedCountry, (newVal) => {
    if (isAutoSwitching.value) {
        isAutoSwitching.value = false;
        return;
    }
    const country = Countries.value.find((c) => c.country_code === newVal);
    if (country && country.calling_codes.length > 0) {
        const current = phoneNumber.value.replace(/[^\d]/g, "");
        if (!current) {
            phoneNumber.value = "+" + country.calling_codes[0];
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

    // 去掉格式化产生的非数字字符，得到含区号的完整号码，并补上 +（E.164）
    const cleanNum = phoneNumber.value.replace(/[^\d]/g, "");
    if (!cleanNum) return;
    const rawPhone = '+' + cleanNum;

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
    const appWindow = getCurrentWindow();

    await appWindow.setMinSize(new LogicalSize(700, 450));

    // 登录页面使用默认 mica 效果
    try {
        await invoke("set_window_effect", { effect: "mica" });
    } catch (e) {
        console.warn("设置 Mica 失败:", e);
    }

    try {
        await appWindow.setShadow(true);
    } catch (e) {
        console.warn("开启窗口阴影失败:", e);
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
    <div class="flex justify-center items-center h-full select-none relative">
        <!-- 右上角 API/测试DC 与 代理设置按钮 -->
        <div class="absolute top-4 right-4 z-20 flex items-center gap-2">
            <LoginSystemMenu />
            <LoginProxyMenu />
        </div>

        <div class="flex w-200 items-center justify-between">
            <!-- Left Side: Phone Login -->
            <div class="flex-1 flex flex-col items-center text-center px-8">
                <h1 class="text-xl font-bold mb-4 text-gray-900">{{ t('login.title') }}</h1>
                <p class="text-gray-500 mb-10 text-base">
                    {{ t('login.descLine1') }}<br />{{ t('login.descLine2') }}
                </p>

                <div class="w-full max-w-xs mb-8">
                    <div class="mb-4">
                        <t-select v-model="selectedCountry" :placeholder="t('login.selectCountry')" filterable
                            :filter="countryFilter" class="country-select">
                            <t-option v-for="country in sortedCountries" :key="country.country_code"
                                :value="country.country_code"
                                :label="`${country.flag_emoji} +${country.calling_codes[0]} ${displayName(country)}`">
                                <span class="flex items-center gap-2">
                                    <span class="w-6 text-left shrink-0">{{ country.flag_emoji || '🏳️' }}</span>
                                    <span class="flex-1 min-w-0 truncate">{{ displayName(country) }}</span>
                                    <span class="text-gray-400 text-xs shrink-0">+{{ country.calling_codes[0] }}</span>
                                </span>
                            </t-option>
                        </t-select>
                    </div>
                    <div
                        class="flex items-center border border-gray-300 rounded-xl px-4 py-3 focus-within:border-[#3390ec] transition-colors">
                        <input type="tel" inputmode="tel" :placeholder="t('login.phonePlaceholder')"
                            v-model="phoneNumber" @input="onPhoneInput"
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
                    class="mb-6 p-2 border border-gray-100 rounded-2xl shadow-sm relative w-55 h-55 flex items-center justify-center cursor-pointer hover:border-blue-300 transition-colors">
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
