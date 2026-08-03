import { tdlibSend } from "../../utils/tdlib";
import { MessagePlugin } from "tdesign-vue-next";
import type { Chat } from "../../store/chat";

/**
 * 对话列表右键菜单所需的各种 TDLib 操作封装。
 * 采用轻提示反馈，不在此处直接改写本地 store（TDLib 事件会驱动 UI 更新）。
 */

/** 判断对话是否已归档（chat_lists 含 chatListArchive） */
export function isChatArchived(chat: Chat): boolean {
    return !!chat.chat_lists?.some((l) => l._ === 'chatListArchive');
}

/** 判断对话是否已顶置 */
export function isChatPinned(chat: Chat): boolean {
    return !!chat.positions?.some((p) => p.is_pinned);
}

/** 判断对话是否已静音 */
export function isChatMuted(chat: Chat): boolean {
    const muteFor = chat.notification_settings?.mute_for ?? 0;
    return muteFor > 0;
}

/** 对话是否为群组/超级群组（可退出） */
export function canLeaveChat(chat: Chat): boolean {
    return (
        chat.type?._ === 'chatTypeBasicGroup' ||
        chat.type?._ === 'chatTypeSupergroup'
    );
}

/** 切换对话到某个列表（归档 / 主列表） */
export async function moveChatToList(chatId: number, chatList: { _: string }, successMsg?: string) {
    try {
        await tdlibSend({ _: 'addChatToList', chat_id: chatId, chat_list: chatList as any });
        if (successMsg) MessagePlugin.success(successMsg);
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 归档对话 */
export async function archiveChat(chatId: number) {
    await moveChatToList(chatId, { _: 'chatListArchive' }, '已归档');
}

/** 取消归档（移回主列表） */
export async function unarchiveChat(chatId: number) {
    await moveChatToList(chatId, { _: 'chatListMain' }, '已取消归档');
}

/** 顶置 / 取消顶置对话 */
export async function toggleChatPinned(chatId: number, isPinned: boolean, chatList?: { _: string }) {
    try {
        await tdlibSend({
            _: 'toggleChatIsPinned',
            chat_id: chatId,
            is_pinned: isPinned,
            chat_list: chatList as any,
        });
        MessagePlugin.success(isPinned ? '已置顶' : '已取消置顶');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 加入 / 移出分组（chatFolderInfo），folderId 为聊天文件夹 id */
export async function toggleChatInFolder(chatId: number, folderId: number, add: boolean) {
    try {
        await tdlibSend({
            _: 'addChatToList',
            chat_id: chatId,
            // chrome: TDLib 用 chatFolder 列表封装文件夹 id
            chat_list: { _: 'chatListFolder', chat_folder_id: folderId } as any,
        });
        MessagePlugin.success(add ? '已加入分组' : '已移出分组');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 关闭通知（静音） */
export async function muteChat(chatId: number) {
    try {
        await tdlibSend({
            _: 'setChatNotificationSettings',
            chat_id: chatId,
            notification_settings: {
                _: 'chatNotificationSettings',
                use_default_mute_for: false,
                mute_for: 366 * 24 * 60 * 60, // 无限期静音
                use_default_sound: true,
                sound_id: '0',
            } as any,
        });
        MessagePlugin.success('已关闭通知');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 开启通知（取消静音） */
export async function unmuteChat(chatId: number) {
    try {
        await tdlibSend({
            _: 'setChatNotificationSettings',
            chat_id: chatId,
            notification_settings: {
                _: 'chatNotificationSettings',
                use_default_mute_for: true,
                mute_for: 0,
                use_default_sound: true,
                sound_id: '0',
            } as any,
        });
        MessagePlugin.success('已开启通知');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 退出群组 */
export async function leaveChat(chatId: number) {
    try {
        await tdlibSend({ _: 'leaveChat', chat_id: chatId });
        MessagePlugin.success('已退出群组');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

/** 获取某对话可加入的分组（chat folder）列表 —— 通过 getChatListsToAddChat 离线方法获取 */
export async function getChatListsToAdd(chatId: number): Promise<{ id: number; title: string }[]> {
    try {
        const result = await tdlibSend({ _: 'getChatListsToAddChat', chat_id: chatId }) as any;
        const list = result?.chat_lists ?? [];
        const folders: { id: number; title: string }[] = [];
        for (const l of list) {
            if (l._ === 'chatListFolder') {
                const id = l.chat_folder_id;
                // 获取文件夹标题
                try {
                    const folder = await tdlibSend({ _: 'getChatFolder', chat_folder_id: id }) as any;
                    folders.push({ id, title: folder?.title?.text ?? `分组 ${id}` });
                } catch {
                    folders.push({ id, title: `分组 ${id}` });
                }
            }
        }
        return folders;
    } catch (e) {
        console.warn('Failed to load chat lists to add:', e);
        return [];
    }
}

/** 判断对话是否已在某分组中 */
export function isChatInFolder(chat: Chat, folderId: number): boolean {
    return !!chat.chat_lists?.some(
        (l) => l._ === 'chatListFolder' && (l as any).chat_folder_id === folderId,
    );
}
