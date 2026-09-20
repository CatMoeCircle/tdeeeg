<template>
    <Teleport to="body">
        <Transition name="tfa-fade">
            <div v-if="modelValue" class="fixed inset-0 z-200 flex items-center justify-center p-4"
                @mousedown.self="onClose">
                <div class="absolute inset-0 bg-black/40" :class="disableConfirmVisible ? '' : 'backdrop-blur-sm'">
                </div>
                <div
                    class="relative w-full max-w-md max-h-[min(520px,82vh)] flex flex-col rounded-2xl bg-white dark:bg-[#1f2937] shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- 顶部：返回 / 标题 / 关闭 -->
                    <div
                        class="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <button v-if="showBack" type="button"
                            class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="onBack">
                            <ChevronLeftIcon class="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        </button>
                        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 flex-1"
                            :class="showBack ? '' : 'pl-1'">
                            {{ stepTitle }}
                        </h3>
                        <button type="button" :aria-label="t('lng_close')"
                            class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="onClose">
                            <XIcon class="w-4.5 h-4.5" />
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto custom-scrollbar">
                        <!-- 打开初始化中：避免残留上一次步骤闪一下 -->
                        <div v-if="booting" class="px-6 py-16 flex items-center justify-center">
                            <p class="text-sm text-gray-400">{{ t('lng_contacts_loading') }}</p>
                        </div>

                        <!-- 认证门禁 -->
                        <div v-else-if="step === 'auth'" class="px-6 py-5 flex flex-col items-center text-center">
                            <div class="w-24 h-24 flex items-center justify-center overflow-hidden mb-2">
                                <TgsPlayer v-if="monkeyData" ref="playerRef" :data="monkeyData" :loop="false"
                                    :autoplay="false" :report-frames="true" :force-render="true" :size="96"
                                    @load="onPlayerLoad" @complete="onPlayerComplete" />
                            </div>
                            <h4 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5">
                                {{ t('lng_settings_cloud_password_check_subtitle') }}
                            </h4>
                            <p class="text-sm text-gray-400 leading-relaxed mb-5">
                                {{ t('lng_settings_cloud_password_manage_about1') }}
                            </p>

                            <div class="w-full text-left mb-4">
                                <label class="text-sm text-blue-500 font-medium mb-1 block">
                                    {{ t('lng_cloud_password_enter_old') }}
                                </label>
                                <input ref="passwordInputRef" v-model="password" type="password" autocomplete="off"
                                    spellcheck="false"
                                    class="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-blue-500 text-base text-gray-900 dark:text-gray-100 outline-none focus:outline-none"
                                    @keydown.enter="submitAuthOrPassword" />
                                <p v-if="passwordState?.password_hint"
                                    class="mt-2 text-sm text-gray-800 dark:text-gray-200">
                                    {{ t('lng_signin_hint', { password_hint: passwordState.password_hint }) }}
                                </p>
                            </div>

                            <p v-if="authError" class="w-full text-left text-xs text-red-500 mb-3">{{ authError }}</p>

                            <button type="button"
                                class="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                                :disabled="submitting || !password" @click="submitAuthOrPassword">
                                {{ submitting ? t('lng_contacts_loading') : t('lng_passcode_check_button') }}
                            </button>
                        </div>

                        <!-- 创建 / 修改密码：两次输入 -->
                        <div v-else-if="step === 'change-password' || step === 'setup-password'"
                            class="px-6 py-5 flex flex-col items-center text-center">
                            <div class="w-24 h-24 flex items-center justify-center overflow-hidden mb-2">
                                <TgsPlayer v-if="monkeyData" ref="playerRef" :data="monkeyData" :loop="false"
                                    :autoplay="false" :report-frames="true" :force-render="true" :size="96"
                                    @load="onPlayerLoad" @complete="onPlayerComplete" />
                            </div>
                            <h4 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5">
                                {{ step === 'change-password'
                                    ? t('lng_settings_cloud_password_manage_password_change')
                                    : t('lng_settings_cloud_password_password_subtitle') }}
                            </h4>
                            <p class="text-sm text-gray-400 leading-relaxed mb-5">
                                {{ t('lng_cloud_password_about') }}
                            </p>

                            <div class="w-full text-left mb-3">
                                <label class="text-sm text-blue-500 font-medium mb-1 block">
                                    {{ t('lng_cloud_password_enter_new') }}
                                </label>
                                <input ref="passwordInputRef" v-model="password" type="password"
                                    autocomplete="new-password" spellcheck="false"
                                    class="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-blue-500 text-base text-gray-900 dark:text-gray-100 outline-none focus:outline-none"
                                    @keydown.enter="focusConfirmOrSubmit" />
                            </div>

                            <div class="w-full text-left mb-4">
                                <label class="text-sm text-blue-500 font-medium mb-1 block">
                                    {{ t('lng_cloud_password_confirm_new') }}
                                </label>
                                <input ref="passwordConfirmInputRef" v-model="passwordConfirm" type="password"
                                    autocomplete="new-password" spellcheck="false"
                                    class="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-blue-500 text-base text-gray-900 dark:text-gray-100 outline-none focus:outline-none"
                                    @keydown.enter="submitAuthOrPassword" />
                            </div>

                            <p v-if="authError" class="w-full text-left text-xs text-red-500 mb-3">{{ authError }}</p>

                            <button type="button"
                                class="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                                :disabled="submitting || !password || !passwordConfirm" @click="submitAuthOrPassword">
                                {{ submitting ? t('lng_contacts_loading') : t('lng_passport_next') }}
                            </button>
                        </div>

                        <!-- 管理菜单 -->
                        <div v-else-if="step === 'menu'" class="flex flex-col h-full">
                            <div
                                class="bg-gray-50 dark:bg-gray-800/60 px-6 py-5 flex flex-col items-center text-center shrink-0">
                                <div class="w-20 h-20 flex items-center justify-center overflow-hidden mb-2">
                                    <TgsPlayer v-if="introData" :data="introData" :loop="true" :autoplay="true"
                                        :size="80" />
                                </div>
                                <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm">
                                    {{ t('lng_settings_cloud_password_manage_about1') }}
                                </p>
                            </div>

                            <div class="flex-1 flex flex-col">
                                <div
                                    class="divide-y divide-gray-100 dark:divide-gray-800 border-b border-gray-200 dark:border-gray-700">
                                    <button type="button"
                                        class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        @click="gotoChangePassword">
                                        <KeyRoundIcon class="w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0" />
                                        <span class="text-sm text-gray-800 dark:text-gray-100">{{
                                            t('lng_settings_cloud_password_manage_password_change') }}</span>
                                    </button>
                                    <button type="button"
                                        class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        @click="gotoChangeEmail">
                                        <MailIcon class="w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0" />
                                        <div class="min-w-0 flex-1">
                                            <p class="text-sm text-gray-800 dark:text-gray-100">
                                                {{ recoveryEmail ? t('lng_settings_cloud_password_manage_email_change')
                                                    :
                                                    t('lng_settings_cloud_password_manage_email_new') }}
                                            </p>
                                            <p v-if="recoveryEmail" class="text-xs text-gray-400 mt-0.5 truncate">
                                                {{ recoveryEmail }}</p>
                                        </div>
                                    </button>
                                </div>
                                <p class="px-5 py-2 text-xs text-gray-400 leading-relaxed">
                                    {{ t('lng_settings_cloud_password_manage_about2') }}
                                </p>
                                <div class="mt-auto border-t border-gray-200 dark:border-gray-700">
                                    <button type="button"
                                        class="w-full text-left px-5 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                        @click="disableConfirmVisible = true">
                                        {{ t('lng_settings_password_disable') }}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 设置提示 -->
                        <div v-else-if="step === 'change-hint' || step === 'setup-hint'"
                            class="px-6 py-5 flex flex-col items-center text-center">
                            <div class="w-24 h-24 flex items-center justify-center overflow-hidden mb-2">
                                <TgsPlayer v-if="hintData" :data="hintData" :loop="true" :autoplay="true" :size="96" />
                            </div>
                            <h4 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5">{{
                                t('lng_settings_cloud_password_hint_subtitle') }}</h4>
                            <p class="text-sm text-gray-400 leading-relaxed mb-5">
                                {{ t('lng_settings_cloud_password_hint_about') }}
                            </p>

                            <div class="w-full text-left mb-4">
                                <label class="text-sm text-blue-500 font-medium mb-1 block">{{
                                    t('lng_cloud_password_hint') }}</label>
                                <input v-model="hint" type="text" maxlength="64" spellcheck="false"
                                    class="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-blue-500 text-base text-gray-900 dark:text-gray-100 outline-none focus:outline-none"
                                    @keydown.enter="submitHint" />
                            </div>

                            <div class="w-full space-y-1.5">
                                <button type="button"
                                    class="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                                    :disabled="submitting" @click="submitHint">
                                    {{ submitting ? t('lng_contacts_loading') : t('lng_continue') }}
                                </button>
                                <button type="button" class="w-full py-1.5 text-sm text-blue-500 hover:underline"
                                    :disabled="submitting" @click="skipHint">
                                    {{ t('lng_settings_cloud_password_skip_hint') }}
                                </button>
                            </div>
                        </div>

                        <!-- 修改恢复邮箱 -->
                        <div v-else-if="step === 'change-email'"
                            class="px-6 py-5 flex flex-col items-center text-center">
                            <div class="w-24 h-24 flex items-center justify-center overflow-hidden mb-2">
                                <TgsPlayer v-if="mailData" :data="mailData" :loop="true" :autoplay="true" :size="96" />
                            </div>
                            <h4 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5">{{
                                recoveryEmail
                                    ? t('lng_settings_cloud_password_manage_email_change')
                                    : t('lng_settings_cloud_password_email_subtitle') }}</h4>
                            <p class="text-sm text-gray-400 leading-relaxed mb-5">
                                {{ t('lng_settings_cloud_password_email_about') }}
                            </p>

                            <div class="w-full text-left mb-4">
                                <label class="text-sm text-blue-500 font-medium mb-1 block">{{
                                    t('lng_cloud_password_email') }}</label>
                                <input v-model="email" type="email" autocomplete="off" spellcheck="false"
                                    class="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-blue-500 text-base text-gray-900 dark:text-gray-100 outline-none focus:outline-none"
                                    @keydown.enter="submitEmail" />
                            </div>

                            <button type="button"
                                class="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                                :disabled="submitting || !email.trim()" @click="submitEmail">
                                {{ submitting ? t('lng_contacts_loading') : t('lng_settings_cloud_password_save') }}
                            </button>
                        </div>

                        <!-- 邮箱验证码 -->
                        <div v-else-if="step === 'email-code'" class="px-6 py-5 flex flex-col items-center text-center">
                            <div class="w-24 h-24 flex items-center justify-center overflow-hidden mb-2">
                                <TgsPlayer v-if="codeData" :data="codeData" :loop="true" :autoplay="true" :size="96" />
                            </div>
                            <h4 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5">{{
                                t('lng_cloud_password_confirm') }}</h4>
                            <p class="text-sm text-gray-400 leading-relaxed mb-5">
                                {{ t('lng_cloud_password_waiting_code', { email }) }}
                            </p>

                            <div class="w-full text-left mb-4">
                                <label class="text-sm text-blue-500 font-medium mb-1 block">{{
                                    t('lng_change_phone_code_title') }}</label>
                                <input v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code"
                                    spellcheck="false"
                                    class="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-blue-500 text-base tracking-widest text-gray-900 dark:text-gray-100 outline-none focus:outline-none"
                                    @keydown.enter="submitCode" />
                            </div>

                            <div class="w-full space-y-1.5">
                                <button type="button"
                                    class="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                                    :disabled="submitting || !code.trim()" @click="submitCode">
                                    {{ submitting ? t('lng_contacts_loading') :
                                        t('lng_settings_cloud_password_email_confirm') }}
                                </button>
                                <button type="button" class="w-full py-1.5 text-sm text-blue-500 hover:underline"
                                    :disabled="submitting || resendCooldown > 0" @click="resendCode">
                                    {{ resendCooldown > 0 ? t('lng_polls_ends_in_time', { time: resendCooldown }) :
                                        t('lng_cloud_password_resend')
                                    }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- 停用确认（小窗，无动画） -->
    <ModalDialog v-model="disableConfirmVisible" :title="t('lng_settings_password_disable')">
        <div class="space-y-4">
            <p class="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                {{ t('lng_settings_cloud_password_manage_disable_sure') }}
            </p>
            <div class="flex items-center justify-end gap-2">
                <button type="button"
                    class="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    @click="disableConfirmVisible = false">
                    {{ t('lng_cancel') }}
                </button>
                <button type="button" :disabled="submitting"
                    class="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                    @click="confirmDisable">
                    {{ submitting ? t('lng_contacts_loading') : t('lng_settings_auto_night_disable') }}
                </button>
            </div>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { ChevronLeft as ChevronLeftIcon, X as XIcon, KeyRound as KeyRoundIcon, Mail as MailIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import TgsPlayer from '../../components/common/TgsPlayer.vue';
import ModalDialog from '../../components/settings/ModalDialog.vue';
import { tdlibSend } from '../../utils/tdlib';
import { usePasswordMonkey } from '../../composables/usePasswordMonkey';
import type { PasswordState, RecoveryEmailAddress } from 'tdlib-types';

type Step =
    | 'auth'
    | 'menu'
    | 'change-password'
    | 'change-hint'
    | 'change-email'
    | 'email-code'
    | 'setup-password'
    | 'setup-hint';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'changed'): void;
}>();

const { t } = useI18n();

const MONKEY_TGS_URL = new URL('../../assets/animations/AuthorizationStateWaitPassword.tgs', import.meta.url).href;
const INTRO_TGS_URL = new URL('../../assets/animations/TwoFactorSetupIntro.tgs', import.meta.url).href;
const HINT_TGS_URL = new URL('../../assets/animations/TwoFactorSetupHint.tgs', import.meta.url).href;
const MAIL_TGS_URL = new URL('../../assets/animations/TwoFactorSetupMail.tgs', import.meta.url).href;
const CODE_TGS_URL = new URL('../../assets/animations/TwoFactorSetupCode.tgs', import.meta.url).href;

const monkeyData = ref<Uint8Array | null>(null);
const introData = ref<Uint8Array | null>(null);
const hintData = ref<Uint8Array | null>(null);
const mailData = ref<Uint8Array | null>(null);
const codeData = ref<Uint8Array | null>(null);
let tgsLoaded = false;

async function loadTgs(url: string): Promise<Uint8Array | null> {
    try {
        const resp = await fetch(url);
        return new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error('TwoFactorDialog: failed to load tgs:', url, e);
        return null;
    }
}

const step = ref<Step>('auth');
const booting = ref(false);
const passwordState = ref<PasswordState | null>(null);
const recoveryEmail = ref('');
const password = ref('');
const passwordConfirm = ref('');
const hint = ref('');
const email = ref('');
const code = ref('');
const submitting = ref(false);
const authError = ref('');
const disableConfirmVisible = ref(false);
const passwordInputRef = ref<HTMLInputElement | null>(null);
const passwordConfirmInputRef = ref<HTMLInputElement | null>(null);
const resendCooldown = ref(0);
let resendTimer: ReturnType<typeof setInterval> | null = null;

/** 认证成功后的旧密码，供 setPassword / setRecoveryEmailAddress 复用 */
const verifiedPassword = ref('');
/** 修改密码流程中暂存的新密码 */
const pendingNewPassword = ref('');

const monkey = usePasswordMonkey(password);
// 模板 ref="playerRef" 需要 setup 作用域中存在同名 ref，才能接到 TgsPlayer 实例
const playerRef = monkey.playerRef;
void playerRef;
const { onPlayerLoad, onPlayerComplete } = monkey;

const showBack = computed(() => {
    return step.value === 'change-password'
        || step.value === 'change-hint'
        || step.value === 'setup-hint'
        || step.value === 'change-email'
        || step.value === 'email-code';
});

const stepTitle = computed(() => {
    switch (step.value) {
        case 'menu':
            return t('lng_settings_cloud_password_start_title');
        case 'change-password':
            return t('lng_settings_cloud_password_manage_password_change');
        case 'setup-password':
            return t('lng_settings_cloud_password_password_subtitle');
        case 'change-hint':
        case 'setup-hint':
            return t('lng_settings_cloud_password_hint_title');
        case 'change-email':
            return t('lng_settings_cloud_password_email_title');
        case 'email-code':
            return t('lng_settings_cloud_password_email_title');
        default:
            return t('lng_settings_cloud_password_password_title');
    }
});

function close() {
    emit('update:modelValue', false);
    emit('changed');
}

function onClose() {
    if (submitting.value) return;
    // 若在邮箱验证码阶段关闭，取消待确认的验证
    if (step.value === 'email-code') {
        try {
            void tdlibSend({ _: 'cancelRecoveryEmailAddressVerification' });
        } catch { /* 忽略 */ }
    }
    close();
}

function onBack() {
    if (submitting.value) return;
    if (step.value === 'change-password') {
        resetPasswordField();
        step.value = 'menu';
        return;
    }
    if (step.value === 'change-hint') {
        step.value = 'change-password';
        return;
    }
    if (step.value === 'setup-hint') {
        step.value = 'setup-password';
        return;
    }
    if (step.value === 'change-email' || step.value === 'email-code') {
        if (step.value === 'email-code') {
            try {
                void tdlibSend({ _: 'cancelRecoveryEmailAddressVerification' });
            } catch { /* 忽略 */ }
        }
        backToMenu();
        return;
    }
    close();
}

function resetPasswordField() {
    authError.value = '';
    passwordConfirm.value = '';
    monkey.resetToEmpty();
}

function applyPasswordState(res: PasswordState | null | undefined) {
    if (res && res._ === 'passwordState') {
        passwordState.value = res;
    }
}

async function loadPasswordState() {
    try {
        const res = (await tdlibSend({ _: 'getPasswordState' })) as PasswordState;
        passwordState.value = res;
    } catch (e) {
        console.error('TwoFactorDialog: getPasswordState failed:', e);
    }
}

async function ensureTgsLoaded() {
    if (tgsLoaded) return;
    const [monkeyBytes, introBytes, hintBytes, mailBytes, codeBytes] = await Promise.all([
        loadTgs(MONKEY_TGS_URL),
        loadTgs(INTRO_TGS_URL),
        loadTgs(HINT_TGS_URL),
        loadTgs(MAIL_TGS_URL),
        loadTgs(CODE_TGS_URL),
    ]);
    monkeyData.value = monkeyBytes;
    introData.value = introBytes;
    hintData.value = hintBytes;
    mailData.value = mailBytes;
    codeData.value = codeBytes;
    tgsLoaded = true;
}

async function initStep() {
    await loadPasswordState();
    const has = !!passwordState.value?.has_password;
    if (has) {
        step.value = 'auth';
        resetPasswordField();
        await nextTick();
        passwordInputRef.value?.focus();
    } else {
        pendingNewPassword.value = '';
        verifiedPassword.value = '';
        hint.value = '';
        step.value = 'setup-password';
        resetPasswordField();
        await nextTick();
        passwordInputRef.value?.focus();
    }
}

function focusConfirmOrSubmit() {
    if (!passwordConfirm.value) {
        passwordConfirmInputRef.value?.focus();
        return;
    }
    void submitAuthOrPassword();
}

async function submitAuthOrPassword() {
    if (submitting.value) return;

    if (step.value === 'auth') {
        if (!password.value) return;
        authError.value = '';
        submitting.value = true;
        try {
            const res = (await tdlibSend({
                _: 'getRecoveryEmailAddress',
                password: password.value,
            })) as RecoveryEmailAddress;
            verifiedPassword.value = password.value;
            recoveryEmail.value = res?.recovery_email_address ?? '';
            resetPasswordField();
            step.value = 'menu';
            await loadPasswordState();
        } catch (e: any) {
            authError.value = e?.message || t('lng_cloud_password_wrong');
            MessagePlugin.error(authError.value);
        } finally {
            submitting.value = false;
        }
        return;
    }

    if (step.value === 'change-password' || step.value === 'setup-password') {
        if (!password.value || !passwordConfirm.value) return;
        if (password.value !== passwordConfirm.value) {
            authError.value = t('lng_cloud_password_differ');
            return;
        }
        authError.value = '';
        pendingNewPassword.value = password.value;
        resetPasswordField();
        hint.value = '';
        step.value = step.value === 'change-password' ? 'change-hint' : 'setup-hint';
    }
}

function gotoChangePassword() {
    authError.value = '';
    step.value = 'change-password';
    resetPasswordField();
    nextTick(() => passwordInputRef.value?.focus());
}

function gotoChangeEmail() {
    email.value = '';
    code.value = '';
    step.value = 'change-email';
}

function backToMenu() {
    code.value = '';
    email.value = '';
    step.value = 'menu';
}

async function submitHint() {
    if (submitting.value) return;
    submitting.value = true;
    try {
        const isNew = step.value === 'setup-hint';
        const oldPassword = isNew ? '' : verifiedPassword.value;
        const res = (await tdlibSend({
            _: 'setPassword',
            old_password: oldPassword,
            new_password: pendingNewPassword.value,
            new_hint: hint.value.trim(),
            set_recovery_email_address: false,
        })) as PasswordState;
        applyPasswordState(res);
        MessagePlugin.success(t('lng_cloud_password_updated'));
        if (isNew) {
            close();
        } else {
            verifiedPassword.value = pendingNewPassword.value;
            pendingNewPassword.value = '';
            hint.value = '';
            step.value = 'menu';
            await loadPasswordState();
        }
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('lng_attach_failed'));
    } finally {
        submitting.value = false;
    }
}

async function skipHint() {
    if (submitting.value) return;
    hint.value = '';
    await submitHint();
}

async function submitEmail() {
    if (submitting.value || !email.value.trim()) return;
    submitting.value = true;
    try {
        await tdlibSend({
            _: 'setRecoveryEmailAddress',
            password: verifiedPassword.value,
            new_recovery_email_address: email.value.trim(),
        });
        code.value = '';
        step.value = 'email-code';
        startResendCooldown();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('lng_attach_failed'));
    } finally {
        submitting.value = false;
    }
}

async function submitCode() {
    if (submitting.value || !code.value.trim()) return;
    submitting.value = true;
    try {
        const res = (await tdlibSend({
            _: 'checkRecoveryEmailAddressCode',
            code: code.value.trim(),
        })) as PasswordState;
        applyPasswordState(res);
        recoveryEmail.value = email.value.trim();
        MessagePlugin.success(t('lng_cloud_password_updated'));
        email.value = '';
        code.value = '';
        step.value = 'menu';
        await loadPasswordState();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('lng_bad_code'));
    } finally {
        submitting.value = false;
    }
}

function startResendCooldown() {
    resendCooldown.value = 60;
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
        resendCooldown.value -= 1;
        if (resendCooldown.value <= 0) {
            if (resendTimer) clearInterval(resendTimer);
            resendTimer = null;
        }
    }, 1000);
}

async function resendCode() {
    if (resendCooldown.value > 0 || submitting.value) return;
    try {
        await tdlibSend({ _: 'resendRecoveryEmailAddressCode' });
        MessagePlugin.success(t('lng_cloud_password_resent'));
        startResendCooldown();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('lng_attach_failed'));
    }
}

async function confirmDisable() {
    if (submitting.value) return;
    submitting.value = true;
    try {
        const res = (await tdlibSend({
            _: 'setPassword',
            old_password: verifiedPassword.value,
            new_password: '',
            new_hint: '',
            set_recovery_email_address: false,
        })) as PasswordState;
        applyPasswordState(res);
        MessagePlugin.success(t('lng_signin_password_removed'));
        disableConfirmVisible.value = false;
        close();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('lng_attach_failed'));
    } finally {
        submitting.value = false;
    }
}

function resetAll() {
    step.value = 'auth';
    password.value = '';
    passwordConfirm.value = '';
    hint.value = '';
    email.value = '';
    code.value = '';
    authError.value = '';
    verifiedPassword.value = '';
    pendingNewPassword.value = '';
    recoveryEmail.value = '';
    submitting.value = false;
    disableConfirmVisible.value = false;
    resendCooldown.value = 0;
    if (resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
    }
    monkey.resetToEmpty();
}

watch(() => props.modelValue, async (open) => {
    if (!open) {
        if (step.value === 'email-code') {
            try {
                void tdlibSend({ _: 'cancelRecoveryEmailAddressVerification' });
            } catch { /* 忽略 */ }
        }
        resetAll();
        booting.value = false;
        return;
    }
    resetAll();
    booting.value = true;
    try {
        await ensureTgsLoaded();
        await initStep();
    } finally {
        booting.value = false;
    }
});

onUnmounted(() => {
    if (resendTimer) clearInterval(resendTimer);
});
</script>

<style scoped>
.tfa-fade-enter-active,
.tfa-fade-leave-active {
    transition: opacity 0.15s ease;
}

.tfa-fade-enter-from,
.tfa-fade-leave-to {
    opacity: 0;
}
</style>
