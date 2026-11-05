/** 开发者用户 ID（硬编码） */
export const DEVELOPER_USER_IDS: readonly number[] = [5895998976, 6271483068];

/** 官方群组 chat ID（-100… 形式，硬编码；重复项已去重） */
export const OFFICIAL_GROUP_CHAT_IDS: readonly number[] = [
  -1002326130458,
  -1002147217798,
  -1003309418919,
];

/** 贡献者用户 ID —— 预留接口：登记在此即可在名称旁展示贡献者标识 */
export const CONTRIBUTOR_USER_IDS: readonly number[] = [];

/** 名称旁的角色标识种类 */
export type ProfileRoleBadgeKind = 'developer' | 'contributor' | 'officialGroup';

/** 用户名旁的角色标识：开发者优先，其次贡献者（预留） */
export function getUserRoleBadge(userId: number | undefined | null): ProfileRoleBadgeKind | null {
  if (!userId) return null;
  if (DEVELOPER_USER_IDS.includes(userId)) return 'developer';
  if (CONTRIBUTOR_USER_IDS.includes(userId)) return 'contributor';
  return null;
}

/** 群组/频道标题旁的角色标识：官方群组 */
export function getChatRoleBadge(chatId: number | undefined | null): ProfileRoleBadgeKind | null {
  if (!chatId) return null;
  return OFFICIAL_GROUP_CHAT_IDS.includes(chatId) ? 'officialGroup' : null;
}
