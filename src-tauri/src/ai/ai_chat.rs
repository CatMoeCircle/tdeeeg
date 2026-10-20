//! AI 对话的一次模型调用（可带工具）。多轮 agent 循环在前端 utils/aiChat.ts，这里只管单次请求。
//!
//! 供应商 / 钥匙串 / 协议选择复用 ai_translate（load_all、saved_api_key、build_language_model），不抄第二份。

use llmsdk::{
    AssistantPart, CallOptions, Content, FileBytes, FileData, FilePart, FunctionTool, LanguageModel,
    Message, ProviderTool, ReasoningEffort, TextPart, Tool, ToolCallPart, ToolChoice,
    ToolMessagePart, ToolResultOutput, ToolResultPart, UserPart,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;

use tauri::Manager;

use crate::ai::ai_conversations::load_history;
use crate::ai::ai_translate::{build_language_model, load_all, saved_api_key, saved_search_key};
use crate::tdlib::AppState;

/// 正在跑的流式请求：request_id → 取消信号。前端点「停止」时通过 ai_chat_cancel 触发。
#[derive(Default)]
pub struct AiCancelState(Mutex<HashMap<String, oneshot::Sender<()>>>);

/// 前端发来的瘦身消息（形状见 utils/aiChatHistory.ts 的 ChatWireMessage）。
/// 同时是**落盘历史**的格式（ai_conversation_history / _save_history），所以进出都要能序列化。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChatMessage {
    /// system | user | assistant | tool
    pub role: String,
    /// 正文；tool 消息里即工具结果 JSON
    #[serde(skip_serializing_if = "String::is_empty")]
    pub text: String,
    /// assistant 的思考过程：思考模式下工具调用轮要原样回传
    #[serde(skip_serializing_if = "String::is_empty")]
    pub reasoning: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ChatToolCall>,
    /// tool 消息：对应的调用 id / 工具名
    #[serde(skip_serializing_if = "String::is_empty")]
    pub tool_call_id: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub tool_name: String,
    /// user 消息里带的图片（本机绝对路径，见 utils/aiChat.ts 的 images）。
    /// 历史里只留路径：每次请求现读现转，history.json 不会塞进 base64。
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<String>,
}

/// 工具调用（进出共用）：arguments 为 JSON 对象，与前端 parseToolCall 的 MCP 形状一致。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatToolCall {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub arguments: serde_json::Value,
    /// 供应商侧执行（如 web_search）：结果已在同一次响应里，前端不要再 dispatch，
    /// 也不要写进历史 —— 回传时 Anthropic 要求 server_tool_use 后面紧跟结果，缺了会 400。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_executed: Option<bool>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReply {
    pub text: String,
    pub reasoning: String,
    pub tool_calls: Vec<ChatToolCall>,
    pub usage: ChatUsage,
}

fn text_part(text: String) -> TextPart {
    TextPart { text, provider_options: None }
}

/// 扩展名 → IANA 媒体类型。只认图片：llmsdk 里非 image/* 的 File 段会被供应商忽略（M3）。
fn image_media_type(path: &str) -> Option<&'static str> {
    let ext = std::path::Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "heic" | "heif" => "image/heic",
        _ => return None,
    })
}

/// 本机图片路径 → UserPart::File。
/// 读不到 / 认不出类型就跳过：历史里存的是路径，文件被删或改名不该让整段对话从此报错。
///
/// 图片字节缓存：路径 → (mtime, 字节)。agent 每轮都重建 prompt，同一张图不再每轮重读盘。
/// ponytail: 容量满了整表清空而不是 LRU，单会话附件很少超过几张；真占内存再上 LRU。
static IMAGE_CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, (std::time::SystemTime, Vec<u8>)>>> =
    std::sync::OnceLock::new();
const IMAGE_CACHE_MAX: usize = 8;

fn read_image_cached(path: &str) -> Option<Vec<u8>> {
    let mtime = std::fs::metadata(path).ok()?.modified().ok()?;
    let mut cache = IMAGE_CACHE.get_or_init(Default::default).lock().ok()?;
    if let Some((t, bytes)) = cache.get(path) {
        if *t == mtime {
            return Some(bytes.clone());
        }
    }
    let bytes = std::fs::read(path).ok()?;
    if cache.len() >= IMAGE_CACHE_MAX {
        cache.clear();
    }
    cache.insert(path.to_string(), (mtime, bytes.clone()));
    Some(bytes)
}

fn image_part(path: &str) -> Option<UserPart> {
    let media_type = image_media_type(path)?;
    let bytes = read_image_cached(path)?;
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
    // 关闭档不发思考参数（与 chat 路径的 none 分开：DeepSeek 未必认 effort=none）
    let effort = effort.filter(|e| !e.is_empty() && *e != "none")?;
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

/// 单次对话的公共准备：找供应商 / 取钥匙串里的 Key / 建模型 / 转工具与 prompt。
/// ai_chat（非流式）与 ai_chat_stream（流式）共用这一份，别抄第二遍。
/// `web_search` = 前端是否要挂供应商侧的联网搜索（设置里关掉、或配了独立搜索接口时为 false）。
#[allow(clippy::too_many_arguments, reason = "两个命令共用的一次性装配，拆参数结构反而更难读")]
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
    let provider = load_all(app)
        .providers
        .into_iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| "AI 供应商不存在，请在设置中重新配置".to_string())?;
    let api_key = saved_api_key(app, provider_id).ok_or_else(|| "未保存 API Key".to_string())?;
    let endpoint = provider.endpoint.trim().trim_end_matches('/');
    let model_id = model.trim();
    if endpoint.is_empty() {
        return Err("接口地址为空".to_string());
    }
    if model_id.is_empty() {
        return Err("模型 ID 为空".to_string());
    }

    let lm = build_language_model(endpoint, &provider.format, &api_key, model_id)?;
    let mut tools = to_tools(tools)?;
    // 联网搜索由供应商执行；只对确定支持的供应商挂（见 hosted_web_search_supported）
    if web_search && hosted_web_search_supported(endpoint, &provider.format) {
        if let Some(search) = web_search_tool(&provider.format) {
            tools.push(search);
        }
    }
    let options = CallOptions {
        provider_options: if provider.format == "openai-responses" {
            responses_reasoning(effort.as_deref())
        } else {
            None
        },
        prompt: to_prompt(messages)?,
        tool_choice: (!tools.is_empty()).then_some(ToolChoice::Auto),
        tools: (!tools.is_empty()).then_some(tools),
        reasoning: effort.as_deref().and_then(effort_of),
        max_output_tokens,
        ..Default::default()
    };
    Ok((lm, options))
}

/// 单次对话请求（可带工具），一次性返回。`tools` 是 toolsSchema() 的结果，`effort` 为思考等级键（可空）。
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
    let (lm, options) = prepare(
        &app,
        &provider_id,
        &model,
        messages,
        tools,
        effort,
        max_output_tokens,
        web_search.unwrap_or(true),
    )?;
    let result = lm
        .do_generate(options)
        .await
        .map_err(|e| format!("AI 对话失败: {e}"))?;

    let mut reply = ChatReply {
        text: String::new(),
        reasoning: String::new(),
        tool_calls: Vec::new(),
        usage: ChatUsage::default(),
    };
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
    Ok(reply)
}

/// 流式累积：把 StreamPart 拼回一次完整回复（前端只看增量画界面，业务逻辑用这个结果，
/// 这样不依赖 IPC 消息到达顺序）。
///
/// 工具调用只认 `ToolCall`（`ToolInput*` 是给界面看增量的），文本 / 思考累加增量。
#[derive(Default)]
struct StreamAcc {
    text: String,
    reasoning: String,
    tool_calls: Vec<ChatToolCall>,
    usage: ChatUsage,
}

impl StreamAcc {
    /// 吃一块流；返回 Some(错误) = 这一块是流内错误（调用方直接当本轮失败）。
    fn push(&mut self, part: llmsdk::StreamPart) -> Option<String> {
        use llmsdk::StreamPart as P;
        match part {
            P::TextDelta { delta, .. } => self.text.push_str(&delta),
            P::ReasoningDelta { delta, .. } => self.reasoning.push_str(&delta),
            P::ToolCall(c) => self.tool_calls.push(ChatToolCall {
                id: c.tool_call_id,
                name: c.tool_name,
                arguments: c.input,
                provider_executed: c.provider_executed,
            }),
            P::Finish { usage, .. } => {
                self.usage = ChatUsage {
                    input_tokens: usage.input_tokens.total,
                    output_tokens: usage.output_tokens.total,
                    cached_tokens: usage.input_tokens.cache_read,
                    cache_write_tokens: usage.input_tokens.cache_write,
                };
            }
            P::Error { error } => return Some(error.to_string()),
            _ => {}
        }
        None
    }

    fn into_reply(self) -> ChatReply {
        ChatReply {
            text: self.text,
            reasoning: self.reasoning,
            tool_calls: self.tool_calls,
            usage: self.usage,
        }
    }
}

/// 流式对话：一边把 llmsdk 的 StreamPart 原样推给前端（界面逐字更新），一边在 Rust 侧拼出完整回复返回。
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
    on_event: tauri::ipc::Channel<llmsdk::StreamPart>,
) -> Result<ChatReply, String> {
    use futures_util::StreamExt;

    messages.extend(load_history(&app.state::<AppState>(), &account_id, chat_id, &conversation_id));
    let (lm, options) = prepare(
        &app,
        &provider_id,
        &model,
        messages,
        tools,
        effort,
        max_output_tokens,
        web_search.unwrap_or(true),
    )?;
    // 先登记取消信号再开流：前端一按停止（ai_chat_cancel）这里立刻就能收到
    let (tx, mut rx) = oneshot::channel::<()>();
    state.0.lock().unwrap().insert(request_id.clone(), tx);
    let out = async move {
        let mut result = lm
            .do_stream(options)
            .await
            .map_err(|e| format!("AI 对话失败: {e}"))?;
        let mut acc = StreamAcc::default();
        loop {
            tokio::select! {
                biased;
                // 已停止：丢掉 stream（连接随之断开），返回空回复 —— 前端 signal 已 abort，
                // 这一轮不会被写进历史（见 utils/aiChat.ts runAiTurn）
                _ = &mut rx => return Ok(ChatReply::default()),
                part = result.stream.next() => {
                    let Some(part) = part else { break };
                    let part = part.map_err(|e| format!("AI 对话失败: {e}"))?;
                    if let Some(err) = acc.push(part.clone()) {
                        return Err(format!("AI 对话失败: {err}"));
                    }
                    on_event.send(part).map_err(|e| format!("流式推送失败: {e}"))?;
                }
            }
        }
        Ok(acc.into_reply())
    }
    .await;
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
        assert_eq!(image_media_type("a/b.PNG"), Some("image/png"));
        assert_eq!(image_media_type("a.jpeg"), Some("image/jpeg"));
        assert_eq!(image_media_type("Heic"), None); // 没有扩展名
        assert_eq!(image_media_type("notes.txt"), None);
    }

    /// 流式累积：文本 / 思考增量拼接、工具调用认 ToolCall、usage 取 Finish
    #[test]
    fn stream_accumulates_text_reasoning_tools_and_usage() {
        use llmsdk::{FinishReason, FinishReasonKind, StreamPart, ToolCallPart, Usage};

        let mut acc = StreamAcc::default();
        let parts = vec![
            StreamPart::TextDelta { id: "t".into(), delta: "你".into(), provider_metadata: None },
            StreamPart::ToolInputStart {
                id: "c1".into(),
                tool_name: "get_recent_messages".into(),
                provider_executed: None,
                dynamic: None,
                title: None,
                provider_metadata: None,
            },
            StreamPart::ToolInputDelta { id: "c1".into(), delta: "{\"chat".into(), provider_metadata: None },
            StreamPart::ReasoningDelta { id: "r".into(), delta: "想想".into(), provider_metadata: None },
            StreamPart::TextDelta { id: "t".into(), delta: "好".into(), provider_metadata: None },
            StreamPart::ToolCall(ToolCallPart {
                tool_call_id: "c1".into(),
                tool_name: "get_recent_messages".into(),
                input: serde_json::json!({ "chat_id": 1 }),
                provider_executed: None,
                dynamic: None,
                provider_options: None,
            }),
            StreamPart::Finish {
                usage: Usage {
                    input_tokens: llmsdk::InputTokenUsage {
                        total: Some(100),
                        no_cache: None,
                        cache_read: Some(80),
                        cache_write: None,
                    },
                    output_tokens: llmsdk::OutputTokenUsage { total: Some(9), text: None, reasoning: None },
                    raw: None,
                },
                finish_reason: FinishReason::new(FinishReasonKind::ToolCalls),
                provider_metadata: None,
            },
            // 无关的块（起止标记、元数据等）不该影响结果
            StreamPart::TextEnd { id: "t".into(), provider_metadata: None },
            StreamPart::TextStart { id: "t2".into(), provider_metadata: None },
            StreamPart::ToolInputEnd { id: "c1".into(), provider_metadata: None },
        ];
        for p in parts {
            assert!(acc.push(p).is_none());
        }
        let reply = acc.into_reply();
        assert_eq!(reply.text, "你好");
        assert_eq!(reply.reasoning, "想想");
        assert_eq!(reply.tool_calls.len(), 1);
        assert_eq!(reply.tool_calls[0].id, "c1");
        assert_eq!(reply.tool_calls[0].arguments, serde_json::json!({ "chat_id": 1 }));
        assert_eq!(reply.usage.input_tokens, Some(100));
        assert_eq!(reply.usage.cached_tokens, Some(80));
        assert_eq!(reply.usage.output_tokens, Some(9));
    }

    /// 流内错误要能报出来（前端据此当本轮失败，而不是当成空回复）
    /// 思考只挂在 responses 协议上：llmsdk 的 /responses 适配器只认 provider_options，
    /// 漏了这段推理模型也一条思考都不回（活动条里没有思考条目的根因）。
    #[test]
    fn responses_reasoning_options_request_summary() {
        let po = responses_reasoning(Some("high")).expect("high 要有思考参数");
        let openai = po.get("openai").expect("键名必须是 openai");
        assert_eq!(openai.get("reasoningEffort"), Some(&serde_json::json!("high")));
        assert_eq!(openai.get("reasoningSummary"), Some(&serde_json::json!("auto")));
        assert_eq!(openai.get("forceReasoning"), Some(&serde_json::json!(true)));
        // 关闭 / 空 / 未知都不发：不知道的档位宁可不传，也别让接口 400
        assert!(responses_reasoning(Some("none")).is_none());
        assert!(responses_reasoning(Some("")).is_none());
        assert!(responses_reasoning(None).is_none());
    }

    #[test]
    fn stream_error_is_reported() {
        let mut acc = StreamAcc::default();
        let err = acc.push(llmsdk::StreamPart::Error { error: serde_json::json!({ "message": "boom" }) });
        assert!(err.is_some_and(|e| e.contains("boom")));
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
