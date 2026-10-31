import { shallowRef } from "vue";
import { toastDuration } from "../store/debug";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: number;
  type: ToastType;
  content: string;
  /** 毫秒；0 = 不自动关闭 */
  duration: number;
  /** 可选动作（如「去看看」）：点了先执行再用 action 关闭 */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * 兼容原有调用形态（字符串 / { content, placement, offset, duration }）。
 * placement / offset 已不再生效：渲染位置统一由开发者选项控制，
 * 见 store/debug.ts 的 toastPlacement 与设置 → 开发者选项。
 */
export interface ToastOptions {
  content: string;
  placement?: string;
  offset?: [number, number];
  duration?: number;
  /** 带动作的提示（AI 后台完成 / 待审批 → 跳到那个聊天） */
  actionLabel?: string;
  onAction?: () => void;
}

export type ToastArg = string | ToastOptions;

/** 当前待渲染的 Toast 队列，由 components/ui/toast/ToastHost.vue 消费 */
export const toastQueue = shallowRef<ToastItem[]>([]);

let seq = 0;

/** 同一时刻最多叠加几条，超出丢弃最旧的，避免刷屏刷爆内存 */
const MAX_VISIBLE = 4;

function push(type: ToastType, arg: ToastArg): Promise<void> {
  const opt = typeof arg === "string" ? { content: arg } : arg;
  const item: ToastItem = {
    id: ++seq,
    type,
    content: opt.content,
    duration: opt.duration ?? toastDuration.value,
    ...(opt.actionLabel ? { actionLabel: opt.actionLabel, onAction: opt.onAction } : {}),
  };
  const next = [...toastQueue.value, item];
  toastQueue.value = next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
  // 保持「await toast.xxx()」的调用形态可用，但不再像 TDesign 那样阻塞到消失
  return Promise.resolve();
}

/** 关闭后从队列移除（组件内部倒计时 / 滑动 / 关闭按钮都会走到这里） */
export function dismissToast(id: number): void {
  toastQueue.value = toastQueue.value.filter((t) => t.id !== id);
}

/**
 * 全局统一 Toast 入口：业务代码只调用 toast.success/error/warning/info，
 * 渲染实现（SwipeToast）只在 ToastHost 里出现。
 */
export const toast = {
  success: (arg: ToastArg) => push("success", arg),
  error: (arg: ToastArg) => push("error", arg),
  warning: (arg: ToastArg) => push("warning", arg),
  info: (arg: ToastArg) => push("info", arg),
};
