<template>
    <div class="p-5 bg-transparent">
        <div
            class="flex items-end gap-3 bg-white/60 dark:bg-gray-900/80 backdrop-blur-md px-2 rounded-4xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
            <!-- 文件选择（左侧） -->
            <div class="shrink-0 mb-1.5">
                <input ref="fileInput" type="file" class="hidden" />
                <button
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                    <PaperclipIcon class="w-5 h-5" />
                </button>
            </div>

            <!-- 中间输入容器（圆角样式） -->
            <div class="flex-1 rounded-full dark:bg-gray-800 flex items-center px-2 my-2">
                <textarea v-model="localValue" :placeholder="placeholder || '输入消息...'"
                    class="message-input-scrollbar flex-1 bg-transparent resize-none focus:outline-none text-sm leading-5 text-gray-800 dark:text-gray-200 px-2 py-2 min-h-9 max-h-40 overflow-y-auto field-sizing-content"
                    rows="1" @keydown.enter.exact.prevent="onEnter" @keydown.enter.shift.stop></textarea>
            </div>

            <!-- 右侧操作：去掉命令(/)，保留贴纸和语言输入 -->
            <div class="flex items-center gap-2 ml-2 mb-1.5">
                <button @click="$emit('sticker')"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                    <Smile class="w-5 h-5" />
                </button>
                <button @click="onClickSend"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-500 text-gray-500 hover:text-white transition-colors">
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



</script>

<style scoped>
.message-input-scrollbar::-webkit-scrollbar {
    width: 4px;
}
</style>
