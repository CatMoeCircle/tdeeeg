<script setup lang="ts">
/**
 * 全局 Toast 宿主：把 utils/toast 的队列渲染成 SwipeToast。
 * 位置由开发者选项控制（store/debug.ts → toastPlacement）。
 */
import { computed } from 'vue';
import { AlertTriangle as AlertTriangleIcon, Check as CheckIcon, Info as InfoIcon, X as XIcon, type LucideIcon } from 'lucide-vue-next';
import SwipeToast from './SwipeToast.vue';
import { dismissToast, toastQueue, type ToastItem, type ToastType } from '../../../utils/toast';
import { toastPlacement, type ToastPlacement } from '../../../store/debug';

/** 各类型图标 + 燃烧线颜色（跟随主题语义色） */
const ICONS: Record<ToastType, LucideIcon> = {
  success: CheckIcon,
  error: XIcon,
  warning: AlertTriangleIcon,
  info: InfoIcon
};
const FUSE: Record<ToastType, string> = {
  success: 'var(--app-success, #2ba471)',
  error: 'var(--app-error, #d54941)',
  warning: 'var(--app-warning, #e37318)',
  info: 'var(--app-brand, #2aabee)'
};

/** 容器定位：只负责位置，卡片本身由 SwipeToast 的 inline 模式排布 */
const POSITION_CLASS: Record<ToastPlacement, string> = {
  'top-left': 'left-8 top-[calc(16px+env(safe-area-inset-top,0px))]',
  top: 'left-1/2 -translate-x-1/2 top-[calc(16px+env(safe-area-inset-top,0px))]',
  'top-right': 'right-8 top-[calc(16px+env(safe-area-inset-top,0px))]',
  center: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
  'bottom-left': 'left-8 bottom-[calc(32px+env(safe-area-inset-bottom,0px))]',
  bottom: 'left-1/2 -translate-x-1/2 bottom-[calc(32px+env(safe-area-inset-bottom,0px))]',
  'bottom-right': 'right-8 bottom-[calc(32px+env(safe-area-inset-bottom,0px))]'
};

const anchorClass = computed(() => POSITION_CLASS[toastPlacement.value] ?? POSITION_CLASS['bottom-left']);

/** 点了动作（如「去看看」）：先执行回调（跳转），卡片由 SwipeToast 自己按 action 关闭 */
function runAction(item: ToastItem) {
  item.onAction?.();
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed z-[999999999] w-[356px] max-w-[calc(100vw-32px)] pointer-events-none"
      :class="anchorClass"
    >
      <SwipeToast
        v-for="item in toastQueue"
        :key="item.id"
        :open="true"
        :title="item.content"
        :duration="item.duration"
        :action-label="item.actionLabel ?? ''"
        :fuse-color="FUSE[item.type]"
        inline
        close-button
        class-name="pointer-events-auto"
        @action="runAction(item)"
        @close="dismissToast(item.id)"
      >
        <template #icon>
          <component :is="ICONS[item.type]" :size="18" />
        </template>
      </SwipeToast>
    </div>
  </Teleport>
</template>
