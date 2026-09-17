/**
 * 下载管理器标签词表与推断规则。
 *
 * 标签挂在 DownloadItem.tags 上，用于：
 * - 行内展示多枚标签 chip
 * - 标签过滤器（默认隐藏通用资源 / 自动下载图片）
 * - 分区（流式传输未完成项独立成组，不进「已暂停」）
 */

export const DL_TAG = {
    // ── 资源类型 ──
    VIDEO: "视频",
    IMAGE: "图片",
    THUMB: "缩略图",
    MUSIC: "音乐",
    VOICE: "语音",
    FILE: "文件",
    ANIM: "动图",
    UPLOAD: "上传",
    // ── 分类 / 属性 ──
    AUTO: "自动下载",
    STREAM: "流式传输",
    VIDEO_COVER: "视频封面",
    MUSIC_COVER: "音乐封面",
    STORY_COVER: "动态封面",
    STORY: "动态",
    AVATAR: "用户头像",
    HD_AVATAR: "高清头像",
    STICKER: "贴纸",
    EMOJI: "emoji",
    PROFILE: "资料页",
    GIFT: "礼物",
} as const;

export type DownloadTag = (typeof DL_TAG)[keyof typeof DL_TAG] | string;

/** 过滤器虚拟键（不是资源本身的标签，仅用于筛选开关） */
export const FILTER_KEY = {
    GENERIC: "通用资源",
    AUTO_VIDEO: "自动下载视频",
    AUTO_IMAGE: "自动下载图片",
} as const;

/** 默认隐藏的通用类标签（过滤器未开启时不展示） */
export const GENERIC_TAGS: ReadonlySet<string> = new Set([
    DL_TAG.THUMB,
    DL_TAG.VIDEO_COVER,
    DL_TAG.MUSIC_COVER,
    DL_TAG.STORY_COVER,
    DL_TAG.STICKER,
    DL_TAG.EMOJI,
    DL_TAG.AVATAR,
    DL_TAG.HD_AVATAR,
    DL_TAG.GIFT,
]);

/** 资源类型标签：过滤器按这些键做「类型可见性」 */
export const RESOURCE_TAGS: ReadonlySet<string> = new Set([
    DL_TAG.VIDEO,
    DL_TAG.IMAGE,
    DL_TAG.MUSIC,
    DL_TAG.VOICE,
    DL_TAG.FILE,
    DL_TAG.ANIM,
    DL_TAG.UPLOAD,
    DL_TAG.THUMB,
    DL_TAG.STICKER,
    DL_TAG.EMOJI,
    DL_TAG.AVATAR,
]);

/** 默认开启的过滤器 */
export const DEFAULT_FILTER_KEYS: ReadonlySet<string> = new Set([
    DL_TAG.VIDEO,
    DL_TAG.IMAGE,
    DL_TAG.MUSIC,
    DL_TAG.VOICE,
    DL_TAG.FILE,
    DL_TAG.ANIM,
    DL_TAG.UPLOAD,
    DL_TAG.STREAM,
    FILTER_KEY.AUTO_VIDEO,
]);

/** 过滤器 UI 中展示的选项顺序 */
export const FILTER_OPTIONS: Array<{ key: string; label: string }> = [
    { key: DL_TAG.VIDEO, label: "视频" },
    { key: DL_TAG.IMAGE, label: "图片" },
    { key: DL_TAG.MUSIC, label: "音乐" },
    { key: DL_TAG.FILE, label: "文件" },
    { key: DL_TAG.UPLOAD, label: "上传" },
    { key: DL_TAG.STREAM, label: "流式传输" },
    { key: FILTER_KEY.AUTO_VIDEO, label: "自动下载视频" },
    { key: FILTER_KEY.AUTO_IMAGE, label: "自动下载图片" },
    { key: FILTER_KEY.GENERIC, label: "通用资源" },
    { key: DL_TAG.VIDEO_COVER, label: "视频封面" },
    { key: DL_TAG.MUSIC_COVER, label: "音乐封面" },
    { key: DL_TAG.STORY_COVER, label: "动态封面" },
    { key: DL_TAG.AVATAR, label: "用户头像" },
    { key: DL_TAG.STICKER, label: "贴纸" },
    { key: DL_TAG.EMOJI, label: "emoji" },
    { key: DL_TAG.STORY, label: "动态" },
    { key: DL_TAG.PROFILE, label: "资料页" },
];

export type DownloadFileTypeLike =
    | "document"
    | "photo"
    | "video"
    | "audio"
    | "voice"
    | "animation"
    | "sticker"
    | "avatar"
    | "other"
    | string;

export interface BuildTagsInput {
    fileType: DownloadFileTypeLike;
    hiddenCategory?: string | null;
    isGeneric?: boolean;
    isAutoPhoto?: boolean;
    isStreaming?: boolean;
    isUpload?: boolean;
    /** 其他画质视频的分辨率标签，如 720p */
    quality?: string | null;
    /** 调用方附加标签（资料页 / 动态 / 高清头像…） */
    extraTags?: string[] | null;
}

function pushTag(list: string[], tag: string | null | undefined) {
    if (tag && !list.includes(tag)) list.push(tag);
}

function resourceTagForFileType(fileType: DownloadFileTypeLike): string | null {
    switch (fileType) {
        case "video":
            return DL_TAG.VIDEO;
        case "photo":
            return DL_TAG.IMAGE;
        case "audio":
            return DL_TAG.MUSIC;
        case "voice":
            return DL_TAG.VOICE;
        case "animation":
            return DL_TAG.ANIM;
        case "sticker":
            return DL_TAG.STICKER;
        case "avatar":
            return DL_TAG.AVATAR;
        case "document":
            return DL_TAG.FILE;
        case "other":
            return null;
        default:
            return null;
    }
}

/** 缩略图/封面类 hidden_category：只打缩略图相关标签，不打 图片/视频 资源标签 */
function isThumbCategory(category: string | null | undefined): boolean {
    return (
        category === "video_cover" ||
        category === "music_cover" ||
        category === "story_cover"
    );
}

/**
 * 按注册上下文构建下载项标签。
 *
 * 规则摘要：
 * - 视频封面 → 视频封面 + 缩略图
 * - 音乐封面 → 音乐封面 + 缩略图
 * - 动态封面 → 动态封面 + 缩略图 + 动态
 * - 缩略图资源只有 缩略图，不带 图片/视频
 * - 视频 → 视频；可流式 → +流式传输；自动下载 → +自动下载
 * - 其他画质视频 → 视频 + <分辨率> + 流式传输
 * - 图片原图 → 图片；自动下载图片 → 图片 + 自动下载
 * - 用户头像 → 用户头像；big → +高清头像；动态 → +动态
 * - 贴纸 / emoji / 上传 / 音乐 等按类型 + 调用方 extraTags
 */
export function buildDownloadTags(input: BuildTagsInput): string[] {
    const tags: string[] = [];
    const {
        fileType,
        hiddenCategory,
        isAutoPhoto,
        isStreaming,
        isUpload,
        quality,
        extraTags,
    } = input;

    if (isThumbCategory(hiddenCategory)) {
        if (hiddenCategory === "video_cover") pushTag(tags, DL_TAG.VIDEO_COVER);
        if (hiddenCategory === "music_cover") pushTag(tags, DL_TAG.MUSIC_COVER);
        if (hiddenCategory === "story_cover") {
            pushTag(tags, DL_TAG.STORY_COVER);
            pushTag(tags, DL_TAG.STORY);
        }
        pushTag(tags, DL_TAG.THUMB);
    } else if (hiddenCategory === "avatar" || fileType === "avatar") {
        pushTag(tags, DL_TAG.AVATAR);
    } else if (hiddenCategory === "sticker" || fileType === "sticker") {
        pushTag(tags, DL_TAG.STICKER);
    } else if (hiddenCategory === "emoji") {
        pushTag(tags, DL_TAG.EMOJI);
    } else if (hiddenCategory === "gift") {
        pushTag(tags, DL_TAG.GIFT);
        pushTag(tags, DL_TAG.STICKER);
    } else if (hiddenCategory === "animation") {
        pushTag(tags, DL_TAG.ANIM);
    } else {
        const resource = resourceTagForFileType(fileType);
        if (resource) pushTag(tags, resource);
        // 兜底：generic 且未识别分类
        if (!resource && input.isGeneric) pushTag(tags, DL_TAG.THUMB);
    }

    if (isUpload) pushTag(tags, DL_TAG.UPLOAD);
    if (isAutoPhoto) {
        pushTag(tags, DL_TAG.AUTO);
        // 自动下载图片：确保有图片资源标签（封面除外）
        if (!tags.includes(DL_TAG.THUMB) && !isThumbCategory(hiddenCategory)) {
            pushTag(tags, DL_TAG.IMAGE);
        }
    }
    if (isStreaming) pushTag(tags, DL_TAG.STREAM);
    if (quality) {
        pushTag(tags, quality);
        // 其他质量视频：视频 + 质量 + 流式传输（用户规则）
        if (!tags.includes(DL_TAG.VIDEO)) pushTag(tags, DL_TAG.VIDEO);
        pushTag(tags, DL_TAG.STREAM);
    }
    if (extraTags) {
        for (const t of extraTags) pushTag(tags, t);
    }
    return tags;
}

export interface TaggableItem {
    tags?: string[] | null;
    file_type: string;
    hidden_category?: string | null;
    is_generic?: boolean;
    is_auto_photo?: boolean;
    is_streaming?: boolean;
    is_upload?: boolean;
}

/** 旧记录无 tags 时按遗留字段推断；有 tags 则原样返回（并去重） */
export function resolveItemTags(item: TaggableItem): string[] {
    if (item.tags && item.tags.length > 0) {
        return Array.from(new Set(item.tags));
    }
    return buildDownloadTags({
        fileType: item.file_type,
        hiddenCategory: item.hidden_category,
        isGeneric: item.is_generic,
        isAutoPhoto: item.is_auto_photo,
        isStreaming: item.is_streaming,
        isUpload: item.is_upload,
    });
}

export function itemHasTag(item: TaggableItem, tag: string): boolean {
    return resolveItemTags(item).includes(tag);
}

/** 是否属于默认隐藏的通用资源 */
export function isGenericItem(item: TaggableItem): boolean {
    if (item.is_generic) return true;
    return resolveItemTags(item).some((t) => GENERIC_TAGS.has(t));
}

/** 是否为自动下载图片（默认隐藏） */
export function isAutoPhotoItem(item: TaggableItem): boolean {
    if (item.is_auto_photo) return true;
    const tags = resolveItemTags(item);
    return tags.includes(DL_TAG.AUTO) && tags.includes(DL_TAG.IMAGE) && !tags.includes(DL_TAG.VIDEO);
}

/** 是否为自动下载视频（默认展示） */
export function isAutoVideoItem(item: TaggableItem): boolean {
    const tags = resolveItemTags(item);
    return tags.includes(DL_TAG.AUTO) && (tags.includes(DL_TAG.VIDEO) || tags.includes(DL_TAG.ANIM));
}

/** 未完成的流式传输项（独立分区，不进已暂停） */
export function isIncompleteStreaming(item: TaggableItem & { is_completed?: boolean }): boolean {
    if (item.is_completed) return false;
    return resolveItemTags(item).includes(DL_TAG.STREAM) || !!item.is_streaming;
}

/**
 * 标签过滤：项是否应展示。
 * - 通用资源：默认隐藏，需开启 FILTER_KEY.GENERIC 或对应细分标签
 * - 自动下载图片：默认隐藏
 * - 自动下载视频：默认展示，可单独关闭
 * - 资源类型：至少命中一个已启用类型
 */
export function isItemVisibleByFilter(
    item: TaggableItem,
    enabled: ReadonlySet<string>,
): boolean {
    const tags = resolveItemTags(item);
    const generic = isGenericItem(item);
    const autoPhoto = isAutoPhotoItem(item);
    const autoVideo = isAutoVideoItem(item);

    if (generic) {
        const genericAllowed =
            enabled.has(FILTER_KEY.GENERIC) ||
            tags.some((t) => GENERIC_TAGS.has(t) && enabled.has(t)) ||
            // 资料页/动态等伴随通用标签时，细分开关也可放行
            tags.some((t) => enabled.has(t) && (t === DL_TAG.PROFILE || t === DL_TAG.STORY));
        if (!genericAllowed) return false;
    }

    if (autoPhoto && !enabled.has(FILTER_KEY.AUTO_IMAGE)) return false;
    if (autoVideo && !enabled.has(FILTER_KEY.AUTO_VIDEO)) return false;

    const resources = tags.filter((t) => RESOURCE_TAGS.has(t));
    if (resources.length === 0) {
        // 无资源类型标签：只要不是被上面规则隐藏，就展示（例如仅有流式传输）
        return true;
    }
    // 缩略图/封面/贴纸等通用资源已由上面 generic 闸门处理；
    // 此处对普通资源类型要求至少一个启用。
    const nonGenericResources = resources.filter((t) => !GENERIC_TAGS.has(t));
    if (nonGenericResources.length === 0) return true;
    return nonGenericResources.some((t) => enabled.has(t));
}

/** 标签 chip 展示样式 */
export function tagChipClass(tag: string): string {
    switch (tag) {
        case DL_TAG.STREAM:
            return "text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/40";
        case DL_TAG.AUTO:
            return "text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/40";
        case DL_TAG.UPLOAD:
            return "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40";
        case DL_TAG.THUMB:
        case DL_TAG.VIDEO_COVER:
        case DL_TAG.MUSIC_COVER:
        case DL_TAG.STORY_COVER:
            return "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40";
        case DL_TAG.AVATAR:
        case DL_TAG.HD_AVATAR:
            return "text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/40";
        case DL_TAG.STICKER:
        case DL_TAG.EMOJI:
        case DL_TAG.GIFT:
            return "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40";
        case DL_TAG.VIDEO:
            return "text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/40";
        case DL_TAG.IMAGE:
            return "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40";
        case DL_TAG.MUSIC:
            return "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40";
        case DL_TAG.STORY:
        case DL_TAG.PROFILE:
            return "text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40";
        default:
            // 质量标签等
            return "text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800";
    }
}
