/**
 * AI 工具层：返回条数上限的唯一入口。
 *
 * 规则（别绕过）：
 * - 任何返回列表的工具都必须在这里登记默认值与硬顶；
 * - 工具内部不要写 `limit ?? 50` 之类的兜底，一律经 clampLimit()；
 * - 工具的 limit 可以大于 TDLib 单次请求上限，由工具用 TD_PAGE_MAX 分页去拿。
 * scripts/checkAiTools.ts 会挡住漏登记、乱兜底、写类工具不带审核的写法。
 */
import type { ToolResult } from "./types.ts";

/** TDLib 单次请求（getChatHistory / searchChatMessages）的硬上限，工具层按它切块分页 */
export const TD_PAGE_MAX = 100;

export interface LimitSpec {
  /** 不传 limit 时的默认值 */
  def: number;
  /** 硬顶：超过则夹取，并记 limit_clamped 警告 */
  cap: number;
}

/** 与 docs/ai-tools-internal.md 的限额表一一对应 */
export const TOOL_LIMITS = {
  get_recent_messages: { def: 50, cap: 200 },
  get_reply_chain: { def: 50, cap: 200 },
  search_messages: { def: 30, cap: 100 },
  get_members: { def: 100, cap: 500 },
} as const satisfies Record<string, LimitSpec>;

/** 有返回条数上限的工具名 */
export type LimitedTool = keyof typeof TOOL_LIMITS;

function specOf(tool: string): LimitSpec {
  const spec = (TOOL_LIMITS as Record<string, LimitSpec>)[tool];
  if (!spec) throw new Error(`[aiTools] 未登记返回条数上限的工具：${tool}`);
  return spec;
}

/**
 * 归一化 limit：undefined / 非有限数 / < 1 → 默认值；超过硬顶 → 硬顶；否则向下取整。
 * 越界不报错，静默夹取（listResult 会补 limit_clamped 警告）。
 */
export function clampLimit(tool: string, raw?: number): number {
  const { def, cap } = specOf(tool);
  if (raw === undefined || !Number.isFinite(raw) || raw < 1) return def;
  return Math.min(Math.floor(raw), cap);
}

/** 该次调用是否被硬顶夹住了 */
export function isLimitClamped(tool: string, raw?: number): boolean {
  return typeof raw === "number" && Number.isFinite(raw) && raw > specOf(tool).cap;
}

/**
 * 把总条数切成每次 ≤ TD_PAGE_MAX 的请求大小。
 * 例：0→[]（一次都不发）、100→[100]、101→[100,1]、200→[100,100]。
 */
export function pageSizes(total: number): number[] {
  const out: number[] = [];
  for (let left = Math.floor(total); left > 0; left -= TD_PAGE_MAX) {
    out.push(Math.min(left, TD_PAGE_MAX));
  }
  return out;
}

/**
 * 按 TD_PAGE_MAX 分页取数：逐页请求 size 条，直到取满 total 或某页不满（= 服务端没有更多了）。
 * offset 供支持偏移分页的接口用（TDLib 的消息历史用 from_message_id，忽略即可）。
 */
export async function collectPaged<T>(
  total: number,
  fetchPage: (size: number, offset: number) => Promise<T[]>,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let offset = 0;
  for (const size of pageSizes(total)) {
    const page = await fetchPage(size, offset);
    items.push(...page);
    if (page.length < size) return { items, truncated: false };
    offset += size;
  }
  // 取满了请求量：可能还有更多
  return { items, truncated: items.length >= total && total > 0 };
}

export interface ResultOpts {
  /** true = returned 已达 limit，可能还有更多 */
  truncated?: boolean;
  next_cursor?: number;
  warnings?: string[];
}

function envelope<T>(
  tool: string,
  limit: number,
  returned: number,
  data: T,
  opts?: ResultOpts,
  clamped = false,
): ToolResult<T> {
  const warnings = [...(opts?.warnings ?? [])];
  if (clamped) warnings.push("limit_clamped");
  return {
    tool,
    limit,
    returned,
    truncated: opts?.truncated ?? false,
    ...(opts?.next_cursor !== undefined ? { next_cursor: opts.next_cursor } : {}),
    ...(warnings.length ? { warnings } : {}),
    data,
  };
}

/** 单条工具（返回一个对象）的信封：limit=1，字段与其他工具统一 */
export function singleResult<T>(tool: string, data: T, opts?: ResultOpts): ToolResult<T> {
  return envelope(tool, 1, 1, data, opts);
}

/**
 * 列表类工具的统一信封：clamp → 截断 → 算 returned/truncated。
 * 唯一允许 slice 到 limit 的地方；调用方传入「已取到的全部条目」即可。
 */
export function listResult<T>(
  tool: string,
  rawLimit: number | undefined,
  items: T[],
  opts?: ResultOpts,
): ToolResult<T[]> {
  const limit = clampLimit(tool, rawLimit);
  const data = items.slice(0, limit);
  return envelope(
    tool,
    limit,
    data.length,
    data,
    // 调用方分页拿取时能明确知道还有更多 → 以它的判断优先
    { truncated: opts?.truncated ?? items.length > limit, ...opts },
    isLimitClamped(tool, rawLimit),
  );
}
