<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">系统设置</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-8">

                <!-- 连接设置 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">连接设置
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">以下更改需要通过重建 TDLib 客户端才会生效。</p>

                    <!-- 使用测试数据中心 -->
                    <div
                        class="mt-5 flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div>
                            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">使用测试数据中心</h4>
                            <p class="text-xs text-gray-500 mt-0.5">连接到 Telegram 测试服务器（测试账号与正式账号数据隔离）</p>
                        </div>
                        <button type="button" @click="useTestDc = !useTestDc"
                            class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                            :class="useTestDc ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                            <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                                :class="useTestDc ? 'translate-x-5' : ''" />
                        </button>
                    </div>

                    <!-- 自定义 API ID / Hash -->
                    <div class="mt-5">
                        <div
                            class="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">自定义 API ID / Hash</p>
                                <p class="text-xs text-gray-500 mt-0.5">启用后使用自定义凭据代替编译期默认值（.env 的 TG_API_ID /
                                    TG_API_HASH）</p>
                            </div>
                            <button type="button" @click="customApiCreds = !customApiCreds"
                                class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                                :class="customApiCreds ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                                    :class="customApiCreds ? 'translate-x-5' : ''" />
                            </button>
                        </div>

                        <div v-if="customApiCreds" class="mt-4">
                            <div
                                class="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                <InfoIcon class="w-4 h-4 shrink-0 mt-0.5" />
                                <p class="text-xs leading-5">
                                    修改 API ID / Hash 后，需要<strong>退出并重新登录</strong>，新的自定义凭据才会对当前账户生效（不同的 API 凭据对应独立的账号会话）。
                                </p>
                            </div>

                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API
                                ID</label>
                            <input v-model="apiId" type="text" inputmode="numeric" placeholder="例如 12345"
                                spellcheck="false"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none mb-4" />
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API
                                Hash</label>
                            <input v-model="apiHash" type="text" placeholder="32 位十六进制字符串" spellcheck="false"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none mb-4" />
                        </div>

                        <div class="mt-4 flex items-center justify-end gap-3">
                            <button v-if="customApiCreds" type="button" @click="resetApiCreds"
                                class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                                恢复默认
                            </button>
                            <button type="button" @click="applyConnection"
                                class="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                                :class="applying ? 'bg-blue-400 cursor-wait' : 'bg-blue-500 hover:bg-blue-600'"
                                :disabled="applying">
                                {{ applying ? '正在重建 TDLib…' : '应用并重启 TDLib' }}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 账户 -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">账户
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">可同时登录多个账户，并在账户之间快速切换。</p>

                    <!-- 账户列表 -->
                    <div class="mt-5 space-y-2">
                        <div v-for="acc in accounts" :key="acc.id"
                            class="flex items-center p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <img v-if="acc.avatar_path" :src="avatarSrc(acc)" alt="avatar"
                                class="w-10 h-10 rounded-full object-cover mr-3 shrink-0" />
                            <div v-else
                                class="w-10 h-10 rounded-full mr-3 shrink-0 flex items-center justify-center text-white text-xs bg-linear-to-br from-blue-400 to-indigo-500">
                                {{ accountInitials(acc) }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {{ accountName(acc) }}
                                    <span v-if="acc.is_active"
                                        class="ml-1 text-xs font-normal text-blue-500">(当前)</span>
                                </p>
                                <p class="text-xs text-gray-400 truncate">{{ accountSubtitle(acc) }}</p>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <button v-if="!acc.is_active" type="button" @click="switchAcc(acc)"
                                    class="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-500/40 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                                    {{ acc.logged_in ? '切换' : '登录' }}
                                </button>
                                <button v-if="acc.logged_in && !acc.is_active" type="button" @click="logoutAcc(acc)"
                                    class="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                    登出
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 添加账户 -->
                    <button type="button" @click="showAddDialog = true"
                        class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-500/40 text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                        <PlusIcon class="w-4 h-4" /> 添加账户
                    </button>
                </section>

                <!-- 关于 -->
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">关于
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <!-- 版本信息：应用版本 + TDLib 版本 一排居中 -->
                    <div
                        class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 py-6">
                        <div class="flex items-center justify-center gap-6 text-sm text-gray-600 dark:text-gray-300">
                            <span>{{ appName }} v{{ appVersion }}</span>
                            <span class="text-gray-300 dark:text-gray-600">|</span>
                            <span>TDLib {{ tdlibVersion }}</span>
                        </div>
                        <p class="mt-2 text-center text-xs text-gray-400">当前生效的 TDLib 连接参数如下</p>
                    </div>

                    <!-- 当前连接参数 -->
                    <div
                        class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 text-sm text-gray-600 dark:text-gray-300">
                        <div class="px-4 py-3 flex items-center justify-between">
                            <span class="text-gray-500 dark:text-gray-400">数据中心</span>
                            <span class="font-mono">{{ useTestDc ? '测试 (Test DC)' : '正式 (Main DC)' }}</span>
                        </div>
                        <div class="px-4 py-3 flex items-center justify-between">
                            <span class="text-gray-500 dark:text-gray-400">API ID</span>
                            <span class="font-mono">{{ apiId || '(默认)' }}</span>
                        </div>
                        <div class="px-4 py-3 flex items-center justify-between">
                            <span class="text-gray-500 dark:text-gray-400">API Hash</span>
                            <span class="font-mono break-all">{{ apiHash ? apiHash.slice(0, 8) + '…' : '(默认)' }}</span>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    </div>

    <!-- 添加账户确认弹窗 -->
    <Teleport to="body">
        <div v-if="showAddDialog"
            class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            @mousedown.self="showAddDialog = false" @keydown.esc="showAddDialog = false">
            <div
                class="w-90 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                <div class="px-4 pt-5 pb-3 text-center">
                    <div
                        class="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center mb-3">
                        <LogOutIcon class="w-6 h-6" />
                    </div>
                    <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">添加账户</h3>
                    <p class="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-5">
                        将登录一个新的 Telegram 账户，多个账户可并存并随时切换。
                    </p>
                </div>
                <div class="px-4 pb-4 flex items-center justify-end gap-3">
                    <button type="button" @click="showAddDialog = false"
                        class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        取消
                    </button>
                    <button type="button" @click="confirmAdd" :disabled="adding"
                        class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-wait">
                        {{ adding ? '正在创建…' : '继续' }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft as ChevronLeftIcon, Info as InfoIcon, LogOut as LogOutIcon, Plus as PlusIcon } from 'lucide-vue-next';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { MessagePlugin } from 'tdesign-vue-next';
import { settings } from '../../store/settings';
import { tdlibSend } from '../../utils/tdlib';
import { useAccountsStore, type AccountInfo } from '../../store/accounts';
import { storeToRefs } from 'pinia';
import packageInfo from '../../../package.json';

const router = useRouter();

/** 返回设置列表 */
function goBack() {
    router.push('/home/settings');
}

// ─── 版本信息 ───
const appName = packageInfo.name ?? 'tdeeeg';
const appVersion = ref(packageInfo.version ?? '');
const tdlibVersion = ref('...');

/** 获取客户端版本号（优先从 Tauri 动态获取，失败时回退到 package.json 编译期版本） */
async function loadAppVersion() {
    try {
        appVersion.value = await getVersion();
    } catch {
        appVersion.value = packageInfo.version ?? '';
    }
}

/** 从 TDLib 返回的 option 中获取版本号 */
async function loadTdlibVersion() {
    try {
        const res = await tdlibSend({ _: 'getOption', name: 'version' });
        if (res && res._ === 'optionValueString') {
            tdlibVersion.value = res.value;
        }
    } catch {
        tdlibVersion.value = '未连接';
    }
}

onMounted(() => {
    loadAppVersion();
    loadTdlibVersion();
    accountsStore.init();
});

// ─── 表单状态（从持久化 settings.system 初始化）───
const useTestDc = ref(settings.system.useTestDc);
const customApiCreds = ref(settings.system.customApiCreds);
const apiId = ref(settings.system.apiId);
const apiHash = ref(settings.system.apiHash);

// 本地表单变化同步到持久化 settings（localStorage）
watch(useTestDc, (v) => { settings.system.useTestDc = v; });
watch(customApiCreds, (v) => { settings.system.customApiCreds = v; });
watch(apiId, (v) => { settings.system.apiId = v.trim(); });
watch(apiHash, (v) => { settings.system.apiHash = v.trim(); });

const applying = ref(false);

/** 恢复默认 API 凭据（使用编译期 env 值） */
function resetApiCreds() {
    apiId.value = '';
    apiHash.value = '';
    customApiCreds.value = false;
}

/** 应用当前参数并重建 TDLib 客户端 */
async function applyConnection() {
    if (applying.value) return;
    // 校验自定义凭据
    let apiIdNum: number | undefined;
    let apiHashStr: string | undefined;
    if (customApiCreds.value) {
        if (!apiId.value.trim() || !apiHash.value.trim()) {
            MessagePlugin.warning('请输入 API ID 和 API Hash');
            return;
        }
        const id = Number(apiId.value.trim());
        if (!Number.isInteger(id) || id <= 0) {
            MessagePlugin.warning('API ID 必须为正整数');
            return;
        }
        apiIdNum = id;
        apiHashStr = apiHash.value.trim();
    }

    applying.value = true;
    try {
        // 1. 更新 Rust 侧 config
        await invoke('set_tdlib_parameters', {
            useTestDc: useTestDc.value,
            ...(apiIdNum !== undefined && apiHashStr ? { api_id: apiIdNum, api_hash: apiHashStr } : {}),
        });
        // 2. 重建 TDLib 客户端（使用新参数）
        await invoke('restart_tdlib');
        // 3. 重新走前端初始化流程（重新 init 各模块并依据新的授权态跳转）
        MessagePlugin.success('已应用，正在重新连接…');
        window.location.reload();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '应用参数失败');
        applying.value = false;
    }
}

// ─── 账户管理 ───
const accountsStore = useAccountsStore();
const { accounts } = storeToRefs(accountsStore);
const showAddDialog = ref(false);
const adding = ref(false);

function avatarSrc(acc: AccountInfo): string | undefined {
    return acc.avatar_path ? convertFileSrc(acc.avatar_path) : undefined;
}

function accountInitials(acc: AccountInfo): string {
    const name = (acc.first_name || '') + (acc.last_name || '');
    return name.trim().substring(0, 2) || '#';
}

function accountName(acc: AccountInfo): string {
    if (acc.first_name || acc.last_name) {
        return (acc.first_name || '') + ' ' + (acc.last_name || '');
    }
    return '未登录账户';
}

function accountSubtitle(acc: AccountInfo): string {
    if (acc.logged_in) {
        return acc.username ? '@' + acc.username : `#${acc.id}`;
    }
    return '未登录';
}

async function switchAcc(acc: AccountInfo) {
    try {
        await accountsStore.switchAccount(acc.id);
    } catch (e: any) {
        MessagePlugin.error(e?.message || '切换账户失败');
    }
}

async function logoutAcc(acc: AccountInfo) {
    const label = acc.first_name || acc.last_name || acc.username || acc.id;
    const ok = window.confirm(`确定要登出账户「${label}」吗？`);
    if (!ok) return;
    try {
        await accountsStore.logoutAccount(acc.id);
    } catch (e: any) {
        MessagePlugin.error(e?.message || '登出失败');
    }
}

async function confirmAdd() {
    if (adding.value) return;
    adding.value = true;
    try {
        await accountsStore.addAccount();
        showAddDialog.value = false;
    } catch (e: any) {
        adding.value = false;
        MessagePlugin.error(e?.message || '添加账户失败');
    }
}

onMounted(() => {
    loadAppVersion();
    loadTdlibVersion();
    accountsStore.init();
});
</script>
