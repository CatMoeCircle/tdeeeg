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
} from "tdlib-types";

export interface Chat {
  id: number;
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

export const useChatStore = defineStore("chat", () => {
  const chats = ref<Record<number, Chat>>({});
  const lists = ref<Record<string, number[]>>({});
  const chatLists = ref<any[]>([]);

  // Initialize listener
  const initListener = async () => {
    await listen<ChatListState>("chat-list-update", (event) => {
      const { list_key, chat_ids } = event.payload;
      lists.value[list_key] = chat_ids;
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

  // Fetch initial list
  const loadList = async (list: any) => {
    try {
      // Ensure we pass a plain JS object (not a reactive proxy)
      const plainList = JSON.parse(JSON.stringify(list));
      const res = await invoke<any>("get_chat_list", { list: plainList });
      lists.value[res.list_key] = res.chat_ids || [];

      // Populate chat details if provided by backend
      if (res.chats && Array.isArray(res.chats)) {
        for (const c of res.chats) {
          if (c && c.id) {
            chats.value[c.id] = c;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load chat list:", e);
    }
  };

  const getList = (listKey: string) =>
    computed(() => {
      const ids = lists.value[listKey] || [];
      return ids.map((id) => chats.value[id]).filter(Boolean);
    });

  return {
    chats,
    lists,
    chatLists,
    initListener,
    loadChatLists,
    loadList,
    getList,
  };
});
