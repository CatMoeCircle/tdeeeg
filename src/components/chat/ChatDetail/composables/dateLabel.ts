/**
 * 日期格式化与日界判断工具。
 */
import i18n from "../../../../i18n";

/**
 * 将 TDLib 消息时间戳格式化为日期分隔标签（胶囊文案）。
 * - 同一年：`lng_month_day`（如 `January 5` / `1月5日`）
 * - 跨年份：`lng_month_day_year`（如 `January 5, 2025` / `2025年1月5日`）
 * - 月份名走 `lng_month_day1`…`lng_month_day12`
 *
 * @param timestamp - TDLib 消息的 `date` 字段（秒级时间戳）
 * @returns 用于日期分隔条的展示文本
 */
export function formatDateLabel(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const now = new Date();
  const month = i18n.global.t(`lng_month_day${d.getMonth() + 1}`);
  const day = String(d.getDate());
  if (d.getFullYear() !== now.getFullYear()) {
    return i18n.global.t("lng_month_day_year", {
      month,
      day,
      year: String(d.getFullYear()),
    });
  }
  return i18n.global.t("lng_month_day", { month, day });
}

/**
 * 判断两个秒级时间戳是否属于同一天（按本地时区）。
 *
 * @param a - 第一个秒级时间戳
 * @param b - 第二个秒级时间戳
 * @returns 同一天返回 `true`，否则返回 `false`
 */
export function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a * 1000);
  const db = new Date(b * 1000);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
