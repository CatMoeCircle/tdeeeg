import { defineStore } from "pinia";
import { ref } from "vue";
import type { user } from "tdlib-types";
import { listen } from "@tauri-apps/api/event";
import { tdlibSend } from "../utils/tdlib";

/** TDLib update 事件 payload 的松散类型（updateUserFullInfo 等未在 tdlib-types 中约束字段） */
interface TdlibUpdatePayload {
  _?: string;
  user?: user;
  user_id?: number;
  [key: string]: unknown;
}

export const useUserStore = defineStore("user", () => {
  const userProfile = ref<user | undefined>(undefined);

  const fetchUser = async () => {
    try {
      const response = await tdlibSend({ _: "getMe" });
      userProfile.value = response;
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
    }
  };

  /**
   * 订阅 TDLib 推送，保持导航栏头像/名称实时更新。
   * 自己的名称 / 头像 / 状态 / 主题色等变化时，TDLib 会推送 updateUser（携带完整 user 对象），
   * 这里在目标 id 是当前用户时把最新 user 同步到 userProfile，
   * 从而驱动聊天列表导航栏（SideNavBar）与用户设置导航栏（SettingsList）的响应式刷新。
   */
  let updatesInitialized = false;
  async function initUpdates(): Promise<void> {
    if (updatesInitialized) return;
    updatesInitialized = true;
    await listen<TdlibUpdatePayload>("tdlib-update", (event) => {
      const update = event.payload;
      if (!update || typeof update !== "object") return;
      const type_ = update._;
      // 用户名/头像/状态/主题色等基础信息变更 → 若为当前用户则整体替换。
      // 只有 userProfile 已加载（已知自己的 id）时才匹配，避免把其他用户的 update 误写为自己。
      if (type_ === "updateUser" && update.user?.id) {
        const u = update.user;
        if (userProfile.value && userProfile.value.id === u.id) {
          userProfile.value = u;
        }
      }
      // 在线状态变更 → 更新本地 status
      else if (type_ === "updateUserStatus" && typeof update.user_id === "number") {
        const uid = update.user_id as number;
        if (userProfile.value && userProfile.value.id === uid && update.status) {
          userProfile.value.status = update.status as user["status"];
        }
      }
    });
  }

  return {
    userProfile,
    fetchUser,
    initUpdates,
  };
});
