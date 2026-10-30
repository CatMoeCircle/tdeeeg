import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { onTdlibUpdate } from "./tdlibBus";
import { buildMiniAppThemeParameters } from "../utils/miniappTheme";

/**
 * Mini App 会话状态：原生载体（Rust tdlib/miniapp.rs）以独立窗口加载 app，
 * 窗口自带原生标题栏（返回/关闭按钮），这里只跟踪「当前打开的会话」与
 * 可信 bot 列表（免责声明 UI 用）。
 *
 * 打开链路：按钮分发（utils/inlineButton）→ openWebApp（TDLib）拿到
 * launch_id + 最终 URL → 本 store 调 open_mini_app 命令 → 载体建窗。
 */

export interface MiniAppSession {
    launchId: string;
    botUserId: number;
    chatId?: number;
    url: string;
    title: string;
    /** 打开按钮的文案（app 发数据时 sendWebAppData 需要） */
    buttonText?: string;
    /** bot 头像本地路径（标题栏左侧显示） */
    avatarPath?: string;
}

export const useMiniAppStore = defineStore("miniapp", () => {
    /** 当前打开的 Mini App 会话（原生存续状态，关闭事件清空） */
    const active = ref<MiniAppSession | null>(null);
    /** updateTrustedMiniAppBots：免警告打开的 bot 列表 */
    const trustedBots = ref<number[]>([]);

    let unlistenEvent: UnlistenFn | null = null;

    async function open(url: string, session: Omit<MiniAppSession, "url">) {
        await init();
        await invoke("open_mini_app", {
            request: {
                url,
                launch_id: session.launchId,
                bot_user_id: session.botUserId,
                chat_id: session.chatId ?? 0,
                button_text: session.buttonText ?? "",
                title: session.title || "Mini App",
                avatar_path: session.avatarPath ?? "",
                theme: buildMiniAppThemeParameters(),
            },
        });
        active.value = { url, ...session };
    }

    /** 原生载体事件：关闭/失败时同步清空（返回/头部颜色等已由原生标题栏处理） */
    async function init() {
        if (unlistenEvent) return;
        unlistenEvent = await listen("miniapp-event", (e) => {
            const payload = e.payload as { launch_id?: string | number; event: string };
            const matches = active.value && String(payload.launch_id) === active.value.launchId;
            if (matches && (payload.event === "closed" || payload.event === "failed")) {
                active.value = null;
            }
        });
        onTdlibUpdate("other", (u) => {
            if (u._ === "updateTrustedMiniAppBots" && Array.isArray(u.bot_user_ids)) {
                trustedBots.value = u.bot_user_ids as number[];
            }
        });
    }

    return { active, trustedBots, open, init };
});
