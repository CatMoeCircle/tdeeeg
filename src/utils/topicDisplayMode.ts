/**
 * 话题展示模式判定（按群自身字段，非全局设置）：
 * - list：chat.view_as_topics === true → 话题在对话列表中展示（forumMode）
 * - tag ：chat.view_as_topics === false 且 supergroup 为论坛（is_forum / has_forum_tabs）
 *         → 表现和普通群组一样，话题选择在对话页左侧标签栏
 * - none：非话题群组
 *
 * 注意：is_forum / has_forum_tabs 在 supergroup 上，不在 chat 对象上。
 */
import type { chat, supergroup } from 'tdlib-types';
import { tdlibSend } from './tdlib';

export type TopicDisplayMode = 'none' | 'list' | 'tag';

/** 同步粗判（仅 view_as_topics 可直接得出 list；tag 需 supergroup） */
export function topicDisplayModeSync(chat: chat | undefined | null): TopicDisplayMode | null {
    if (!chat || chat.type?._ !== 'chatTypeSupergroup') return 'none';
    // view_as_topics: true → 明确 list
    if ((chat as any).view_as_topics === true) return 'list';
    // view_as_topics === false 时可能是 tag，也可能是普通群；需 supergroup 确认
    if ((chat as any).view_as_topics === false) return null;
    // 字段缺失 → 需异步确认
    return null;
}

const modeCache = new Map<number, TopicDisplayMode>();

/**
 * 完整判定：list / tag / none。
 * 优先读缓存；必要时 getSupergroup 取 is_forum / has_forum_tabs。
 */
export async function resolveTopicDisplayMode(chat: chat | undefined | null): Promise<TopicDisplayMode> {
    if (!chat || chat.type?._ !== 'chatTypeSupergroup') return 'none';

    const cached = modeCache.get(chat.id);
    if (cached) return cached;

    // 1) view_as_topics === true → list（对话列表内话题）
    if ((chat as any).view_as_topics === true) {
        modeCache.set(chat.id, 'list');
        return 'list';
    }

    // 2) 取 supergroup：is_forum / has_forum_tabs → tag（对话页标签栏）
    try {
        const sg = await tdlibSend({
            _: 'getSupergroup',
            supergroup_id: chat.type.supergroup_id,
        }) as supergroup;
        const isForum = !!(sg as any).is_forum;
        const hasTabs = !!(sg as any).has_forum_tabs;
        // 话题标签栏：论坛群但未开 view_as_topics（表现和普通群组一样，话题选择在对话页）
        if (isForum || hasTabs) {
            modeCache.set(chat.id, 'tag');
            return 'tag';
        }
    } catch (e) {
        console.warn('resolveTopicDisplayMode getSupergroup failed:', e);
    }

    modeCache.set(chat.id, 'none');
    return 'none';
}

/** 清除缓存（chat / supergroup 更新时可调用） */
export function clearTopicDisplayModeCache(chatId?: number) {
    if (chatId === undefined) modeCache.clear();
    else modeCache.delete(chatId);
}
