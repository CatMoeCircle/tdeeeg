<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_business_subtitle_chatbots')" @update:model-value="close">
        <div class="flex flex-col items-center text-center py-6 gap-3">
            <div class="w-40 h-40 flex items-center justify-center overflow-hidden">
                <TgsPlayer v-if="businessBotsTgsData" :data="businessBotsTgsData" :loop="true" :autoplay="true"
                    :size="150" />
            </div>
            <p v-if="chatbotText" class="text-sm text-gray-700 dark:text-gray-300">
                {{ t('editProfile.chatbotConnected', { name: chatbotText }) }}
            </p>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {{ t('editProfile.chatbotNotSupported') }}<br />{{ t('editProfile.chatbotUseOfficial') }}
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
    chatbotText?: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const { t } = useI18n();

// BusinessBots.tgs 动画数据
const BUSINESS_BOTS_TGS_URL = new URL('../../assets/animations/BusinessBots.tgs', import.meta.url).href;
const businessBotsTgsData = ref<Uint8Array | null>(null);

async function loadBusinessBotsTgs() {
    try {
        const resp = await fetch(BUSINESS_BOTS_TGS_URL);
        businessBotsTgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error('BusinessChatbotDialog: failed to load BusinessBots.tgs:', e);
    }
}

function close() {
    emit('update:modelValue', false);
}

watch(() => props.modelValue, (v) => {
    if (v) loadBusinessBotsTgs();
}, { immediate: true });
</script>
