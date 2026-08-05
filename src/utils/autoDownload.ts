import { settings } from '../store/settings';
import type { chat, message } from 'tdlib-types';

/**
 * 对话类型分类
 */
export type ChatCategory = 'contacts' | 'groups' | 'privateChats' | 'channels';

/**
 * 根据 chat 对象判断对话类型分类
 */
export function getChatCategory(chatData: chat): ChatCategory {
    const t = chatData.type;
    switch (t._) {
        case 'chatTypePrivate':
        case 'chatTypeSecret':
            // 私聊：如果是联系人，归为 contacts；否则归为 privateChats
            // 这里简单处理：有双向关系的私聊归 contacts，其余归 privateChats
            // 由于 TDLib 未直接暴露"是否为联系人"，通过 last_message 和权限做保守判断
            // 更准确的方式是检查 chatData 是否在用户联系人列表中，但这里简化处理
            // Telegram 官方中私聊=contacts，非联系人私聊也属于 privateChats
            // 我们统一用 privateChats
            return 'privateChats';
        case 'chatTypeBasicGroup':
            return 'groups';
        case 'chatTypeSupergroup':
            if (t.is_channel) return 'channels';
            return 'groups';
        default:
            return 'privateChats';
    }
}

/**
 * 判断是否应对此消息启用自动下载
 */
export function shouldAutoDownloadMedia(
    msg: message,
    chatData: chat | undefined
): { photo: boolean; video: boolean; file: boolean } {
    if (!chatData) return { photo: false, video: false, file: false };

    // 总开关关闭则全部不自动下载
    if (!settings.autoDownload.enabled) return { photo: false, video: false, file: false };

    const category = getChatCategory(chatData);
    const cfg = settings.autoDownload;

    // 图片：默认全部类型启用
    const photo = cfg.photos.enabled && cfg.photos[category];

    // 视频
    let video = false;
    if (cfg.videos.enabled && cfg.videos[category]) {
        if (msg.content._ === 'messageVideo') {
            const sizeBytes = msg.content.video.video.size;
            const sizeMB = sizeBytes / (1024 * 1024);
            video = sizeMB <= cfg.videos.maxSize;
        }
    }

    // 文件
    let file = false;
    if (cfg.files.enabled && cfg.files[category]) {
        if (msg.content._ === 'messageDocument') {
            const sizeBytes = msg.content.document.document.size;
            const sizeMB = sizeBytes / (1024 * 1024);
            file = sizeMB <= cfg.files.maxSize;
        }
    }

    return { photo, video, file };
}

/**
 * 判断音频（音乐）是否应自动下载（供媒体播放器使用）。
 *
 * 音乐在自动下载设置中没有独立分类，但应遵守自动下载的体积上限：
 * 这里复用「文件（文档）」的 maxSize 作为音频自动下载的最大体积。
 * 超过上限的音频不自动下载——由用户在消息上点击下载后播放。
 */
export function shouldAutoDownloadAudio(
    chatData: chat | undefined,
    sizeBytes: number
): boolean {
    if (!chatData || !settings.autoDownload.enabled) return false;
    const category = getChatCategory(chatData);
    const cfg = settings.autoDownload.files;
    if (!cfg.enabled || !cfg[category]) return false;
    const sizeMB = (sizeBytes || 0) / (1024 * 1024);
    return sizeMB <= cfg.maxSize;
}
