/**
 * 话题展示模式判定（按群自身字段，非全局设置）：
 * - list：chat.view_as_topics === true → 话题在对话列表中展示（forumMode）
 * - tag ：has_forum_tabs / is_forum（未开 view_as_topics）
 *         或「受管理的」频道私聊群组（is_direct_messages_group && is_administered_direct_messages_group）
 *         → 表现和普通群组一样，话题选择在对话页标签栏
 * - none：非话题群组 / 非受管理的私信群（普通聊天视图）
 *
 * 对齐 Unigram TdExtensions.HasForumTabs：
 * - 论坛标签：isForum=true → getForumTopics
 * - 私信标签：isForum=false → loadDirectMessagesChatTopics
 * - 非受管理私信群：不显示标签栏
 */
import type { chat, supergroup } from 'tdlib-types';
import { tdlibSend } from './tdlib';

export type TopicDisplayMode = 'none' | 'list' | 'tag';

export interface TopicModeInfo {
    mode: TopicDisplayMode;
    /** 是否为频道私聊群组（话题即与各用户的私信会话；仅受管理时 mode=tag） */
    isDirectMessages: boolean;
}

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

const modeCache = new Map<number, TopicModeInfo>();

function readSupergroupFlags(sg: supergroup): {
    isForum: boolean;
    hasTabs: boolean;
    isDm: boolean;
    isAdministeredDm: boolean;
} {
    return {
        isForum: !!(sg as any).is_forum,
        hasTabs: !!(sg as any).has_forum_tabs,
        isDm: !!(sg as any).is_direct_messages_group,
        isAdministeredDm: !!(sg as any).is_administered_direct_messages_group,
    };
}

/**
 * 完整判定：list / tag / none，并标记是否为频道私聊群组。
 * 优先读缓存；必要时 getSupergroup 取 is_forum / has_forum_tabs / is_direct_messages_group。
 */
export async function resolveTopicMode(chat: chat | undefined | null): Promise<TopicModeInfo> {
    if (!chat || chat.type?._ !== 'chatTypeSupergroup') {
        return { mode: 'none', isDirectMessages: false };
    }

    const cached = modeCache.get(chat.id);
    if (cached) return cached;

    // 1) view_as_topics === true → list（对话列表内话题）
    if ((chat as any).view_as_topics === true) {
        const info: TopicModeInfo = { mode: 'list', isDirectMessages: false };
        modeCache.set(chat.id, info);
        return info;
    }

    // 2) 取 supergroup，对齐 Unigram HasForumTabs
    try {
        const sg = await tdlibSend({
            _: 'getSupergroup',
            supergroup_id: chat.type.supergroup_id,
        }) as supergroup;
        const { isForum, hasTabs, isDm, isAdministeredDm } = readSupergroupFlags(sg);

        // 论坛标签（has_forum_tabs；is_forum 且未开 list 时也走 tag）
        if (hasTabs || (isForum && (chat as any).view_as_topics !== true)) {
            const info: TopicModeInfo = { mode: 'tag', isDirectMessages: false };
            modeCache.set(chat.id, info);
            return info;
        }

        // 频道私聊群组：仅「受管理」时显示标签栏（与 Unigram 一致）
        if (isDm) {
            const info: TopicModeInfo = {
                mode: isAdministeredDm ? 'tag' : 'none',
                isDirectMessages: true,
            };
            modeCache.set(chat.id, info);
            return info;
        }
    } catch (e) {
        console.warn('resolveTopicMode getSupergroup failed:', e);
    }

    const info: TopicModeInfo = { mode: 'none', isDirectMessages: false };
    modeCache.set(chat.id, info);
    return info;
}

/** 兼容旧签名：只取展示模式 */
export async function resolveTopicDisplayMode(chat: chat | undefined | null): Promise<TopicDisplayMode> {
    return (await resolveTopicMode(chat)).mode;
}

/** 是否为频道私聊群组（读缓存；未判定过则 false，需先 resolveTopicMode） */
export function isDirectMessagesChatCached(chatId: number): boolean {
    return !!modeCache.get(chatId)?.isDirectMessages;
}

/** 清除缓存（chat / supergroup 更新时可调用） */
export function clearTopicDisplayModeCache(chatId?: number) {
    if (chatId === undefined) modeCache.clear();
    else modeCache.delete(chatId);
}
