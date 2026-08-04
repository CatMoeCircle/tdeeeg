import type { businessOpeningHours, businessOpeningHoursInterval } from "tdlib-types";

/** 一周星期名称（周一为索引 0，与 TDLib start_minute 的周一起始规则一致） */
const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 将「一周内的分钟序号」转为星期索引（0=周一） */
function weekdayIndexOf(minute: number): number {
  return Math.floor(minute / (24 * 60)) % 7;
}

/** 将「一周内的分钟序号」转为 HH:MM */
function minutesToHM(minute: number): string {
  const m = ((minute % (7 * 24 * 60)) + 7 * 24 * 60) % (7 * 24 * 60);
  const total = m % (24 * 60);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 将单个营业时段渲染为 「周一 09:00–17:00」 文本 */
function formatInterval(interval: businessOpeningHoursInterval): string {
  const day = WEEKDAY_NAMES[weekdayIndexOf(interval.start_minute)] ?? "";
  return `${day} ${minutesToHM(interval.start_minute)}–${minutesToHM(interval.end_minute)}`;
}

/**
 * 将营业时间对象格式化为可读文本列表。
 * 空对象或无时段时返回空数组。
 */
export function formatBusinessHours(hours?: businessOpeningHours): string[] {
  if (!hours?.opening_hours || hours.opening_hours.length === 0) return [];
  return hours.opening_hours.map(formatInterval);
}
