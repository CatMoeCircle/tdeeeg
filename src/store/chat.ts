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
  /** 防止重复注册事件监听器 */
  let listenerInitialized = false;

  function getListState(listKey: string): ListLoadState {
    if (!listStates.value[listKey]) {
      listStates.value[listKey] = { loading: false, finished: false, pendingBatch: 0 };
    }
    return listStates.value[listKey];
  }

  // Initialize listener — 单次注册，防止重复
  const initListener = async () => {
    if (listenerInitialized) return;
    listenerInitialized = true;

    await listen<ChatListState>("chat-list-update", (event) => {
      const { list_key, chat_ids } = event.payload;
      // 用事件（权威来源）的完整排序列表替换
      lists.value[list_key] = chat_ids;

      // 注意：loading 状态不由 chat-list-update 事件管理，
      // 而是由 requestLoadMore 中的 loadChats 响应负责释放。
      // 一个 loadChats 可能触发多个 updateNewChat 事件，
      // 每个都产生 chat-list-update，如果在这里递减 pendingBatch
      // 会导致 loading 被过早释放。
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

  // Fetch initial list — 总是填充 Rust 缓存的 chat 对象，不覆盖列表顺序
  const loadList = async (list: ChatListEntry) => {
    try {
      const plainList = JSON.parse(JSON.stringify(list));
      const res = await invoke<any>("get_chat_list", { list: plainList });
      const key = res.list_key;

      // 总是填充 chat 对象（Rust 缓存），补全事件可能漏掉的数据
      if (res.chats && Array.isArray(res.chats)) {
        for (const c of res.chats) {
          if (c && c.id) {
            // 缓存数据作为兜底：如果还没有数据就填充，如果已有（来自事件）则保留事件数据
            if (!chats.value[c.id]) {
              chats.value[c.id] = c;
            } else {
              // 事件数据优先于缓存数据 — 缓存只是兜底，事件才是实时来源
              chats.value[c.id] = { ...c, ...chats.value[c.id] };
            }
          }
        }
      }

      // 仅当该列表尚未有任何数据时才填充 ID 列表
      if (!lists.value[key] || lists.value[key].length === 0) {
        lists.value[key] = res.chat_ids || [];
      }
    } catch (e) {
      console.error("Failed to load chat list:", e);
    }
  };

  /**
   * 调用 loadChats 并登记一个等待批次。
   * loading 状态由 loadChats 的响应（ok/error）释放，不由 chat-list-update 事件管理。
   * 一个 loadChats 可能触发多个 updateNewChat 事件，每个都会产生 chat-list-update，
   * 所以不能在事件处理中递减 pendingBatch。
   * 若超过 timeout ms 未收到响应，强制释放防止死锁。
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
      // loadChats 返回 { _: "ok" } 表示成功（可能有后续 updateNewChat 事件，也可能无新数据）
      // 或 { _: "error", code: 404 } 表示已耗尽
      if (res && res._ === "error") {
        if (res.code === 404) {
          state.finished = true;
        } else {
          console.error("loadChats returned error:", res);
        }
      }
      // 无论 ok 还是 error，都释放 batch
      state.pendingBatch = Math.max(0, state.pendingBatch - 1);
      if (state.pendingBatch <= 0) {
        state.loading = false;
      }
    }).catch((e: any) => {
      console.error("loadChats failed:", e);
      state.pendingBatch = Math.max(0, state.pendingBatch - 1);
      if (state.pendingBatch <= 0) {
        state.loading = false;
      }
    });

    // 安全兜底：12秒后强制释放 loading 防止死锁（首次同步可能较慢）
    setTimeout(() => {
      if (state.loading) {
        console.warn(`[ChatStore] loadChats timeout for ${listKey}, force releasing`);
        state.pendingBatch = 0;
        state.loading = false;
      }
    }, 12000);
  };

  /** 占位对话，用于 chat_id 已在列表中但 chat 对象尚未到达时的稳定渲染 */
  function createPlaceholderChat(id: number): Chat {
    return { id, title: '…', unread_count: 0 };
  }

  const getList = (listKey: string) =>
    computed(() => {
      const ids = lists.value[listKey] || [];
      return ids.map((id) => chats.value[id] ?? createPlaceholderChat(id));
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

  /**
   * 兜底补漏：扫描所有列表中仍为占位符的 chat，通过 TDLib getChat 主动拉取数据。
   * 解决事件通知链路中可能的丢包/时序问题。
   * 在初始加载完成后调用一次即可。
   */
  const fillPlaceholderChats = async () => {
    // 收集所有列表中 title === '…' 的占位 chat_id
    const allListIds = new Set<number>();
    for (const ids of Object.values(lists.value)) {
      for (const id of ids) {
        const chat = chats.value[id];
        if (!chat || chat.title === '…') {
          allListIds.add(id);
        }
      }
    }

    if (allListIds.size === 0) return;
    console.log(`[ChatStore] Fetching ${allListIds.size} placeholder chats via getChat...`);

    // 并发请求，每个 getChat 独立
    const promises = Array.from(allListIds).map(async (id) => {
      try {
        const result = await invoke<any>("tdlib_send", {
          request: { _: "getChat", chat_id: id },
        });
        if (result && result._ !== "error" && result.id) {
          // 合并到现有数据，保留事件数据优先
          if (chats.value[id]) {
            chats.value[id] = { ...result, ...chats.value[id], id: result.id };
          } else {
            chats.value[id] = result;
          }
        }
      } catch (e) {
        // getChat 可能暂时失败（如网络问题），忽略即可
        console.warn(`[ChatStore] getChat failed for ${id}:`, e);
      }
    });

    await Promise.allSettled(promises);
    console.log(`[ChatStore] getChat fill completed, remaining: ${Array.from(allListIds).filter(id => !chats.value[id] || chats.value[id].title === '…').length
      }`);
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
    fillPlaceholderChats,
  };
});
