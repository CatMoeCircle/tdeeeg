import type {
  userPrivacySettingRules,
  userPrivacySettingRules$Input,
  UserPrivacySettingRule$Input,
} from "tdlib-types";

/**
 * 隐私设置「预设」：与 Telegram 官方客户端的档位对应。
 * - everyone  ：所有人
 * - contacts  ：我的联系人
 * - nobody    ：没人
 * - custom    ：服务器返回混合规则时解码出的状态（编辑时不提供该档位）
 */
export type PrivacyPreset = "everyone" | "contacts" | "nobody" | "custom";

export const PRIVACY_PRESET_LABELS: Record<PrivacyPreset, string> = {
  everyone: "所有人",
  contacts: "我的联系人",
  nobody: "没有人",
  custom: "自定义",
};

/** 编辑时可选的基础档位（不含「自定义」） */
export const EDITABLE_PRESETS: PrivacyPreset[] = ["everyone", "contacts", "nobody"];

export interface PrivacyExceptionIds {
  userIds: number[];
  chatIds: number[];
}

export interface DecodedPrivacy {
  preset: PrivacyPreset;
  /** 「没人/自定义」时需要允许的用户与群组 id 列表 */
  allowed: PrivacyExceptionIds;
  /** 「所有人/联系人」时需要排除的用户与群组 id 列表 */
  restricted: PrivacyExceptionIds;
}

/** 把 TDLib 返回的 userPrivacySettingRules 解析为本地预设结构 */
export function decodeUserPrivacyRules(rules?: userPrivacySettingRules): DecodedPrivacy {
  const list = rules?.rules ?? [];
  const allowed: PrivacyExceptionIds = { userIds: [], chatIds: [] };
  const restricted: PrivacyExceptionIds = { userIds: [], chatIds: [] };
  let hasAllowAll = false;
  let hasAllowContacts = false;
  let hasRestrictAll = false;
  for (const r of list) {
    switch (r._) {
      case "userPrivacySettingRuleAllowAll":
        hasAllowAll = true;
        break;
      case "userPrivacySettingRuleAllowContacts":
        hasAllowContacts = true;
        break;
      case "userPrivacySettingRuleRestrictAll":
        hasRestrictAll = true;
        break;
      case "userPrivacySettingRuleAllowUsers":
        for (const id of r.user_ids) {
          if (!allowed.userIds.includes(id)) allowed.userIds.push(id);
        }
        break;
      case "userPrivacySettingRuleRestrictUsers":
        for (const id of r.user_ids) {
          if (!restricted.userIds.includes(id)) restricted.userIds.push(id);
        }
        break;
      case "userPrivacySettingRuleAllowChatMembers":
        for (const id of r.chat_ids) {
          if (!allowed.chatIds.includes(id)) allowed.chatIds.push(id);
        }
        break;
      case "userPrivacySettingRuleRestrictChatMembers":
        for (const id of r.chat_ids) {
          if (!restricted.chatIds.includes(id)) restricted.chatIds.push(id);
        }
        break;
    }
  }
  const hasExtra =
    allowed.userIds.length > 0 ||
    allowed.chatIds.length > 0 ||
    restricted.userIds.length > 0 ||
    restricted.chatIds.length > 0;
  let preset: PrivacyPreset = "nobody";
  if (hasAllowAll) preset = hasExtra ? "custom" : "everyone";
  else if (hasAllowContacts) preset = hasExtra ? "custom" : "contacts";
  else if (hasRestrictAll) preset = hasExtra ? "custom" : "nobody";
  else preset = "nobody";
  return { preset, allowed, restricted };
}

/** 把本地预设结构编码为 TDLib 的 userPrivacySettingRules */
export function encodeUserPrivacyRules(
  preset: PrivacyPreset,
  allowed: PrivacyExceptionIds,
  restricted: PrivacyExceptionIds,
): userPrivacySettingRules$Input {
  const rules: UserPrivacySettingRule$Input[] = [];
  if (preset === "everyone") {
    rules.push({ _: "userPrivacySettingRuleAllowAll" });
    if (restricted.userIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictUsers", user_ids: [...restricted.userIds] });
    }
    if (restricted.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictChatMembers", chat_ids: [...restricted.chatIds] });
    }
  } else if (preset === "contacts") {
    rules.push({ _: "userPrivacySettingRuleAllowContacts" });
    if (restricted.userIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictUsers", user_ids: [...restricted.userIds] });
    }
    if (restricted.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictChatMembers", chat_ids: [...restricted.chatIds] });
    }
  } else {
    // nobody / custom：默认谁也不能，仅明确允许的用户/群组例外
    rules.push({ _: "userPrivacySettingRuleRestrictAll" });
    if (allowed.userIds.length) {
      rules.push({ _: "userPrivacySettingRuleAllowUsers", user_ids: [...allowed.userIds] });
    }
    if (allowed.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleAllowChatMembers", chat_ids: [...allowed.chatIds] });
    }
  }
  return { _: "userPrivacySettingRules", rules };
}