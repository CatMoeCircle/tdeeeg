<template>
    <Teleport to="body">
        <Transition name="link-dialog">
            <div v-if="modelValue" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="link-dialog-title" @mousedown.self="close">
                <div @keydown.esc.stop="close"
                    class="w-105 max-w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-800">
                    <div class="relative px-6 pb-2 pt-5">
                        <button type="button" aria-label="关闭"
                            class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="close">
                            <XIcon class="h-5 w-5" />
                        </button>
                        <h2 id="link-dialog-title" class="text-lg font-semibold text-gray-900 dark:text-white">
                            输入链接地址
                        </h2>
                    </div>
                    <div class="px-6 py-4">
                        <div
                            class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-400/40 dark:border-gray-600 dark:bg-gray-900">
                            <Link2 class="h-4 w-4 shrink-0 text-gray-400" />
                            <input ref="inputRef" v-model="value" type="text" inputmode="url"
                                placeholder="https://example.com" spellcheck="false"
                                class="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100"
                                @keydown.enter.prevent="submit" />
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                        <button type="button"
                            class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="close">
                            取消
                        </button>
                        <button type="button"
                            class="rounded-lg bg-[#2e9cd3] px-4 py-2 text-sm font-medium text-white hover:bg-[#278cc0] focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            @click="submit">
                            确定
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { XIcon, Link2 } from 'lucide-vue-next';

const props = defineProps<{
    modelValue: boolean;
    /** 预填的初始 URL（例如选中的文本本身就是一个链接） */
    initialUrl?: string;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'submit', url: string): void;
}>();

const value = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

// 打开对话框时：预填 initialUrl、清空/聚焦输入框
watch(() => props.modelValue, (open) => {
    if (open) {
        value.value = props.initialUrl || '';
        nextTick(() => {
            inputRef.value?.focus();
            if (inputRef.value) {
                const len = inputRef.value.value.length;
                inputRef.value.setSelectionRange(len, len);
            }
        });
    }
});

function close() {
    emit('update:modelValue', false);
}

/** 提交：非空 URL 则回调，无论是否为空都关闭 */
function submit() {
    const url = value.value.trim();
    if (url) emit('submit', url);
    emit('update:modelValue', false);
}
</script>

<style>
.link-dialog-enter-active,
.link-dialog-leave-active {
    transition: opacity 0.2s ease;
}
.link-dialog-enter-from,
.link-dialog-leave-to {
    opacity: 0;
}
</style>
