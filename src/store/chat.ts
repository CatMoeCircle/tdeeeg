import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";
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
  /** 通知设置（用于判断是否静音） */
  notification_settings?: { mute_for?: number } | any;
  /** 是否为话题模式论坛群组 */
  view_as_topics?: boolean;
  /** 名称/文本 accent 色 id（群组/频道） */
  accent_color_id?: number;
  /** 头像渐变 profile accent 色 id（-1 表示无） */
  profile_accent_color_id?: number;
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
  // 使用 shallowRef：chat/lists 对象只被整体读取，不需要 Vue 对内部字段做深层
  // 依赖追踪。配合下面的“缓冲 + 一次性 flush”模式，能避免每个 update 事件
  // 单独触发一次响应式写入 → computed 全量失效 → DOM 全量重建的性能雪崩。
  const chats = shallowRef<Record<number, Chat>>({});
  const lists = shallowRef<Record<string, number[]>>({});
  const chatLists = ref<ChatListEntry[]>([]);
  /** 每个列表独立的加载状态 */
  const listStates = ref<Record<string, ListLoadState>>({});
  /** 防止重复注册事件监听器 */
  let listenerInitialized = false;

  // ---- 非响应式工作缓冲 + 帧合并 flush ----
  // 大量 chat-list-update / chat-update 事件会在短时间内涌入。若每个事件都
  // 直接写 shallowRef.value，仍会反复触发依赖。这里先把变更累积到普通对象，
  // 再在下一次宏任务/渲染帧统一应用，从而在单个 tick 内只触发一次依赖更新。
  let chatBuffer: Record<number, Chat> = {};
  let listBuffer: Record<string, number[]> = {};
  let flushScheduled = false;

  /** 把缓冲中的变更一次性应用到响应式状态（整个对象替换，只触发一次依赖） */
  function applyBuffers() {
    const hasChats = Object.keys(chatBuffer).length > 0;
    const hasLists = Object.keys(listBuffer).length > 0;
    if (hasChats) {
      chats.value = { ...chats.value, ...chatBuffer };
      chatBuffer = {};
    }
    if (hasLists) {
      const next = { ...lists.value };
      for (const k in listBuffer) next[k] = listBuffer[k];
      lists.value = next;
      listBuffer = {};
    }
  }

  /** 把当前宏任务内累积的变更合并到下一次 flush 统一应用 */
  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(() => {
      flushScheduled = false;
      if (Object.keys(chatBuffer).length === 0 && Object.keys(listBuffer).length === 0) return;
      applyBuffers();
    }, 0);
  }

  /** 缓冲一个 chat 更新（不立即触发响应式） */
  function setChatBuffered(id: number, chat: Chat) {
    chatBuffer[id] = chat;
    scheduleFlush();
  }

  /** 缓冲一个列表更新（key 处的完整排序 ID 数组） */
  function setListBuffered(key: string, ids: number[]) {
    listBuffer[key] = ids;
    scheduleFlush();
  }

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
      // 只写入缓冲，由 flush 统一应用，避免逐个事件触发响应式
      setListBuffered(list_key, chat_ids);

      // 注意：loading 状态不由 chat-list-update 事件管理，
      // 而是由 requestLoadMore 中的 loadChats 响应负责释放。
      // 一个 loadChats 可能触发多个 updateNewChat 事件，
      // 每个都产生 chat-list-update，如果在这里递减 pendingBatch
      // 会导致 loading 被过早释放。
    });

    await listen<Chat>("chat-update", (event) => {
      const chat = event.payload;
      // 只写入缓冲，由 flush 统一应用（同一 tick 内多个 chat-update 只触发一次更新）
      setChatBuffered(chat.id, chat);
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
              setChatBuffered(c.id, c);
            } else {
              // 事件数据优先于缓存数据 — 缓存只是兜底，事件才是实时来源
              setChatBuffered(c.id, { ...c, ...chats.value[c.id] });
            }
          }
        }
      }

      // 仅当该列表尚未有任何数据时才填充 ID 列表
      if (!lists.value[key] || lists.value[key].length === 0) {
        setListBuffered(key, res.chat_ids || []);
      }
    } catch (e) {
      console.error("Failed to load chat list:", e);
    }
  };

  /** loadChats 单次加载上限 */
  const LOAD_CHAT_LIMIT = 20;

  /**
   * 调用 loadChats 并登记一个等待批次。
   * loading 状态由 loadChats 的响应（ok/error）释放，不由 chat-list-update 事件管理。
   * 一个 loadChats 可能触发多个 updateNewChat 事件，每个都会产生 chat-list-update，
   * 所以不能在事件处理中递减 pendingBatch。
   * ok 响应后，若本次新增对话不足一页（接近列表末尾），会自动连发 loadChats 直到 404，
   * 避免只有一个/少量对话的分组永远不触发后续加载、也无法标记 finished（归档同理）。
   * 若超过 timeout ms 未收到响应，强制释放防止死锁。
   */
  const requestLoadMore = (listKey: string, chatList: any) => {
    const state = getListState(listKey);
    if (state.loading || state.finished) return;
    state.loading = true;
    state.pendingBatch++;

    // 记录请求前的列表数量，用于判断本次加载是否已接近列表末尾
    const beforeCount = (lists.value[listKey] || []).length;
    console.log(`[ChatStore] requestLoadMore for ${listKey}, beforeCount=${beforeCount}, pendingBatch=${state.pendingBatch}`);
    // 发送 loadChats 请求（异步，不 await）
    invoke("tdlib_send", {
      request: { _: "loadChats", chat_list: chatList, limit: LOAD_CHAT_LIMIT },
    }).then((res: any) => {
      // loadChats 返回 { _: "ok" } 表示成功（可能有后续 updateNewChat 事件，也可能无新数据）
      // 或 { _: "error", code: 404 } 表示已耗尽
      if (res && res._ === "error") {
        if (res.code === 404) {
          state.finished = true;
        } else {
          console.error("loadChats returned error:", res);
        }
      } else {
        // ok：稍等事件到位后判断是否需要继续连发
        scheduleFollowUpLoad(listKey, chatList, beforeCount);
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

  /**
   * 等本次加载的 chat-list-update 事件到位后，判断是否继续连发 loadChats 直到 404。
   * 只有当本次新增对话不足一页（< limit）时才继续连发，说明已接近列表末尾；
   * 若新增达到一页（后面还有大量对话），则停止自动连发，交由滚动加载。
   */
  function scheduleFollowUpLoad(listKey: string, chatList: any, beforeCount: number) {
    setTimeout(() => {
      const state = getListState(listKey);
      if (state.finished || state.loading) return;
      const currentCount = (lists.value[listKey] || []).length;
      const added = currentCount - beforeCount;
      if (added < LOAD_CHAT_LIMIT) {
        requestLoadMore(listKey, chatList);
      }
    }, 400);
  }

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
            setChatBuffered(id, { ...result, ...chats.value[id], id: result.id });
          } else {
            setChatBuffered(id, result);
          }
        }
      } catch (e) {
        // getChat 可能暂时失败（如网络问题），忽略即可
        console.warn(`[ChatStore] getChat failed for ${id}:`, e);
      }
    });

    await Promise.allSettled(promises);
    // 确保缓冲已应用到响应式状态，以便下面统计 remaining 时读取的是最新结果
    applyBuffers();
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
