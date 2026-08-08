<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="text-lg font-semibold">代理设置</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">

                <!-- 代理模式选择 -->
                <div class="mb-8 border-b border-gray-200 dark:border-gray-700 pb-8">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">
                        代理模式</h3>

                    <div class="space-y-3">
                        <!-- 禁用代理 -->
                        <div class="flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors"
                            :class="settings.proxy.mode === 'disabled'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                            @click="selectMode('disabled')">
                            <div class="flex items-center">
                                <div
                                    class="w-9 h-9 rounded-full flex items-center justify-center mr-3 bg-gray-100 dark:bg-gray-700 text-gray-500">
                                    <BanIcon class="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">禁用代理</h4>
                                    <p class="text-xs text-gray-400 mt-0.5">直接连接 Telegram 服务器，不使用任何代理</p>
                                </div>
                            </div>
                            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                :class="settings.proxy.mode === 'disabled' ? 'border-blue-500' : 'border-gray-300'">
                                <div v-if="settings.proxy.mode === 'disabled'" class="w-2 h-2 rounded-full bg-blue-500">
                                </div>
                            </div>
                        </div>

                        <!-- 使用系统代理 -->
                        <div class="flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors"
                            :class="settings.proxy.mode === 'system'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                            @click="selectMode('system')">
                            <div class="flex items-center">
                                <div
                                    class="w-9 h-9 rounded-full flex items-center justify-center mr-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                                    <MonitorIcon class="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">使用系统代理</h4>
                                    <p class="text-xs text-gray-400 mt-0.5">
                                        {{ systemProxyText }}
                                    </p>
                                    <p v-if="settings.proxy.mode === 'system' && !systemProxy"
                                        class="text-xs text-amber-500 mt-1">未检测到系统代理，应用后将退化为直连</p>
                                </div>
                            </div>
                            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                :class="settings.proxy.mode === 'system' ? 'border-blue-500' : 'border-gray-300'">
                                <div v-if="settings.proxy.mode === 'system'" class="w-2 h-2 rounded-full bg-blue-500">
                                </div>
                            </div>
                        </div>

                        <!-- 使用代理列表中的代理 -->
                        <div class="p-4 rounded-xl border cursor-pointer transition-colors" :class="settings.proxy.mode === 'custom'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                            @click="selectMode('custom')">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center">
                                    <div
                                        class="w-9 h-9 rounded-full flex items-center justify-center mr-3 bg-green-100 dark:bg-green-900/30 text-green-600">
                                        <ServerIcon class="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">使用代理</h4>
                                        <p class="text-xs text-gray-400 mt-0.5">从下方代理列表中选择一个使用</p>
                                    </div>
                                </div>
                                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                    :class="settings.proxy.mode === 'custom' ? 'border-blue-500' : 'border-gray-300'">
                                    <div v-if="settings.proxy.mode === 'custom'"
                                        class="w-2 h-2 rounded-full bg-blue-500"></div>
                                </div>
                            </div>

                            <!-- 当前选中的代理 -->
                            <div v-if="settings.proxy.mode === 'custom'"
                                class="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                                <p v-if="!selectedProxy" class="text-sm text-gray-400">
                                    尚未选择代理，请在下方列表中选择一个代理启用。
                                </p>
                                <div v-else class="flex items-center gap-2 text-sm">
                                    <span class="text-gray-500 dark:text-gray-400">当前使用：</span>
                                    <span class="text-gray-800 dark:text-gray-200 font-medium">{{ selectedProxy.proxy.server
                                    }}</span>
                                    <span
                                        class="px-1.5 py-0.5 rounded text-[10px] font-medium text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30">
                                        {{ proxyTypeLabel(selectedProxy.proxy.type) }}
                                    </span>
                                    <span class="text-xs text-gray-400">:{{ selectedProxy.proxy.port }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 已添加的代理列表 -->
                <div>
                    <div class="flex items-center gap-2 mb-4">
                        <h3
                            class="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">代理列表</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                        <button type="button" @click="refreshProxies" :disabled="proxiesLoading"
                            class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-wait transition-colors">
                            <RefreshCwIcon class="w-3.5 h-3.5" :class="proxiesLoading ? 'animate-spin' : ''" />
                            刷新
                        </button>
                        <button type="button" @click="openAddDialog"
                            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                            <PlusIcon class="w-3.5 h-3.5" />
                            添加代理
                        </button>
                    </div>

                    <!-- 加载中 -->
                    <div v-if="proxiesLoading"
                        class="py-6 flex items-center justify-center text-sm text-gray-400">加载代理列表中...</div>

                    <!-- 加载失败 -->
                    <div v-else-if="proxiesError"
                        class="py-6 flex flex-col items-center justify-center gap-2 text-sm">
                        <p class="text-red-500">{{ proxiesError }}</p>
                        <button type="button" @click="refreshProxies"
                            class="px-3 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">
                            重试
                        </button>
                    </div>

                    <!-- 空列表 -->
                    <div v-else-if="proxies.length === 0"
                        class="py-6 flex flex-col items-center justify-center gap-2 text-sm text-gray-400">
                        <p>暂无已添加的代理</p>
                        <p class="text-xs">点击右上角「添加代理」手动添加，或直接点击 proxy.t.me 链接添加。</p>
                    </div>

                    <!-- 代理列表 -->
                    <div v-else class="space-y-2">
                        <div v-for="p in proxies" :key="p.id" @click="useProxy(p)"
                            class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
                            :class="isCurrentProxy(p)
                                ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <!-- 勾选指示器：当前选用的代理打勾 -->
                            <div class="w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors"
                                :class="isCurrentProxy(p)
                                    ? 'border-green-500 bg-green-500 text-white'
                                    : 'border-gray-300 dark:border-gray-600'">
                                <CheckIcon v-if="isCurrentProxy(p)" class="w-4 h-4" />
                            </div>
                            <div
                                class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center"
                                :class="p.is_enabled
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'">
                                <ServerIcon class="w-5 h-5" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {{ p.proxy.server }}
                                    </p>
                                    <span
                                        class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30">
                                        {{ proxyTypeLabel(p.proxy.type) }}
                                    </span>
                                    <span v-if="p.is_enabled"
                                        class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30">
                                        已启用
                                    </span>
                                    <span v-if="p.comment" class="text-xs text-gray-400 truncate">{{ p.comment }}</span>
                                </div>
                                <p class="text-xs text-gray-400 mt-0.5">端口 {{ p.proxy.port }}</p>
                            </div>

                            <!-- 使用按钮（未启用时显示，阻止冒泡避免触发选中） -->
                            <button type="button" v-if="!p.is_enabled" @click.stop="useProxy(p)"
                                class="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="使用此代理">
                                <PlayIcon class="w-4 h-4" />
                                使用
                            </button>

                            <!-- 分享（阻止冒泡） -->
                            <button type="button" @click.stop="shareProxy(p)"
                                class="shrink-0 text-gray-400 hover:text-cyan-500 transition-colors" title="生成分享链接">
                                <Share2Icon class="w-5 h-5" />
                            </button>

                            <!-- 删除（阻止冒泡） -->
                            <button type="button" @click.stop="confirmRemove(p)"
                                class="shrink-0 text-gray-400 hover:text-red-500 transition-colors" title="删除">
                                <TrashIcon class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <!-- 添加代理弹窗 -->
        <Teleport to="body">
            <Transition name="elc-fade">
                <div v-if="addVisible" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    @mousedown.self="closeAddDialog">
                    <div
                        class="w-100 max-w-[92vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">添加代理</h3>
                            <button type="button"
                                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                                @click="closeAddDialog">
                                <XIcon class="w-4 h-4" />
                            </button>
                        </div>

                        <div class="px-4 py-4 space-y-3">
                            <!-- 代理类型 -->
                            <div>
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">代理类型</label>
                                <div class="flex gap-2">
                                    <button v-for="t in proxyTypes" :key="t.value" type="button"
                                        class="px-3 py-1.5 rounded-lg text-sm transition-colors"
                                        :class="form.type === t.value
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                        @click="form.type = t.value as any">
                                        {{ t.label }}
                                    </button>
                                </div>
                            </div>

                            <!-- 服务器 + 端口 -->
                            <div class="grid grid-cols-[1fr_110px] gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">服务器</label>
                                    <input type="text" v-model.trim="form.server"
                                        placeholder="例如 127.0.0.1 或 proxy.example.com"
                                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">端口</label>
                                    <input type="number" v-model.trim="form.port" placeholder="8080"
                                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                                </div>
                            </div>

                            <!-- MTProto 密文 -->
                            <div v-if="form.type === 'mtproto'">
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">密文（Secret）</label>
                                <input type="text" v-model.trim="form.secret" placeholder="代理的十六进制 secret"
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                            </div>

                            <!-- SOCKS5 / HTTP 用户名密码 -->
                            <template v-if="form.type !== 'mtproto'">
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">用户名（可选）</label>
                                        <input type="text" v-model="form.username"
                                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">密码（可选）</label>
                                        <input type="password" v-model="form.password"
                                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                                    </div>
                                </div>
                            </template>

                            <!-- 备注 -->
                            <div>
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">备注（可选）</label>
                                <input type="text" v-model="form.comment" placeholder="用于标识该代理"
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                            </div>

                            <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <input type="checkbox" v-model="form.enable"
                                    class="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                                添加后立即启用
                            </label>
                        </div>

                        <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                            <button type="button" @click="closeAddDialog"
                                class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                                取消
                            </button>
                            <button type="button" @click="submitAdd" :disabled="adding"
                                class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-wait">
                                {{ adding ? '添加中...' : '添加' }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onActivated } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { MessagePlugin } from "tdesign-vue-next";
import {
    BanIcon, MonitorIcon, ServerIcon, TrashIcon, RefreshCwIcon, PlusIcon, XIcon, PlayIcon, Share2Icon, CheckIcon,
} from "lucide-vue-next";
import { settings } from "../../store/settings";
import {
    proxies,
    proxiesLoading,
    proxiesError,
    refreshProxies,
    enableProxyById,
    disableActiveProxy,
    removeProxyById,
    addProxyTo,
    proxyShareLink,
} from "../../store/proxyList";
import type { addedProxy } from "tdlib-types";

const proxyTypes = [
    { value: "http", label: "HTTP" },
    { value: "socks5", label: "SOCKS5" },
    { value: "mtproto", label: "MTProto" },
] as const;

/** 从 Rust 读取到的系统代理信息 */
const systemProxy = ref<{ server: string; port: number } | null>(null);

const systemProxyText = computed(() => {
    if (systemProxy.value) {
        return `当前系统代理：${systemProxy.value.server}:${systemProxy.value.port}`;
    }
    return "读取 Windows 系统代理设置";
});

/** 当前 custom 模式下选中的代理（从列表中找到 id 匹配的那一项） */
const selectedProxy = computed<addedProxy | null>(() => {
    if (settings.proxy.selectedProxyId == null) return null;
    return proxies.value.find(p => p.id === settings.proxy.selectedProxyId) ?? null;
});

/** 切换代理模式，并向 Rust 应用 */
async function selectMode(mode: "disabled" | "system" | "custom") {
    settings.proxy.mode = mode;
    if (mode === "disabled") {
        // 禁用代理：清除已选代理的勾选状态
        settings.proxy.selectedProxyId = null;
        try {
            await disableActiveProxy();
        } catch (e: any) {
            MessagePlugin.error(e?.message || "禁用代理失败");
            return;
        }
    } else {
        await applyMode();
    }
    MessagePlugin.success(mode === "disabled" ? "代理已禁用" : "代理模式已切换");
}

/** 将当前所选模式同步到 Rust 并应用 */
async function applyMode() {
    try {
        await invoke("set_proxy_config", {
            mode: settings.proxy.mode,
            proxy_id: settings.proxy.selectedProxyId ?? undefined,
        });
    } catch (e: any) {
        MessagePlugin.error(e?.message || "应用代理失败");
    }
}

/** 点击列表项或「使用」按钮：设置 custom 模式并启用该代理 */
async function useProxy(p: addedProxy) {
    settings.proxy.mode = "custom";
    settings.proxy.selectedProxyId = p.id;
    if (!p.is_enabled) {
        try {
            await enableProxyById(p.id);
        } catch (e: any) {
            MessagePlugin.error(e?.message || "启用代理失败");
            return;
        }
    }
    await applyMode();
    MessagePlugin.success(`已使用代理 ${p.proxy.server}`);
}

/** 该代理是否为当前选用的代理（custom 模式下被勾选） */
function isCurrentProxy(p: addedProxy): boolean {
    return settings.proxy.mode === "custom" && settings.proxy.selectedProxyId === p.id;
}

/** 添加代理弹窗表单 */
const addVisible = ref(false);
const adding = ref(false);
const form = reactive({
    type: "http" as "http" | "socks5" | "mtproto",
    server: "",
    port: "",
    username: "",
    password: "",
    secret: "",
    comment: "",
    enable: true,
});

function openAddDialog() {
    Object.assign(form, {
        type: "http", server: "", port: "", username: "", password: "", secret: "", comment: "", enable: true,
    });
    addVisible.value = true;
}

function closeAddDialog() {
    addVisible.value = false;
}

/** 提交添加代理 */
async function submitAdd() {
    if (adding.value) return;
    if (!form.server.trim()) {
        MessagePlugin.warning("请输入服务器地址");
        return;
    }
    const port = Number(form.port);
    if (!port || port <= 0 || port > 65535) {
        MessagePlugin.warning("请输入有效的端口");
        return;
    }
    adding.value = true;
    try {
        const type: any = form.type === "mtproto"
            ? { _: "proxyTypeMtproto", secret: form.secret.trim() }
            : {
                _: form.type === "socks5" ? "proxyTypeSocks5" : "proxyTypeHttp",
                username: form.username,
                password: form.password,
            };
        const added = await addProxyTo({
            server: form.server.trim(),
            port,
            type,
            enable: form.enable,
            comment: form.comment,
        });
        // 若“添加后立即启用”，同步到 custom 模式
        if (form.enable) {
            settings.proxy.mode = "custom";
            settings.proxy.selectedProxyId = added.id;
            await applyMode();
        }
        closeAddDialog();
        MessagePlugin.success("代理已添加");
    } catch (e: any) {
        MessagePlugin.error(e?.message || "添加代理失败");
    } finally {
        adding.value = false;
    }
}

/** 删除代理（带确认） */
async function confirmRemove(p: addedProxy) {
    try {
        await removeProxyById(p.id);
        if (settings.proxy.selectedProxyId === p.id) {
            settings.proxy.selectedProxyId = null;
        }
        MessagePlugin.success("代理已删除");
    } catch (e: any) {
        MessagePlugin.error(e?.message || "删除代理失败");
    }
}

/** 复制代理分享链接（proxy.t.me） */
async function shareProxy(p: addedProxy) {
    const link = proxyShareLink(p);
    if (!link) {
        MessagePlugin.warning("无法生成该代理的分享链接");
        return;
    }
    try {
        await navigator.clipboard.writeText(link);
        MessagePlugin.success("代理分享链接已复制");
    } catch (e: any) {
        MessagePlugin.error("复制失败");
        console.error(e);
    }
}

/** 代理类型标签 */
function proxyTypeLabel(type: any): string {
    switch (type?._) {
        case "proxyTypeSocks5": return "SOCKS5";
        case "proxyTypeHttp": return "HTTP";
        case "proxyTypeMtproto": return "MTProto";
        default: return "未知";
    }
}

onMounted(async () => {
    try {
        const res = await invoke<{ server: string; port: number } | null>("get_system_proxy");
        systemProxy.value = res;
    } catch {
        systemProxy.value = null;
    }
    refreshProxies();
});

// KeepAlive 缓存页面被重新激活时重新拉取代理列表。
onActivated(() => {
    refreshProxies();
});
</script>

<style scoped>
.elc-fade-enter-active,
.elc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.elc-fade-enter-from,
.elc-fade-leave-to {
    opacity: 0;
}
</style>
