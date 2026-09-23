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
 * 注意：ChatDetail 的 messages 是 shallowRef + markRaw。就地改嵌套字段**不会**
 * 触发 Vue 重渲染；且 computed 若仍拿到同一 File 引用也不会重算。因此这里在写回时
 * **替换命中 File 节点的引用**（新对象），调用方再替换 content / message 引用，
 * 整条依赖链（photoBigPath / isFileReady 等）才会刷新。
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

/** 把 src 对象里存在的字段拷进 target 的浅拷贝 */
function mergeShallow(
    target: Record<string, unknown>,
    src: Record<string, unknown> | undefined | null,
    keys: readonly string[],
): Record<string, unknown> {
    if (!src) return target;
    for (const k of keys) {
        if (typeof src[k] !== 'undefined') {
            target[k] = src[k];
        }
    }
    return target;
}

/** 判断一个节点类型是否为 TDLib 的 file（用结构特征判断，避免依赖 content 嵌套类型收窄） */
function isFileNode(node: unknown): node is Record<string, unknown> & { id: number } {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    return n._ === 'file' && typeof n.id === 'number';
}

/** 由旧 File + updateFile 终态构造新 File（新引用，驱动 markRaw 下的 computed 重算） */
function buildUpdatedFile(old: Record<string, unknown>, updated: TdFile): Record<string, unknown> {
    const next: Record<string, unknown> = { ...old };
    mergeShallow(next, updated as unknown as Record<string, unknown>, ['size', 'expected_size']);
    if (old.local || updated.local) {
        next.local = mergeShallow(
            { ...(old.local as Record<string, unknown> | undefined) ?? {} },
            updated.local as unknown as Record<string, unknown> | undefined,
            LOCAL_FILE_KEYS,
        );
    }
    if (old.remote || updated.remote) {
        next.remote = mergeShallow(
            { ...(old.remote as Record<string, unknown> | undefined) ?? {} },
            updated.remote as unknown as Record<string, unknown> | undefined,
            REMOTE_FILE_KEYS,
        );
    }
    return next;
}

/**
 * 深度遍历，把 id === fileId 的 File **替换为新对象**（不就地改）。
 * 命中时通过 setter 回写父容器（对象属性 / 数组下标），保证引用变化。
 */
function walkContent(obj: unknown, fileId: number, updated: TdFile, visited: Set<object>): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const node = obj as object;
    if (visited.has(node)) return false;
    visited.add(node);

    const rec = node as Record<string, unknown>;
    if (isFileNode(rec)) {
        // 自身是目标 File：由父容器负责替换，这里仅标记「需要替换」
        return rec.id === fileId;
    }

    if (Array.isArray(rec)) {
        let changed = false;
        for (let i = 0; i < rec.length; i++) {
            const item = rec[i];
            if (isFileNode(item)) {
                if (item.id === fileId) {
                    rec[i] = buildUpdatedFile(item, updated);
                    changed = true;
                }
                continue;
            }
            if (walkContent(item, fileId, updated, visited)) {
                // 子树要求替换自身：walkContent 只在 isFileNode 时返回 true，
                // 而父层已处理数组/对象替换，此分支实际不会对非 File 返回 true。
                changed = true;
            }
        }
        return changed;
    }

    let changed = false;
    for (const key of Object.keys(rec)) {
        const value = rec[key];
        if (isFileNode(value)) {
            if (value.id === fileId) {
                rec[key] = buildUpdatedFile(value, updated);
                changed = true;
            }
            continue;
        }
        if (value && typeof value === 'object') {
            if (walkContent(value, fileId, updated, visited)) {
                changed = true;
            }
        }
    }
    return changed;
}

/**
 * 对给定的消息数组逐一执行 File 快照回写（替换命中 File 的引用）。
 * `messages` 可能是空/undefined（此时直接返回空数组）。
 *
 * @returns 发生过写回的消息 id 列表；调用方应据此替换 content 引用以驱动 markRaw UI
 */
export function applyMessageFileSnapshot(
    messages: ArrayLike<message> | undefined,
    fileId: number,
    updated: TdFile,
): number[] {
    const changedIds: number[] = [];
    if (!messages) return changedIds;
    const visited = new Set<object>();
    for (let i = 0, len = messages.length; i < len; i++) {
        const msg = messages[i];
        if (!msg || !msg.content || typeof msg.content !== 'object') continue;
        // content 本身不是 File；遍历其子树，命中则替换子树里的 File 引用
        if (walkContent(msg.content, fileId, updated, visited)) {
            changedIds.push(msg.id);
        }
    }
    return changedIds;
}

/**
 * 便捷入口：只回写「完成态」的 updateFile（用于高频事件管道）。
 * @returns 写回过的消息 id；调用方用它做 markRaw 下的 content/message 引用替换
 */
export function applyTerminalFileToMessages(
    messages: ArrayLike<message> | undefined,
    file: TdFile,
): number[] {
    if (!isTerminalFileUpdate(file)) return [];
    return applyMessageFileSnapshot(messages, file.id, file);
}
