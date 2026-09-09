import type { Component } from "vue";
import type { ReactionType } from "tdlib-types";

/** 菜单顶部回应栏中的单个回应按钮 */
export interface ContextMenuReactionItem {
    /** 回应类型 */
    type: ReactionType;
    /** 显示的 emoji 文本 */
    emoji: string;
    /** 自定义 emoji id（仅自定义 emoji 回应有值） */
    customEmojiId?: string;
    /** 是否需要 Premium */
    needsPremium?: boolean;
    /** 点击回调 */
    onClick?: () => void;
}

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

/** 菜单顶部回应栏配置 */
export interface ContextMenuReactionRow {
    /** 显示的回应列表 */
    reactions: ContextMenuReactionItem[];
    /** 是否显示"更多回应"下拉箭头（当可用回应多于显示数量时） */
    hasMore?: boolean;
    /** 点击"更多回应"的回调，接收菜单位置信息 */
    onMore?: (anchorRect?: { x: number; y: number; width: number; height: number }) => void;
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
