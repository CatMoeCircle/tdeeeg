<template>
    <ModalDialog v-model="visible" :title="t('lng_settings_terminate_title')">
        <div class="space-y-1.5">
            <p class="text-xs text-gray-400 mb-2">{{ t('lng_self_destruct_sessions_description') }}</p>
            <button v-for="opt in ttlOptions" :key="opt.days" type="button" @click="saveTtl(opt.days)"
                class="w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm text-left transition-colors"
                :class="selectedDays === opt.days
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'">
                <span>{{ t(opt.labelKey) }}</span>
                <CheckIcon v-if="selectedDays === opt.days" class="w-4 h-4 text-blue-500" />
            </button>
        </div>
    </ModalDialog>
</template>

<script lang="ts">
/** 会话不活跃自动终止的预设时长（天）。父级摘要文案也复用该列表。 */
export const ttlOptions = [
    { days: 30, labelKey: 'devices.month1' },
    { days: 90, labelKey: 'devices.month3' },
    { days: 180, labelKey: 'devices.month6' },
    { days: 365, labelKey: 'devices.month12' },
];
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check as CheckIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ModalDialog from './ModalDialog.vue';
import { tdlibSend } from '../../utils/tdlib';

const { t } = useI18n();

const props = defineProps<{
    modelValue: boolean;
    /** 当前已保存的不活跃天数，弹窗打开时作为选中值 */
    currentDays: number;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'changed', days: number): void;
}>();

const visible = computed({
    get: () => props.modelValue,
    set: (v: boolean) => emit('update:modelValue', v),
});

/** 弹窗内选中的天数（打开时同步自 currentDays） */
const selectedDays = ref(props.currentDays);

watch(
    () => props.modelValue,
    (open) => {
        if (open) selectedDays.value = props.currentDays;
    },
);

async function saveTtl(days: number) {
    try {
        await tdlibSend({ _: 'setInactiveSessionTtl', inactive_session_ttl_days: days });
        selectedDays.value = days;
        emit('changed', days);
        MessagePlugin.success(t('devices.ttlUpdated'));
        visible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('devices.operationFailed'));
    }
}
</script>
