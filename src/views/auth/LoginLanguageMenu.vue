<template>
    <!-- 嵌入模式：仅渲染内容，供 LoginSettingsMenu 使用 -->
    <div v-if="embedded" class="p-3">
        <div class="space-y-1">
            <!-- 内置语言 -->
            <div class="px-2 py-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                {{ t('language.builtinSection') }}
            </div>
            <button v-for="opt in builtinOptions" :key="opt.code" type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
                :class="opt.code === currentCode
                    ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-100'"
                @click="select(opt.code)">
                <span class="flex-1 text-sm">{{ opt.nativeName }}</span>
                <span v-if="isRecommended(opt)"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 shrink-0">
                    {{ t('language.recommended') }}
                </span>
                <CheckIcon v-if="opt.code === currentCode" class="w-4 h-4 text-blue-500 shrink-0" />
            </button>

            <!-- TDLib 推荐 / 完整语言包列表 -->
            <div class="px-2 py-1.5 mt-2 flex items-center justify-between">
                <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                    {{ t('language.tdlibSection') }}
                </span>
                <button v-if="!loadingList" type="button"
                    class="text-[11px] text-blue-500 hover:text-blue-600 transition-colors"
                    @click="refreshList">
                    {{ t('language.refresh') }}
                </button>
            </div>

            <div v-if="loadingList && !tdlibOptions.length"
                class="px-3 py-4 text-center text-xs text-gray-400">
                {{ t('language.loadingTdlibList') }}
            </div>

            <button v-for="opt in tdlibOptions" :key="opt.code" type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
                :class="opt.code === currentCode
                    ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-100'"
                @click="select(opt.code)">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                        <span class="text-sm truncate">{{ opt.nativeName }}</span>
                        <span v-if="isRecommended(opt)"
                            class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 shrink-0">
                            {{ t('language.recommended') }}
                        </span>
                        <span v-else-if="opt.isOfficial"
                            class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 shrink-0">
                            {{ t('language.packOfficial') }}
                        </span>
                        <span v-if="opt.isBeta"
                            class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 shrink-0">
                            {{ t('language.beta') }}
                        </span>
                    </div>
                    <div class="text-[11px] text-gray-400 truncate mt-0.5">
                        <span v-if="opt.englishName && opt.englishName !== opt.nativeName">{{ opt.englishName }} ·
                        </span>
                        <span class="font-mono">{{ opt.tdlibPackId }}</span>
                        <span v-if="opt.translatedPercent !== undefined"> · {{ opt.translatedPercent }}%</span>
                        <span v-if="loadCachedPack(opt.tdlibPackId)" class="text-green-500">
                            · {{ t('language.cached') }}
                        </span>
                    </div>
                </div>
                <CheckIcon v-if="opt.code === currentCode" class="w-4 h-4 text-blue-500 shrink-0" />
            </button>

            <div v-if="!loadingList && !tdlibOptions.length && !listFromCacheOnly"
                class="px-3 py-2 text-[11px] text-gray-400">
                {{ t('language.emptyList') }}
            </div>

            <div class="px-3 pt-3 pb-1 text-[11px] text-gray-400 leading-4">
                {{ t('language.loginHint') }}
            </div>
            <div v-if="loadingList" class="px-3 pb-1 text-[11px] text-blue-400">
                {{ t('language.loadingTdlibList') }}
            </div>
        </div>
    </div>

    <!-- 独立模式：保留原右上角按钮 + 弹层 -->
    <div v-else class="relative">
        <button type="button" @click="toggle"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
            :class="visible
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'"
            :title="t('language.title')">
            <GlobeIcon class="w-4 h-4" />
            <span>{{ shortLabel }}</span>
        </button>

        <Teleport to="body">
            <div v-if="visible" class="fixed inset-0 z-9998" @mousedown.self="visible = false"
                @keydown.esc="visible = false">
                <div class="absolute top-10 right-4 w-80 max-w-[calc(100vw-2rem)] rounded-2xl
                    bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('language.title') }}</h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="visible = false">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <div class="p-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div class="px-2 py-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                            {{ t('language.builtinSection') }}
                        </div>
                        <button v-for="opt in builtinOptions" :key="opt.code" type="button"
                            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
                            :class="opt.code === currentCode
                                ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-100'"
                            @click="select(opt.code)">
                            <span class="flex-1 text-sm">{{ opt.nativeName }}</span>
                            <CheckIcon v-if="opt.code === currentCode" class="w-4 h-4 text-blue-500 shrink-0" />
                        </button>

                        <div class="px-2 py-1.5 mt-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                            {{ t('language.tdlibSection') }}
                        </div>
                        <button v-for="opt in tdlibOptions" :key="opt.code" type="button"
                            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
                            :class="opt.code === currentCode
                                ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-100'"
                            @click="select(opt.code)">
                            <div class="flex-1 min-w-0">
                                <span class="text-sm truncate block">{{ opt.nativeName }}</span>
                                <span class="text-[11px] text-gray-400">
                                    <span v-if="opt.translatedPercent !== undefined">{{ opt.translatedPercent }}%</span>
                                    <span v-if="loadCachedPack(opt.tdlibPackId)" class="text-green-500">
                                        · {{ t('language.cached') }}
                                    </span>
                                </span>
                            </div>
                            <CheckIcon v-if="opt.code === currentCode" class="w-4 h-4 text-blue-500 shrink-0" />
                        </button>

                        <div class="px-3 pt-3 pb-1 text-[11px] text-gray-400 leading-4">
                            {{ t('language.loginHint') }}
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Globe as GlobeIcon, X as XIcon, Check as CheckIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '../../store/language';
import { loadCachedPack, matchesSystemLanguage, type LanguageOption } from '../../utils/languagePacks';

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const { t } = useI18n();
const langStore = useLanguageStore();
const { languages, currentCode, currentLabel, loadingList, listFromCacheOnly } = storeToRefs(langStore);

const visible = ref(false);

const shortLabel = computed(() => {
    const label = currentLabel.value;
    return label.length > 6 ? label.slice(0, 4) + '…' : label;
});

const builtinOptions = computed(() => languages.value.filter((l) => l.builtin));

/**
 * TDLib 语言包列表：
 * - 优先展示与系统语言匹配的「推荐」项
 * - 其次官方包，再按 nativeName 排序
 */
const tdlibOptions = computed(() => {
    const list = languages.value.filter((l) => !l.builtin);
    return [...list].sort((a, b) => {
        const ra = isRecommended(a) ? 0 : 1;
        const rb = isRecommended(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        const oa = a.isOfficial ? 0 : 1;
        const ob = b.isOfficial ? 0 : 1;
        if (oa !== ob) return oa - ob;
        return a.nativeName.localeCompare(b.nativeName);
    });
});

function isRecommended(opt: LanguageOption): boolean {
    return matchesSystemLanguage(opt);
}

/** 刷新语言列表：先本地缓存立即展示，再联网拉取 TDLib 完整推荐列表 */
async function refreshList() {
    await langStore.refreshLanguageList({ onlyLocal: true });
    void langStore.refreshLanguageList();
}

function toggle() {
    visible.value = !visible.value;
    if (visible.value) {
        void refreshList();
    }
}

async function select(code: string) {
    if (code === currentCode.value) {
        visible.value = false;
        return;
    }
    await langStore.setLanguage(code);
    visible.value = false;
}

onMounted(() => {
    // 登录页：先用缓存，再尝试获取 TDLib 推荐语言列表
    void refreshList();
});
</script>
