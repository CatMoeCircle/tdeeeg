import type { InternalLinkType, proxy, chat, story, stories, stickerSet } from "tdlib-types";
import { tdlibSend } from "./tdlib";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "./toast";
import { showProxyLinkDialog } from "../store/proxyLink";
import { refreshProxies } from "../store/proxyList";
import { openStoryViewer } from "../store/storyViewer";
import { showLanguagePackDialog } from "../store/languagePackLink";
import { useLanguageStore } from "../store/language";
import { openStickerSetDialog } from "../store/stickerSetDialog";
import type { Router } from "vue-router";
import i18n from "../i18n";
import { confirmAndOpenExternalLink } from "./openExternalLink";

/** tg://user?id=N：消息里的「名字提及」（textEntityTypeMentionName）指向用户 id。
 *  TDLib 的 getInternalLinkType 不认这种深链接（会落到「未知深链接」并被丢给外部浏览器），
 *  而资料页本就按 user id 路由，直接内部跳转。 */
function mentionUserIdFromLink(href: string): string | undefined {
    return /^tg:\/\/user\?id=(\d+)/.exec(href)?.[1];
}

/** 内部链接分发：把 getInternalLinkType 的结果落到具体跳转 */
async function dispatchInternalLink(href: string, linkType: InternalLinkType, router: Router): Promise<boolean> {
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
            const chat = await tdlibSend({ _: "searchPublicChat", username: linkType.chat_username });
            await router.push(`/home/chat/${chat.id}`);
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
            openUrl(href);
            return true;
        }
    }
}

/**
 * 解析 Telegram 内部链接（t.me / tg://）并跳转。
 *
 * 此工具与「消息中点击 @ 用户名 / 链接」使用完全一致的逻辑（详见 MessageTextContent）：
 *   - internalLinkTypeMessage    → getMessageLinkInfo 解析出 chat（话题链接再解析出 forum topic，
 *                                  跳转 chat-topic-detail），带 ?message= 定位到具体消息
 *   - internalLinkTypePublicChat → searchPublicChat 解析用户名，跳转 /home/chat/{id}
 *   - internalLinkTypeProxy      → 弹出「添加代理」确认，确认后 addProxy
 *   - internalLinkTypeBotStart   → searchPublicChat 解析出 bot，跳转其私聊；autostart 时自动发送 /start 深链接
 *   - internalLinkTypeStory      → searchPublicChat + getStory，打开故事播放器
 *   - internalLinkTypeStickerSet → t.me/addstickers/<name>、t.me/addemoji/<name>：
 *                                  searchStickerSet 解析出包 id，打开贴纸包弹窗（内含「添加」按钮）
 *   - tg://user?id=N             → 用户资料页（消息中的「名字提及」）
 *   - 其他 / 解析失败            → 外部浏览器打开（openUrl）
 *
 * **同聊天优化**：若链接目标消息所在 chat 与当前打开的聊天一致（params.id 匹配），
 * 不走 router.push（会触发整个 ChatDetail 重建/缓存恢复），而是分发轻量 CustomEvent
 * `tdgram:jump-to-message-in-chat`，由 ChatDetail 监听并直接 jumpToMessage，
 * 零路由变更、零重渲染。
 *
 * @param href   t.me / tg:// 链接
 * @param router 当前组件路由实例（配合 returnType 在 setup 中传入）
 * @returns      是否已被内部处理（true 表示已内部跳转/已弹出代理框，无需再外部打开）
 *
 * 注意：调用方组件负责自己的加载态（如 MessageTextContent 的 loadingLinks），本函数只负责解析与跳转。
 */
export async function resolveInternalLink(href: string, router: Router): Promise<boolean> {
    const mentionUserId = mentionUserIdFromLink(href);
    if (mentionUserId) {
        await router.push({ name: "user-profile", params: { id: mentionUserId } });
        return true;
    }
    try {
        const linkType = await tdlibSend({ _: "getInternalLinkType", link: href }) as InternalLinkType;
        await dispatchInternalLink(href, linkType, router);
        return true;
    } catch (e) {
        console.warn("Failed to resolve internal link, opening externally:", e);
        openUrl(href);
        return true;
    }
}

/**
 * 通用链接入口（简介、群组介绍等纯文本场景）：先问 TDLib「这是不是内部链接」——
 * getInternalLinkType 对非内部链接返回 404，只有这时才按外部链接弹确认框。
 * 调用方无需硬编码 t.me / tg:// / http(s) 前缀。
 *
 * @param href   已补全协议的链接（裸域名需先补 https://）
 * @param router 当前组件路由实例
 */
export async function openAnyLink(href: string, router: Router): Promise<void> {
    const mentionUserId = mentionUserIdFromLink(href);
    if (mentionUserId) {
        await router.push({ name: "user-profile", params: { id: mentionUserId } });
        return;
    }

    let linkType: InternalLinkType | null = null;
    try {
        linkType = await tdlibSend({ _: "getInternalLinkType", link: href }) as InternalLinkType;
    } catch {
        // 404：不是内部链接，按外部链接处理
        linkType = null;
    }

    if (linkType) {
        try {
            await dispatchInternalLink(href, linkType, router);
        } catch (e) {
            console.warn("Failed to resolve internal link, opening externally:", e);
            await confirmAndOpenExternalLink(href).catch(() => { });
        }
        return;
    }

    // 外部链接：仅处理系统能打开的协议
    if (!/^(?:https?|mailto|tel):/i.test(href)) return;
    await confirmAndOpenExternalLink(href).catch(() => { });
}
