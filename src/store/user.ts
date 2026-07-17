import { defineStore } from "pinia";
import { ref } from "vue";
import type { user } from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";

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

  return {
    userProfile,
    fetchUser,
  };
});
