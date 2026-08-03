<template>
    <Teleport to="body">
        <Transition name="elc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-90 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {{ t('link.openExternalTitle') }}
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 内容：只显示站点域名，不显示完整链接 -->
                    <div class="px-4 py-4">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300">
                                <GlobeIcon class="w-5 h-5" />
                            </div>
                            <div class="min-w-0">
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {{ t('link.openExternalMessage') }}
                                </p>
                                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate mt-0.5">
                                    {{ hostName }}
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            {{ t('link.openExternalCancel') }}
                        </button>
                        <button type="button" @click="confirm"
                            class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600">
                            {{ t('link.openExternalConfirm') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { XIcon, GlobeIcon } from "lucide-vue-next";
import { visible, pendingUrl, confirmOpenLink, cancelExternalLink } from "../../store/externalLink";

const { t } = useI18n();

/** 提取域名（host），如 https://www.example.com/a/b → www.example.com */
const hostName = computed(() => {
    const url = pendingUrl.value;
    try {
        const u = new URL(url);
        return u.host || url;
    } catch {
        // mailto / tel / 非法 URL：直接截断显示
        return url || "";
    }
});

function confirm() {
    confirmOpenLink();
}

function cancel() {
    cancelExternalLink();
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && visible.value) {
        cancel();
    }
}

onMounted(() => {
    window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
});
</script>

<style scoped>
.elc-fade-enter-active,
.elc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.elc-fade-enter-from,
.elc-fade-leave-to {
    opacity: 0;
}
</style>
