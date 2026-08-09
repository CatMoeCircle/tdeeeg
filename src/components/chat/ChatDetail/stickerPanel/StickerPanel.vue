<template>
    <Teleport to="body">
        <Transition name="sp-pop">
            <div v-show="visible" ref="panelRoot"
                class="sp-panel fixed z-150 right-2 flex flex-col rounded-2xl shadow-sm border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900 overflow-hidden"
                :style="panelStyle" @mousedown.self.stop>
                <!-- 面板内容：三个惰性抽屉 -->
                <div class="sp-body flex-1 min-h-0">
                    <!-- Emoji -->
                    <div v-show="activeTab === 'emoji'" class="h-full">
                        <div v-if="!canSendBasic"
                            class="sp-permission flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
                            此会话不允许发送该内容
                        </div>
                        <EmojiDrawer v-else-if="activeEmoji" ref="emojiRef" :is-premium="isPremium"
                            @pick-emoji="onPickEmoji" @pick-custom-emoji="onPickCustomEmoji" />
                    </div>

                    <!-- GIF -->
                    <div v-show="activeTab === 'gif'" class="h-full">
                        <div v-if="!canSendOther"
                            class="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
                            此会话不允许发送 GIF
                        </div>
                        <GifDrawer v-else-if="activeGif" ref="gifRef" @pick-animation="onPickAnimation" />
                    </div>

                    <!-- Sticker -->
                    <div v-show="activeTab === 'sticker'" class="h-full">
                        <div v-if="!canSendOther"
                            class="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
                            此会话不允许发送贴纸
                        </div>
                        <StickerDrawer v-else-if="activeSticker" ref="stickerRef" @pick-sticker="onPickSticker" />
                    </div>
                </div>

                <!-- 底部 Tab 栏（emoji / GIF / 贴纸） -->
                <div
                    class="sp-tabs flex items-center justify-around border-t border-black/5 dark:border-white/10 px-2 py-1.5">
                    <button v-for="tab in tabs" :key="tab.id"
                        class="sp-tab flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors"
                        :class="activeTab === tab.id ? 'text-blue-500 bg-blue-500/10' : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/5'"
                        @click="switchTab(tab.id)">
                        <component :is="tab.icon" class="w-5 h-5" />
                        <span class="text-[10px] leading-none">{{ tab.label }}</span>
                    </button>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Smile, Clapperboard } from 'lucide-vue-next';
import EmojiDrawer from './EmojiDrawer.vue';
import GifDrawer from './GifDrawer.vue';
import StickerDrawer from './StickerDrawer.vue';
import { stickerPanelState, closeStickerPanel, type StickerPanelTab } from './types';

const props = defineProps<{
    /** 面板锚点元素（输入框容器），用于定位面板 */
    anchor?: HTMLElement | null;
}>();

const emit = defineEmits<{
    (e: 'pickEmoji', emoji: string): void;
    (e: 'pickCustomEmoji', id: string): void;
    (e: 'pickSticker', stickerId: string): void;
    (e: 'pickAnimation', fileId: number, stickerId: string): void;
}>();

const tabs = [
    { id: 'emoji' as StickerPanelTab, label: '表情', icon: Smile },
    { id: 'gif' as StickerPanelTab, label: 'GIF', icon: Clapperboard },
    { id: 'sticker' as StickerPanelTab, label: '贴纸', icon: Smile },
];

const state = stickerPanelState.value;

const visible = computed(() => state.open);
const activeTab = computed(() => state.tab);
const isPremium = computed(() => state.isPremium);
const canSendBasic = computed(() => state.canSendBasic);
const canSendOther = computed(() => state.canSendOther);

/** 惰性：切到哪个 Tab 才创建哪个抽屉 */
const activeEmoji = ref(false);
const activeGif = ref(false);
const activeSticker = ref(false);

watch(activeTab, (tab) => {
    if (tab === 'emoji') activeEmoji.value = true;
    if (tab === 'gif') activeGif.value = true;
    if (tab === 'sticker') activeSticker.value = true;
}, { immediate: true });

// 子抽屉引用（用于 Activate / Deactivate）
const emojiRef = ref<InstanceType<typeof EmojiDrawer> | null>(null);
const gifRef = ref<InstanceType<typeof GifDrawer> | null>(null);
const stickerRef = ref<InstanceType<typeof StickerDrawer> | null>(null);

const panelStyle = reactive<Record<string, string>>({
    width: '360px',
    height: '420px',
});

/**
 * 面板定位：水平方向用 CSS 右对齐（.sp-panel 的 right-2，贴窗口最右），
 * 这里只根据锚点计算垂直位置（浮在输入框上方）。
 */
function positionPanel() {
    const anchor = props.anchor;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // 面板底边略微压过输入框顶，使其整体向下靠
    const top = rect.top - 420 + 14;
    panelStyle.top = `${Math.max(8, top)}px`;
}

onMounted(() => {
    positionPanel();
    window.addEventListener('resize', positionPanel);
    // 点击面板外部（空白处/输入区之外）时关闭面板；
    // 触发按钮位于 anchor 输入区内，点它时不会在此关闭，交给按钮的 toggle 处理。
    document.addEventListener('mousedown', onDocMouseDown);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', positionPanel);
    document.removeEventListener('mousedown', onDocMouseDown);
});

/** 面板根元素引用，用于判断点击是否在面板内部 */
const panelRoot = ref<HTMLElement | null>(null);

/**
 * 空白处点击关闭：目标在面板内或触发按钮（anchor）内则不在此关闭，
 * 其余（空白）一律关闭面板。
 */
function onDocMouseDown(e: MouseEvent) {
    const target = e.target as Node;
    if (panelRoot.value?.contains(target)) return;
    if (props.anchor?.contains(target)) return;
    closeStickerPanel();
}

watch(visible, () => {
    if (visible.value) positionPanel();
});

function switchTab(tab: StickerPanelTab) {
    state.tab = tab;
}

function onPickEmoji(emoji: string) {
    emit('pickEmoji', emoji);
    setTimeout(closeStickerPanel, 50);
}
function onPickCustomEmoji(id: string) {
    emit('pickCustomEmoji', id);
    setTimeout(closeStickerPanel, 50);
}
function onPickSticker(stickerId: string) {
    emit('pickSticker', stickerId);
    setTimeout(closeStickerPanel, 50);
}
function onPickAnimation(fileId: number, stickerId: string) {
    emit('pickAnimation', fileId, stickerId);
    setTimeout(closeStickerPanel, 50);
}

defineExpose({
    activate: (tab: StickerPanelTab) => {
        state.tab = tab;
        activeEmoji.value ||= tab === 'emoji';
        activeGif.value ||= tab === 'gif';
        activeSticker.value ||= tab === 'sticker';
    },
    deactivate: () => {
        emojiRef.value?.deactivate?.();
        gifRef.value?.deactivate?.();
        stickerRef.value?.deactivate?.();
    },
});
</script>

<style scoped>
.sp-panel {
    transform-origin: bottom center;
}

.sp-pop-enter-active,
.sp-pop-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.sp-pop-enter-from,
.sp-pop-leave-to {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
}
</style>
