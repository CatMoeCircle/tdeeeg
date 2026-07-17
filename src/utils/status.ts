import formatTime from "./formatTime";
import type { UserStatus } from "tdlib-types";

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

/**
 * 格式化用户在线状态
 * @param lastSeen unix seconds 时间戳（秒）
 * @param isOnline 是否当前在线
 */
export default function formatStatus(userStatus?: UserStatus): string {
  if (!userStatus) return "很久没上线";

  switch (userStatus._) {
    case "userStatusOnline":
      return "在线";

    case "userStatusOffline": {
      const lastSeen = userStatus.was_online;
      console.log("Last seen timestamp:", lastSeen);

      if (!lastSeen) return "很久没上线";

      const nowMs = Date.now();
      const lastMs = lastSeen * 1000;
      const diffMs = nowMs - lastMs;
      const diffMinutes = diffMs / 60000;

      if (diffMinutes <= MINUTES_RECENT) return "近期在线";

      const lastDate = new Date(lastMs);
      const nowDate = new Date(nowMs);

      // 今天：只显示时间，如 "19:00 在线"
      if (isSameDay(lastDate, nowDate)) {
        return `${formatTime(lastSeen)} 在线`;
      }

      // 昨天：显示 "昨天 18:00 在线"
      if (isYesterday(lastDate, nowDate)) {
        return `昨天 ${formatTime(lastSeen)} 在线`;
      }

      // 其他日期：按规则显示日期，年/月可省略
      const parts: string[] = [];

      const sameYear = lastDate.getFullYear() === nowDate.getFullYear();
      const sameMonth = sameYear && lastDate.getMonth() === nowDate.getMonth();

      if (!sameYear) {
        parts.push(`${lastDate.getFullYear()}年`);
      }

      if (!sameMonth) {
        parts.push(`${lastDate.getMonth() + 1}月`);
      }

      parts.push(`${lastDate.getDate()}日`);

      return `${parts.join("")} ${formatTime(lastSeen)} 在线`;
    }

    case "userStatusRecently":
      return "近期在线";

    case "userStatusLastWeek":
      return "近期一周在线";

    case "userStatusLastMonth":
      return "近期一个月在线";

    case "userStatusEmpty":
    default:
      return "很久没上线";
  }
}
