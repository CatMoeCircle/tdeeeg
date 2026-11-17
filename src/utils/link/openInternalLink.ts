import type { InternalLinkType, proxy, chat, story, stories, stickerSet } from "tdlib-types";
import { tdlibSend } from "../session/tdlib";
import { toast } from "../ui/toast";
import { showProxyLinkDialog } from "../../store/settings/proxyLink";
import { refreshProxies } from "../../store/settings/proxyList";
import { openStoryViewer } from "../../store/profile/storyViewer";
import { showLanguagePackDialog } from "../../store/settings/languagePackLink";
import { useLanguageStore } from "../../store/settings/language";
import { openStickerSetDialog } from "../../store/media/stickerSetDialog";
import type { Router } from "vue-router";
import i18n from "../../i18n";
import { confirmAndOpenExternalLink } from "./openExternalLink";
import { openMainMiniAppLink, openWebAppLink, type MiniAppLinkContext } from "./miniappLaunch";

/** 已带协议的链接：http(s) / tg / mailto / tel 等，判定依据是「有 scheme」而非固定白名单 */
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.\-]*:/i;
/** 裸域名（t.me/monk、example.com、www.a.com…），含可选端口与路径 */
const BARE_DOMAIN_RE = /^(?:[\w-]+\.)+[\w-]{2,}(?::\d+)?(?:[/?#]|$)/i;

/**
 * 链接归一化：把「文本里的链接」补成带协议的完整 URL。
 *
 * TDLib 的 `textEntityTypeUrl` 只给区间，切片出来的文本常是裸域名
 * （`t.me/monk`、`example.com/x`）：这类文本既不是 `https://t.me/…`
 * 也不是 `http(s)://…`，任何按前缀分支的调用方都会把它漏掉，
 * 最终落到「不处理」或「外部浏览器」。所以统一在这里补全，且只补一次。
 *
 * @param raw 原始链接（可能是裸域名、`www.` 开头、或已带协议）
 * @returns 归一化后的链接；空串 / 非链接文本返回空串
 */
export function normalizeLinkHref(raw: string): string {
    const href = raw.trim();
    if (!href) return "";
    // 已带协议（含 tg:、mailto:、tel: 等自定义 scheme）原样返回
    if (HAS_SCHEME_RE.test(href)) return href;
    // 协议相对写法 //t.me/x 按 https 处理
    if (href.startsWith("//")) return `https:${href}`;
    // 裸域名：补 https，交给 TDLib 判断是否为 Telegram 内部链接
    if (BARE_DOMAIN_RE.test(href)) return `https://${href}`;
    return href;
}

/** 是否为 Telegram 内部链接（t.me / proxy.t.me / tg://）。
 *  仅作「快速判断」，不是分发的唯一依据：openLink 对任何 http(s) 链接都会先问 TDLib。 */
export function isTelegramInternalUrl(href: string): boolean {
    const url = normalizeLinkHref(href);
    return url.startsWith("https://t.me/") || url.startsWith("https://proxy.t.me/") || url.startsWith("tg://");
}

/** tg://user?id=N：消息里的「名字提及」（textEntityTypeMentionName）指向用户 id。
 *  TDLib 的 getInternalLinkType 不认这种深链接（会落到「未知深链接」并被丢给外部浏览器），
 *  而资料页本就按 user id 路由，直接内部跳转。 */
function mentionUserIdFromLink(href: string): string | undefined {
    return /^tg:\/\/user\?id=(\d+)/.exec(href)?.[1];
}

/** 内部链接分发：把 getInternalLinkType 的结果落到具体跳转 */
async function dispatchInternalLink(
    href: string,
    linkType: InternalLinkType,
    router: Router,
    ctx: MiniAppLinkContext = {},
): Promise<boolean> {
    switch (linkType._) {
        case "internalLinkTypeMessage": {
            const info = await tdlibSend({ _: "getMessageLinkInfo", url: linkType.url });
            if (info.chat_id) {
                const targetChatId = String(info.chat_id);
                const currentParams = router.currentRoute.value.params;
                const currentChatId = String(currentParams.id ?? '');
                // 话题群组（论坛）/ 频道私信的话题链接必须进话题视图：不带话题打开拿的是
                // 群的整体历史，既不一定包含目标消息，顶栏和输入框也不是那个话题的上下文。
                const topicId = info.topic_id?._ === "messageTopicForum" ? info.topic_id.forum_topic_id : 0;
                const currentTopicId = currentParams.topicId ? Number(currentParams.topicId) : 0;

                // 同一聊天、同一话题（且不在评论线程里）内的跳转：dispatch 事件，不走路由
                const sameView = targetChatId === currentChatId
                    && topicId === currentTopicId
                    && !currentParams.threadMsgId;
                if (sameView && info.message) {
                    window.dispatchEvent(
                        new CustomEvent('tdgram:jump-to-message-in-chat', {
                            detail: { messageId: info.message.id },
                        }),
                    );
                    return true;
                }

                const query: Record<string, string> = {};
                if (info.message) {
                    query.message = String(info.message.id);
                }
                await router.push(topicId > 0
                    ? {
                        name: "chat-topic-detail",
                        params: { id: targetChatId, topicId: String(topicId) },
                        query,
                    }
                    : {
                        name: "chat-detail",
                        params: { id: targetChatId },
                        query,
                    });
            }
            return true;
        }
        case "internalLinkTypePublicChat": {
            // 用户名解析失败（不存在 / 被限制 / 临时网络错误）：给提示即可。
            // 这里不能把错误抛给外层，否则「t.me/某个不存在的号」会变成外部浏览器弹窗。
            try {
                const chat = await tdlibSend({ _: "searchPublicChat", username: linkType.chat_username });
                await router.push(`/home/chat/${chat.id}`);
            } catch (e) {
                console.warn("searchPublicChat for link failed:", e);
                await toast.warning({ content: i18n.global.t("preview.userOrChatNotFound"), placement: "top-right" });
            }
            return true;
        }
        case "internalLinkTypeDirectMessagesChat": {
            // t.me/username/d 或频道私信入口：找频道后打开其关联私信群组
            const channel = await tdlibSend({
                _: "searchPublicChat",
                username: linkType.channel_username,
            }) as chat;
            if (channel.type?._ !== "chatTypeSupergroup") {
                await toast.warning({ content: i18n.global.t("preview.channelNotFound"), placement: "top-right" });
                return true;
            }
            // 优先取 supergroupFullInfo.direct_messages_chat_id；否则若是私信群自身则直接打开
            let dmChatId = 0;
            try {
                const full = await tdlibSend({
                    _: "getSupergroupFullInfo",
                    supergroup_id: channel.type.supergroup_id,
                }) as any;
                dmChatId = full?.direct_messages_chat_id ?? 0;
            } catch {
                /* ignore */
            }
            const targetId = dmChatId || channel.id;
            await router.push(`/home/chat/${targetId}`);
            return true;
        }
        case "internalLinkTypeBotStart": {
            // t.me/<bot>?start=<参数> 深链接：解析出与 bot 的私聊并跳转，然后内部发送
            // /start <参数>。不能只在 autostart 时发送——「管理此聊天」这类业务深链接
            // 会把管理参数放在 start 里，参数丢了就等于没跳，且不该交给外部浏览器。
            const botChat = await tdlibSend({
                _: "searchPublicChat",
                username: linkType.bot_username,
            }) as chat;
            const botUserId =
                botChat.type?._ === "chatTypePrivate" || botChat.type?._ === "chatTypeSecret"
                    ? botChat.type.user_id
                    : undefined;
            if (!botUserId) {
                await toast.warning({
                    content: i18n.global.t("lng_chatbots_not_found"),
                    placement: "top-right",
                });
                return true;
            }
            await router.push(`/home/chat/${botChat.id}`);
            const parameter = linkType.start_parameter ?? "";
            if (parameter || linkType.autostart) {
                try {
                    await tdlibSend({
                        _: "sendBotStartMessage",
                        bot_user_id: botUserId,
                        chat_id: botChat.id,
                        parameter,
                    });
                } catch (e) {
                    console.warn("Failed to send bot start message:", e);
                }
            }
            return true;
        }
        case "internalLinkTypeMainWebApp": {
            // t.me/<bot>?startapp=<参数>：bot 的主 Mini App。必须在应用内的
            // webview 载体里打开——交给系统浏览器只会落到 Telegram 官网。
            await openMainMiniAppLink({
                botUsername: linkType.bot_username,
                startParameter: linkType.start_parameter,
                context: ctx,
            });
            return true;
        }
        case "internalLinkTypeWebApp": {
            // t.me/<bot>/<app>?startapp=<参数>：按短名指定的 Mini App。
            // Wallet 等 bot 的分享链接（t.me/wallet/start?startapp=...）解析成这一类。
            await openWebAppLink({
                botUsername: linkType.bot_username,
                webAppShortName: linkType.web_app_short_name,
                startParameter: linkType.start_parameter,
                context: ctx,
            });
            return true;
        }
        case "internalLinkTypeStory": {
            // t.me/username/s123 → searchPublicChat → getStory → 故事播放器
            const { story_poster_username, story_id } = linkType;
            if (!story_poster_username || !story_id) {
                await toast.warning({ content: i18n.global.t("preview.invalidStoryLink"), placement: "top-right" });
                return true;
            }
            const posterChat = await tdlibSend({
                _: "searchPublicChat",
                username: story_poster_username,
            }) as chat;
            const targetStory = await tdlibSend({
                _: "getStory",
                story_poster_chat_id: posterChat.id,
                story_id,
            }) as story;

            // 尽量加载该发布者主页动态列表，便于左右滑动浏览；失败则仅打开单条
            let list: story[] = [targetStory];
            let startIndex = 0;
            try {
                const page = await tdlibSend({
                    _: "getChatPostedToChatPageStories",
                    chat_id: posterChat.id,
                    from_story_id: 0,
                    limit: 100,
                }) as stories;
                const storiesList = page?.stories ?? [];
                if (storiesList.length > 0) {
                    const idx = storiesList.findIndex((s) => s.id === story_id);
                    list = idx >= 0 ? storiesList : [targetStory, ...storiesList.filter((s) => s.id !== story_id)];
                    startIndex = idx >= 0 ? idx : 0;
                }
            } catch {
                /* 保持单条 */
            }
            openStoryViewer(list, startIndex);
            return true;
        }
        case "internalLinkTypeStickerSet": {
            // t.me/addstickers/<name> / t.me/addemoji/<name>：按 TDLib 建议 searchStickerSet
            // 解析出包，交给常驻的贴纸包弹窗展示（用户点「添加」即 changeStickerSet）。
            // 包不存在时 searchStickerSet 抛错，这里必须自行消化，否则会被外层 catch 甩给外部浏览器。
            try {
                const found = await tdlibSend({
                    _: "searchStickerSet",
                    name: linkType.sticker_set_name,
                }) as stickerSet;
                openStickerSetDialog(found?.id);
            } catch (e) {
                console.warn("searchStickerSet for link failed:", e);
                await toast.warning({
                    content: i18n.global.t("lng_stickers_not_found"),
                    placement: "top-right",
                });
            }
            return true;
        }
        case "internalLinkTypeProxy": {
            // proxy.t.me 链接：弹出添加代理小窗，用户确认后再调用 addProxy
            const proxyInfo = linkType.proxy as proxy | undefined;
            if (!proxyInfo) {
                await toast.warning({ content: i18n.global.t("preview.proxyTypeUnsupported"), placement: "top-right" });
                return true;
            }
            const action = await showProxyLinkDialog(proxyInfo);
            if (action === "add") {
                try {
                    await tdlibSend({
                        _: "addProxy",
                        proxy: { _: "proxy", server: proxyInfo.server, port: proxyInfo.port, type: proxyInfo.type },
                        enable: true,
                    });
                    await toast.success({ content: i18n.global.t("preview.proxyAdded"), placement: "top-right" });
                    // 刷新代理列表，让代理设置页跟随更新
                    refreshProxies();
                } catch (e: any) {
                    await toast.error({ content: e?.message || i18n.global.t("preview.addFailed"), placement: "top-right" });
                }
            }
            return true;
        }
        case "internalLinkTypeLanguagePack": {
            // t.me/setlanguage/xxx：弹出「是否添加本语言包」确认框
            const packId = linkType.language_pack_id;
            if (!packId) {
                await toast.warning({ content: i18n.global.t("preview.invalidLanguagePackLink"), placement: "top-right" });
                return true;
            }
            const action = await showLanguagePackDialog(packId);
            if (action === "add") {
                try {
                    // 应用语言：切换 UI + TDLib language_pack_id，并下载缓存
                    const langStore = useLanguageStore();
                    await langStore.setLanguage(packId);
                    await toast.success({
                        content: i18n.global.t("preview.languagePackEnabled", { id: packId }),
                        placement: "top-right",
                    });
                } catch (e: any) {
                    await toast.error({
                        content: e?.message || i18n.global.t("preview.languagePackApplyFailed"),
                        placement: "top-right",
                    });
                }
            }
            return true;
        }
        default: {
            // 已知类型的内部链接但没有本地实现（邀请链接/主题/未知深链接…）：
            // 仍先弹「打开外部链接」确认，用户同意后再交给系统浏览器 —— 不能让一次点击
            // 静默把用户甩出应用，这正是 t.me 链接「莫名跳浏览器」的来源之一。
            await confirmAndOpenExternalLink(href).catch(() => { });
            return true;
        }
    }
}

/**
 * 解析 Telegram 内部链接（t.me / tg://）并跳转。
 *
 * 先做归一化（裸域名补 https），再问 TDLib 这是不是内部链接：
 *   - internalLinkTypeMessage    → getMessageLinkInfo 解析出 chat（话题链接再解析出 forum topic，
 *                                  跳转 chat-topic-detail），带 ?message= 定位到具体消息
 *   - internalLinkTypePublicChat → searchPublicChat 解析用户名，跳转 /home/chat/{id}
 *   - internalLinkTypeProxy      → 弹出「添加代理」确认，确认后 addProxy
 *   - internalLinkTypeBotStart   → searchPublicChat 解析出 bot，跳转其私聊；autostart 时自动发送 /start 深链接
 *   - internalLinkTypeStory      → searchPublicChat + getStory，打开故事播放器
 *   - internalLinkTypeStickerSet → t.me/addstickers/<name>、t.me/addemoji/<name>：
 *                                  searchStickerSet 解析出包 id，打开贴纸包弹窗（内含「添加」按钮）
 *   - internalLinkTypeMainWebApp → searchPublicChat + getMainWebApp，打开 bot 的主 Mini App
 *   - internalLinkTypeWebApp  → searchPublicChat + searchWebApp + getWebAppLinkUrl，
 *                              打开链接指定的 Mini App（t.me/wallet/start?startapp=… 属于此类）
 *   - tg://user?id=N             → 用户资料页（消息中的「名字提及」）
 *   - 非内部链接（TDLib 返回 404）→ 外部链接：先弹确认框，确认后交给系统浏览器
 *
 * **同聊天优化**：若链接目标消息所在 chat 与当前打开的聊天一致（params.id 匹配），
 * 不走 router.push（会触发整个 ChatDetail 重建/缓存恢复），而是分发轻量 CustomEvent
 * `tdgram:jump-to-message-in-chat`，由 ChatDetail 监听并直接 jumpToMessage，
 * 零路由变更、零重渲染。
 *
 * @param href   t.me / tg:// 链接（可传裸域名，内部会补全协议）
 * @param router 当前组件路由实例（配合 returnType 在 setup 中传入）
 * @param ctx    点击发生的聊天（Mini App 链接需要它绑定「当前聊天」，可省略）
 * @returns      是否已被内部处理（true 表示已内部跳转/已弹出确认框）
 */
export async function resolveInternalLink(
    href: string,
    router: Router,
    ctx: MiniAppLinkContext = {},
): Promise<boolean> {
    const url = normalizeLinkHref(href);
    if (!url) return true;

    const mentionUserId = mentionUserIdFromLink(url);
    if (mentionUserId) {
        await router.push({ name: "user-profile", params: { id: mentionUserId } });
        return true;
    }
    try {
        const linkType = await tdlibSend({ _: "getInternalLinkType", link: url }) as InternalLinkType;
        return await dispatchInternalLink(url, linkType, router, ctx);
    } catch (e) {
        // 走到这里说明「已确认是 t.me/tg:// 内部链接，但解析/跳转失败」（被限制、目标被删、
        // TDLib 报错）。此时不该弹「打开外部链接」把用户甩去浏览器 —— 静默记录即可，
        // 由各分支自己给的 toast 说明原因。
        console.warn("Failed to resolve internal link:", e);
        return true;
    }
}

/**
 * 通用链接入口：消息正文、标题栏、简介、按钮等所有「点链接」的地方都走这里。
 *
 * 先补全协议（裸域名 `t.me/monk` → `https://t.me/monk`），再问 TDLib 是不是内部链接：
 * 是就走应用内跳转，不是才弹「打开外部链接」确认框，确认后交系统浏览器。
 * 调用方无需硬编码 t.me / tg:// / http(s) 前缀，也不该再自行判断。
 *
 * @param href   原始链接（裸域名亦可）
 * @param router 当前组件路由实例
 * @param ctx    点击发生的聊天（Mini App 链接需要它绑定「当前聊天」，可省略）
 */
export async function openAnyLink(
    href: string,
    router: Router,
    ctx: MiniAppLinkContext = {},
): Promise<void> {
    await openLink(href, router, ctx);
}

/**
 * 链接点击的统一出口（推荐入口）。等价于 openAnyLink，保留一个语义更直白的名字
 * 供消息正文 / 媒体说明使用。
 */
export async function openLink(
    href: string,
    router: Router,
    ctx: MiniAppLinkContext = {},
): Promise<void> {
    const url = normalizeLinkHref(href);
    if (!url) return;

    const mentionUserId = mentionUserIdFromLink(url);
    if (mentionUserId) {
        await router.push({ name: "user-profile", params: { id: mentionUserId } });
        return;
    }

    let linkType: InternalLinkType | null = null;
    try {
        linkType = await tdlibSend({ _: "getInternalLinkType", link: url }) as InternalLinkType;
    } catch {
        // 404：不是内部链接，按外部链接处理
        linkType = null;
    }

    if (linkType) {
        try {
            await dispatchInternalLink(url, linkType, router, ctx);
        } catch (e) {
            console.warn("Failed to resolve internal link, opening externally:", e);
            await confirmAndOpenExternalLink(url).catch(() => { });
        }
        return;
    }

    // 外部链接：仅处理系统能打开的协议
    if (!/^(?:https?|mailto|tel|ftp):/i.test(url)) return;
    await confirmAndOpenExternalLink(url).catch(() => { });
}
