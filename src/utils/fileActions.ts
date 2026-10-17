/**
 * 媒体文件的本地操作：另存为 / 在文件管理器中定位。
 *
 * 需要文件已下载到本地（file.local.path）。消息右键菜单与富文本媒体块共用同一实现，
 * 避免两处各写一遍 save + copyFile。
 */
import { save } from '@tauri-apps/plugin-dialog';
import { copyFile } from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import type { file as TdFile } from 'tdlib-types';
import { DownloadIcon, FolderOpenIcon } from 'lucide-vue-next';
import { toast } from './toast';
import { isFileReady } from './tdlib';
import { openContextMenu } from '../store/contextMenu';
import i18n from '../i18n';

/** 文件名兜底：发送方没给 file_name 时取本地路径末段 */
export function fileNameOf(file: TdFile | null | undefined, fallback = 'media'): string {
    const path = file?.local?.path;
    if (!path) return fallback;
    return path.split(/[\\/]/).pop() || fallback;
}

/** 另存为：弹保存对话框，把本地文件复制到目标位置 */
export async function saveFileAs(file: TdFile, fileName: string): Promise<void> {
    const src = file.local?.path;
    if (!src) return;
    try {
        const dest = await save({
            title: i18n.global.t('lng_mediaview_save_as'),
            defaultPath: fileName,
        });
        if (!dest) return;
        await copyFile(src, dest);
        toast.success(i18n.global.t('chat.saveAsDone'));
    } catch (e) {
        console.error('saveAs failed:', e);
        toast.error(i18n.global.t('chat.saveAsFailed'));
    }
}

/** 在系统文件管理器中定位到该文件 */
export async function revealFileInDir(path: string): Promise<void> {
    if (!path) return;
    try {
        await revealItemInDir([path]);
    } catch (e) {
        console.error('revealItemInDir failed:', e);
        toast.error(i18n.global.t('chat.revealFailed'));
    }
}

/**
 * 媒体文件右键菜单：另存为 / 在文件夹中显示。
 * 文件还没下载到本地时返回 false 且不拦截事件，交给上层（消息）右键菜单处理。
 */
export function openFileActionsMenu(e: MouseEvent, file?: TdFile | null, fileName?: string): boolean {
    if (!file || !isFileReady(file) || !file.local.path) return false;
    e.preventDefault();
    e.stopPropagation();
    const localPath = file.local.path;
    openContextMenu(e.clientX, e.clientY, [
        {
            key: 'reveal-in-dir',
            label: i18n.global.t('lng_context_show_in_folder'),
            icon: FolderOpenIcon,
            onClick: () => revealFileInDir(localPath),
        },
        {
            key: 'save-as',
            label: i18n.global.t('lng_mediaview_save_as'),
            icon: DownloadIcon,
            onClick: () => saveFileAs(file, fileName || fileNameOf(file)),
        },
    ]);
    return true;
}
