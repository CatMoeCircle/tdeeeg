import type { StatisticalGraph, dateRange } from "tdlib-types";
import { tdlibSend } from "../session/tdlib";

/** 图表中的一条数据序列（一条折线或一组柱子） */
export interface StatSeries {
  /** 服务端列标识，如 y0 */
  id: string;
  /** 图例名称；服务端未提供时为空串 */
  name: string;
  /** 序列颜色；服务端未提供时使用默认配色 */
  color: string;
  /** 服务端声明的图形类型：line / area / bar / step 等 */
  kind: string;
  /** 与 labels 按下标对齐的数值 */
  values: number[];
}

/** 解析后的统计图表数据 */
export interface StatGraph {
  /** x 轴标签；可能为空串，调用方应按时间戳补全 */
  labels: string[];
  /** x 轴原始数值（时间序列统一为毫秒时间戳，已从秒归一化） */
  xValues: number[];
  series: StatSeries[];
  /** x 轴为毫秒时间戳且点位递增，可按时段裁剪 */
  timeSeries: boolean;
}

/** 单个统计图的加载结果 */
export type StatGraphResult =
  | { status: "ok"; graph: StatGraph }
  | { status: "empty" }
  | { status: "error"; message: string };

/** 服务端未给颜色时的默认配色 */
const DEFAULT_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
];

/** 毫秒时间戳判定阈值：2023 年后的毫秒时间戳约 1.7e12，远大于任何序号 */
const UNIX_MILLIS_MIN = 1e11;

/** 旧格式可能返回秒级时间戳：1e8（1973 年）到 1e11 之间按秒处理 */
const UNIX_SECONDS_MIN = 1e8;

const MS_PER_DAY = 86400000;

/** 异步图表最多递归加载层数（token 拿到的仍是异步图时为上限） */
const MAX_ASYNC_GRAPH_DEPTH = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "string") result.push(item);
    else if (typeof item === "number") result.push(String(item));
    else result.push("");
  }
  return result;
}

/**
 * x 轴时间戳统一归一化为毫秒。
 * 真实统计载荷用毫秒（如 1700000000000）；旧载荷可能是秒，这里一并换算。
 */
function normalizeTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  if (value > UNIX_MILLIS_MIN) return value;
  if (value > UNIX_SECONDS_MIN) return value * 1000;
  return value;
}

interface SeriesMeta {
  name: string;
  color: string;
  kind: string;
}

/** 读取图表元信息：types 既可能是 { y0: {...} } 也可能是 [{ id, ... }] */
function readSeriesMeta(raw: unknown): Map<string, SeriesMeta> {
  const result = new Map<string, SeriesMeta>();
  const collect = (id: unknown, item: unknown): void => {
    if (typeof id !== "string" || id === "" || !isRecord(item)) return;
    const name = typeof item.name === "string" ? item.name : typeof item.title === "string" ? item.title : "";
    const color =
      typeof item.color === "string"
        ? item.color
        : typeof item.borderColor === "string"
          ? item.borderColor
          : "";
    const kind = typeof item.type === "string" ? item.type : "";
    result.set(id, { name, color, kind });
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isRecord(item)) collect(item.id, item);
    }
  } else if (isRecord(raw)) {
    for (const [id, item] of Object.entries(raw)) collect(id, item);
  }
  return result;
}

/** 读取 id → 字符串映射（真实载荷的 names / colors 都是这种形态） */
function readStringMap(raw: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!isRecord(raw)) return result;
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === "string" && value !== "") result.set(id, value);
  }
  return result;
}

/** 读取列标识：columns 可能是 ["x", "y0"] 或 [{ id: "y0" }] 或 { y0: ... } */
function readColumnIds(raw: unknown): string[] {
  const ids: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") ids.push(item);
      else if (isRecord(item) && typeof item.id === "string") ids.push(item.id);
    }
  } else if (isRecord(raw)) {
    ids.push(...Object.keys(raw));
  }
  return ids;
}

/** labels 可能是 { x: [...] } 也可能直接是数组 */
function readXLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return toStringList(raw);
  if (isRecord(raw)) return toStringList(raw.x);
  return [];
}

interface ParsedData {
  xValues: number[];
  series: Map<string, number[]>;
}

/**
 * 真实图表载荷形态：columns 是「数组的数组」，
 * 每列首元素是列 id（字符串），其余是数值；没有 data 字段。
 * 形如 { columns: [["x", 1700000000000, ...], ["y0", 12, 34, ...]] }
 */
function readColumnArrays(raw: unknown): ParsedData | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const series = new Map<string, number[]>();
  let xValues: number[] = [];
  let sawColumnArray = false;
  for (const column of raw) {
    if (!Array.isArray(column) || column.length === 0) continue;
    if (typeof column[0] !== "string" || column[0] === "") continue;
    sawColumnArray = true;
    const id = column[0];
    const values: number[] = [];
    for (let index = 1; index < column.length; index += 1) {
      values.push(toFiniteNumber(column[index]) ?? 0);
    }
    if (values.length === 0) continue;
    if (id === "x") xValues = values.map(normalizeTimestamp);
    else series.set(id, values);
  }
  if (!sawColumnArray || series.size === 0) return null;
  return { xValues, series };
}

/** 读取数值：data 可能是 [{ x, y0 }] 行数组，也可能是 { x: [], y0: [] } 列数组 */
function readData(raw: unknown, ids: string[]): ParsedData | null {
  if (Array.isArray(raw)) {
    const rows = raw.filter(isRecord);
    if (rows.length === 0) return null;
    const xValues = rows.map((row) =>
      normalizeTimestamp(toFiniteNumber(row.x) ?? toFiniteNumber(row.ts) ?? 0),
    );
    const series = new Map<string, number[]>();
    for (const id of ids) {
      const values: number[] = [];
      let hasValue = false;
      for (const row of rows) {
        const value = toFiniteNumber(row[id]);
        if (value !== null) hasValue = true;
        values.push(value ?? 0);
      }
      if (hasValue) series.set(id, values);
    }
    return series.size > 0 ? { xValues, series } : null;
  }
  if (isRecord(raw)) {
    const series = new Map<string, number[]>();
    for (const id of ids) {
      const list = raw[id];
      if (!Array.isArray(list) || list.length === 0) continue;
      series.set(id, list.map((item) => toFiniteNumber(item) ?? 0));
    }
    const xList = Array.isArray(raw.x) ? raw.x : [];
    const xValues = xList.map((item) => normalizeTimestamp(toFiniteNumber(item) ?? 0));
    return series.size > 0 ? { xValues, series } : null;
  }
  return null;
}

/** 对齐各序列长度，并判定是否为可裁剪的时间序列（毫秒时间戳） */
function buildGraph(rawLabels: string[], rawXValues: number[], rawSeries: StatSeries[]): StatGraph | null {
  let count = Math.max(rawLabels.length, rawXValues.length);
  for (const item of rawSeries) count = Math.max(count, item.values.length);
  if (count === 0 || rawSeries.length === 0) return null;
  const labels: string[] = [];
  const xValues: number[] = [];
  for (let index = 0; index < count; index += 1) {
    labels.push(index < rawLabels.length ? rawLabels[index] : "");
    xValues.push(index < rawXValues.length ? rawXValues[index] : 0);
  }
  const series = rawSeries.map((item) => {
    const values: number[] = [];
    for (let index = 0; index < count; index += 1) {
      values.push(index < item.values.length ? item.values[index] : 0);
    }
    return { ...item, values };
  });
  const allX = xValues.every((value) => value > UNIX_MILLIS_MIN);
  let increasing = true;
  for (let index = 1; index < xValues.length; index += 1) {
    if (xValues[index] < xValues[index - 1]) {
      increasing = false;
      break;
    }
  }
  return { labels, xValues, series, timeSeries: allX && increasing };
}

/** 兼容 { labels, datasets } 形态（dataset 内含 label / data / borderColor） */
function parseDatasetGraph(root: Record<string, unknown>): StatGraph | null {
  const datasets = Array.isArray(root.datasets) ? root.datasets : null;
  if (!datasets) return null;
  const series: StatSeries[] = [];
  for (const item of datasets) {
    if (!isRecord(item) || !Array.isArray(item.data)) continue;
    const values = item.data.map((value) => toFiniteNumber(value) ?? 0);
    if (values.length === 0) continue;
    const color =
      typeof item.borderColor === "string"
        ? item.borderColor
        : typeof item.backgroundColor === "string"
          ? item.backgroundColor
          : DEFAULT_PALETTE[series.length % DEFAULT_PALETTE.length];
    series.push({
      id: typeof item.id === "string" ? item.id : "s" + String(series.length),
      name: typeof item.label === "string" ? item.label : "",
      color,
      kind: typeof item.type === "string" ? item.type : "line",
      values,
    });
  }
  if (series.length === 0) return null;
  return buildGraph(toStringList(root.labels), [], series);
}

/**
 * 把 statisticalGraphData.json_data 解析成渲染用的图表数据。
 *
 * 真实载荷（TDLib 服务端）：
 *   { columns: [["x", <毫秒时间戳>, ...], ["y0", 12, 34, ...]], names: { y0: "名称" }, colors: { y0: "#4CAF50" } }
 * 兼容的旧形态：
 *   { columns: ["x", "y0"], types: {...}, data: [{ x, y0 }] | { x: [], y0: [] }, labels: { x: [...] } }
 *   { labels: [...], datasets: [{ label, data, borderColor }] }
 * 无法识别或 JSON 损坏时返回 null。
 */
export function parseStatGraphJson(json: string): StatGraph | null {
  if (typeof json !== "string" || json.trim() === "") return null;
  let root: unknown;
  try {
    root = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(root)) return null;

  const datasetGraph = parseDatasetGraph(root);
  if (datasetGraph) return datasetGraph;

  const meta = readSeriesMeta(root.types);
  const names = readStringMap(root.names);
  const colors = readStringMap(root.colors);
  const labels = readXLabels(root.labels);

  // 真实载荷：数值直接内嵌在 columns 的数组列里；旧载荷走 data 字段
  let data = readColumnArrays(root.columns);
  if (!data) {
    const columnIds = readColumnIds(root.columns).filter((id) => id !== "x");
    const ids = columnIds.length > 0 ? columnIds : Array.from(meta.keys());
    data = readData(root.data, ids);
  }
  if (!data) return null;

  const series: StatSeries[] = [];
  let index = 0;
  for (const [id, values] of data.series) {
    const info = meta.get(id);
    const name = (info && info.name !== "" ? info.name : "") || names.get(id) || "";
    const color =
      (info && info.color !== "" ? info.color : "") ||
      colors.get(id) ||
      DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
    series.push({
      id,
      name,
      color,
      kind: info && info.kind !== "" ? info.kind : "line",
      values,
    });
    index += 1;
  }
  if (series.length === 0) return null;

  const fallbackLabels = data.xValues.map(() => "");
  return buildGraph(labels.length > 0 ? labels : fallbackLabels, data.xValues, series);
}

/** 从 tdlibSend 抛出的 TDLib error 对象中取出可读信息（它并非 Error 实例） */
export function tdlibErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error_message === "string") return record.error_message;
  return "";
}

/**
 * 是否为权限不足类错误。
 * TDLib 权限错误既可能是 403，也可能是 400 + CHAT_ADMIN_REQUIRED 之类的 message，
 * 因此同时看错误码与关键字。
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === 403) return true;
  const message = tdlibErrorText(error).toUpperCase();
  if (message === "") return false;
  const keywords = [
    "ADMIN_REQUIRED",
    "CHAT_ADMIN",
    "NOT ENOUGH RIGHTS",
    "NO RIGHTS",
    "NOT AN ADMINISTRATOR",
    "HAVE NO RIGHTS",
    "PARTICIPANT_REQUIRED",
    "STATISTICS_UNAVAILABLE",
    "STATISTICS ARE NOT AVAILABLE",
    "STATISTICS ARE UNAVAILABLE",
  ];
  for (const keyword of keywords) {
    if (message.indexOf(keyword) >= 0) return true;
  }
  return false;
}

/** 加载单个图表：data 直接解析，async 走 getStatisticalGraph，error 原样返回 */
export async function loadStatGraph(
  chatId: number,
  graph: StatisticalGraph,
  depth = 0,
): Promise<StatGraphResult> {
  if (!graph) return { status: "empty" };
  switch (graph._) {
    case "statisticalGraphData": {
      const parsed = parseStatGraphJson(graph.json_data);
      return parsed ? { status: "ok", graph: parsed } : { status: "empty" };
    }
    case "statisticalGraphAsync": {
      if (depth >= MAX_ASYNC_GRAPH_DEPTH) return { status: "empty" };
      try {
        const loaded = await tdlibSend({
          _: "getStatisticalGraph",
          chat_id: chatId,
          token: graph.token,
          x: 0,
        });
        return await loadStatGraph(chatId, loaded, depth + 1);
      } catch (error) {
        return { status: "error", message: tdlibErrorText(error) };
      }
    }
    case "statisticalGraphError":
      return { status: "error", message: graph.error_message };
    default:
      return { status: "empty" };
  }
}

/**
 * 只保留最近 days 天的点位（仅时间序列，x 为毫秒）。
 * 统计接口本身不返回完整历史之外的区间，这里只是对服务端数据的本地视图裁剪；
 * 裁剪后不足 2 个点时返回原图，避免图表被裁没。
 */
export function sliceGraphByDays(graph: StatGraph, days: number, endDate?: number): StatGraph {
  if (!graph.timeSeries || days <= 0 || graph.series.length === 0 || graph.xValues.length === 0) {
    return graph;
  }
  const lastX = endDate && endDate > 0 ? endDate : graph.xValues[graph.xValues.length - 1];
  const threshold = lastX - days * MS_PER_DAY;
  const keep: number[] = [];
  graph.xValues.forEach((x, index) => {
    if (x >= threshold) keep.push(index);
  });
  if (keep.length < 2 || keep.length === graph.xValues.length) return graph;
  return {
    labels: keep.map((index) => (index < graph.labels.length ? graph.labels[index] : "")),
    xValues: keep.map((index) => graph.xValues[index]),
    series: graph.series.map((item) => ({
      ...item,
      values: keep.map((index) => (index < item.values.length ? item.values[index] : 0)),
    })),
    timeSeries: graph.timeSeries,
  };
}

/** 小数值格式化（最多一位小数） */
export function formatDecimal(value: number, locale = "en"): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(value);
  }
}

/** 统计数值格式化：小于 1000 直接显示，大数用紧凑写法（1.2K / 3.4M） */
export function formatStatNumber(value: number, locale = "en"): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 1000) {
    return Number.isInteger(rounded) ? String(rounded) : formatDecimal(rounded, locale);
  }
  try {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(rounded);
  } catch {
    return String(rounded);
  }
}

/** 增长率 → "+12.5%" / "-3%"；0 或无效值返回 null（不展示） */
export function formatGrowth(value: number): string | null {
  if (!Number.isFinite(value) || Math.round(value * 10) === 0) return null;
  const rounded = Math.round(value * 10) / 10;
  return (rounded > 0 ? "+" : "") + String(rounded) + "%";
}

/** 0-100 百分比 → "62.5%" */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return String(Math.round(value * 10) / 10) + "%";
}

/** 统计区间本地化：2025年1月1日 – 2025年1月31日（TDLib 的 dateRange 是秒） */
export function formatDateRange(period: dateRange | undefined | null, locale = "en"): string {
  if (!period) return "";
  const format = (timestamp: number): string => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    const date = new Date(timestamp * 1000);
    try {
      return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  };
  const start = format(period.start_date);
  const end = format(period.end_date);
  if (start === "" || end === "") return start !== "" ? start : end;
  return start + " – " + end;
}

/** 单个 x 值格式化（x 为毫秒时间戳） */
function formatAxisValue(value: number, withTime: boolean, locale: string): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const date = new Date(value);
  try {
    const options: Intl.DateTimeFormatOptions = withTime
      ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric" };
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return withTime ? date.toISOString().slice(5, 16).replace("T", " ") : date.toISOString().slice(5, 10);
  }
}

/** 图表 x 轴标签：服务端未给标签时按毫秒时间戳（时间序列）或序号生成 */
export function formatAxisLabel(value: number, timeSeries: boolean, locale = "en"): string {
  if (!timeSeries) return String(value);
  return formatAxisValue(value, false, locale);
}

/**
 * 生成图表的 x 轴标签：优先用服务端返回的 labels，
 * 否则按毫秒时间戳生成（跨度不超过 3 天时带上小时:分钟）。
 */
export function buildAxisLabels(graph: StatGraph, locale = "en"): string[] {
  for (const label of graph.labels) {
    if (label !== "") return graph.labels;
  }
  if (!graph.timeSeries) return graph.xValues.map((value) => String(value));
  const first = graph.xValues[0];
  const last = graph.xValues[graph.xValues.length - 1];
  const withTime = graph.xValues.length > 1 && last - first > 0 && last - first <= 3 * MS_PER_DAY;
  return graph.xValues.map((value) => formatAxisValue(value, withTime, locale));
}
