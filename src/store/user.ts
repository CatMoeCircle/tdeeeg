import { defineStore } from "pinia";
import { ref } from "vue";
import type { user } from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";
import { onTdlibUpdate } from "./tdlibBus";

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
   * 订阅总线 user 通道，保持导航栏头像/名称实时更新。
   * Rust 已把 updateUser / updateUserStatus 等分类到 user 通道，这里不再 if 过滤无关类型。
   */
  let updatesInitialized = false;
  async function initUpdates(): Promise<void> {
    if (updatesInitialized) return;
    updatesInitialized = true;
    onTdlibUpdate("user", (update) => {
      const type_ = update._;
      if (type_ === "updateUser" && (update as any).user?.id) {
        const u = (update as any).user as user;
        if (userProfile.value && userProfile.value.id === u.id) {
          userProfile.value = u;
        }
      } else if (type_ === "updateUserStatus" && typeof (update as any).user_id === "number") {
        const uid = (update as any).user_id as number;
        if (userProfile.value && userProfile.value.id === uid && (update as any).status) {
          userProfile.value.status = (update as any).status as user["status"];
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
