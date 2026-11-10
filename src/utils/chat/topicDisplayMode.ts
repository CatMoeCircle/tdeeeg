/**
 * 话题展示模式判定（按对话自身字段，非全局设置）：
 * - list：chat.view_as_topics === true → 话题在对话列表中展示（forumMode）
 * - sidebar：has_forum_sidebar（TDLib 1.8.70+）/ 机器人话题侧栏（userTypeBot.has_topic_sidebar）
 *            → 对话页右侧滑出的话题侧栏（宽 300px、纵向覆盖）
 * - tag ：has_forum_tabs / is_forum（未开 view_as_topics、也不是侧边栏）
 *         或「受管理的」频道私聊群组（is_direct_messages_group && is_administered_direct_messages_group）
 *         或「开启了话题的机器人」私聊（userTypeBot.has_topics，即 bot topics）
 *         → 表现和普通群组一样，话题选择在对话页标签栏
 * - none：非话题群组 / 非受管理的私信群 / 普通机器人 / 普通私聊（普通聊天视图）
 *
 * 对齐 TdExtensions.HasForumTabs：
 * - 论坛 / 机器人话题：getForumTopics，消息 topic_id 用 messageTopicForum
 * - 私信标签：isForum=false → loadDirectMessagesChatTopics
 * - 非受管理私信群：不显示标签栏
 */
import type { chat, supergroup, user } from 'tdlib-types';
import { tdlibSend } from '../session/tdlib';
import { onTdlibUpdate } from '../../store/session/tdlibBus';
import { ensureUser, getReactiveUser } from '../profile/senderInfo';

export type TopicDisplayMode = 'none' | 'list' | 'tag' | 'sidebar';

/** 左侧话题标签栏宽度（图片样式窄栏） */
export const TOPIC_TAG_PANEL_WIDTH = 72;
/** 话题侧边栏浮层宽度 */
export const TOPIC_SIDEBAR_WIDTH = 300;

export interface TopicModeInfo {
    mode: TopicDisplayMode;
    /** 是否为频道私聊群组（话题即与各用户的私信会话；仅受管理时 mode=tag） */
    isDirectMessages: boolean;
    /** 是否为「开启了话题的机器人」私聊（bot topics） */
    isBotChat: boolean;
    /** 机器人用户 id（isBotChat 时为对应 bot，用于 updateUser 失效缓存） */
    botUserId?: number;
    /** 机器人是否允许用户在该对话里创建/删除话题（allows_users_to_create_topics） */
    botAllowsCreateTopics?: boolean;
}

/** 同步粗判（仅 view_as_topics 可直接得出 list；tag / sidebar 需 supergroup） */
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

const NONE: TopicModeInfo = { mode: 'none', isDirectMessages: false, isBotChat: false };

function noneInfo(): TopicModeInfo {
    return { ...NONE };
}

function readSupergroupFlags(sg: supergroup): {
    isForum: boolean;
    hasTabs: boolean;
    hasSidebar: boolean;
    isDm: boolean;
    isAdministeredDm: boolean;
} {
    return {
        isForum: !!(sg as any).is_forum,
        hasTabs: !!(sg as any).has_forum_tabs,
        // 1.8.70 新字段：旧版 TDLib 不返回，undefined 按 false 处理
        hasSidebar: !!(sg as any).has_forum_sidebar,
        isDm: !!(sg as any).is_direct_messages_group,
        isAdministeredDm: !!(sg as any).is_administered_direct_messages_group,
    };
}

/**
 * 机器人话题（bot topics，TDLib 1.8.70+）：与开启了话题的机器人私聊时，
 * 话题走论坛那一套 API（getForumTopics / getForumTopic / messageTopicForum），
 * 布局由 userTypeBot.has_topic_sidebar 决定：侧边栏 / 标签栏。
 * 返回 null 表示不是话题机器人（普通私聊）。
 */
async function resolveBotTopicMode(userId: number): Promise<TopicModeInfo | null> {
    try {
        if (!getReactiveUser(userId)) await ensureUser(userId);
        const u: user | undefined = getReactiveUser(userId);
        if (!u || u.type?._ !== 'userTypeBot') return null;
        const bot = u.type;
        if (!bot.has_topics) return null;
        return {
            mode: bot.has_topic_sidebar ? 'sidebar' : 'tag',
            isDirectMessages: false,
            isBotChat: true,
            botUserId: userId,
            botAllowsCreateTopics: !!bot.allows_users_to_create_topics,
        };
    } catch (e) {
        console.warn('resolveBotTopicMode getUser failed:', e);
        return null;
    }
}

/**
 * 完整判定：list / sidebar / tag / none，并标记是否为频道私聊群组 / 话题机器人。
 * 优先读缓存；必要时 getSupergroup 取 is_forum / has_forum_tabs / has_forum_sidebar /
 * is_direct_messages_group，或 getUser 取 userTypeBot 的话题字段。
 */
export async function resolveTopicMode(chat: chat | undefined | null): Promise<TopicModeInfo> {
    if (!chat) return noneInfo();

    const cached = modeCache.get(chat.id);
    if (cached) return cached;

    // 机器人话题：私聊 + userTypeBot.has_topics → 论坛话题语义（isDirectMessages=false）
    if (chat.type?._ === 'chatTypePrivate') {
        const userId = chat.type.user_id;
        const info = (await resolveBotTopicMode(userId)) ?? { ...NONE, botUserId: userId };
        // 普通私聊也缓存（带上 botUserId）：updateUser 补到话题信息时由下方监听失效
        modeCache.set(chat.id, info);
        return info;
    }

    if (chat.type?._ !== 'chatTypeSupergroup') return noneInfo();

    // 1) view_as_topics === true → list（对话列表内话题）
    if ((chat as any).view_as_topics === true) {
        const info: TopicModeInfo = { mode: 'list', isDirectMessages: false, isBotChat: false };
        modeCache.set(chat.id, info);
        return info;
    }

    // 2) 取 supergroup，对齐 HasForumTabs
    try {
        const sg = await tdlibSend({
            _: 'getSupergroup',
            supergroup_id: chat.type.supergroup_id,
        }) as supergroup;
        const { isForum, hasTabs, hasSidebar, isDm, isAdministeredDm } = readSupergroupFlags(sg);

        // 论坛侧边栏（1.8.70+）：话题在对话页右侧侧栏展示，既不是标签栏也不是对话列表
        if (isForum && hasSidebar) {
            const info: TopicModeInfo = { mode: 'sidebar', isDirectMessages: false, isBotChat: false };
            modeCache.set(chat.id, info);
            return info;
        }

        // 论坛标签（has_forum_tabs；is_forum 且未开 list 时也走 tag）
        if (hasTabs || (isForum && (chat as any).view_as_topics !== true)) {
            const info: TopicModeInfo = { mode: 'tag', isDirectMessages: false, isBotChat: false };
            modeCache.set(chat.id, info);
            return info;
        }

        // 频道私聊群组：仅「受管理」时显示标签栏
        if (isDm) {
            const info: TopicModeInfo = {
                mode: isAdministeredDm ? 'tag' : 'none',
                isDirectMessages: true,
                isBotChat: false,
            };
            modeCache.set(chat.id, info);
            return info;
        }
    } catch (e) {
        console.warn('resolveTopicMode getSupergroup failed:', e);
    }

    const info: TopicModeInfo = { mode: 'none', isDirectMessages: false, isBotChat: false };
    modeCache.set(chat.id, info);
    return info;
}

/**
 * 机器人话题开关变化时失效缓存：TDLib 先下发对话、后补用户资料，
 * 或者机器人在使用过程中开启了话题，都需要下次重新判定。
 */
onTdlibUpdate('user', (update) => {
    if (update._ !== 'updateUser' && update._ !== 'updateNewUser') return;
    const u = (update as any).user as user | undefined;
    if (!u || u.type?._ !== 'userTypeBot') return;
    const bot = u.type;
    const nextMode: TopicDisplayMode = bot.has_topics
        ? (bot.has_topic_sidebar ? 'sidebar' : 'tag')
        : 'none';
    for (const [chatId, info] of modeCache) {
        if (info.botUserId !== u.id) continue;
        if (info.mode !== nextMode || !!info.botAllowsCreateTopics !== !!bot.allows_users_to_create_topics) {
            modeCache.delete(chatId);
        }
    }
});

/** 兼容旧签名：只取展示模式 */
export async function resolveTopicDisplayMode(chat: chat | undefined | null): Promise<TopicDisplayMode> {
    return (await resolveTopicMode(chat)).mode;
}

/** 是否为频道私聊群组（读缓存；未判定过则 false，需先 resolveTopicMode） */
export function isDirectMessagesChatCached(chatId: number): boolean {
    return !!modeCache.get(chatId)?.isDirectMessages;
}

/** 是否为话题机器人私聊（读缓存；未判定过则 false，需先 resolveTopicMode） */
export function isBotTopicsChatCached(chatId: number): boolean {
    return !!modeCache.get(chatId)?.isBotChat;
}

/** 清除缓存（chat / supergroup / user 更新时可调用） */
export function clearTopicDisplayModeCache(chatId?: number) {
    if (chatId === undefined) modeCache.clear();
    else modeCache.delete(chatId);
}
