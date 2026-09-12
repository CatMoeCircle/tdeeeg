import { ref, shallowRef } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

/**
 * 调试模式状态（进入方式：在设置里连点版本号 5 次）。
 * 持久化到 localStorage，重启后保持开启。
 */
const DEBUG_KEY = "tdgram-debug-enabled";

/** 是否已开启调试模式（显示设置页官方群组下方的「开发者选项」区块） */
export const debugMode = ref(false);

try {
    debugMode.value = localStorage.getItem(DEBUG_KEY) === "1";
} catch {
    debugMode.value = false;
}

/** 切换调试模式并持久化 */
export function setDebugMode(enabled: boolean): void {
    debugMode.value = enabled;
    try {
        localStorage.setItem(DEBUG_KEY, enabled ? "1" : "0");
    } catch {
        // ignore
    }
}

/**
 * 向 TDLib 发送任意方法（不做类型约束，供开发者调试）。
 * 直接调用底层 `tdlib_send` invoke，允许发送任意 JSON 方法名/参数。
 */
export async function rawTdlibSend(request: Record<string, unknown>): Promise<unknown> {
    const response: unknown = await invoke("tdlib_send", { request });
    if (response && typeof response === "object" && (response as { _?: string })._ === "error") {
        throw response;
    }
    return response;
}

/**
 * update 控制台打印开关。
 * 开启后监听 `tdlib-update` 事件：打印到控制台，并缓存到 recentUpdates 供设置页展示。
 */
export const logUpdates = ref(false);

/** 单条缓存的 update */
export interface CachedUpdate {
  /** 自增序号，保证列表 key 稳定 */
  seq: number;
  /** 毫秒时间戳 */
  t: number;
  /** update 的 `_` 类型名 */
  type: string;
  /** 原始 payload（完整对象，供复制） */
  payload: Record<string, unknown>;
  /** 一行摘要预览 */
  preview: string;
}

/** 内存中保留的最近 update 条数上限 */
const MAX_CACHED_UPDATES = 200;

/** 最近 update（最新在前），仅供开发者选项页展示 */
export const recentUpdates = shallowRef<CachedUpdate[]>([]);

let updateSeq = 0;

/** 从 update 对象提取一行简短预览（类型相关字段） */
function buildUpdatePreview(payload: Record<string, unknown>): string {
  const p = payload as Record<string, unknown>;
  const pick = (...keys: string[]): string[] => {
    const parts: string[] = [];
    for (const k of keys) {
      const v = p[k];
      if (v === undefined || v === null) continue;
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        // 常见嵌套：id / chat_id / message_id / user_id
        const idish = o.id ?? o.chat_id ?? o.message_id ?? o.user_id ?? o._;
        if (idish !== undefined) parts.push(`${k}=${String(idish)}`);
        else parts.push(`${k}={…}`);
      } else {
        parts.push(`${k}=${String(v)}`);
      }
    }
    return parts;
  };

  switch (p._) {
    case "updateNewMessage": {
      const m = p.message as Record<string, unknown> | undefined;
      const c = m?.content as Record<string, unknown> | undefined;
      return pick("chat_id").concat(
        m ? [`msg=${m.id}`] : [],
        c?._ ? [`content=${c._}`] : [],
      ).join(" ");
    }
    case "updateMessageContent": {
      const c = p.new_content as Record<string, unknown> | undefined;
      return pick("chat_id", "message_id").concat(
        c?._ ? [`content=${c._}`] : [],
      ).join(" ");
    }
    case "updateFile": {
      const f = p.file as Record<string, unknown> | undefined;
      const local = f?.local as Record<string, unknown> | undefined;
      return [
        f ? `id=${f.id}` : "",
        local?.is_downloading_completed ? "done" : local?.is_downloading_active ? "downloading" : "",
      ].filter(Boolean).join(" ");
    }
    case "updateChatReadInbox":
    case "updateChatReadOutbox":
      return pick("chat_id", "last_read_inbox_message_id", "last_read_outbox_message_id", "unread_count").join(" ");
    case "updateUser": {
      const u = p.user as Record<string, unknown> | undefined;
      if (!u) return "";
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
      return `id=${u.id}${name ? ` ${name}` : ""}${u.username ? ` @${u.username}` : ""}`;
    }
    case "updateChatTitle":
      return pick("chat_id", "title").join(" ");
    case "updateConnectionState": {
      const s = p.state as Record<string, unknown> | undefined;
      return s?._ ? String(s._) : "";
    }
    case "updateAuthorizationState": {
      const s = p.authorization_state as Record<string, unknown> | undefined;
      return s?._ ? String(s._) : "";
    }
    default: {
      // 兜底：取前几个标量字段
      const parts: string[] = [];
      for (const [k, v] of Object.entries(p)) {
        if (k === "_") continue;
        if (v === null || v === undefined) continue;
        if (typeof v === "object") continue;
        parts.push(`${k}=${String(v)}`);
        if (parts.length >= 4) break;
      }
      return parts.join(" ");
    }
  }
}

let logUpdatesInitialized = false;

/** 初始化 update 事件监听（惰性建立一次监听，具体是否缓存/打印由 logUpdates 控制） */
export async function initDebugUpdateListener(): Promise<void> {
    if (logUpdatesInitialized) return;
    logUpdatesInitialized = true;
    await listen("tdlib-update", (event) => {
        if (!logUpdates.value) return;
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        console.log("[tdlib-update]", payload);
        updateSeq += 1;
        const entry: CachedUpdate = {
            seq: updateSeq,
            t: Date.now(),
            type: typeof payload._ === "string" ? payload._ : "unknown",
            payload,
            preview: buildUpdatePreview(payload),
        };
        const next = [entry, ...recentUpdates.value];
        if (next.length > MAX_CACHED_UPDATES) next.length = MAX_CACHED_UPDATES;
        recentUpdates.value = next;
    });
}

/** 切换是否在控制台打印 update */
export function setLogUpdates(enabled: boolean): void {
    logUpdates.value = enabled;
    if (enabled) {
        void initDebugUpdateListener();
    }
}

/** 清空已缓存的 update 列表 */
export function clearRecentUpdates(): void {
    recentUpdates.value = [];
}

/** 打开 WebView 开发者工具（复用 Rust open_devtools 命令） */
export async function openDevTools(): Promise<void> {
    try {
        await invoke("open_devtools");
    } catch (e) {
        console.warn("open_devtools failed:", e);
    }
}

const COPY_JSON_KEY = "tdgram-debug-copy-json";

/**
 * 是否在右键菜单中显示「复制 XX 原始 JSON」调试项。
 * 由「开发者选项」设置页的开关控制（不再由 import.meta.env.DEV 决定），
 * 持久化到 localStorage，重启后保持。
 */
export const showCopyJsonInMenus = ref(false);

try {
    showCopyJsonInMenus.value = localStorage.getItem(COPY_JSON_KEY) === "1";
} catch {
    showCopyJsonInMenus.value = false;
}

/** 切换右键菜单显示「复制原始 JSON」项并持久化 */
export function setShowCopyJsonInMenus(enabled: boolean): void {
    showCopyJsonInMenus.value = enabled;
    try {
        localStorage.setItem(COPY_JSON_KEY, enabled ? "1" : "0");
    } catch {
        // ignore
    }
}
