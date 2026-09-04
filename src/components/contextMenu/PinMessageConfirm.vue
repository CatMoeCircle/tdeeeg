<template>
    <Teleport to="body">
        <Transition name="pmc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-96 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <PinIcon class="w-4 h-4 text-blue-500" />
                            置顶
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 正文 -->
                    <div class="px-4 py-4">
                        <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
                            确定要置顶这条消息吗？
                        </p>

                        <!-- 私聊：是否为对方置顶 -->
                        <label v-if="isPrivate"
                            class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                            :class="optPinForOther ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                            <input v-model="optPinForOther" type="checkbox" class="w-4 h-4 accent-blue-500 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    同时为对方置顶
                                </p>
                                <p class="text-xs text-gray-400 dark:text-gray-500">
                                    关闭则仅自己可见这条置顶消息
                                </p>
                            </div>
                        </label>

                        <!-- 群组：是否通知群成员 -->
                        <label v-else
                            class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                            :class="optNotify ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                            <input v-model="optNotify" type="checkbox" class="w-4 h-4 accent-blue-500 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    通知群成员
                                </p>
                                <p class="text-xs text-gray-400 dark:text-gray-500">
                                    关闭则静默置顶，不打扰成员
                                </p>
                            </div>
                        </label>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            取消
                        </button>
                        <button type="button" @click="confirm"
                            class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600">
                            置顶
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { XIcon, PinIcon } from "lucide-vue-next";
import {
    visible, request, confirmPin, cancelPin,
} from "../../store/pinMessage";
import type { PinMessageResult } from "../../store/pinMessage";

const isPrivate = computed(() => request.value?.scope === 'private');

const optPinForOther = ref(true);
const optNotify = ref(true);

// 打开弹窗时重置选项为默认值
watch(visible, (v) => {
    if (v) {
        optPinForOther.value = true;
        optNotify.value = true;
    }
});

function confirm() {
    const result: PinMessageResult = {
        pinForOther: isPrivate.value ? optPinForOther.value : false,
        notifyMembers: isPrivate.value ? false : optNotify.value,
    };
    confirmPin(result);
}

function cancel() {
    cancelPin();
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
.pmc-fade-enter-active,
.pmc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.pmc-fade-enter-from,
.pmc-fade-leave-to {
    opacity: 0;
}
</style>
