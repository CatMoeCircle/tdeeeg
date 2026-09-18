/**
 * 通用分组/标签栏按钮类（按 folderStyle 变体 + 激活态）。
 * 供对话列表分组栏、个人资料页标签栏等共用，跟随设置中「文件夹样式」变化。
 */
export type FolderStyle = 'tabs' | 'pills' | 'text' | 'soft';

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

/** 容器附加类：tabs 需要底部分隔线；soft 需要宽度随内容、带左右外边距的完全圆角白色浮层 */
export function folderTabContainerClass(folderStyle: FolderStyle): string {
    if (folderStyle === 'soft') {
        // mx-2：浮层左右留白；max-w 扣除边距；内边距与其他样式一致
        return 'w-fit max-w-[calc(100%-1rem)] mx-2 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-md shadow-(--box-shadow) px-1.5 py-1';
    }
    return folderStyle === 'tabs' ? 'border-b border-gray-200 dark:border-gray-700' : '';
}
