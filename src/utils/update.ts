import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import type {
  draftMessage,
  message,
  Update,
  ChatList,
  chatPhotoInfo,
} from "tdlib-types";

export type ChatFolderEntry = {
  _: string;
  chat_folder_id?: number;
  chsts: number[];
  // orders 用字符串键保存，value 为 order 字符串（可能为 undefined）
  orders?: Record<string, string | undefined>;
};

export const ChatFolders = ref<Array<ChatFolderEntry>>([]); // ...changed type...
export const chats = ref<
  Array<{
    id: number;
    title: string;
    unread_count: number;
    draft_message?: draftMessage;
    last_message?: message;
    photo?: chatPhotoInfo;
    chat_lists: Array<ChatList>;
  }>
>([]);

export async function listenForUpdates() {
  listen<Update>("tdlib-update", (event) => {
    const update = event.payload;
    switch (update._) {
      case "updateNewChat":
        const newChat = {
          id: update.chat.id,
          title: update.chat.title,
          unread_count: update.chat.unread_count,
          draft_message: update.chat.draft_message,
          last_message: update.chat.last_message,
          chat_lists: update.chat.chat_lists,
          photo: update.chat.photo,
        };
        chats.value.push(newChat);
        break;
      case "updateChatAddedToList":
        {
          const chatIndex = chats.value.findIndex(
            (c) => c.id === update.chat_id
          );
          if (chatIndex >= 0) {
            const newList = update.chat_list;
            if (!newList) break;

            // 复制 chat 与 chat_lists，基于副本做修改，然后替换到 chats 中，触发响应式
            const oldChat = chats.value[chatIndex];
            const updatedChatLists = [...oldChat.chat_lists];

            if (
              newList._ === "chatListMain" ||
              newList._ === "chatListArchive"
            ) {
              const idx = updatedChatLists.findIndex((l) => l._ === newList._);
              if (idx >= 0) {
                updatedChatLists.splice(idx, 1, newList);
              } else {
                updatedChatLists.push(newList);
              }
            } else if (newList._ === "chatListFolder") {
              const folderId = newList.chat_folder_id;
              const idx = updatedChatLists.findIndex(
                (l) => l._ === "chatListFolder" && l.chat_folder_id === folderId
              );
              if (idx >= 0) {
                updatedChatLists.splice(idx, 1, newList);
              } else {
                updatedChatLists.push(newList);
              }
            }

            const updatedChat = { ...oldChat, chat_lists: updatedChatLists };
            chats.value.splice(chatIndex, 1, updatedChat);
          }
        }
        break;
      case "updateChatLastMessage":
        {
          const chatIndex = chats.value.findIndex(
            (c) => c.id === update.chat_id
          );
          if (chatIndex >= 0) {
            const oldChat = chats.value[chatIndex];
            const updatedChat = {
              ...oldChat,
              last_message: update.last_message,
            };
            chats.value.splice(chatIndex, 1, updatedChat);
          }
        }
        break;
      case "updateChatPosition":
        {
          const chatId = update.chat_id;
          const pos = update.position;
          if (!pos || !pos.list) break;

          // 区分列表类型与可选的 chat_folder_id
          const listObj = pos.list as any;
          const listType = listObj._ as string;
          const folderId = listObj.chat_folder_id as number | undefined;

          // 找到对应 ChatFolders 项
          const folderIndex = ChatFolders.value.findIndex((f) => {
            if (f._ !== listType) return false;
            if (listType === "chatListFolder") {
              return f.chat_folder_id === folderId;
            }
            return true;
          });

          let folderEntry: ChatFolderEntry;
          if (folderIndex >= 0) {
            folderEntry = { ...ChatFolders.value[folderIndex] };
            // 确保 orders 存在
            folderEntry.orders = folderEntry.orders ?? {};
            // 将字符串键化
            folderEntry.orders[String(chatId)] = pos.order;
          } else {
            // 新建条目并写入 order
            folderEntry = {
              _: listType,
              chsts: [],
              orders: { [String(chatId)]: pos.order },
            };
            if (listType === "chatListFolder" && folderId !== undefined) {
              folderEntry.chat_folder_id = folderId;
            }
          }

          // 构建所有已知 id 列表（保留之前的和新加入的）
          const knownIdsSet = new Set<number>();
          if (folderEntry.chsts && folderEntry.chsts.length) {
            folderEntry.chsts.forEach((id) => knownIdsSet.add(id));
          }
          // 把 orders 中的所有 id 也加入
          Object.keys(folderEntry.orders ?? {}).forEach((k) =>
            knownIdsSet.add(Number(k))
          );
          // 保证当前 chatId 在集合中
          knownIdsSet.add(chatId);

          const knownIds = Array.from(knownIdsSet);

          // 比较函数：按 order(作为大整数) 降序；没有 order 的视为最小；order 相同按 id 降序
          const compare = (a: number, b: number) => {
            const oa = folderEntry.orders?.[String(a)];
            const ob = folderEntry.orders?.[String(b)];
            if (oa && ob) {
              try {
                const ba = BigInt(oa);
                const bb = BigInt(ob);
                if (ba !== bb) return bb > ba ? 1 : -1; // 降序
              } catch (e) {
                // fallback to string compare if BigInt failed
                if (ob !== oa) return ob > oa ? 1 : -1;
              }
            } else if (oa && !ob) {
              return -1; // a 在前
            } else if (!oa && ob) {
              return 1; // b 在前
            }
            // order 相同或都不存在 -> 按 id 降序
            return b - a;
          };

          folderEntry.chsts = knownIds.sort(compare);

          // 写回 ChatFolders，保持响应式
          if (folderIndex >= 0) {
            ChatFolders.value.splice(folderIndex, 1, folderEntry);
          } else {
            ChatFolders.value.push(folderEntry);
          }
        }
        break;
      default:
        break;
    }
  });
}
