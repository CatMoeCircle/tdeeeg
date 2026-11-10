import type { Router } from 'vue-router';
import type { user } from 'tdlib-types';
import { tdlibSend } from '../session/tdlib';
import { openAnyLink } from '../link/openInternalLink';

/**
 * HTML Widget 消息的主机侧桥接。
 *
 * 沙箱 iframe 里跑的是机器人下发的 HTML，它只能通过 `postMessage` 跟宿主说话
 * （不能直接用 Tauri IPC）。这里定义那套约定并实现宿主侧的能力：
 *
 * - 调用的入口是 `window.TelegramWidget`（与官方小部件 JS 接口同名），
 *   宿主侧的文档模板见 `MessageWidgetContent.vue` 的 `WIDGET_BRIDGE_SCRIPT`；
 * - 方法名 / 语义对齐官方：`request`（向机器人发 query）、`copyText`、
 *   `openTelegramLink` / `openLink`、`ready`、`HapticFeedback`（桌面端空实现）；
 * - 查询走 TDLib `getWidgetQueryAnswer`，`data` 按 TDLib 约定是 base64。
 */

/** 沙箱小部件发起的调用 */
export interface WidgetCallPayload {
    /** 调用序号（宿主原样回带） */
    id: number;
    /** 方法名，见模块注释 */
    method: string;
    /** 位置参数 */
    args?: unknown[];
}

/** 宿主处理调用时的上下文 */
export interface WidgetHostContext {
    /** 所在会话（query 需要） */
    chatId?: number;
    /** 小部件消息 id（query 需要） */
    messageId?: number;
    /** TDLib `can_send_queries`：不允许时 request 直接拒绝 */
    canSendQueries: boolean;
    /** 当前登录用户（小部件展示「查看者」用） */
    viewer: user | undefined;
    router: Router;
}

/** 小部件接口 `TelegramWidget.viewer` 的字段（只暴露非敏感信息） */
export interface WidgetViewer {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
    language_code: string;
    is_premium: boolean;
    is_bot: boolean;
}

/** 当前用户 → 小部件可见的 viewer 对象；未登录 / 资料未就绪时返回 null */
export function widgetViewer(me: user | undefined): WidgetViewer | null {
    if (!me) return null;
    return {
        id: me.id,
        first_name: me.first_name ?? '',
        last_name: me.last_name ?? '',
        username: me.usernames?.active_usernames?.[0] ?? '',
        language_code: me.language_code ?? '',
        is_premium: !!(me as { is_premium?: boolean }).is_premium,
        is_bot: false,
    };
}

/** UTF-8 字符串 → base64（TDLib 的 widget query data 是 base64） */
function toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/**
 * base64 → UTF-8 字符串。
 * 机器人返回的不一定真是 base64（有的直接回 JSON），解不出来就原样返回。
 */
function fromBase64(value: string): string {
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const text = new TextDecoder().decode(bytes);
        // 解出替换字符说明原本就不是 base64
        return text.includes('\uFFFD') ? value : text;
    } catch {
        return value;
    }
}

/** 抛给小部件的错误：`{ code, message }`（小部件里通常只读 code） */
function widgetError(code: string, message?: string): { code: string; message: string } {
    return { code, message: message ?? code };
}

/** 参数长度上限：防止恶意小部件用超大字符串撑爆 base64 / 剪贴板 */
const MAX_ARG_CHARS = 64 * 1024;

/** 取第 i 个参数为字符串 */
function argText(args: unknown[], i: number): string {
    const value = args[i];
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/** 校验要打开的链接：只接受 http(s) / tg / t.me，避免小部件拿 file: 之类的协议 */
function safeLink(raw: string): string | null {
    const url = raw.trim();
    if (!url) return null;
    try {
        const parsed = new URL(url, 'https://t.me');
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            // 没写协议的裸域名（如 t.me/xxx）按 https 处理
            return url.startsWith('http') ? parsed.href : `https://${url}`;
        }
        if (parsed.protocol === 'tg:') return parsed.href;
        return null;
    } catch {
        return null;
    }
}

/**
 * 处理一条小部件调用，返回给小部件的结果（会包进 `tdgramWidgetReply`）。
 *
 * @param ctx  - 宿主上下文（会话 / 消息 / 权限 / 路由）
 * @param call - 小部件发来的调用
 * @returns 方法结果；失败时抛出 `{ code, message }`
 */
export async function handleWidgetCall(ctx: WidgetHostContext, call: WidgetCallPayload): Promise<unknown> {
    const args = Array.isArray(call.args) ? call.args : [];
    switch (call.method) {
        case 'ready':
            return true;

        // 向机器人发 query：TDLib 会转给 bot，答案在 widgetQueryAnswer.data（base64）
        case 'request': {
            if (!ctx.canSendQueries) throw widgetError('QUERIES_DISABLED', 'widget cannot send queries');
            if (!ctx.messageId) throw widgetError('NO_MESSAGE', 'widget message id is unknown');
            const query = argText(args, 0);
            if (query.length > MAX_ARG_CHARS) throw widgetError('QUERY_TOO_LONG');
            const answer = (await tdlibSend({
                _: 'getWidgetQueryAnswer',
                chat_id: ctx.chatId ?? 0,
                message_id: ctx.messageId,
                query_type: { _: 'widgetQueryTypeData', with_wallet: false },
                data: toBase64(query),
            })) as { data?: string } | undefined;
            return { result: fromBase64(answer?.data ?? '') };
        }

        // 公共数据：仅在可见时由宿主调用（TDLib 限制）
        case 'getPublicData': {
            if (!ctx.messageId) throw widgetError('NO_MESSAGE', 'widget message id is unknown');
            const answer = (await tdlibSend({
                _: 'getWidgetPublicData',
                chat_id: ctx.chatId ?? 0,
                message_id: ctx.messageId,
            })) as { data?: string } | undefined;
            return { data: answer?.data ?? '' };
        }

        case 'copyText': {
            const text = argText(args, 0);
            if (!text) throw widgetError('EMPTY_TEXT');
            if (text.length > MAX_ARG_CHARS) throw widgetError('TEXT_TOO_LONG');
            await navigator.clipboard.writeText(text);
            return true;
        }

        // 官方把 Telegram 链接与小部件自己打开的链接分开，宿主侧都按「内部优先，其次外部确认」处理
        case 'openTelegramLink':
        case 'openLink': {
            const link = safeLink(argText(args, 0));
            if (!link) throw widgetError('INVALID_LINK');
            await openAnyLink(link, ctx.router);
            return true;
        }

        default:
            throw widgetError('UNSUPPORTED', `unsupported widget method: ${call.method}`);
    }
}
