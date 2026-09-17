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
 */

/** 默认停留时长（ms）：过滤滚轮/惯性快速划过 */
export const DEFAULT_DWELL_MS = 500;

/** 每个界面池的视口 load 最大并发数 */
export const MAX_CONCURRENT_VIEWPORT_LOADS = 3;

/**
 * 界面分池标识：
 * - chat:    聊天消息媒体 / 头像 / 自定义 emoji 等
 * - sticker: 贴纸 / GIF / 表情抽屉
 * - profile: 个人资料共享媒体网格
 */
export type ViewportLoadScope = 'chat' | 'sticker' | 'profile';

type LoadTask = () => void | Promise<void>;

interface ScopePool {
    queue: LoadTask[];
    active: number;
}

const pools = new Map<ViewportLoadScope, ScopePool>();

function getPool(scope: ViewportLoadScope): ScopePool {
    let pool = pools.get(scope);
    if (!pool) {
        pool = { queue: [], active: 0 };
        pools.set(scope, pool);
    }
    return pool;
}

function pump(pool: ScopePool) {
    while (pool.active < MAX_CONCURRENT_VIEWPORT_LOADS && pool.queue.length > 0) {
        const task = pool.queue.shift()!;
        pool.active++;
        void (async () => {
            try {
                await task();
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
 * task 返回 Promise 时占住槽位直至完成。
 */
export function enqueueViewportLoad(
    task: LoadTask,
    scope: ViewportLoadScope = 'chat',
): void {
    const pool = getPool(scope);
    pool.queue.push(task);
    pump(pool);
}

/** 调试/诊断用：各池排队与在跑数量 */
export function getViewportLoadQueueStats() {
    const stats: Record<string, { queued: number; active: number; max: number }> = {};
    for (const [scope, pool] of pools) {
        stats[scope] = {
            queued: pool.queue.length,
            active: pool.active,
            max: MAX_CONCURRENT_VIEWPORT_LOADS,
        };
    }
    return stats;
}
