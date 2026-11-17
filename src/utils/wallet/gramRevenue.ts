/**
 * TON Gram 收入（TDLib `gramRevenueStatistics` / `gramRevenueStatus`）的解析与格式化。
 *
 * - 金额一律是最小单位 **纳克**（1 Gram = 1e9），`gramRevenueStatus` 里以字符串给出；
 * - `usd_rate` 的注释是「nanogram → USD cents」，所以美元估值 = 纳克 × usd_rate ÷ 100；
 * - 按日曲线在 `revenue_by_day_graph` 里：`statisticalGraphData.json_data` 是一段
 *   { columns: [{ type: 'date' | 'number', name }], rows: [[date, value], ...] } 的 JSON；
 *   异步图（`statisticalGraphAsync`）要先用 `getStatisticalGraph` 换取 JSON；
 *   `statisticalGraphError` 直接带错误文案。
 */
import type { StatisticalGraph } from 'tdlib-types';

/** 1 Gram = 1e9 纳克（TDLib 最小单位） */
export const NANOGRAMS_PER_GRAM = 1e9;

/** 按日收益点（`nanograms` 为 TDLib 原始单位） */
export interface GramRevenuePoint {
    /** Unix 时间戳（秒） */
    date: number;
    /** 当日收入，纳克 */
    nanograms: number;
}

/** 图形数据来源的归一化结果 */
export interface GramRevenueGraphInfo {
    /** 可直接解析的 JSON；异步图时为空 */
    jsonData: string;
    /** 非空表示需要 getStatisticalGraph({ token, x: 0 }) 再取数据 */
    token: string;
    /** TDLib 给出的图错误文案（无则空串） */
    errorMessage: string;
}

/** 把 `revenue_by_day_graph` 归一化成「JSON / 异步 token / 错误文案」三种情况 */
export function gramRevenueGraphInfo(graph: StatisticalGraph | null | undefined): GramRevenueGraphInfo {
    if (!graph) return { jsonData: '', token: '', errorMessage: '' };
    switch (graph._) {
        case 'statisticalGraphData':
            return { jsonData: graph.json_data, token: '', errorMessage: '' };
        case 'statisticalGraphAsync':
            return { jsonData: '', token: graph.token, errorMessage: '' };
        case 'statisticalGraphError':
            return { jsonData: '', token: '', errorMessage: graph.error_message };
        default:
            return { jsonData: '', token: '', errorMessage: '' };
    }
}

/** TDLib 的字符串金额（纳克）→ number；解析失败按 0 处理 */
export function parseNanogramAmount(raw: string | number | null | undefined): number {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
}

/** 纳克 → Gram 数值（可能带小数） */
export function nanogramsToGram(nanograms: number): number {
    return Number.isFinite(nanograms) ? nanograms / NANOGRAMS_PER_GRAM : 0;
}

/** 格式化 Gram 数量：常规保留 2 位小数，不足 1 Gram 时保留 4 位，避免显示成 0 */
export function formatGram(nanograms: number, locale: string): string {
    const grams = nanogramsToGram(nanograms);
    const abs = Math.abs(grams);
    const digits = abs > 0 && abs < 1 ? 4 : 2;
    return new Intl.NumberFormat(locale, {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
    }).format(grams);
}

/**
 * 由纳克与 `usd_rate`（纳克 → 美分）推算美元估值并格式化。
 * 汇率缺失或非正数时返回空串（调用方据此不展示）。
 */
export function formatGramUsd(nanograms: number, usdCentsPerNanogram: number, locale: string): string {
    if (!Number.isFinite(usdCentsPerNanogram) || usdCentsPerNanogram <= 0) return '';
    if (!Number.isFinite(nanograms)) return '';
    const usd = (nanograms * usdCentsPerNanogram) / 100;
    const digits = Math.abs(usd) > 0 && Math.abs(usd) < 0.01 ? 4 : 2;
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: digits,
        }).format(usd);
    } catch {
        return '';
    }
}

/** 解析按日曲线 JSON；列顺序不固定时按 column.type 取 date / number */
export function parseGramRevenueGraphJson(jsonData: string | null | undefined): GramRevenuePoint[] {
    if (!jsonData) return [];
    let parsed: { columns?: Array<{ type?: string }>; rows?: unknown[][] };
    try {
        parsed = JSON.parse(jsonData) as typeof parsed;
    } catch {
        return [];
    }
    const columns = Array.isArray(parsed.columns) ? parsed.columns : [];
    const dateIndex = columns.findIndex(column => column?.type === 'date');
    const numberIndex = columns.findIndex(column => column?.type === 'number');
    const dateAt = dateIndex >= 0 ? dateIndex : 0;
    const valueAt = numberIndex >= 0 ? numberIndex : 1;
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

    const points: GramRevenuePoint[] = [];
    for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const date = Number(row[dateAt]);
        const nanograms = Number(row[valueAt]);
        if (!Number.isFinite(date) || date <= 0 || !Number.isFinite(nanograms)) continue;
        points.push({ date: Math.trunc(date), nanograms });
    }
    return points;
}

/** 曲线里的最大单日收入（纳克），用于图表比例；全负/空时返回 0 */
export function maxGramRevenue(points: ReadonlyArray<GramRevenuePoint>): number {
    let max = 0;
    for (const point of points) {
        if (point.nanograms > max) max = point.nanograms;
    }
    return max;
}
