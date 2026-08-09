/**
 * 下载优先级常量（TDLib priority，取值 1-32，数值越大越先下载）。
 *
 * 语义分层（与需求表对齐）：
 * - 1    最低档：缩略图、头像、占位、封面、StoryCell/StoryContent 封面、共享媒体列表缩略图
 * - 8    反应动画的环绕特效（AroundAnimation；中心动画本身走 15/16）
 * - 15   延迟加载源"已可见但未播放"，及 CustomEmoji/AnimatedEmoji/ReactionFileSource
 * - 16   默认档：正常内容加载（图片、贴纸、背景、内联结果、应用更新等）、内联贴纸回复、主题
 * - 29-32 用户主动操作 / 正在播放（数字越小越次要）
 */
export const DL_PRIORITY = {
    /** 最低档：缩略图、头像、占位、封面、Story 封面、共享媒体列表缩略图 */
    THUMBNAIL: 1,
    /** 反应动画的环绕特效（AroundAnimation；中心动画本身走 15/16） */
    REACTION_AROUND: 8,
    /** 延迟加载源"已可见但未播放"，及 CustomEmoji/AnimatedEmoji/ReactionFileSource */
    LAZY_VISIBLE: 15,
    /** 默认档：正常内容加载（图片、贴纸、背景、内联结果、应用更新等）、内联贴纸回复、主题 */
    DEFAULT: 16,
    /** 用户主动操作低段（次要的用户下载） */
    USER_ACTIVE_LOW: 29,
    /** 用户主动操作（手势触发的下载，如点击媒体下载按钮） */
    USER_ACTIVE: 30,
    /** 用户主动操作高段（正在播放 / 边下边播等优先下载） */
    USER_PLAYING: 32,
} as const;

export type DownloadPriority = number;
