<template>
    <Teleport to="body">
        <Transition name="reaction-picker-fade">
            <div v-if="visible" ref="pickerRef"
                class="fixed z-10002 flex flex-col overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900"
                :style="pickerStyle" @click.stop>

                <!-- 全 emoji 模式：直接复用贴纸选择器的 Emoji 抽屉（仅无底部 Tab 栏） -->
                <EmojiDrawer v-if="fullEmoji" :is-premium="isPremium" @pick-emoji="onPickEmoji"
                    @pick-custom-emoji="onPickCustomEmoji" />

                <!-- 可用回应模式（频道受限）：与贴纸选择器一致的网格列表，去重后遍历展示 -->
                <div v-else class="rp-available custom-scrollbar">
                    <div v-if="loading" class="py-8 text-center text-xs text-gray-400">加载中...</div>
                    <div v-else-if="allReactions.length === 0" class="py-8 text-center text-xs text-gray-400">无可用回应
                    </div>
                    <div v-else class="grid grid-cols-8 gap-1">
                        <button v-for="reaction in allReactions" :key="getReactionId(reaction)" type="button"
                            class="flex items-center justify-center rounded-lg aspect-square hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-100"
                            :class="{ 'opacity-50 cursor-not-allowed': reaction.needs_premium && !isPremium }"
                            :disabled="reaction.needs_premium && !isPremium"
                            :title="reaction.needs_premium ? '需要 Premium' : ''" @click.stop="selectReaction(reaction)">
                            <span v-if="isReactionEmoji(reaction.type)" class="leading-none"
                                :style="{ fontSize: '28px', lineHeight: '1' }">{{ reaction.type.emoji }}</span>
                            <CustomEmojiInline v-else-if="isReactionCustomEmoji(reaction.type)"
                                :emojiId="reaction.type.custom_emoji_id" :size="28"
                                :fallbackText="reaction.type.custom_emoji_id" />
                            <PaidReactionIcon v-else :size="28" />
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import PaidReactionIcon from '../../common/PaidReactionIcon.vue';
import EmojiDrawer from './stickerPanel/EmojiDrawer.vue';
import { tdlibSend } from '../../../utils/tdlib';
import type { message, ReactionType, availableReaction, availableReactions } from 'tdlib-types';
import { isReactionEmoji, isReactionCustomEmoji } from '../../../utils/reactionHelpers';

const props = defineProps<{
    /** 是否显示 */
    visible: boolean;
    /** 当前消息 */
    msg: message | null;
    /** 锚定元素的位置（相对于视口） */
    anchorRect?: { x: number; y: number; width: number; height: number };
    /** 当前用户是否为 Premium */
    isPremium?: boolean;
    /** 全 emoji 模式（群聊等允许所有 emoji 回应的场景） */
    fullEmoji?: boolean;
}>();

const emit = defineEmits<{
    /** 选择了一个 reaction（受限模式） */
    (e: 'select', type: ReactionType): void;
    /** 选择了一个 emoji（全 emoji 模式） */
    (e: 'select-emoji', emoji: string): void;
    /** 选择了一个自定义 emoji（Premium，全 emoji 模式） */
    (e: 'select-custom-emoji', id: string): void;
    /** 关闭面板 */
    (e: 'close'): void;
}>();

const pickerRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const availableData = ref<availableReactions | null>(null);

const topReactions = computed(() => availableData.value?.top_reactions ?? []);
const recentReactions = computed(() => availableData.value?.recent_reactions ?? []);
const popularReactions = computed(() => availableData.value?.popular_reactions ?? []);

/** 频道固定回应：合并去重后平铺展示（频道无「常用/最近/热门」概念） */
const allReactions = computed(() => {
    const seen = new Set<string>();
    const out: availableReaction[] = [];
    for (const r of [...topReactions.value, ...recentReactions.value, ...popularReactions.value]) {
        const key = isReactionEmoji(r.type) ? r.type.emoji
            : isReactionCustomEmoji(r.type) ? `c:${r.type.custom_emoji_id}`
                : 'paid';
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
    }
    return out;
});

// ===== 面板尺寸与定位 =====
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 420;

/** 计算固定尺寸面板的位置（水平居中锚点，垂直优先在锚点下方，不足则上方） */
function clampPosition(w: number, h: number): { left: string; top: string } {
    const rect = props.anchorRect;
    let left: number;
    let top: number;
    if (rect) {
        left = rect.x + rect.width / 2 - w / 2;
        top = rect.y + rect.height + 6;
        if (top + h > window.innerHeight - 8) {
            top = Math.max(8, rect.y - h - 6);
        }
    } else {
        left = (window.innerWidth - w) / 2;
        top = (window.innerHeight - h) / 2;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    if (top < 8) top = 8;
    return { left: `${left}px`, top: `${top}px` };
}

const pickerStyle = computed(() => {
    if (props.fullEmoji) {
        const pos = clampPosition(PANEL_WIDTH, PANEL_HEIGHT);
        return { width: `${PANEL_WIDTH}px`, height: `${PANEL_HEIGHT}px`, ...pos };
    }
    // 可用回应：宽度固定，高度自适应（由内容撑开，最高不超过面板高度）
    const pos = clampPosition(PANEL_WIDTH, PANEL_HEIGHT);
    return { width: `${PANEL_WIDTH}px`, maxHeight: `${PANEL_HEIGHT}px`, ...pos };
});

/** 获取 reaction 唯一 ID */
function getReactionId(reaction: availableReaction): string {
    if (isReactionEmoji(reaction.type)) return reaction.type.emoji;
    if (isReactionCustomEmoji(reaction.type)) return reaction.type.custom_emoji_id;
    return 'paid';
}

/** 选择受限模式下的一个回应 */
function selectReaction(reaction: availableReaction) {
    if (reaction.needs_premium && !props.isPremium) return;
    emit('select', reaction.type);
}

/** 全 emoji 模式：选择了一个普通 emoji */
function onPickEmoji(emoji: string) {
    emit('select-emoji', emoji);
}

/** 全 emoji 模式：选择了一个自定义 emoji */
function onPickCustomEmoji(id: string) {
    emit('select-custom-emoji', id);
}

/** 加载可用 reactions（仅受限模式） */
async function loadAvailableReactions() {
    if (props.fullEmoji || !props.msg || !props.visible) return;
    loading.value = true;
    try {
        const result = await tdlibSend({
            _: 'getMessageAvailableReactions',
            chat_id: props.msg.chat_id,
            message_id: props.msg.id,
        }) as availableReactions;
        if (result._ === 'availableReactions') {
            availableData.value = result;
        }
    } catch (e) {
        console.warn('Failed to load available reactions:', e);
    } finally {
        loading.value = false;
    }
}

/** 点击外部关闭 */
function onClickOutside(e: MouseEvent) {
    if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
        emit('close');
    }
}

/** ESC 关闭 */
function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        emit('close');
    }
}

watch(() => props.visible, (v) => {
    if (v) {
        if (!props.fullEmoji) loadAvailableReactions();
        // 延迟注册 click-outside，避免捕获触发打开的点击事件
        setTimeout(() => {
            document.addEventListener('click', onClickOutside, true);
            document.addEventListener('keydown', onKeyDown, true);
        }, 80);
    } else {
        document.removeEventListener('click', onClickOutside, true);
        document.removeEventListener('keydown', onKeyDown, true);
    }
});

onUnmounted(() => {
    document.removeEventListener('click', onClickOutside, true);
    document.removeEventListener('keydown', onKeyDown, true);
});
</script>

<style scoped>
.rp-available {
    padding: 8px;
    overflow-y: auto;
}

/* Fade transition */
.reaction-picker-fade-enter-active,
.reaction-picker-fade-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}

.reaction-picker-fade-enter-from,
.reaction-picker-fade-leave-to {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
}
</style>