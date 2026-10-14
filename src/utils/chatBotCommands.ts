import { tdlibSend } from './tdlib';
import { ensureUser } from './senderInfo';
import type { chat } from 'tdlib-types';

/** 带来源 bot 的一条机器人命令（输入框「/」弹出用） */
export interface ChatBotCommand {
    command: string;
    description: string;
    /** 该命令所属 bot 的 user id */
    botUserId: number;
}

/**
 * 按需拉取聊天内的 bot 命令列表（数据来源同官方客户端）：
 * - 私聊：userFullInfo.bot_info.commands
 * - 基本群 / 超级群：groupFullInfo.bot_commands（各 bot 的命令拍平合并）
 * 其它聊天类型返回 null。
 *
 * 每个 chat 缓存一次（命令列表极少变化，不再监听 full info 更新）。
 */
const cache = new Map<number, ChatBotCommand[]>();
const pending = new Set<number>();

export function fetchChatBotCommands(chat: chat): Promise<ChatBotCommand[] | null> {
    const cached = cache.get(chat.id);
    if (cached) return Promise.resolve(cached);
    if (pending.has(chat.id)) return Promise.resolve(null);

    const t = chat.type;
    let req: Promise<ChatBotCommand[]>;
    if (t._ === 'chatTypePrivate') {
        req = tdlibSend({ _: 'getUserFullInfo', user_id: t.user_id })
            .then((info) => (info.bot_info?.commands ?? [])
                .map((c) => ({ command: c.command, description: c.description, botUserId: t.user_id })));
    } else if (t._ === 'chatTypeBasicGroup') {
        req = tdlibSend({ _: 'getBasicGroupFullInfo', basic_group_id: t.basic_group_id })
            .then((info) => flatten(info.bot_commands));
    } else if (t._ === 'chatTypeSupergroup') {
        req = tdlibSend({ _: 'getSupergroupFullInfo', supergroup_id: t.supergroup_id })
            .then((info) => flatten(info.bot_commands));
    } else {
        return Promise.resolve(null);
    }

    pending.add(chat.id);
    const id = chat.id;
    return req
        .then(async (cmds) => {
            // 预加载各 bot 的用户信息（弹窗行头像/名称用；senderInfo 有全局缓存）
            await Promise.all([...new Set(cmds.map((c) => c.botUserId))].map((uid) => ensureUser(uid)));
            cache.set(id, cmds);
            return cmds;
        })
        .catch((e) => { console.error('Failed to fetch chat bot commands', e); return null; })
        .finally(() => pending.delete(id));
}

function flatten(groups: { bot_user_id: number; commands: { command: string; description: string }[] }[]): ChatBotCommand[] {
    return groups.flatMap((g) => g.commands.map((c) => ({ command: c.command, description: c.description, botUserId: g.bot_user_id })));
}
