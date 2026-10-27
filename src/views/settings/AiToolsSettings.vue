<template>
    <div v-bind="$attrs" class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="router.back()">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('aiTools.title') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">

                <!-- ===== 搜索工具：接口地址 / 模型 / Key 都可以单独配 ===== -->
                <section class="mb-8">
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('aiTools.searchSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">web_search</h4>
                                <p class="text-xs text-gray-500 mt-0.5">{{ t('aiTools.searchDesc') }}</p>
                            </div>
                            <ToggleSwitch :model-value="isEnabled('web_search')"
                                @update:model-value="(v: boolean) => setEnabled('web_search', v)" />
                        </div>

                        <div v-if="isEnabled('web_search')" class="mt-3 space-y-2">
                            <label class="block">
                                <span class="text-xs text-gray-500">{{ t('aiTools.searchEndpoint') }}</span>
                                <input v-model="settings.ai.search.endpoint" type="text" spellcheck="false"
                                    :placeholder="t('aiTools.searchEndpointPh')"
                                    class="mt-1 w-full px-3 py-2 rounded-lg text-sm bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none" />
                            </label>
                            <label class="block">
                                <span class="text-xs text-gray-500">{{ t('aiTools.searchModel') }}</span>
                                <input v-model="settings.ai.search.model" type="text" spellcheck="false"
                                    :placeholder="t('aiTools.searchModelPh')"
                                    class="mt-1 w-full px-3 py-2 rounded-lg text-sm bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none" />
                            </label>
                            <label class="block">
                                <span class="text-xs text-gray-500">{{ t('aiTools.searchKey') }}</span>
                                <div class="mt-1 flex items-center gap-2">
                                    <input v-model="searchKey" type="password" spellcheck="false" autocomplete="off"
                                        :placeholder="keySaved ? t('aiTools.searchKeySaved') : t('aiTools.searchKeyPh')"
                                        class="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none" />
                                    <button type="button" :disabled="savingKey"
                                        class="shrink-0 px-3 py-2 rounded-lg text-sm text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-60"
                                        @click="saveSearchKey">{{ t('aiTools.searchKeySave') }}</button>
                                </div>
                            </label>
                            <p class="text-xs text-gray-400">{{ t('aiTools.searchHint') }}</p>
                        </div>
                    </div>
                </section>

                <!-- ===== 工具清单：开关；写类工具可以跳过审核（开的时候先弹风险提示） ===== -->
                <section>
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('aiTools.toolsSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="mb-3 text-xs text-gray-400">{{ t('aiTools.toolsDesc') }}</p>

                    <div class="space-y-2">
                        <div v-for="meta in tools" :key="meta.name"
                            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-3">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2">
                                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono truncate">
                                            {{ meta.name }}</h4>
                                        <span class="shrink-0 px-1.5 py-0.5 rounded text-[11px]"
                                            :class="KIND_CLASS[meta.kind]">{{ t(KIND_LABEL[meta.kind]) }}</span>
                                    </div>
                                    <p class="text-xs text-gray-500 mt-0.5">{{ meta.desc }}</p>
                                </div>
                                <ToggleSwitch :model-value="isEnabled(meta.name)"
                                    @update:model-value="(v: boolean) => setEnabled(meta.name, v)" />
                            </div>

                            <div v-if="meta.needsApproval && isEnabled(meta.name)"
                                class="mt-2 flex items-center justify-between gap-3 rounded-lg bg-amber-50/70 dark:bg-amber-500/10 px-3 py-2">
                                <div class="min-w-0">
                                    <p class="text-xs font-medium text-amber-700 dark:text-amber-400">
                                        {{ t('aiTools.skipApproval') }}</p>
                                    <p class="text-[11px] text-amber-600/80 dark:text-amber-400/70">
                                        {{ t('aiTools.skipApprovalDesc') }}</p>
                                </div>
                                <ToggleSwitch :model-value="skipApproval.includes(meta.name)"
                                    @update:model-value="() => toggleSkip(meta)" />
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <!-- 跳过审核的风险确认：只在这里放行一次开关，之后按设置生效 -->
        <ModalDialog :model-value="!!skipDialog" :title="t('aiTools.skipConfirmTitle')"
            @update:model-value="onSkipDialogVisible">
            <p class="text-sm text-gray-600 dark:text-gray-300">
                {{ t('aiTools.skipConfirmBody', { tool: skipDialog }) }}</p>
            <template #footer>
                <BaseButton variant="ghost" size="sm" @click="onSkipDialogVisible(false)">
                    {{ t('aiTools.cancel') }}
                </BaseButton>
                <BaseButton size="sm" @click="confirmSkip">
                    {{ t('aiTools.skipConfirmOk') }}
                </BaseButton>
            </template>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
/**
 * AI 工具配置（AI 设置页的入口进来）：全部工具清单 + 开关，搜索工具单独配接口 / 模型 / Key。
 *
 * - 开关：关掉的工具不进 toolsSchema（见 utils/aiChat 的 enabledTools），模型看不到就不会调；
 * - 跳过审核：只对 needsApproval 的写类工具有效，开启前必须过这道风险弹窗
 *   （审核逻辑在 utils/aiTools/call 的 setApprovalSkip）；
 * - 搜索：接口地址留空 = 用当前 AI 供应商的地址和 Key、由供应商自己搜；
 *   填了 = 搜索变成客户端工具 web_search(query)，走这套 OpenAI 兼容的 /responses 接口。
 *   Key 存系统钥匙串（ai_translate::save_ai_search_key），这里只显示「已保存」。
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { invoke } from '@tauri-apps/api/core';
import { ChevronLeft as ChevronLeftIcon } from 'lucide-vue-next';
import ToggleSwitch from '../../components/ui/toggle/ToggleSwitch.vue';
import ModalDialog from '../../components/ui/modal/ModalDialog.vue';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import { settings } from '../../store/settings';
import { toast } from '../../utils/toast';
import { TOOLS } from '../../utils/aiTools/registry.ts';
import type { ToolKind, ToolMeta } from '../../utils/aiTools/types.ts';

const router = useRouter();
const { t } = useI18n();

/** 工具清单：web_search 单独在搜索那一节，别重复列 */
const tools = TOOLS.filter((meta) => meta.name !== 'web_search');

const KIND_LABEL: Record<ToolKind, string> = {
    read: 'aiTools.kindRead',
    write: 'aiTools.kindWrite',
    local: 'aiTools.kindLocal',
};
const KIND_CLASS: Record<ToolKind, string> = {
    read: 'bg-gray-200/70 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    write: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    local: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
};

const skipApproval = ref<string[]>(settings.ai.skipApproval);
/** 正在等待风险确认的工具名；'' = 没有弹窗 */
const skipDialog = ref('');
const searchKey = ref('');
const keySaved = ref(false);
const savingKey = ref(false);

/** 缺省 = 启用（只在设置里明确关掉过才是 false） */
const isEnabled = (name: string) => settings.ai.tools[name] !== false;

function setEnabled(name: string, value: boolean): void {
    settings.ai.tools[name] = value;
}

/** 跳过审核：关掉直接生效，开启先弹风险确认（用户没看提示就开了是最危险的情况） */
function toggleSkip(meta: ToolMeta): void {
    if (skipApproval.value.includes(meta.name)) {
        skipApproval.value = skipApproval.value.filter((n) => n !== meta.name);
        settings.ai.skipApproval = skipApproval.value;
        return;
    }
    skipDialog.value = meta.name;
}

function onSkipDialogVisible(visible: boolean): void {
    if (!visible) skipDialog.value = '';
}

function confirmSkip(): void {
    const name = skipDialog.value;
    if (name && !skipApproval.value.includes(name)) {
        skipApproval.value = [...skipApproval.value, name];
        settings.ai.skipApproval = skipApproval.value;
    }
    skipDialog.value = '';
}

async function saveSearchKey(): Promise<void> {
    if (savingKey.value) return;
    savingKey.value = true;
    try {
        // 空 = 清除已保存的 Key
        keySaved.value = await invoke<boolean>('save_ai_search_key', { apiKey: searchKey.value.trim() });
        searchKey.value = '';
        await toast.success(t(keySaved.value ? 'aiTools.searchKeySavedToast' : 'aiTools.searchKeyCleared'));
    } catch (e) {
        await toast.error(e instanceof Error ? e.message : String(e));
    } finally {
        savingKey.value = false;
    }
}

onMounted(async () => {
    try {
        keySaved.value = await invoke<boolean>('has_ai_search_key');
    } catch (e) {
        console.error('[aiTools] 读取搜索 Key 状态失败:', e);
    }
});
</script>
