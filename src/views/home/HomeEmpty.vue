<template>
    <div class="h-full flex items-center justify-center text-gray-400">
        {{ emptyStateText }}
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const { t } = useI18n();
const emptyStateText = computed(() => {
    if (route.name === 'contacts') return t('lng_contact_details_title');
    if (route.name === 'settings') return t('home.selectSettings');
    if (route.name === 'archived') return t('home.selectArchivedChat');
    return t('lng_willbe_history');
});
</script>
