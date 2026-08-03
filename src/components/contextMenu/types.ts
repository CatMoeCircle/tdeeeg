import type { Component } from "vue";

/** 右键菜单项定义 */
export interface ContextMenuItem {
    /** 唯一标识 */
    key?: string;
    /** 菜单文本 */
    label: string;
    /** 图标（lucide 组件，需手动 import） */
    icon?: Component;
    /** 是否为危险操作（红色文本） */
    danger?: boolean;
    /** 是否显示分隔线（在上一项之后） */
    divider?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 快捷键提示文本（右侧灰色） */
    shortcut?: string;
    /** 是否显示勾选状态 */
    checked?: boolean;
    /** 是否为子菜单标题（点击展开子菜单） */
    children?: ContextMenuItem[];
    /** 点击回调 */
    onClick?: () => void;
}

/** 开放右键菜单时携带的上下文（组件可用它自定义菜单内容） */
export interface ContextMenuPayload {
    x: number;
    y: number;
    /** 触发元素 */
    target: HTMLElement | null;
    /** 由 v-context-menu 指令 .open(payload) 传入的附加数据 */
    data?: any;
}
