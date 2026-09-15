<template>
    <ModalDialog v-model="visible" :title="t('lng_self_destruct_title')">
        <div class="space-y-1.5">
            <p class="text-xs text-gray-400 mb-2">{{ t('lng_self_destruct_description') }}</p>
            <button v-for="opt in accountTtlOptions" :key="opt.days" type="button" @click="saveAccountTtl(opt.days)"
                class="w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm text-left transition-colors"
                :class="accountTtlDays === opt.days
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'">
                <span>{{ opt.label }}</span>
                <CheckIcon v-if="accountTtlDays === opt.days" class="w-4 h-4 text-blue-500" />
            </button>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check as CheckIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import ModalDialog from './ModalDialog.vue';
import { tdlibSend } from '../../utils/tdlib';
import { tdPlural } from '../../utils/tdLang';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const props = defineProps<{
    modelValue: boolean;
    currentDays?: number;
}>();
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'changed', days: number): void;
}>();

const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});

const accountTtlDays = ref(props.currentDays ?? 365);

// computed + tdPlural：语言切换后选项文案会跟随刷新
const accountTtlOptions = computed(() => [
    { days: 30, label: tdPlural('lng_self_destruct_months', 1) },
    { days: 90, label: tdPlural('lng_self_destruct_months', 3) },
    { days: 180, label: tdPlural('lng_self_destruct_months', 6) },
    { days: 365, label: tdPlural('lng_self_destruct_years', 1) },
    { days: 730, label: tdPlural('lng_self_destruct_years', 2) },
]);

async function loadAccountTtl() {
    try {
        const res = (await tdlibSend({ _: 'getAccountTtl' }));
        accountTtlDays.value = Number(res?.days ?? 365);
    } catch (e) {
        console.error('load account ttl failed:', e);
    }
}

async function saveAccountTtl(days: number) {
    try {
        await tdlibSend({ _: 'setAccountTtl', ttl: { _: 'accountTtl', days } });
        accountTtlDays.value = days;
        MessagePlugin.success(t('privacy.accountTtlUpdated'));
        emit('changed', days);
        visible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('privacy.operationFailed'));
    }
}

watch(() => props.modelValue, (v) => {
    if (!v) return;
    if (props.currentDays !== undefined) accountTtlDays.value = props.currentDays;
    void loadAccountTtl();
});
</script>
