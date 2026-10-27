<template>
    <Teleport to="body">
        <Transition name="apc-fade">
            <div v-if="modelValue"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="close">
                <div
                    class="w-100 max-w-[92vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('lng_proxy_add') }}</h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="close">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <div class="px-4 py-4 space-y-3">
                        <!-- 代理类型 -->
                        <div>
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                t('proxy.type') }}</label>
                            <div class="flex gap-2">
                                <button v-for="pt in proxyTypes" :key="pt.value" type="button"
                                    class="px-3 py-1.5 rounded-lg text-sm transition-colors"
                                    :class="form.type === pt.value
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                    @click="selectType(pt.value)">
                                    {{ pt.label }}
                                </button>
                            </div>
                        </div>

                        <!-- 服务器 + 端口 -->
                        <div class="grid grid-cols-[1fr_110px] gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                    t('lng_proxy_box_server') }}</label>
                                <input type="text" v-model.trim="form.server"
                                    :placeholder="t('proxy.serverPlaceholder')"
                                    class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                    t('lng_proxy_box_port') }}</label>
                                <input type="number" v-model.trim="form.port" placeholder="8080"
                                    class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>

                        <!-- Web（TDLib 1.8.69）：relay 基础路径 -->
                        <div v-if="form.type === 'web'">
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                t('proxy.pathLabel') }}</label>
                            <input type="text" v-model.trim="form.path"
                                :placeholder="t('proxy.pathPlaceholder')"
                                class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <!-- MTProto / Web 密文 -->
                        <div v-if="form.type === 'mtproto' || form.type === 'web'">
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                t('proxy.secretLabel') }}</label>
                            <input type="text" v-model.trim="form.secret"
                                :placeholder="t('proxy.secretPlaceholder')"
                                class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <!-- SOCKS5 / HTTP 用户名密码 -->
                        <template v-if="form.type === 'http' || form.type === 'socks5'">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                        t('proxy.usernameOptional') }}</label>
                                    <input type="text" v-model="form.username"
                                        class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                        t('proxy.passwordOptional') }}</label>
                                    <input type="password" v-model="form.password"
                                        class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                        </template>

                        <!-- 备注 -->
                        <div>
                            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{
                                t('proxy.commentOptional') }}</label>
                            <input type="text" v-model="form.comment"
                                :placeholder="t('proxy.commentPlaceholder')"
                                class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <input type="checkbox" v-model="form.enable"
                                class="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                            {{ t('proxy.enableAfterAdd') }}
                        </label>
                    </div>

                    <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <BaseButton type="button" @click="close" variant="ghost">
                            {{ t('lng_cancel') }}
                        </BaseButton>
                        <button type="button" @click="submitAdd" :disabled="adding"
                            class="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-wait">
                            {{ adding ? t('proxy.adding') : t('lng_stickers_featured_add') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { reactive, ref, watch } from 'vue';
import { toast } from '../../utils/toast';
import { X as XIcon } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { settings } from '../../store/settings';
import { addProxyTo } from '../../store/proxyList';
import type { addedProxy } from 'tdlib-types';
import BaseButton from '../ui/button/BaseButton.vue';

const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    /** 添加成功；enable 为「添加后立即启用」勾选值（组件内已同步 custom 模式） */
    (e: 'added', proxy: addedProxy, enable: boolean): void;
}>();

const proxyTypes = [
    { value: "http", label: "HTTP" },
    { value: "socks5", label: "SOCKS5" },
    { value: "mtproto", label: "MTProto" },
    { value: "web", label: "Web" },
] as const;

const adding = ref(false);
const form = reactive({
    type: "http" as "http" | "socks5" | "mtproto" | "web",
    server: "",
    port: "",
    username: "",
    password: "",
    secret: "",
    path: "",
    comment: "",
    enable: true,
});

/** 切换类型：Web 代理的端口固定 443（TDLib 要求） */
function selectType(type: "http" | "socks5" | "mtproto" | "web") {
    form.type = type;
    if (type === "web") {
        form.port = "443";
    } else if (form.port === "443" && !form.server) {
        // 空表单切走时不要把 443 留下来
        form.port = "";
    }
}

function resetForm() {
    Object.assign(form, {
        type: "http", server: "", port: "", username: "", password: "", secret: "", path: "", comment: "", enable: true,
    });
}

function close() {
    emit('update:modelValue', false);
}

/** 将当前所选模式同步到 Rust 并应用（与 ProxySettings 中逻辑一致） */
async function applyMode() {
    try {
        await invoke("set_proxy_config", {
            mode: settings.proxy.mode,
            proxyId: settings.proxy.selectedProxyId,
        });
    } catch (e: any) {
        toast.error(e?.message || t('proxy.applyFailed'));
    }
}

// 打开时重置表单
watch(
    () => props.modelValue,
    (open) => {
        if (open) resetForm();
    },
);

/** 提交添加代理 */
async function submitAdd() {
    if (adding.value) return;
    if (!form.server.trim()) {
        toast.warning(t('proxy.enterServer'));
        return;
    }
    const port = Number(form.port);
    if (!port || port <= 0 || port > 65535) {
        toast.warning(t('proxy.enterValidPort'));
        return;
    }
    adding.value = true;
    try {
        let type: any;
        if (form.type === "mtproto") {
            type = { _: "proxyTypeMtproto", secret: form.secret.trim() };
        } else if (form.type === "web") {
            // proxyTypeWeb：server 必须是域名、端口固定 443，path 可以留空
            type = { _: "proxyTypeWeb", path: form.path.trim(), secret: form.secret.trim() };
        } else {
            type = {
                _: form.type === "socks5" ? "proxyTypeSocks5" : "proxyTypeHttp",
                username: form.username,
                password: form.password,
            };
        }
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
        close();
        emit('added', added, form.enable);
        toast.success(t('proxy.added'));
    } catch (e: any) {
        toast.error(e?.message || t('proxy.addFailed'));
    } finally {
        adding.value = false;
    }
}
</script>

<style scoped>
.apc-fade-enter-active,
.apc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.apc-fade-enter-from,
.apc-fade-leave-to {
    opacity: 0;
}
</style>
