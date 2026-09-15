<template>
    <Teleport to="body">
        <Transition name="ad-fade">
            <div v-if="modelValue" class="fixed inset-0 z-200 flex items-center justify-center p-4"
                @mousedown.self="onClose">
                <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
                <div
                    class="relative w-full max-w-md max-h-[min(640px,88vh)] flex flex-col rounded-2xl bg-white dark:bg-[#1f2937] shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- 顶部：返回 / 标题 / 关闭 -->
                    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <button type="button" :aria-label="t('lng_close')"
                            class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="onClose">
                            <ChevronLeftIcon class="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        </button>
                        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 flex-1">
                            {{ t('lng_settings_ttl_title') }}
                        </h3>
                        <button type="button" :aria-label="t('lng_close')"
                            class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="onClose">
                            <XIcon class="w-4.5 h-4.5" />
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto custom-scrollbar">
                        <!-- 动画横幅 -->
                        <div
                            class="bg-gray-100 dark:bg-gray-800/80 px-6 py-6 flex items-center justify-center border-b border-gray-200 dark:border-gray-700">
                            <div class="w-28 h-28 flex items-center justify-center overflow-hidden">
                                <TgsPlayer v-if="tgsData" :data="tgsData" :loop="true" :autoplay="true" :size="112" />
                            </div>
                        </div>

                        <div class="px-5 py-4">
                            <!-- 自毁定时器 -->
                            <p class="text-sm font-medium text-blue-500 mb-1">
                                {{ t('lng_settings_ttl_after_subtitle') }}
                            </p>

                            <div class="divide-y divide-gray-100 dark:divide-gray-800">
                                <button v-for="opt in presetOptions" :key="opt.time" type="button"
                                    class="w-full flex items-center justify-between gap-3 py-3 text-left transition-colors"
                                    @click="selectPreset(opt.time)">
                                    <span class="text-[15px] text-gray-900 dark:text-gray-100">{{ opt.label }}</span>
                                    <span class="radio-dot shrink-0" :class="selectedTime === opt.time && !isCustomSelected
                                        ? 'radio-dot-on'
                                        : ''" />
                                </button>

                                <!-- 自定义时间 -->
                                <button type="button"
                                    class="w-full flex items-center justify-between gap-3 py-3 text-left transition-colors"
                                    @click="toggleCustom">
                                    <span class="text-[15px]" :class="isCustomSelected
                                        ? 'text-blue-500'
                                        : 'text-gray-900 dark:text-gray-100'">
                                        {{ t('lng_settings_ttl_after_custom') }}
                                    </span>
                                    <span class="radio-dot shrink-0" :class="isCustomSelected ? 'radio-dot-on' : ''" />
                                </button>

                                <div v-if="isCustomSelected" class="py-3 space-y-3">
                                    <div class="flex items-center gap-2">
                                        <label v-for="field in customFields" :key="field.key"
                                            class="flex-1 min-w-0 flex flex-col items-center gap-1">
                                            <span class="text-xs text-gray-400">{{ field.label }}</span>
                                            <input v-model.number="customParts[field.key]" type="number" :min="0"
                                                :max="field.max" inputmode="numeric"
                                                class="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        </label>
                                    </div>
                                    <p v-if="customError" class="text-xs text-red-500">{{ customError }}</p>
                                    <button type="button"
                                        class="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                                        :disabled="!!customError || saving" @click="saveCustom">
                                        {{ saving ? t('lng_contacts_loading') : t('lng_settings_save') }}
                                    </button>
                                </div>
                            </div>

                            <!-- 底部说明 -->
                            <p class="mt-4 text-xs text-gray-400 leading-relaxed">
                                {{ t('lng_settings_ttl_about') }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ChevronLeft as ChevronLeftIcon, X as XIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import TgsPlayer from '../common/TgsPlayer.vue';
import { tdlibSend } from '../../utils/tdlib';
import { tdPlural } from '../../utils/tdLang';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'changed', time: number): void;
}>();

const { t } = useI18n();

const AUTO_DELETE_TGS_URL = new URL('../../assets/animations/AutoDelete.tgs', import.meta.url).href;

const tgsData = ref<Uint8Array | null>(null);
const currentTime = ref(0);
const saving = ref(false);

/** 当前选中是否为自定义（非预设） */
const isCustomSelected = ref(false);
const customParts = reactive({ days: 1, hours: 0, minutes: 0 });

const DAY = 86400;

const presetOptions = computed(() => [
    { time: 0, label: t('lng_settings_ttl_after_off') },
    { time: DAY, label: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_days', 1) }) },
    { time: 7 * DAY, label: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_weeks', 1) }) },
    { time: 30 * DAY, label: t('lng_settings_ttl_after', { after_duration: tdPlural('lng_settings_ttl_after_months', 1) }) },
]);

const customFields = computed(() => [
    { key: 'days' as const, label: tdPlural('lng_settings_ttl_after_days', 1).replace(/\d+/g, '').trim() || t('privacy.unitDays'), max: 364 },
    { key: 'hours' as const, label: tdPlural('lng_settings_ttl_after_hours', 1).replace(/\d+/g, '').trim() || t('privacy.unitHours'), max: 23 },
    { key: 'minutes' as const, label: t('privacy.unitMinutes'), max: 59 },
]);

const customSeconds = computed(() =>
    customParts.days * DAY + customParts.hours * 3600 + customParts.minutes * 60,
);

const customError = computed(() => {
    if (!isCustomSelected.value) return '';
    if (customSeconds.value <= 0) return t('privacy.timeMustPositive');
    if (customSeconds.value > 365 * DAY) return t('privacy.maxOneYear');
    return '';
});

/** 当前值是否命中预设 */
const selectedTime = computed(() => {
    if (isCustomSelected.value) return -1;
    return currentTime.value;
});

async function loadTgs() {
    if (tgsData.value) return;
    try {
        const resp = await fetch(AUTO_DELETE_TGS_URL);
        tgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error('AutoDeleteDialog: failed to load AutoDelete.tgs:', e);
    }
}

async function loadCurrent() {
    try {
        const res = await tdlibSend({ _: 'getDefaultMessageAutoDeleteTime' });
        currentTime.value = Number(res?.time ?? 0);
        applyTimeToCustom(currentTime.value);
        isCustomSelected.value = !presetOptions.value.some((o) => o.time === currentTime.value) && currentTime.value > 0;
    } catch (e) {
        console.error('AutoDeleteDialog: load failed:', e);
    }
}

function applyTimeToCustom(seconds: number) {
    const total = Math.max(0, Math.floor(seconds));
    customParts.days = Math.floor(total / DAY);
    customParts.hours = Math.floor((total % DAY) / 3600);
    customParts.minutes = Math.floor((total % 3600) / 60);
}

async function saveTime(time: number) {
    if (saving.value) return;
    saving.value = true;
    try {
        await tdlibSend({
            _: 'setDefaultMessageAutoDeleteTime',
            message_auto_delete_time: { _: 'messageAutoDeleteTime', time },
        });
        currentTime.value = time;
        emit('changed', time);
        MessagePlugin.success(t('privacy.autoDeleteUpdated'));
        emit('update:modelValue', false);
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('privacy.operationFailed'));
    } finally {
        saving.value = false;
    }
}

function selectPreset(time: number) {
    isCustomSelected.value = false;
    applyTimeToCustom(time);
    void saveTime(time);
}

function toggleCustom() {
    if (isCustomSelected.value) return;
    isCustomSelected.value = true;
    if (currentTime.value > 0) applyTimeToCustom(currentTime.value);
    else {
        customParts.days = 1;
        customParts.hours = 0;
        customParts.minutes = 0;
    }
}

function saveCustom() {
    if (customError.value) return;
    void saveTime(customSeconds.value);
}

function onClose() {
    emit('update:modelValue', false);
}

watch(
    () => props.modelValue,
    (visible) => {
        if (!visible) return;
        isCustomSelected.value = false;
        void loadTgs();
        void loadCurrent();
    },
    { immediate: true },
);
</script>

<style scoped>
.ad-fade-enter-active,
.ad-fade-leave-active {
    transition: opacity 0.15s ease;
}

.ad-fade-enter-from,
.ad-fade-leave-to {
    opacity: 0;
}

/* Telegram 风格单选圆点 */
.radio-dot {
    width: 20px;
    height: 20px;
    border-radius: 9999px;
    border: 2px solid #c8c9cc;
    background: transparent;
    position: relative;
}

.radio-dot-on {
    border-color: #3390ec;
    background: #3390ec;
}

.radio-dot-on::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 9999px;
    background: #fff;
}

/* 未选中时的浅色边框在深色模式下略提亮 */
:global(.dark) .radio-dot {
    border-color: #6b7280;
}
</style>
