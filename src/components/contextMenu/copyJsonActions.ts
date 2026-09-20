import type { Component } from "vue";
import { MessagePlugin } from "tdesign-vue-next";
import { Copy as CopyIcon } from "lucide-vue-next";
import type { ChatType } from "tdlib-types";
import type { ContextMenuItem } from "./types";
import { tdlibSend } from "../../utils/tdlib";
import { getReactiveUser } from "../../utils/senderInfo";

/** 将 TDLib 对象 JSON 化并写入剪贴板（开发调试用） */
export async function copyTdlibJson(data: unknown, label: string): Promise<void> {
  if (data === undefined || data === null) {
    MessagePlugin.warning(`${label} 数据不可用`);
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    MessagePlugin.success(`${label} 已复制`);
  } catch {
    MessagePlugin.error("复制失败");
  }
}

/** 构造一条「复制 XX」菜单项；getData 可同步或异步 */
export function makeCopyJsonItem(opts: {
  key: string;
  label: string;
  getData: () => unknown | Promise<unknown>;
  icon?: Component;
  divider?: boolean;
}): ContextMenuItem {
  return {
    key: opts.key,
    label: opts.label,
    icon: opts.icon ?? CopyIcon,
    divider: opts.divider,
    onClick: () => {
      void (async () => {
        try {
          const data = await opts.getData();
          const name = opts.label.replace(/^复制\s*/, "") || opts.label;
          await copyTdlibJson(data, name);
        } catch (e: any) {
          MessagePlugin.error(e?.message || "获取数据失败");
        }
      })();
    },
  };
}

/** 「复制 JSON」父菜单（子菜单展开各 TDLib 对象） */
export function buildCopyJsonParentItem(
  children: ContextMenuItem[],
  icon?: Component,
  label = "复制 JSON",
): ContextMenuItem {
  return {
    key: "copy-json",
    label,
    icon: icon ?? CopyIcon,
    divider: true,
    children,
  };
}

/**
 * 按 chat.type 构建可复制的 TDLib 对象子菜单：
 * chat / user / userFullInfo / 超级群组* / 基本群组* / 加密对话*
 */
export function buildChatJsonChildren(
  chat: { id: number; type?: ChatType },
  icon?: Component,
): ContextMenuItem[] {
  const children: ContextMenuItem[] = [
    makeCopyJsonItem({
      key: "copy-json-chat",
      label: "复制 chat JSON",
      icon,
      getData: () => chat,
    }),
  ];

  const type = chat.type;
  if (!type) return children;

  if (type._ === "chatTypePrivate") {
    const uid = type.user_id;
    children.push(
      makeCopyJsonItem({
        key: "copy-json-user",
        label: "复制 user JSON",
        icon,
        getData: () => getReactiveUser(uid) ?? tdlibSend({ _: "getUser", user_id: uid }),
      }),
      makeCopyJsonItem({
        key: "copy-json-user-full",
        label: "复制 userFullInfo JSON",
        icon,
        getData: () => tdlibSend({ _: "getUserFullInfo", user_id: uid }),
      }),
    );
  } else if (type._ === "chatTypeSecret") {
    const uid = type.user_id;
    const secretId = type.secret_chat_id;
    children.push(
      makeCopyJsonItem({
        key: "copy-json-secret",
        label: "复制 secretChat JSON",
        icon,
        getData: () => tdlibSend({ _: "getSecretChat", secret_chat_id: secretId }),
      }),
      makeCopyJsonItem({
        key: "copy-json-secret-user",
        label: "复制 user JSON",
        icon,
        getData: () => getReactiveUser(uid) ?? tdlibSend({ _: "getUser", user_id: uid }),
      }),
      makeCopyJsonItem({
        key: "copy-json-secret-user-full",
        label: "复制 userFullInfo JSON",
        icon,
        getData: () => tdlibSend({ _: "getUserFullInfo", user_id: uid }),
      }),
    );
  } else if (type._ === "chatTypeSupergroup") {
    const sgId = type.supergroup_id;
    children.push(
      makeCopyJsonItem({
        key: "copy-json-sg",
        label: "复制 supergroup JSON",
        icon,
        getData: () => tdlibSend({ _: "getSupergroup", supergroup_id: sgId }),
      }),
      makeCopyJsonItem({
        key: "copy-json-sg-full",
        label: "复制 supergroupFullInfo JSON",
        icon,
        getData: () => tdlibSend({ _: "getSupergroupFullInfo", supergroup_id: sgId }),
      }),
    );
  } else if (type._ === "chatTypeBasicGroup") {
    const bgId = type.basic_group_id;
    children.push(
      makeCopyJsonItem({
        key: "copy-json-bg",
        label: "复制 basicGroup JSON",
        icon,
        getData: () => tdlibSend({ _: "getBasicGroup", basic_group_id: bgId }),
      }),
      makeCopyJsonItem({
        key: "copy-json-bg-full",
        label: "复制 basicGroupFullInfo JSON",
        icon,
        getData: () => tdlibSend({ _: "getBasicGroupFullInfo", basic_group_id: bgId }),
      }),
    );
  }

  return children;
}
