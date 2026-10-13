import { MessagePlugin } from "tdesign-vue-next";

type ToastArg = Parameters<typeof MessagePlugin.success>[0];

/**
 * 全局统一 Toast 入口：业务代码只调用 toast.success/error/warning/info，
 * 后期替换 Toast 组件库只需改这一个文件。
 */
export const toast = {
  success: (arg: ToastArg) => MessagePlugin.success(arg),
  error: (arg: ToastArg) => MessagePlugin.error(arg),
  warning: (arg: ToastArg) => MessagePlugin.warning(arg),
  info: (arg: ToastArg) => MessagePlugin.info(arg),
};
