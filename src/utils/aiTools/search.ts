/**
 * 联网搜索（客户端执行的那一种）：模型调 web_search(query)，这里把 query 交给后端 ai_web_search，
 * 由「搜索接口」跑完把结果文本回填成 tool 消息。
 *
 * 什么时候走这里：设置「AI 工具」里给搜索配了接口地址（settings.ai.search.endpoint）。
 * 没配时这个工具不进 toolsSchema —— 联网搜索由 AI 供应商自己执行（见 Rust ai_chat 的 web_search_tool），
 * 两边同名，绝不同时挂，否则接口会看到两个叫 web_search 的工具。
 */
import { invoke } from "@tauri-apps/api/core";
import { settings } from "../../store/settings";
import { registerImplementation } from "./call.ts";
import type { ToolOutcome } from "./types.ts";

/** 当前这轮对话的供应商 / 模型：搜索接口没配 Key 或没配模型时按它兜底 */
let context = { providerId: "", model: "" };

/** 由 runAiTurn 每轮设置（用这轮真正在用的供应商，而不是设置页里选的那个） */
export function setSearchContext(next: { providerId: string; model: string }): void {
  context = { ...next };
}

registerImplementation("web_search", async (args): Promise<ToolOutcome> => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { tool: "web_search", error: { code: "invalid_args", message: "query 不能为空" } };
  try {
    const text = await invoke<string>("ai_web_search", {
      providerId: context.providerId,
      model: context.model,
      query,
      endpoint: settings.ai.search.endpoint,
      searchModel: settings.ai.search.model,
    });
    return { tool: "web_search", limit: 1, returned: 1, truncated: false, data: { query, text } };
  } catch (e) {
    return {
      tool: "web_search",
      error: { code: "internal", message: e instanceof Error ? e.message : String(e) },
    };
  }
});
