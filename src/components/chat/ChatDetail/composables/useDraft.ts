import { watch, type ComputedRef, type Ref } from 'vue';
import type { message } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';
import { buildMessageTopicInput } from '../../../../utils/directMessagesTopics';

/**
 * 输入框草稿：内存缓存 + localStorage 不持久化（保持原行为），同步 TDLib setChatDraftMessage。
 *
 * 从 `ChatDetail/index.vue` 抽出；依赖以 ref 形式注入，行为与原来完全一致：
 * - 切聊天/卸载时用「旧」chatId 保存
 * - 内容未变不重复写 TDLib
 * - 评论线程不读写会话草稿（key 与主聊天相同会互相覆盖）
 */
export interface DraftEntry {
    text: string;
    customEmojis: { id: string; alt: string }[];
}

const draftCache = new Map<string, DraftEntry>();
/** 上次同步到 TDLib 的草稿文本（按 chat(+topic)），用于「无变化则跳过保存」 */
const lastSyncedDraftText = new Map<string, string>();
const DRAFT_CACHE_MAX = 50;

function draftCacheKey(id: number, tid?: number | null) {
    return tid ? `${id}:${tid}` : `${id}`;
}

export function useDraft(deps: {
    chatId: ComputedRef<number | undefined>;
    topicId: ComputedRef<number | undefined>;
    threadMode: ComputedRef<boolean>;
    threadRootMsgId: ComputedRef<number>;
    messageInput: Ref<string>;
    pendingCustomEmoji: Ref<{ id: string; alt: string }[]>;
    editingMsg: Ref<message | null>;
    isDirectMessagesChat: Ref<boolean>;
    /** 切换对话加载期间为 true：抑制自动存草稿，避免清空输入误删新聊天草稿 */
    suppress: Ref<boolean>;
}) {
    const { chatId, topicId, threadMode, threadRootMsgId, messageInput, pendingCustomEmoji, editingMsg, isDirectMessagesChat, suppress } = deps;

    /** TDLib setChatDraftMessage 的防抖定时器 */
    let tdlibDraftTimer: number | null = null;
    /** 本地输入变更后写入草稿的防抖定时器 */
    let localDraftTimer: number | null = null;
    /** 待提交到 TDLib 的草稿（防抖窗口内切换聊天时，先冲刷旧聊天草稿，避免被新聊天覆盖丢失） */
    let pendingTdlibDraft: { cid: number; tid?: number | null; text?: string } | null = null;

    function draftTopicInput(tid?: number | null) {
        return buildMessageTopicInput(isDirectMessagesChat.value, tid);
    }

    /** 立即把 pendingTdlibDraft 提交到 TDLib；无待提交则不操作 */
    function flushTdlibDraftNow() {
        if (!pendingTdlibDraft) return;
        const { cid, tid, text } = pendingTdlibDraft;
        pendingTdlibDraft = null;
        const body = text?.trim()
            ? {
                _: 'draftMessage' as const,
                date: Math.floor(Date.now() / 1000),
                content: {
                    _: 'draftMessageContentText' as const,
                    text: { _: 'formattedText' as const, text: text!, entities: [] },
                },
            }
            : null;
        void tdlibSend({
            _: 'setChatDraftMessage',
            chat_id: cid,
            topic_id: draftTopicInput(tid),
            draft_message: body,
        } as any).catch((e) => {
            // 草稿同步失败不影响本地输入，仅记录
            console.warn('setChatDraftMessage failed:', e);
        });
    }

    /**
     * 把草稿同步到 TDLib（setChatDraftMessage）。
     * text 为空时传 null，等价于清除服务端草稿。
     * 防抖执行，避免输入过程中高频调用；若上一次待提交草稿属于其它聊天，先立即冲刷。
     */
    function syncTdlibDraft(cid: number, tid?: number | null, text?: string) {
        if (tdlibDraftTimer !== null) {
            window.clearTimeout(tdlibDraftTimer);
            tdlibDraftTimer = null;
        }
        // 跨聊天切换：立刻提交旧聊天草稿，防止被下面的新 pending 覆盖
        if (pendingTdlibDraft && pendingTdlibDraft.cid !== cid) {
            flushTdlibDraftNow();
        }
        pendingTdlibDraft = { cid, tid, text };
        tdlibDraftTimer = window.setTimeout(() => {
            tdlibDraftTimer = null;
            flushTdlibDraftNow();
        }, 400);
    }

    /**
     * 保存输入框草稿到本地缓存 + TDLib。
     * 跳过条件：
     * - 从未在该聊天输入过且输入框为空（不写空草稿，也不无故 clear）
     * - 输入框为空（仅当此前已同步过草稿时才通知 TDLib 清除）
     * - 与上次已同步草稿内容相同（无变化不重复保存）
     * @param targetChatId 目标聊天（切换时必须传「旧」chatId）；缺省用当前 chatId
     * @param targetTopicId 目标话题（配合 targetChatId）；缺省用当前 topicId
     */
    function saveDraft(targetChatId?: number, targetTopicId?: number | null) {
        const cid = targetChatId ?? chatId.value;
        if (cid === undefined) return;
        const tid = targetTopicId !== undefined ? targetTopicId : topicId.value;
        const text = messageInput.value;
        const emojis = pendingCustomEmoji.value;
        const key = draftCacheKey(cid, tid);
        const hasContent = !!text.trim() || emojis.length > 0;
        const prevText = lastSyncedDraftText.get(key);

        // 输入框为空：不保存草稿。仅当该聊天此前已有同步过的草稿时才 clear，
        // 避免从未输入过的聊天在离开时也发 setChatDraftMessage。
        if (!hasContent) {
            draftCache.delete(key);
            if (prevText !== undefined) {
                lastSyncedDraftText.delete(key);
                syncTdlibDraft(cid, tid, '');
            }
            return;
        }

        draftCache.set(key, { text, customEmojis: [...emojis] });
        while (draftCache.size > DRAFT_CACHE_MAX) {
            const oldest = draftCache.keys().next().value;
            if (oldest === undefined) break;
            draftCache.delete(oldest);
        }

        // 草稿与上次已同步内容相同：跳过 TDLib 写入
        if (prevText === text) return;

        lastSyncedDraftText.set(key, text);
        syncTdlibDraft(cid, tid, text);
    }

    /** 仅写入本地缓存（恢复远端草稿时用，避免回写 TDLib 造成无意义更新） */
    function putLocalDraft(cid: number, tid: number | null | undefined, entry: DraftEntry) {
        const key = draftCacheKey(cid, tid);
        draftCache.set(key, entry);
        lastSyncedDraftText.set(key, entry.text);
    }

    /**
     * 从缓存 / TDLib 草稿恢复到输入框。
     * 本地缓存优先；否则尝试从 chat.draft_message（TDLib）取文本草稿。
     */
    function restoreDraft(
        chatIdNum: number,
        tid?: number | null,
        remoteDraft?: { content?: { _?: string; text?: { text?: string } } } | null,
    ) {
        const key = draftCacheKey(chatIdNum, tid);
        const entry = draftCache.get(key);
        if (entry) {
            messageInput.value = entry.text;
            pendingCustomEmoji.value = [...entry.customEmojis];
            // 标记为已同步内容，避免未改动离开时重复写 TDLib
            if (!lastSyncedDraftText.has(key)) {
                lastSyncedDraftText.set(key, entry.text);
            }
            return;
        }
        const remoteText = remoteDraft?.content?._ === 'draftMessageContentText'
            ? (remoteDraft.content.text?.text ?? '')
            : '';
        if (remoteText) {
            messageInput.value = remoteText;
            pendingCustomEmoji.value = [];
            putLocalDraft(chatIdNum, tid, { text: remoteText, customEmojis: [] });
            return;
        }
        messageInput.value = '';
        pendingCustomEmoji.value = [];
    }

    /** 发送成功：清掉本地缓存与 TDLib 草稿（评论线程不触碰） */
    function clearDraft(cid: number, tid?: number | null) {
        const key = draftCacheKey(cid, tid);
        draftCache.delete(key);
        lastSyncedDraftText.delete(key);
        cancelLocalDraftTimer();
        if (!threadMode.value) syncTdlibDraft(cid, tid, '');
    }

    function cancelLocalDraftTimer() {
        if (localDraftTimer !== null) {
            window.clearTimeout(localDraftTimer);
            localDraftTimer = null;
        }
    }

    function cancelTdlibDraftTimer() {
        if (tdlibDraftTimer !== null) {
            window.clearTimeout(tdlibDraftTimer);
            tdlibDraftTimer = null;
        }
    }

    // 输入过程中防抖写入草稿（本地 + TDLib）；编辑模式不写草稿
    watch([messageInput, pendingCustomEmoji], () => {
        if (suppress.value) return;
        if (editingMsg.value) return;
        // 评论线程不写会话草稿（key 与主聊天相同，会覆盖主聊天草稿）
        if (threadMode.value) return;
        if (chatId.value === undefined) return;
        if (localDraftTimer !== null) window.clearTimeout(localDraftTimer);
        localDraftTimer = window.setTimeout(() => {
            localDraftTimer = null;
            if (suppress.value || editingMsg.value) return;
            saveDraft();
        }, 500);
    });

    // 线程 ↔ 会话视图切换时清空输入框，避免会话草稿文本被当成评论发出
    // （本 watcher 先于主加载 watcher 触发；load 流程结束的 finally 会解除抑制）
    watch(threadRootMsgId, () => {
        suppress.value = true;
        messageInput.value = '';
        pendingCustomEmoji.value = [];
    });

    return {
        saveDraft,
        restoreDraft,
        clearDraft,
        flushTdlibDraftNow,
        cancelLocalDraftTimer,
        cancelTdlibDraftTimer,
        syncTdlibDraft,
        putLocalDraft,
    };
}
