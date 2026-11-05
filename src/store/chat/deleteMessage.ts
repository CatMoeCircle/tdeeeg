import { ref } from "vue";
import type { message, MessageSender, chatPhotoInfo, profilePhoto } from "tdlib-types";

/**
 * 「删除消息」确认弹窗的全局状态。
 * 参照 externalLink.ts 的 Promise 模式：调用方 confirmDeleteMessage 传入待删消息，
 * 由挂载在合适处的 DeleteMessageConfirm.vue 监听 visible 渲染；
 * 用户选择操作后通过 resolve 回传结果，取消则 reject。
 *
 * 群聊里弹窗的结构由「选中的发送者」决定：
 *  - 没有发送者（全是自己 / 匿名管理员）→ 普通确认 + 「同时为所有人删除」；
 *  - 有发送者 → 举报垃圾信息 / 删除其所有消息 / 封禁其，逐人勾选；
 *    对没有权限封禁的成员（群主、不可编辑的管理员等）置灰，但删除消息不受影响。
 */

/** 去重后的发送者及其可执行的管理动作 */
export interface DeleteSenderInfo {
    /** 稳定 key（u<userId> / c<chatId>），用于弹窗逐人勾选时回传 */
    key: string;
    /** 发送者（用户或频道身份） */
    sender: MessageSender;
    /** 发送者显示名（用于弹窗文案） */
    name: string;
    /** 头像资料（弹窗逐人列表展示用） */
    photo?: chatPhotoInfo | profilePhoto;
    firstName: string;
    lastName: string;
    accentColorId?: number;
    isDeleted: boolean;
    /** 是否可删除该发送者的所有消息（超级群 + can_delete_messages） */
    canDeleteAll: boolean;
    /** 是否可删除该发送者的所有回应/反应（群组 + can_delete_messages） */
    canDeleteReactions: boolean;
    /** 是否能封禁/限制该发送者（群权限 + 成员身份，如群主/上级管理员不可封禁） */
    canBan: boolean;
}

/** 删除确认结果 */
export interface DeleteMessageResult {
    /** 是否删除选中的消息本身 */
    deleteMessages: boolean;
    /** 要举报的发送者 key 列表（仅举报这些发送者的消息） */
    reportSenderKeys: string[];
    /** 删除选中消息时是否对所有人撤回 */
    revoke: boolean;
    /** 要执行「删除其所有消息」的发送者 key 列表 */
    deleteAllSenderKeys: string[];
    /** 要执行「删除其所有回应」的发送者 key 列表 */
    deleteReactionsSenderKeys: string[];
    /** 要封禁的发送者 key 列表（不可封禁的成员不会出现在这里） */
    banSenderKeys: string[];
}

/** 当前待删除请求 */
export interface DeleteMessageRequest {
    /** 源对话 id */
    chatId: number;
    /** 待删除的消息（多选时为多条） */
    msgs: message[];
    /** 去重后的发送者（已剔除自己与「以本聊天身份发言」） */
    senders: DeleteSenderInfo[];
    /** 私聊 / 基础群：显式显示「同时为所有人删除」复选框 */
    showDeleteForAll: boolean;
    /** 至少一条消息可对所有人删除 */
    canDeleteForAll: boolean;
    /** 可举报所选消息为垃圾信息 */
    canReportSpam: boolean;
    /** 当前用户在当前对话是否拥有封禁/限制权限（无权限时封禁行也置灰展示） */
    supportsBan: boolean;
}

export const visible = ref(false);
export const request = ref<DeleteMessageRequest | null>(null);

let onResolve: ((r: DeleteMessageResult) => void) | null = null;
let onReject: ((reason?: unknown) => void) | null = null;

/**
 * 弹出「删除消息」确认框。
 * 用户确认/选择选项后 resolve；取消则 reject（reason = new Error("canceled")）。
 */
export function confirmDeleteMessage(req: DeleteMessageRequest): Promise<DeleteMessageResult> {
    return new Promise<DeleteMessageResult>((resolve, reject) => {
        request.value = { ...req };
        visible.value = true;
        onResolve = resolve;
        onReject = reject;
    });
}

/** 用户在弹窗中确认（携带选中的操作） */
export function confirmDelete(result: DeleteMessageResult) {
    visible.value = false;
    onResolve?.(result);
    onResolve = null;
    onReject = null;
    request.value = null;
}

/** 关闭弹窗（取消）：reject */
export function cancelDelete() {
    const reject = onReject;
    visible.value = false;
    onResolve = null;
    onReject = null;
    request.value = null;
    reject?.(new Error("canceled"));
}
