<template>
    <Teleport to="body">
        <Transition name="lockdown-fade">
            <div v-if="visible && request" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancelLockdownConfirm">
                <div
                    class="w-95 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <div class="px-5 pt-4 pb-2">
                        <p class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ request.title }}</p>
                        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line break-words">
                            {{ request.description }}
                        </p>
                    </div>

                    <div class="px-4 pb-3 pt-2 flex items-center justify-end gap-3">
                        <BaseButton type="button" variant="ghost" size="sm" @click="cancelLockdownConfirm">
                            {{ t('lng_cancel') }}
                        </BaseButton>
                        <BaseButton type="button" variant="primary" size="sm"
                            @click="acceptLockdownConfirm">
                            {{ request.confirmLabel }}
                        </BaseButton>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { visible, request, acceptLockdownConfirm, cancelLockdownConfirm } from '../../store/session/lockdownConfirm';
import BaseButton from '../ui/button/BaseButton.vue';

const { t } = useI18n();
</script>

<style scoped>
.lockdown-fade-enter-active,
.lockdown-fade-leave-active {
    transition: opacity 0.15s ease;
}

.lockdown-fade-enter-from,
.lockdown-fade-leave-to {
    opacity: 0;
}
</style>
