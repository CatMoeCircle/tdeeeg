<template>
    <Teleport to="body">
        <Transition name="dmc-fade">
            <div v-if="visible" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-100 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <TrashIcon class="w-4 h-4 text-red-500" />
                            删除消息
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 正文 -->
                    <div class="px-4 py-4 space-y-2">
                        <p class="text-sm text-gray-600 dark:text-gray-300">
                            是否删除{{ senderLabel }}的消息？
                            <span v-if="req?.canDeleteMessage && !req?.canDeleteAllFromSender && !req?.canBanSender"
                                class="text-gray-400 dark:text-gray-500">（将按权限执行删除）</span>
                        </p>

                        <!-- 附加选项 -->
                        <div class="mt-3 space-y-2">
                            <!-- 删除该发送者的所有消息 -->
                            <label v-if="canDeleteAllFromSender"
                                class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                                :class="optDeleteAll ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                                <input v-model="optDeleteAll" type="checkbox"
                                    class="w-4 h-4 accent-red-500 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                                        删除{{ senderLabel }}的所有消息
                                    </p>
                                    <p class="text-xs text-gray-400 dark:text-gray-500">
                                        删除该发送者在本对话中发送的全部消息（需管理员权限）
                                    </p>
                                </div>
                            </label>

                            <!-- 封禁发送者 -->
                            <label v-if="canBanSender"
                                class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                                :class="optBan ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                                <input v-model="optBan" type="checkbox"
                                    class="w-4 h-4 accent-red-500 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                                        封禁{{ senderLabel }}
                                    </p>
                                    <p class="text-xs text-gray-400 dark:text-gray-500">
                                        将其移出本对话并禁止再进入（需管理员权限）
                                    </p>
                                </div>
                            </label>

                            <p v-if="!req?.canDeleteMessage && !canDeleteAllFromSender && !canBanSender"
                                class="text-xs text-gray-400 dark:text-gray-500 pt-1">
                                当前没有可执行的操作。
                            </p>
                        </div>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            取消
                        </button>
                        <button type="button" @click="confirm"
                            class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            :disabled="!hasAnyAction">
                            删除
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { XIcon, TrashIcon } from "lucide-vue-next";
import {
    visible, request, confirmDelete, cancelDelete,
} from "../../store/deleteMessage";
import type { DeleteMessageResult } from "../../store/deleteMessage";

const req = computed(() => request.value);

// 发送者标签（文案中的名字），如「该用户」/「Ta」
const senderLabel = computed(() => {
    const name = req.value?.senderName?.trim();
    return name ? `“${name}”` : "该用户";
});

// 可删除当前消息
const canDeleteMessage = computed(() => req.value?.canDeleteMessage === true);

// 可删除发送者所有消息
const canDeleteAllFromSender = computed(() => req.value?.canDeleteAllFromSender === true);
// 可封禁发送者
const canBanSender = computed(() => req.value?.canBanSender === true);

const optDeleteAll = ref(false);
const optBan = ref(false);

// 打开弹窗时重置选项
watch(visible, (v) => {
    if (v) {
        optDeleteAll.value = false;
        optBan.value = false;
    }
});

// 是否有至少一个可执行操作
const hasAnyAction = computed(() => {
    if (canDeleteMessage.value) return true;
    if (optDeleteAll.value && canDeleteAllFromSender.value) return true;
    if (optBan.value && canBanSender.value) return true;
    return false;
});

function confirm() {
    const result: DeleteMessageResult = {
        deleteMessage: canDeleteMessage.value,
        deleteAllFromSender: canDeleteAllFromSender.value && optDeleteAll.value,
        banSender: canBanSender.value && optBan.value,
    };
    confirmDelete(result);
}

function cancel() {
    cancelDelete();
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
.dmc-fade-enter-active,
.dmc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.dmc-fade-enter-from,
.dmc-fade-leave-to {
    opacity: 0;
}
</style>
