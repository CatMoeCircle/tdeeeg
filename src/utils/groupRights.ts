import type {
  basicGroup,
  chat,
  chatMember,
  ChatMemberStatus,
  chatPermissions,
  chatAdministratorRights,
  MessageSender,
  supergroup,
} from "tdlib-types";
import { tdlibSend } from "./tdlib";
import i18n from "../i18n";
import {
  ensureBasicGroup,
  ensureChat,
  ensureSupergroup,
  ensureUser,
  getReactiveChat,
  getReactiveUser,
  DELETED_ACCOUNT_LABEL,
  isDeletedUser,
  isDeletedUserId,
} from "./senderInfo";

export function isGroupChat(chat?: chat | null): boolean {
  return !!chat && (chat.type._ === "chatTypeBasicGroup" || chat.type._ === "chatTypeSupergroup");
}

export function isChannelChat(chat?: chat | null): boolean {
  return chat?.type._ === "chatTypeSupergroup" && !!chat.type.is_channel;
}

export function isSupergroupChat(chat?: chat | null): boolean {
  return chat?.type._ === "chatTypeSupergroup" && !chat.type.is_channel;
}

export function isBasicGroupChat(chat?: chat | null): boolean {
  return chat?.type._ === "chatTypeBasicGroup";
}

export function isCreatorStatus(status?: ChatMemberStatus | null): boolean {
  return status?._ === "chatMemberStatusCreator";
}

export function isAdminStatus(
  status?: ChatMemberStatus | null
): status is Extract<ChatMemberStatus, { _: "chatMemberStatusAdministrator" }> {
  return status?._ === "chatMemberStatusAdministrator";
}

/**
 * 是否显示「编辑」入口。
 * 超级群/频道：创建者或管理员（Unigram 同款）。
 * 基本群：创建者/管理员，或默认权限允许改资料的成员。
 */
export function canOpenGroupEdit(status?: ChatMemberStatus | null, chat?: chat | null): boolean {
  if (!isGroupChat(chat)) return false;
  if (isCreatorStatus(status) || isAdminStatus(status)) return true;
  if (isBasicGroupChat(chat)) {
    return !!chat?.permissions?.can_change_info;
  }
  return false;
}

/** 是否可修改群组资料（标题/简介/头像） */
export function canChangeGroupInfo(status?: ChatMemberStatus | null, chat?: chat | null): boolean {
  if (!isGroupChat(chat)) return false;
  if (isCreatorStatus(status)) return true;
  if (status?._ === "chatMemberStatusAdministrator") {
    return !!status.rights.can_change_info;
  }
  if (status?._ === "chatMemberStatusRestricted") {
    return !!status.permissions?.can_change_info;
  }
  if (status?._ === "chatMemberStatusMember") {
    return !!chat?.permissions?.can_change_info;
  }
  return false;
}

export function canRestrictMembers(status?: ChatMemberStatus | null): boolean {
  if (isCreatorStatus(status)) return true;
  return isAdminStatus(status) && !!status.rights?.can_restrict_members;
}

export function canPromoteMembers(status?: ChatMemberStatus | null): boolean {
  if (isCreatorStatus(status)) return true;
  return isAdminStatus(status) && !!status.rights?.can_promote_members;
}

export function canInviteUsers(status?: ChatMemberStatus | null, chat?: chat | null): boolean {
  if (isCreatorStatus(status)) return true;
  if (isAdminStatus(status)) return !!status.rights.can_invite_users;
  if (status?._ === "chatMemberStatusRestricted") return !!status.permissions?.can_invite_users;
  if (status?._ === "chatMemberStatusMember") return !!chat?.permissions?.can_invite_users;
  return false;
}

export function hasActiveUsername(obj?: {
  usernames?: { active_usernames?: string[] } | null;
} | supergroup | basicGroup | null | undefined): boolean {
  const unames = (obj as { usernames?: { active_usernames?: string[] } } | undefined)?.usernames?.active_usernames;
  return !!unames?.length;
}

export function memberUserId(member: {
  member_id?: MessageSender | { _?: string; user_id?: number };
}): number | undefined {
  const id = member.member_id as { _?: string; user_id?: number } | undefined;
  return id?._ === "messageSenderUser" ? id.user_id : undefined;
}

export async function loadMyChatMemberStatus(chatId: number): Promise<{
  chat: chat | undefined;
  status: ChatMemberStatus | undefined;
  supergroup?: supergroup;
  basicGroup?: basicGroup;
}> {
  let c = getReactiveChat(chatId);
  if (!c) {
    await ensureChat(chatId);
    c = getReactiveChat(chatId) ?? (await tdlibSend({ _: "getChat", chat_id: chatId }));
  }
  if (!c) return { chat: undefined, status: undefined };

  if (c.type._ === "chatTypeSupergroup") {
    await ensureSupergroup(c.type.supergroup_id);
    const sg = await tdlibSend({
      _: "getSupergroup",
      supergroup_id: c.type.supergroup_id,
    });
    return { chat: c, status: sg?.status, supergroup: sg };
  }
  if (c.type._ === "chatTypeBasicGroup") {
    await ensureBasicGroup(c.type.basic_group_id);
    const bg = await tdlibSend({
      _: "getBasicGroup",
      basic_group_id: c.type.basic_group_id,
    });
    return { chat: c, status: bg?.status, basicGroup: bg };
  }
  return { chat: c, status: undefined };
}

export async function loadGroupFullInfo(chat: chat): Promise<{
  description: string;
  memberCount: number;
  administratorCount: number;
  bannedCount: number;
  isAllHistoryAvailable: boolean;
  linkedChatId: number;
  inviteLink: string;
}> {
  const empty = {
    description: "",
    memberCount: 0,
    administratorCount: 0,
    bannedCount: 0,
    isAllHistoryAvailable: true,
    linkedChatId: 0,
    inviteLink: "",
  };
  const linkText = (link: unknown): string => {
    if (!link) return "";
    if (typeof link === "string") return link;
    const invite = link as { invite_link?: string };
    return invite.invite_link ?? "";
  };
  try {
    if (chat.type._ === "chatTypeSupergroup") {
      const full = await tdlibSend({
        _: "getSupergroupFullInfo",
        supergroup_id: chat.type.supergroup_id,
      });
      return {
        description: full.description ?? "",
        memberCount: full.member_count ?? 0,
        administratorCount: full.administrator_count ?? 0,
        bannedCount: full.banned_count ?? 0,
        isAllHistoryAvailable: !!full.is_all_history_available,
        linkedChatId: full.linked_chat_id ?? 0,
        inviteLink: linkText(full.invite_link),
      };
    }
    if (chat.type._ === "chatTypeBasicGroup") {
      const full = await tdlibSend({
        _: "getBasicGroupFullInfo",
        basic_group_id: chat.type.basic_group_id,
      });
      return {
        ...empty,
        description: full.description ?? "",
        memberCount: full.members?.length ?? 0,
        administratorCount:
          full.members?.filter(
            (m) => m.status._ === "chatMemberStatusCreator" || m.status._ === "chatMemberStatusAdministrator"
          ).length ?? 0,
        inviteLink: linkText(full.invite_link),
      };
    }
  } catch (e) {
    console.error("loadGroupFullInfo failed", e);
  }
  return empty;
}

export async function loadGroupMembers(
  chat: chat,
  filter: "recent" | "administrators" | "restricted" | "banned" | "search" | "contacts" | "bots",
  query = "",
  offset = 0,
  limit = 50
): Promise<chatMember[]> {
  if (chat.type._ === "chatTypeSupergroup") {
    const f =
      filter === "administrators"
        ? ({ _: "supergroupMembersFilterAdministrators" } as const)
        : filter === "restricted"
          ? ({ _: "supergroupMembersFilterRestricted", query: query || "" } as const)
          : filter === "banned"
            ? ({ _: "supergroupMembersFilterBanned", query: query || "" } as const)
            : filter === "search"
              ? ({ _: "supergroupMembersFilterSearch", query: query || "" } as const)
              : filter === "contacts"
                ? ({ _: "supergroupMembersFilterContacts" } as const)
                : filter === "bots"
                  ? ({ _: "supergroupMembersFilterBots" } as const)
                  : ({ _: "supergroupMembersFilterRecent" } as const);
    const res = await tdlibSend({
      _: "getSupergroupMembers",
      supergroup_id: chat.type.supergroup_id,
      filter: f as any,
      offset,
      limit,
    });
    return res.members ?? [];
  }
  if (chat.type._ === "chatTypeBasicGroup") {
    const full = await tdlibSend({
      _: "getBasicGroupFullInfo",
      basic_group_id: chat.type.basic_group_id,
    });
    let members = full.members ?? [];
    if (filter === "administrators") {
      members = members.filter(
        (m) => m.status._ === "chatMemberStatusCreator" || m.status._ === "chatMemberStatusAdministrator"
      );
    } else if (filter === "contacts") {
      // 基本群无服务端联系人过滤，本地按 is_contact 分组（Unigram ChatMemberGroupedCollection 同思路）
      members = members.filter((m) => {
        const uid = memberUserId(m);
        const u = uid ? getReactiveUser(uid) : undefined;
        return !!u?.is_contact;
      });
    } else if (filter === "bots") {
      members = members.filter((m) => {
        const uid = memberUserId(m);
        const u = uid ? getReactiveUser(uid) : undefined;
        return !!u && u.type._ === "userTypeBot";
      });
    } else if (filter === "search" && query) {
      const q = query.toLowerCase();
      members = members.filter((m) => {
        const uid = memberUserId(m);
        const u = uid ? getReactiveUser(uid) : undefined;
        const name = u ? `${u.first_name} ${u.last_name}`.toLowerCase() : String(uid ?? "");
        return name.includes(q);
      });
    }
    return members.slice(offset, offset + limit);
  }
  return [];
}

export async function loadChatAdministrators(chatId: number): Promise<chatMember[]> {
  try {
    const res = await tdlibSend({ _: "getChatAdministrators", chat_id: chatId });
    return (res.administrators ?? []).map(
      (a) =>
        ({
          _: "chatMember",
          member_id: { _: "messageSenderUser", user_id: a.user_id },
          tag: a.custom_title ?? "",
          inviter_user_id: 0,
          joined_chat_date: 0,
          status: a.is_owner
            ? ({
                _: "chatMemberStatusCreator",
                is_anonymous: false,
                is_member: true,
              } as const)
            : ({
                _: "chatMemberStatusAdministrator",
                can_be_edited: a.can_be_edited,
                rights: emptyAdminRights(),
              } as const),
        }) as chatMember
    );
  } catch (e) {
    console.error("loadChatAdministrators failed", e);
    return [];
  }
}

export function emptyAdminRights(): chatAdministratorRights {
  return {
    _: "chatAdministratorRights",
    can_manage_chat: true,
    can_change_info: true,
    can_post_messages: false,
    can_edit_messages: false,
    can_delete_messages: true,
    can_invite_users: true,
    can_restrict_members: false,
    can_pin_messages: true,
    can_manage_topics: false,
    can_promote_members: false,
    can_manage_video_chats: false,
    can_post_stories: false,
    can_edit_stories: false,
    can_delete_stories: false,
    can_manage_direct_messages: false,
    can_manage_tags: false,
    is_anonymous: false,
  };
}

export function defaultMemberPermissions(source?: chatPermissions | null): chatPermissions {
  return {
    _: "chatPermissions",
    can_send_basic_messages: source?.can_send_basic_messages ?? true,
    can_send_audios: source?.can_send_audios ?? true,
    can_send_documents: source?.can_send_documents ?? true,
    can_send_photos: source?.can_send_photos ?? true,
    can_send_videos: source?.can_send_videos ?? true,
    can_send_video_notes: source?.can_send_video_notes ?? true,
    can_send_voice_notes: source?.can_send_voice_notes ?? true,
    can_send_polls: source?.can_send_polls ?? true,
    can_send_other_messages: source?.can_send_other_messages ?? true,
    can_add_link_previews: source?.can_add_link_previews ?? true,
    can_react_to_messages: source?.can_react_to_messages ?? true,
    can_edit_tag: source?.can_edit_tag ?? true,
    can_change_info: source?.can_change_info ?? false,
    can_invite_users: source?.can_invite_users ?? true,
    can_pin_messages: source?.can_pin_messages ?? false,
    can_create_topics: source?.can_create_topics ?? true,
  };
}

/** 成员显示名：userTypeDeleted / userTypeUnknown 显示「已注销账户」；其余按真实姓名 */
export function userNameOf(userId: number): string {
  const u = getReactiveUser(userId);
  if (!u) return String(userId);
  if (isDeletedUser(u)) return DELETED_ACCOUNT_LABEL;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || i18n.global.t("lng_credits_box_history_entry_anonymous");
}

/** 成员头像是否按已注销展示（仅 userTypeDeleted） */
export function isDeletedMember(userId?: number | null): boolean {
  return isDeletedUserId(userId);
}

export async function ensureMemberUsers(members: chatMember[]): Promise<void> {
  const ids = new Set<number>();
  for (const m of members) {
    const uid = memberUserId(m);
    if (uid) ids.add(uid);
    if (m.inviter_user_id) ids.add(m.inviter_user_id);
  }
  await Promise.all([...ids].map((id) => ensureUser(id)));
}
