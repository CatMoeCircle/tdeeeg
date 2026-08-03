import type { Directive, DirectiveBinding } from "vue";
import { openContextMenu } from "../store/contextMenu";
import type { ContextMenuItem } from "../components/contextMenu/types";

/**
 * 右键菜单指令：v-context-menu
 *
 * 用法：
 *   1. 常量值：v-context-menu="[{label, icon, danger, divider, disabled, shortcut, checked, onClick, children}]"
 *   2. 函数：   v-context-menu="(e, payloadData) => items"  —— 每次右键根据事件/数据返回菜单项
 *   3. 对象：   v-context-menu="{ items?: 同 1 或 2, onOpen?: (e, data) => void }"
 *
 * 指令值可以带附加数据：v-context-menu="... :context-menu-data="someObject"
 * （指令同时读取同元素的 data 或通过修饰传参）。
 */
export type ContextMenuValue =
    | ContextMenuItem[]
    | ((e: MouseEvent, data?: any) => ContextMenuItem[])
    | {
        items?: ContextMenuItem[] | ((e: MouseEvent, data?: any) => ContextMenuItem[]);
        onOpen?: (e: MouseEvent, data?: any) => void;
        closeOnClick?: boolean;
    };

function resolveItems(value: ContextMenuValue, e: MouseEvent, data: any): ContextMenuItem[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "function") {
        return value(e, data) || [];
    }
    // 对象形式
    const items = value.items;
    if (typeof items === "function") {
        return (items as (e: MouseEvent, data?: any) => ContextMenuItem[])(e, data) || [];
    }
    return (items as ContextMenuItem[]) || [];
}

function openMenu(el: HTMLElement, binding: DirectiveBinding<ContextMenuValue>, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const value = binding.value;
    const data = (el as any).__contextMenuData ?? undefined;

    if (value && typeof value === "object" && !Array.isArray(value) && !(typeof value === "function")) {
        value.onOpen?.(e, data);
    }

    const menuItems = resolveItems(value, e, data);
    if (!menuItems || menuItems.length === 0) {
        return;
    }

    openContextMenu(e.clientX, e.clientY, menuItems, el, data);
}

export function setContextMenuData(el: HTMLElement, data: any) {
    (el as any).__contextMenuData = data;
}

const vContextMenu: Directive<HTMLElement, ContextMenuValue> = {
    mounted(el, binding) {
        const handler = (e: MouseEvent) => openMenu(el, binding, e);
        el.addEventListener("contextmenu", handler);
        (el as any).__contextMenuHandler = handler;
    },
    unmounted(el) {
        const handler = (el as any).__contextMenuHandler;
        if (handler) {
            el.removeEventListener("contextmenu", handler);
        }
    },
};

export default vContextMenu;
