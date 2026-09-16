import formatTime from "./formatTime";
import type { UserStatus } from "tdlib-types";
import i18n from "../i18n";

const MINUTES_RECENT = 5;

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(a: Date, b: Date) {
  const yesterday = new Date(b);
  yesterday.setDate(b.getDate() - 1);
  return isSameDay(a, yesterday);
}

/** 紧凑日期：同年省略年，同月省略年月（如「3月5日」） */
function formatStatusDate(lastDate: Date, nowDate: Date): string {
  const sameYear = lastDate.getFullYear() === nowDate.getFullYear();
  const sameMonth = sameYear && lastDate.getMonth() === nowDate.getMonth();

  const options: Intl.DateTimeFormatOptions = { day: "numeric" };
  if (!sameMonth) options.month = "numeric";
  if (!sameYear) options.year = "numeric";

  return lastDate.toLocaleDateString(undefined, options);
}

/**
 * 格式化用户在线状态
 */
export default function formatStatus(userStatus?: UserStatus): string {
  const t = i18n.global.t;

  if (!userStatus) return t("lng_status_offline");

  switch (userStatus._) {
    case "userStatusOnline":
      return t("lng_status_online");

    case "userStatusOffline": {
      const lastSeen = userStatus.was_online;
      if (!lastSeen) return t("lng_status_offline");

      const nowMs = Date.now();
      const lastMs = lastSeen * 1000;
      const diffMinutes = (nowMs - lastMs) / 60000;

      if (diffMinutes <= MINUTES_RECENT) return t("lng_status_lastseen_now");

      if (diffMinutes < 60) {
        return t("lng_status_lastseen_minutes", {
          count: Math.max(1, Math.floor(diffMinutes)),
        });
      }

      const lastDate = new Date(lastMs);
      const nowDate = new Date(nowMs);
      const time = formatTime(lastSeen);

      if (isSameDay(lastDate, nowDate)) {
        return t("lng_status_lastseen_hours", {
          count: Math.max(1, Math.floor(diffMinutes / 60)),
        });
      }

      if (isYesterday(lastDate, nowDate)) {
        return t("lng_status_lastseen_yesterday", { time });
      }

      return t("lng_status_lastseen_date_time", {
        date: formatStatusDate(lastDate, nowDate),
        time,
      });
    }

    case "userStatusRecently":
      return t("lng_status_recently");

    case "userStatusLastWeek":
      return t("lng_status_last_week");

    case "userStatusLastMonth":
      return t("lng_status_last_month");

    case "userStatusEmpty":
    default:
      return t("lng_status_offline");
  }
}
