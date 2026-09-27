/**
 * 通用分组/标签栏按钮类（按 folderStyle 变体 + 激活态）。
 * 供对话列表分组栏、个人资料页标签栏等共用，跟随设置中「文件夹样式」变化。
 */
export type FolderStyle = 'tabs' | 'pills' | 'text' | 'soft';

/** 通用 UI 磨砂玻璃背景（与聊天 Header / 输入区等一致） */
export const UI_GLASS_SURFACE =
    'bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50';

export function folderTabClass(
    folderStyle: FolderStyle,
    _id: string,
    active: boolean,
): string {
    const base = 'px-2.5 py-1 text-xs font-medium gap-1';
    switch (folderStyle) {
        case 'pills':
            return active
                ? `${base} bg-blue-500 shadow-sm shadow-blue-500/50 text-white rounded-full my-1`
                : `${base} bg-white/70 dark:bg-gray-800/70 backdrop-blur-md text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800/90 rounded-full my-1`;
        case 'soft':
            // 浅蓝胶囊底由 SlidingTabBar 滑动指示器绘制；水平略紧，高度恢复正常
            return active
                ? 'px-2 py-1 text-xs font-medium gap-1 relative z-10 text-blue-600 dark:text-blue-400 rounded-full'
                : 'px-2 py-1 text-xs font-medium gap-1 relative z-10 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-full';
        case 'tabs':
            return active
                ? `${base} text-blue-600`
                : `${base} text-gray-500 hover:text-gray-700`;
        default:
            return active
                ? `${base} text-blue-600 font-bold`
                : `${base} text-gray-500 hover:text-gray-700`;
    }
}

/**
 * 通用分组栏浮层（Telegram 风格）：宽度随内容、左右留白、磨砂玻璃完全圆角。
 * 所有 folderStyle 变体共用同一浮层，仅内部标签按钮样式随变体变化。
 */
export const FOLDER_TAB_OVERLAY =
    `w-fit max-w-[calc(100%-1rem)] mx-2 rounded-full ${UI_GLASS_SURFACE} px-1.5 py-1`;

/** 容器附加类：全部变体统一带通用磨砂玻璃浮层 */
export function folderTabContainerClass(_folderStyle: FolderStyle): string {
    return FOLDER_TAB_OVERLAY;
}
