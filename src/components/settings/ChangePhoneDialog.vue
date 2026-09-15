<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_info_mobile_label')" @update:model-value="close">
        <div class="flex flex-col items-center text-center py-6 gap-3">
            <div class="w-40 h-40 flex items-center justify-center overflow-hidden">
                <TgsPlayer v-if="changeNumberTgsData" :data="changeNumberTgsData" :loop="true" :autoplay="true"
                    :size="150" />
            </div>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {{ t('lng_change_phone_error') }}
            </p>
            <button type="button" @click="close"
                class="mt-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                {{ t('lng_stars_rating_understood') }}
            </button>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from './ModalDialog.vue';
import TgsPlayer from '../common/TgsPlayer.vue';

const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const { t } = useI18n();

// ChangeNumber.tgs 动画数据
const CHANGE_NUMBER_TGS_URL = new URL('../../assets/animations/ChangeNumber.tgs', import.meta.url).href;
const changeNumberTgsData = ref<Uint8Array | null>(null);

async function loadChangeNumberTgs() {
    try {
        const resp = await fetch(CHANGE_NUMBER_TGS_URL);
        changeNumberTgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error('ChangePhoneDialog: failed to load ChangeNumber.tgs:', e);
    }
}

function close() {
    emit('update:modelValue', false);
}

watch(() => props.modelValue, (v) => {
    if (v) loadChangeNumberTgs();
}, { immediate: true });
</script>
