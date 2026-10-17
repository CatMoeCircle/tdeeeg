import { tdlibSend } from "../../utils/tdlib";
import { getMessagePlainText } from "../../utils/messageText";
import { messageSenderKey } from "../../utils/senderInfo";
import { toast } from "../../utils/toast";
import i18n from "../../i18n";

const t = (key: string, params?: Record<string, unknown>) =>
  i18n.global.t(key, params as any);
import { TrashIcon } from "lucide-vue-next";
import type {
  message,
  messageProperties,
  MessageSender,
  formattedText$Input,
  textEntity$Input,
  foundChatMessages,
} from "tdlib-types";
import type { ContextMenuItem } from "./types";
import type {
  DeleteMessageResult,
  DeleteSenderInfo,
} from "../../store/deleteMessage";

/* =========================================================================
 * 基于 getMessageProperties 的精确权限能力模块
 *
 * TDLib 提供离线方法 getMessageProperties，返回 messageProperties —— 描述
 * 当前用户此刻可对某条消息执行的所有操作。这是判断菜单项可用性的权威来源，
 * 比本地猜测（isServiceMessage、is_outgoing 等）更精确。
 * ========================================================================= */

/** 属性缓存 key：chatId:msgId */
function propsKey(chatId: number, msgId: number): string {
  return `${chatId}:${msgId}`;
}

/** 已获取到的 messageProperties 缓存（Map 非响应式，仅作查询缓存） */
const propsCache = new Map<string, messageProperties>();
/** 正在加载中的请求，去重避免并发重复调用 */
const pendingProps = new Map<string, Promise<messageProperties | null>>();

/**
 * 调用 getMessageProperties 获取某条消息的属性。
 * 离线方法，走本地缓存立即返回；失败返回 null。
 */
export async function getMessageProperties(
  chatId: number,
  msgId: number,
): Promise<messageProperties | null> {
  const key = propsKey(chatId, msgId);
  if (propsCache.has(key)) return propsCache.get(key)!;
  if (pendingProps.has(key)) return pendingProps.get(key)!;

  const p = (async () => {
    try {
      const res = (await tdlibSend({
        _: "getMessageProperties",
        chat_id: chatId,
        message_id: msgId,
      })) as messageProperties;
      if (res && res._ === "messageProperties") {
        propsCache.set(key, res);
        return res;
      }
      return null;
    } catch (e) {
      console.warn("getMessageProperties failed:", e);
      return null;
    } finally {
      pendingProps.delete(key);
    }
  })();

  pendingProps.set(key, p);
  return p;
}

/** 同步读取某条消息的已缓存属性；未加载返回 undefined */
export function getCachedMessageProperties(
  chatId: number,
  msgId: number,
): messageProperties | undefined {
  return propsCache.get(propsKey(chatId, msgId));
}

/** 清空属性缓存（切换账号/清空线程时调用） */
export function clearMessagePropertiesCache() {
  propsCache.clear();
}

/**
 * 从消息读取属性（优先缓存，其次 msg 内联字段，最后空对象）。
 * 未命中缓存时以乐观值兜底，保证菜单可先渲染。
 */
function propsOf(chatId: number, msg: message): messageProperties {
  const cached = propsCache.get(propsKey(chatId, msg.id));
  if (cached) return cached;
  const inline = msg as any;
  // 若 message 对象已内联携带（部分 TDLib 版本会在 messageProperties 之外附带），
  // 也可复用；否则返回空属性让上层兜底判断。
  return (inline.properties as messageProperties) ?? ({} as messageProperties);
}

/** 消息是否为系统/服务消息（无操作菜单） */
export function isServiceMessage(msg: message): boolean {
  const c = msg.content;
  if (!c) return true;
  switch (c._) {
    case "messageBasicGroupChatCreate":
    case "messageChatAddMembers":
    case "messageChatChangePhoto":
    case "messageChatChangeTitle":
    case "messageChatDeleteMember":
    case "messageChatDeletePhoto":
    case "messageChatJoinByLink":
    case "messageChatJoinByRequest":
    case "messageChatJoinFromCommunity":
    case "messageChatUpgradeFrom":
    case "messageChatUpgradeTo":
    case "messageCustomServiceAction":
    case "messageGameScore":
    case "messageGiftedPremium":
    case "messageInviteVideoChatParticipants":
    case "messagePassportDataReceived":
    case "messagePaymentSuccessful":
    case "messagePaymentSuccessfulBot":
    case "messagePinMessage":
    case "messageProximityAlertTriggered":
    case "messageScreenshotTaken":
    case "messageVideoChatEnded":
    case "messageVideoChatScheduled":
    case "messageVideoChatStarted":
    case "messageWebAppDataReceived":
    case "messageSuggestProfilePhoto":
    case "messageForumTopicCreated":
    case "messageForumTopicEdited":
    case "messageForumTopicIsClosedToggled":
      return true;
    default:
      return false;
  }
}

/** 消息是否能被当前用户删除（自己可删或全部可删） */
export function canDeleteMessage(msg: message, chatId?: number): boolean {
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  return (
    cp.can_be_deleted_only_for_self === true ||
    cp.can_be_deleted_for_all_users === true
  );
}

/**
 * 构造删除菜单子项（“为所有人删除” / “为我删除”）。
 * 依据 TDLib messageProperties 动态生成，无权限的选项不会被加入。
 */
export function buildDeleteMenuItems(
  chatId: number,
  msg: message,
  onDone?: () => void,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const p = propsOf(chatId, msg);
  const canAll = p.can_be_deleted_for_all_users === true;
  const canSelf = p.can_be_deleted_only_for_self === true;

  /** 为所有人删除需要二次确认；为我删除直接执行 */
  const ask = (revoke: boolean): boolean => {
    if (!revoke) return true;
    return window.confirm(t("lng_selected_delete_sure_this"));
  };

  if (canAll) {
    items.push({
      key: "delete-for-all",
      label: t("lng_delete_for_everyone_check"),
      icon: TrashIcon,
      danger: true,
      onClick: async () => {
        if (ask(true)) {
          await deleteMessages(chatId, msg, true);
          onDone?.();
        }
      },
    });
  }
  if (canSelf) {
    items.push({
      key: "delete-for-self",
      label: t("context.deleteForMe"),
      icon: TrashIcon,
      danger: true,
      onClick: async () => {
        if (ask(false)) {
          await deleteMessages(chatId, msg, false);
          onDone?.();
        }
      },
    });
  }
  return items;
}

/** 消息是否能被置顶或取消置顶（按 messageProperties.can_be_pinned） */
export function canPinMessage(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_be_pinned !== undefined) return cp.can_be_pinned === true;
  // 属性未加载时乐观返回 true（具体由 pinChatMessage 报错兜底）
  return true;
}

/** 消息是否能被转发（messageProperties.can_be_forwarded） */
export function canForwardMessage(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_be_forwarded !== undefined) return cp.can_be_forwarded === true;
  return (msg as any).can_be_forwarded !== false;
}

/** 消息是否可复制文本/媒体描述（受 can_be_copied 与内容文本约束） */
export function canCopyMessage(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  if (getMessagePlainText(msg).trim().length === 0) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_be_copied !== undefined) return cp.can_be_copied === true;
  return true;
}

/** 消息是否可复制链接（messageProperties.can_get_link） */
export function canGetMessageLink(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_get_link !== undefined) return cp.can_get_link === true;
  return true;
}

/** 消息是否可回复（messageProperties.can_be_replied） */
export function canReplyMessage(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_be_replied !== undefined) return cp.can_be_replied === true;
  return true;
}

/**
 * 消息是否可编辑。
 * - 快捷回复：以 quickReplyMessage.can_be_edited 为准（走 editQuickReplyMessage）
 * - 普通消息：以 getMessageProperties → messageProperties.can_be_edited 为准
 * 客户端不自行按类型/发送者/时限等推算，最终权限由 Telegram/TDLib 校验；
 * 属性未加载时仅作乐观占位（可先渲染菜单），点击后仍由 TDLib 决定成败。
 */
export function canEditMessage(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;

  // 快捷回复消息（与普通 message 形态不同）
  const qr = msg as unknown as { _?: string; can_be_edited?: boolean };
  if (qr._ === "quickReplyMessage") {
    return qr.can_be_edited === true;
  }

  // 普通消息：优先 MessageProperties.can_be_edited
  if (chatId !== undefined) {
    const p = propsOf(chatId, msg);
    if (p?.can_be_edited !== undefined) return p.can_be_edited === true;
  }
  const inline = (msg as unknown as { can_be_edited?: boolean }).can_be_edited;
  if (inline !== undefined) return inline === true;
  // 属性未就绪时乐观放行；提交编辑时仍由 TDLib 拒绝非法操作
  return true;
}

/** 消息是否可保存到收藏（messageProperties.can_be_saved） */
export function canSaveMessage(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_be_saved !== undefined) return cp.can_be_saved === true;
  return true;
}

/** 消息是否可查看回应者（messageProperties.can_get_viewers） */
export function canGetViewers(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_get_viewers !== undefined) return cp.can_get_viewers === true;
  return false;
}

/** 消息是否可查看阅读者（messageProperties.can_get_read_date） */
export function canGetReadDate(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_get_read_date !== undefined) return cp.can_get_read_date === true;
  return false;
}

/** 消息是否可查看真实作者（messageProperties.can_get_author） */
export function canGetAuthor(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_get_author !== undefined) return cp.can_get_author === true;
  return false;
}

/** 消息是否可查看消息线程（messageProperties.can_get_message_thread） */
export function canGetMessageThread(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_get_message_thread !== undefined)
    return cp.can_get_message_thread === true;
  return false;
}

/** 消息是否可语音转文字（messageProperties.can_recognize_speech） */
export function canRecognizeSpeech(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_recognize_speech !== undefined)
    return cp.can_recognize_speech === true;
  return false;
}

/** 消息是否可举报（messageProperties.can_report_chat 或 can_report_supergroup_spam） */
export function canReportMessage(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_report_chat !== undefined) return cp.can_report_chat === true;
  if (cp.can_report_supergroup_spam !== undefined)
    return cp.can_report_supergroup_spam === true;
  return false;
}

/** 消息是否可编辑媒体（messageProperties.can_edit_media） */
export function canEditMedia(msg: message, chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  let p: messageProperties | undefined;
  if (chatId !== undefined) p = propsOf(chatId, msg);
  const cp = p ?? (msg as any);
  if (cp.can_edit_media !== undefined) return cp.can_edit_media === true;
  return false;
}

/**
 * 投票消息是否可撤回自己的投票：已投票、投票未关闭，且允许重新投票。
 * allows_revoting=false 时投票只能提交一次，撤回同样属于修改已投选项，
 * 服务端不会接受，因此菜单中不应展示“撤回投票”。
 */
export function canRetractPollVote(msg: message): boolean {
  if (msg.content._ !== "messagePoll") return false;
  const poll = msg.content.poll;
  return (
    !poll.is_closed &&
    poll.allows_revoting &&
    poll.options.some((o) => o.is_chosen)
  );
}

/**
 * 投票消息是否可停止投票（仅发起人 / 有权限的管理员）。
 * 以 messageProperties.can_be_edited 为准（投票消息上表示能否调用 stopPoll）；
 * 属性未加载时不乐观放行，避免普通成员看到无权操作的菜单项。
 */
export function canStopPoll(msg: message, chatId?: number): boolean {
  if (msg.content._ !== "messagePoll") return false;
  if (msg.content.poll.is_closed) return false;
  if (chatId === undefined) return false;
  return getCachedMessageProperties(chatId, msg.id)?.can_be_edited === true;
}

/** 撤回投票（setPollAnswer 传空选项） */
export async function retractPollVote(chatId: number, msg: message) {
  try {
    await tdlibSend({
      _: "setPollAnswer",
      chat_id: chatId,
      message_id: msg.id,
      option_ids: [],
    });
  } catch (e: any) {
    toast.error(e?.message || t("content.voteFailed"));
  }
}

/** 停止投票（stopPoll），停止后任何人都不能再投票 */
export async function stopPollMessage(chatId: number, msg: message) {
  try {
    await tdlibSend({
      _: "stopPoll",
      chat_id: chatId,
      message_id: msg.id,
    });
  } catch (e: any) {
    toast.error(e?.message || t("context.actionFailed"));
  }
}

/** 编辑消息文本（editMessageText + inputMessageText） */
export async function editTextMessage(
  chatId: number,
  messageId: number,
  text: string,
  entities?: textEntity$Input[],
): Promise<boolean> {
  try {
    const content: formattedText$Input = {
      _: "formattedText",
      text,
      entities: entities ?? [],
    };
    await tdlibSend({
      _: "editMessageText",
      chat_id: chatId,
      message_id: messageId,
      input_message_content: {
        _: "inputMessageText",
        text: content,
        // 编辑消息与草稿无关，绝不能 clear_draft，否则会误删本聊天草稿
        clear_draft: false,
      },
    } as any);
    return true;
  } catch (e) {
    console.error("editMessageText failed:", e);
    toast.error({ content: t("context.editFailed"), placement: "center" });
    return false;
  }
}

/** 编辑媒体消息描述（editMessageCaption）；传空文本时移除描述 */
export async function editCaptionMessage(
  chatId: number,
  messageId: number,
  text: string,
  entities?: textEntity$Input[],
): Promise<boolean> {
  try {
    const caption = text.trim()
      ? ({
          _: "formattedText",
          text,
          entities: entities ?? [],
        } as formattedText$Input)
      : null;
    await tdlibSend({
      _: "editMessageCaption",
      chat_id: chatId,
      message_id: messageId,
      caption,
    } as any);
    return true;
  } catch (e) {
    console.error("editMessageCaption failed:", e);
    toast.error({ content: t("context.editDescFailed"), placement: "center" });
    return false;
  }
}

/**
 * 更换媒体内容（editMessageMedia）。
 * 仅当媒体本身被替换时使用；只改描述请走 editMessageCaption。
 */
export async function editMessageMediaContent(
  chatId: number,
  messageId: number,
  inputMessageContent: Record<string, unknown>,
): Promise<boolean> {
  try {
    await tdlibSend({
      _: "editMessageMedia",
      chat_id: chatId,
      message_id: messageId,
      input_message_content: inputMessageContent,
    } as any);
    return true;
  } catch (e) {
    console.error("editMessageMedia failed:", e);
    toast.error({
      content: t("context.replaceMediaFailed"),
      placement: "center",
    });
    return false;
  }
}

/**
 * 置顶消息。
 * - disableNotification：静默置顶（不通知成员），仅群组有效；
 * - onlyForSelf：仅为自己置顶，仅私聊有效。
 */
export async function pinMessage(
  chatId: number,
  msg: message,
  opts?: { disableNotification?: boolean; onlyForSelf?: boolean },
) {
  try {
    await tdlibSend({
      _: "pinChatMessage",
      chat_id: chatId,
      message_id: msg.id,
      disable_notification: opts?.disableNotification ?? false,
      only_for_self: opts?.onlyForSelf ?? false,
    } as any);
    toast.success(t("lng_quick_dialog_action_toast_pin_success"));
  } catch (e: any) {
    toast.error(e?.message || t("context.actionFailed"));
  }
}

/** 取消置顶 */
export async function unpinMessage(chatId: number, msg: message) {
  try {
    await tdlibSend({
      _: "unpinChatMessage",
      chat_id: chatId,
      message_id: msg.id,
    });
    toast.success(t("lng_quick_dialog_action_toast_unpin_success"));
  } catch (e: any) {
    toast.error(e?.message || t("context.actionFailed"));
  }
}

/** 开关消息置顶 */
export async function toggleMessagePinned(chatId: number, msg: message) {
  if (msg.is_pinned) {
    await unpinMessage(chatId, msg);
  } else {
    await pinMessage(chatId, msg);
  }
}

/** 批量删除消息（多选删除与单选删除共用） */
export async function deleteMessagesByIds(
  chatId: number,
  ids: number[],
  revoke: boolean,
) {
  try {
    await tdlibSend({
      _: "deleteMessages",
      chat_id: chatId,
      message_ids: ids,
      revoke,
    });
    toast.success(t("context.deleted"));
  } catch (e: any) {
    toast.error(e?.message || t("context.deleteFailed"));
  }
}

/** 删除消息 */
export async function deleteMessages(
  chatId: number,
  msg: message,
  revoke: boolean,
) {
  await deleteMessagesByIds(chatId, [msg.id], revoke);
}

/**
 * 删除某发送者在当前对话中的所有消息（deleteChatMessagesBySender）。
 * 仅超级群组支持，需 can_delete_messages 管理员权限。
 */
export async function deleteChatMessagesBySender(
  chatId: number,
  senderId: MessageSender,
) {
  try {
    await tdlibSend({
      _: "deleteChatMessagesBySender",
      chat_id: chatId,
      sender_id: senderId as any,
    });
    toast.success(t("context.deletedAllFromSender"));
  } catch (e: any) {
    toast.error(e?.message || t("context.deleteAllFromSenderFailed"));
  }
}

/**
 * 封禁某发送者（banChatMember）。
 * 需 can_restrict_members 管理员权限；超级群组/频道会同时删除其消息。
 */
export async function banChatSender(chatId: number, senderId: MessageSender) {
  try {
    await tdlibSend({
      _: "banChatMember",
      chat_id: chatId,
      member_id: senderId as any,
      banned_until_date: 0, // 0 = 永久封禁
      revoke_messages: true,
    });
    toast.success(t("context.bannedSender"));
  } catch (e: any) {
    toast.error(e?.message || t("context.banFailed"));
  }
}

/**
 * 删除某发送者在当前对话中留下的所有回应（reaction）。
 * 仅基础群/超级群，需 can_delete_messages；TDLib 只支持删除「最近的」reaction。
 */
export async function deleteAllReactionsFromSender(
  chatId: number,
  sender: MessageSender,
) {
  try {
    await tdlibSend({
      _: "deleteAllRecentMessageReactionsFromSender",
      chat_id: chatId,
      sender_id: sender as any,
    });
    toast.success(t("context.deleted"));
  } catch (e: any) {
    toast.error(e?.message || t("context.deleteFailed"));
  }
}

/**
 * 按删除弹窗的结果组合执行删除动作：
 *  - deleteMessages          → deleteMessages（删除选中的消息，按 revoke 决定是否对所有人）
 *  - deleteAllSenderKeys     → deleteChatMessagesBySender（逐个删除发送者的全部消息）
 *  - deleteReactionsSenderKeys → deleteAllRecentMessageReactionsFromSender（删除其全部回应）
 *  - banSenderKeys           → banChatMember（逐个封禁发送者，跳过不可封禁的成员）
 *  - reportSenderKeys        → reportSupergroupSpam（只举报勾选发送者的消息）
 * 逐项执行，单项失败不影响其余项。
 */
export async function executeDeleteActions(
  chatId: number,
  msgs: message[],
  senders: DeleteSenderInfo[],
  result: DeleteMessageResult,
  supergroupId?: number,
) {
  // 封禁（优先级最高，通常同时删除消息）；不可封禁的成员直接跳过
  const banKeys = new Set(result.banSenderKeys);
  if (banKeys.size > 0) {
    for (const s of senders) {
      if (s.canBan && banKeys.has(s.key)) await banChatSender(chatId, s.sender);
    }
  }
  // 删除各发送者的所有消息
  const deleteAllKeys = new Set(result.deleteAllSenderKeys);
  if (deleteAllKeys.size > 0) {
    for (const s of senders) {
      if (s.canDeleteAll && deleteAllKeys.has(s.key))
        await deleteChatMessagesBySender(chatId, s.sender);
    }
  }
  // 删除各发送者的所有回应
  const reactionKeys = new Set(result.deleteReactionsSenderKeys);
  if (reactionKeys.size > 0) {
    for (const s of senders) {
      if (s.canDeleteReactions && reactionKeys.has(s.key))
        await deleteAllReactionsFromSender(chatId, s.sender);
    }
  }
  // 举报勾选发送者的消息
  if (result.reportSenderKeys.length > 0 && supergroupId) {
    const reportKeys = new Set(result.reportSenderKeys);
    const ids = msgs
      .filter(
        (m) => !!m.sender_id && reportKeys.has(messageSenderKey(m.sender_id)),
      )
      .map((m) => m.id);
    if (ids.length > 0) await reportSupergroupSpam(supergroupId, ids);
  }
  // 删除选中的消息
  if (result.deleteMessages) {
    await deleteMessagesByIds(
      chatId,
      msgs.map((m) => m.id),
      result.revoke,
    );
  }
}

/** 举报消息为垃圾信息（仅超级群管理员，需 can_report_supergroup_spam） */
export async function reportSupergroupSpam(
  supergroupId: number,
  messageIds: number[],
) {
  try {
    await tdlibSend({
      _: "reportSupergroupSpam",
      supergroup_id: supergroupId,
      message_ids: messageIds,
    });
    toast.success(t("lng_report_spam_thanks"));
  } catch (e: any) {
    toast.error(e?.message || t("chat.reportFailed"));
  }
}

/**
 * 查询某发送者在对话中的消息总数（searchChatMessages 的 total_count 为近似值）。
 * 仅用于弹窗标题计数，失败返回 -1 表示未知。
 */
export async function searchSenderMessageCount(
  chatId: number,
  sender: MessageSender,
): Promise<number> {
  try {
    const res = (await tdlibSend({
      _: "searchChatMessages",
      chat_id: chatId,
      query: "",
      sender_id: sender as any,
      from_message_id: 0,
      offset: 0,
      limit: 1,
    })) as foundChatMessages;
    return typeof res?.total_count === "number" ? res.total_count : -1;
  } catch {
    return -1;
  }
}

/** 复制消息文本 */
export async function copyMessageText(msg: message) {
  const text = getMessagePlainText(msg);
  if (!text.trim()) {
    toast.warning(t("context.noCopyableText"));
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("context.copied"));
  } catch {
    toast.error(t("context.copyFailed"));
  }
}

/** 复制消息原始 JSON 到剪贴板（开发调试用） */
export async function copyMessageJson(msg: message) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(msg, null, 2));
    toast.success(t("context.copiedJson"));
  } catch {
    toast.error(t("context.copyFailed"));
  }
}

/** 复制消息链接 */
export async function copyMessageLink(chatId: number, msg: message) {
  try {
    // getMessageLink 需要传入 media_timestamp 或 0（默认）
    const link = (await tdlibSend({
      _: "getMessageLink",
      chat_id: chatId,
      message_id: msg.id,
      media_timestamp: 0,
      for_album: false,
      in_message_thread: false,
    })) as any;
    const url = link?.link;
    if (!url) {
      toast.warning(t("context.linkUnavailable"));
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success(t("lng_chat_link_copied"));
  } catch (e: any) {
    toast.error(e?.message || t("context.linkFailed"));
  }
}

// ==================== Reactions ====================

import type { ReactionType, ReactionType$Input } from "tdlib-types";
import { isSameReactionType } from "../../utils/reactionHelpers";

/** 检查消息是否可以添加回应（非服务消息即可） */
export function canAddReaction(msg: message, _chatId?: number): boolean {
  if (isServiceMessage(msg)) return false;
  // 服务消息不支持回应
  // 具体权限由 TDLib 在 addMessageReaction 时校验
  return true;
}

/** 切换消息的回应（已选则移除，未选则添加） */
export async function toggleReaction(
  chatId: number,
  msg: message,
  reactionType: ReactionType,
): Promise<void> {
  // 消息归属会话优先（评论线程中消息在讨论组，与当前频道 chat_id 不同）
  const targetChatId = msg.chat_id || chatId;
  const isChosen =
    msg.interaction_info?.reactions?.reactions?.some(
      (r) => r.is_chosen && isSameReactionType(r.type, reactionType),
    ) ?? false;

  try {
    if (isChosen) {
      await tdlibSend({
        _: "removeMessageReaction",
        chat_id: targetChatId,
        message_id: msg.id,
        reaction_type: reactionType as ReactionType$Input,
      });
    } else {
      await tdlibSend({
        _: "addMessageReaction",
        chat_id: targetChatId,
        message_id: msg.id,
        reaction_type: reactionType as ReactionType$Input,
        is_big: false,
        update_recent_reactions: true,
      });
    }
  } catch (e: any) {
    console.warn("toggleReaction failed:", e);
    // 不弹错误提示，TDLib 会在 update 中反映最终状态
  }
}

/** 快速添加回应（用于快捷点击，默认大动画） */
export async function addQuickReaction(
  chatId: number,
  msg: message,
  reactionType: ReactionType,
): Promise<void> {
  const isChosen =
    msg.interaction_info?.reactions?.reactions?.some(
      (r) => r.is_chosen && isSameReactionType(r.type, reactionType),
    ) ?? false;

  try {
    if (isChosen) {
      await tdlibSend({
        _: "removeMessageReaction",
        chat_id: chatId,
        message_id: msg.id,
        reaction_type: reactionType as ReactionType$Input,
      });
    } else {
      await tdlibSend({
        _: "addMessageReaction",
        chat_id: chatId,
        message_id: msg.id,
        reaction_type: reactionType as ReactionType$Input,
        is_big: true,
        update_recent_reactions: true,
      });
    }
  } catch (e: any) {
    console.warn("addQuickReaction failed:", e);
  }
}
