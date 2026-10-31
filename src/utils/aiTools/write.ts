/**
 * 写工具实现：发文本 / 发媒体 / 编辑 / 删除 / 封禁 / 裸调 TDLib。
 *
 * **这些工具本身不做审核** —— 审核在 call.ts 的 dispatchToolCall 里、实现体之前完成：
 * 没通过审核（策略 never / 没有审核通道 / 用户拒绝）根本走不到这里。
 * 所以这里只管"审核过了就照着确切参数执行"，不要自己再问一次。
 *
 * 媒体发送**复用应用自己的附件管线**（utils/attachmentSend.ts）：大小上限、图片 / 视频
 * 解码探测、GIF 归动画、探测失败降级成文档、相册分组全在那边，这里不再写第二套。
 *
 * 本文件只在应用内加载，自检脚本不导入它（纯逻辑在 format.ts，那边有自检）。
 */
import { stat } from "@tauri-apps/plugin-fs";
import type { formattedText, inputTextQuote } from "tdlib-types";
import { tdlibSend } from "../tdlib";
import { getMessagePlainText } from "../messageText";
import { buildMessageTopicInput } from "../directMessagesTopics";
import { classifyAttachment, sendAttachments } from "../attachmentSend";
import type { AttachmentItem } from "../../store/attachment";
import {
  registerImplementation,
  registerPrecheck,
  resolveToolThread,
  type ResolvedThread,
} from "./call.ts";
import { quotePosition } from "./format.ts";
import { singleResult } from "./limits.ts";
import { assertTdlibMethodAllowed } from "./policy.ts";
import type { ToolContext, ToolErrorResult, ToolOutcome, ToolResult } from "./types.ts";

function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`参数 ${name} 必须是数字`);
  return v;
}

function optNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * 发送 / 编辑的文本**统一**走 TDLib parseTextEntities + textParseModeMarkdown(version 2)
 * = Telegram Bot API **MarkdownV2**（严格模式：标记不合法直接报错）。
 * 解析不通过就**不发**，把原因回给模型改，不静默降级成纯文本 —— 否则模型以为格式生效了，
 * 用户看到的却是一堆转义反斜杠。
 */
async function formattedArgs(
  text: string,
  tool: string,
): Promise<{ text: formattedText } | { error: ToolErrorResult }> {
  if (!text) return { text: { _: "formattedText", text, entities: [] } };
  try {
    const parsed = await tdlibSend({
      _: "parseTextEntities",
      text,
      parse_mode: { _: "textParseModeMarkdown", version: 2 },
    });
    // TDLib 严格模式解析失败时可能返回空文本而不是 error：非空输入被啃成空 = 解析失败，别发空消息
    if (!parsed.text) {
      return markdownError(tool, "解析结果为空（正文只有未展开的标记）");
    }
    return { text: { _: "formattedText", text: parsed.text, entities: parsed.entities } };
  } catch (e) {
    return markdownError(tool, errText(e));
  }
}

/** MarkdownV2 解析失败的统一错误（不发送，回给模型改） */
function markdownError(tool: string, reason: string): { error: ToolErrorResult } {
  return {
    error: {
      tool,
      error: {
        code: "invalid_args",
        message:
          `MarkdownV2 解析失败，消息没有发送：${reason}。` +
          "请按 Telegram MarkdownV2 修正后重试（标记要成对；正文里的 _ * [ ] ( ) ~ > # + - = | { } . ! 都要转义）。",
      },
    },
  };
}

/**
 * MarkdownV2 预校验：解析不过就挡在审核之前（见 call.ts 的 registerPrecheck）。
 * 与 formattedArgs 共用同一条解析路径，只提前跑一次，避免用户白批卡片。
 */
async function markdownPrecheck(text: string, label: string): Promise<string[]> {
  const check = await formattedArgs(text, "");
  return "error" in check ? [`${label}：${check.error.error.message}`] : [];
}

/** TDLib 抛的是 {code, message} 对象（不是 Error），两种都要能读出人话 */
function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message ?? e);
  return e instanceof Error ? e.message : String(e);
}

/** 回复目标（与 attachmentSend 的 SendCtx.replyTo 同形，两边共用） */
type ReplyTo = {
  _: "inputMessageReplyToMessage";
  message_id: number;
  quote: inputTextQuote | null;
  checklist_task_id: number;
  poll_option_id: string;
};

/**
 * 构造回复目标。带 quote 时先取原消息纯文本再定位片段（TDLib 要的是 UTF-16 偏移）：
 * 片段在原消息里找不到就不带 quote（按整条回复发），并回一条警告 —— 绝不瞎猜位置。
 */
async function replyToOf(
  chatId: number,
  messageId: number | undefined,
  quoteText: string,
): Promise<{ replyTo: ReplyTo | null; warning?: string }> {
  if (!messageId) return { replyTo: null };
  const base: ReplyTo = {
    _: "inputMessageReplyToMessage",
    message_id: messageId,
    quote: null,
    checklist_task_id: 0,
    poll_option_id: "",
  };
  if (!quoteText) return { replyTo: base };

  const target = await tdlibSend({ _: "getMessage", chat_id: chatId, message_id: messageId });
  const position = quotePosition(getMessagePlainText(target), quoteText);
  if (position < 0) {
    return { replyTo: base, warning: "quote_not_found:引用的片段不在原消息里，已按整条回复发送" };
  }
  return {
    replyTo: {
      ...base,
      quote: {
        _: "inputTextQuote",
        text: { _: "formattedText", text: quoteText, entities: [] },
        // TDLib 1.8.69 的 inputTextQuote 新增 rich_texts：纯文本片段引用传空数组
        rich_texts: [],
        position,
      },
    },
  };
}

/**
 * 线程 → sendMessage 的 topic_id 形态（与对话页 outgoingTopicInput 同一套）：
 * 评论线程 messageTopicThread；论坛话题 messageTopicForum；频道私信 messageTopicDirectMessages。
 * 类型用错 TDLib 直接 400（错误信息只有 [object Object] 以前那样看不出）。
 */
function topicInputOf(t: ResolvedThread) {
  if (t.kind === "comment") return { _: "messageTopicThread", message_thread_id: t.id } as const;
  return buildMessageTopicInput(t.kind === "dm", t.id);
}

/**
 * thread_id 预校验（审核前挡，见 call.ts registerPrecheck）：
 * 普通会话上模型硬传 thread_id → 让它去掉参数重试，别让用户批一张带无效参数的卡片。
 * 合法性判定与实现体共用 resolveToolThread，两边不会打架。
 */
async function threadPrecheck(args: Record<string, unknown>, ctx: ToolContext): Promise<string[]> {
  const explicit = optNum(args.thread_id);
  if (explicit === undefined) return [];
  const chatId = typeof args.chat_id === "number" ? args.chat_id : NaN;
  if (!Number.isFinite(chatId)) return []; // chat_id 本身不合法由实现体 num() 报
  const resolved = await resolveToolThread(ctx, chatId, explicit);
  if (resolved) return [];
  return [
    "thread_id 不适用于本次调用：只有处于论坛话题、频道私信、评论线程时才需要 thread_id，" +
      "当前上下文不满足 —— 去掉 thread_id 后重试（不要改其他参数）。",
  ];
}

registerImplementation("send_message", async (args, ctx): Promise<ToolOutcome> => {
  const chatId = num(args.chat_id, "chat_id");
  const text = String(args.text ?? "");
  // thread_id 只在三种线程上下文生效（模型没带时跟着当前界面走）；
  // 非线程页直接不携带 topic_id 字段（TDLib 入参键不出现，不是传空值）
  const thread = await resolveToolThread(ctx, chatId, optNum(args.thread_id));
  const topic = thread ? topicInputOf(thread) : undefined;

  const reply = await replyToOf(chatId, optNum(args.reply_to_message_id), String(args.quote ?? ""));
  const content = await formattedArgs(text, "send_message");
  if ("error" in content) return content.error;

  const sent = await tdlibSend({
    _: "sendMessage",
    chat_id: chatId,
    ...(topic ? { topic_id: topic } : {}),
    // quote: null（没引用时）要转成缺省字段：TDLib 的入参只接受对象或省略，不接受 null
    ...(reply.replyTo ? { reply_to: { ...reply.replyTo, quote: reply.replyTo.quote ?? undefined } } : {}),
    input_message_content: {
      _: "inputMessageText",
      text: content.text,
    },
  });

  return singleResult(
    "send_message",
    {
      chat_id: sent.chat_id,
      message_id: sent.id,
      date: sent.date,
      text: getMessagePlainText(sent),
    },
    reply.warning ? { warnings: [reply.warning] } : undefined,
  );
});

/**
 * 发送本地媒体：路径 → 附件管线分类 → sendAttachments（相册 / 单条由它决定）。
 * 读不到或分类被拒的文件不整批失败，进 warnings 告诉模型哪些没发出去。
 */
registerImplementation("send_media", async (args, ctx): Promise<ToolOutcome> => {
  const chatId = num(args.chat_id, "chat_id");
  const paths = (Array.isArray(args.files) ? args.files : []).map((f) => String(f));
  const caption = String(args.caption ?? "");
  // 与 send_message 同一门控：只在三种线程上下文生效；非线程页直接不携带线程字段（键不出现，不是传空）
  const thread = await resolveToolThread(ctx, chatId, optNum(args.thread_id));
  const threadCtx = !thread
    ? {}
    : thread.kind === "comment"
      ? { threadId: thread.id }
      : { topicId: thread.id, isDm: thread.kind === "dm" };

  // 2GB 以上的文件要 Premium；拿不到登录信息时按非 Premium 保守处理
  const { useUserStore } = await import("../../store/user");
  const isPremium = !!useUserStore().userProfile?.is_premium;

  const items: AttachmentItem[] = [];
  const rejected: string[] = [];
  for (const path of paths) {
    const name = path.split(/[\\/]/).pop() || path;
    let size = 0;
    try {
      size = (await stat(path)).size;
    } catch {
      rejected.push(`${name}（读不到文件）`);
      continue;
    }
    const classified = await classifyAttachment({ path, name, size, album: items.length > 0, isPremium });
    if (classified.status === "rejected") {
      rejected.push(`${name}（${classified.reason}）`);
      continue;
    }
    items.push({
      id: `ai-media-${items.length}-${path}`,
      path,
      name,
      size,
      kind: classified.kind,
      width: classified.width,
      height: classified.height,
      duration: classified.duration,
      probeFailed: classified.probeFailed,
    });
  }
  if (!items.length) {
    return { tool: "send_media", error: { code: "invalid_args", message: `没有可发送的媒体：${rejected.join("；")}` } };
  }

  const reply = await replyToOf(chatId, optNum(args.reply_to_message_id), String(args.quote ?? ""));
  const cap = await formattedArgs(caption, "send_media");
  if ("error" in cap) return cap.error;
  const result = await sendAttachments(items, { chatId, ...threadCtx, replyTo: reply.replyTo }, cap.text);

  // sendAttachments 返回是否全部成功（失败原因在应用日志里），这里照实告诉模型，别假装发成功了
  if (!result.ok) {
    return { tool: "send_media", error: { code: "internal", message: "媒体发送失败（部分或全部），详见应用日志" } };
  }

  const warnings = [
    ...(reply.warning ? [reply.warning] : []),
    ...(rejected.length ? [`部分文件未发送：${rejected.join("；")}`] : []),
  ];
  return singleResult(
    "send_media",
    { chat_id: chatId, sent: items.map((it) => ({ name: it.name, kind: it.kind })) },
    warnings.length ? { warnings } : undefined,
  );
});

registerImplementation("edit_message", async (args): Promise<ToolOutcome> => {
  const content = await formattedArgs(String(args.text ?? ""), "edit_message");
  if ("error" in content) return content.error;

  const edited = await tdlibSend({
    _: "editMessageText",
    chat_id: num(args.chat_id, "chat_id"),
    message_id: num(args.message_id, "message_id"),
    input_message_content: {
      _: "inputMessageText",
      text: content.text,
    },
  });
  return singleResult("edit_message", {
    chat_id: edited.chat_id,
    message_id: edited.id,
    edit_date: edited.edit_date,
    text: getMessagePlainText(edited),
  });
});

// MarkdownV2 预校验：解析不过就挡在审核之前（用户不会为一次注定失败的消息白批卡片）。
// 预校验用的解析路径与实现体完全相同，只是提前跑一次。
// thread_id 合法性也在审核前挡：无效参数不让用户白批，模型去掉后直接重试。
registerPrecheck("send_message", async (a, ctx) => [
  ...(await threadPrecheck(a, ctx)),
  ...(await markdownPrecheck(String(a.text ?? ""), "text")),
]);
registerPrecheck("send_media", async (a, ctx) => [
  ...(await threadPrecheck(a, ctx)),
  ...(await markdownPrecheck(String(a.caption ?? ""), "caption")),
]);
registerPrecheck("edit_message", (a) => markdownPrecheck(String(a.text ?? ""), "text"));

registerImplementation("delete_message", async (args): Promise<ToolResult<unknown>> => {
  const chatId = num(args.chat_id, "chat_id");
  const messageId = num(args.message_id, "message_id");
  const revoke = args.revoke !== false; // 默认对所有人撤回
  await tdlibSend({ _: "deleteMessages", chat_id: chatId, message_ids: [messageId], revoke });
  return singleResult("delete_message", { chat_id: chatId, message_id: messageId, revoke, deleted: true });
});

registerImplementation("ban_member", async (args): Promise<ToolResult<unknown>> => {
  const chatId = num(args.chat_id, "chat_id");
  const memberId = num(args.member_id, "member_id");
  const untilDate = optNum(args.until_date) ?? 0; // 0 = 永久
  // 只封禁、不碰历史消息：banChatMember 的 revoke_messages 在超级群 / 频道会被
  // TDLib 强制为 true（等于顺手删光该成员的消息），所以这里直接改成员状态。
  await tdlibSend({
    _: "setChatMemberStatus",
    chat_id: chatId,
    member_id: { _: "messageSenderUser", user_id: memberId },
    status: { _: "chatMemberStatusBanned", banned_until_date: untilDate },
  });
  return singleResult("ban_member", {
    chat_id: chatId,
    member_id: memberId,
    banned_until_date: untilDate,
    banned: true,
    messages_deleted: false,
  });
});

/**
 * 硬拒绝：账户 / 会话 / 离开 / 转让这类方法即使审核通过也不执行，规则在 policy.ts
 * （退出登录、注销账号、换手机号、退出群组、转让群主… 只能用户自己在应用里做）。
 */
registerImplementation("call_tdlib_method", async (args): Promise<ToolResult<unknown>> => {
  const method = String(args.method ?? "");
  const params = (args.params && typeof args.params === "object" ? args.params : {}) as Record<string, unknown>;
  assertTdlibMethodAllowed(method, params);
  // 裸调：返回原样结果（体积自负）
  const res = await tdlibSend({ _: method, ...params } as never);
  return singleResult("call_tdlib_method", { method, result: res }, { warnings: ["raw_result:未做裁剪，注意上下文体积"] });
});
