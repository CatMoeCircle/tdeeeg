/**
 * 把 TDLib `updateFile` 携带的最新 `File` 对象「快照」写回消息内部的 File。
 *
 * 背景：`messages` 里每条消息是自包含对象，其 `content` 中嵌着的 File（如
 * `photo.sizes[].photo`、`video.video`、`document.document`、`audio.audio`、
 * `animation.animation`、`sticker.sticker`、`voice_note.voice`、`video_note.video`……
 * 以及各种缩略图 `thumbnail.file`）在消息加载时是静态快照。下载进行中/完成后，
 * TDLib 通过 `updateFile` 把**同一个 file.id** 的最新内容广播过来，但这些内嵌
 * 快照之前并不会被更新——导致「复制消息原始 JSON」时拿到的仍是下载完成前的旧数据
 * （local.is_downloading_completed / local.path 未回填）。
 *
 * 本模块提供一个通用的「按 file.id 在 MessageContent 里递归定位并就地更新 File」的
 * 能力：只写语义性的终态（如本地下载完成带路径），跳过高频的纯进度 tick，避免每次
 * updateFile 都全量扫描所有消息（性能）。就地更新（不替换引用）能让 Vue 依赖这些
 * 内嵌字段的 computed / watch 也一起刷新。
 */
import type { file as TdFile, message } from 'tdlib-types';

/** localFile 上由 updateFile 携带、需要回写快照的字段 */
const LOCAL_FILE_KEYS = [
    'path',
    'can_be_downloaded',
    'is_downloading_active',
    'is_downloading_completed',
    'download_offset',
    'downloaded_prefix_size',
    'downloaded_size',
] as const;

/** remoteFile 上由 updateFile 携带、需要回写快照的字段 */
const REMOTE_FILE_KEYS = [
    'id',
    'unique_id',
    'is_uploading_active',
    'is_uploading_completed',
    'uploaded_size',
] as const;

/**
 * 判断该 updateFile 是否值得写回消息快照。
 *
 * 我们的目标是让「下载/上传落地」后的消息副本反映真实状态（如可复制、转发、
 * 序列化 JSON 时带本地路径）。纯进行中的进度只会频繁触发且对快照无语义意义，
 * 这里只接受「本地下载已完成且带路径」这一里程碑态，把热路径成本省掉。
 */
export function isTerminalFileUpdate(file: TdFile): boolean {
    return !!file.local?.is_downloading_completed && !!file.local.path;
}

/** 把 src 对象里存在的字段逐一就地拷进 target（同值赋值不会触发 Vue setter 副作用） */
function mergeInPlace(target: Record<string, unknown> | undefined | null,
    src: Record<string, unknown> | undefined | null,
    keys: readonly string[]): void {
    if (!target || !src) return;
    for (const k of keys) {
        if (typeof src[k] !== 'undefined') {
            target[k] = src[k];
        }
    }
}

/** 判断一个节点类型是否为 TDLib 的 file（用结构特征判断，避免依赖 content 嵌套类型收窄） */
function isFileNode(node: unknown): node is Record<string, unknown> & { id: number } {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    return n._ === 'file' && typeof n.id === 'number';
}

/**
 * 深度遍历消息 content（及其内嵌对象），把 id === fileId 的 File 就地更新为
 * `updateFile` 的终态。返回是否发生过写回。
 */
function walkContent(obj: unknown, fileId: number, updated: TdFile, visited: Set<object>): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const node = obj as object;
    if (visited.has(node)) return false;
    visited.add(node);

    const rec = node as Record<string, unknown>;
    // 命中目标 File → 就地打补丁后返回（不再深入其内部）
    if (isFileNode(rec)) {
        if (rec.id !== fileId) return false;
        mergeInPlace(rec, updated, ['size', 'expected_size']);
        if (rec.local && updated.local) {
            mergeInPlace(rec.local as Record<string, unknown>, updated.local as Record<string, unknown>, LOCAL_FILE_KEYS);
        }
        if (rec.remote && updated.remote) {
            mergeInPlace(rec.remote as Record<string, unknown>, updated.remote as Record<string, unknown>, REMOTE_FILE_KEYS);
        }
        return true;
    }

    if (Array.isArray(rec)) {
        let changed = false;
        for (const item of rec) {
            if (walkContent(item, fileId, updated, visited)) changed = true;
        }
        return changed;
    }

    let changed = false;
    for (const key of Object.keys(rec)) {
        const value = rec[key];
        if (value && typeof value === 'object') {
            if (walkContent(value, fileId, updated, visited)) changed = true;
        }
    }
    return changed;
}

/**
 * 对给定的消息数组逐一执行 File 快照回写。
 * `messages` 可能是空/undefined（此时直接返回）。
 *
 * @returns 是否有任何消息发生写回
 */
export function applyMessageFileSnapshot(
    messages: ArrayLike<message> | undefined,
    fileId: number,
    updated: TdFile,
): boolean {
    if (!messages) return false;
    const visited = new Set<object>();
    let changed = false;
    for (let i = 0, len = messages.length; i < len; i++) {
        const msg = messages[i];
        if (!msg || !msg.content || typeof msg.content !== 'object') continue;
        if (walkContent(msg.content, fileId, updated, visited)) {
            changed = true;
        }
    }
    return changed;
}

/** 便捷入口：只回写「完成态」的 updateFile（用于高频事件管道） */
export function applyTerminalFileToMessages(
    messages: ArrayLike<message> | undefined,
    file: TdFile,
): boolean {
    if (!isTerminalFileUpdate(file)) return false;
    return applyMessageFileSnapshot(messages, file.id, file);
}
