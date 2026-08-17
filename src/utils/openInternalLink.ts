import type { InternalLinkType, proxy, chat } from "tdlib-types";
import { tdlibSend } from "./tdlib";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MessagePlugin } from "tdesign-vue-next";
import { showProxyLinkDialog } from "../store/proxyLink";
import { refreshProxies } from "../store/proxyList";
import type { Router } from "vue-router";

/**
 * 解析 Telegram 内部链接（t.me / tg://）并跳转。
 *
 * 此工具与「消息中点击 @ 用户名 / 链接」使用完全一致的逻辑（详见 MessageTextContent）：
 *   - internalLinkTypeMessage    → getMessageLinkInfo 解析出 chat，跳转 chat-detail
 *   - internalLinkTypePublicChat → searchPublicChat 解析用户名，跳转 /home/chat/{id}
 *   - internalLinkTypeProxy      → 弹出「添加代理」确认，确认后 addProxy
 *   - internalLinkTypeBotStart   → searchPublicChat 解析出 bot，跳转其私聊；autostart 时自动发送 /start 深链接
 *   - 其他 / 解析失败            → 外部浏览器打开（openUrl）
 *
 * @param href   t.me / tg:// 链接
 * @param router 当前组件路由实例（配合 returnType 在 setup 中传入）
 * @returns      是否已被内部处理（true 表示已内部跳转/已弹出代理框，无需再外部打开）
 *
 * 注意：调用方组件负责自己的加载态（如 MessageTextContent 的 loadingLinks），本函数只负责解析与跳转。
 */
export async function resolveInternalLink(href: string, router: Router): Promise<boolean> {
    try {
        const linkType = await tdlibSend({ _: "getInternalLinkType", link: href }) as InternalLinkType;

        switch (linkType._) {
            case "internalLinkTypeMessage": {
                const info = await tdlibSend({ _: "getMessageLinkInfo", url: linkType.url });
                if (info.chat_id) {
                    const query: Record<string, string> = {};
                    if (info.message) {
                        query.message = String(info.message.id);
                    }
                    await router.push({
                        name: "chat-detail",
                        params: { id: String(info.chat_id) },
                        query: Object.keys(query).length > 0 ? query : undefined,
                    });
                }
                return true;
            }
            case "internalLinkTypePublicChat": {
                const chat = await tdlibSend({ _: "searchPublicChat", username: linkType.chat_username });
                await router.push(`/home/chat/${chat.id}`);
                return true;
            }
            case "internalLinkTypeBotStart": {
                // t.me/xxxbot?start=xxx 深链接：解析出与 bot 的私聊并跳转；autostart 时自动发送 /start 深链接消息
                const chat = await tdlibSend({ _: "searchPublicChat", username: linkType.bot_username }) as chat;
                await router.push(`/home/chat/${chat.id}`);
                if (linkType.autostart && linkType.start_parameter) {
                    const botUserId =
                        chat.type && (chat.type._ === "chatTypePrivate" || chat.type._ === "chatTypeSecret")
                            ? chat.type.user_id
                            : undefined;
                    if (botUserId) {
                        try {
                            await tdlibSend({
                                _: "sendBotStartMessage",
                                bot_user_id: botUserId,
                                chat_id: chat.id,
                                parameter: linkType.start_parameter,
                            });
                        } catch (e) {
                            console.warn("Failed to send bot start message:", e);
                        }
                    }
                }
                return true;
            }
            case "internalLinkTypeProxy": {
                // proxy.t.me 链接：弹出添加代理小窗，用户确认后再调用 addProxy
                const proxyInfo = linkType.proxy as proxy | undefined;
                if (!proxyInfo) {
                    await MessagePlugin.warning({ content: "不支持的代理类型", placement: "top-right" });
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
                        await MessagePlugin.success({ content: "代理已添加", placement: "top-right" });
                        // 刷新代理列表，让代理设置页跟随更新
                        refreshProxies();
                    } catch (e: any) {
                        await MessagePlugin.error({ content: e?.message || "添加代理失败", placement: "top-right" });
                    }
                }
                return true;
            }
            default: {
                openUrl(href);
                return true;
            }
        }
    } catch (e) {
        console.warn("Failed to resolve internal link, opening externally:", e);
        openUrl(href);
        return true;
    }
}
