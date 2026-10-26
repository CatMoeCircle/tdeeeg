/**
 * 本地元数据工具实现：只改客户端自己的记录（会话标题等），不碰 Telegram，
 * 因此 `kind: "local"` —— 不走审核、不需要 reason（不变式见 registry.ts / scripts/checkAiTools.ts）。
 */
import { activeConversation, renameConversation } from "../../store/aiConversations";
import { registerImplementation } from "./call.ts";
import type { ToolReply } from "./types.ts";

registerImplementation("set_conversation_title", async (args): Promise<ToolReply> => {
  const chatId = Number(args.chat_id);
  const title = String(args.title ?? "").trim();
  if (!Number.isFinite(chatId)) throw new Error("参数 chat_id 必须是数字");
  if (!title) throw new Error("标题不能为空");
  // 改的是当前会话（工具层没有会话上下文，按 chat 找当前选中的那个，与界面显示的同一份）
  const c = activeConversation(chatId);
  if (!c) throw new Error("这个聊天还没有会话，先发一条消息再设置标题");
  await renameConversation(chatId, c.id, title);
  // 成功只回裸 "OK"，不包信封、不回标题
  return "OK";
});
