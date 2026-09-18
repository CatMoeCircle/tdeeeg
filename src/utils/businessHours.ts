import i18n from "../i18n";
import type { businessOpeningHours, businessOpeningHoursInterval } from "tdlib-types";

/** 一周星期 key（周一=0，与 TDLib start_minute 的周一起始一致） */
const WEEKDAY_KEYS = [
  "lng_hours_monday",
  "lng_hours_tuesday",
  "lng_hours_wednesday",
  "lng_hours_thursday",
  "lng_hours_friday",
  "lng_hours_saturday",
  "lng_hours_sunday",
] as const;

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** 资料页营业时间一行：日期在左、时间/状态在右；续行 day 为空 */
export interface BusinessHoursRow {
  day: string;
  time: string;
}

function t(key: string, named?: Record<string, unknown>): string {
  if (named) return i18n.global.t(key, named as never);
  return i18n.global.t(key);
}

/** 读取 locale，保证 computed 内调用时语言切换会重新计算 */
function touchLocale(): void {
  void i18n.global.locale.value;
}

/** 将「一周内的分钟序号」转为星期索引（0=周一） */
function weekdayIndexOf(minute: number): number {
  return Math.floor(minute / MINUTES_PER_DAY) % 7;
}

/** 将「一周内的分钟序号」转为 HH:MM（日内） */
function minutesToHM(minute: number): string {
  const m = ((minute % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  const total = m % MINUTES_PER_DAY;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 是否为覆盖整天（24 小时营业）的时段 */
function isFullDayInterval(iv: businessOpeningHoursInterval): boolean {
  const dayStart = Math.floor(iv.start_minute / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  if (iv.start_minute !== dayStart) return false;
  const duration =
    iv.end_minute >= iv.start_minute
      ? iv.end_minute - iv.start_minute
      : iv.end_minute + MINUTES_PER_WEEK - iv.start_minute;
  return duration >= MINUTES_PER_DAY;
}

/**
 * 单段时刻：`09:00 - 17:00`
 * 跨到次日：`13:00 - 19:02 (next day)` → `lng_info_hours_next_day`
 */
function formatIntervalTime(iv: businessOpeningHoursInterval): string {
  const startHm = minutesToHM(iv.start_minute);
  const endHm = minutesToHM(iv.end_minute);
  const startDay = weekdayIndexOf(iv.start_minute);
  const endDay = weekdayIndexOf(iv.end_minute);
  if (endDay !== startDay) {
    return `${startHm} - ${t("lng_info_hours_next_day", { time: endHm })}`;
  }
  return `${startHm} - ${endHm}`;
}

/**
 * 资料页展开列表：按周一～周日成组，日期左、时间右。
 * 当天无时段 → lng_info_hours_closed；24 小时 → lng_info_hours_open_full；多段分行。
 * 整周无时段时返回空数组。
 */
export function formatBusinessHours(hours?: businessOpeningHours): BusinessHoursRow[] {
  touchLocale();
  const list = hours?.opening_hours;
  if (!list || list.length === 0) return [];

  const byDay: businessOpeningHoursInterval[][] = Array.from({ length: 7 }, () => []);
  for (const iv of list) {
    const day = weekdayIndexOf(iv.start_minute);
    byDay[day].push(iv);
  }
  for (const arr of byDay) {
    arr.sort((a, b) => a.start_minute - b.start_minute);
  }

  const rows: BusinessHoursRow[] = [];
  for (let day = 0; day < 7; day++) {
    const dayName = t(WEEKDAY_KEYS[day]);
    const intervals = byDay[day];

    if (intervals.length === 0) {
      rows.push({ day: dayName, time: t("lng_info_hours_closed") });
      continue;
    }
    if (intervals.some(isFullDayInterval)) {
      rows.push({ day: dayName, time: t("lng_info_hours_open_full") });
      continue;
    }

    const times = intervals.map(formatIntervalTime);
    rows.push({ day: dayName, time: times[0] });
    for (let i = 1; i < times.length; i++) {
      rows.push({ day: "", time: times[i] });
    }
  }
  return rows;
}

/** 设置页预览：取第一行真实营业（含 24 小时），无则 null */
export function formatBusinessHoursPreview(
  hours?: businessOpeningHours
): BusinessHoursRow | null {
  const rows = formatBusinessHours(hours);
  if (rows.length === 0) return null;
  const openFull = t("lng_info_hours_open_full");
  return (
    rows.find((row) => /\d{2}:\d{2}/.test(row.time) || row.time.includes(openFull)) ?? null
  );
}
