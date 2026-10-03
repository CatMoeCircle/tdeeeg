import { ref } from "vue";
import { tdlibSend } from "../utils/tdlib";
import i18n from "../i18n";
import type { chat, user, chatPhotoInfo, profilePhoto } from "tdlib-types";

/**
 * 「@用户名」/「名字提及」菜单的全局状态（Promise 数据流）。
 *
 * 参照 externalLink.ts / deleteMessage.ts 的模式：调用方传入用户名（或用户 id）
 * 与触发坐标，组件 UsernameMenu.vue 监听 visible 渲染；内部用 TDLib 异步解析：
 *   - openUsernameMenu（textEntityTypeMention）→ searchPublicChat 解析：
 *       · 返回 User         → 菜单显示头像 + 姓名 + 「前往」
 *       · 返回 Chat（群/频道）→ 显示该会话资料卡片，点击进资料页
 *       · 解析失败/不存在      → 显示「用户名不在 Telegram 上」
 *   - openUserMenuById（textEntityTypeMentionName，实体直接带 user_id）→ getUser 解析：
 *       · 显示头像 + 姓名 + 「前往」 → 用户资料页
 *   加载期间先显示骨架屏（头像占位），拿到结果再填充。
 */

/** 菜单模式：username=按 @用户名解析；user=按用户 id 解析（消息里的「名字提及」） */
export type UsernameMenuKind = "username" | "user";

export const visible = ref(false);
/** 是否正在异步解析（true 时显示骨架屏） */
export const loading = ref(false);
/** 当前解析出的用户名（不含 @）；用户提及可能没有公开用户名，此时为空串 */
export const username = ref("");
/** 异常/不存在时显示的提示文案 */
export const errorMessage = ref("");
/** 当前菜单模式（决定顶部用户名行的显隐与「前往」目标） */
export const menuKind = ref<UsernameMenuKind>("username");

/** 会话展示信息 */
export interface UsernameMenuDisplay {
    name: string;
    /** 是否群/频道（false 表示个人/机器人） */
    isChat: boolean;
    photo?: chatPhotoInfo | profilePhoto;
    accentId?: number;
    /** 会话 id（username 模式下的跳转目标） */
    chatId?: number;
    /** 用户 id（user 模式下的跳转目标：用户资料页） */
    userId?: number;
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
    menuKind.value = "username";
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
    menuKind.value = "username";
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
                errorMessage.value = i18n.global.t("lng_username_not_found", { user: clean });
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
            errorMessage.value = i18n.global.t("lng_username_not_found", { user: clean });
        } finally {
            if (token === resolveToken) {
                loading.value = false;
            }
        }
    })();
}

/** 触发坐标（供组件定位） */
export const usernameMenuPosition = { x: posX, y: posY };

/**
 * 打开「名字提及」（textEntityTypeMentionName）的用户信息菜单。
 *
 * 这类提及只带 user_id、不一定有用户名，走 getUser 解析；顶部用户名行仅在
 * 该用户确实有公开用户名时显示（见 UsernameMenu.vue），「前往」进用户资料页。
 *
 * @param userId 被提及用户的 id
 * @param px 触发坐标 X
 * @param py 触发坐标 Y
 */
export function openUserMenuById(userId: number, px: number, py: number) {
    if (!userId) return;

    posX.value = px;
    posY.value = py;
    menuKind.value = "user";
    username.value = "";
    loading.value = true;
    errorMessage.value = "";
    display.value = null;
    visible.value = true;
    resolveToken++; // 作废上一次在途请求
    const token = resolveToken;

    void (async () => {
        try {
            const u = await tdlibSend({ _: "getUser", user_id: userId }) as user;
            if (token !== resolveToken || !visible.value) return;

            const uname = u?.usernames?.active_usernames?.[0] ?? "";
            username.value = uname;
            const name = `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim();
            display.value = {
                name: name || (uname ? `@${uname}` : `#${userId}`),
                isChat: false,
                photo: u?.profile_photo,
                accentId: u && u.profile_accent_color_id !== -1
                    ? u.profile_accent_color_id
                    : undefined,
                userId,
            };
        } catch (e) {
            if (token !== resolveToken || !visible.value) return;
            console.warn("getUser failed:", e);
            errorMessage.value = i18n.global.t("userInfoLoadFailed");
        } finally {
            if (token === resolveToken) {
                loading.value = false;
            }
        }
    })();
}
