<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_polls_create_allowed_countries')"
        @update:model-value="close">
        <div class="space-y-3">
            <input v-model="query" type="search" :placeholder="t('lng_dlg_filter')"
                :aria-label="t('lng_dlg_filter')"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />

            <p class="text-[11px] leading-none text-gray-400">
                {{ tdPlural('lng_polls_create_countries_count', selected.length) }}
            </p>

            <div
                class="max-h-96 overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 divide-y divide-gray-100 dark:border-gray-700 dark:divide-gray-700/60">
                <button v-for="country in filtered" :key="country.country_code" type="button"
                    class="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                    @click="toggle(country.country_code)">
                    <span class="w-5 text-base leading-none">{{ country.flag_emoji || '🏳️' }}</span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm text-gray-800 dark:text-gray-100">
                            {{ country.english_name || country.name }}
                        </span>
                        <span class="block truncate text-[11px] text-gray-400">
                            {{ country.name }} · {{ country.country_code }}
                        </span>
                    </span>
                    <span class="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors"
                        :class="selected.includes(country.country_code)
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-gray-300 dark:border-gray-600'">
                        <CheckIcon v-if="selected.includes(country.country_code)" class="h-3 w-3"
                            :stroke-width="3" />
                    </span>
                </button>

                <div v-if="loading" class="px-4 py-8 text-center text-sm text-gray-400">
                    {{ t('lng_contacts_loading') }}
                </div>
                <div v-else-if="filtered.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
                    {{ t('lng_contacts_not_found') }}
                </div>
            </div>
        </div>

        <template #footer>
            <BaseButton variant="ghost" size="sm" @click="close">{{ t('lng_cancel') }}</BaseButton>
            <BaseButton type="button" size="sm" @click="submit">{{ t('lng_box_done') }}</BaseButton>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check as CheckIcon } from 'lucide-vue-next';
import type { countryInfo } from 'tdlib-types';
import ModalDialog from '../../ui/modal/ModalDialog.vue';
import BaseButton from '../../ui/button/BaseButton.vue';
import { tdlibSend } from '../../../utils/session/tdlib';
import { tdPlural } from '../../../utils/i18n/tdLang';
import { toast } from '../../../utils/ui/toast';

const props = withDefaults(defineProps<{
    modelValue: boolean;
    selected: string[];
    max?: number;
}>(), { max: 50 });

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'submit', codes: string[]): void;
}>();

const { t } = useI18n();

const query = ref('');
const loading = ref(false);
const countries = ref<countryInfo[]>([]);
/** 本地勾选结果；点 Done 才回传，取消不污染父表单 */
const picked = ref<string[]>([]);

/** 常用国家/地区置顶，其余按英文名排序 */
const PRIORITY: Record<string, number> = { CN: 0, HK: 1, MO: 2, TW: 3, US: 4, JP: 5, SG: 6 };

const sorted = computed(() => [...countries.value].sort((a, b) => {
    const pa = PRIORITY[a.country_code];
    const pb = PRIORITY[b.country_code];
    if (pa !== undefined || pb !== undefined) return (pa ?? 99) - (pb ?? 99);
    return (a.english_name || a.name).localeCompare(b.english_name || b.name);
}));

const filtered = computed(() => {
    const kw = query.value.trim().toLowerCase();
    if (!kw) return sorted.value;
    return sorted.value.filter((c) =>
        c.country_code.toLowerCase().includes(kw)
        || c.name.toLowerCase().includes(kw)
        || c.english_name.toLowerCase().includes(kw));
});

watch(() => props.modelValue, (open) => {
    if (!open) return;
    query.value = '';
    picked.value = [...props.selected];
    void load();
}, { immediate: true });

async function load() {
    if (countries.value.length > 0) return;
    loading.value = true;
    try {
        const res = await tdlibSend({ _: 'getCountries' });
        if (res._ === 'countries') {
            countries.value = res.countries.filter((c) => !c.is_hidden);
        }
    } catch (e) {
        console.error('Load countries failed:', e);
        countries.value = [];
    } finally {
        loading.value = false;
    }
}

function toggle(code: string) {
    const index = picked.value.indexOf(code);
    if (index >= 0) {
        picked.value.splice(index, 1);
        return;
    }
    if (picked.value.length >= props.max) {
        toast.warning(t('lng_polls_create_countries_limit', { count: props.max }));
        return;
    }
    picked.value.push(code);
}

function close() {
    emit('update:modelValue', false);
}

function submit() {
    emit('submit', [...picked.value]);
    close();
}
</script>
