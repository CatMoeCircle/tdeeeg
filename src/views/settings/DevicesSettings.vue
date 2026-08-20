<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
        <!-- 顶部导航 -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
            <button type="button" aria-label="返回"
                class="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="goBack">
                <ArrowLeftIcon class="w-5 h-5" />
            </button>
            <h2 class="text-lg font-semibold">设备</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <div class="max-w-2xl mx-auto p-6 space-y-6">
                <!-- 区域1：当前设备 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">当前设备</h3>
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4">
                        <div class="flex items-start gap-3">
                            <div
                                class="w-10 h-10 shrink-0 rounded-full bg-teal-100 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                                <SmartphoneIcon class="w-5 h-5" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ currentDevice?.device_model || '未知设备' }}</p>
                                <dl class="mt-2 space-y-1 text-xs">
                                    <div class="flex items-center gap-2">
                                        <dt class="text-gray-400 w-20 shrink-0">显示的客户端</dt>
                                        <dd class="text-gray-700 dark:text-gray-200 min-w-0 truncate">{{ clientLabel(currentDevice) }}</dd>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <dt class="text-gray-400 w-20 shrink-0">地区</dt>
                                        <dd class="text-gray-700 dark:text-gray-200 min-w-0 truncate">{{ regionLabel(currentDevice) }}</dd>
                                    </div>
                                </dl>
                            </div>
                            <span class="text-[10px] text-teal-600 dark:text-teal-400 shrink-0">当前</span>
                        </div>
                    </div>

                    <button type="button" @click="terminateOthers"
                        class="mt-3 w-full py-2.5 rounded-xl border border-red-200 dark:border-red-500/30 text-red-500 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        终止所有其它会话
                    </button>
                    <p class="text-xs text-gray-400 mt-2 leading-relaxed">退出所有其它会话，只保留目前使用的。</p>
                </section>

                <!-- 区域2：活跃会话 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">活跃会话</h3>
                    <div v-if="loading" class="text-sm text-gray-400 py-8 text-center">正在加载会话…</div>
                    <div v-else-if="otherSessions.length === 0" class="text-sm text-gray-400 py-8 text-center">没有其它活跃会话</div>
                    <div v-else
                        class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden">
                        <div v-for="s in otherSessions" :key="s.id" class="flex items-center gap-3 px-4 py-3">
                            <div
                                class="w-9 h-9 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center">
                                <component :is="deviceIcon(s)" class="w-4.5 h-4.5" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ s.device_model || clientLabel(s) }}</p>
                                <p class="text-xs text-gray-400 mt-0.5 truncate">{{ clientLabel(s) }} · {{ regionLabel(s) }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ lastActiveText(s) }}</p>
                            </div>
                            <button type="button" @click="terminateOne(s)"
                                class="shrink-0 text-xs text-red-500 hover:text-red-600 font-medium">终止</button>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2 leading-relaxed">Telegram 官方客户端支持iPhone,iPad, Android, macOS, Windows, Linux 系统平台。</p>
                </section>

                <!-- 区域3：自动终止旧会话 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">自动终止旧会话</h3>
                    <button type="button" @click="ttlVisible = true"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <TimerResetIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">不活跃时间</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ ttlText }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>
            </div>
        </div>

        <!-- 自动终止旧会话弹窗 -->
        <ModalDialog v-model="ttlVisible" title="自动终止旧会话">
            <div class="space-y-1.5">
                <p class="text-xs text-gray-400 mb-2">不活跃超过以下时间后，会话将被自动终止</p>
                <button v-for="opt in ttlOptions" :key="opt.days" type="button" @click="saveTtl(opt.days)"
                    class="w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm text-left transition-colors"
                    :class="ttlDays === opt.days
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10 text-gray-900 dark:text-gray-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'">
                    <span>{{ opt.label }}</span>
                    <CheckIcon v-if="ttlDays === opt.days" class="w-4 h-4 text-teal-500" />
                </button>
            </div>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
    ArrowLeft as ArrowLeftIcon, Check as CheckIcon, ChevronRight as ChevronRightIcon,
    Globe as GlobeIcon, Laptop as LaptopIcon, Smartphone as SmartphoneIcon,
    Tablet as TabletIcon, TimerReset as TimerResetIcon,
} from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ModalDialog from '../../components/settings/ModalDialog.vue';
import { tdlibSend } from '../../utils/tdlib';
import type { session, sessions } from 'tdlib-types';

const router = useRouter();

function goBack() {
    router.back();
}

const loading = ref(true);
const sessionsList = ref<session[]>([]);
const ttlDays = ref(365);
const ttlVisible = ref(false);

const ttlOptions = [
    { days: 30, label: '1 个月' },
    { days: 90, label: '3 个月' },
    { days: 180, label: '6 个月' },
    { days: 365, label: '12 个月' },
];

const ttlText = computed(() => {
    const opt = ttlOptions.find((o) => o.days === ttlDays.value);
    return opt ? `不活跃 ${opt.label} 后自动终止` : `不活跃 ${ttlDays.value} 天后自动终止`;
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
        MessagePlugin.error('加载会话失败');
    } finally {
        loading.value = false;
    }
}

function clientLabel(s?: session): string {
    if (!s) return '未知';
    const name = s.application_name?.trim() || 'Telegram';
    const ver = s.application_version?.trim();
    return ver ? `${name} ${ver}` : name;
}

function regionLabel(s?: session): string {
    if (!s) return '未知';
    const loc = s.location?.trim();
    const ip = s.ip_address?.trim();
    if (loc && ip) return `${loc} · ${ip}`;
    return loc || ip || '未知';
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
    if (diffMin < 1) return '刚刚活跃';
    if (diffMin < 60) return `${diffMin} 分钟前活跃`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} 小时前活跃`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return '昨天活跃';
    if (diffD < 30) return `${diffD} 天前活跃`;
    const diffM = Math.floor(diffD / 30);
    if (diffM < 12) return `${diffM} 个月前活跃`;
    return `${Math.floor(diffM / 12)} 年前活跃`;
}

async function terminateOne(s: session) {
    const ok = window.confirm(`确定要终止会话「${s.device_model || clientLabel(s)}」吗？`);
    if (!ok) return;
    try {
        await tdlibSend({ _: 'terminateSession', session_id: s.id });
        MessagePlugin.success('会话已终止');
        loadSessions();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

async function terminateOthers() {
    const ok = window.confirm(`确定要终止所有其它会话吗？\n\n将退出所有其它会话，只保留目前使用的。`);
    if (!ok) return;
    try {
        await tdlibSend({ _: 'terminateAllOtherSessions' });
        MessagePlugin.success('已终止所有其它会话');
        loadSessions();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

async function saveTtl(days: number) {
    try {
        await tdlibSend({ _: 'setInactiveSessionTtl', inactive_session_ttl_days: days });
        ttlDays.value = days;
        MessagePlugin.success('自动终止时间已更新');
        ttlVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

onMounted(loadSessions);
</script>
