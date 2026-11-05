import { ref } from "vue";

/**
 * 跨组件「插入 @提及」的轻量单例（与 store/commandInsert 同构）。
 *
 * 消息头像资料小卡片点「@对方」时把提及目标写入 pendingMention，
 * 对话详情（ChatDetail）watch 该值，把 `@名字 ` 插进输入框并附带实体：
 *   - 用户：textEntityTypeMentionName（带 user_id，没有公开用户名也能精确 @ 到本人）
 *   - 群组/频道：textEntityTypeMention（按 @username 解析）
 * 消费完成后调用方需 clearPendingMention() 清空，防止重复插入。
 */

/** 提及目标 */
export interface PendingMention {
    /** 目标用户 id（用户） */
    userId?: number;
    /** 目标公开用户名（群组/频道用） */
    username?: string;
    /** 插入后显示的文本（含 @ 前缀，如 `@durov`） */
    text: string;
    /** 写入时间（ms）：过期未消费就丢弃，避免下次进入对话时突然插入 */
    at: number;
    /** 递增序号：同一目标连续点击两次也要能触发 watch */
    seq: number;
}

const pendingMention = ref<PendingMention | null>(null);
let seq = 0;

/** 请求把某条 @提及 插入当前对话输入框 */
export function requestInsertMention(target: { userId?: number; username?: string; text: string }): void {
    seq += 1;
    pendingMention.value = {
        userId: target.userId,
        username: target.username,
        text: target.text,
        at: Date.now(),
        seq,
    };
}

/** 读取待插入的提及（供消费方读取/清空） */
export function useMentionInsert() {
    return { pendingMention };
}

/** 清空待插入提及（消费完成后调用） */
export function clearPendingMention(): void {
    pendingMention.value = null;
}
