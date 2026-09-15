<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <!-- 顶部导航 -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('lng_settings_sessions_title') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-6">
                <!-- 区域1：当前设备 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_sessions_header') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                        <div class="flex items-start gap-3">
                            <div
                                class="w-10 h-10 shrink-0 rounded-full bg-teal-100 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                                <SmartphoneIcon class="w-5 h-5" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{
                                    currentDevice?.device_model || t('devices.unknownDevice') }}</p>
                                <dl class="mt-2 space-y-1 text-xs">
                                    <div class="flex items-center gap-2">
                                        <dt class="text-gray-400 w-20 shrink-0">{{ t('lng_sessions_application')
                                            }}</dt>
                                        <dd class="text-gray-700 dark:text-gray-200 min-w-0 truncate">{{
                                            clientLabel(currentDevice) }}</dd>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <dt class="text-gray-400 w-20 shrink-0">{{ t('lng_sessions_location')
                                            }}</dt>
                                        <dd class="text-gray-700 dark:text-gray-200 min-w-0 truncate">{{
                                            regionLabel(currentDevice) }}</dd>
                                    </div>
                                </dl>
                            </div>
                            <span class="text-[10px] text-teal-600 dark:text-teal-400 shrink-0">{{ t('devices.currentBadge')
                            }}</span>
                        </div>
                    </div>

                    <button type="button" @click="terminateOthers"
                        class="mt-3 w-full py-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-500 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        {{ t('lng_sessions_terminate_all') }}
                    </button>
                    <p class="text-xs text-gray-400 mt-2 leading-relaxed">{{ t('lng_sessions_terminate_all_about')
                    }}</p>
                    </div>
                </section>

                <!-- 区域2：活跃会话 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_settings_show_sessions') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                    <div v-if="loading" class="text-sm text-gray-400 py-8 text-center">{{ t('devices.loadingSessions')
                    }}</div>
                    <div v-else-if="otherSessions.length === 0" class="text-sm text-gray-400 py-8 text-center">{{
                        t('devices.noOtherSessions') }}</div>
                    <div v-else
                        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                        <div v-for="s in otherSessions" :key="s.id" class="flex items-center gap-3 px-4 py-3">
                            <div
                                class="w-9 h-9 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center">
                                <component :is="deviceIcon(s)" class="w-4.5 h-4.5" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{
                                    s.device_model || clientLabel(s) }}</p>
                                <p class="text-xs text-gray-400 mt-0.5 truncate">{{ clientLabel(s) }} · {{ regionLabel(s)
                                }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ lastActiveText(s) }}</p>
                            </div>
                            <button type="button" @click="terminateOne(s)"
                                class="shrink-0 text-xs text-red-500 hover:text-red-600 font-medium">{{
                                    t('lng_settings_reset_button') }}</button>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2 leading-relaxed">{{ t('lng_sessions_about_apps') }}</p>
                    </div>
                </section>

                <!-- 区域3：自动终止旧会话 -->
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('lng_settings_terminate_title') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 space-y-3">
                    <button type="button" @click="ttlVisible = true"
                        class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <TimerResetIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_settings_terminate_if')
                            }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ ttlText }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                    </div>
                </section>
            </div>
        </div>

        <!-- 自动终止旧会话弹窗 -->
        <SessionTtlDialog v-model="ttlVisible" :current-days="ttlDays" @changed="onTtlChanged" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
    Globe as GlobeIcon, Laptop as LaptopIcon, Smartphone as SmartphoneIcon,
    Tablet as TabletIcon, TimerReset as TimerResetIcon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import SessionTtlDialog, { ttlOptions } from '../../components/settings/SessionTtlDialog.vue';
import { tdlibSend } from '../../utils/tdlib';
import type { session, sessions } from 'tdlib-types';

const { t } = useI18n();
const router = useRouter();

function goBack() {
    router.back();
}

const loading = ref(true);
const sessionsList = ref<session[]>([]);
const ttlDays = ref(365);
const ttlVisible = ref(false);

const ttlText = computed(() => {
    const opt = ttlOptions.find((o) => o.days === ttlDays.value);
    if (opt) return t('devices.ttlSummary', { duration: t(opt.labelKey) });
    return t('devices.ttlSummaryDays', { days: ttlDays.value });
});

const currentDevice = computed(() => sessionsList.value.find((s) => s.is_current) ?? sessionsList.value[0]);
const otherSessions = computed(() => sessionsList.value.filter((s) => !s.is_current));

async function loadSessions() {
    loading.value = true;
    try {
        const res = (await tdlibSend({ _: 'getActiveSessions' })) as sessions;
        sessionsList.value = res?.sessions ?? [];
        ttlDays.value = res?.inactive_session_ttl_days ?? 365;
    } catch (e) {
        console.error('load sessions failed:', e);
        MessagePlugin.error(t('devices.loadFailed'));
    } finally {
        loading.value = false;
    }
}

function clientLabel(s?: session): string {
    if (!s) return t('devices.unknown');
    const name = s.application_name?.trim() || 'Telegram';
    const ver = s.application_version?.trim();
    return ver ? `${name} ${ver}` : name;
}

function regionLabel(s?: session): string {
    if (!s) return t('devices.unknown');
    const loc = s.location?.trim();
    const ip = s.ip_address?.trim();
    if (loc && ip) return `${loc} · ${ip}`;
    return loc || ip || t('devices.unknown');
}

function deviceTypeKey(s?: session): string {
    return (s?.device_type as { _?: string })?._ ?? '';
}

function deviceIcon(s: session) {
    const key = deviceTypeKey(s);
    if (key === 'sessionDeviceTypeIphone' || key === 'sessionDeviceTypeIpad' || key === 'sessionDeviceTypeApple') {
        return TabletIcon;
    }
    if (key === 'sessionDeviceTypeWindows' || key === 'sessionDeviceTypeLinux' || key === 'sessionDeviceTypeUbuntu' || key === 'sessionDeviceTypeMac') {
        return LaptopIcon;
    }
    if (key === 'sessionDeviceTypeChrome' || key === 'sessionDeviceTypeFirefox' || key === 'sessionDeviceTypeSafari'
        || key === 'sessionDeviceTypeEdge' || key === 'sessionDeviceTypeOpera' || key === 'sessionDeviceTypeVivaldi' || key === 'sessionDeviceTypeBrave') {
        return GlobeIcon;
    }
    return SmartphoneIcon;
}

function lastActiveText(s: session): string {
    const diffMin = Math.floor((Date.now() - s.last_active_date * 1000) / 60000);
    if (diffMin < 1) return t('devices.justNow');
    if (diffMin < 60) return t('devices.minutesAgo', { count: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t('devices.hoursAgo', { count: diffH });
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return t('devices.yesterday');
    if (diffD < 30) return t('devices.daysAgo', { count: diffD });
    const diffM = Math.floor(diffD / 30);
    if (diffM < 12) return t('devices.monthsAgo', { count: diffM });
    return t('devices.yearsAgo', { count: Math.floor(diffM / 12) });
}

async function terminateOne(s: session) {
    const ok = window.confirm(t('devices.terminateOneConfirm', { name: s.device_model || clientLabel(s) }));
    if (!ok) return;
    try {
        await tdlibSend({ _: 'terminateSession', session_id: s.id });
        MessagePlugin.success(t('devices.sessionTerminated'));
        loadSessions();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('devices.operationFailed'));
    }
}

async function terminateOthers() {
    const ok = window.confirm(t('lng_settings_reset_sure'));
    if (!ok) return;
    try {
        await tdlibSend({ _: 'terminateAllOtherSessions' });
        MessagePlugin.success(t('devices.allOtherTerminated'));
        loadSessions();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('devices.operationFailed'));
    }
}

function onTtlChanged(days: number) {
    ttlDays.value = days;
}

onMounted(loadSessions);
</script>
