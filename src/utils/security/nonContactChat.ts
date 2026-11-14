import { useChatStore } from "../../store/chat/chat";
import { useUserStore } from "../../store/session/user";
import { tdlibSend } from "../session/tdlib";
import type { user } from "tdlib-types";

/**
 * 安全模式下「打开非联系人会话前确认」的判定。
 *
 * 会话里的人是不是联系人，TDLib 只在 `user.is_contact` 上给答案，聊天对象本身没有，
 * 所以这里按 user_id 查一次并缓存**最终结论**（是否要拦），而不是只缓存 is_contact——
 * 否则 bot / 已注销账号的豁免会被缓存命中绕过。
 * 查询失败一律放行：不能因为查不到用户就把导航卡死。
 */

/** userId → 是否需要确认（缓存最终结论） */
const needsConfirmCache = new Map<number, boolean>();

/**
 * 判断打开该会话是否需要确认。
 *
 * @returns 需要确认时返回会话标题；不需要 / 无法判断时返回 null（放行）
 */
export async function pendingNonContactChat(chatId: number): Promise<string | null> {
    const chat = useChatStore().chats[chatId];
    const type = chat?.type;
    // 只处理一对一（含密聊）；群 / 频道 / 未知会话不在此列
    if (!chat || (type?._ !== "chatTypePrivate" && type?._ !== "chatTypeSecret")) return null;

    const userId = (type as { user_id: number }).user_id;
    if (!userId) return null;
    // 收藏夹 / 自己的会话：自己永远不是自己的"联系人"，不能拿这条规则拦
    if (userId === useUserStore().userProfile?.id) return null;

    const label = chat.title || `#${chatId}`;
    const cached = needsConfirmCache.get(userId);
    if (cached !== undefined) return cached ? label : null;

    try {
        const target = (await tdlibSend({ _: "getUser", user_id: userId })) as user;
        // bot / 已注销账号不是"某个不认识的人"，不值得每次打开都拦
        const exempt = target.type?._ === "userTypeBot" || target.type?._ === "userTypeDeleted";
        const needsConfirm = !target.is_contact && !exempt;
        needsConfirmCache.set(userId, needsConfirm);
        return needsConfirm ? label : null;
    } catch {
        // 离线 / 查不到用户：放行，避免把导航卡死
        return null;
    }
}
