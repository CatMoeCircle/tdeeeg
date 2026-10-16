//! AI 对话的一次模型调用（可带工具）。多轮 agent 循环在前端 utils/aiChat.ts，这里只管单次请求。
//!
//! 供应商 / 钥匙串 / 协议选择复用 ai_translate（load_all、saved_api_key、build_language_model），不抄第二份。

use llmsdk::{
    AssistantPart, CallOptions, Content, FileBytes, FileData, FilePart, FunctionTool, LanguageModel,
    Message, ReasoningEffort, TextPart, Tool, ToolCallPart, ToolChoice, ToolMessagePart,
    ToolResultOutput, ToolResultPart, UserPart,
};
use serde::{Deserialize, Serialize};

use crate::ai_translate::{build_language_model, load_all, saved_api_key};

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
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
}

#[derive(Debug, Serialize)]
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
/// ponytail: agent 每一轮都重建 prompt，所以同一张图会被重复读盘 + base64 编码；
/// 真嫌慢就在一次 runAiTurn 里按路径缓存 FilePart（别缓存进 history.json）。
fn image_part(path: &str) -> Option<UserPart> {
    let media_type = image_media_type(path)?;
    let bytes = std::fs::read(path).ok()?;
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
                            provider_executed: None,
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

/// 单次对话的公共准备：找供应商 / 取钥匙串里的 Key / 建模型 / 转工具与 prompt。
/// ai_chat（非流式）与 ai_chat_stream（流式）共用这一份，别抄第二遍。
fn prepare(
    app: &tauri::AppHandle,
    provider_id: &str,
    model: &str,
    messages: Vec<ChatMessage>,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
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
    let tools = to_tools(tools)?;
    let options = CallOptions {
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
pub async fn ai_chat(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
) -> Result<ChatReply, String> {
    let (lm, options) = prepare(&app, &provider_id, &model, messages, tools, effort, max_output_tokens)?;
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
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
    on_event: tauri::ipc::Channel<llmsdk::StreamPart>,
) -> Result<ChatReply, String> {
    use futures_util::StreamExt;

    let (lm, options) = prepare(&app, &provider_id, &model, messages, tools, effort, max_output_tokens)?;
    let mut result = lm
        .do_stream(options)
        .await
        .map_err(|e| format!("AI 对话失败: {e}"))?;
    let mut acc = StreamAcc::default();
    while let Some(part) = result.stream.next().await {
        let part = part.map_err(|e| format!("AI 对话失败: {e}"))?;
        if let Some(err) = acc.push(part.clone()) {
            return Err(format!("AI 对话失败: {err}"));
        }
        on_event.send(part).map_err(|e| format!("流式推送失败: {e}"))?;
    }
    Ok(acc.into_reply())
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
    #[test]
    fn stream_error_is_reported() {
        let mut acc = StreamAcc::default();
        let err = acc.push(llmsdk::StreamPart::Error { error: serde_json::json!({ "message": "boom" }) });
        assert!(err.is_some_and(|e| e.contains("boom")));
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
