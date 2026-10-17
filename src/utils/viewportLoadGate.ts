/**
 * 视口触发加载的闸门：按界面分池，互不阻塞。
 *
 * 配合 useViewportLoad / 贴纸面板懒加载使用：
 * - 停留防抖（dwell）由调用方完成：元素进入视口后必须停留一小段时间才允许
 *   触发 load，快速划过直接取消，避免瞬间滚动打出大量 downloadFile。
 * - 本模块按 **scope** 维护独立队列（chat / sticker / profile…），聊天消息
 *   下载排满时不会堵住贴纸管理器，反之亦然。
 * - 每个池限制同时执行的 load 数。load 若返回 Promise（真正的下载/IO），
 *   会占住槽位直到 settle；fire-and-forget 的 load 在同步返回后立刻释放。
 *   并发数按池配置：详情弹窗（stickerDetail）为 1，即严格串行。
 * - 排队中的任务可被丢弃：enqueueViewportLoad 返回句柄，cancel() 或
 *   clearViewportLoadQueue(scope) 只丢弃**尚未开始**的任务，已在执行的不打断；
 *   丢弃时触发 onDrop 供调用方撤销下载列表登记。
 */

/**
 * 默认停留时长（ms）：过滤滚轮/惯性快速划过。
 * 预取带已在视口外扩（约一屏），停留只需过滤惯性甩动，不宜过长以免用户先看到空白。
 */
export const DEFAULT_DWELL_MS = 500;

/** 每个界面池的视口 load 最大并发数（默认） */
export const MAX_CONCURRENT_VIEWPORT_LOADS = 3;

/**
 * 界面分池标识：
 * - chat:        聊天消息媒体 / 头像 / 自定义 emoji 等
 * - sticker:     贴纸 / GIF / 表情抽屉
 * - profile:     个人资料共享媒体网格 / 礼物列表
 * - stickerDetail: 贴纸/emoji 详情弹窗（独立队列，关闭时清空排队）
 */
export type ViewportLoadScope = 'chat' | 'sticker' | 'profile' | 'stickerDetail' | 'avatar';

interface ScopeConfig {
    /** 同时执行的 load 上限 */
    max: number;
    /** 相邻两次启动之间的最小间隔（ms）：限流，0 表示不限流 */
    minIntervalMs: number;
}

const SCOPE_CONFIG: Record<ViewportLoadScope, ScopeConfig> = {
    chat: { max: MAX_CONCURRENT_VIEWPORT_LOADS, minIntervalMs: 0 },
    sticker: { max: MAX_CONCURRENT_VIEWPORT_LOADS, minIntervalMs: 0 },
    profile: { max: MAX_CONCURRENT_VIEWPORT_LOADS, minIntervalMs: 0 },
    // 头像：小文件但数量多，单独一池限制并发，不与正文媒体互相挤占
    avatar: { max: 4, minIntervalMs: 0 },
    // 详情弹窗：严格串行，一个下载完成后才启动下一个
    stickerDetail: { max: 1, minIntervalMs: 0 },
};

type LoadTask = () => void | Promise<void>;

interface QueuedLoad {
    run: LoadTask;
    /** 任务在开始执行前被丢弃时回调（撤销下载列表登记等） */
    onDrop?: () => void;
}

interface ScopePool {
    queue: QueuedLoad[];
    active: number;
    lastStartAt: number;
    timer: ReturnType<typeof setTimeout> | null;
    config: ScopeConfig;
}

/** 排队句柄：可在任务开始执行前丢弃它 */
export interface ViewportLoadHandle {
    /** 丢弃尚未开始的排队任务；已开始执行时无效。返回是否真的丢弃了 */
    cancel(): boolean;
}

const pools = new Map<ViewportLoadScope, ScopePool>();

function getPool(scope: ViewportLoadScope): ScopePool {
    let pool = pools.get(scope);
    if (!pool) {
        pool = { queue: [], active: 0, lastStartAt: 0, timer: null, config: SCOPE_CONFIG[scope] };
        pools.set(scope, pool);
    }
    return pool;
}

function pump(pool: ScopePool) {
    while (pool.active < pool.config.max && pool.queue.length > 0) {
        const wait = pool.lastStartAt + pool.config.minIntervalMs - Date.now();
        if (wait > 0) {
            // 限流：未到下一个启动时刻，稍后再继续出队
            if (!pool.timer) {
                pool.timer = setTimeout(() => {
                    pool.timer = null;
                    pump(pool);
                }, wait);
            }
            return;
        }
        const entry = pool.queue.shift()!;
        pool.lastStartAt = Date.now();
        pool.active++;
        void (async () => {
            try {
                await entry.run();
            } catch {
                // load 内部通常已处理错误；这里吞掉异常以免卡死队列
            } finally {
                pool.active--;
                pump(pool);
            }
        })();
    }
}

/**
 * 将一次视口 load 排入指定界面池。
 * task 返回 Promise 时占住槽位直至完成（并发 1 的池里即「上一个完成才下一个」）。
 *
 * @param onDrop 任务在开始执行前被丢弃（cancel / clearViewportLoadQueue）时调用；
 *   已在执行的任务不受 cancel 影响，也不会触发 onDrop。
 */
export function enqueueViewportLoad(
    task: LoadTask,
    scope: ViewportLoadScope = 'chat',
    onDrop?: () => void,
): ViewportLoadHandle {
    const pool = getPool(scope);
    const entry: QueuedLoad = { run: task, onDrop };
    pool.queue.push(entry);
    pump(pool);

    let cancelled = false;
    return {
        cancel(): boolean {
            if (cancelled) return false;
            cancelled = true;
            const idx = pool.queue.indexOf(entry);
            // 不在队列里 = 已开始执行或已完成：不打断进行中的下载
            if (idx < 0) return false;
            pool.queue.splice(idx, 1);
            entry.onDrop?.();
            return true;
        },
    };
}

/**
 * 清空指定池的排队任务（已在执行的不受影响）。
 * 用于详情弹窗关闭等场景：退出即丢弃尚未开始的加载。
 */
export function clearViewportLoadQueue(scope: ViewportLoadScope): void {
    const pool = pools.get(scope);
    if (!pool) return;
    const dropped = pool.queue.splice(0, pool.queue.length);
    if (pool.timer) {
        clearTimeout(pool.timer);
        pool.timer = null;
    }
    for (const entry of dropped) entry.onDrop?.();
}

/** 调试/诊断用：各池排队与在跑数量 */
export function getViewportLoadQueueStats() {
    const stats: Record<string, { queued: number; active: number; max: number }> = {};
    for (const [scope, pool] of pools) {
        stats[scope] = {
            queued: pool.queue.length,
            active: pool.active,
            max: pool.config.max,
        };
    }
    return stats;
}
