<template>
    <!-- 多根节点（主面板）：手动把透传 class 绑到主面板根 -->
    <div v-bind="$attrs" class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('lng_settings_language') }}</h2>
            <button type="button"
                class="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                :disabled="loadingList || loadingPack" @click="onRefresh">
                <RefreshCwIcon class="w-3.5 h-3.5" :class="{ 'animate-spin': loadingList || loadingPack }" />
                {{ t('language.refresh') }}
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-4">
                <p class="text-xs text-gray-400 leading-5">
                    {{ t('language.desc') }}
                </p>

                <div
                    class="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus-within:border-blue-400 transition-colors">
                    <SearchIcon class="w-4 h-4 text-gray-400 shrink-0" />
                    <input v-model="query" type="search" :placeholder="t('lng_country_ph')"
                        class="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400" />
                </div>

                <!-- 统一语言包列表（不限高） -->
                <div v-if="loadingList && !filteredLanguages.length" class="py-10 text-center text-sm text-gray-400">
                    {{ t('language.loadingList') }}
                </div>
                <div v-else-if="!filteredLanguages.length" class="py-10 text-center text-sm text-gray-400">
                    {{ t('language.emptyList') }}
                </div>
                <div v-else class="space-y-2">
                    <button v-for="opt in filteredLanguages" :key="opt.code" type="button"
                        v-context-menu="() => languageContextMenu(opt)"
                        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left"
                        :class="opt.code === currentCode
                            ? 'border-blue-400 bg-blue-50/80 dark:bg-blue-500/10'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-blue-300'"
                        @click="select(opt)">
                        <div class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center" :class="opt.builtin
                            ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'">
                            <GlobeIcon class="w-4 h-4" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ opt.nativeName }}</p>
                            <p class="text-xs text-gray-400 truncate">
                                <span v-if="opt.englishName && opt.englishName !== opt.nativeName">
                                    {{ opt.englishName }} ·
                                </span>
                                <span class="font-mono">{{ opt.tdlibPackId }}</span>
                                <span v-if="opt.translatedPercent !== undefined && !opt.builtin">
                                    · {{ opt.translatedPercent }}%
                                </span>
                                <span v-if="isCached(opt.tdlibPackId)" class="ml-1 text-green-500">
                                    · {{ t('language.cached') }}
                                </span>
                            </p>
                        </div>
                        <CheckIcon v-if="opt.code === currentCode" class="w-4 h-4 text-blue-500 shrink-0" />
                        <DownloadIcon v-else-if="!isCached(opt.tdlibPackId)" class="w-4 h-4 text-gray-300 shrink-0" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import {
    ChevronLeft as ChevronLeftIcon,
    RefreshCw as RefreshCwIcon,
    Search as SearchIcon,
    Globe as GlobeIcon,
    Check as CheckIcon,
    Download as DownloadIcon,
    FileJson as FileJsonIcon,
    ClipboardCopy as ClipboardCopyIcon,
} from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { useLanguageStore } from '../../store/language';
import {
    loadCachedPack,
    buildLanguagePackExport,
    languagePackExportFileName,
    type LanguageOption,
} from '../../utils/languagePacks';
import type { ContextMenuItem } from '../../components/contextMenu/types';

defineOptions({ inheritAttrs: false });

const router = useRouter();
const { t } = useI18n();
const langStore = useLanguageStore();
const { languages, currentCode, loadingList, loadingPack } = storeToRefs(langStore);

const query = ref('');
const exportingPackId = ref<string | null>(null);

function goBack() {
    router.push('/home/settings');
}

function isCached(packId: string): boolean {
    return !!loadCachedPack(packId);
}

/** 统一列表：内置 + TDLib 语言包，不拆分 */
const filteredLanguages = computed(() => {
    const q = query.value.trim().toLowerCase();
    const list = languages.value;
    if (!q) return list;
    return list.filter(
        (l) =>
            l.nativeName.toLowerCase().includes(q) ||
            (l.englishName || '').toLowerCase().includes(q) ||
            l.code.toLowerCase().includes(q) ||
            l.tdlibPackId.toLowerCase().includes(q)
    );
});

async function select(opt: LanguageOption) {
    if (opt.code === currentCode.value) return;
    try {
        await langStore.setLanguage(opt.code);
        MessagePlugin.success({
            content: t('language.switched', { name: opt.nativeName }),
            placement: 'top-right',
        });
    } catch (e) {
        console.error('[LanguageSettings] switch failed:', e);
        MessagePlugin.error({ content: t('language.switchFailed'), placement: 'top-right' });
    }
}

function onRefresh() {
    void langStore.refreshLanguageList();
}

function languageContextMenu(opt: LanguageOption): ContextMenuItem[] {
    const packId = opt.tdlibPackId;
    const busy = exportingPackId.value === packId;
    return [
        {
            key: 'export-json',
            label: t('language.exportJson'),
            icon: FileJsonIcon,
            disabled: busy,
            onClick: () => {
                void exportPackAsJson(opt);
            },
        },
        {
            key: 'copy-json',
            label: t('language.copyJson'),
            icon: ClipboardCopyIcon,
            disabled: busy,
            onClick: () => {
                void copyPackJson(opt);
            },
        },
    ];
}

async function exportPackAsJson(opt: LanguageOption) {
    const packId = opt.tdlibPackId;
    if (exportingPackId.value) return;
    exportingPackId.value = packId;
    try {
        const payload = await buildLanguagePackExport(packId);
        const defaultName = languagePackExportFileName(packId);
        const dest = await save({
            title: t('language.exportJson'),
            defaultPath: defaultName,
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (!dest) return;
        const text = JSON.stringify(payload, null, 2);
        await writeFile(dest, new TextEncoder().encode(text));
        MessagePlugin.success({
            content: t('language.exportSuccess', { count: payload.stringCount }),
            placement: 'top-right',
        });
    } catch (e) {
        console.error('[LanguageSettings] export pack failed:', packId, e);
        MessagePlugin.error({ content: t('language.exportFailed'), placement: 'top-right' });
    } finally {
        exportingPackId.value = null;
    }
}

async function copyPackJson(opt: LanguageOption) {
    const packId = opt.tdlibPackId;
    if (exportingPackId.value) return;
    exportingPackId.value = packId;
    try {
        const payload = await buildLanguagePackExport(packId);
        const text = JSON.stringify(payload, null, 2);
        await navigator.clipboard.writeText(text);
        MessagePlugin.success({
            content: t('language.copySuccess', { count: payload.stringCount }),
            placement: 'top-right',
        });
    } catch (e) {
        console.error('[LanguageSettings] copy pack failed:', packId, e);
        MessagePlugin.error({ content: t('language.exportFailed'), placement: 'top-right' });
    } finally {
        exportingPackId.value = null;
    }
}

onMounted(() => {
    void langStore.refreshLanguageList({ onlyLocal: true });
    void langStore.refreshLanguageList();
});
</script>
