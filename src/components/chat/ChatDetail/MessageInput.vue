<template>
    <div class="p-5 bg-transparent">
        <!-- 回复目标气泡 -->
        <Transition name="mi-fade">
            <div v-if="replyTarget"
                class="flex items-start gap-2 mb-2 mx-1 px-3 py-2 rounded-2xl bg-white/70 dark:bg-gray-800/90 shadow-sm border border-gray-200/60 dark:border-gray-700/60">
                <CornerUpLeftIcon class="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-blue-500 truncate">{{ replyTarget.title }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ replyTarget.text || '（无文本内容）' }}</p>
                </div>
                <button type="button" aria-label="取消回复"
                    class="w-6 h-6 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                    @click="emit('clearReply')">
                    <XIcon class="w-3.5 h-3.5" />
                </button>
            </div>
        </Transition>

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
import { PaperclipIcon, Smile, SendIcon, CornerUpLeftIcon, XIcon } from 'lucide-vue-next';

/** 回复目标摘要 */
export interface ReplyTarget {
    /** 发送者标题（名称） */
    title: string;
    /** 内容摘要（纯文本） */
    text: string;
}

const props = defineProps<{
    modelValue?: string;
    placeholder?: string;
    replyTarget?: ReplyTarget | null;
}>();

const emit = defineEmits(['update:modelValue', 'send', 'sticker', 'language', 'attach', 'clearReply']);

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

.mi-fade-enter-active,
.mi-fade-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.mi-fade-enter-from,
.mi-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
</style>
