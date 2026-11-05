/**
 * 下载优先级常量（TDLib priority，取值 1-32，数值越大越先下载）。
 *
 * 语义分层（与需求表对齐）：
 * - 1    真正可丢弃的装饰性动画（AroundAnimation 等）
 * - 8    反应动画的环绕特效
 * - 15   延迟加载源"已可见但未播放"，及 CustomEmoji/AnimatedEmoji/ReactionFileSource
 * - 16   默认档：正常内容加载（图片、贴纸、背景、内联结果、应用更新等）
 * - 25   缩略图/头像/封面：体积很小但决定「界面是否看起来加载完」，
 *        必须高于正文媒体（16），否则大图会把缩略图饿死，气泡长期灰块/模糊图
 * - 29-32 用户主动操作 / 正在播放（数字越大越先）
 */
export const DL_PRIORITY = {
    /** 可丢弃的装饰动画（最低） */
    REACTION_AROUND: 8,
    /** 延迟加载源"已可见但未播放"，及 CustomEmoji/AnimatedEmoji/ReactionFileSource */
    LAZY_VISIBLE: 15,
    /** 默认档：正常内容加载（图片、贴纸、背景、内联结果、应用更新等） */
    DEFAULT: 16,
    /**
     * 缩略图 / 头像 / 封面 / 占位图：
     * 文件小、决定列表与气泡「是否像加载完了」，优先级必须高于 DEFAULT。
     */
    THUMBNAIL: 25,
    /** 用户主动操作低段（次要的用户下载） */
    USER_ACTIVE_LOW: 29,
    /** 用户主动操作（手势触发的下载，如点击媒体下载按钮） */
    USER_ACTIVE: 30,
    /** 用户主动操作高段（正在播放 / 边下边播等优先下载） */
    USER_PLAYING: 32,
} as const;

export type DownloadPriority = number;
