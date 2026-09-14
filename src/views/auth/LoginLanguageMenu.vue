<template>
    <div class="relative">
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
            <div v-if="visible" class="fixed inset-0 z-9998" @mousedown.self="visible = false" @keydown.esc="visible = false">
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
                        <!-- 内置：始终可选，离线可用 -->
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

                        <!-- 已缓存的 TDLib 语言包：离线也可切换 -->
                        <template v-if="cachedTdlibOptions.length">
                            <div class="px-2 py-1.5 mt-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                                {{ t('language.cachedSection') }}
                            </div>
                            <button v-for="opt in cachedTdlibOptions" :key="opt.code" type="button"
                                class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
                                :class="opt.code === currentCode
                                    ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-100'"
                                @click="select(opt.code)">
                                <span class="flex-1 text-sm truncate">{{ opt.nativeName }}</span>
                                <CheckIcon v-if="opt.code === currentCode" class="w-4 h-4 text-blue-500 shrink-0" />
                            </button>
                        </template>

                        <!-- 联网后可浏览完整 TDLib 语言包列表入口提示 -->
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
import { loadCachedPack } from '../../utils/languagePacks';

const { t } = useI18n();
const langStore = useLanguageStore();
const { languages, currentCode, currentLabel } = storeToRefs(langStore);

const visible = ref(false);

const shortLabel = computed(() => {
    // 用原生名前 4 字或 code 短展示
    const label = currentLabel.value;
    return label.length > 6 ? label.slice(0, 4) + '…' : label;
});

const builtinOptions = computed(() => languages.value.filter((l) => l.builtin));

/** 已缓存到 localStorage 的 TDLib 语言包（离线可切换） */
const cachedTdlibOptions = computed(() =>
    languages.value.filter((l) => !l.builtin && loadCachedPack(l.tdlibPackId))
);

function toggle() {
    visible.value = !visible.value;
    if (visible.value) {
        // 打开时尽量刷新列表（离线会用缓存）
        void langStore.refreshLanguageList({ onlyLocal: true });
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
    // 登录页也尝试用本地缓存初始化语言列表
    void langStore.refreshLanguageList({ onlyLocal: true });
});
</script>
