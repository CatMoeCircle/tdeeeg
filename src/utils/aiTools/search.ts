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

/**
 * 当前这轮对话的供应商 / 模型：搜索接口没配 Key 或没配模型时按它兜底。
 *
 * 从**这一轮的 ToolContext** 里读（ctx.search），不再用模块级变量：
 * 后台托管下两个聊天可能同时在跑，模块级值会被后开始的那一轮覆盖，
 * A 聊天就会拿 B 的供应商 / Key 去搜索。
 */
registerImplementation("web_search", async (args, ctx): Promise<ToolOutcome> => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { tool: "web_search", error: { code: "invalid_args", message: "query 不能为空" } };
  try {
    const text = await invoke<string>("ai_web_search", {
      providerId: ctx.search.providerId,
      model: ctx.search.model,
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
