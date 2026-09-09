import type {
    ReactionType,
    ReactionType$Input,
    reactionTypeEmoji,
    reactionTypeCustomEmoji,
    reactionTypePaid,
    messageReaction,
    messageReactions,
    availableReaction,
    message,
} from 'tdlib-types';

/* =========================================================================
 * Reaction 工具函数
 * ========================================================================= */

/** 判断 ReactionType 是否为 emoji 类型 */
export function isReactionEmoji(type: ReactionType): type is reactionTypeEmoji {
    return type._ === 'reactionTypeEmoji';
}

/** 判断 ReactionType 是否为自定义 emoji 类型 */
export function isReactionCustomEmoji(type: ReactionType): type is reactionTypeCustomEmoji {
    return type._ === 'reactionTypeCustomEmoji';
}

/** 判断 ReactionType 是否为付费反应类型 */
export function isReactionPaid(type: ReactionType): type is reactionTypePaid {
    return type._ === 'reactionTypePaid';
}

/** 从 ReactionType 获取显示文本（emoji 字符串或自定义 emoji id） */
export function getReactionText(type: ReactionType): string {
    if (isReactionEmoji(type)) return type.emoji;
    if (isReactionCustomEmoji(type)) return type.custom_emoji_id;
    if (isReactionPaid(type)) return '付费回应';
    return '';
}

/** 比较两个 ReactionType 是否相同 */
export function isSameReactionType(a: ReactionType, b: ReactionType): boolean {
    if (a._ !== b._) return false;
    if (a._ === 'reactionTypeEmoji' && b._ === 'reactionTypeEmoji') {
        return a.emoji === b.emoji;
    }
    if (a._ === 'reactionTypeCustomEmoji' && b._ === 'reactionTypeCustomEmoji') {
        return a.custom_emoji_id === b.custom_emoji_id;
    }
    if (a._ === 'reactionTypePaid' && b._ === 'reactionTypePaid') {
        return true;
    }
    return false;
}

/** 从消息中获取 interactionInfo.reactions */
export function getMessageReactions(msg: message): messageReactions | undefined {
    return msg.interaction_info?.reactions;
}

/** 获取消息中的 reaction 列表 */
export function getReactionList(reactions: messageReactions | undefined): messageReaction[] {
    return reactions?.reactions ?? [];
}

/** 检查某个 reaction 是否已被当前用户选中 */
export function isChosenReaction(reactions: messageReactions | undefined, type: ReactionType): boolean {
    if (!reactions?.reactions) return false;
    return reactions.reactions.some(
        (r) => r.is_chosen && isSameReactionType(r.type, type),
    );
}

/** 检查消息是否有任何 reaction */
export function hasReactions(msg: message): boolean {
    const reactions = getMessageReactions(msg);
    return !!reactions && reactions.reactions.length > 0;
}

/** 获取消息的 reaction 总数 */
export function getTotalReactionCount(msg: message): number {
    const reactions = getMessageReactions(msg);
    if (!reactions?.reactions) return 0;
    return reactions.reactions.reduce((sum, r) => sum + r.total_count, 0);
}

/** 获取消息中当前用户已选中的 reaction 列表 */
export function getChosenReactions(msg: message): messageReaction[] {
    const reactions = getMessageReactions(msg);
    if (!reactions?.reactions) return [];
    return reactions.reactions.filter((r) => r.is_chosen);
}

/** 判断 availableReaction 是否需要 Premium */
export function needsPremium(reaction: availableReaction): boolean {
    return reaction.needs_premium === true;
}

/** 获取可用 reaction 的 emoji 文本 */
export function getAvailableReactionEmoji(reaction: availableReaction): string {
    if (isReactionEmoji(reaction.type)) return reaction.type.emoji;
    return '';
}

/** 判断消息是否为频道帖子 */
export function isChannelPost(msg: message): boolean {
    return msg.is_channel_post === true;
}

/** 构造 ReactionTypeInput（从 ReactionType 转换为 Input 类型） */
export function toReactionTypeInput(type: ReactionType): ReactionType$Input {
    switch (type._) {
        case 'reactionTypeEmoji':
            return { _: 'reactionTypeEmoji', emoji: type.emoji };
        case 'reactionTypeCustomEmoji':
            return { _: 'reactionTypeCustomEmoji', custom_emoji_id: type.custom_emoji_id };
        case 'reactionTypePaid':
            return { _: 'reactionTypePaid' };
        default:
            return { _: 'reactionTypeEmoji', emoji: '👍' };
    }
}
