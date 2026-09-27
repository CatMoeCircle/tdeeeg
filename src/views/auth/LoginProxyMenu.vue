<template>
    <!-- 嵌入模式：仅设置内容（无独立按钮/弹层） -->
    <div v-if="embedded" class="p-3 space-y-2">
        <!-- 跟随系统代理（默认） -->
        <button type="button" @click="setMode('auto')"
            class="w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left"
            :class="settings.proxy.mode === 'auto'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
            <div class="flex items-center">
                <SmartphoneIcon class="w-5 h-5 text-indigo-500 mr-2.5 shrink-0" />
                <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('proxy.autoFollowSystem') }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ t('proxy.autoFollowSystemDesc') }}</p>
                </div>
            </div>
            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                :class="settings.proxy.mode === 'auto' ? 'border-blue-500' : 'border-gray-300'">
                <div v-if="settings.proxy.mode === 'auto'" class="w-2 h-2 rounded-full bg-blue-500"></div>
            </div>
        </button>

        <!-- 始终使用系统代理 -->
        <button type="button" @click="setMode('system')"
            class="w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left"
            :class="settings.proxy.mode === 'system'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
            <div class="flex items-center">
                <MonitorIcon class="w-5 h-5 text-blue-500 mr-2.5 shrink-0" />
                <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('lng_proxy_use_system_settings') }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ systemProxyText }}</p>
                </div>
            </div>
            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                :class="settings.proxy.mode === 'system' ? 'border-blue-500' : 'border-gray-300'">
                <div v-if="settings.proxy.mode === 'system'" class="w-2 h-2 rounded-full bg-blue-500"></div>
            </div>
        </button>

        <!-- 禁用代理 -->
        <button type="button" @click="setMode('disabled')"
            class="w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left"
            :class="settings.proxy.mode === 'disabled'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
            <div class="flex items-center">
                <BanIcon class="w-5 h-5 text-gray-400 mr-2.5 shrink-0" />
                <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('lng_proxy_disable') }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ t('proxy.disableDirectDesc') }}</p>
                </div>
            </div>
            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                :class="settings.proxy.mode === 'disabled' ? 'border-blue-500' : 'border-gray-300'">
                <div v-if="settings.proxy.mode === 'disabled'" class="w-2 h-2 rounded-full bg-blue-500"></div>
            </div>
        </button>

        <!-- 自定义代理列表 -->
        <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between mb-2 px-1">
                <p class="text-xs font-medium text-gray-400">{{ t('proxy.customSection') }}</p>
                <button type="button" @click="openAddDialog"
                    class="flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-600 transition-colors">
                    <PlusIcon class="w-3.5 h-3.5" /> {{ t('lng_stickers_featured_add') }}
                </button>
            </div>

            <div v-if="proxies.length === 0" class="text-xs text-gray-400 px-1 py-1">
                {{ t('proxy.emptyClickAdd') }}
            </div>

            <div v-else class="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                <div v-for="p in proxies" :key="p.id" @click="useProxy(p)"
                    class="w-full flex items-center justify-between p-2.5 rounded-xl border transition-colors cursor-pointer text-left"
                    :class="isCurrentProxy(p)
                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                    <div class="flex items-center min-w-0">
                        <ServerIcon class="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {{ p.proxy.server }}
                            </p>
                            <p class="text-xs text-gray-400">{{ proxyTypeLabel(p.proxy.type) }} · {{ t('proxy.portLabel', { port: p.proxy.port }) }}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                            :class="isCurrentProxy(p) ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'">
                            <CheckIcon v-if="isCurrentProxy(p)" class="w-3 h-3 text-white" />
                        </div>
                        <button type="button" @click.stop="pingProxy(p)" :disabled="pinging"
                            class="text-gray-300 hover:text-cyan-500 transition-colors disabled:opacity-50"
                            :class="pinging ? 'animate-pulse' : ''" :title="t('proxy.pingTest')">
                            <ActivityIcon class="w-3.5 h-3.5" />
                        </button>
                        <button type="button" @click.stop="confirmRemove(p)"
                            class="text-gray-300 hover:text-red-500 transition-colors" :title="t('lng_selected_delete')">
                            <TrashIcon class="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 独立模式：原右上角按钮 + 弹层 -->
    <div v-else class="relative">
        <!-- 右上角代理按钮 -->
        <button type="button" @click="toggle"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors" :class="visible
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'"
            :title="t('lng_proxy_settings')">
            <GlobeIcon class="w-4 h-4" />
            <span>{{ modeLabel }}</span>
        </button>

        <!-- 代理设置弹窗 -->
        <Teleport to="body">
            <div v-if="visible" class="fixed inset-0 z-9998" @mousedown.self="visible = false"
                @keydown.esc="visible = false">
                <div class="absolute top-10 right-4 w-80 max-w-[calc(100vw-2rem)] rounded-2xl
                    bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('lng_proxy_settings') }}</h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="visible = false">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <div class="p-4 space-y-2">
                        <!-- 跟随系统代理（默认） -->
                        <button type="button" @click="setMode('auto')"
                            class="w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left"
                            :class="settings.proxy.mode === 'auto'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div class="flex items-center">
                                <SmartphoneIcon class="w-5 h-5 text-indigo-500 mr-2.5 shrink-0" />
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('proxy.autoFollowSystem') }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ t('proxy.autoFollowSystemDesc') }}</p>
                                </div>
                            </div>
                            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                :class="settings.proxy.mode === 'auto' ? 'border-blue-500' : 'border-gray-300'">
                                <div v-if="settings.proxy.mode === 'auto'" class="w-2 h-2 rounded-full bg-blue-500">
                                </div>
                            </div>
                        </button>

                        <!-- 始终使用系统代理 -->
                        <button type="button" @click="setMode('system')"
                            class="w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left"
                            :class="settings.proxy.mode === 'system'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div class="flex items-center">
                                <MonitorIcon class="w-5 h-5 text-blue-500 mr-2.5 shrink-0" />
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('lng_proxy_use_system_settings') }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ systemProxyText }}</p>
                                </div>
                            </div>
                            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                :class="settings.proxy.mode === 'system' ? 'border-blue-500' : 'border-gray-300'">
                                <div v-if="settings.proxy.mode === 'system'" class="w-2 h-2 rounded-full bg-blue-500">
                                </div>
                            </div>
                        </button>

                        <!-- 禁用代理 -->
                        <button type="button" @click="setMode('disabled')"
                            class="w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left"
                            :class="settings.proxy.mode === 'disabled'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div class="flex items-center">
                                <BanIcon class="w-5 h-5 text-gray-400 mr-2.5 shrink-0" />
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('lng_proxy_disable') }}</p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ t('proxy.disableDirectDesc') }}</p>
                                </div>
                            </div>
                            <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                :class="settings.proxy.mode === 'disabled' ? 'border-blue-500' : 'border-gray-300'">
                                <div v-if="settings.proxy.mode === 'disabled'" class="w-2 h-2 rounded-full bg-blue-500">
                                </div>
                            </div>
                        </button>

                        <!-- 自定义代理列表 -->
                        <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div class="flex items-center justify-between mb-2 px-1">
                                <p class="text-xs font-medium text-gray-400">{{ t('proxy.customSection') }}</p>
                                <button type="button" @click="openAddDialog"
                                    class="flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-600 transition-colors">
                                    <PlusIcon class="w-3.5 h-3.5" /> {{ t('lng_stickers_featured_add') }}
                                </button>
                            </div>

                            <div v-if="proxies.length === 0" class="text-xs text-gray-400 px-1 py-1">
                                {{ t('proxy.emptyClickAdd') }}
                            </div>

                            <div v-else class="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                                <div v-for="p in proxies" :key="p.id" @click="useProxy(p)"
                                    class="w-full flex items-center justify-between p-2.5 rounded-xl border transition-colors cursor-pointer text-left"
                                    :class="isCurrentProxy(p)
                                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                                    <div class="flex items-center min-w-0">
                                        <ServerIcon class="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                                        <div class="min-w-0">
                                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                {{ p.proxy.server }}
                                            </p>
                                            <p class="text-xs text-gray-400">{{ proxyTypeLabel(p.proxy.type) }} · {{ t('proxy.portLabel', { port: p.proxy.port }) }}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                            :class="isCurrentProxy(p) ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'">
                                            <CheckIcon v-if="isCurrentProxy(p)" class="w-3 h-3 text-white" />
                                        </div>
                                        <button type="button" @click.stop="pingProxy(p)" :disabled="pinging"
                                            class="text-gray-300 hover:text-cyan-500 transition-colors disabled:opacity-50"
                                            :class="pinging ? 'animate-pulse' : ''" :title="t('proxy.pingTest')">
                                            <ActivityIcon class="w-3.5 h-3.5" />
                                        </button>
                                        <button type="button" @click.stop="confirmRemove(p)"
                                            class="text-gray-300 hover:text-red-500 transition-colors" :title="t('lng_selected_delete')">
                                            <TrashIcon class="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>

    <!-- 添加代理弹窗（嵌入/独立模式共用，始终 Teleport） -->
    <Teleport to="body">
        <div v-if="addVisible"
            class="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            @mousedown.self="closeAddDialog" @keydown.esc="closeAddDialog">
            <div
                class="w-90 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('lng_proxy_add') }}</h3>
                    <button type="button"
                        class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                        @click="closeAddDialog">
                        <XIcon class="w-4 h-4" />
                    </button>
                </div>

                <div class="px-4 py-4 space-y-3">
                    <!-- 代理类型 -->
                    <div>
                        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ t('proxy.type') }}</label>
                        <div class="flex gap-2">
                            <button v-for="t in proxyTypes" :key="t.value" type="button"
                                class="px-3 py-1.5 rounded-lg text-sm transition-colors"
                                :class="form.type === t.value
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                @click="form.type = t.value">
                                {{ t.label }}
                            </button>
                        </div>
                    </div>

                    <!-- 服务器 + 端口 -->
                    <div class="grid grid-cols-[1fr_110px] gap-3">
                        <div>
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ t('lng_proxy_box_server') }}</label>
                            <input type="text" v-model.trim="form.server"
                                :placeholder="t('proxy.serverPlaceholder')"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ t('lng_proxy_box_port') }}</label>
                            <input type="number" v-model.trim="form.port" placeholder="8080"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                        </div>
                    </div>

                    <!-- MTProto 密文 -->
                    <div v-if="form.type === 'mtproto'">
                        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ t('lng_proxy_box_secret') }}</label>
                        <input type="text" v-model.trim="form.secret" :placeholder="t('proxy.secretPlaceholder')"
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                    </div>

                    <!-- SOCKS5 / HTTP 用户名密码 -->
                    <template v-if="form.type !== 'mtproto'">
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ t('lng_proxy_box_username') }}</label>
                                <input type="text" v-model="form.username"
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ t('lng_proxy_box_password') }}</label>
                                <input type="password" v-model="form.password"
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                            </div>
                        </div>
                    </template>

                    <!-- 备注 -->
                    <div>
                        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ t('proxy.commentOptional') }}</label>
                        <input type="text" v-model.trim="form.comment" :placeholder="t('proxy.commentPlaceholder')"
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                    </div>
                </div>

                <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                    <button type="button" @click="closeAddDialog"
                        class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        {{ t('lng_cancel') }}
                    </button>
                    <button type="button" @click="submitAdd" :disabled="adding"
                        class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-wait">
                        {{ adding ? t('proxy.adding') : t('lng_stickers_featured_add') }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, onMounted, onUnmounted, ref, reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { MessagePlugin } from "tdesign-vue-next";
import { BanIcon, GlobeIcon, MonitorIcon, ServerIcon, SmartphoneIcon, XIcon, CheckIcon, PlusIcon, TrashIcon, ActivityIcon } from "lucide-vue-next";
import { settings } from "../../store/settings";
import { pingProxyOf } from "../../store/proxyLink";
import {
    proxies,
    refreshProxies,
    enableProxyById,
    disableActiveProxy,
    addProxyTo,
    removeProxyById,
} from "../../store/proxyList";
import type { addedProxy } from "tdlib-types";

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const visible = ref(false);
/** 当前系统代理（用于提示） */
const systemProxy = ref<{ server: string; port: number } | null>(null);

const modeLabel = computed(() => {
    switch (settings.proxy.mode) {
        case "auto": return t('proxy.modeAuto');
        case "system": return t('proxy.modeSystem');
        case "custom": return t('proxy.modeCustom');
        default: return t('proxy.modeDisabled');
    }
});

const systemProxyText = computed(() => {
    if (systemProxy.value) {
        return t('proxy.systemProxyCurrent', { server: systemProxy.value.server, port: systemProxy.value.port });
    }
    return t('proxy.systemProxyMissing');
});

/** 当前 custom 模式下选中的代理 */
function isCurrentProxy(p: addedProxy): boolean {
    return settings.proxy.mode === "custom" && settings.proxy.selectedProxyId === p.id;
}

function proxyTypeLabel(type: any): string {
    switch (type?._) {
        case "proxyTypeSocks5": return "SOCKS5";
        case "proxyTypeHttp": return "HTTP";
        case "proxyTypeMtproto": return "MTProto";
        default: return t('proxy.unknownType');
    }
}

/** 切换模式并应用到 Rust（set_proxy_config 会立即作用于已运行的客户端） */
async function setMode(mode: "auto" | "system" | "disabled") {
    settings.proxy.mode = mode;
    if (mode === "disabled") {
        settings.proxy.selectedProxyId = null;
        try {
            await disableActiveProxy();
        } catch (e: any) {
            MessagePlugin.error(e?.message || t('proxy.disableFailed'));
            return;
        }
    }
    // 所有模式（含 disabled）都同步到 Rust，避免重建客户端时恢复旧代理配置
    try {
        await invoke("set_proxy_config", {
            mode,
            proxyId: settings.proxy.selectedProxyId,
        });
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('proxy.applyFailed'));
        return;
    }
    MessagePlugin.success(mode === "disabled" ? t('proxy.disabled') : t('proxy.modeSwitched'));
}

/** 使用自定义代理 */
async function useProxy(p: addedProxy) {
    settings.proxy.mode = "custom";
    settings.proxy.selectedProxyId = p.id;
    if (!p.is_enabled) {
        try {
            await enableProxyById(p.id);
        } catch (e: any) {
            MessagePlugin.error(e?.message || t('proxy.enableFailed'));
            return;
        }
    }
    try {
        await invoke("set_proxy_config", {
            mode: "custom",
            proxyId: p.id,
        });
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('proxy.applyFailed'));
        return;
    }
    MessagePlugin.success(t('proxy.usingProxy', { server: p.proxy.server }));
    visible.value = false;
}

// ─── 添加 / 删除自定义代理 ─────────────────────────

const proxyTypes = [
    { value: "http", label: "HTTP" },
    { value: "socks5", label: "SOCKS5" },
    { value: "mtproto", label: "MTProto" },
] as const;

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
});

function openAddDialog() {
    Object.assign(form, {
        type: "http", server: "", port: "", username: "", password: "", secret: "", comment: "",
    });
    addVisible.value = true;
}

function closeAddDialog() {
    addVisible.value = false;
}

/** 提交添加代理，成功后刷新列表并关闭弹窗 */
async function submitAdd() {
    if (adding.value) return;
    if (!form.server.trim()) {
        MessagePlugin.warning(t('proxy.enterServer'));
        return;
    }
    const port = Number(form.port);
    if (!port || port <= 0 || port > 65535) {
        MessagePlugin.warning(t('proxy.enterValidPort'));
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
            enable: true,
            comment: form.comment,
        });
        // 添加后立即选用
        settings.proxy.mode = "custom";
        settings.proxy.selectedProxyId = added.id;
        await invoke("set_proxy_config", { mode: "custom", proxyId: added.id });
        await refreshProxies();
        closeAddDialog();
        MessagePlugin.success(t('proxy.added'));
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('proxy.addFailed'));
    } finally {
        adding.value = false;
    }
}

/** 删除代理（若当前正在使用则同时禁用），并刷新列表 */
async function confirmRemove(p: addedProxy) {
    try {
        await removeProxyById(p.id);
        if (settings.proxy.selectedProxyId === p.id) {
            settings.proxy.selectedProxyId = null;
            settings.proxy.mode = "disabled";
        }
        await refreshProxies();
        MessagePlugin.success(t('proxy.deleted'));
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('proxy.deleteFailed'));
    }
}

/** 是否正在 ping（全局共享 pingLoading，这里用本地标志作按钮态） */
const pinging = ref(false);

/** 对指定代理执行 ping 测试，并用消息展示结果 */
async function pingProxy(p: addedProxy) {
    if (pinging.value) return;
    pinging.value = true;
    try {
        const res = await pingProxyOf(p.proxy.server, p.proxy.port, p.proxy.type);
        if (res) {
            if (res.ok) MessagePlugin.success(`${p.proxy.server}:${p.proxy.port} — ${res.text}`);
            else MessagePlugin.warning(`${p.proxy.server}:${p.proxy.port} — ${res.text}`);
        }
    } finally {
        pinging.value = false;
    }
}

function toggle() {
    visible.value = !visible.value;
    if (visible.value) {
        refreshProxies();
    }
}

const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") visible.value = false;
};

onMounted(() => {
    // 预取系统代理信息用于提示
    invoke<{ server: string; port: number } | null>("get_system_proxy")
        .then((res) => { systemProxy.value = res; })
        .catch(() => { systemProxy.value = null; });
    window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
});
</script>
