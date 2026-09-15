<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_maps_point')" @update:model-value="close">
        <div class="flex flex-col items-center text-center py-6 gap-3">
            <div class="w-40 h-40 flex items-center justify-center overflow-hidden">
                <TgsPlayer v-if="businessLocationTgsData" :data="businessLocationTgsData" :loop="true" :autoplay="true"
                    :size="150" />
            </div>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {{ t('lng_location_fallback') }}
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

// BusinessLocation.tgs 动画数据
const BUSINESS_LOCATION_TGS_URL = new URL('../../assets/animations/BusinessLocation.tgs', import.meta.url).href;
const businessLocationTgsData = ref<Uint8Array | null>(null);

async function loadBusinessLocationTgs() {
    try {
        const resp = await fetch(BUSINESS_LOCATION_TGS_URL);
        businessLocationTgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error('BusinessLocationDialog: failed to load BusinessLocation.tgs:', e);
    }
}

function close() {
    emit('update:modelValue', false);
}

watch(() => props.modelValue, (v) => {
    if (v) loadBusinessLocationTgs();
}, { immediate: true });
</script>
