<template>
    <Teleport to="body">
        <Transition name="elc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-100 max-w-[92vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {{ t('language.packAddTitle') }}
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <div class="px-4 py-5">
                        <div v-if="loading" class="py-6 flex flex-col items-center gap-3 text-gray-400">
                            <LoaderIcon class="w-6 h-6 animate-spin" />
                            <p class="text-sm">{{ t('language.packLoading') }}</p>
                        </div>

                        <div v-else-if="loadError" class="py-4 text-center">
                            <p class="text-sm text-red-500 mb-1">{{ t('language.packLoadFailed') }}</p>
                            <p class="text-xs text-gray-400 break-all">{{ loadError }}</p>
                            <p class="mt-3 text-xs text-gray-400 font-mono">{{ packId }}</p>
                        </div>

                        <template v-else-if="pack">
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-12 h-12 shrink-0 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                    <GlobeIcon class="w-6 h-6" />
                                </div>
                                <div class="min-w-0">
                                    <p class="text-base font-semibold text-gray-900 dark:text-gray-100">
                                        {{ pack.native_name || pack.name || packId }}
                                    </p>
                                    <p v-if="pack.name && pack.name !== pack.native_name"
                                        class="text-xs text-gray-400 truncate">
                                        {{ pack.name }}
                                    </p>
                                    <p class="text-xs text-gray-400 font-mono mt-0.5">{{ pack.id || packId }}</p>
                                </div>
                            </div>

                            <div class="mt-4 space-y-2.5">
                                <div>
                                    <div class="flex items-center justify-between text-xs mb-1">
                                        <span class="text-gray-500 dark:text-gray-400">
                                            {{ t('language.packCompletion') }}
                                        </span>
                                        <span class="font-medium text-gray-800 dark:text-gray-200">
                                            {{ completionPercent }}%
                                        </span>
                                    </div>
                                    <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                        <div class="h-full rounded-full transition-all duration-500"
                                            :class="completionPercent >= 90
                                                ? 'bg-green-500'
                                                : completionPercent >= 50
                                                    ? 'bg-blue-500'
                                                    : 'bg-amber-500'"
                                            :style="{ width: completionPercent + '%' }"></div>
                                    </div>
                                    <p class="mt-1 text-[11px] text-gray-400">
                                        {{ pack.translated_string_count }} / {{ pack.total_string_count }}
                                    </p>
                                </div>

                                <div class="flex flex-wrap gap-2 text-[11px]">
                                    <span v-if="pack.is_official"
                                        class="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                        {{ t('language.packOfficial') }}
                                    </span>
                                    <span v-if="pack.is_beta"
                                        class="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                        Beta
                                    </span>
                                    <span v-if="pack.is_rtl"
                                        class="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">
                                        RTL
                                    </span>
                                    <span v-if="pack.is_installed"
                                        class="px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400">
                                        {{ t('language.packInstalled') }}
                                    </span>
                                </div>
                            </div>
                        </template>

                        <template v-else>
                            <p class="text-sm text-gray-600 dark:text-gray-300">
                                {{ t('language.packAddTitle') }}
                            </p>
                            <p class="mt-2 font-mono text-sm text-gray-800 dark:text-gray-200">{{ packId }}</p>
                        </template>
                    </div>

                    <div class="px-4 pb-4 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            {{ t('language.packCancel') }}
                        </button>
                        <button type="button" @click="confirm" :disabled="loading || !!loadError"
                            class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {{ t('language.packConfirm') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { X as XIcon, Globe as GlobeIcon, Loader2 as LoaderIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import {
    visible,
    pendingPack as pack,
    pendingPackId as packId,
    loading,
    loadError,
    confirmAddLanguagePack,
    cancelAddLanguagePack,
} from '../../store/languagePackLink';

const { t } = useI18n();

const completionPercent = computed(() => {
    const p = pack.value;
    if (!p || !p.total_string_count) return 0;
    return Math.min(100, Math.round((p.translated_string_count / p.total_string_count) * 100));
});

function confirm() {
    confirmAddLanguagePack();
}

function cancel() {
    cancelAddLanguagePack();
}

function onKey(e: KeyboardEvent) {
    if (!visible.value) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
    }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>
