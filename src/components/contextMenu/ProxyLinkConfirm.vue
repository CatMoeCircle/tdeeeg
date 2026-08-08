<template>
    <Teleport to="body">
        <!-- 添加代理弹窗 -->
        <Transition name="elc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-100 max-w-[92vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">添加代理</h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 内容：代理信息 -->
                    <div class="px-4 py-4">
                        <template v-if="proxy">
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-10 h-10 shrink-0 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 flex items-center justify-center">
                                    <ServerIcon class="w-5 h-5" />
                                </div>
                                <div class="min-w-0">
                                    <p class="text-xs text-gray-400">代理服务器</p>
                                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-200 break-all">
                                        {{ proxy.server }}
                                    </p>
                                </div>
                            </div>

                            <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p class="text-xs text-gray-400 mb-0.5">端口</p>
                                    <p class="text-gray-800 dark:text-gray-200">{{ proxy.port }}</p>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-400 mb-0.5">类型</p>
                                    <p class="text-gray-800 dark:text-gray-200">{{ proxyTypeLabel }}</p>
                                </div>

                                <!-- MTProto：显示密文 -->
                                <div v-if="proxy.type._ === 'proxyTypeMtproto'" class="col-span-2">
                                    <p class="text-xs text-gray-400 mb-0.5">密文（Secret）</p>
                                    <p class="text-gray-800 dark:text-gray-200 break-all">{{ proxy.type.secret }}</p>
                                </div>

                                <!-- SOCKS5 / HTTP：显示用户名密码 -->
                                <template v-else>
                                    <div>
                                        <p class="text-xs text-gray-400 mb-0.5">用户名</p>
                                        <p class="text-gray-800 dark:text-gray-200">{{ proxy.type.username || '—' }}</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-400 mb-0.5">密码</p>
                                        <p class="text-gray-800 dark:text-gray-200">{{ proxy.type.password || '—' }}</p>
                                    </div>
                                </template>
                            </div>

                            <div class="mt-4">
                                <button type="button" @click="onPing"
                                    class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-cyan-300 dark:border-cyan-700 text-cyan-600 dark:text-cyan-400 text-sm font-medium hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors disabled:opacity-60 disabled:cursor-wait"
                                    :disabled="pingLoading">
                                    <LoaderIcon v-if="pingLoading" class="w-4 h-4 animate-spin" />
                                    <ActivityIcon v-else class="w-4 h-4" />
                                    {{ pingLoading ? '正在测试...' : 'Ping 测试' }}
                                </button>

                                <!-- ping 结果 -->
                                <p v-if="pingResult" class="mt-2 text-center text-xs font-medium"
                                    :class="pingResult.ok ? 'text-green-500' : 'text-red-500'">
                                    {{ pingResult.text }}
                                </p>
                            </div>
                        </template>
                        <p v-else class="text-sm text-gray-500">该代理类型不受支持。</p>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            取消
                        </button>
                        <button type="button" @click="confirm" :disabled="!proxy"
                            class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                            继续
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- ping IP 暴露警告弹窗 -->
        <Transition name="elc-fade">
            <div v-if="pingWarningVisible"
                class="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancelWarning">
                <div
                    class="w-90 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">Ping 测试</h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancelWarning">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 内容：警告 -->
                    <div class="px-4 py-4 flex items-start gap-3">
                        <div
                            class="w-9 h-9 shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center">
                            <AlertTriangleIcon class="w-5 h-5" />
                        </div>
                        <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            警告：这将使您的IP地址暴露给代理服务器的管理员。
                        </p>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancelWarning"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            取消
                        </button>
                        <button type="button" @click="confirmWarning"
                            class="px-4 py-1.5 rounded-lg text-sm bg-amber-500 text-white hover:bg-amber-600">
                            继续
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { XIcon, ServerIcon, ActivityIcon, LoaderIcon, AlertTriangleIcon } from "lucide-vue-next";
import {
    visible,
    pingWarningVisible,
    pendingProxy,
    pingResult,
    pingLoading,
    confirmAddProxy,
    cancelAddProxy,
    confirmPingWarning,
    cancelPingWarning,
    pingCurrentProxy,
} from "../../store/proxyLink";

const proxy = computed(() => pendingProxy.value);

const proxyTypeLabel = computed(() => {
    if (!proxy.value) return "";
    switch (proxy.value.type._) {
        case "proxyTypeSocks5": return "SOCKS5";
        case "proxyTypeHttp": return "HTTP";
        case "proxyTypeMtproto": return "MTProto";
        default: return "未知";
    }
});

function confirm() {
    confirmAddProxy();
}

function cancel() {
    cancelAddProxy();
}

function onPing() {
    pingCurrentProxy();
}

function confirmWarning() {
    confirmPingWarning();
}

function cancelWarning() {
    cancelPingWarning();
}

function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (pingWarningVisible.value) {
        cancelWarning();
    } else if (visible.value) {
        cancel();
    }
}

onMounted(() => {
    window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
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
