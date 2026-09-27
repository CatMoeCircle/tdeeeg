import type {
  chatEvent,
  ChatEventAction,
  chat,
  message,
  chatPhotoInfo,
  profilePhoto,
  ChatMemberStatus,
} from "tdlib-types";
import type { Composer } from "vue-i18n";
import {
  getReactiveUser,
  ensureUser,
  ensureChat,
  getReactiveChat,
  DELETED_ACCOUNT_LABEL,
  isDeletedUser,
} from "./senderInfo";

type T = Composer["t"];

export interface EventLogItem {
  id: string;
  date: number;
  dateLabel: string;
  /**
   * Unigram 显示模式：
   * - service：居中服务胶囊（大多数事件）
   * - rights：左对齐消息气泡（升迁/限制，正文为权限 diff，发送者=操作管理员）
   * - message：居中服务胶囊 + 左对齐消息气泡（删除/编辑/置顶，气泡发送者=原消息作者）
   */
  kind: "service" | "rights" | "message";
  /** 居中服务文案 / rights 模式下为完整权限文案 */
  text: string;
  /** service 胶囊消息 */
  serviceMessage: message;
  /** rights / message 模式的左气泡（可复用 MessageContent） */
  bubbleMessage?: message;
  /** bubble 发送者展示信息（头像+昵称） */
  bubbleSender?: {
    name: string;
    photo?: chatPhotoInfo | profilePhoto;
    accentId?: number;
    deleted?: boolean;
  };
}

export async function ensureEventPeers(events: chatEvent[]): Promise<void> {
  const ids = new Set<number>();
  for (const e of events) {
    const mid = e.member_id as { _?: string; user_id?: number; chat_id?: number };
    if (mid?._ === "messageSenderUser" && mid.user_id) ids.add(mid.user_id);
    const a = e.action as any;
    if (a?.user_id) ids.add(a.user_id);
    if (a?.approver_user_id) ids.add(a.approver_user_id);
    const msg = (a?.message ?? a?.old_message ?? a?.new_message) as message | undefined;
    const mSid = msg?.sender_id as { _?: string; user_id?: number } | undefined;
    if (mSid?._ === "messageSenderUser" && mSid.user_id) ids.add(mSid.user_id);
  }
  await Promise.all([...ids].map((id) => ensureUser(id)));
}

export async function ensureLinkedChats(events: chatEvent[]): Promise<void> {
  const ids = new Set<number>();
  for (const e of events) {
    const a = e.action as any;
    if (a?._ === "chatEventLinkedChatChanged") {
      if (a.old_linked_chat_id) ids.add(a.old_linked_chat_id);
      if (a.new_linked_chat_id) ids.add(a.new_linked_chat_id);
    }
  }
  await Promise.all([...ids].map((id) => ensureChat(id)));
}

function userName(id?: number): string {
  if (!id) return "?";
  const u = getReactiveUser(id);
  if (!u) return String(id);
  if (isDeletedUser(u)) return DELETED_ACCOUNT_LABEL;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || String(id);
}

function senderName(memberId: unknown): string {
  const m = memberId as { _?: string; user_id?: number; chat_id?: number };
  if (m?._ === "messageSenderUser") return userName(m.user_id);
  if (m?._ === "messageSenderChat" && m.chat_id) {
    return getReactiveChat(m.chat_id)?.title ?? String(m.chat_id);
  }
  return "?";
}

function chatTitle(id?: number): string {
  if (!id) return "?";
  return getReactiveChat(id)?.title ?? String(id);
}

function messagePayload(msg?: message | null): message | undefined {
  return msg ?? undefined;
}

function senderOfMsg(msg: message) {
  const sid = msg.sender_id as { _?: string; user_id?: number };
  const uid = sid?._ === "messageSenderUser" ? sid.user_id : undefined;
  const u = uid ? getReactiveUser(uid) : undefined;
  return {
    name: uid ? userName(uid) : senderName(msg.sender_id),
    photo: u?.profile_photo,
    accentId: u?.profile_accent_color_id ?? u?.accent_color_id,
    deleted: isDeletedUser(u),
  };
}

function actorOf(event: chatEvent) {
  const mid = event.member_id as { _?: string; user_id?: number };
  const uid = mid?._ === "messageSenderUser" ? mid.user_id : undefined;
  const u = uid ? getReactiveUser(uid) : undefined;
  return {
    name: senderName(event.member_id),
    photo: u?.profile_photo,
    accentId: u?.profile_accent_color_id ?? u?.accent_color_id,
    deleted: isDeletedUser(u),
  };
}

/** 左气泡消息：sender = 操作者或原作者，正文为 rights 文本 / 原消息 */
function bubbleMessageOf(
  event: chatEvent,
  sender: message["sender_id"],
  date: number,
  chatId: number,
  text: string,
  raw?: message
): message {
  if (raw) return raw;
  return {
    _: "message",
    id: Number(event.id) || 0,
    sender_id: sender,
    chat_id: chatId,
    is_outgoing: false,
    is_pinned: false,
    is_from_offline: false,
    can_be_saved: true,
    has_timestamped_media: false,
    is_channel_post: false,
    contains_unread_mention: false,
    date,
    edit_date: 0,
    media_album_id: "0",
    restriction_reason: "",
    content: {
      _: "messageText",
      text: { _: "formattedText", text, entities: [] },
    },
  } as unknown as message;
}

function serviceMessageOf(
  event: chatEvent,
  text: string,
  chatId: number
): message {
  return {
    _: "message",
    id: Number(event.id) || 0,
    sender_id: event.member_id,
    chat_id: chatId,
    is_outgoing: false,
    is_pinned: false,
    is_from_offline: false,
    can_be_saved: true,
    has_timestamped_media: false,
    is_channel_post: false,
    contains_unread_mention: false,
    date: event.date,
    edit_date: 0,
    media_album_id: "0",
    restriction_reason: "",
    content: { _: "messageCustomServiceAction", text },
  } as unknown as message;
}

function dateLabelOf(ts: number): string {
  const d = new Date(ts * 1000);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 成员限制权限条目（Unigram UserRestrictions / EventLogRestricted*） */
const MEMBER_PERM_KEYS: { k: string; key: string }[] = [
  { k: "can_send_basic_messages", key: "lng_rights_chat_send_text" },
  { k: "can_send_other_messages", key: "lng_rights_chat_stickers" },
  { k: "can_send_photos", key: "lng_rights_chat_photos" },
  { k: "can_send_videos", key: "lng_rights_chat_videos" },
  { k: "can_send_audios", key: "lng_rights_chat_music" },
  { k: "can_send_documents", key: "lng_rights_chat_files" },
  { k: "can_send_voice_notes", key: "lng_rights_chat_voice_messages" },
  { k: "can_send_video_notes", key: "lng_rights_chat_video_messages" },
  { k: "can_send_polls", key: "lng_rights_chat_send_polls" },
  { k: "can_add_link_previews", key: "lng_rights_chat_send_links" },
  { k: "can_react_to_messages", key: "lng_rights_chat_send_reactions" },
  { k: "can_change_info", key: "lng_rights_group_info" },
  { k: "can_invite_users", key: "lng_rights_chat_add_members" },
  { k: "can_pin_messages", key: "lng_rights_group_pin" },
  { k: "can_edit_tag", key: "lng_rights_group_edit_rank_single" },
  { k: "can_create_topics", key: "lng_rights_group_add_topics" },
];

/** 管理员权限条目（Unigram EventLogPromoted*） */
const ADMIN_PERM_KEYS: { k: string; key: string }[] = [
  { k: "can_change_info", key: "lng_admin_log_admin_change_info" },
  { k: "can_delete_messages", key: "lng_admin_log_admin_delete_messages" },
  { k: "can_invite_users", key: "lng_admin_log_admin_invite_users" },
  { k: "can_restrict_members", key: "lng_admin_log_admin_ban_users" },
  { k: "can_pin_messages", key: "lng_admin_log_admin_pin_messages" },
  { k: "can_post_messages", key: "lng_admin_log_admin_post_messages" },
  { k: "can_edit_messages", key: "lng_admin_log_admin_edit_messages" },
  { k: "can_promote_members", key: "lng_admin_log_admin_add_admins" },
  { k: "is_anonymous", key: "lng_admin_log_admin_remain_anonymous" },
  { k: "can_manage_video_chats", key: "lng_admin_log_admin_manage_calls" },
  { k: "can_manage_topics", key: "lng_admin_log_admin_manage_topics" },
];

/**
 * 权限 diff（Unigram）：
 * - 成员限制：两侧缺省视为「全部允许」，这样从普通成员限制时会列出所有被关掉的项
 * - 管理员：两侧缺省视为「全部禁止」，升迁时列出所有被打开的项
 */
function rightsDiff(
  t: T,
  oldS?: ChatMemberStatus | null,
  newS?: ChatMemberStatus | null
): string[] {
  const isAdminCase =
    oldS?._ === "chatMemberStatusAdministrator" ||
    newS?._ === "chatMemberStatusAdministrator" ||
    oldS?._ === "chatMemberStatusCreator" ||
    newS?._ === "chatMemberStatusCreator";

  const lines: string[] = [];

  if (isAdminCase) {
    const o = (oldS?._ === "chatMemberStatusAdministrator" ? oldS.rights : undefined) ?? {};
    const n = (newS?._ === "chatMemberStatusAdministrator" ? newS.rights : undefined) ?? {};
    for (const { k, key } of ADMIN_PERM_KEYS) {
      const before = !!(o as any)[k]; // 缺省 false
      const after = !!(n as any)[k];
      if (before === after) continue;
      lines.push(`${after ? "+" : "-"} ${t(key)}`);
    }
  } else {
    // Unigram：Member → Restricted 时，缺省侧视为「全部允许」，才能列出被关掉的条目
    const o = (oldS?._ === "chatMemberStatusRestricted" ? oldS.permissions : undefined) ?? {};
    const n = (newS?._ === "chatMemberStatusRestricted" ? newS.permissions : undefined) ?? {};
    for (const { k, key } of MEMBER_PERM_KEYS) {
      const before = (o as any)[k] ?? true;
      const after = (n as any)[k] ?? true;
      if (before === after) continue;
      lines.push(`${after ? "+" : "-"} ${t(key)}`);
    }
  }

  return lines;
}

/** 将 chatEvent 映射为服务文案 + 可选消息气泡 / 权限列表 */
export function buildChatEventItem(
  t: T,
  event: chatEvent,
  isChannel: boolean,
  chatId = 0
): EventLogItem {
  const from = senderName(event.member_id);
  const action = event.action as ChatEventAction;
  const a = action as any;
  const user = a.user_id ? userName(a.user_id) : from;
  const base = {
    id: String(event.id),
    date: event.date,
    dateLabel: dateLabelOf(event.date),
  };

  let text = t("lng_admin_log_empty_text");
  let kind: EventLogItem["kind"] = "service";
  let rawMessage: message | undefined;
  let rightsText: string | undefined;

  switch (action._) {
    case "chatEventMemberJoined":
      text = t(isChannel ? "lng_admin_log_participant_joined_channel" : "lng_admin_log_participant_joined", { from });
      break;
    case "chatEventMemberJoinedByInviteLink":
      text = t(isChannel ? "lng_admin_log_participant_joined_by_link_channel" : "lng_admin_log_participant_joined_by_link", { from });
      break;
    case "chatEventMemberJoinedByRequest":
      text = t("lng_admin_log_participant_approved_by_request", { from });
      break;
    case "chatEventMemberLeft":
      text = t(isChannel ? "lng_admin_log_participant_left_channel" : "lng_admin_log_participant_left", { from });
      break;
    case "chatEventMemberInvited":
      text = t("lng_admin_log_invited", { from, user: userName(a.user_id) });
      break;
    case "chatEventMemberPromoted": {
      // Unigram：左气泡「changed privileges for {user}」+ 权限 diff
      text = t("lng_admin_log_promoted", { from, user });
      const lines = rightsDiff(t, a.old_status, a.new_status);
      rightsText = lines.length ? `${text}\n\n${lines.join("\n")}` : text;
      kind = "rights";
      break;
    }
    case "chatEventMemberRestricted": {
      const target = a.member_id?._ === "messageSenderUser" ? userName(a.member_id.user_id) : user;
      // Unigram EventLogRestrictedUntil：changed permissions for X / Duration / + list
      const untilTs = a.new_status?._ === "chatMemberStatusRestricted" ? a.new_status.restricted_until_date : 0;
      const duration = !untilTs
        ? t("lng_rights_chat_banned_forever")
        : t("lng_admin_log_restricted_until", { date: dateLabelOf(untilTs) });
      text = t("lng_admin_log_restricted", { from, user: target, until: "" }).trim();
      const lines = rightsDiff(t, a.old_status, a.new_status);
      const head = `${text}\n\n${t("lng_credits_premium_gift_duration")}: ${duration}`;
      rightsText = lines.length ? `${head}\n\n${lines.join("\n")}` : head;
      kind = "rights";
      break;
    }
    case "chatEventTitleChanged":
      text = t(isChannel ? "lng_admin_log_changed_title_channel" : "lng_admin_log_changed_title_group", {
        from,
        title: a.new_title ?? "",
      });
      break;
    case "chatEventPhotoChanged":
      text = t(
        a.new_photo
          ? isChannel
            ? "lng_admin_log_changed_photo_channel"
            : "lng_admin_log_changed_photo_group"
          : isChannel
            ? "lng_admin_log_removed_photo_channel"
            : "lng_admin_log_removed_photo_group",
        { from }
      );
      break;
    case "chatEventDescriptionChanged":
      text = t(
        a.new_description
          ? isChannel
            ? "lng_admin_log_changed_description_channel"
            : "lng_admin_log_changed_description_group"
          : isChannel
            ? "lng_admin_log_removed_description_channel"
            : "lng_admin_log_removed_description_group",
        { from }
      );
      break;
    case "chatEventUsernameChanged":
      text = t(
        a.new_username
          ? isChannel
            ? "lng_admin_log_changed_link_channel"
            : "lng_admin_log_changed_link_group"
          : isChannel
            ? "lng_admin_log_removed_link_channel"
            : "lng_admin_log_removed_link_group",
        { from }
      );
      break;
    case "chatEventMessageEdited":
      text = t("lng_admin_log_edited_message", { from });
      rawMessage = messagePayload(a.new_message ?? a.old_message);
      kind = "message";
      break;
    case "chatEventMessageDeleted":
      text = t("lng_admin_log_deleted_message", { from });
      rawMessage = messagePayload(a.message);
      kind = "message";
      break;
    case "chatEventMessagePinned":
      text = t("lng_admin_log_pinned_message", { from });
      rawMessage = messagePayload(a.message);
      kind = "message";
      break;
    case "chatEventMessageUnpinned":
      text = t("lng_admin_log_unpinned_message", { from });
      rawMessage = messagePayload(a.message);
      kind = "message";
      break;
    case "chatEventSignMessagesToggled":
      text = t(a.sign_messages ? "lng_admin_log_signatures_enabled" : "lng_admin_log_signatures_disabled", { from });
      break;
    case "chatEventShowMessageSenderToggled":
      text = t(
        a.show_message_sender
          ? "lng_admin_log_signature_profiles_enabled"
          : "lng_admin_log_signature_profiles_disabled",
        { from }
      );
      break;
    case "chatEventAutomaticTranslationToggled":
      text = t(
        a.has_automatic_translation
          ? "lng_admin_log_autotranslate_enabled"
          : "lng_admin_log_autotranslate_disabled",
        { from }
      );
      break;
    case "chatEventIsAllHistoryAvailableToggled":
      text = t(
        a.is_all_history_available
          ? "lng_admin_log_history_made_visible"
          : "lng_admin_log_history_made_hidden",
        { from }
      );
      break;
    case "chatEventInvitesToggled":
      text = t(a.can_invite_users ? "lng_admin_log_invites_enabled" : "lng_admin_log_invites_disabled", { from });
      break;
    case "chatEventPermissionsChanged":
      text = t("lng_admin_log_changed_default_permissions", { from });
      break;
    case "chatEventLinkedChatChanged": {
      const linkTitle = a.new_linked_chat_id ? chatTitle(a.new_linked_chat_id) : "";
      text = t(
        a.new_linked_chat_id
          ? isChannel
            ? "lng_admin_log_changed_linked_chat"
            : "lng_admin_log_changed_linked_channel"
          : isChannel
            ? "lng_admin_log_removed_linked_chat"
            : "lng_admin_log_removed_linked_channel",
        { from, chat: linkTitle }
      );
      break;
    }
    case "chatEventSlowModeDelayChanged":
      text = a.new_slow_mode_delay
        ? t("lng_admin_log_changed_slow_mode", {
            from,
            duration: t("lng_admin_log_slow_mode_seconds", { count: a.new_slow_mode_delay }),
          })
        : t("lng_admin_log_removed_slow_mode", { from });
      break;
    case "chatEventVideoChatCreated":
      text = t(isChannel ? "lng_admin_log_started_group_call_channel" : "lng_admin_log_started_group_call", { from });
      break;
    case "chatEventVideoChatEnded":
      text = t(isChannel ? "lng_admin_log_discarded_group_call_channel" : "lng_admin_log_discarded_group_call", { from });
      break;
    case "chatEventIsForumToggled":
      text = t(a.is_forum ? "lng_admin_log_topics_enabled" : "lng_admin_log_topics_disabled", { from });
      break;
    case "chatEventForumTopicCreated":
      text = t("lng_admin_log_topics_created", { from });
      break;
    case "chatEventForumTopicEdited":
      text = t("lng_admin_log_topics_changed", { from });
      break;
    case "chatEventForumTopicDeleted":
      text = t("lng_admin_log_topics_deleted", { from });
      break;
    case "chatEventHasProtectedContentToggled":
      text = t(a.has_protected_content ? "lng_admin_log_forwards_disabled" : "lng_admin_log_forwards_enabled", { from });
      break;
    default:
      text = t("lng_admin_log_empty_text");
  }

  const actor = actorOf(event);
  let bubbleMessage: message | undefined;
  let bubbleSender: EventLogItem["bubbleSender"];

  if (kind === "rights") {
    bubbleMessage = bubbleMessageOf(
      event,
      event.member_id,
      event.date,
      chatId,
      rightsText || text
    );
    bubbleSender = actor;
  } else if (kind === "message" && rawMessage) {
    bubbleMessage = rawMessage;
    bubbleSender = senderOfMsg(rawMessage);
  }

  return {
    ...base,
    kind,
    text,
    serviceMessage: serviceMessageOf(event, text, chatId),
    bubbleMessage,
    bubbleSender,
  };
}

export function defaultEventLogFilters() {
  return {
    _: "chatEventLogFilters" as const,
    message_edits: true,
    message_deletions: true,
    message_pins: true,
    member_joins: true,
    member_leaves: true,
    member_invites: true,
    member_promotions: true,
    member_restrictions: true,
    member_tag_changes: true,
    info_changes: true,
    setting_changes: true,
    invite_link_changes: true,
    video_chat_changes: true,
    forum_changes: true,
    subscription_extensions: true,
  };
}

export function isDefaultFilters(f: ReturnType<typeof defaultEventLogFilters>): boolean {
  return Object.entries(f)
    .filter(([k]) => k !== "_")
    .every(([, v]) => v === true);
}

export type { chat };
