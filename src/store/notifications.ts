import { invoke } from "@tauri-apps/api/core";
import { watch } from "vue";
import { settings } from "./settings";
import router from "../router";

/** 通知的 TDLib 更新处理与 Toast 弹出都在 Rust（src-tauri/src/notifications.rs）完成。
 *  前端只负责：同步显示参数/开关，以及当前打开的聊天 id。 */

interface NotificationPrefsPayload {
  enabled: boolean;
  show_preview: boolean;
  show_sender_name: boolean;
  when_app_focused: boolean;
}

function currentPrefs(): NotificationPrefsPayload {
  const n = settings.notifications;
  return {
    enabled: n.enabled,
    show_preview: n.showPreview,
    show_sender_name: n.showSenderName,
    when_app_focused: n.whenAppFocused,
  };
}

async function pushPrefsToRust(): Promise<void> {
  try {
    await invoke("set_notification_prefs", { prefs: currentPrefs() });
  } catch (e) {
    console.error("[Notifications] set_notification_prefs failed:", e);
  }
}

function isChatRoute(name: unknown): boolean {
  return name === "chat-detail" || name === "chat-topic-detail";
}

async function pushActiveChatToRust(): Promise<void> {
  const route = router.currentRoute.value;
  let chatId: number | null = null;
  if (isChatRoute(route.name) && route.params.id !== undefined && route.params.id !== "") {
    const id = Number(route.params.id);
    chatId = Number.isFinite(id) ? id : null;
  }
  try {
    await invoke("set_active_chat_for_notifications", { chatId });
  } catch (e) {
    console.error("[Notifications] set_active_chat failed:", e);
  }
}

let initialized = false;

/** 初始化：推送当前设置与路由状态，并监听后续变化。 */
export async function initNativeNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await pushPrefsToRust();
  await pushActiveChatToRust();

  watch(
    () => [
      settings.notifications.enabled,
      settings.notifications.showPreview,
      settings.notifications.showSenderName,
      settings.notifications.whenAppFocused,
    ],
    () => {
      void pushPrefsToRust();
    },
    { immediate: false },
  );

  router.afterEach(() => {
    void pushActiveChatToRust();
  });
}
