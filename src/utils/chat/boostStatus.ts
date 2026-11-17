import type {
  chatBoost,
  chatBoostFeatures,
  chatBoostLevelFeatures,
  chatBoostSlot,
  chatBoostStatus,
} from 'tdlib-types';

/** 当前时间（Unix 秒），用于判断槽位冷却是否结束 */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 槽位是否可用于助推：未被任何对话占用，且冷却已结束。
 * currently_boosted_chat_id 为 0 表示空闲；cooldown_until_date 为解绑后的冷却截止时间。
 */
export function isBoostSlotFree(slot: chatBoostSlot, now = nowSeconds()): boolean {
  if (!slot || slot.currently_boosted_chat_id !== 0) return false;
  return (slot.cooldown_until_date ?? 0) <= now;
}

/** 从当前用户的全部槽位里挑出可立即用于助推的空闲槽位 */
export function freeBoostSlots(
  slots: readonly chatBoostSlot[] | undefined | null,
  now = nowSeconds(),
): chatBoostSlot[] {
  return (slots ?? []).filter((slot) => isBoostSlotFree(slot, now));
}

export interface BoostProgress {
  /** 当前等级 */
  level: number;
  /** 当前等级内已累积的助推数（boost_count 减去到达本级所需的基数） */
  inLevel: number;
  /** 升到下一级还需要的助推数；0 表示已达最高级 */
  needed: number;
  /** 当前等级内的完成百分比 0~100 */
  percent: number;
  /** 是否已达最高等级 */
  isMax: boolean;
}

/**
 * 等级进度：TDLib 的 current_level_boost_count 是「到达当前等级所需的助推数」，
 * next_level_boost_count 是「升到下一级还需要的助推数」，两者相减得到本级进度。
 */
export function boostProgress(status: chatBoostStatus | null | undefined): BoostProgress {
  if (!status) return { level: 0, inLevel: 0, needed: 0, percent: 0, isMax: true };
  const level = status.level ?? 0;
  const needed = status.next_level_boost_count ?? 0;
  const inLevel = Math.max(0, (status.boost_count ?? 0) - (status.current_level_boost_count ?? 0));
  const isMax = needed <= 0;
  const percent = isMax ? 100 : Math.min(100, Math.round((inLevel / needed) * 100));
  return { level, inLevel, needed, percent, isMax };
}

/** 助推来源对应的用户 id；0 表示抽奖尚未选出中奖者 */
export function boostSourceUserId(boost: chatBoost | null | undefined): number {
  const source = boost?.source;
  if (!source) return 0;
  switch (source._) {
    case 'chatBoostSourcePremium':
    case 'chatBoostSourceGiveaway':
    case 'chatBoostSourceGiftCode':
      return source.user_id ?? 0;
    default:
      return 0;
  }
}

/** 下一等级的可用功能（features 按等级升序排列，找不到返回 null） */
export function pickNextLevelFeatures(
  features: chatBoostFeatures | null | undefined,
  currentLevel: number,
): chatBoostLevelFeatures | null {
  const list = features?.features;
  if (!list?.length) return null;
  return list.find((item) => item.level === currentLevel + 1) ?? null;
}

/** 把 Unix 秒时间戳格式化为当前语言的短日期（用于助推到期 / 槽位冷却） */
export function formatBoostDate(unixSeconds: number, locale: string): string {
  if (!unixSeconds) return '';
  const date = new Date(unixSeconds * 1000);
  try {
    return new Intl.DateTimeFormat(locale || 'en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}
