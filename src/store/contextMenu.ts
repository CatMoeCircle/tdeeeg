import { reactive, ref } from "vue";
import type { ContextMenuItem } from "../components/contextMenu/types";

/** 全局右键菜单状态：任何组件通过 openContextMenu 打开，ContextMenu.vue 监听此状态渲染 */
export const visible = ref(false);
export const x = ref(0);
export const y = ref(0);
export const items = ref<ContextMenuItem[]>([]);
export const target = ref<HTMLElement | null>(null);
/** 供自定义组件渲染用的附加数据 */
export const payloadData = ref<Record<string, any> | null>(null);

/** 防抖定时器：让关闭在事件冒泡后执行，避免点击菜单项时被立即关闭 */
let closeTimer: ReturnType<typeof setTimeout> | null = null;
/** 是否允许点击外部关闭（菜单组件内部有独立判断） */
export const interactionLocked = ref(false);

/**
 * 打开右键菜单
 * @param x 屏幕 X 坐标
 * @param y 屏幕 Y 坐标
 * @param menuItems 菜单项
 * @param el 触发元素
 * @param data 附加数据
 */
export function openContextMenu(
    xPos: number,
    yPos: number,
    menuItems: ContextMenuItem[],
    el: HTMLElement | null = null,
    data: Record<string, any> | null = null,
) {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
    x.value = xPos;
    y.value = yPos;
    items.value = menuItems;
    target.value = el;
    payloadData.value = data;
    visible.value = true;
    interactionLocked.value = false;
}

/** 关闭右键菜单 */
export function closeContextMenu() {
    if (interactionLocked.value) return;
    visible.value = false;
    items.value = [];
    target.value = null;
    payloadData.value = null;
}

/** 延迟关闭（用于处理点击菜单项后让事件先冒泡） */
export function closeContextMenuDelayed(delay = 120) {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
        closeContextMenu();
        closeTimer = null;
    }, delay);
}

/** 在菜单打开期间锁定外部关闭（如子菜单交互） */
export function lockInteraction() {
    interactionLocked.value = true;
}

export function unlockInteraction() {
    interactionLocked.value = false;
}

/** 全局状态对象，供组件 v-bind 使用 */
export const state = reactive({
    visible,
    x,
    y,
    items,
    target,
    payloadData,
});
