import type { Chat, MainWebApp, User, WebAppUrl } from 'tdlib-types';
import i18n from '../i18n';
import { ensureLocalFilePath, tdlibSend } from './tdlib';
import { toast } from './toast';
import { buildWebAppOpenParameters } from './miniappTheme';
import { useChatStore } from '../store/chat';
import { useMiniAppStore } from '../store/miniapp';

/**
 * Mini App 的「链接入口」：t.me / tg:// 的 Web App 链接经 TDLib 解析成
 * internalLinkTypeWebApp / internalLinkTypeMainWebApp 后，用 bot 用户名换出
 * 最终 URL，再交给原生载体（Rust tdlib/miniapp.rs）建窗。
 *
 * 与「按钮入口」（utils/inlineButton 的 openWebApp）的区别：按钮走 openWebApp，
 * 返回 launch_id 参与 updateWebAppMessageSent 生命周期；链接入口只有 URL
 * （getWebAppLinkUrl / getMainWebApp），launch_id 恒为 0，关闭时不回执 closeWebApp。
 */

/** 链接点击的上下文 */
export interface MiniAppLinkContext {
    /** 点击发生在哪个聊天：TDLib 用它把 app 绑定到「当前聊天」 */
    chatId?: number;
}

/** TDLib 的 chat_id：secret chat 打不开 Web App，未知聊天按「无上下文」处理 */
function webAppChatId(chatId?: number): number {
    if (!chatId) return 0;
    const chat = useChatStore().chats[chatId];
    if (!chat || chat.type?._ === 'chatTypeSecret') return 0;
    return chatId;
}

/** 解析 t.me/<bot>：必须是私聊里的 bot 用户，同时取到标题栏要用的名字/头像 */
async function resolveBot(username: string): Promise<{ userId: number; title: string; avatarPath?: string }> {
    const found = await tdlibSend({ _: 'searchPublicChat', username }) as Chat;
    const userId = found?.type?._ === 'chatTypePrivate' ? found.type.user_id : 0;
    if (!userId) throw new Error(i18n.global.t('content.miniAppOpenFailed'));
    const user = await tdlibSend({ _: 'getUser', user_id: userId }) as User;
    if (user?.type?._ !== 'userTypeBot') throw new Error(i18n.global.t('content.miniAppOpenFailed'));
    const avatarPath = found.photo?.small
        ? await ensureLocalFilePath(found.photo.small).catch(() => null)
        : null;
    return { userId, title: found.title || username, avatarPath: avatarPath ?? undefined };
}

/** 把最终 URL 交给原生载体建窗（链接入口没有 launch_id） */
async function present(
    url: string,
    bot: { userId: number; title: string; avatarPath?: string },
    chatId?: number,
): Promise<void> {
    await useMiniAppStore().open(url, {
        launchId: '0',
        botUserId: bot.userId,
        chatId: webAppChatId(chatId),
        title: bot.title,
        avatarPath: bot.avatarPath,
    });
}

/** 失败统一弹 toast：Mini App 链接不应再退回系统浏览器 */
function reportFailure(log: string, e: unknown): void {
    const err = e as { message?: string };
    console.error(log, e);
    void toast.error({
        content: err?.message || i18n.global.t('content.miniAppOpenFailed'),
        placement: 'top-right',
    });
}

/**
 * t.me/<bot>?startapp=<参数>（tg://resolve?domain=<bot>&startapp=<参数>）：
 * bot 的主 Mini App。getMainWebApp 返回完整 URL，不走 openWebApp 生命周期。
 */
export async function openMainMiniAppLink(params: {
    botUsername: string;
    startParameter?: string;
    context?: MiniAppLinkContext;
}): Promise<void> {
    try {
        const bot = await resolveBot(params.botUsername);
        const info = await tdlibSend({
            _: 'getMainWebApp',
            chat_id: webAppChatId(params.context?.chatId),
            bot_user_id: bot.userId,
            start_parameter: params.startParameter ?? '',
            parameters: buildWebAppOpenParameters(),
        }) as MainWebApp;
        if (!info?.url?.url) throw new Error(i18n.global.t('content.miniAppOpenFailed'));
        await present(info.url.url, bot, params.context?.chatId);
    } catch (e) {
        reportFailure('Open main Mini App link failed:', e);
    }
}

/**
 * t.me/<bot>/<app>?startapp=<参数>：bot 名下按短名指定的 Mini App，
 * 用 getWebAppLinkUrl 换出最终 URL（先 searchWebApp 确认 app 存在）。
 */
export async function openWebAppLink(params: {
    botUsername: string;
    webAppShortName: string;
    startParameter?: string;
    context?: MiniAppLinkContext;
}): Promise<void> {
    try {
        const bot = await resolveBot(params.botUsername);
        await tdlibSend({
            _: 'searchWebApp',
            bot_user_id: bot.userId,
            web_app_short_name: params.webAppShortName,
        });
        const info = await tdlibSend({
            _: 'getWebAppLinkUrl',
            chat_id: webAppChatId(params.context?.chatId),
            bot_user_id: bot.userId,
            web_app_short_name: params.webAppShortName,
            start_parameter: params.startParameter ?? '',
            // 链接入口不代用户授权「bot 给我发消息」，需要时 app 运行中自己申请
            allow_write_access: false,
            parameters: buildWebAppOpenParameters(),
        }) as WebAppUrl;
        if (!info?.url) throw new Error(i18n.global.t('content.miniAppOpenFailed'));
        await present(info.url, bot, params.context?.chatId);
    } catch (e) {
        reportFailure('Open Mini App link failed:', e);
    }
}
