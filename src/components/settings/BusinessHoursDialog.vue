<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_hours_title')" @update:model-value="close">
        <div class="space-y-4">
            <!-- 显示营业时间开关 -->
            <div class="flex items-center justify-between">
                <span class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_hours_show') }}</span>
                <button type="button" role="switch" :aria-checked="hoursEnabled" @click="toggleHoursEnabled"
                    class="relative w-11 h-6 rounded-full transition-colors duration-200"
                    :class="hoursEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                    <span
                        class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                        :class="hoursEnabled ? 'translate-x-5' : 'translate-x-0'" />
                </button>
            </div>

            <template v-if="hoursEnabled">
                <!-- 时区选择（可搜索下拉） -->
                <div class="relative" ref="tzDropdownRef">
                    <label class="text-xs text-gray-400">{{ t('lng_hours_time_zone') }}</label>
                    <button type="button" @click="tzDropdownOpen = !tzDropdownOpen"
                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                        <span class="truncate text-gray-800 dark:text-gray-100">{{ selectedTimeZoneLabel }}</span>
                        <svg class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
                            :class="tzDropdownOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <transition enter-active-class="transition ease-out duration-100"
                        enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
                        leave-active-class="transition ease-in duration-75" leave-from-class="opacity-100 scale-100"
                        leave-to-class="opacity-0 scale-95">
                        <div v-if="tzDropdownOpen"
                            class="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden">
                            <!-- 搜索框 -->
                            <div class="p-2 border-b border-gray-100 dark:border-gray-700">
                                <div class="relative">
                                    <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input v-model="tzSearch" ref="tzSearchRef" type="text"
                                        :placeholder="t('lng_participant_filter')" spellcheck="false"
                                        class="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                </div>
                            </div>
                            <!-- 时区列表 -->
                            <ul class="max-h-52 overflow-y-auto custom-scrollbar">
                                <li v-for="tz in filteredTimeZones" :key="tz.id">
                                    <button type="button"
                                        class="w-full px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-colors"
                                        :class="tz.id === timeZoneInput
                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                            : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50'"
                                        @click="selectTimeZone(tz.id)">
                                        <span class="truncate">{{ tz.name }}</span>
                                        <span class="text-xs shrink-0" :class="tz.id === timeZoneInput
                                            ? 'text-blue-500 dark:text-blue-400'
                                            : 'text-gray-400'">UTC{{ formatUtcOffsetWithSign(tz.utc_time_offset)
                                            }}</span>
                                    </button>
                                </li>
                                <li v-if="filteredTimeZones.length === 0"
                                    class="px-3 py-4 text-sm text-gray-400 text-center">
                                    {{ t('lng_settings_empty_bio') }}
                                </li>
                            </ul>
                        </div>
                    </transition>
                </div>

                <!-- 每天的营业时段 -->
                <div class="space-y-2">
                    <div v-for="(d, dayIndex) in days" :key="dayIndex"
                        class="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <div class="flex items-center gap-3">
                            <!-- 胶囊开关 -->
                            <button type="button" role="switch" :aria-checked="d.enabled" @click="d.enabled = !d.enabled"
                                class="relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0"
                                :class="d.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                                <span
                                    class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                                    :class="d.enabled ? 'translate-x-4' : 'translate-x-0'" />
                            </button>
                            <span class="text-sm text-gray-800 dark:text-gray-100 w-max shrink-0">{{ d.name
                            }}</span>
                        </div>
                        <template v-if="d.enabled">
                            <div v-for="(iv, ivIdx) in d.intervals" :key="ivIdx" class="flex items-center gap-2 mt-2 ml-13">
                                <TTimePicker v-model="iv.start" format="HH:mm" :placeholder="t('lng_auction_starts_label')"
                                    class="flex-1 min-w-0" />
                                <span class="text-gray-400 text-xs">-</span>
                                <TTimePicker v-model="iv.end" format="HH:mm" :placeholder="t('lng_auction_end_label')"
                                    class="flex-1 min-w-0" />
                                <button v-if="d.intervals.length > 1" type="button" @click="removeInterval(dayIndex, ivIdx)"
                                    class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <button v-if="d.intervals.length < 4 && totalIntervals < 28" type="button"
                                @click="addInterval(dayIndex)"
                                class="mt-2 ml-13 px-3 py-1 rounded-lg text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                {{ t('lng_hours_add_button') }}
                            </button>
                        </template>
                    </div>
                </div>
            </template>

            <div class="flex justify-end gap-2">
                <button type="button" @click="saveBusinessHours" :disabled="savingHours"
                    class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
                    {{ savingHours ? t('editProfile.saving') : t('lng_settings_save') }}
                </button>
            </div>
            <p v-if="hoursError" class="text-xs text-red-500">{{ hoursError }}</p>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { TimePicker as TTimePicker, MessagePlugin } from 'tdesign-vue-next';
import ModalDialog from './ModalDialog.vue';
import { tdlibSend } from '../../utils/tdlib';

import type { userFullInfo, businessOpeningHoursInterval } from 'tdlib-types';

const props = defineProps<{
    modelValue: boolean;
    fullInfo?: userFullInfo;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    changed: [];
}>();

const { t } = useI18n();

const timeZoneInput = ref('');
const savingHours = ref(false);
const hoursError = ref('');
const hoursEnabled = ref(true);
const days = ref<{ name: string; enabled: boolean; intervals: { start: string; end: string }[] }[]>([]);

const totalIntervals = computed(() => days.value.reduce((sum, d) => sum + (d.enabled ? d.intervals.length : 0), 0));

function addInterval(dayIndex: number) {
    const d = days.value[dayIndex];
    if (d.intervals.length < 4 && totalIntervals.value < 28) {
        d.intervals.push({ start: '09:00', end: '17:00' });
    }
}

function removeInterval(dayIndex: number, ivIndex: number) {
    const d = days.value[dayIndex];
    if (d.intervals.length > 1) {
        d.intervals.splice(ivIndex, 1);
    }
}

// 时区列表
const timeZoneOptions = ref<{ id: string; name: string; utc_time_offset: number }[]>([]);
let timeZonesLoaded = false;

// 可搜索下拉状态
const tzDropdownOpen = ref(false);
const tzSearch = ref('');
const tzDropdownRef = ref<HTMLElement | null>(null);
const tzSearchRef = ref<HTMLInputElement | null>(null);

const filteredTimeZones = computed(() => {
    const q = tzSearch.value.trim().toLowerCase();
    if (!q) return timeZoneOptions.value;
    return timeZoneOptions.value.filter((tz) =>
        tz.name.toLowerCase().includes(q) || tz.id.toLowerCase().includes(q)
    );
});

const selectedTimeZoneLabel = computed(() => {
    const tz = timeZoneOptions.value.find((t) => t.id === timeZoneInput.value);
    if (tz) return `${tz.name} (UTC${formatUtcOffsetWithSign(tz.utc_time_offset)})`;
    return timeZoneInput.value || t('editProfile.selectTimeZone');
});

function selectTimeZone(id: string) {
    timeZoneInput.value = id;
    tzDropdownOpen.value = false;
    tzSearch.value = '';
}

// 点击外部关闭下拉
function onTzDropdownClickOutside(e: MouseEvent) {
    if (tzDropdownRef.value && !tzDropdownRef.value.contains(e.target as Node)) {
        tzDropdownOpen.value = false;
        tzSearch.value = '';
    }
}

// 下拉打开时自动聚焦搜索框
watch(tzDropdownOpen, (open) => {
    if (open) {
        nextTick(() => tzSearchRef.value?.focus());
    }
});

onMounted(() => {
    document.addEventListener('mousedown', onTzDropdownClickOutside);
});

onUnmounted(() => {
    document.removeEventListener('mousedown', onTzDropdownClickOutside);
});

async function loadTimeZones() {
    if (timeZonesLoaded) return;
    try {
        const res = (await tdlibSend({ _: 'getTimeZones' })) as { time_zones?: { id: string; name: string; utc_time_offset: number }[] };
        timeZoneOptions.value = res.time_zones ?? [];
        timeZonesLoaded = true;
    } catch {
        // 兜底：使用当前系统时区（getTimezoneOffset 返回分钟，TDLib 用秒）
        timeZoneOptions.value = [{ id: Intl.DateTimeFormat().resolvedOptions().timeZone, name: 'Local', utc_time_offset: -(new Date().getTimezoneOffset()) * 60 }];
    }
}

function formatUtcOffset(offsetSeconds: number): string {
    const abs = Math.abs(offsetSeconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatUtcOffsetWithSign(offsetSeconds: number): string {
    return `${offsetSeconds >= 0 ? '+' : '-'}${formatUtcOffset(offsetSeconds)}`;
}

function close() {
    emit('update:modelValue', false);
}

function initFromFullInfo() {
    loadTimeZones();
    const hours = props.fullInfo?.business_info?.opening_hours;
    const hasIntervals = !!hours?.opening_hours?.length;
    hoursEnabled.value = hasIntervals;
    timeZoneInput.value = hours?.time_zone_id || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const list = hours?.opening_hours ?? [];
    const names = [t('lng_hours_monday'), t('lng_hours_tuesday'), t('lng_hours_wednesday'), t('lng_hours_thursday'), t('lng_hours_friday'), t('lng_hours_saturday'), t('lng_hours_sunday')];
    days.value = names.map((name, i) => {
        const dayIntervals = list.filter((iv) => Math.floor(iv.start_minute / (24 * 60)) % 7 === i);
        if (dayIntervals.length === 0) {
            return { name, enabled: false, intervals: [{ start: '09:00', end: '17:00' }] };
        }
        return {
            name,
            enabled: true,
            intervals: dayIntervals.map((iv) => ({
                start: minutesToHM(iv.start_minute),
                end: minutesToHM(iv.end_minute),
            })),
        };
    });
    hoursError.value = '';
}

watch(() => props.modelValue, (v) => {
    if (v) initFromFullInfo();
});

function toggleHoursEnabled() {
    hoursEnabled.value = !hoursEnabled.value;
}

function minutesToHM(minute: number): string {
    const total = minute % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildIntervals(): businessOpeningHoursInterval[] {
    const intervals: businessOpeningHoursInterval[] = [];
    for (let i = 0; i < days.value.length; i++) {
        const d = days.value[i];
        if (!d.enabled) continue;
        for (const iv of d.intervals) {
            const [sh, sm] = iv.start.split(':').map(Number);
            const [eh, em] = iv.end.split(':').map(Number);
            let start = i * 1440 + sh * 60 + sm;
            let end = i * 1440 + eh * 60 + em;
            if (end <= start) end += 1440; // 跨天
            intervals.push({ _: 'businessOpeningHoursInterval', start_minute: start, end_minute: end });
        }
    }
    return intervals;
}

async function saveBusinessHours() {
    hoursError.value = '';
    const tz = timeZoneInput.value.trim();
    if (!tz) {
        hoursError.value = t('editProfile.timezoneRequired');
        return;
    }
    const intervals = hoursEnabled.value ? buildIntervals() : [];
    savingHours.value = true;
    try {
        await tdlibSend({
            _: 'setBusinessOpeningHours',
            opening_hours: {
                _: 'businessOpeningHours',
                time_zone_id: tz,
                opening_hours: intervals,
            },
        } as any);
        MessagePlugin.success(hoursEnabled.value ? t('editProfile.hoursSaved') : t('editProfile.hoursDisabled'));
        emit('changed');
        close();
    } catch (e: any) {
        hoursError.value = e?.message || t('editProfile.saveFailed');
    } finally {
        savingHours.value = false;
    }
}
</script>
