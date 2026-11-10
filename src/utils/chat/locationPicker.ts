/**
 * 「发送位置」弹窗的纯计算：Web Mercator 拖动换算、坐标归一化、上次位置缓存解析。
 *
 * 刻意不 import Vue / Tauri / i18n，方便单独跑自检，也避免把地图数学散落进组件。
 * TDLib 的静态地图缩略图按标准 Web Mercator 投影出图（256px 瓦片、zoom 13-20），
 * 所以拖动像素与经纬度的换算必须在同一个投影像素空间里做。
 */

/** 地理坐标（WGS-84，单位：度） */
export interface GeoPoint {
    latitude: number;
    longitude: number;
}

/** TDLib getMapThumbnailFile 允许的 zoom 区间是 13-20 */
export const MAP_ZOOM_MIN = 13;
export const MAP_ZOOM_MAX = 20;
/** 打开弹窗时的默认缩放：街道级，能看清周边路网 */
export const MAP_ZOOM_DEFAULT = 16;

/** Web Mercator 能表示的最大纬度；再往极点走 tan() 发散，投影无定义 */
export const MERCATOR_MAX_LATITUDE = 85.05112878;

/** 标准 Web Mercator 单块瓦片的像素边长 */
const TILE_SIZE = 256;

/** 指针位移不超过该值（CSS px）视为「点击」而不是「拖动」 */
export const DRAG_THRESHOLD_PX = 4;

/** 没有历史位置时的兜底中心：北京，避免落在 0,0 的海洋上 */
export const DEFAULT_GEO_POINT: GeoPoint = { latitude: 39.9042, longitude: 116.4074 };

/** 上次发送位置的 localStorage 键 */
export const LAST_LOCATION_STORAGE_KEY = 'tdgram-last-location';

function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
    return (rad * 180) / Math.PI;
}

/** 数值钳制；非有限值按 min 处理（地图数学里 NaN 只会毁掉整次请求） */
export function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

/**
 * 经度归一化到 [-180, 180)。
 * 地图可以一直往东 / 往西拖，但坐标不能越界；跨 180° 经线时直接绕回来。
 */
export function normalizeLongitude(longitude: number): number {
    if (!Number.isFinite(longitude)) return 0;
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** 纬度钳制在 Mercator 可表示范围内（±85.0511），否则地图中心会失效 */
export function clampMercatorLatitude(latitude: number): number {
    return clampNumber(latitude, -MERCATOR_MAX_LATITUDE, MERCATOR_MAX_LATITUDE);
}

/** 把任意坐标整理成地图能用的合法值（非法分量退化为 0） */
export function normalizeGeoPoint(point: GeoPoint): GeoPoint {
    return {
        latitude: Number.isFinite(point.latitude) ? clampMercatorLatitude(point.latitude) : 0,
        longitude: Number.isFinite(point.longitude) ? normalizeLongitude(point.longitude) : 0,
    };
}

/** 缓存里的坐标校验：既要是有限数，也要落在真实经纬度范围内 */
export function isValidGeoPoint(value: unknown): value is GeoPoint {
    if (!value || typeof value !== 'object') return false;
    const { latitude, longitude } = value as Partial<GeoPoint>;
    return (
        typeof latitude === 'number' &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        typeof longitude === 'number' &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
    );
}

/** 解析 localStorage 里的上次位置；坏数据 / 被禁用一律当作「没有」 */
export function parseStoredGeoPoint(raw: string | null | undefined): GeoPoint | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isValidGeoPoint(parsed)) return null;
        return normalizeGeoPoint(parsed);
    } catch {
        return null;
    }
}

/** 序列化到 localStorage（只存两个分量，避免把 TDLib 的 `_` 之类一起存进去） */
export function serializeGeoPoint(point: GeoPoint): string {
    return JSON.stringify({ latitude: point.latitude, longitude: point.longitude });
}

/** zoom 取整并钳制到 TDLib 允许的 13-20 */
export function clampZoom(zoom: number): number {
    return Math.round(clampNumber(zoom, MAP_ZOOM_MIN, MAP_ZOOM_MAX));
}

/** 指定 zoom 下 Web Mercator 世界的像素宽度（整条 360° 经线对应的像素数） */
export function worldSize(zoom: number): number {
    return TILE_SIZE * 2 ** clampZoom(zoom);
}

/**
 * 拖动换算：内容被拖动 (dx, dy) 像素后，地图中心落到哪个坐标。
 *
 * 经度是线性映射：整条 360° 对应 worldSize 像素，所以 `dLon = -dx / worldSize * 360`
 * （内容往右拖 → 看到的区域往西移 → 中心经度变小）。
 *
 * 纬度走 Mercator：`t = ln(tan(π/4 + φ/2)) = asinh(tan φ)`，像素 y 与 t 线性相关
 * `y = (1 - t/π) / 2 * worldSize`，因此 dy 像素对应 `Δt = 2π*dy / worldSize`；
 * 内容往下拖（dy > 0）露出的是北边，t 变大，最后由 `φ = atan(sinh(t))` 反解回纬度。
 */
export function panCenterByPixels(center: GeoPoint, dx: number, dy: number, zoom: number): GeoPoint {
    const base = normalizeGeoPoint(center);
    const size = worldSize(zoom);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return base;

    const longitude = normalizeLongitude(base.longitude - (dx / size) * 360);

    const t = Math.asinh(Math.tan(toRadians(base.latitude)));
    const nextT = t + (2 * Math.PI * dy) / size;
    const latitude = clampMercatorLatitude(toDegrees(Math.atan(Math.sinh(nextT))));

    return { latitude, longitude };
}

/**
 * 把地图上「相对中心偏移 (offsetX, offsetY) 像素」的那一点移到中心（点击地图）。
 * 等价于把内容反向平移同样的像素，所以直接复用拖动换算。
 */
export function centerOnOffsetPoint(center: GeoPoint, offsetX: number, offsetY: number, zoom: number): GeoPoint {
    return panCenterByPixels(center, -offsetX, -offsetY, zoom);
}

/** 坐标展示：固定 6 位小数（约 0.1 米，远高于 TDLib 的传输精度） */
export function formatCoordinate(value: number): string {
    return Number.isFinite(value) ? value.toFixed(6) : '0.000000';
}
