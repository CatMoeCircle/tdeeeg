//! AI 对话的一次模型调用（可带工具）。多轮 agent 循环在前端 utils/aiChat.ts，这里只管单次请求。
//!
//! 对话本身走**自研的三协议客户端**（[`crate::ai::llm`]，模块注释里写了为什么不用 llmsdk：
//! 它不解析 Responses 的 `reasoning_text` / Chat 的 `reasoning_content`，思考链永远显示不出来）。
//! 供应商 / 钥匙串 / 协议选择复用 ai_translate；`ai_complete`（私聊接管 / 摘要）仍走 llmsdk ——
//! 那条路不需要思考链，也没必要为它重写一遍。

use llmsdk::{
    AssistantPart, CallOptions, Content, FileBytes, FileData, FilePart, FunctionTool, LanguageModel,
    Message, ProviderTool, ReasoningEffort, TextPart, Tool, ToolCallPart, ToolChoice,
    ToolMessagePart, ToolResultOutput, ToolResultPart, UserPart,
};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;

use tauri::Manager;

use crate::ai::ai_conversations::load_history;
use crate::ai::ai_translate::{build_language_model, load_all, saved_api_key, saved_search_key};
use crate::ai::llm::{prompt, ChatClient, ChatReply, ChatStreamEvent, Format};
use crate::tdlib::AppState;

pub use crate::ai::llm::{ChatMessage, ChatToolCall, ChatUsage};

/// 正在跑的流式请求：request_id → 取消信号。前端点「停止」时通过 ai_chat_cancel 触发。
#[derive(Default)]
pub struct AiCancelState(Mutex<HashMap<String, oneshot::Sender<()>>>);

fn text_part(text: String) -> TextPart {
    TextPart { text, provider_options: None }
}

/// 本机图片路径 → llmsdk 的 UserPart::File（只给 ai_complete 这条老路径用）。
/// 读不到 / 认不出类型就跳过：历史里存的是路径，文件被删或改名不该让整段对话从此报错。
fn image_part(path: &str) -> Option<UserPart> {
    let media_type = prompt::media_type(path)?;
    let bytes = prompt::read_image(path)?;
    Some(UserPart::File(FilePart {
        filename: std::path::Path::new(path).file_name().map(|n| n.to_string_lossy().into_owned()),
        data: FileData::Data { data: FileBytes::Bytes(bytes) },
        media_type: media_type.to_string(),
        provider_options: None,
    }))
}

/// 瘦身消息 → llmsdk Message（tagged enum 不适合前端直接构造）。
fn to_prompt(messages: Vec<ChatMessage>) -> Result<Vec<Message>, String> {
    messages
        .into_iter()
        .map(|m| -> Result<Message, String> {
            Ok(match m.role.as_str() {
                "system" => Message::System { content: m.text, provider_options: None },
                "user" => {
                    let attachments: Vec<UserPart> =
                        m.attachments.iter().filter_map(|p| image_part(p)).collect();
                    let mut content = Vec::new();
                    // 纯图片提问时不塞空文本段（有的接口会拒），纯文本时保持原样
                    if !m.text.is_empty() || attachments.is_empty() {
                        content.push(UserPart::Text(text_part(m.text)));
                    }
                    content.extend(attachments);
                    Message::User { content, provider_options: None }
                }
                "assistant" => {
                    let mut content = Vec::new();
                    if !m.reasoning.is_empty() {
                        content.push(AssistantPart::Reasoning { text: m.reasoning, provider_options: None });
                    }
                    if !m.text.is_empty() {
                        content.push(AssistantPart::Text(text_part(m.text)));
                    }
                    content.extend(m.tool_calls.into_iter().map(|c| {
                        AssistantPart::ToolCall(ToolCallPart {
                            tool_call_id: c.id,
                            tool_name: c.name,
                            input: c.arguments,
                            provider_executed: c.provider_executed,
                            dynamic: None,
                            provider_options: None,
                        })
                    }));
                    Message::Assistant { content, provider_options: None }
                }
                "tool" => Message::Tool {
                    content: vec![ToolMessagePart::ToolResult(ToolResultPart {
                        tool_call_id: m.tool_call_id,
                        tool_name: m.tool_name,
                        output: ToolResultOutput::Text { value: m.text, provider_options: None },
                        provider_options: None,
                    })],
                    provider_options: None,
                },
                other => return Err(format!("未知消息角色：{other}")),
            })
        })
        .collect()
}

/// 前端 toolsSchema() 的 OpenAI 形状 → llmsdk FunctionTool。
/// schema 类型是 schemars::Schema（透明 JSON），直接 from_value 即可。
fn to_tools(defs: Vec<serde_json::Value>) -> Result<Vec<Tool>, String> {
    defs.into_iter()
        .map(|d| -> Result<Tool, String> {
            let f = d.get("function").ok_or("工具定义缺少 function")?;
            let name = f
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("工具定义缺少 name")?
                .to_string();
            let input_schema = serde_json::from_value(f.get("parameters").cloned().unwrap_or_default())
                .map_err(|e| format!("工具 {name} 的 schema 不合法: {e}"))?;
            Ok(Tool::Function(FunctionTool {
                name,
                description: f.get("description").and_then(|v| v.as_str()).map(String::from),
                input_schema,
                input_examples: None,
                strict: None,
                provider_options: None,
            }))
        })
        .collect()
}

/// 联网搜索的供应商侧工具：OpenAI Responses 与 Anthropic 的协议映射。
/// OpenAI 的 `web_search` 带上 `external_web_access` = 走实时互联网（否则可能只查缓存索引）。
/// Completions 协议没有服务端工具（返回 None）。
fn web_search_tool(format: &str) -> Option<Tool> {
    let (id, args) = match format {
        "openai-responses" => (
            "openai.web_search",
            serde_json::json!({ "external_web_access": true }).as_object().cloned(),
        ),
        "anthropic" => ("anthropic.web_search_20250305", None),
        _ => return None,
    };
    Some(Tool::Provider(ProviderTool {
        id: id.to_string(),
        name: "web_search".to_string(),
        args,
        provider_options: None,
    }))
}

/// 托管 web_search 只对**确定支持**的供应商开：OpenAI 自家（Responses）与 Anthropic。
///
/// 实测（别删，这条注释就是证据）：
/// - MiMo 的 `/v1/responses` 遇到 `web_search` 直接 400 `responses_feature_not_supported`
///   —— 挂上去会让整轮对话失败，比没有搜索坏得多；
/// - DeepSeek 收下但从不执行（输出里没有 `web_search_call`），它有独立的 `/v1/tools/search`；
/// - Gemini 的 OpenAI 兼容层压根没有 `/responses`；
/// - GLM / Kimi / MiniMax 没实测过，不赌 —— 要搜索就让用户在「AI 工具」里配搜索接口
///   （客户端调用失败只影响那一次搜索，不会毁掉整轮对话）。
fn hosted_web_search_supported(endpoint: &str, format: &str) -> bool {
    match format {
        "anthropic" => true,
        "openai-responses" => endpoint.contains("api.openai.com"),
        _ => false,
    }
}

/// DeepSeek 的联网搜索**不在** Responses 里：托管 `web_search` 它接受（HTTP 200）但从不执行
/// （实测输出里没有 `web_search_call`，模型直接答「我无法获取实时数据」），
/// 真正的搜索是独立的 Tools API：`POST {base}/tools/search`。见 api-docs.deepseek.com/zh-cn/guides/search。
fn uses_tools_search(base: &str) -> bool {
    base.contains("deepseek.com")
}

/// DeepSeek 搜索结果 → 给模型看的文本（标题 / 站点 / 日期 / 摘要 / 链接）。
fn search_results_text(v: &serde_json::Value) -> Result<String, String> {
    let results = v
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or_else(|| "搜索接口没有返回 results".to_string())?;
    if results.is_empty() {
        return Err("搜索没有结果".to_string());
    }
    let mut out = String::new();
    for (i, r) in results.iter().take(8).enumerate() {
        let s = |k: &str| r.get(k).and_then(|x| x.as_str()).unwrap_or("");
        let (title, url, summary, date, site) =
            (s("title"), s("url"), s("summary"), s("date"), s("site_name"));
        out.push_str(&format!("{}. {title}", i + 1));
        if !site.is_empty() {
            out.push_str(&format!("（{site}）"));
        }
        if !date.is_empty() {
            out.push_str(&format!(" {date}"));
        }
        out.push('\n');
        if !summary.is_empty() {
            out.push_str(summary.trim());
            out.push('\n');
        }
        if !url.is_empty() {
            out.push_str(url);
            out.push('\n');
        }
        out.push('\n');
    }
    Ok(out.trim_end().to_string())
}

/// 调 DeepSeek 的 Tools API 搜索，把结果原文给模型（不再多花一次模型调用）。
async fn tools_search(base: &str, key: &str, query: &str) -> Result<String, String> {
    let url = format!("{base}/tools/search");
    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(key)
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .map_err(|e| format!("联网搜索失败: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("搜索接口请求失败 (HTTP {status}): {snippet}"));
    }
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("搜索接口返回不合法 JSON: {e}"))?;
    search_results_text(&v)
}

/// 思考等级键 → llmsdk；未知值 = provider 默认。
fn effort_of(key: &str) -> Option<ReasoningEffort> {
    Some(match key {
        "none" => ReasoningEffort::None,
        "minimal" => ReasoningEffort::Minimal,
        "low" => ReasoningEffort::Low,
        "medium" => ReasoningEffort::Medium,
        "high" => ReasoningEffort::High,
        "xhigh" => ReasoningEffort::Xhigh,
        _ => return None,
    })
}

/// Responses 协议的思考开关（`provider_options.openai`）。
///
/// llmsdk 0.1.1 的 /responses 适配器**不读** `CallOptions.reasoning`（只有 chat 路径认），
/// 思考参数只从 provider_options 取；而且模型 id 不是 OpenAI 系（deepseek-flash 这类）时，
/// 能力探测判为「不会思考」会把 reasoning 块整段丢掉 —— 所以必须显式 `forceReasoning`
/// 再要 `reasoningSummary`，否则推理模型也只回正文，活动条里一条思考都没有。
/// `systemMessageMode` 钉成 system：forceReasoning 默认改用 developer 角色，
/// 非 OpenAI 的 /responses 实现不一定认，保持现在的线上形状。
fn responses_reasoning(effort: Option<&str>) -> Option<llmsdk::ProviderOptions> {
    // 关闭档不发思考参数（与 chat 路径的 none 分开：DeepSeek 未必认 effort=none）；
    // 档位值是设置页里按模型自定义的，这里的 off / none / 空 都当「不发」，
    // 其余原样透传成 reasoningEffort（如 low / medium / high / xhigh）。
    let effort = effort
        .map(str::trim)
        .filter(|e| !e.is_empty() && !matches!(*e, "none" | "off"))?;
    let openai = serde_json::json!({
        "forceReasoning": true,
        "reasoningEffort": effort,
        "reasoningSummary": "auto",
        "systemMessageMode": "system",
    })
    .as_object()
    .cloned()?;
    Some([("openai".to_string(), openai)].into_iter().collect())
}

/// Chat Completions 兼容路径的自定义思考参数（`provider_options.openai`）。
///
/// 标准枚举（low / medium / high…）由 `CallOptions.reasoning` 处理，这里只接「不在枚举里」的
/// 自定义档位值（设置页里按模型填的，如 xhigh）：chat 路径认 `provider_options.openai.reasoningEffort`，
/// 能把它原样写进 `reasoning_effort`。Anthropic 没有这种自由透传通道，未知值仍按 provider 默认。
fn chat_reasoning(effort: Option<&str>, format: &str) -> Option<llmsdk::ProviderOptions> {
    if format == "anthropic" {
        return None;
    }
    let effort = effort
        .map(str::trim)
        .filter(|e| !e.is_empty() && !matches!(*e, "none" | "off"))?;
    let openai = serde_json::json!({ "reasoningEffort": effort }).as_object().cloned()?;
    Some([("openai".to_string(), openai)].into_iter().collect())
}

/// 一次性解析：供应商 id / 模型 id → 接口地址、协议、模型 id、API Key。
/// 自研对话客户端与 llmsdk（ai_complete）共用，别各找一遍。
fn resolve_provider(
    app: &tauri::AppHandle,
    provider_id: &str,
    model: &str,
) -> Result<(String, String, String, String), String> {
    let provider = load_all(app)
        .providers
        .into_iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| "AI 供应商不存在，请在设置中重新配置".to_string())?;
    let api_key = saved_api_key(app, provider_id).ok_or_else(|| "未保存 API Key".to_string())?;
    let endpoint = provider.endpoint.trim().trim_end_matches('/').to_string();
    let model_id = model.trim().to_string();
    if endpoint.is_empty() {
        return Err("接口地址为空".to_string());
    }
    if model_id.is_empty() {
        return Err("模型 ID 为空".to_string());
    }
    Ok((endpoint, provider.format, model_id, api_key))
}

/// 一次性补全 / 摘要用的旧路径（llmsdk）：找 Key / 建模型 / 转 prompt。
/// `web_search` = 是否挂供应商侧的联网搜索（设置里关掉、或配了独立搜索接口时为 false）。
#[allow(clippy::too_many_arguments, reason = "一次性装配，拆参数结构反而更难读")]
fn prepare(
    app: &tauri::AppHandle,
    provider_id: &str,
    model: &str,
    messages: Vec<ChatMessage>,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
    web_search: bool,
) -> Result<(Box<dyn LanguageModel>, CallOptions), String> {
    let (endpoint, format, model_id, api_key) = resolve_provider(app, provider_id, model)?;
    let lm = build_language_model(&endpoint, &format, &api_key, &model_id)?;
    let mut tools = to_tools(tools)?;
    // 联网搜索由供应商执行；只对确定支持的供应商挂（见 hosted_web_search_supported）
    if web_search && hosted_web_search_supported(&endpoint, &format) {
        if let Some(search) = web_search_tool(&format) {
            tools.push(search);
        }
    }
    // 标准枚举走 CallOptions.reasoning（跨 provider 可移植）；认不出的值 = 设置页里的自定义档位
    let reasoning = effort.as_deref().and_then(effort_of);
    let options = CallOptions {
        provider_options: if format == "openai-responses" {
            responses_reasoning(effort.as_deref())
        } else if reasoning.is_none() {
            chat_reasoning(effort.as_deref(), &format)
        } else {
            None
        },
        prompt: to_prompt(messages)?,
        tool_choice: (!tools.is_empty()).then_some(ToolChoice::Auto),
        tools: (!tools.is_empty()).then_some(tools),
        reasoning,
        max_output_tokens,
        ..Default::default()
    };
    Ok((lm, options))
}

/// llmsdk 的一次生成结果 → 前端用的 ChatReply（ai_chat / ai_complete 共用，别抄第二遍）。
fn to_reply(result: llmsdk::GenerateResult) -> ChatReply {
    let mut reply = ChatReply::default();
    for part in result.content {
        match part {
            Content::Text(t) => reply.text.push_str(&t.text),
            Content::Reasoning(r) => reply.reasoning.push_str(&r.text),
            Content::ToolCall(c) => reply.tool_calls.push(ChatToolCall {
                id: c.tool_call_id,
                name: c.tool_name,
                arguments: c.input,
                provider_executed: c.provider_executed,
            }),
            _ => {}
        }
    }
    let u = result.usage;
    reply.usage = ChatUsage {
        input_tokens: u.input_tokens.total,
        output_tokens: u.output_tokens.total,
        cached_tokens: u.input_tokens.cache_read,
        cache_write_tokens: u.input_tokens.cache_write,
    };
    reply
}

/// 单次对话请求（可带工具），一次性返回。`tools` 是 toolsSchema() 的结果，
/// `effort` 为该档位的思考参数值（内置枚举键，或设置页里按模型自定义的值；可空 = 不发）。
/// 流式入口是 ai_chat_stream；这个留着做流式不可用时的兜底。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_chat(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    mut messages: Vec<ChatMessage>,
    account_id: String,
    chat_id: i64,
    conversation_id: String,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
    web_search: Option<bool>,
) -> Result<ChatReply, String> {
    messages.extend(load_history(&app.state::<AppState>(), &account_id, chat_id, &conversation_id));
    let (endpoint, format, model_id, api_key) = resolve_provider(&app, &provider_id, &model)?;
    let hosted = web_search.unwrap_or(true) && hosted_web_search_supported(&endpoint, &format);
    ChatClient {
        format: Format::of(&format),
        endpoint: &endpoint,
        api_key: &api_key,
        model: &model_id,
        tools: &tools,
        effort: effort.as_deref(),
        max_output_tokens,
        hosted_web_search: hosted,
    }
    .generate(&messages)
    .await
}

/// 一次性补全：`messages` 就是完整 prompt（system 在最前），不带会话历史、不带工具。
///
/// 私聊接管（模仿 / AI 接管 / 上下文压缩）用它：接管的会话历史由前端自己攒、自己压缩，
/// 写进 AI 会话表反而会跟用户在 AI 输入框里的对话互相污染，所以这里直接不碰历史。
#[tauri::command]
pub async fn ai_complete(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
) -> Result<ChatReply, String> {
    let (lm, options) = prepare(
        &app,
        &provider_id,
        &model,
        messages,
        Vec::new(),
        effort,
        max_output_tokens,
        false,
    )?;
    let result = lm
        .do_generate(options)
        .await
        .map_err(|e| format!("AI 对话失败: {e}"))?;
    Ok(to_reply(result))
}

/// 流式对话：一边把增量事件推给前端（界面逐字更新），一边在 Rust 侧拼出完整回复返回。
///
/// 两件事都做是有意的：界面要增量，循环要确定的结果。让前端自己拼「最终文本 / 工具调用」的话，
/// 一旦 IPC 消息比命令返回晚到，就会漏掉工具调用 —— 那种 bug 极难查。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AiCancelState>,
    provider_id: String,
    model: String,
    mut messages: Vec<ChatMessage>,
    account_id: String,
    chat_id: i64,
    conversation_id: String,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
    web_search: Option<bool>,
    request_id: String,
    on_event: tauri::ipc::Channel<ChatStreamEvent>,
) -> Result<ChatReply, String> {
    messages.extend(load_history(&app.state::<AppState>(), &account_id, chat_id, &conversation_id));
    let (endpoint, format, model_id, api_key) = resolve_provider(&app, &provider_id, &model)?;
    let hosted = web_search.unwrap_or(true) && hosted_web_search_supported(&endpoint, &format);
    let client = ChatClient {
        format: Format::of(&format),
        endpoint: &endpoint,
        api_key: &api_key,
        model: &model_id,
        tools: &tools,
        effort: effort.as_deref(),
        max_output_tokens,
        hosted_web_search: hosted,
    };
    // 先登记取消信号再开流：前端一按停止（ai_chat_cancel）这里立刻就能收到
    let (tx, rx) = oneshot::channel::<()>();
    state.0.lock().unwrap().insert(request_id.clone(), tx);
    let mut emit = |ev: ChatStreamEvent| -> Result<(), String> {
        on_event.send(ev).map_err(|e| format!("流式推送失败: {e}"))
    };
    let out = client.stream(&messages, rx, &mut emit).await;
    state.0.lock().unwrap().remove(&request_id);
    out
}

/// 停止正在跑的流式请求：前端点「停止」时调用。找不到 id = 请求已经结束，忽略。
#[tauri::command]
pub fn ai_chat_cancel(state: tauri::State<'_, AiCancelState>, request_id: String) {
    if let Some(tx) = state.0.lock().unwrap().remove(&request_id) {
        let _ = tx.send(());
    }
}

/// 搜索工具（前端那个客户端 web_search）的执行出口：把一次检索交给「搜索接口」跑，返回结果文本。
///
/// - `endpoint` 非空 = 用搜索自己配的接口：按 OpenAI 兼容的 `/responses` + 服务端 web_search 工具，
///   Key 用搜索专属 Key（没配就回退当前供应商的 Key），模型用 `search_model`（空 = 会话模型）；
/// - 空 = 用当前 AI 供应商的地址 / Key / 协议（供应商自己会搜时走这条）。
#[tauri::command]
pub async fn ai_web_search(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    query: String,
    endpoint: String,
    search_model: String,
) -> Result<String, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err("搜索词为空".to_string());
    }
    let provider = load_all(&app)
        .providers
        .into_iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| "AI 供应商不存在，请在设置中重新配置".to_string())?;
    let provider_key =
        saved_api_key(&app, &provider_id).ok_or_else(|| "未保存 API Key".to_string())?;
    let custom = endpoint.trim().trim_end_matches('/');
    let (url, format, model_id, key) = if custom.is_empty() {
        (
            provider.endpoint.trim().trim_end_matches('/').to_string(),
            provider.format.clone(),
            model.trim().to_string(),
            provider_key,
        )
    } else {
        (
            custom.to_string(),
            "openai-responses".to_string(),
            search_model.trim().to_string(),
            saved_search_key(&app).unwrap_or(provider_key),
        )
    };
    // DeepSeek 只认自己的 Tools API：直接搜，不需要搜索模型（也不需要多一次模型调用）
    if uses_tools_search(&url) {
        return tools_search(&url, &key, &query).await;
    }
    // 搜索模型留空 = 沿用当前会话的模型（两边都空才算真的没模型）
    let model_id = if model_id.is_empty() {
        model.trim().to_string()
    } else {
        model_id
    };
    if model_id.is_empty() {
        return Err("搜索模型为空：请在设置「AI 工具」里填写搜索模型".to_string());
    }
    let Some(tool) = web_search_tool(&format) else {
        return Err(
            "当前供应商协议不支持联网搜索：请在设置「AI 工具」里给搜索配置接口地址".to_string(),
        );
    };
    let lm = build_language_model(&url, &format, &key, &model_id)?;
    let options = CallOptions {
        prompt: vec![
            Message::System {
                content: "你是搜索助手：先用 web_search 检索，再用简洁的中文要点回答，并带上来源链接；\
                          不要反问、不要编造没搜到的内容。"
                    .to_string(),
                provider_options: None,
            },
            Message::User {
                content: vec![UserPart::Text(TextPart { text: query, provider_options: None })],
                provider_options: None,
            },
        ],
        tools: Some(vec![tool]),
        tool_choice: Some(ToolChoice::Auto),
        max_output_tokens: Some(2048),
        ..Default::default()
    };
    let result = lm
        .do_generate(options)
        .await
        .map_err(|e| format!("联网搜索失败: {e}"))?;
    let text: String = result
        .content
        .iter()
        .filter_map(|c| match c {
            Content::Text(t) => Some(t.text.as_str()),
            _ => None,
        })
        .collect();
    if text.trim().is_empty() {
        return Err("搜索接口没有返回内容".to_string());
    }
    Ok(text)
}

/// 工具图片文件名的去重序号（同一毫秒内多次调用不能互相覆盖）
static IMAGE_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// AI 工具（read_image）转好的图片落盘：写进**数据目录**（设置里的存储位置，AppData 或便携目录）
/// 下的 `ai_images/`，不用系统 Temp —— 便携版不该把缓存塞到 C 盘，用户迁移 / 清理数据目录时也能一起带走。
/// 返回绝对路径：前端把它当作下一条「图片消息」的附件（见 utils/aiChat.ts）。
#[tauri::command]
pub fn ai_save_tool_image(state: tauri::State<'_, AppState>, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("图片数据为空".to_string());
    }
    let dir = state.data_dir.join("ai_images");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建图片目录失败: {e}"))?;
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let seq = IMAGE_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let path = dir.join(format!("ai_image_{ms}_{seq}.jpg"));
    std::fs::write(&path, &bytes).map_err(|e| format!("写入图片失败: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_assistant_tool_round_trip() {
        let msgs: Vec<ChatMessage> = serde_json::from_value(serde_json::json!([
            { "role": "system", "text": "s" },
            { "role": "user", "text": "u" },
            { "role": "assistant", "reasoning": "r", "text": "",
              "toolCalls": [{ "id": "c1", "name": "get_chat_info", "arguments": { "chat_id": 1 } }] },
            { "role": "tool", "text": "{}", "toolCallId": "c1", "toolName": "get_chat_info" }
        ]))
        .unwrap();
        let prompt = to_prompt(msgs).unwrap();
        assert_eq!(prompt.len(), 4);
        let Message::Assistant { content, .. } = &prompt[2] else { panic!("expected assistant") };
        assert_eq!(content.len(), 2); // reasoning + tool call（空正文不产生 text 段）
        assert!(matches!(&prompt[3], Message::Tool { .. }));
    }

    /// 历史落盘的字段名必须和前端 camelCase 完全对上，错了会静默丢历史
    #[test]
    fn history_json_uses_frontend_field_names() {
        let m: ChatMessage = serde_json::from_value(serde_json::json!({
            "role": "tool", "text": "{}", "toolCallId": "c1", "toolName": "t"
        }))
        .unwrap();
        let v = serde_json::to_value(&m).unwrap();
        assert_eq!(v["role"], "tool");
        assert_eq!(v["toolCallId"], "c1");
        assert_eq!(v["toolName"], "t");
        // 空字段不落盘（history.json 小一点，也不会把默认值当数据）
        assert!(v.get("reasoning").is_none() && v.get("toolCalls").is_none());
    }

    /// 图片附件：认得出的图片转成 File 段，读不到 / 非图片的路径直接跳过（历史里可能留着已删文件）
    #[test]
    fn maps_user_attachments_to_image_parts() {
        let img = std::env::temp_dir().join(format!("tdgram_ai_chat_{}.png", std::process::id()));
        std::fs::write(&img, [0x89, 0x50, 0x4e, 0x47u8]).unwrap();
        let msgs: Vec<ChatMessage> = serde_json::from_value(serde_json::json!([
            { "role": "user", "text": "", "attachments": [
                img.to_string_lossy(), "no/such/file.png", "notes.txt"
            ] }
        ]))
        .unwrap();
        let prompt = to_prompt(msgs).unwrap();
        let Message::User { content, .. } = &prompt[0] else { panic!("expected user") };
        // 纯图片提问不产生空文本段
        assert_eq!(content.len(), 1);
        let UserPart::File(f) = &content[0] else { panic!("expected file part") };
        assert_eq!(f.media_type, "image/png");
        assert_eq!(f.filename.as_deref(), Some(img.file_name().unwrap().to_str().unwrap()));
        let _ = std::fs::remove_file(&img);
    }

    #[test]
    fn image_media_type_only_knows_images() {
        assert_eq!(prompt::media_type("a/b.PNG"), Some("image/png"));
        assert_eq!(prompt::media_type("a.jpeg"), Some("image/jpeg"));
        assert_eq!(prompt::media_type("Heic"), None); // 没有扩展名
        assert_eq!(prompt::media_type("notes.txt"), None);
    }

    /// 思考档位只挂在 responses 协议上：llmsdk 的 /responses 适配器只认 provider_options，
    /// 漏了这段推理模型也一条思考都不回（ai_complete 走的还是这条老路）。
    #[test]
    fn responses_reasoning_options_request_summary() {
        let po = responses_reasoning(Some("high")).expect("high 要有思考参数");
        let openai = po.get("openai").expect("键名必须是 openai");
        assert_eq!(openai.get("reasoningEffort"), Some(&serde_json::json!("high")));
        assert_eq!(openai.get("reasoningSummary"), Some(&serde_json::json!("auto")));
        assert_eq!(openai.get("forceReasoning"), Some(&serde_json::json!(true)));
        // 关闭 / 空 / 未知都不发：不知道的档位宁可不传，也别让接口 400
        assert!(responses_reasoning(Some("none")).is_none());
        assert!(responses_reasoning(Some("off")).is_none());
        assert!(responses_reasoning(Some("")).is_none());
        assert!(responses_reasoning(Some("  ")).is_none());
        assert!(responses_reasoning(None).is_none());
        // 设置页里按模型自定义的档位值原样透传（不限于内置枚举）
        let custom = responses_reasoning(Some(" xhigh ")).expect("自定义档位要透传");
        assert_eq!(custom.get("openai").and_then(|o| o.get("reasoningEffort")), Some(&serde_json::json!("xhigh")));
    }

    /// Chat Completions 兼容路径：自定义档位值也能透传（标准枚举走 CallOptions.reasoning，
    /// 调用方用 `reasoning.is_none()` 拦过，不会重复发）；Anthropic 没有自由透传通道。
    #[test]
    fn chat_reasoning_passes_custom_values() {
        let po = chat_reasoning(Some(" xhigh "), "openai-compatible").expect("自定义值要透传");
        assert_eq!(po.get("openai").and_then(|o| o.get("reasoningEffort")), Some(&serde_json::json!("xhigh")));
        assert!(chat_reasoning(Some("none"), "openai-compatible").is_none());
        assert!(chat_reasoning(Some("off"), "openai-compatible").is_none());
        assert!(chat_reasoning(Some(""), "openai-compatible").is_none());
        assert!(chat_reasoning(None, "openai-compatible").is_none());
        assert!(chat_reasoning(Some("xhigh"), "anthropic").is_none());
    }

    /// 联网搜索只挂在有服务端工具的协议上（Completions 挂上去会被接口当未知工具拒绝），
    /// 且供应商侧调用要带 provider_executed 标记回前端（否则前端会去 dispatch 它）。
    #[test]
    fn web_search_tool_and_provider_executed_flag() {
        let id = |format: &str| match web_search_tool(format) {
            Some(Tool::Provider(p)) => Some(p.id),
            _ => None,
        };
        assert_eq!(id("openai-responses").as_deref(), Some("openai.web_search"));
        assert_eq!(id("anthropic").as_deref(), Some("anthropic.web_search_20250305"));
        assert!(web_search_tool("openai-compatible").is_none());

        // OpenAI 的 web_search 要显式要实时互联网（external_web_access）
        let Some(Tool::Provider(openai)) = web_search_tool("openai-responses") else { panic!() };
        assert_eq!(openai.args.unwrap().get("external_web_access"), Some(&serde_json::json!(true)));

        // 只对确定支持的供应商挂托管搜索：MiMo / DeepSeek 挂上去分别是 400 和静默失效
        assert!(hosted_web_search_supported("https://api.openai.com/v1", "openai-responses"));
        assert!(hosted_web_search_supported("https://api.anthropic.com/v1", "anthropic"));
        assert!(!hosted_web_search_supported("https://api.xiaomimimo.com/v1", "openai-responses"));
        assert!(!hosted_web_search_supported("https://api.deepseek.com/v1", "openai-responses"));
        assert!(!hosted_web_search_supported("https://generativelanguage.googleapis.com/v1beta/openai", "openai-compatible"));

        let msgs: Vec<ChatMessage> = serde_json::from_value(serde_json::json!([
            { "role": "assistant", "text": "", "toolCalls": [
                { "id": "ws_1", "name": "web_search", "arguments": {}, "providerExecuted": true }
            ] }
        ]))
        .unwrap();
        let Message::Assistant { content, .. } = &to_prompt(msgs).unwrap()[0] else {
            panic!("expected assistant")
        };
        assert!(matches!(&content[0], AssistantPart::ToolCall(tc) if tc.provider_executed == Some(true)));
    }

    /// DeepSeek 搜索结果 → 文本：标题 / 站点 / 摘要 / 链接都在；没有结果要报错。
    /// 顺带钉住「DeepSeek 走 Tools API、别的接口不走」这个判断。
    #[test]
    fn formats_search_results_text() {
        let v = serde_json::json!({
            "results": [
                { "title": "成都市天气", "site_name": "墨迹天气",
                  "date": "2026-10-17T16:00:00+00:00",
                  "url": "https://tianqi.moji.com/weather/china/sichuan/chengdu",
                  "summary": "阴 今天12:03更新" }
            ]
        });
        let text = search_results_text(&v).unwrap();
        assert!(text.contains("成都市天气"));
        assert!(text.contains("墨迹天气"));
        assert!(text.contains("tianqi.moji.com"));
        assert!(text.contains("阴"));
        assert!(search_results_text(&serde_json::json!({ "results": [] })).is_err());
        assert!(search_results_text(&serde_json::json!({})).is_err());

        assert!(uses_tools_search("https://api.deepseek.com/v1"));
        assert!(!uses_tools_search("https://api.openai.com/v1"));
    }

    #[test]
    fn converts_openai_shaped_tool_schema() {
        let tools = to_tools(vec![serde_json::json!({
            "type": "function",
            "function": {
                "name": "get_chat_info",
                "description": "d",
                "parameters": { "type": "object", "properties": { "chat_id": { "type": "number" } }, "required": ["chat_id"] }
            }
        })])
        .unwrap();
        assert!(matches!(&tools[0], Tool::Function(f) if f.name == "get_chat_info"));
        assert!(to_tools(vec![serde_json::json!({ "type": "function" })]).is_err());
    }
}
