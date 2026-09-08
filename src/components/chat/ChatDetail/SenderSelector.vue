<template>
    <div class="shrink-0 mb-1.5 relative">
        <button ref="btnRef" type="button"
            class="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
            :title="currentName" @click.stop="toggleFlyout">
            <Avatar :photo="currentPhoto" :title="currentName" sizeClass="!w-10 !h-10"
                :accent-color-id="currentAccentColorId" />
        </button>

        <Teleport to="body">
            <Transition name="sender-flyout">
                <div v-if="open" class="fixed z-50" :style="flyoutStyle" @click.self="open = false">
                    <div ref="panelRef"
                        class="min-w-50 max-h-80 overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-700/60 custom-scrollbar">
                        <div v-if="loading" class="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">
                            加载中...
                        </div>
                        <template v-else>
                            <div v-for="item in availableSenders" :key="getSenderKey(item.sender)"
                                class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors"
                                :class="{ 'bg-blue-50 dark:bg-blue-900/30': isSelected(item.sender) }"
                                @click.stop="onSelect(item)">
                                <Avatar :photo="getSenderPhoto(item.sender)" :title="getSenderName(item.sender)"
                                    sizeClass="!w-8 !h-8" :accent-color-id="getSenderAccentColorId(item.sender)" />
                                <span class="flex-1 text-sm truncate text-gray-800 dark:text-gray-200">
                                    {{ getSenderName(item.sender) || '未知' }}
                                </span>
                                <span v-if="item.needs_premium"
                                    class="text-yellow-500 text-xs shrink-0" title="需要 Telegram Premium">👑</span>
                                <svg v-if="isSelected(item.sender)" class="w-4 h-4 shrink-0 text-blue-500"
                                    viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clip-rule="evenodd" />
                                </svg>
                            </div>
                        </template>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { MessageSender, chatMessageSender } from 'tdlib-types';
import Avatar from '../avatar.vue';
import { ensureSenderLoaded, getSenderName, getSenderPhoto, getSenderAccentColorId } from '../../../utils/senderInfo';

const props = defineProps<{
    /** 当前已选中的消息发送身份 */
    currentSenderId?: MessageSender;
    /** 可用的发送身份列表（含 needs_premium 标记） */
    availableSenders: chatMessageSender[];
    /** 是否正在加载可用发送身份 */
    loading?: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', senderId: MessageSender): void;
}>();

const open = ref(false);
const btnRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const flyoutStyle = ref<Record<string, string>>({});

/** 当前选中发送者的显示名 */
const currentName = ref('');
/** 当前选中发送者的头像信息 */
const currentPhoto = ref<import('tdlib-types').chatPhotoInfo | import('tdlib-types').profilePhoto | undefined>(undefined);
/** 当前选中发送者的 accent color id */
const currentAccentColorId = ref<number | undefined>(undefined);

/** 监听当前发送者变化，加载并缓存其信息 */
watch(() => props.currentSenderId, async (sid) => {
    if (!sid) return;
    await ensureSenderLoaded(sid);
    currentName.value = getSenderName(sid);
    currentPhoto.value = getSenderPhoto(sid);
    currentAccentColorId.value = getSenderAccentColorId(sid);
}, { immediate: true });

/** 同时预加载所有可用发送者的信息（头像/名称等） */
watch(() => props.availableSenders, async (senders) => {
    for (const s of senders) {
        await ensureSenderLoaded(s.sender);
    }
}, { immediate: true });

function toggleFlyout() {
    if (open.value) {
        open.value = false;
        return;
    }
    // 在打开前计算位置，避免面板先出现在 (0,0) 再跳动的闪烁
    const btn = btnRef.value;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const bottom = window.innerHeight - rect.top + 8;
    const panelW = 200; // min-w-50
    let left = rect.left;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    flyoutStyle.value = { bottom: bottom + 'px', left: left + 'px' };
    open.value = true;
}

function isSelected(sender: MessageSender): boolean {
    const cur = props.currentSenderId;
    if (!cur || !sender) return false;
    if (cur._ !== sender._) return false;
    if (cur._ === 'messageSenderUser' && sender._ === 'messageSenderUser') {
        return cur.user_id === sender.user_id;
    }
    if (cur._ === 'messageSenderChat' && sender._ === 'messageSenderChat') {
        return cur.chat_id === sender.chat_id;
    }
    return false;
}

function onSelect(item: chatMessageSender) {
    if (isSelected(item.sender)) {
        open.value = false;
        return;
    }
    emit('select', item.sender);
    open.value = false;
}

function getSenderKey(sender: MessageSender): string {
    if (sender._ === 'messageSenderUser') return `u:${sender.user_id}`;
    if (sender._ === 'messageSenderChat') return `c:${sender.chat_id}`;
    return 'unknown';
}

/** 点击外部关闭飞出菜单 */
function onDocClick(e: MouseEvent) {
    if (btnRef.value && !btnRef.value.contains(e.target as Node)) {
        open.value = false;
    }
}
onMounted(() => document.addEventListener('mousedown', onDocClick, true));
onUnmounted(() => document.removeEventListener('mousedown', onDocClick, true));
</script>

<style scoped>
.sender-flyout-enter-active,
.sender-flyout-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}
.sender-flyout-enter-from,
.sender-flyout-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>
