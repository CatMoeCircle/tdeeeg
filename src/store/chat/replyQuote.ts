import { ref } from "vue";

/**
 * 「引用回复」的跳转聚焦状态。
 *
 * 回复/引用消息的 `reply_to.quote`（TDLib `textQuote`）只引用了原消息的一段文字。
 * 点回复栏跳回去时，整条消息被 flash 高亮还不够：长消息里被引用的那一段可能根本
 * 不在视口内。这里保存一次性的「要框选哪一段」请求，由原消息的正文组件据此把
 * 对应文字按选区样式框出来，并由会话列表把这段滚进视口。
 *
 * 生命周期：请求写入后 2.6s 自动清空（与 CSS 闪烁动画同时结束）。
 */

/** 被引用片段（TDLib `textQuote` 的展示用子集） */
export interface ReplyQuoteRef {
    /** 引用原文（可能为空：富文本消息的引用不带纯文本） */
    text: string;
    /** 发送方给出的近似位置（UTF-16 码元，只是提示，需要按原文再定位） */
    position: number;
    /** 是否由发送者手动选择（自动引用更可能定位不准） */
    isManual: boolean;
}

/** 当前生效的框选聚焦请求 */
export interface ReplyQuoteFocus extends ReplyQuoteRef {
    /** 被引用的消息 id */
    messageId: number;
    /** 被引用消息所属会话；缺省表示不校验（同会话跳转） */
    chatId?: number;
    /** 每次请求自增，便于区分「同一段被再次引用」 */
    nonce: number;
}

/**
 * 框选保持时长：与会话列表「大框 → 收拢 → 停留 → 瞬间消失」的时间线一致
 * （260ms 大框 + 500ms 收拢 + 1640ms 停留 ≈ 2400ms）。
 * 正文里的引用底色不做淡出：它包着文字本身，任何透明度过渡都会让字跟着变淡。
 */
const FOCUS_DURATION_MS = 2400;

/** 跳转动画（滚动 + 定位）可能耗时，先给一个不会提前到期的兜底时长 */
const FOCUS_PENDING_MS = 6000;

/** 当前生效的框选聚焦请求（null = 无） */
export const replyQuoteFocus = ref<ReplyQuoteFocus | null>(null);

let focusNonce = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** 取消自动清除计时 */
function cancelClearTimer() {
    if (clearTimer !== null) {
        clearTimeout(clearTimer);
        clearTimer = null;
    }
}

/** 清空框选聚焦（切会话、用户接管滚动、跳转到别处时调用） */
export function clearReplyQuoteFocus() {
    cancelClearTimer();
    replyQuoteFocus.value = null;
}

/** 发起一次框选聚焦：跳转到被引用消息后由正文组件消费 */
export function requestReplyQuoteFocus(req: {
    messageId: number;
    chatId?: number;
    text: string;
    position?: number;
    isManual?: boolean;
}) {
    if (!req.text) {
        clearReplyQuoteFocus();
        return;
    }
    cancelClearTimer();
    focusNonce += 1;
    replyQuoteFocus.value = {
        messageId: req.messageId,
        chatId: req.chatId,
        text: req.text,
        position: Number.isFinite(req.position) ? Number(req.position) : 0,
        isManual: !!req.isManual,
        nonce: focusNonce,
    };
    clearTimer = setTimeout(() => {
        clearTimer = null;
        replyQuoteFocus.value = null;
    }, FOCUS_PENDING_MS);
}

/**
 * 重新计时框选保持时长。
 *
 * 由会话列表在**收框动画真正开始**时调用：请求是点击回复栏那一刻发出的，
 * 到原消息跳到视口里可能要几百毫秒，若两处各按自己的计时器走，
 * 文字底色会先于外框消失。这里把两者对齐到同一时刻。
 */
export function holdReplyQuoteFocus(ms: number = FOCUS_DURATION_MS) {
    if (!replyQuoteFocus.value) return;
    cancelClearTimer();
    clearTimer = setTimeout(() => {
        clearTimer = null;
        replyQuoteFocus.value = null;
    }, ms);
}

/** 取某条消息当前生效的框选请求（会话不匹配返回 null） */
export function getReplyQuoteFocusFor(messageId: number, chatId?: number): ReplyQuoteFocus | null {
    const focus = replyQuoteFocus.value;
    if (!focus || focus.messageId !== messageId) return null;
    if (focus.chatId != null && chatId != null && focus.chatId !== chatId) return null;
    return focus;
}

export interface QuoteTextRange {
    /** 起始下标（UTF-16） */
    start: number;
    /** 结束下标（不含） */
    end: number;
}

/**
 * 在原文里定位被引用片段。
 *
 * `textQuote.position` 是「发送者给的近似位置」，不能直接当答案（不同客户端/编辑过的
 * 消息都可能偏）。策略：列出片段所有出现位置，取离 position 最近的一处；
 * 完全找不到返回 null —— 宁可不高亮，也不框错一段文字。
 */
export function locateQuoteRange(text: string, quote: { text: string; position: number }): QuoteTextRange | null {
    if (!text || !quote.text) return null;
    // 引用文本两端可能带空白（手动选择时常见），先按原样、再按 trim 过的文本匹配
    const candidates = [quote.text];
    const trimmed = quote.text.trim();
    if (trimmed && trimmed !== quote.text) candidates.push(trimmed);

    const approx = Number.isFinite(quote.position) ? Math.max(0, Number(quote.position)) : 0;

    for (const candidate of candidates) {
        if (!candidate) continue;
        let best = -1;
        let from = 0;
        while (from <= text.length) {
            const idx = text.indexOf(candidate, from);
            if (idx < 0) break;
            if (best < 0 || Math.abs(idx - approx) < Math.abs(best - approx)) best = idx;
            from = idx + 1;
        }
        if (best >= 0) return { start: best, end: best + candidate.length };
    }
    return null;
}
