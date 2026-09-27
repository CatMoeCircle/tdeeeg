<template>
    <!-- 嵌入模式：仅表单内容 -->
    <div v-if="embedded" class="p-4 space-y-4">
        <p class="text-xs text-gray-400">{{ t('systemSettings.rebuildNote') }}</p>

        <div
            class="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <InfoIcon class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p class="text-xs text-blue-600 dark:text-blue-400 leading-5">{{ t('systemSettings.affectsNewOnly') }}</p>
        </div>

        <div class="flex items-center justify-between">
            <div>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('systemSettings.useTestDc') }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ t('systemSettings.useTestDcDesc') }}</p>
            </div>
            <button type="button" @click="useTestDc = !useTestDc"
                class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                :class="useTestDc ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    :class="useTestDc ? 'translate-x-5' : ''" />
            </button>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
            <div class="flex items-center justify-between mb-3">
                <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('systemSettings.customApi') }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ t('systemSettings.customApiOff') }}</p>
                </div>
                <button type="button" @click="customApiCreds = !customApiCreds"
                    class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                    :class="customApiCreds ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                    <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                        :class="customApiCreds ? 'translate-x-5' : ''" />
                </button>
            </div>

            <template v-if="customApiCreds">
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API ID</label>
                <input v-model="apiId" type="text" inputmode="numeric" :placeholder="t('systemSettings.apiIdPlaceholder')" spellcheck="false"
                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none mb-3" />
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API Hash</label>
                <input v-model="apiHash" type="text" :placeholder="t('systemSettings.apiHashPlaceholder')" spellcheck="false"
                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
            </template>
        </div>

        <div class="flex items-center justify-end gap-3 pt-1">
            <button type="button" @click="apply"
                class="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
                :class="applying ? 'bg-blue-400 cursor-wait' : 'bg-blue-500 hover:bg-blue-600'" :disabled="applying">
                {{ applying ? t('systemSettings.rebuilding') : t('systemSettings.applyAndRestart') }}
            </button>
        </div>
    </div>

    <!-- 独立模式：右上角按钮 + 弹窗 -->
    <div v-else class="relative">
        <!-- 右上角 API/测试DC 按钮 -->
        <button type="button" @click="toggle"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors" :class="visible
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'"
            :title="t('systemSettings.apiTestDcTitle')">
            <SettingsIcon class="w-4 h-4" />
            <span>{{ testDc ? t('systemSettings.testDcBadge') : 'API' }}</span>
        </button>

        <!-- 设置弹窗 -->
        <Teleport to="body">
            <div v-if="visible" class="fixed inset-0 z-9998" @mousedown.self="visible = false"
                @keydown.esc="visible = false">
                <div class="absolute top-10 right-4 w-96 max-w-[calc(100vw-2rem)] rounded-2xl
                    bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('systemSettings.apiDcTitle') }}</h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="visible = false">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <div class="p-4 space-y-4">
                        <p class="text-xs text-gray-400">{{ t('systemSettings.rebuildNote') }}</p>

                        <div
                            class="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                            <InfoIcon class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                            <p class="text-xs text-blue-600 dark:text-blue-400 leading-5">{{ t('systemSettings.affectsNewOnly') }}</p>
                        </div>

                        <!-- 使用测试数据中心 -->
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('systemSettings.useTestDc') }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ t('systemSettings.useTestDcDesc') }}</p>
                            </div>
                            <button type="button" @click="useTestDc = !useTestDc"
                                class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                                :class="useTestDc ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                <div
                                    class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                                    :class="useTestDc ? 'translate-x-5' : ''" />
                            </button>
                        </div>

                        <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
                            <div class="flex items-center justify-between mb-3">
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('systemSettings.customApi') }}
                                    </p>
                                    <p class="text-xs text-gray-400 mt-0.5">{{ t('systemSettings.customApiOff') }}</p>
                                </div>
                                <button type="button" @click="customApiCreds = !customApiCreds"
                                    class="w-11 h-6 rounded-full transition-colors relative shrink-0"
                                    :class="customApiCreds ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                    <div
                                        class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                                        :class="customApiCreds ? 'translate-x-5' : ''" />
                                </button>
                            </div>

                            <template v-if="customApiCreds">
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API
                                    ID</label>
                                <input v-model="apiId" type="text" inputmode="numeric" :placeholder="t('systemSettings.apiIdPlaceholder')"
                                    spellcheck="false"
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none mb-3" />
                                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">API
                                    Hash</label>
                                <input v-model="apiHash" type="text" :placeholder="t('systemSettings.apiHashPlaceholder')" spellcheck="false"
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none" />
                            </template>
                        </div>

                        <div class="flex items-center justify-end gap-3 pt-1">
                            <button type="button" @click="visible = false"
                                class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                                {{ t('lng_cancel') }}
                            </button>
                            <button type="button" @click="apply"
                                class="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
                                :class="applying ? 'bg-blue-400 cursor-wait' : 'bg-blue-500 hover:bg-blue-600'"
                                :disabled="applying">
                                {{ applying ? t('systemSettings.rebuilding') : t('systemSettings.applyAndRestart') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { MessagePlugin } from "tdesign-vue-next";
import { Settings as SettingsIcon, X as XIcon, Info as InfoIcon } from 'lucide-vue-next';
import { settings } from "../../store/settings";
import { reinitTdlibWithSystemParams } from "../../utils/tdlibParams";

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const visible = ref(false);

/** 表单状态（从持久化 settings.system 初始化） */
const useTestDc = ref(settings.system.useTestDc);
const customApiCreds = ref(settings.system.customApiCreds);
const apiId = ref(settings.system.apiId);
const apiHash = ref(settings.system.apiHash);

/** 按钮角标文案：使用测试 DC 时显示「测试」，否则「API」 */
const testDc = computed(() => useTestDc.value);

// 同步到持久化 settings（localStorage）
watch(useTestDc, (v) => { settings.system.useTestDc = v; });
watch(customApiCreds, (v) => { settings.system.customApiCreds = v; });
watch(apiId, (v) => { settings.system.apiId = v.trim(); });
watch(apiHash, (v) => { settings.system.apiHash = v.trim(); });

const applying = ref(false);

function toggle() {
    // 每次打开时重新同步表单与持久化值（避免残留）
    if (!visible.value) {
        useTestDc.value = settings.system.useTestDc;
        customApiCreds.value = settings.system.customApiCreds;
        apiId.value = settings.system.apiId;
        apiHash.value = settings.system.apiHash;
    }
    visible.value = !visible.value;
}

/** 应用参数并重建 TDLib 客户端 */
async function apply() {
    if (applying.value) return;
    if (customApiCreds.value) {
        if (!apiId.value.trim() || !apiHash.value.trim()) {
            MessagePlugin.warning(t('systemSettings.enterApiCreds'));
            return;
        }
        const id = Number(apiId.value.trim());
        if (!Number.isInteger(id) || id <= 0) {
            MessagePlugin.warning(t('systemSettings.apiIdInvalid'));
            return;
        }
    }

    applying.value = true;
    try {
        // 先把表单写入 settings，再统一走 applyTdlibSystemParams
        settings.system.useTestDc = useTestDc.value;
        settings.system.customApiCreds = customApiCreds.value;
        settings.system.apiId = apiId.value.trim();
        settings.system.apiHash = apiHash.value.trim();

        // 通知 LoginView 清空二维码（如果正在显示）
        window.dispatchEvent(new CustomEvent('login-menu-clear-qr'));
        // 写回 settings.system 的凭据 → 后端 config/账户，并 force 重建客户端
        await reinitTdlibWithSystemParams();
        MessagePlugin.success(t('systemSettings.appliedReconnecting'));
        window.location.reload();
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('systemSettings.applyParamsFailed'));
        applying.value = false;
    }
}

const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') visible.value = false;
};
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
