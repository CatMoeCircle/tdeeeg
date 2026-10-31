import type { ButtonStyle, InlineKeyboardButtonType, LoginUrlInfo } from 'tdlib-types';
import { openUrl } from '@tauri-apps/plugin-opener';
import i18n from '../i18n';
import router from '../router';
import { tdlibSend, ensureLocalFilePath } from './tdlib';
import { toast } from './toast';
import { confirmExternalLink } from '../store/externalLink';
import { resolveInternalLink } from './openInternalLink';
import { confirmAndOpenExternalLink } from './openExternalLink';
import { buildWebAppOpenParameters } from './miniappTheme';
import { useChatStore } from '../store/chat';

/**
 * 按钮点击的公共实现：行内键盘（inlineKeyboardButton）与富文本消息里的按钮
 * （richTextButton / pageBlockButtonRow 的 inlineButton）共用同一套动作分发。
 */

/** 按钮所在消息的上下文（回调查询、登录链接需要 chat/message id） */
export interface InlineButtonContext {
    chatId?: number;
    messageId?: number;
    /** WebApp 按钮的文案（app 发数据时 sendWebAppData 需要） */
    buttonText?: string;
}

/** Telegram 内部链接（t.me / tg://）：在应用内跳转，不会被当作外部链接打开 */
export function isTelegramInternalUrl(url: string): boolean {
    return url.startsWith('https://t.me/') || url.startsWith('https://proxy.t.me/') || url.startsWith('tg://');
}

/** 打开按钮 URL：Telegram 内部链接走应用内跳转，外部链接先确认 */
export async function openButtonUrl(url: string, ctx: InlineButtonContext = {}): Promise<void> {
    try {
        // Telegram 内部链接（t.me / tg://）先在应用内解析跳转
        if (isTelegramInternalUrl(url)) {
            await resolveInternalLink(url, router, { chatId: ctx.chatId });
            return;
        }
        // 外部链接：先询问用户是否跳转外部，确认后再用系统浏览器打开
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('tel:')) {
            await confirmAndOpenExternalLink(url).catch(() => { /* 用户取消，不跳转 */ });
            return;
        }
        await openUrl(url);
    } catch (e) {
        console.error('Open inline button URL failed:', e);
    }
}

/**
 * 打开 Telegram Mini App：
 * 1. openWebApp（TDLib）→ webAppInfo{ launch_id, url }，URL 由 TDLib 提供（含认证数据）
 * 2. 把 URL + launch_id 交给原生 webview 载体加载（SDK 桥协议见 Rust tdlib/miniapp.rs）
 */
export async function openMiniApp(url: string, ctx: InlineButtonContext = {}): Promise<void> {
    try {
        const botUserId = resolveWebAppBotUserId(ctx);
        const res = await tdlibSend({
            _: 'openWebApp',
            chat_id: ctx.chatId ?? 0,
            bot_user_id: botUserId,
            url,
            parameters: buildWebAppOpenParameters(),
        });
        if (!res.url?.url) throw new Error('openWebApp 返回空 URL');
        const chat = ctx.chatId ? useChatStore().chats[ctx.chatId] : undefined;
        const avatarPath = chat?.photo?.small
            ? await ensureLocalFilePath(chat.photo.small).catch(() => null)
            : null;
        const { useMiniAppStore } = await import('../store/miniapp');
        await useMiniAppStore().open(res.url.url, {
            launchId: res.launch_id,
            botUserId,
            chatId: ctx.chatId,
            buttonText: ctx.buttonText ?? '',
            title: chat?.title || 'Mini App',
            avatarPath: avatarPath ?? undefined,
        });
    } catch (e) {
        const err = e as { message?: string };
        console.error('Open Mini App failed:', e);
        await toast.error({
            content: err?.message || i18n.global.t('content.miniAppOpenFailed'),
            placement: 'top-right',
        });
    }
}

/**
 * WebApp 按钮所在的 bot：私聊的 chat.type.user_id 就是 bot id。
 * 群聊里的 WebApp 按钮 / via-bot 解析留待后续（需要消息 sender 上下文）。
 */
function resolveWebAppBotUserId(ctx: InlineButtonContext): number {
    const chatId = ctx.chatId;
    if (!chatId) return 0;
    const chat = useChatStore().chats[chatId];
    if (chat?.type?._ === 'chatTypePrivate') return chat.type.user_id;
    return 0;
}

/** 按 TDLib 按钮类型执行动作 */
export async function runInlineButtonType(
    type: InlineKeyboardButtonType,
    ctx: InlineButtonContext = {},
): Promise<void> {
    switch (type._) {
        case 'inlineKeyboardButtonTypeUrl':
            await openButtonUrl(type.url, ctx);
            break;
        case 'inlineKeyboardButtonTypeWebApp':
            await openMiniApp(type.url, ctx);
            break;
        case 'inlineKeyboardButtonTypeLoginUrl':
            await openLoginUrl(type.id, type.url, ctx);
            break;
        case 'inlineKeyboardButtonTypeCallback':
            await sendCallbackQuery({ _: 'callbackQueryPayloadData', data: type.data }, ctx);
            break;
        case 'inlineKeyboardButtonTypeUser':
            await openUserButton(type.user_id);
            break;
        case 'inlineKeyboardButtonTypeCopyText':
            await copyButtonText(type.text);
            break;
        case 'inlineKeyboardButtonTypeCallbackWithPassword':
            await notSupported('content.notSupportedPasswordCallback');
            break;
        case 'inlineKeyboardButtonTypeCallbackGame':
            await notSupported('content.notSupportedGameCallback');
            break;
        case 'inlineKeyboardButtonTypeSwitchInline':
            await notSupported('content.notSupportedSwitchInline');
            break;
        case 'inlineKeyboardButtonTypeBuy':
            await notSupported('content.notSupportedBuy');
            break;
        default:
            break;
    }
}

/**
 * TDLib ButtonStyle → 按钮配色 class。
 *
 * @param theme 跟随主题色（--app-brand）：富文本消息里的按钮用；消息外的行内键盘
 *              保持 Telegram 原配色（false）。
 */
export function buttonStyleClass(style?: ButtonStyle, theme = false): string {
    switch (style?._) {
        case 'buttonStylePrimary':
            // 主题色淡底 + 主题色文字（半透明，透出气泡背景）
            return theme
                ? 'border-transparent bg-[color-mix(in_srgb,var(--app-brand)_26%,transparent)] text-[var(--app-brand)] hover:bg-[color-mix(in_srgb,var(--app-brand)_34%,transparent)]'
                : 'border-transparent bg-[#298ACF] text-white hover:bg-[#3691D2]';
        case 'buttonStyleDanger':
            return theme
                ? 'border-transparent bg-[color-mix(in_srgb,#E05356_16%,transparent)] text-[#E05356] hover:bg-[color-mix(in_srgb,#E05356_24%,transparent)]'
                : 'border-transparent bg-[#E05356] text-white hover:bg-[#E25D60]';
        case 'buttonStyleSuccess':
            return theme
                ? 'border-transparent bg-[color-mix(in_srgb,#61C752_18%,transparent)] text-[#4FA83F] hover:bg-[color-mix(in_srgb,#61C752_26%,transparent)]'
                : 'border-transparent bg-[#61C752] text-white hover:bg-[#6ACA5C]';
        case 'buttonStyleLink':
            // 链接样式（仅富文本消息）：底色/圆角由按钮自身类提供，这里只管文字色
            return theme ? 'text-[var(--app-brand)]' : 'text-blue-500 dark:text-blue-400';
        default:
            // 默认按钮不使用透明底：主题色调和到不透明的容器底色上 + 主题色文字
            return theme
                ? 'border-transparent bg-[color-mix(in_srgb,var(--app-brand)_14%,var(--app-bg-container))] text-[var(--app-brand)] hover:bg-[color-mix(in_srgb,var(--app-brand)_22%,var(--app-bg-container))]'
                : 'border-gray-300/60 bg-gray-100/80 text-gray-800 hover:bg-gray-200/80 dark:border-white/10 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/15';
    }
}

async function notSupported(key: string): Promise<void> {
    await toast.error({ content: i18n.global.t(key), placement: 'top-right' });
}

async function openLoginUrl(buttonId: number, fallbackUrl: string, ctx: InlineButtonContext) {
    if (!ctx.chatId || !ctx.messageId) {
        await openButtonUrl(fallbackUrl, ctx);
        return;
    }
    try {
        const info = await tdlibSend({
            _: 'getLoginUrlInfo',
            chat_id: ctx.chatId,
            message_id: ctx.messageId,
            button_id: buttonId,
        }) as LoginUrlInfo;

        if (info._ === 'loginUrlInfoOpen' && info.skip_confirmation) {
            await openButtonUrl(info.url, ctx);
            return;
        }

        try {
            await confirmExternalLink(info.url);
        } catch {
            return;
        }

        if (info._ === 'loginUrlInfoOpen') {
            await openButtonUrl(info.url, ctx);
            return;
        }

        const url = await tdlibSend({
            _: 'getLoginUrl',
            chat_id: ctx.chatId,
            message_id: ctx.messageId,
            button_id: buttonId,
            allow_write_access: false,
        }) as { url: string };
        await openButtonUrl(url.url, ctx);
    } catch (e) {
        console.warn('Failed to resolve login URL, opening original:', e);
        await openButtonUrl(fallbackUrl, ctx);
    }
}

async function sendCallbackQuery(
    payload: { _: 'callbackQueryPayloadData'; data: string },
    ctx: InlineButtonContext,
) {
    if (!ctx.chatId || !ctx.messageId) return;
    try {
        const answer = await tdlibSend({
            _: 'getCallbackQueryAnswer',
            chat_id: ctx.chatId,
            message_id: ctx.messageId,
            payload,
        }) as { text: string; show_alert: boolean; url: string };

        if (answer.url) await openButtonUrl(answer.url, ctx);
        if (answer.text) {
            const options = {
                content: answer.text,
                placement: 'top-right' as const,
                duration: answer.show_alert ? 5000 : 2500,
            };
            if (answer.show_alert) {
                await toast.error(options);
            } else {
                await toast.success(options);
            }
        }
    } catch (e) {
        console.error('Callback query failed:', e);
    }
}

async function openUserButton(userId: number) {
    try {
        const chat = await tdlibSend({ _: 'createPrivateChat', user_id: userId, force: false }) as { id: number };
        await router.push(`/home/chat/${chat.id}`);
    } catch (e) {
        console.error('Open inline keyboard user button failed:', e);
    }
}

async function copyButtonText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        await toast.success({ content: i18n.global.t('content.copied'), placement: 'top-right' });
    } catch (e) {
        console.error('Copy inline keyboard button text failed:', e);
    }
}
