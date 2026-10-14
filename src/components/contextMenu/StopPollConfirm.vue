<template>
    <Teleport to="body">
        <Transition name="spc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-96 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <CircleStopIcon class="w-4 h-4 text-red-500" />
                            {{ t('lng_polls_stop') }}
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 正文：停止后无法再投票的警告 -->
                    <div class="px-4 py-4">
                        <p class="text-sm text-gray-600 dark:text-gray-300">
                            {{ t('lng_polls_stop_warning') }}
                        </p>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            {{ t('lng_cancel') }}
                        </button>
                        <button type="button" @click="confirm"
                            class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600">
                            {{ t('lng_polls_stop_sure') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { XIcon, CircleStopIcon } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { visible, confirmStop, cancelStop } from "../../store/stopPoll";

const { t } = useI18n();

function confirm() {
    confirmStop();
}

function cancel() {
    cancelStop();
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && visible.value) {
        cancel();
    }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.spc-fade-enter-active,
.spc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.spc-fade-enter-from,
.spc-fade-leave-to {
    opacity: 0;
}
</style>
