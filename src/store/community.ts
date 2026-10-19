import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { community } from "tdlib-types";
import { listen } from "@tauri-apps/api/event";

/**
 * 社群缓存：后端 Rust 社区 store 处理 updateCommunity 并缓存，
 * 前端通过 Tauri 事件（community-update）同步，也可主动调用 get_community。
 */
export const useCommunityStore = defineStore("community", () => {
  /** 社群 id → 社群对象（仅缓存可访问的社群） */
  const communities = ref<Record<number, community>>({});
  /** 社群 id → 社群名称（沿用旧接口，消息文案等处直接按 id 取名） */
  const names = computed<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (const [id, c] of Object.entries(communities.value)) {
      if (c.name) out[Number(id)] = c.name;
    }
    return out;
  });

  let updatesInitialized = false;
  function initUpdates(): void {
    if (updatesInitialized) return;
    updatesInitialized = true;

    // 监听后端 community store 发出的更新事件
    void listen<{ id: number }>("community-update", (event) => {
      const c = event.payload as unknown as community;
      if (!c?.id) return;
      const next = { ...communities.value };
      if (c.have_access) next[c.id] = c;
      else delete next[c.id];
      communities.value = next;
    });

    void listen<{ id: number }>("community-removed", (event) => {
      const id = event.payload?.id;
      if (!id) return;
      const next = { ...communities.value };
      delete next[id];
      communities.value = next;
    });
  }

  /** 主动获取社区信息（从 Rust 后端 store） */
  async function fetchCommunity(communityId: number): Promise<void> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const c = await invoke<community>("get_community", { communityId });
      if (c?.id) {
        const next = { ...communities.value };
        if (c.have_access) next[c.id] = c;
        else delete next[c.id];
        communities.value = next;
      }
    } catch (e) {
      console.error("Failed to fetch community", communityId, e);
    }
  }

  return { communities, names, initUpdates, fetchCommunity };
});

