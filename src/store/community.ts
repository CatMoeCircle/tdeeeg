import { defineStore } from "pinia";
import { ref } from "vue";
import type { community } from "tdlib-types";
import { onTdlibUpdate } from "./tdlibBus";

/**
 * 社群名称缓存：messageChatAddedToCommunity 只带 community_id，
 * 社群名称需从 updateCommunity（other 通道）中取得后按 id 查询。
 */
export const useCommunityStore = defineStore("community", () => {
  /** 社群 id → 社群名称（仅缓存可访问的社群） */
  const names = ref<Record<number, string>>({});

  let updatesInitialized = false;
  function initUpdates(): void {
    if (updatesInitialized) return;
    updatesInitialized = true;
    onTdlibUpdate("other", (update) => {
      if (update._ !== "updateCommunity") return;
      const c = (update as unknown as { community?: community }).community;
      if (!c?.id) return;
      if (c.have_access && c.name) names.value[c.id] = c.name;
      else delete names.value[c.id];
    });
  }

  return { names, initUpdates };
});
