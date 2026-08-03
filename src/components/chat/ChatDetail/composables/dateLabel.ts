/**
 * 日期格式化与日界判断工具（纯函数，无任何响应式依赖）。
 */

/**
 * 将 TDLib 消息时间戳格式化为日期分隔标签。
 * - 同一年：`M月D日`（如 `8月3日`）
 * - 跨年份：`YYYY年M月D日`（如 `2025年12月31日`）
 *
 * @param timestamp - TDLib 消息的 `date` 字段（秒级时间戳）
 * @returns 用于日期分隔条的展示文本
 */
export function formatDateLabel(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const now = new Date();
    if (d.getFullYear() !== now.getFullYear()) {
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
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
        da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate()
    );
}
