import type { messageCall } from "tdlib-types";
import i18n from "../i18n";
import { tdPlural } from "./tdLang";
import formatTime from "./formatTime";

/**
 * 通话结束消息（messageCall）的文案：
 * - 类型：拨出未接通「通话已取消」/ 来电未接通「未接来电」/ 来电被拒「拒接」/ 其余按方向
 * - 状态行：通话时间（官方通话记录词条：今天 / 昨天 / 具体日期）+ 通话时长
 * 未接通（未接 / 被拒）没有通话时长，只显示时间。
 */

/** 通话时长：不足一分钟用「x 秒」，否则「x 分钟 x 秒」 */
export function callDurationText(seconds: number): string {
    if (seconds < 60) return tdPlural("lng_duration_seconds", seconds);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (rest === 0) return tdPlural("lng_duration_minsec_minutes", minutes);
    return `${tdPlural("lng_duration_minsec_minutes", minutes)} ${tdPlural("lng_duration_minsec_seconds", rest)}`;
}

/** 通话类型文案；outgoing 为该消息是否由自己发出 */
export function callTitleText(call: messageCall, outgoing: boolean): string {
    const t = i18n.global.t;
    const video = call.is_video;
    const reason = call.discard_reason._;
    if (outgoing) {
        return reason === "callDiscardReasonMissed"
            ? t(video ? "lng_call_video_cancelled" : "lng_call_cancelled")
            : t(video ? "lng_call_video_outgoing" : "lng_call_outgoing");
    }
    if (reason === "callDiscardReasonMissed") {
        return t(video ? "lng_call_video_missed" : "lng_call_missed");
    }
    if (reason === "callDiscardReasonDeclined") {
        return t(video ? "lng_call_video_declined" : "lng_call_declined");
    }
    return t(video ? "lng_call_video_incoming" : "lng_call_incoming");
}

/** 通话状态行：时间（今天 / 昨天 / 日期）+ 时长 */
export function callStatusText(call: messageCall, date: number): string {
    const t = i18n.global.t;
    const time = formatTime(date);
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(new Date(date * 1000))) / 86400000);
    const timeText = daysAgo === 0
        ? t("lng_call_box_status_today", { time })
        : daysAgo === 1
            ? t("lng_call_box_status_yesterday", { time })
            : t("lng_call_box_status_date", {
                date: new Date(date * 1000).toLocaleDateString(
                    String(i18n.global.locale.value),
                    { month: "long", day: "numeric" },
                ),
                time,
            });
    const connected = call.discard_reason._ !== "callDiscardReasonMissed"
        && call.discard_reason._ !== "callDiscardReasonDeclined";
    return connected && call.duration > 0
        ? t("lng_call_duration_info", { time: timeText, duration: callDurationText(call.duration) })
        : timeText;
}