/**
 * 通用分组/标签栏按钮类（按 folderStyle 变体 + 激活态）。
 * 供对话列表分组栏、个人资料页标签栏等共用，跟随设置中「文件夹样式」变化。
 */
export type FolderStyle = 'tabs' | 'pills' | 'text';

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

/** 容器附加类：tabs 变体需要底部分隔线（与对话列表一致） */
export function folderTabContainerClass(folderStyle: FolderStyle): string {
    return folderStyle === 'tabs' ? 'border-b border-gray-200 dark:border-gray-700' : '';
}
