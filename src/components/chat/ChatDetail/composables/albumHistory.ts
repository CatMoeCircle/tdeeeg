import type { message } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';

/**
 * TDLib 每条消息 id 以 2^20 递增，同一相册内的成员 id 连续。
 * 用 id 跨度判断历史切片是否漏掉了相册中间成员。
 */
const MESSAGE_ID_STEP = 1024 * 1024;
/** TDLib 相册最大条数（sendMessageAlbum 支持 2-10 条） */
const MAX_ALBUM_SIZE = 10;
/** 补全失败后的重试次数（等待 TDLib 后台同步相册成员） */
const COMPLETE_ATTEMPTS = 3;
/** 重试退避基数（毫秒） */
const RETRY_BASE_MS = 300;

/** 按 media_album_id 分组（忽略非相册消息） */
export function groupByAlbum(msgs: message[]): Map<string, message[]> {
    const groups = new Map<string, message[]>();
    for (const m of msgs) {
        const albumId = m.media_album_id;
        if (!albumId || albumId === '0') continue;
        const group = groups.get(albumId);
        if (group) group.push(m);
        else groups.set(albumId, [m]);
    }
    return groups;
}

/** 相册组是否不完整（sendMessageAlbum 规定相册由 2-10 条消息构成） */
export function isAlbumGroupIncomplete(group: message[]): boolean {
    if (group.length === 0) return false;
    // 相册至少 2 条：只有 1 条时必然被历史切片截断（或其余成员尚未同步）
    if (group.length < 2) return true;
    let min = group[0].id;
    let max = group[0].id;
    for (const m of group) {
        if (m.id < min) min = m.id;
        if (m.id > max) max = m.id;
    }
    const span = max - min;
    if (span <= 0 || span % MESSAGE_ID_STEP !== 0) return false;
    const expected = span / MESSAGE_ID_STEP + 1;
    return expected > group.length && expected <= MAX_ALBUM_SIZE;
}

/** 历史切片中是否存在不完整相册 */
export function hasIncompleteAlbum(msgs: message[]): boolean {
    for (const group of groupByAlbum(msgs).values()) {
        if (isAlbumGroupIncomplete(group)) return true;
    }
    return false;
}

/**
 * 补全历史切片里被 TDLib 省略的相册成员。
 *
 * TDLib 在部分同步状态下可能只返回相册首尾两条（中间成员尚未同步到本地），
 * 导致一个相册只显示 2 个文件。这里按 id 跨度识别缺口，以相册最后一条为锚点
 * 重新取一次历史；若仍未补齐则短暂重试，等待本地同步完成。
 *
 * 返回顺序与 getChatHistory 一致（newest-first），调用方随后 reverse 即可。
 */
export async function completeAlbumMembers(chatId: number, msgs: message[]): Promise<message[]> {
    if (msgs.length === 0) return msgs;
    const merged = new Map<number, message>(msgs.map(m => [m.id, m]));
    let changed = false;

    for (const [albumId, group] of groupByAlbum(msgs)) {
        if (!isAlbumGroupIncomplete(group)) continue;
        const members = new Map<number, message>(group.map(m => [m.id, m]));

        for (let attempt = 0; attempt < COMPLETE_ATTEMPTS; attempt++) {
            let maxId = 0;
            for (const id of members.keys()) if (id > maxId) maxId = id;
            try {
                const result = await tdlibSend({
                    _: 'getChatHistory',
                    chat_id: chatId,
                    from_message_id: maxId,
                    // 以当前最大 id 为锚点，向更新方向多取 9 条、向后覆盖 9 条：
                    // 无论缺口在相册前半还是后半，一次请求都能覆盖完整的 2-10 条相册。
                    offset: -(MAX_ALBUM_SIZE - 1),
                    limit: MAX_ALBUM_SIZE * 2 - 1,
                    only_local: false,
                });
                for (const m of result.messages ?? []) {
                    if (m && m.media_album_id === albumId) members.set(m.id, m);
                }
            } catch {
                /* 补全失败不影响主列表 */
            }
            if (!isAlbumGroupIncomplete([...members.values()])) break;
            if (attempt < COMPLETE_ATTEMPTS - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_BASE_MS * (attempt + 1)));
            }
        }

        for (const m of members.values()) {
            if (!merged.has(m.id)) changed = true;
            merged.set(m.id, m);
        }
    }

    if (!changed) return msgs;
    return [...merged.values()].sort((a, b) => b.id - a.id);
}
