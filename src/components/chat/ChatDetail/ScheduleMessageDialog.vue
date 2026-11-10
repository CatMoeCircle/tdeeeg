<template>
    <ModalDialog :model-value="modelValue" :title="title" @update:model-value="close">
        <div class="space-y-4">
            <!-- 快捷时间：按本机时区计算，点一下直接填入下面的日期 / 时间 -->
            <div class="flex flex-wrap gap-2">
                <button v-for="preset in presets" :key="preset.key" type="button"
                    class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                    :class="preset.active
                        ? 'bg-sky-500/10 border-sky-400/60 text-sky-600 dark:text-sky-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
                    @click="applyPreset(preset.at)">
                    {{ preset.label }}
                </button>
            </div>

            <div class="flex items-end gap-3">
                <input v-model="dateValue" type="date" :min="minDate" :max="maxDate" :aria-label="t('lng_formatting_date_title')"
                    class="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]" />
                <span class="pb-2 text-xs text-gray-400">{{ t('lng_schedule_at') }}</span>
                <input v-model="timeValue" type="time" :aria-label="t('lng_formatting_date_title')"
                    class="w-32 shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]" />
            </div>

            <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('lng_scheduled_date', { date: previewText }) }}
            </p>

            <!-- 定时消息同样可以不打扰对方（收藏夹提醒没有接收方，不显示） -->
            <label v-if="showSilent"
                class="flex items-center gap-2.5 rounded-lg px-1 py-1 cursor-pointer select-none">
                <input v-model="silent" type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-sky-500 focus:ring-sky-400 dark:border-gray-600 dark:bg-gray-900" />
                <BellOffIcon class="h-4 w-4 text-gray-400" />
                <span class="text-sm text-gray-700 dark:text-gray-200">{{ t('lng_send_silent_message') }}</span>
            </label>
        </div>

        <template #footer>
            <button type="button"
                class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                @click="close">
                {{ t('lng_cancel') }}
            </button>
            <button v-if="allowUntilOnline" type="button"
                class="rounded-lg px-4 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
                @click="submitUntilOnline">
                {{ t('lng_scheduled_send_until_online') }}
            </button>
            <button type="button"
                class="rounded-lg bg-[#2e9cd3] px-4 py-2 text-sm font-medium text-white hover:bg-[#278cc0] focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50 disabled:cursor-default"
                :disabled="!isValid" @click="submitAt">
                {{ confirmLabel }}
            </button>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { BellOff as BellOffIcon } from 'lucide-vue-next';
import ModalDialog from '../../ui/modal/ModalDialog.vue';
import { tdPlural } from '../../../utils/i18n/tdLang';
import formatTime from '../../../utils/ui/formatTime';
import { formatDateLabel } from './composables/dateLabel';
import { SCHEDULE_MAX_DAYS } from '../../../utils/chat/chatScheduling';

/** 用户确认后的发送方式：指定时间，或「对方上线时」 */
export interface ScheduleSubmitPayload {
    silent: boolean;
    /** Unix 秒；untilOnline 为 true 时忽略 */
    sendAt?: number;
    untilOnline?: boolean;
}

const props = defineProps<{
    modelValue: boolean;
    /** schedule = 定时发送；reminder = 收藏夹提醒；reschedule = 修改已有定时消息的时间 */
    mode: 'schedule' | 'reminder' | 'reschedule';
    /** 打开时预填的时间（Unix 秒）；缺省为 10 分钟后 */
    initialDate?: number;
    /** 是否提供「在线时发送」（仅私聊且在线状态精确可见时） */
    allowUntilOnline?: boolean;
    initialSilent?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'submit', payload: ScheduleSubmitPayload): void;
}>();

const { t } = useI18n();

const DEFAULT_OFFSET_SECONDS = 10 * 60;

const title = computed(() => {
    if (props.mode === 'reschedule') return t('lng_context_reschedule');
    if (props.mode === 'reminder') return t('lng_remind_title');
    return t('lng_schedule_title');
});

const confirmLabel = computed(() => {
    if (props.mode === 'reschedule') return t('lng_context_reschedule');
    if (props.mode === 'reminder') return t('lng_context_set_reminder');
    return t('lng_schedule_button');
});

/** 收藏夹提醒没有接收方，不提供静默开关；改时间也不改静默状态 */
const showSilent = computed(() => props.mode === 'schedule');

const pad = (n: number) => String(n).padStart(2, '0');

function dateInputValue(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeInputValue(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dateValue = ref('');
const timeValue = ref('');
const silent = ref(false);

const minDate = computed(() => dateInputValue(new Date()));
const maxDate = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + SCHEDULE_MAX_DAYS);
    return dateInputValue(d);
});

/** 打开时重置为「预填时间或 10 分钟后」；已在打开状态切换预填时间（改另一条定时消息）也要重算 */
function resetToBase() {
    const base = props.initialDate && props.initialDate * 1000 > Date.now()
        ? new Date(props.initialDate * 1000)
        : new Date(Date.now() + DEFAULT_OFFSET_SECONDS * 1000);
    dateValue.value = dateInputValue(base);
    timeValue.value = timeInputValue(base);
    silent.value = props.mode === 'schedule' ? !!props.initialSilent : false;
}

watch([() => props.modelValue, () => props.initialDate], ([open]) => {
    if (open) resetToBase();
}, { immediate: true });

/** 当前输入组合出的 Unix 秒（非法时返回 0） */
function selectedTimestamp(): number {
    if (!dateValue.value || !timeValue.value) return 0;
    const [y, m, d] = dateValue.value.split('-').map(Number);
    const [hh, mm] = timeValue.value.split(':').map(Number);
    if (![y, m, d, hh, mm].every(Number.isFinite)) return 0;
    const ts = new Date(y, m - 1, d, hh, mm, 0, 0).getTime() / 1000;
    return Number.isFinite(ts) ? Math.floor(ts) : 0;
}

const previewText = computed(() => {
    const ts = selectedTimestamp();
    if (!ts) return '—';
    return `${formatDateLabel(ts)} ${formatTime(ts)}`;
});

/** 选中时间必须晚于现在（留 30 秒余量）且不超过一年 */
const isValid = computed(() => {
    const ts = selectedTimestamp();
    if (!ts) return false;
    const now = Math.floor(Date.now() / 1000);
    return ts > now + 30 && ts <= now + SCHEDULE_MAX_DAYS * 86400;
});

function applyPreset(at: number) {
    const d = new Date(at * 1000);
    dateValue.value = dateInputValue(d);
    timeValue.value = timeInputValue(d);
}

/** 快捷时间：30 分钟后 / 1 小时后 / 1 天后 */
const presets = computed(() => {
    const now = Date.now();
    const list = [
        { key: '30m', label: tdPlural('lng_date_relative_in_minutes', 30), at: Math.floor((now + 30 * 60 * 1000) / 1000) },
        { key: '1h', label: tdPlural('lng_date_relative_in_hours', 1), at: Math.floor((now + 60 * 60 * 1000) / 1000) },
        { key: '1d', label: tdPlural('lng_date_relative_in_days', 1), at: Math.floor((now + 24 * 60 * 60 * 1000) / 1000) },
    ];
    const selected = selectedTimestamp();
    return list.map((p) => ({ ...p, active: selected > 0 && Math.abs(selected - p.at) < 60 }));
});

function close() {
    emit('update:modelValue', false);
}

/** Esc 关闭（捕获阶段拦截，避免同时触发聊天页的 Esc 行为） */
function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !props.modelValue) return;
    e.stopPropagation();
    close();
}

watch(() => props.modelValue, (open) => {
    if (open) window.addEventListener('keydown', onKeydown, true);
    else window.removeEventListener('keydown', onKeydown, true);
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));

function submitAt() {
    if (!isValid.value) return;
    emit('submit', { silent: silent.value, sendAt: selectedTimestamp() });
    close();
}

function submitUntilOnline() {
    emit('submit', { silent: silent.value, untilOnline: true });
    close();
}
</script>
