import { ref } from "vue";
import { tdlibSend } from "../utils/tdlib";
import type { chat, user, chatPhotoInfo, profilePhoto } from "tdlib-types";

/**
 * 「@用户名」菜单的全局状态（Promise 数据流）。
 *
 * 参照 externalLink.ts / deleteMessage.ts 的模式：调用方 openUsernameMenu 传入
 * 用户名与触发坐标，组件 UsernameMenu.vue 监听 visible 渲染；内部用 TDLib
 * `searchPublicChat(用户名)` 异步解析：
 *   - 返回 User         → 菜单显示头像 + 姓名 + 「前往」
 *   - 返回 Chat（群/频道）→ 显示该会话资料卡片，点击进资料页
 *   - 解析失败/不存在      → 显示「用户名不在 Telegram 上」
 *   加载期间先显示骨架屏（头像占位），拿到结果再填充。
 */

export const visible = ref(false);
/** 是否正在异步解析（true 时显示骨架屏） */
export const loading = ref(false);
/** 当前 @ 用户名（不含 @） */
export const username = ref("");
/** 异常/不存在时显示的提示文案 */
export const errorMessage = ref("");

/** 会话展示信息 */
export interface UsernameMenuDisplay {
    name: string;
    /** 是否群/频道（false 表示个人/机器人） */
    isChat: boolean;
    photo?: chatPhotoInfo | profilePhoto;
    accentId?: number;
    chatId: number;
}

export const display = ref<UsernameMenuDisplay | null>(null);

/** 触发坐标 */
const posX = ref(0);
const posY = ref(0);

let resolveToken = 0;

/** 关闭菜单 */
export function closeUsernameMenu() {
    visible.value = false;
    loading.value = false;
    errorMessage.value = "";
    display.value = null;
    resolveToken++; // 使在途请求结果作废
}

/**
 * 打开 @用户名 菜单并触发 searchPublicChat 解析。
 *
 * @param name 完整用户名文本（可能带前导 @，会被去掉）
 * @param px 触发坐标 X
 * @param py 触发坐标 Y
 */
export function openUsernameMenu(name: string, px: number, py: number) {
    const clean = String(name || "").replace(/^@/, "").trim();
    if (!clean) return;

    posX.value = px;
    posY.value = py;
    username.value = clean;
    loading.value = true;
    errorMessage.value = "";
    display.value = null;
    visible.value = true;
    resolveToken++; // 作废上一次在途请求
    const token = resolveToken;

    void (async () => {
        try {
            const chatResult = await tdlibSend({
                _: "searchPublicChat",
                username: clean,
            }) as chat;

            if (token !== resolveToken || !visible.value) return;

            if (!chatResult) {
                errorMessage.value = "用户名不在 Telegram 上";
                return;
            }

            const t = chatResult.type;
            // 私聊/密聊：底层是用户，用 getUser 取姓名与头像
            if (t?._ === "chatTypePrivate" || t?._ === "chatTypeSecret") {
                const uid = (t as any).user_id as number;
                let u: user | undefined;
                try {
                    u = await tdlibSend({ _: "getUser", user_id: uid }) as user;
                } catch { /* 用户信息缺失时回退会话标题 */ }
                if (token !== resolveToken || !visible.value) return;
                display.value = {
                    name: u ? `${u.first_name} ${u.last_name}`.trim()
                        : (chatResult.title || `@${clean}`),
                    isChat: false,
                    photo: u?.profile_photo ?? chatResult.photo,
                    accentId: u && u.profile_accent_color_id !== -1
                        ? u.profile_accent_color_id
                        : undefined,
                    chatId: chatResult.id,
                };
                return;
            }

            // 群组 / 频道
            display.value = {
                name: chatResult.title || `@${clean}`,
                isChat: true,
                photo: chatResult.photo,
                accentId: chatResult.profile_accent_color_id !== -1
                    ? chatResult.profile_accent_color_id
                    : undefined,
                chatId: chatResult.id,
            };
        } catch (e) {
            if (token !== resolveToken || !visible.value) return;
            console.warn("searchPublicChat failed:", e);
            errorMessage.value = "用户名不在 Telegram 上";
        } finally {
            if (token === resolveToken) {
                loading.value = false;
            }
        }
    })();
}

/** 触发坐标（供组件定位） */
export const usernameMenuPosition = { x: posX, y: posY };
