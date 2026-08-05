import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend } from "./utils/tdlib";
import { useDownloadStore } from "./store/downloads";
import { useConnectionStore } from "./store/connectionState";
import { useOptionsStore } from "./store/options";
import { initSenderInfo } from "./utils/senderInfo";
import { initColors, watchSystemColorScheme } from "./store/colors";
import type { Update } from "tdlib-types";

/**
 * 初始化 TDLib 及各模块的事件监听。
 * 此函数需在 pinia 安装（app.use(pinia)）之后调用，
 * 且应在 app.mount 之前完成，从而让应用先达到稳定授权态再渲染 UI，
 * 避免启动时闪现登录页。
 *
 * 注意：这里的各 store.init() 仅注册事件监听/拉取缓存，
 * 均不依赖 DOM，可在挂载前安全执行。
 */
export async function initTdlib() {
  const downloadStore = useDownloadStore();
  const connectionStore = useConnectionStore();
  const optionsStore = useOptionsStore();

  // 初始化下载管理器的 updateFile 监听
  await downloadStore.init();
  // 初始化连接状态监听（updateConnectionState）
  connectionStore.init();
  // 初始化 TDLib options 缓存监听
  optionsStore.init();
  // 初始化发送者缓存监听（复用 update 中携带的用户/对话数据，避免重复 getUser/getChat）
  await initSenderInfo();
  // 初始化 Telegram 色彩主题系统（updateAccentColors / updateProfileAccentColors）
  await initColors();
  // 跟随系统明暗模式，供 accent 色选择对应明暗色板
  watchSystemColorScheme();

  if (import.meta.env.DEV) {
    await listen<Update>("tdlib-update", (event) => {
      const update = event.payload;
      console.log("Received update:", update);
    });
  }

  // Listen for initialization errors (e.g. invalid API ID/Hash)
  await listen("tdlib-init-error", (event) => {
    console.error("TDLib init error event:", event.payload);
    // @ts-ignore
    const errorMsg = event.payload?.message || JSON.stringify(event.payload);
    MessagePlugin.error({ content: errorMsg, placement: "top-right" });
  });

  // Listen for debug logs
  await listen("tdlib-log", (event) => {
    console.log("[Rust Log]:", event.payload);
  });

  await invoke("init_tdlib").catch((e) => {
    console.error("Error invoking init_tdlib:", e);
    throw e;
  });
}

/**
 * 等待 TDLib 授权态进入稳定状态，而不是固定等待 2 秒。
 * 生产环境（打包后）冷启动更慢：DLL 加载、打开数据库、网络握手耗时更长，
 * 固定 setTimeout(2000) 会在授权态尚未就绪时误判并跳到 /login 再闪回 /home。
 * 这里在 init_tdlib 完成后轮询 getAuthorizationState，直到离开“尚未初始化”的中间态
 * （WaitTdlibParameters / WaitEncryptionKey），再按真实状态返回。
 */
export async function waitForAuthorization(): Promise<"ready" | "login"> {
  const INIT_MAX_WAIT_MS = 30000;
  const RETRY_MS = 250;
  const started = Date.now();
  // 这些是“初始化尚未完成”的中间授权态，继续等待
  const pendingStates = new Set([
    "authorizationStateWaitTdlibParameters",
    "authorizationStateWaitEncryptionKey",
  ]);
  let state: string = "";
  for (; ;) {
    try {
      const result = await tdlibSend({ _: "getAuthorizationState" });
      state = result._;
      if (!pendingStates.has(state)) break;
    } catch (_) {
      // 初始化偶发错误，继续重试
    }
    if (Date.now() - started > INIT_MAX_WAIT_MS) break;
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  return state === "authorizationStateReady" ? "ready" : "login";
}
