<template>
    <Teleport to="body">
        <Transition name="reaction-picker-fade">
            <div v-if="visible && data && data.reactions.length > 0" ref="capsuleRef" data-context-menu-ignore
                class="fixed z-10001 flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50"
                :style="capsuleStyle" @mousedown.stop @click.stop>
                <button v-for="r in data.reactions" :key="r.emoji + (r.customEmojiId ?? '')" type="button"
                    class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-100 select-none shrink-0"
                    :class="{ 'opacity-50 cursor-not-allowed': r.needsPremium && !isPremium }"
                    :disabled="r.needsPremium && !isPremium"
                    :title="r.needsPremium ? t('chat.needsPremium') : r.type._ === 'reactionTypePaid' ? t('lng_sr_message_column_paid_reactions') : r.emoji"
                    @click.stop="onReactionClick(r)">
                    <PaidReactionIcon v-if="r.type._ === 'reactionTypePaid'" :size="24" />
                    <ReactionEmojiAnim v-else-if="!r.customEmojiId" :emoji="r.emoji" :size="26" :fallback-font="22" />
                    <CustomEmojiInline v-else :emojiId="r.customEmojiId" :size="24" :fallbackText="r.emoji" />
                </button>
                <!-- 更多回应按钮 -->
                <button v-if="data.hasMore" type="button"
                    class="flex items-center justify-center w-8 h-8 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-100 select-none shrink-0"
                    @click.stop="onMoreClick" :title="t('chat.moreReactions')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import PaidReactionIcon from '../../common/PaidReactionIcon.vue';
import ReactionEmojiAnim from '../../common/ReactionEmojiAnim.vue';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import { useUserStore } from '../../../store/user';
import {
    state as contextMenuState, visible as contextMenuVisible,
    reactionRow as contextMenuReactionRow, closeContextMenu as closeContextMenuStore,
} from '../../../store/contextMenu';
import type { ContextMenuReactionItem, ContextMenuReactionRow } from '../../contextMenu/types';

/**
 * 胶囊回应选择器：右键菜单上方的独立浮动栏。
 * 监听全局右键菜单的回应栏状态，自动跟随菜单位置显示 / 隐藏。
 */
const { t } = useI18n();
const { userProfile } = storeToRefs(useUserStore());
const isPremium = computed(() => !!userProfile.value?.is_premium);

const capsuleRef = ref<HTMLElement | null>(null);
const visible = ref(false);
const data = ref<ContextMenuReactionRow | null>(null);
const capsuleStyle = ref<Record<string, string>>({});

/**
 * 计算胶囊位置：绑定到右键菜单的最终渲染位置，居中对齐菜单顶部，
 * 参与四边夹紧确保不超出视口。
 */
function updateCapsulePosition() {
    if (!visible.value) return;
    nextTick(() => {
        const menuEl = document.querySelector('.cm-menu') as HTMLElement | null;
        const capsuleEl = capsuleRef.value;
        if (!menuEl || !capsuleEl) return;

        const menuRect = menuEl.getBoundingClientRect();
        const capsuleRect = capsuleEl.getBoundingClientRect();
        const margin = 8;
        const gap = 6; // 胶囊与菜单之间的间距

        // 水平居中对齐菜单，参与左右夹紧
        let left = menuRect.left + menuRect.width / 2 - capsuleRect.width / 2;
        if (left < margin) left = margin;
        if (left + capsuleRect.width > window.innerWidth - margin) {
            left = window.innerWidth - capsuleRect.width - margin;
        }

        // 垂直：优先放在菜单上方；若放不下则放在菜单下方
        let top = menuRect.top - capsuleRect.height - gap;
        if (top < margin) top = menuRect.bottom + gap;
        // 若下方也放不下，夹紧到顶部
        if (top < margin) top = margin;

        capsuleStyle.value = { left: `${left}px`, top: `${top}px` };
    });
}

/** 监听右键菜单的 reactionRow 状态 + 菜单位置，同步显示/隐藏胶囊 */
watch([contextMenuVisible, contextMenuReactionRow, () => contextMenuState.x, () => contextMenuState.y], () => {
    if (contextMenuVisible.value && contextMenuReactionRow.value && contextMenuReactionRow.value.reactions.length > 0) {
        // 菜单打开且有回应数据：显示胶囊
        data.value = contextMenuReactionRow.value;
        visible.value = true;
        // 菜单已经由 ContextMenu.vue 的 positionMenuInViewport 完成夹紧定位，
        // 等菜单渲染完毕后再根据菜单最终位置计算胶囊位置
        nextTick(() => {
            // 菜单的 positionMenuInViewport 在 nextTick 中执行，再等一帧确保完成
            nextTick(updateCapsulePosition);
        });
    } else {
        // 菜单关闭或无回应：隐藏胶囊
        visible.value = false;
        data.value = null;
    }
}, { immediate: true });

/** 窗口 resize 时重新定位胶囊 */
function onCapsuleResize() {
    if (visible.value) updateCapsulePosition();
}
onMounted(() => window.addEventListener('resize', onCapsuleResize));
onUnmounted(() => window.removeEventListener('resize', onCapsuleResize));

/** 点击胶囊中的某个回应 */
function onReactionClick(r: ContextMenuReactionItem) {
    if (r.needsPremium && !isPremium.value) return;
    r.onClick?.();
    visible.value = false;
    data.value = null;
    // 点击回应后同时关闭右键菜单
    closeContextMenuStore();
}

/** 点击胶囊中的更多按钮：关闭胶囊+菜单，打开完整回应选择器 */
function onMoreClick() {
    // 先获取回调和胶囊位置，再关闭胶囊
    const onMore = data.value?.onMore;
    const capsuleRect = capsuleRef.value?.getBoundingClientRect();
    visible.value = false;
    data.value = null;
    // 关闭右键菜单（避免菜单残留）
    closeContextMenuStore();
    // 传入胶囊位置作为锚点，让选择器在胶囊原位展开
    if (capsuleRect) {
        onMore?.({ x: capsuleRect.left, y: capsuleRect.top, width: capsuleRect.width, height: capsuleRect.height });
    } else {
        onMore?.();
    }
}
</script>
