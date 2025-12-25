<template>
    <div class="p-4 bg-transparent">
        <div
            class="flex items-center gap-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md p-2 rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
            <!-- 文件选择（左侧） -->
            <div class="shrink-0">
                <input ref="fileInput" type="file" class="hidden" @change="onFileSelected" />
                <button @click="triggerFile"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                    <PaperclipIcon class="w-5 h-5" />
                </button>
            </div>

            <!-- 中间输入容器（圆角样式） -->
            <div class="flex-1 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center px-3 py-2">
                <textarea v-model="localValue" :placeholder="placeholder || '输入消息...'"
                    class="flex-1 bg-transparent resize-none focus:outline-none text-sm text-gray-800 dark:text-gray-200 px-2 py-1 min-h-9 max-h-40"
                    rows="1" @keydown.enter.exact.prevent="onEnter" @keydown.enter.shift.stop></textarea>
            </div>

            <!-- 右侧操作：去掉命令(/)，保留贴纸和语言输入 -->
            <div class="flex items-center gap-2 ml-2">
                <button @click="$emit('sticker')"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                    <Smile class="w-5 h-5" />
                </button>
                <button @click="onClickSend"
                    class="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white transition-colors">
                    <SendIcon class="w-5 h-5" />
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { PaperclipIcon, Smile, SendIcon } from 'lucide-vue-next';

const props = defineProps<{
    modelValue?: string;
    placeholder?: string;
}>();

const emit = defineEmits(['update:modelValue', 'send', 'sticker', 'language', 'attach']);

const localValue = ref(props.modelValue || '');

watch(() => props.modelValue, (v) => {
    if (v !== localValue.value) localValue.value = v || '';
});

watch(localValue, (v) => emit('update:modelValue', v));

const onClickSend = () => {
    if (!localValue.value.trim()) return;
    emit('send', localValue.value);
    localValue.value = '';
};

const onEnter = () => {
    onClickSend();
};

// Shift+Enter default behavior will insert newline; no handler required

const fileInput = ref<HTMLInputElement | null>(null);

const triggerFile = () => {
    fileInput.value?.click();
};

const onFileSelected = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    emit('attach', input.files);
    // clear input value so same file can be selected again
    input.value = '';
};
</script>

<style scoped>
/* keep styling minimal; layout handled by parent */
</style>
