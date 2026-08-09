<template>
    <Teleport to="body">
        <Transition name="cm-drop">
            <div v-if="visible" ref="menuRoot" class="fixed z-10000" :style="menuStyle"
                @contextmenu.prevent.stop="onRootContextMenu">
                <div class="cm-menu" @click.stop="onMenuClick">
                    <template v-for="(item, idx) in visibleItems" :key="item.key ?? idx">
                        <!-- 分隔线：用 v-if / v-else-if / v-else 互斥，避免分隔线项额外渲染一个空的 .cm-item -->
                        <div v-if="item.divider" class="cm-divider"></div>
                        <!-- 子菜单 -->
                        <div v-else-if="item.children && visibleChildren(item.children).length" class="cm-item-wrap"
                            :class="{ 'cm-disabled': item.disabled }" @mouseenter="onSubmenuEnter(idx)">
                            <div class="cm-item"
                                :class="{ 'cm-open': openSubIdx === idx, 'cm-disabled': item.disabled }">
                                <span class="cm-icon" v-if="item.icon">
                                    <component :is="item.icon" class="w-4 h-4" />
                                </span>
                                <span class="cm-label">{{ item.label }}</span>
                                <span class="cm-check" v-if="item.checked">
                                    <CheckIcon class="w-4 h-4" />
                                </span>
                                <span class="cm-shortcut cm-sub-arrow">
                                    <ChevronRightIcon class="w-4 h-4" />
                                </span>
                            </div>
                            <Teleport to="body">
                                <div v-if="openSubIdx === idx && visibleChildren(item.children).length" data-cm-submenu
                                    class="cm-menu cm-submenu" :class="{ 'cm-sub-left': subOpensLeft }"
                                    :style="subStyle">
                                    <template v-for="(child, cIdx) in visibleChildren(item.children)"
                                        :key="child.key ?? cIdx">
                                        <!-- 分隔线：只渲染分隔线，不再额外渲染一个空的可 hover .cm-item -->
                                        <div v-if="child.divider" class="cm-divider"></div>
                                        <div v-else class="cm-item-wrap" :class="{ 'cm-disabled': child.disabled }">
                                            <div class="cm-item"
                                                :class="{ 'cm-danger': child.danger, 'cm-disabled': child.disabled, 'cm-checked': child.checked }"
                                                @click="onChildClick(child)">
                                                <span class="cm-icon" v-if="child.icon">
                                                    <component :is="child.icon" class="w-4 h-4" />
                                                </span>
                                                <span class="cm-label">{{ child.label }}</span>
                                                <span class="cm-check" v-if="child.checked">
                                                    <CheckIcon class="w-4 h-4" />
                                                </span>
                                                <span class="cm-shortcut" v-if="child.shortcut">{{ child.shortcut
                                                }}</span>
                                            </div>
                                        </div>
                                    </template>
                                </div>
                            </Teleport>
                        </div>
                        <!-- 普通项 -->
                        <div v-else class="cm-item-wrap" :class="{ 'cm-disabled': item.disabled }">
                            <div class="cm-item"
                                :class="{ 'cm-danger': item.danger, 'cm-disabled': item.disabled, 'cm-checked': item.checked }"
                                @click="onItemClick(item)">
                                <span class="cm-icon" v-if="item.icon">
                                    <component :is="item.icon" class="w-4 h-4" />
                                </span>
                                <span class="cm-label">{{ item.label }}</span>
                                <span class="cm-check" v-if="item.checked">
                                    <CheckIcon class="w-4 h-4" />
                                </span>
                                <span class="cm-shortcut" v-if="item.shortcut">{{ item.shortcut }}</span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { CheckIcon, ChevronRightIcon } from "lucide-vue-next";
import { visible, x, y, items, closeContextMenu, closeContextMenuDelayed } from "../../store/contextMenu";
import type { ContextMenuItem } from "./types";

const menuRoot = ref<HTMLElement | null>(null);
const openSubIdx = ref<number | null>(null);
const subOpensLeft = ref(false);
const subStyle = ref<Record<string, string>>({});

/**
 * 父菜单位置（响应式，单一样式来源）。
 * 由 positionMenuInViewport 计算夹紧后的坐标；模板绑定此值，
 * 避免直接修改 DOM 内联样式与模板 :style 绑定（原始 x/y）冲突导致菜单被复位出界。
 */
const menuStyle = ref<Record<string, string>>({ left: '0px', top: '0px' });

/**
 * 判断一个菜单项是否有可视内容。
 * 若某菜单保留（预留）了条目槽位但最终没有任何内容（空 label、无图标、
 * 非分隔线、无子菜单、无勾选态），则跳过渲染，避免留下一个空的、可响应
 * css hover 高亮的 div。
 */
function isItemVisible(item: ContextMenuItem): boolean {
    if (item.divider) return true;
    if (item.children && item.children.length) return true;
    if (item.icon) return true;
    if (item.checked) return true;
    return (item.label ?? '').trim().length > 0;
}

/** 过滤掉空槽位后的可见菜单项（避免渲染空的可 hover div） */
const visibleItems = computed(() => items.value.filter(isItemVisible));

/** 过滤后的子菜单可见子项 */
function visibleChildren(children: ContextMenuItem[]): ContextMenuItem[] {
    return children.filter(isItemVisible);
}

/** 当前打开的子菜单元素（Teleport 到 body，通过 data 属性查询） */
function getSubmenuEl(): HTMLElement | null {
    return document.querySelector('[data-cm-submenu]');
}

/** 打开子菜单时根据父项位置计算子菜单位置 */
async function onSubmenuEnter(idx: number) {
    openSubIdx.value = idx;
    await nextTick();
    positionSubmenu();
}

function positionSubmenu() {
    const parent = menuRoot.value;
    const sub = getSubmenuEl();
    if (!parent || !sub) return;
    const parentRect = parent.getBoundingClientRect();
    const subW = sub.offsetWidth;
    const subH = sub.offsetHeight;
    // 找到父项的位置
    const itemEls = parent.querySelectorAll('.cm-item-wrap');
    const itemEl = itemEls[openSubIdx.value ?? 0] as HTMLElement | undefined;
    const itemTop = itemEl ? itemEl.offsetTop : 0;

    const subX = parentRect.right + 4;
    const subY = parentRect.top + itemTop;

    // 子菜单不要超出右边界（右移到父项左侧），也不要超出下边界
    let left = subX;
    const rightLimit = window.innerWidth - 8;
    const canOpenRight = subX + subW <= rightLimit;
    const canOpenLeft = parentRect.left - subW - 4 >= 8;
    if (canOpenRight) {
        left = subX;
        subOpensLeft.value = false;
    } else if (canOpenLeft) {
        left = parentRect.left - subW - 4;
        subOpensLeft.value = true;
    } else {
        // 两侧都放不下：靠近父菜单打开侧，并夹紧
        left = parentRect.right + 4 <= rightLimit ? subX : Math.max(8, rightLimit - subW);
        subOpensLeft.value = false;
    }
    let top = subY;
    if (top < 8) top = 8;
    if (top + subH > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - subH - 8);
    }
    subStyle.value = { left: left + 'px', top: top + 'px' };
}

function onItemClick(item: ContextMenuItem) {
    if (item.disabled) return;
    item.onClick?.();
    // 延迟关闭以允许事件冒泡
    closeContextMenuDelayed();
}

function onChildClick(child: ContextMenuItem) {
    if (child.disabled) return;
    openSubIdx.value = null;
    child.onClick?.();
    closeContextMenuDelayed();
}

function onMenuClick() {
    // 阻止冒泡，防止外层点击关闭
}

function onRootContextMenu() {
    // 菜单内再次右键不做任何事，仅阻止默认浏览器菜单
}

/** 点击菜单外部关闭 */
function handleOutsideClick(e: MouseEvent) {
    if (!visible.value) return;
    const root = menuRoot.value;
    // 子菜单也在 body 下，需要判断是否点击了菜单（含子菜单）
    const sub = getSubmenuEl();
    if (root?.contains(e.target as Node)) return;
    if (sub?.contains(e.target as Node)) return;
    closeContextMenu();
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        // 先关子菜单，再关主菜单
        if (openSubIdx.value !== null) {
            openSubIdx.value = null;
        } else {
            closeContextMenu();
        }
    }
}

function handleResize() {
    // 仅窗口尺寸变化时重定位父菜单。菜单为 position:fixed，
    // 滚动容器滚动不应改变其视口位置，故不监听 scroll。
    positionMenuInViewport();
}

function positionMenuInViewport() {
    const root = menuRoot.value;
    if (!root) return;
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    let left = x.value;
    let top = y.value;
    const margin = 8;
    // 四边夹紧，确保整段菜单位于视口内（含左/上边界）
    if (left + w > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - w - margin);
    if (left < margin) left = margin;
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    if (top < margin) top = margin;
    menuStyle.value = { left: left + 'px', top: top + 'px' };
}

// 右键坐标或可见性变化时重定位父菜单（响应式单一样式源）
watch([x, y, visible], () => {
    openSubIdx.value = null;
    if (visible.value) {
        nextTick().then(positionMenuInViewport);
    }
});

onMounted(() => {
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
    document.removeEventListener('mousedown', handleOutsideClick, true);
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
.cm-menu {
    min-width: 13rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.18);
    padding: 0.375rem 0;
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(30px) saturate(180%);
    -webkit-backdrop-filter: blur(30px) saturate(180%);
}

@media (prefers-color-scheme: dark) {
    .cm-menu {
        background: rgba(34, 34, 34, 0.82);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

.cm-submenu {
    position: fixed;
    z-index: 10000;
}

.cm-item-wrap {
    padding: 0 0.375rem;
}

.cm-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.375rem 0.625rem;
    border-radius: 0.5rem;
    font-size: 13px;
    color: #1f2937;
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
    user-select: none;
    line-height: 1.25rem;
}

@media (prefers-color-scheme: dark) {
    .cm-item {
        color: #e5e7eb;
    }
}

.cm-item:hover {
    background: rgba(0, 0, 0, 0.06);
}

@media (prefers-color-scheme: dark) {
    .cm-item:hover {
        background: rgba(255, 255, 255, 0.08);
    }
}

.cm-item.cm-open {
    background: rgba(0, 0, 0, 0.08);
}

@media (prefers-color-scheme: dark) {
    .cm-item.cm-open {
        background: rgba(255, 255, 255, 0.12);
    }
}

.cm-item.cm-disabled {
    opacity: 0.45;
    pointer-events: none;
}

.cm-item.cm-danger {
    color: #ef4444;
}

.cm-item.cm-danger:hover {
    background: rgba(239, 68, 68, 0.1);
}

.cm-item.cm-checked .cm-check {
    color: #3b82f6;
}

.cm-icon {
    flex-shrink: 0;
    color: #6b7280;
}

@media (prefers-color-scheme: dark) {
    .cm-icon {
        color: #9ca3af;
    }
}

.cm-item.cm-danger .cm-icon {
    color: #ef4444;
}

.cm-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cm-check {
    flex-shrink: 0;
    margin-left: 0.25rem;
}

.cm-shortcut {
    flex-shrink: 0;
    font-size: 11px;
    color: #9ca3af;
    margin-left: 0.75rem;
}

@media (prefers-color-scheme: dark) {
    .cm-shortcut {
        color: #6b7280;
    }
}

.cm-sub-arrow {
    color: #9ca3af;
}

.cm-divider {
    margin: 0.25rem 0;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
    .cm-divider {
        border-top-color: rgba(255, 255, 255, 0.1);
    }
}

/* 下拉动画 */
.cm-drop-enter-active,
.cm-drop-leave-active {
    transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.32, 0.72, 0, 1);
    transform-origin: top left;
}

.cm-drop-enter-from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
}

.cm-drop-leave-to {
    opacity: 0;
    transform: translateY(-4px) scale(0.99);
}
</style>
