<template>
  <div class="swipe-container" ref="container">
    <!-- 右侧操作按钮（左滑时露出） -->
    <div class="swipe-actions-right" ref="rightActions">
      <slot name="actions" :close="close">
        <button class="action-btn archive-btn" @click="handleAction('archive')">
          <ArchiveIcon class="w-5 h-5" />
          <span>归档</span>
        </button>
        <button class="action-btn delete-btn" @click="handleAction('delete')">
          <Trash2Icon class="w-5 h-5" />
          <span>删除</span>
        </button>
      </slot>
    </div>

    <!-- 左侧操作按钮（右滑时露出） -->
    <div class="swipe-actions-left" ref="leftActions">
      <slot name="left-actions" :close="close">
        <button class="action-btn read-btn" @click="handleAction('read')">
          <CheckCheckIcon class="w-5 h-5" />
          <span>已读</span>
        </button>
      </slot>
    </div>

    <!-- 可滑动的内容区域 -->
    <div
      ref="content"
      class="swipe-content"
      :style="contentStyle"
      @touchstart.passive="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onTouchEnd"
      @mousedown="onMouseDown"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArchiveIcon, Trash2Icon, CheckCheckIcon } from 'lucide-vue-next';

const emit = defineEmits<{
  archive: [chatId: number];
  delete: [chatId: number];
  markRead: [chatId: number];
}>();

const props = defineProps<{
  chatId: number;
  /** 左滑时右侧按钮区域的最大宽度（px） */
  actionsWidth?: number;
  /** 右滑时左侧按钮区域的最大宽度（px） */
  leftActionsWidth?: number;
  /** 触发操作的滑动阈值（占按钮区域宽度的百分比） */
  threshold?: number;
}>();

const container = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const rightActions = ref<HTMLElement | null>(null);
const leftActions = ref<HTMLElement | null>(null);

const offset = ref(0);
const startX = ref(0);
const startY = ref(0);
const dragging = ref(false);
const isOpen = ref(false);
const direction = ref<'left' | 'right' | null>(null);

const rightWidth = computed(() => props.actionsWidth ?? 140);
const leftWidth = computed(() => props.leftActionsWidth ?? 70);
const snapThreshold = computed(() => props.threshold ?? 0.4);

const contentStyle = computed(() => {
  if (dragging.value) {
    return {
      transform: `translateX(${offset.value}px)`,
      transition: 'none',
    };
  }
  return {
    transform: `translateX(${offset.value}px)`,
    transition: 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
  };
});

/** 关闭滑动面板（滑回原位） */
function close() {
  offset.value = 0;
  isOpen.value = false;
  direction.value = null;
}

/** 打开到指定偏移 */
function openTo(dir: 'left' | 'right') {
  direction.value = dir;
  isOpen.value = true;
  offset.value = dir === 'left' ? -rightWidth.value : leftWidth.value;
}

function handleAction(action: string) {
  switch (action) {
    case 'archive':
      emit('archive', props.chatId);
      break;
    case 'delete':
      emit('delete', props.chatId);
      break;
    case 'read':
      emit('markRead', props.chatId);
      break;
  }
  close();
}

// ---- Touch Events ----
function onTouchStart(e: TouchEvent) {
  startX.value = e.touches[0].clientX;
  startY.value = e.touches[0].clientY;
  dragging.value = true;
}

function onTouchMove(e: TouchEvent) {
  if (!dragging.value) return;
  const dx = e.touches[0].clientX - startX.value;
  const dy = Math.abs(e.touches[0].clientY - startY.value);

  // 如果竖向滑动距离大于横向，不处理（让页面滚动）
  if (dy > Math.abs(dx) && dy > 10) {
    dragging.value = false;
    return;
  }

  let newOffset: number;
  if (isOpen.value && direction.value === 'left') {
    // 已经打开左侧按钮，继续滑动
    newOffset = -rightWidth.value + dx;
  } else if (isOpen.value && direction.value === 'right') {
    newOffset = leftWidth.value + dx;
  } else {
    newOffset = dx;
  }

  // 限制范围：最大右滑到 leftWidth，最大左滑到 -rightWidth
  newOffset = Math.max(-rightWidth.value, Math.min(leftWidth.value, newOffset));
  offset.value = newOffset;
}

function onTouchEnd() {
  dragging.value = false;
  const absOffset = Math.abs(offset.value);

  if (offset.value < 0) {
    // 左滑
    if (absOffset > rightWidth.value * snapThreshold.value) {
      openTo('left');
    } else {
      close();
    }
  } else if (offset.value > 0) {
    // 右滑
    if (absOffset > leftWidth.value * snapThreshold.value) {
      openTo('right');
    } else {
      close();
    }
  }
}

// ---- Mouse Events ----
let mouseDown = false;

function onMouseDown(e: MouseEvent) {
  mouseDown = true;
  startX.value = e.clientX;
  startY.value = e.clientY;
  dragging.value = true;

  const onMouseMove = (ev: MouseEvent) => {
    if (!mouseDown) return;
    const dx = ev.clientX - startX.value;
    const dy = Math.abs(ev.clientY - startY.value);

    if (dy > Math.abs(dx) && dy > 10) {
      cleanup();
      return;
    }

    let newOffset: number;
    if (isOpen.value && direction.value === 'left') {
      newOffset = -rightWidth.value + dx;
    } else if (isOpen.value && direction.value === 'right') {
      newOffset = leftWidth.value + dx;
    } else {
      newOffset = dx;
    }

    newOffset = Math.max(-rightWidth.value, Math.min(leftWidth.value, newOffset));
    offset.value = newOffset;
  };

  const onMouseUp = () => {
    cleanup();
    dragging.value = false;
    const absOffset = Math.abs(offset.value);

    if (offset.value < 0) {
      if (absOffset > rightWidth.value * snapThreshold.value) {
        openTo('left');
      } else {
        close();
      }
    } else if (offset.value > 0) {
      if (absOffset > leftWidth.value * snapThreshold.value) {
        openTo('right');
      } else {
        close();
      }
    }
  };

  const cleanup = () => {
    mouseDown = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}
</script>

<style scoped>
.swipe-container {
  position: relative;
  overflow: hidden;
  width: 100%;
}

.swipe-actions-right,
.swipe-actions-left {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  z-index: 0;
}

.swipe-actions-right {
  right: 0;
  flex-direction: row-reverse;
}

.swipe-actions-left {
  left: 0;
  flex-direction: row;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 64px;
  padding: 0 12px;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: white;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.archive-btn {
  background-color: #6b7280;
}

.archive-btn:hover {
  background-color: #4b5563;
}

.delete-btn {
  background-color: #ef4444;
}

.delete-btn:hover {
  background-color: #dc2626;
}

.read-btn {
  background-color: #3b82f6;
}

.read-btn:hover {
  background-color: #2563eb;
}

.swipe-content {
  position: relative;
  z-index: 1;
  background: inherit;
  cursor: grab;
  width: 100%;
}

.swipe-content:active {
  cursor: grabbing;
}
</style>
