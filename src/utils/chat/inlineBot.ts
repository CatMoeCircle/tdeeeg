import { tdlibSend } from '../session/tdlib';
import type {
    chat,
    file,
    InlineQueryResult,
    InputMessageReplyTo$Input,
    MessageTopic$Input,
    message,
    minithumbnail,
    thumbnail,
    user,
} from 'tdlib-types';

/**
 * 内联机器人（inline bot）公共逻辑。
 *
 * 数据流与官方客户端一致：
 *   输入框文本以 "@botusername 查询词" 开头
 *     → searchPublicChat / 已加载聊天缓存解析机器人 user id
 *     → getInlineQueryResults 拉取结果（next_offset 分页）
 *     → 面板展示
 *     → sendInlineQueryResultMessage 发送选中结果
 *
 * 本文件只做「解析 / 机器人解析 / 取结果 / 发送」与结果到渲染模型的转换，
 * 不包含任何 Vue 组件状态，方便面板与输入框复用。
 */

/** 输入框里识别出的一条内联机器人查询 */
export interface InlineBotQuery {
    /** 机器人用户名（不含 @，保留用户输入的大小写） */
    username: string;
    /** @用户名 之后的查询词（可能为空：仅 @机器人 时展示默认结果） */
    query: string;
}

/**
 * 解析输入框文本。
 *
 * 仅在「整段文本以 @用户名 开头」时视为内联查询——与官方客户端一致：
 * 用户名之后的内容（含换行）全部作为查询词；用户名前有其他文字时不算。
 */
export function parseInlineBotQuery(text: string): InlineBotQuery | null {
    const match = /^@([A-Za-z][A-Za-z0-9_]{2,31})(?:[ \t]+([\s\S]*))?$/.exec(text);
    if (!match) return null;
    return { username: match[1], query: (match[2] ?? '').trimEnd() };
}

/** 解析后的机器人（user 用于面板头部头像/名称展示） */
export interface ResolvedInlineBot {
    userId: number;
    user: user;
}

export type InlineBotResolveFailure = 'notFound' | 'notInlineBot';

export interface InlineBotResolveResult {
    bot?: ResolvedInlineBot;
    failure?: InlineBotResolveFailure;
}

/** 机器人缓存：用户名（小写）→ 解析结果；解析失败不缓存，便于用户改名后重试 */
const botCache = new Map<string, ResolvedInlineBot>();
/** 同一用户名的并发解析合并成一次请求 */
const botPending = new Map<string, Promise<InlineBotResolveResult>>();

/** 用户的任一活跃用户名是否等于指定用户名（TDLib 用户名大小写不敏感） */
function userHasUsername(u: user, username: string): boolean {
    const wanted = username.toLowerCase();
    return (u.usernames?.active_usernames ?? []).some((n) => n.toLowerCase() === wanted);
}

/** 从对话类型里取私聊的 user id（其他对话类型没有该字段） */
function privateUserIdOf(c: chat): number | undefined {
    return c.type?._ === 'chatTypePrivate' ? c.type.user_id : undefined;
}

/**
 * 解析内联机器人用户名 → user id。
 *
 * 顺序与任务约定一致：先 searchPublicChat（最直接），失败再查本地已加载聊天
 * （searchChats）与服务器搜索（searchChatsOnServer）兜底，逐个取 getChat + getUser
 * 校验「是机器人 + 用户名匹配」。
 */
export function resolveInlineBot(username: string): Promise<InlineBotResolveResult> {
    const key = username.toLowerCase();
    const cached = botCache.get(key);
    if (cached) return Promise.resolve({ bot: cached });
    const pending = botPending.get(key);
    if (pending) return pending;
    const task = doResolveInlineBot(username).finally(() => botPending.delete(key));
    botPending.set(key, task);
    return task;
}

async function doResolveInlineBot(username: string): Promise<InlineBotResolveResult> {
    const chatIds: number[] = [];

    // 1) 公开用户名直接查找（机器人一般都有公开用户名）
    try {
        const c = await tdlibSend({ _: 'searchPublicChat', username });
        if (c?.id) chatIds.push(c.id);
    } catch {
        // 未找到时 TDLib 抛错，继续走兜底搜索
    }

    // 2) 本地已加载聊天 + 服务器搜索兜底（部分机器人在缓存里但 searchPublicChat 暂时失败）
    if (chatIds.length === 0) {
        for (const search of [
            () => tdlibSend({ _: 'searchChats', query: username, limit: 20 }),
            () => tdlibSend({ _: 'searchChatsOnServer', query: username, limit: 20 }),
        ]) {
            try {
                const res = await search();
                chatIds.push(...(res.chat_ids ?? []));
            } catch {
                // 单个搜索失败不影响后续兜底
            }
        }
    }

    /** 找到了该用户名的私聊，但对方不是机器人（或机器人不支持内联） */
    let usernameFound = false;
    for (const id of [...new Set(chatIds)]) {
        let c: chat;
        try {
            c = await tdlibSend({ _: 'getChat', chat_id: id });
        } catch {
            continue;
        }
        const userId = privateUserIdOf(c);
        if (userId === undefined) continue;
        let u: user;
        try {
            u = await tdlibSend({ _: 'getUser', user_id: userId });
        } catch {
            continue;
        }
        if (u?.type?._ !== 'userTypeBot' || !userHasUsername(u, username)) continue;
        usernameFound = true;
        if (!u.type.is_inline) continue;
        const bot: ResolvedInlineBot = { userId, user: u };
        botCache.set(username.toLowerCase(), bot);
        return { bot };
    }

    return { failure: usernameFound ? 'notInlineBot' : 'notFound' };
}

/**
 * 分页 offset 前进判断。
 * next 为空或与 current 相同（机器人没有前进）时返回空串，表示没有更多结果，
 * 调用方据此停止继续请求，避免对同一页无限翻页。
 */
export function advanceInlineOffset(current: string, next: string): string {
    return next && next !== current ? next : '';
}

/**
 * 清空机器人解析缓存（user id / 用户名属于当前登录账号）。
 * 账号切换、退出登录后应调用一次；否则会拿着旧账号的 user id 去查询而失败。
 */
export function resetInlineBotCache(): void {
    botCache.clear();
    botPending.clear();
}

/** 结果类型（去掉 inlineQueryResult 前缀），用于面板挑选图标/角标 */
export type InlineResultKind =
    | 'article'
    | 'contact'
    | 'location'
    | 'venue'
    | 'game'
    | 'animation'
    | 'audio'
    | 'document'
    | 'photo'
    | 'sticker'
    | 'video'
    | 'voiceNote';

/**
 * 结果的可渲染模型。
 *
 * 缩略图策略：thumb 是可直接下载的图片文件（MPEG4 缩略图浏览器无法用 <img> 展示，
 * 构建模型时已剔除）；preview 是 minithumbnail 的 base64 数据，先渲染它避免灰块，
 * 下载完成后再换成清晰缩略图（见 InlineResultsPanel）。
 */
export interface InlineResultModel {
    /** 结果 id（sendInlineQueryResultMessage.result_id） */
    id: string;
    /** 所属查询的 inline_query_id（sendInlineQueryResultMessage.query_id） */
    queryId: string;
    kind: InlineResultKind;
    title: string;
    description: string;
    /** 可下载缩略图文件 */
    thumb?: file;
    /** 即时可显示的低清预览（data URL） */
    preview?: string;
}

/** 一页查询结果 */
export interface InlineQueryPage {
    /** 本次查询的唯一标识；发送时必须带上与结果同一次查询的 id */
    queryId: string;
    results: InlineResultModel[];
    /** 下一页 offset；空串表示没有更多 */
    nextOffset: string;
    /** 机器人建议显示在结果上方的按钮文案；无则为空 */
    buttonText: string;
}

/** minithumbnail → data URL（浏览器可直接作为 <img src>） */
function previewOf(m?: minithumbnail): string | undefined {
    return m?.data ? `data:image/jpeg;base64,${m.data}` : undefined;
}

/**
 * 挑选可用缩略图。
 * MPEG4 缩略图（动画/视频常见）不能直接给 <img>，此时只保留 minithumbnail 预览。
 */
function thumbOf(t?: thumbnail): file | undefined {
    if (!t?.file || t.format?._ === 'thumbnailFormatMpeg4') return undefined;
    return t.file;
}

/** 从 photo 的多种尺寸里挑适合网格展示的一档（≥320px 的最小档，避免下载原图） */
function photoThumbOf(p?: { sizes?: { width: number; photo: file }[] }): file | undefined {
    const sizes = p?.sizes;
    if (!sizes?.length) return undefined;
    const sorted = [...sizes].sort((a, b) => a.width - b.width);
    return (sorted.find((s) => s.width >= 320) ?? sorted[sorted.length - 1])?.photo;
}

/** 时长显示（秒 → m:ss，非用户可见文案，跨语言一致） */
function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

/** 坐标显示（非用户可见文案） */
function formatCoordinates(location: { latitude: number; longitude: number }): string {
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
}

/** 把一条 TDLib 内联结果转成面板可渲染的模型；未识别的类型也保留可发送的 id */
function toResultModel(r: InlineQueryResult, queryId: string): InlineResultModel {
    const model = (kind: InlineResultKind, title: string, description: string, extra: Partial<InlineResultModel> = {}) => ({
        id: r.id,
        queryId,
        kind,
        title,
        description,
        ...extra,
    });

    switch (r._) {
        case 'inlineQueryResultArticle':
            return model('article', r.title, r.description, { thumb: thumbOf(r.thumbnail) });
        case 'inlineQueryResultContact':
            return model(
                'contact',
                [r.contact.first_name, r.contact.last_name].filter(Boolean).join(' ') || r.contact.phone_number,
                r.contact.phone_number,
                { thumb: thumbOf(r.thumbnail) },
            );
        case 'inlineQueryResultLocation':
            return model('location', r.title, formatCoordinates(r.location), { thumb: thumbOf(r.thumbnail) });
        case 'inlineQueryResultVenue':
            return model('venue', r.venue.title, r.venue.address, { thumb: thumbOf(r.thumbnail) });
        case 'inlineQueryResultGame':
            return model('game', r.game.title, r.game.description, {
                thumb: photoThumbOf(r.game.photo),
                preview: previewOf(r.game.photo?.minithumbnail),
            });
        case 'inlineQueryResultAnimation':
            return model('animation', r.title, formatDuration(r.animation.duration), {
                thumb: thumbOf(r.animation.thumbnail),
                preview: previewOf(r.animation.minithumbnail),
            });
        case 'inlineQueryResultAudio':
            return model('audio', r.audio.title || r.audio.file_name, r.audio.performer, {
                thumb: thumbOf(r.audio.album_cover_thumbnail ?? r.audio.external_album_covers?.[0]),
                preview: previewOf(r.audio.album_cover_minithumbnail),
            });
        case 'inlineQueryResultDocument':
            return model('document', r.title, r.description, {
                thumb: thumbOf(r.document.thumbnail),
                preview: previewOf(r.document.minithumbnail),
            });
        case 'inlineQueryResultPhoto':
            return model('photo', r.title, r.description, {
                thumb: photoThumbOf(r.photo),
                preview: previewOf(r.photo?.minithumbnail),
            });
        case 'inlineQueryResultSticker':
            return model('sticker', r.sticker.emoji, '', { thumb: thumbOf(r.sticker.thumbnail) });
        case 'inlineQueryResultVideo':
            return model('video', r.title, r.description, {
                thumb: thumbOf(r.video.thumbnail),
                preview: previewOf(r.video.minithumbnail),
            });
        case 'inlineQueryResultVoiceNote':
            return model('voiceNote', r.title, formatDuration(r.voice_note.duration));
        default:
            // 新版本 TDLib 新增的结果类型：仍然列出并允许发送（id 一定存在）
            return model('article', '', '');
    }
}

/**
 * 拉取一页内联查询结果。
 *
 * @param bot     已解析的机器人
 * @param chatId  查询发生的聊天（部分机器人按聊天裁剪结果；未知时传 0）
 * @param query   查询词，空串表示「仅 @机器人」的默认结果
 * @param offset  分页 offset；首页传空串
 */
export async function fetchInlineQueryPage(params: {
    bot: ResolvedInlineBot;
    chatId: number;
    query: string;
    offset: string;
}): Promise<InlineQueryPage> {
    const res = await tdlibSend({
        _: 'getInlineQueryResults',
        bot_user_id: params.bot.userId,
        chat_id: params.chatId,
        query: params.query,
        offset: params.offset,
    });
    const queryId = res.inline_query_id;
    return {
        queryId,
        results: (res.results ?? []).map((r) => toResultModel(r, queryId)),
        nextOffset: res.next_offset ?? '',
        buttonText: res.button?.text ?? '',
    };
}

/**
 * 发送选中的内联结果。
 *
 * 注意参数名以 tdlib-types 为准：话题用 topic_id（MessageTopic$Input）、回复用 reply_to
 * （InputMessageReplyTo$Input）；hide_via_bot 只有官方指定的「动画/图片搜索机器人」才允许
 * 置 true，这里不启用。
 */
export async function sendInlineQueryResult(params: {
    chatId: number;
    queryId: string;
    resultId: string;
    /** 论坛话题 / 频道私信 / 评论线程；普通聊天不传 */
    topicId?: MessageTopic$Input;
    /** 回复目标（输入框处于回复/引用回复状态时由父组件换算后传入） */
    replyTo?: InputMessageReplyTo$Input;
}): Promise<message> {
    return tdlibSend({
        _: 'sendInlineQueryResultMessage',
        chat_id: params.chatId,
        query_id: params.queryId,
        result_id: params.resultId,
        topic_id: params.topicId,
        reply_to: params.replyTo,
    });
}

/**
 * 把 TDLib 错误对象（不是 Error 实例，直接带 message/code）转成一行可读文本。
 * 用于 toast / 面板错误态。
 */
export function inlineBotErrorText(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
        const msg = String((error as { message?: unknown }).message ?? '');
        if (msg) return msg;
    }
    return error instanceof Error ? error.message : String(error ?? '');
}
