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

/** 预设文案 key；在组件 setup 内用 t() 求值，避免在模块顶层调用 useI18n */
export const PRIVACY_PRESET_KEYS: Record<PrivacyPreset, string> = {
  everyone: 'lng_edit_privacy_everyone',
  contacts: 'lng_edit_privacy_calls_p2p_contacts',
  nobody: 'lng_edit_privacy_nobody',
  custom: 'lng_polls_create_duration_custom',
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

/** TDLib JSON 里 int64 可能是 number 或 string，统一成 number */
function toIdArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v) {
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function ruleType(r: Record<string, unknown>): string {
  return String(r?._ ?? r?.['@type'] ?? '');
}

/** TDLib setting 类型 → 本地 key（用于 update 同步） */
export const PRIVACY_SETTING_TYPE_TO_KEY: Record<string, string> = {
  userPrivacySettingShowPhoneNumber: "phone_number",
  userPrivacySettingAllowFindingByPhoneNumber: "phone_find",
  userPrivacySettingShowStatus: "status",
  userPrivacySettingShowProfilePhoto: "photo",
  userPrivacySettingShowBio: "bio",
  userPrivacySettingShowBirthdate: "birthdate",
  userPrivacySettingShowProfileAudio: "audio",
  userPrivacySettingShowLinkInForwardedMessages: "forward",
  userPrivacySettingAllowCalls: "calls",
  userPrivacySettingAutosaveGifts: "gifts",
  userPrivacySettingAllowPrivateVoiceAndVideoNoteMessages: "voice",
  userPrivacySettingAllowChatInvites: "invites",
  userPrivacySettingAllowUnpaidMessages: "unpaid_messages",
};

export function privacyKeyForSettingType(type?: string): string | undefined {
  return type ? PRIVACY_SETTING_TYPE_TO_KEY[type] : undefined;
}

/** 把 TDLib 返回的 userPrivacySettingRules 解析为本地预设结构 */
export function decodeUserPrivacyRules(rules?: userPrivacySettingRules): DecodedPrivacy {
  const list = (rules as { rules?: unknown[] } | undefined)?.rules ?? [];
  const allowed: PrivacyExceptionIds = { userIds: [], chatIds: [] };
  const restricted: PrivacyExceptionIds = { userIds: [], chatIds: [] };
  let hasAllowAll = false;
  let hasAllowContacts = false;
  let hasRestrictAll = false;
  for (const item of list) {
    const r = item as Record<string, unknown>;
    switch (ruleType(r)) {
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
        for (const id of toIdArray(r.user_ids)) {
          if (!allowed.userIds.includes(id)) allowed.userIds.push(id);
        }
        break;
      case "userPrivacySettingRuleRestrictUsers":
        for (const id of toIdArray(r.user_ids)) {
          if (!restricted.userIds.includes(id)) restricted.userIds.push(id);
        }
        break;
      case "userPrivacySettingRuleAllowChatMembers":
        for (const id of toIdArray(r.chat_ids)) {
          if (!allowed.chatIds.includes(id)) allowed.chatIds.push(id);
        }
        break;
      case "userPrivacySettingRuleRestrictChatMembers":
        for (const id of toIdArray(r.chat_ids)) {
          if (!restricted.chatIds.includes(id)) restricted.chatIds.push(id);
        }
        break;
    }
  }
  // 基线规则决定档位；例外（允许/限制列表）与档位独立共存，不再降级为 custom
  let preset: PrivacyPreset = "nobody";
  if (hasAllowAll) preset = "everyone";
  else if (hasAllowContacts) preset = "contacts";
  else if (hasRestrictAll) preset = "nobody";
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
  // TDLib 规则自上而下首个匹配生效：例外必须写在基线之前
  if (preset === "everyone") {
    // 所有人：仅「从不分享给」
    if (restricted.userIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictUsers", user_ids: [...restricted.userIds] });
    }
    if (restricted.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictChatMembers", chat_ids: [...restricted.chatIds] });
    }
    rules.push({ _: "userPrivacySettingRuleAllowAll" });
  } else if (preset === "contacts") {
    // 仅限联系人：「总是」+「从不」均可
    if (allowed.userIds.length) {
      rules.push({ _: "userPrivacySettingRuleAllowUsers", user_ids: [...allowed.userIds] });
    }
    if (allowed.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleAllowChatMembers", chat_ids: [...allowed.chatIds] });
    }
    if (restricted.userIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictUsers", user_ids: [...restricted.userIds] });
    }
    if (restricted.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictChatMembers", chat_ids: [...restricted.chatIds] });
    }
    rules.push({ _: "userPrivacySettingRuleAllowContacts" });
  } else {
    // nobody / custom：仅「总是分享给」
    // 与 Unigram 一致：有 Allow 例外时不写 RestrictAll（TDLib 默认拒绝即可）；
    // 且 TDLib 从服务器读回时会剥掉末尾 RestrictAll，写空基线才有明确 nobody。
    if (allowed.userIds.length) {
      rules.push({ _: "userPrivacySettingRuleAllowUsers", user_ids: [...allowed.userIds] });
    }
    if (allowed.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleAllowChatMembers", chat_ids: [...allowed.chatIds] });
    }
    if (!allowed.userIds.length && !allowed.chatIds.length) {
      rules.push({ _: "userPrivacySettingRuleRestrictAll" });
    }
  }
  return { _: "userPrivacySettingRules", rules };
}