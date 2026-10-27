/**
 * 微软地图（Bing Maps）地点链接。
 *
 * 注意：`cp` 只是把地图视角移到该坐标，并不会在地图上落标记点。
 * 要同时显示标记，必须用 `sp=point.<lat>_<lon>_<label>_<title>`：
 * - label：标记旁直接显示的短文本（不要带下划线，会和 sp 的分隔符冲突）
 * - title：点击标记后漂浮框里的标题
 *
 * 项目内所有「用微软地图打开某个坐标」都应走这里，避免出现只定位不显示 Pin 的链接。
 */
export function bingMapsLink(
    latitude: number,
    longitude: number,
    opts: { zoom?: number; label?: string; title?: string } = {},
): string {
    const lat = normalizeCoord(latitude);
    const lon = normalizeCoord(longitude);
    // Bing 的 lvl 与 TDLib 的 zoom 都是 1-20
    const lvl = Math.min(20, Math.max(1, Math.round(opts.zoom ?? 16)));
    const label = sanitizePinText(opts.label) || 'Location';
    const title = sanitizePinText(opts.title) || 'Location';
    return `https://www.bing.com/maps/default.aspx?cp=${lat}~${lon}&lvl=${lvl}&sp=point.${lat}_${lon}_${label}_${title}`;
}

/** 坐标保留最多 6 位小数（去掉多余的 0，Bing 用 ~ 分隔经纬度） */
function normalizeCoord(value: number): string {
    return String(Number(value.toFixed(6)));
}

/** sp 里 label/title 不能含下划线；剔除分隔符后整体百分号编码（空格 → %20） */
function sanitizePinText(value?: string): string {
    const text = (value ?? '')
        .replace(/_/g, ' ')
        .replace(/[~&#?]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
        .trim();
    return encodeURIComponent(text);
}
