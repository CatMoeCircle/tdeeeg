import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend } from "./utils/tdlib";
import { initTdlibBus } from "./store/tdlibBus";
import { useDownloadStore } from "./store/downloads";
import { useUploadStore } from "./store/upload";
import { useConnectionStore } from "./store/connectionState";
import { useOptionsStore } from "./store/options";
import { useUserStore } from "./store/user";
import { useAccountsStore } from "./store/accounts";
import { useLanguageStore } from "./store/language";
import { initSenderInfo } from "./utils/senderInfo";
import { initColors, watchSystemColorScheme } from "./store/colors";
import { initTheme } from "./store/theme";
import { initNativeNotifications } from "./store/notifications";
import { settings } from "./store/settings";
import { loadAiConfig } from "./store/aiConfig";
import { bindWallpaperAccount, restoreWallpaperFromLocalCache } from "./utils/wallpaper";

/**
 * 初始化 TDLib 及各模块的事件监听。
 * 此函数需在 pinia 安装（app.use(pinia)）之后调用，
 * 且应在 app.mount 之前完成，从而让应用先达到稳定授权态再渲染 UI，
 * 避免启动时闪现登录页。
 *
 * 链路：TDLib → Rust UpdateManager（分类/批处理）→ 少量 Tauri events
 *      → tdlibBus（每通道一个 listen）→ Store handler → Vue
 *
 * 注意：这里的各 store.init() 仅注册事件监听/拉取缓存，
 * 均不依赖 DOM，可在挂载前安全执行。
 */
export async function initTdlib() {
    // 0. 先初始化总线：对每条分类通道只 listen 一次
    await initTdlibBus();

    const downloadStore = useDownloadStore();
    const uploadStore = useUploadStore();
    const connectionStore = useConnectionStore();
    const optionsStore = useOptionsStore();
    const userStore = useUserStore();
    const accountsStore = useAccountsStore();
    const languageStore = useLanguageStore();

    // 初始化下载管理器（tdlib-update-file → 总线 file 通道）
    await downloadStore.init();
    // 初始化上传任务（发送文件）进度监听
    await uploadStore.init();
    // 初始化连接状态监听（connection 通道）
    connectionStore.init();
    // 初始化 TDLib options 缓存监听（option 通道）
    optionsStore.init();
    // 初始化发送者缓存监听（user + chat 通道）
    await initSenderInfo();
    // 初始化当前用户信息监听（user 通道）
    await userStore.initUpdates();
    // 初始化多账户管理
    await accountsStore.init();
    // 壁纸：按活动账户从本地缓存恢复（选择后已缓存）
    {
        const accountId = accountsStore.activeAccount?.id ?? null;
        bindWallpaperAccount(accountId);
        restoreWallpaperFromLocalCache(accountId);
    }
    // 初始化 Telegram 色彩主题系统（colors 通道）
    await initColors();
    // 主题系统：明暗模式 + 主题色 + 圆角/阴影/密度
    initTheme();
    // 兼容入口：确保主题系统已就绪（内部幂等）
    watchSystemColorScheme();
    // 初始化系统原生通知（Windows Toast / 通知中心）
    await initNativeNotifications();
    // 语言系统：恢复 UI 语言、监听 language 通道、同步 TDLib language_pack_id
    await languageStore.init();

    // 将前端保存的代理设置同步到 Rust，使 TDLib 客户端创建后能立即应用
    try {
        await invoke("set_proxy_config", {
            mode: settings.proxy.mode,
            proxyId: settings.proxy.selectedProxyId,
        });
    } catch (e) {
        console.error("Error syncing proxy config:", e);
    }

    // AI 翻译配置（后端保存）：非阻塞加载，供提供方可用性判断
    void loadAiConfig().catch((e) => console.error("Error loading AI translate config:", e));

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
