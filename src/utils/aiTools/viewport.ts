/**
 * 视口工具实现：读当前聊天滚动容器里**屏幕上真的可见**的消息 id（纯 DOM，不碰 TDLib，不需要审核）。
 *
 * 与 ChatDetail 标记已读用的是同一条几何判断（容器矩形 ∩ 消息元素矩形），差别只有相册：
 * DOM 里一个相册只有首条的 data-msg-id，所以这里也只报首条（工具 desc 里已告知模型）。
 */
import { registerImplementation } from "./call.ts";
import { listResult } from "./limits.ts";
import type { ToolResult } from "./types.ts";

/** 消息滚动容器（ChatDetail 的 messagesContainer；骨架屏那个容器里没有 [data-msg-id]） */
const SCROLL_CONTAINER = ".messages-scroll";

/**
 * 屏幕可见的消息 id，按时间升序。
 * 去重兜住多个聊天容器同时挂载的情况（DOM 顺序即消息顺序，所以排序等价于保持文档顺序）。
 */
export function visibleMessageIds(): number[] {
  if (typeof document === "undefined") return [];
  const ids = new Set<number>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-msg-id]")) {
    const box = el.closest(SCROLL_CONTAINER);
    if (!box) continue;
    const container = box.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= container.top || rect.top >= container.bottom) continue;
    const id = Number(el.dataset.msgId);
    if (id > 0) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

registerImplementation("get_visible_messages", async (args): Promise<ToolResult<number[]>> =>
  listResult("get_visible_messages", args.limit as number | undefined, visibleMessageIds()),
);
