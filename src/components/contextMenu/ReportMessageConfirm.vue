<template>
    <Teleport to="body">
        <Transition name="rmc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-96 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <FlagIcon class="w-4 h-4 text-red-500" />
                            举报消息
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 正文 -->
                    <div class="px-4 py-4">
                        <!-- 加载中 -->
                        <div v-if="loading" class="flex items-center justify-center py-6">
                            <span class="text-sm text-gray-400">加载中...</span>
                        </div>

                        <!-- 选择原因 -->
                        <template v-else-if="step === 'options'">
                            <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
                                {{ optionTitle || '请选择举报原因' }}
                            </p>
                            <div class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                <label v-for="opt in options" :key="opt.id"
                                    class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                                    :class="selectedOption === opt.id
                                        ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                                    <input type="radio" :value="opt.id" v-model="selectedOption"
                                        class="w-4 h-4 accent-red-500 shrink-0" />
                                    <span class="text-sm text-gray-800 dark:text-gray-200">{{ opt.text }}</span>
                                </label>
                            </div>
                        </template>

                        <!-- 补充说明 -->
                        <template v-else-if="step === 'text'">
                            <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
                                请补充举报说明{{ textOptional ? '（可选）' : '' }}
                            </p>
                            <textarea v-model="commentText"
                                class="w-full h-24 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:border-red-400"
                                placeholder="请输入举报说明..." maxlength="1024"></textarea>
                        </template>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            取消
                        </button>
                        <button type="button" :disabled="loading || !canSubmit" @click="submit"
                            class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                            {{ step === 'text' ? '提交' : '下一步' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { XIcon, FlagIcon } from "lucide-vue-next";
import {
    visible, request, confirmReport, cancelReport,
} from "../../store/reportMessage";
import { tdlibSend } from "../../utils/tdlib";
import type { reportOption } from "tdlib-types";

type Step = 'options' | 'text';

const loading = ref(false);
const step = ref<Step>('options');
const options = ref<reportOption[]>([]);
const optionTitle = ref('');
const selectedOption = ref('');
const commentText = ref('');
const textOptional = ref(false);
const pendingOptionId = ref('');

const canSubmit = computed(() => {
    if (step.value === 'options') return !!selectedOption.value;
    if (step.value === 'text') return textOptional.value || commentText.value.trim().length > 0;
    return false;
});

// 打开弹窗时重置状态并获取举报选项
watch(visible, async (v) => {
    if (!v) return;
    loading.value = true;
    step.value = 'options';
    options.value = [];
    optionTitle.value = '';
    selectedOption.value = '';
    commentText.value = '';
    textOptional.value = false;
    pendingOptionId.value = '';

    const req = request.value;
    if (!req) {
        loading.value = false;
        return;
    }

    try {
        const result = await tdlibSend({
            _: 'reportChat',
            chat_id: req.chatId,
            message_ids: [req.msg.id],
        } as any) as any;

        if (result._ === 'reportChatResultOptionRequired') {
            optionTitle.value = result.title || '';
            options.value = result.options || [];
        } else if (result._ === 'reportChatResultTextRequired') {
            // 直接要求文本（无选项）
            pendingOptionId.value = result.option_id;
            textOptional.value = result.is_optional;
            step.value = 'text';
        } else if (result._ === 'reportChatResultOk') {
            // 直接成功（无需选择）
            confirmReport({ optionId: '', comment: '' });
            return;
        }
    } catch (e: any) {
        console.error('reportChat (get options) failed:', e);
        cancelReport();
        return;
    } finally {
        loading.value = false;
    }
});

async function submit() {
    if (step.value === 'options') {
        // 用户选择了原因，提交 option_id
        loading.value = true;
        try {
            const result = await tdlibSend({
                _: 'reportChat',
                chat_id: request.value!.chatId,
                message_ids: [request.value!.msg.id],
                option_id: selectedOption.value,
            } as any) as any;

            if (result._ === 'reportChatResultTextRequired') {
                pendingOptionId.value = result.option_id;
                textOptional.value = result.is_optional;
                step.value = 'text';
            } else if (result._ === 'reportChatResultOk') {
                confirmReport({ optionId: selectedOption.value, comment: '' });
            }
        } catch (e: any) {
            console.error('reportChat (submit option) failed:', e);
        } finally {
            loading.value = false;
        }
    } else if (step.value === 'text') {
        // 用户提交了补充说明
        loading.value = true;
        try {
            await tdlibSend({
                _: 'reportChat',
                chat_id: request.value!.chatId,
                message_ids: [request.value!.msg.id],
                option_id: pendingOptionId.value,
                text: commentText.value.trim(),
            } as any);
            confirmReport({ optionId: pendingOptionId.value, comment: commentText.value.trim() });
        } catch (e: any) {
            console.error('reportChat (submit text) failed:', e);
        } finally {
            loading.value = false;
        }
    }
}

function cancel() {
    cancelReport();
}
</script>

<style scoped>
.rmc-fade-enter-active,
.rmc-fade-leave-active {
    transition: opacity 0.2s ease;
}

.rmc-fade-enter-from,
.rmc-fade-leave-to {
    opacity: 0;
}
</style>
