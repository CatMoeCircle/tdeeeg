import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type {
  message,
  chatPosition,
  ChatList,
  chatPhotoInfo,
  draftMessage,
  chatListMain,
  chatListArchive,
  chatFolderInfo,
  ChatType,
} from "tdlib-types";

/** 聊天列表示例项：主列表 | 归档 | 文件夹信息 */
export type ChatListEntry = chatListMain | chatListArchive | chatFolderInfo;

export interface Chat {
  id: number;
  type?: ChatType;
  title: string;
  unread_count: number;
  last_message?: message;
  positions?: Array<chatPosition>;
  chat_lists?: Array<ChatList>;
  photo?: chatPhotoInfo;
  draft_message?: draftMessage;
}

export interface ChatListState {
  list_key: string;
  chat_ids: number[];
}

/** 每个列表的独立加载状态 */
export interface ListLoadState {
  loading: boolean;
  finished: boolean;
  /** 等待中的 loadChats 批次计数，用于判断是否该释放 loading */
  pendingBatch: number;
}

export const useChatStore = defineStore("chat", () => {
  const chats = ref<Record<number, Chat>>({});
  const lists = ref<Record<string, number[]>>({});
  const chatLists = ref<ChatListEntry[]>([]);
  /** 每个列表独立的加载状态 */
  const listStates = ref<Record<string, ListLoadState>>({});

  function getListState(listKey: string): ListLoadState {
    if (!listStates.value[listKey]) {
      listStates.value[listKey] = { loading: false, finished: false, pendingBatch: 0 };
    }
    return listStates.value[listKey];
  }

  // Initialize listener
  const initListener = async () => {
    await listen<ChatListState>("chat-list-update", (event) => {
      const { list_key, chat_ids } = event.payload;
      // 合并而非覆盖：只把 chat_ids 中不存在的 ID 追加到末尾
      // （事件系统是权威来源，但我们需要保留可能来自其他批次的、本批次未覆盖的 ID）
      // 用新顺序完全替换（事件是权威顺序）
      lists.value[list_key] = chat_ids;

      // 释放该列表的 loading 状态
      const state = getListState(list_key);
      if (state.pendingBatch > 0) {
        state.pendingBatch--;
      }
      if (state.pendingBatch <= 0) {
        state.loading = false;
      }
    });

    await listen<Chat>("chat-update", (event) => {
      const chat = event.payload;
      chats.value[chat.id] = chat;
    });

    await listen<any>("chat-folders-update", (event) => {
      chatLists.value = event.payload;
    });
  };

  const loadChatLists = async () => {
    try {
      chatLists.value = await invoke("get_chat_lists");
    } catch (e) {
      console.error("Failed to load chat lists:", e);
    }
  };

  // Fetch initial list — 只填充首次加载用，避免覆盖事件已有数据
  const loadList = async (list: ChatListEntry) => {
    try {
      const plainList = JSON.parse(JSON.stringify(list));
      const res = await invoke<any>("get_chat_list", { list: plainList });
      const key = res.list_key;

      // 仅当该列表尚未有任何数据时才填充，避免覆盖事件来源的实时数据
      if (!lists.value[key] || lists.value[key].length === 0) {
        lists.value[key] = res.chat_ids || [];
      }

      // Populate chat details if provided by backend
      if (res.chats && Array.isArray(res.chats)) {
        for (const c of res.chats) {
          if (c && c.id) {
            chats.value[c.id] = { ...chats.value[c.id], ...c };
          }
        }
      }
    } catch (e) {
      console.error("Failed to load chat list:", e);
    }
  };

  /**
   * 调用 loadChats 并登记一个等待批次。
   * 当下一次 chat-list-update 事件到来时，pendingBatch--；
   * 当 pendingBatch <= 0 时 loading 自动释放。
   * 若超过 timeout ms 仍未收到事件，强制释放。
   */
  const requestLoadMore = (listKey: string, chatList: any) => {
    const state = getListState(listKey);
    if (state.loading || state.finished) return;
    state.loading = true;
    state.pendingBatch++;

    // 发送 loadChats 请求（异步，不 await）
    invoke("tdlib_send", {
      request: { _: "loadChats", chat_list: chatList, limit: 50 },
    }).then((res: any) => {
      // loadChats 返回 { _: "ok" } 表示成功，或 { _: "error", code: 404 } 表示已耗尽
      if (res && res._ === "error" && res.code === 404) {
        state.finished = true;
        state.pendingBatch = Math.max(0, state.pendingBatch - 1);
        if (state.pendingBatch <= 0) {
          state.loading = false;
        }
      }
    }).catch((e: any) => {
      console.error("loadChats failed:", e);
      state.pendingBatch = Math.max(0, state.pendingBatch - 1);
      if (state.pendingBatch <= 0) {
        state.loading = false;
      }
    });

    // 安全兜底：3秒后强制释放 loading 防止死锁
    setTimeout(() => {
      if (state.loading) {
        state.pendingBatch = 0;
        state.loading = false;
      }
    }, 3000);
  };

  const getList = (listKey: string) =>
    computed(() => {
      const ids = lists.value[listKey] || [];
      return ids
        .map((id) => {
          const c = chats.value[id];
          if (c) return c;
          // 返回占位对象，避免列表突然跳变
          return { id, title: "…", unread_count: 0 } as Chat;
        });
    });

  const isLoading = (listKey: string) => computed(() => getListState(listKey).loading);
  const isFinished = (listKey: string) => computed(() => getListState(listKey).finished);

  /** 重置某个列表的状态（切换 Tab 时调用） */
  const resetListState = (listKey: string) => {
    const state = getListState(listKey);
    state.loading = false;
    state.finished = false;
    state.pendingBatch = 0;
  };

  return {
    chats,
    lists,
    chatLists,
    listStates,
    initListener,
    loadChatLists,
    loadList,
    getList,
    requestLoadMore,
    isLoading,
    isFinished,
    resetListState,
  };
});
