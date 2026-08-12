<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">系统设置</h2>
        </div>

        <!-- 二级菜单 + 内容展示区 -->
        <div class="flex flex-1 min-h-0">
            <!-- 左侧二级菜单 -->
            <div class="w-48 shrink-0 border-r border-gray-200 dark:border-gray-800 py-3">
                <button v-for="item in sections" :key="item.key" type="button" @click="activeSection = item.key"
                    class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" :class="activeSection === item.key
                        ? 'bg-blue-50 dark:bg-gray-800 text-blue-600 font-medium'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'">
                    <component :is="item.icon" class="w-4 h-4 shrink-0" />
                    {{ item.label }}
                </button>
            </div>

            <!-- 右侧内容展示区 -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
                <!-- 连接设置 -->
                <div v-if="activeSection === 'connection'" class="max-w-2xl space-y-6">
                    <p class="text-xs text-gray-400">以下更改需要通过重建 TDLib 客户端才会生效。</p>

                    <!-- 使用测试数据中心 -->
                    <section class="border-b border-gray-200 dark:border-gray-700 pb-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">使用测试数据中心</h3>
                                <p class="text-xs text-gray-500 mt-1">连接到 Telegram 测试服务器（测试账号与正式账号数据隔离）</p>
                            </div>
                            <button type="button" @click="useTestDc = !useTestDc"
                                class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                                :class="useTestDc ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                                    :class="useTestDc ? 'translate-x-5' : ''" />
                            </button>
                        </div>
                        <div class="mt-4 flex justify-end">
                            <button type="button" @click="applyConnection"
                                class="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                                :class="applying ? 'bg-blue-400 cursor-wait' : 'bg-blue-500 hover:bg-blue-600'"
                                :disabled="applying">
                                {{ applying ? '正在重建 TDLib…' : '应用并重启 TDLib' }}
                            </button>
                        </div>
                    </section>

                    <!-- 自定义 API ID / Hash -->
                    <section>
                        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">自定义 API ID / Hash</h3>
                        <p class="text-xs text-gray-500 mb-4">
                            启用后使用自定义凭据代替编译期默认值（.env 的 TG_API_ID / TG_API_HASH）。
                        </p>
                        <div
                            class="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            <InfoIcon class="w-4 h-4 shrink-0 mt-0.5" />
                            <p class="text-xs leading-5">
                                修改 API ID / Hash 后，需要<strong>退出并重新登录</strong>，新的自定义凭据才会对当前账户生效（不同的 API 凭据对应独立的账号会话）。
                            </p>
                        </div>

                        <div
                            class="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 mb-4">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">使用自定义凭据</p>
                                <p class="text-xs text-gray-500 mt-0.5">关闭则恢复使用默认 API ID / Hash</p>
                            </div>
                            <button type="button" @click="customApiCreds = !customApiCreds"
                                class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                                :class="customApiCreds ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                                    :class="customApiCreds ? 'translate-x-5' : ''" />
                            </button>
                        </div>

                        <template v-if="customApiCreds">
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API
                                ID</label>
                            <input v-model="apiId" type="text" inputmode="numeric" placeholder="例如 12345"
                                spellcheck="false"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none mb-4" />
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API
                                Hash</label>
                            <input v-model="apiHash" type="text" placeholder="32 位十六进制字符串" spellcheck="false"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none mb-4" />
                        </template>

                        <div class="flex items-center justify-end gap-3">
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
                    </section>
                </div>

                <!-- 账户 -->
                <div v-else-if="activeSection === 'account'" class="max-w-2xl space-y-4">
                    <p class="text-xs text-gray-400">退出登录会清除当前账户的本地会话，需重新登录。</p>
                    <div
                        class="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center">
                            <div
                                class="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mr-3">
                                <LogOutIcon class="w-5 h-5" />
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">退出登录</p>
                                <p class="text-xs text-gray-400 mt-0.5">退出当前账号，保留本地缓存数据</p>
                            </div>
                        </div>
                        <button type="button" @click="logout"
                            class="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60"
                            :disabled="loggingOut">
                            {{ loggingOut ? '正在退出…' : '退出登录' }}
                        </button>
                    </div>
                </div>

                <!-- 关于 -->
                <div v-else class="max-w-2xl space-y-4 text-sm text-gray-600 dark:text-gray-300">
                    <p class="text-xs text-gray-400">当前生效的 TDLib 连接参数。</p>
                    <div
                        class="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
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
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft as ChevronLeftIcon, Plug as PlugIcon, Info as InfoIcon, LogOut as LogOutIcon } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { MessagePlugin } from 'tdesign-vue-next';
import { settings } from '../../store/settings';

const router = useRouter();

/** 二级菜单分区 */
const sections = [
    { key: 'connection', label: '连接', icon: PlugIcon },
    { key: 'account', label: '账户', icon: LogOutIcon },
    { key: 'about', label: '关于', icon: InfoIcon },
] as const;
const activeSection = ref<'connection' | 'account' | 'about'>('connection');

/** 返回设置列表 */
function goBack() {
    router.push('/home/settings');
}

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

const loggingOut = ref(false);

/** 退出登录：调用 TDLib logOut 清除本地会话，重建后跳转登录页 */
async function logout() {
    if (loggingOut.value) return;
    const ok = window.confirm('确定要退出登录吗？退出后需要重新登录才能继续使用。');
    if (!ok) return;
    loggingOut.value = true;
    try {
        // logOut → 等待本地数据销毁并重建客户端（回到待登录状态）
        await invoke('logout_tdlib');
        MessagePlugin.success('已退出登录');
        // 重建前端，bootstrap 会根据新的授权态跳转到登录页
        window.location.reload();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '退出登录失败');
        loggingOut.value = false;
    }
}
</script>
