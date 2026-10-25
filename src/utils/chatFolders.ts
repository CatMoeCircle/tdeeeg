import type { chatFolder } from 'tdlib-types';

/**
 * 分组对话 id 的运算规则（纯函数，便于自检）。
 *
 * TDLib 的 chatFolder 有三个互斥语义的 id 数组：
 * - pinned_chat_ids：置顶，同时也是「始终包含」
 * - included_chat_ids：始终包含（不含置顶）
 * - excluded_chat_ids：始终排除
 * 同一对话出现在包含与排除里会被 TDLib 拒绝，所以这里统一在这里收口。
 */
export interface FolderChatIds {
    pinned: number[];
    included: number[];
    excluded: number[];
}

/**
 * 分组标签颜色（TDLib chatFolder.color_id 0..6，-1 = 不显示）。
 * 供会员在对话卡片底部显示分组标签使用；顺序须与 TDLib 枚举一致。
 */
export const FOLDER_TAG_COLORS: string[] = [
    '#E17076', // 0 红
    '#FAA774', // 1 橙
    '#A695E7', // 2 紫
    '#7BC862', // 3 绿
    '#6EC9CB', // 4 青
    '#65AADD', // 5 蓝
    '#EE7AAE', // 6 粉
];

/**
 * 分组名称里的自定义 emoji：文本中保留 fallback emoji 字符，实体指向动态 emoji。
 * 按插入顺序在文本里依次匹配 fallback，删掉字符的实体自然消失（不会错位到别的字符）。
 */
export function buildNameEntities(
    text: string,
    custom: { alt: string; id: string }[],
): { offset: number; length: number; customEmojiId: string }[] {
    const out: { offset: number; length: number; customEmojiId: string }[] = [];
    let from = 0;
    for (const item of custom) {
        if (!item.alt) continue;
        const offset = text.indexOf(item.alt, from);
        if (offset < 0) continue;
        out.push({ offset, length: item.alt.length, customEmojiId: item.id });
        from = offset + item.alt.length;
    }
    return out;
}

/** 从已有的 formattedText 里还原名称自定义 emoji（编辑分组时回填） */
export function collectNameCustomEmoji(
    text: string,
    entities: { offset: number; length: number; type?: { _?: string; custom_emoji_id?: number | string } }[],
): { alt: string; id: string }[] {
    return entities
        .filter((e) => e.type?._ === 'textEntityTypeCustomEmoji')
        .sort((a, b) => a.offset - b.offset)
        .map((e) => ({
            alt: text.slice(e.offset, e.offset + e.length),
            id: String(e.type?.custom_emoji_id ?? ''),
        }))
        .filter((e) => !!e.alt && !!e.id);
}

/** 编辑回填：把「置顶 + 始终包含」合成一份包含列表（去重保序），供 UI 展示 */
export function folderChatIdsAll(
    folder: Pick<chatFolder, 'pinned_chat_ids' | 'included_chat_ids' | 'excluded_chat_ids'>,
) {
    return {
        includeAll: [...new Set([...(folder.pinned_chat_ids ?? []), ...(folder.included_chat_ids ?? [])])],
        pinned: [...(folder.pinned_chat_ids ?? [])],
        excluded: [...(folder.excluded_chat_ids ?? [])],
    };
}

/** 保存：置顶只保留仍在包含里的；included 剔除置顶；排除里与包含重叠的一律剔除 */
export function splitFolderChatIds(
    pinned: number[],
    includeAll: number[],
    excluded: number[],
): FolderChatIds {
    const pinnedKept = [...new Set(pinned.filter((id) => includeAll.includes(id)))];
    const included = [...new Set(includeAll.filter((id) => !pinnedKept.includes(id)))];
    return {
        pinned: pinnedKept,
        included,
        excluded: [...new Set(excluded.filter((id) => !includeAll.includes(id)))],
    };
}

/**
 * 移出分组：TDLib 没有「从分组移除对话」的接口，只能改 chatFolder。
 * - 对话在置顶 / 始终包含里 → 从这两个数组摘掉
 * - 对话是被规则（联系人、群组等）隐式包含的 → 改写为「始终排除」，否则移除后规则又会把它带回来
 */
export function removeFolderChat(
    folder: Pick<chatFolder, 'pinned_chat_ids' | 'included_chat_ids' | 'excluded_chat_ids'>,
    chatId: number,
): FolderChatIds {
    const pinnedAll = folder.pinned_chat_ids ?? [];
    const includedAll = folder.included_chat_ids ?? [];
    const excludedAll = folder.excluded_chat_ids ?? [];
    const wasExplicit = pinnedAll.includes(chatId) || includedAll.includes(chatId);
    const rest = excludedAll.filter((id) => id !== chatId);
    return {
        pinned: pinnedAll.filter((id) => id !== chatId),
        included: includedAll.filter((id) => id !== chatId),
        excluded: wasExplicit ? rest : [...rest, chatId],
    };
}
